-- 0009_xp: private XP ledger and the award rules (ARCHITECTURE.md 4.2, 4.5; PRD.md 4).
-- Only private.award_xp() and private.reverse_xp() write xp_events and xp_totals. Clients read
-- their own rows only. Nobody else ever reads XP or a level.

create table public.xp_events (              -- append-only ledger
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('invite_accepted', 'new_friend', 'flare_joined', 'drink_run_done',
                                             'flare_got_joiner', 'daily_log', 'invite_reversed', 'log_reversed')),
  amount       int not null check (amount <> 0),
  ref_id       uuid,                         -- flare id, invitee id, or null for daily_log. No FK, so the ledger outlives flares.
  counterpart  uuid,                         -- the other person, for per-pair caps
  reverses_id  bigint unique references public.xp_events(id) on delete cascade,   -- each entry is reversed at most once
  local_date   date not null,                -- computed by the server from server time and user_settings.timezone
  created_at   timestamptz not null default now(),
  check ((kind in ('invite_reversed', 'log_reversed')) = (reverses_id is not null)),
  check ((kind in ('invite_reversed', 'log_reversed')) = (amount < 0)),
  unique nulls not distinct (user_id, kind, ref_id, counterpart, local_date)
);
create unique index xp_pair_once on public.xp_events (user_id, kind, counterpart)
  where kind in ('invite_accepted', 'new_friend');                 -- once per pair, ever (PRD 4.3 rule 3)
create index on public.xp_events (user_id, local_date);
create index on public.xp_events (counterpart) where counterpart is not null;

create table public.xp_totals (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  total       int not null default 0,
  updated_at  timestamptz not null default now()
);
-- Level is computed in the app from total + thresholds in packages/shared/src/xp.

-- Values and daily caps from PRD.md 4.2. packages/shared/src/xp mirrors them for display.
create table private.xp_rules (
  kind             text primary key,
  amount           int not null check (amount > 0),
  daily_cap        int not null check (daily_cap > 0),
  per_counterpart  boolean not null            -- the same person counts once per day for this kind
);
insert into private.xp_rules (kind, amount, daily_cap, per_counterpart) values
  ('invite_accepted',  50, 10, false),   -- once per pair ever instead (xp_pair_once)
  ('new_friend',       10,  5, false),
  ('flare_joined',     10,  3, true),    -- counterpart = the flare's sender
  ('flare_got_joiner', 15,  2, false),
  ('drink_run_done',   20,  3, true),    -- counterpart = the person who asked for a drink
  ('daily_log',         5,  1, false);

-- Level thresholds (PRD 4.4). Server config, so they can be retuned without an app release.
insert into public.app_config (key, value) values
  ('xp_levels', '[0, 100, 300, 700, 1400, 2500, 4000, 6000]');

create function private.user_local_date(p_user uuid, p_at timestamptz default null)
returns date language sql stable security definer set search_path = '' as $$
  select (coalesce(p_at, private.app_now()) at time zone coalesce(
            (select s.timezone from public.user_settings s where s.user_id = p_user), 'UTC'))::date;
$$;

create function private.xp_level(p_total int)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.app_config c, jsonb_array_elements(c.value) t(threshold)
  where c.key = 'xp_levels' and (t.threshold)::int <= p_total;
$$;

-- Awards XP for an outcome and returns the amount written (0 when capped or already awarded).
-- Idempotent: the ledger's unique key makes a retry a no-op.
create function private.award_xp(p_user uuid, p_kind text, p_ref uuid, p_counterpart uuid,
                                 p_local_date date default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_rule   private.xp_rules;
  v_date   date := coalesce(p_local_date, private.user_local_date(p_user));
  v_total  int;
  v_id     bigint;
begin
  select * into v_rule from private.xp_rules r where r.kind = p_kind;
  if not found then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'unknown xp kind';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return 0;
  end if;

  -- Row lock on the user's total serialises concurrent awards, so caps hold under concurrency.
  insert into public.xp_totals (user_id) values (p_user) on conflict (user_id) do nothing;
  select t.total into v_total from public.xp_totals t where t.user_id = p_user for update;

  -- Daily cap per kind (reversed entries still count, so undo-and-redo earns nothing more).
  if (select count(*) from public.xp_events e
      where e.user_id = p_user and e.kind = p_kind and e.local_date = v_date) >= v_rule.daily_cap then
    return 0;
  end if;
  -- Per-counterpart cap: the same friend once per day per kind.
  if v_rule.per_counterpart and p_counterpart is not null and exists (
      select 1 from public.xp_events e
      where e.user_id = p_user and e.kind = p_kind and e.counterpart = p_counterpart and e.local_date = v_date) then
    return 0;
  end if;
  -- Once per pair, ever, across invite and new-friend XP.
  if p_kind in ('invite_accepted', 'new_friend') and exists (
      select 1 from public.xp_events e
      where e.user_id = p_user and e.kind in ('invite_accepted', 'new_friend') and e.counterpart = p_counterpart) then
    return 0;
  end if;

  insert into public.xp_events (user_id, kind, amount, ref_id, counterpart, local_date)
  values (p_user, p_kind, v_rule.amount, p_ref, p_counterpart, v_date)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;

  update public.xp_totals t set total = t.total + v_rule.amount, updated_at = now() where t.user_id = p_user;
  if private.xp_level(v_total + v_rule.amount) > private.xp_level(v_total) then
    perform private.log_event(p_user, 'level_reached',
                              jsonb_build_object('level', private.xp_level(v_total + v_rule.amount)));
  end if;
  return v_rule.amount;
end $$;

-- Reverses one award (invite_accepted -> invite_reversed, daily_log -> log_reversed) at most once.
-- Returns the (negative) amount written, or 0 when it was already reversed.
create function private.reverse_xp(p_event_id bigint)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_ev    public.xp_events;
  v_kind  text;
  v_id    bigint;
begin
  select * into v_ev from public.xp_events e where e.id = p_event_id;
  if not found then
    return 0;
  end if;
  v_kind := case v_ev.kind when 'invite_accepted' then 'invite_reversed'
                           when 'daily_log' then 'log_reversed' end;
  if v_kind is null then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'kind cannot be reversed';
  end if;
  perform 1 from public.xp_totals t where t.user_id = v_ev.user_id for update;
  insert into public.xp_events (user_id, kind, amount, ref_id, counterpart, reverses_id, local_date)
  values (v_ev.user_id, v_kind, -v_ev.amount, v_ev.ref_id, v_ev.counterpart, v_ev.id, v_ev.local_date)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;
  update public.xp_totals t set total = t.total - v_ev.amount, updated_at = now() where t.user_id = v_ev.user_id;
  return -v_ev.amount;
end $$;

-- Reverses invite XP that p_inviter got for p_invitee when it is under 7 days old (PRD 4.3 rule 2).
create function private.reverse_recent_invite_xp(p_inviter uuid, p_invitee uuid)
returns int language sql security definer set search_path = '' as $$
  select coalesce(sum(private.reverse_xp(e.id)), 0)::int
  from public.xp_events e
  where e.user_id = p_inviter and e.kind = 'invite_accepted' and e.counterpart = p_invitee
    and e.created_at > private.app_now() - interval '7 days'
    and not exists (select 1 from public.xp_events r where r.reverses_id = e.id);
$$;

-- daily_log XP from tracker logs (PRD 4.3 rules 7 and 11) -------------------------
create function private.drink_logs_xp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_now    timestamptz := private.app_now();
  v_day    date;
  v_today  date;
  v_ev     bigint;
begin
  if tg_op = 'INSERT' then
    v_day   := private.user_local_date(new.user_id, new.logged_at);
    v_today := private.user_local_date(new.user_id, v_now);
    if new.logged_at > v_now - interval '36 hours' and v_day between v_today - 1 and v_today then
      perform private.award_xp(new.user_id, 'daily_log', null, null, v_day);
    end if;
    return null;
  end if;

  -- DELETE: when the day's last remaining log goes, its daily_log award is reversed.
  -- Not for account deletion (the ledger goes with the profile) or the 90-day retention job.
  if not exists (select 1 from public.profiles p where p.id = old.user_id)
     or current_setting('clink.retention', true) = 'on' then
    return null;
  end if;
  v_day := private.user_local_date(old.user_id, old.logged_at);
  select e.id into v_ev from public.xp_events e
  where e.user_id = old.user_id and e.kind = 'daily_log' and e.local_date = v_day
    and not exists (select 1 from public.xp_events r where r.reverses_id = e.id);
  if v_ev is not null and not exists (
      select 1 from public.drink_logs l
      where l.user_id = old.user_id and private.user_local_date(old.user_id, l.logged_at) = v_day) then
    perform private.reverse_xp(v_ev);
  end if;
  return null;
end $$;
create trigger drink_logs_xp after insert or delete on public.drink_logs
  for each row execute function private.drink_logs_xp();

alter table public.xp_events enable row level security;
alter table public.xp_totals enable row level security;
revoke all on public.xp_events, public.xp_totals from anon, authenticated;
grant select on public.xp_events, public.xp_totals to authenticated;
create policy own_read on public.xp_events for select to authenticated using (xp_events.user_id = (select auth.uid()));
create policy own_read on public.xp_totals for select to authenticated using (xp_totals.user_id = (select auth.uid()));

grant execute on function private.user_local_date(uuid, timestamptz), private.xp_level(int),
                          private.award_xp(uuid, text, uuid, uuid, date), private.reverse_xp(bigint),
                          private.reverse_recent_invite_xp(uuid, uuid) to service_role;
