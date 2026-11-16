-- 0007_drinks: usual 3, tracker logs, last-drink sharing (ARCHITECTURE.md 4.2, 4.3; PRD.md 3.7, 3.11;
-- RISK_REVIEW.md S-07, S-08).

create table public.usual_drinks (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  slot         smallint not null check (slot between 1 and 3),
  drink_id     text check (drink_id ~ '^(coffee|matcha|tea|smoothie_juice)\.[a-z0-9_]{1,30}$'),
  custom_name  text check (char_length(custom_name) between 1 and 30 and btrim(custom_name) <> ''),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice')),
  details      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),
  check ((drink_id is null) <> (custom_name is null)),
  check (drink_id is null or split_part(drink_id, '.', 1) = category),   -- water never takes a slot
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 2048),
  check ((details - array['size', 'temp', 'ice', 'shots', 'caf', 'milk', 'sweet', 'strength', 'grade',
                          'base', 'extras', 'note', 'planB']) = '{}'::jsonb),
  check (not details ? 'extras' or jsonb_typeof(details->'extras') = 'array'),
  check (char_length(coalesce(details->>'note', '')) <= 120),
  check (char_length(coalesce(details->>'planB', '')) <= 80)
);
-- details keys (COPY.md 2.7). Values are validated by zod against packages/shared/src/catalog.

create function private.usual_drinks_check_text()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_text(new.custom_name);
  perform private.assert_text(new.details->>'note');
  perform private.assert_text(new.details->>'planB');
  new.updated_at := now();
  return new;
end $$;
create trigger usual_drinks_check_text before insert or update on public.usual_drinks
  for each row execute function private.usual_drinks_check_text();

create table public.drink_logs (
  id           uuid primary key,              -- generated on device, makes offline retries idempotent
  user_id      uuid not null references public.profiles(id) on delete cascade,
  drink_id     text check (drink_id ~ '^(coffee|matcha|tea|smoothie_juice|water)\.[a-z0-9_]{1,30}$'),
  drink_name   text not null check (char_length(drink_name) between 1 and 30),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  caffeinated  boolean not null,             -- computed on the device: catalog flag AND details.caf <> 'Decaf'
  logged_at    timestamptz not null,
  local_date   date not null,                -- device-local date, for the Today view only. XP never trusts it (4.5).
  source       text not null check (source in ('app', 'widget')),
  created_at   timestamptz not null default now(),
  check (drink_id is null or split_part(drink_id, '.', 1) = category),
  check (category <> 'water' or not caffeinated),
  check (local_date between (logged_at at time zone 'UTC')::date - 1 and (logged_at at time zone 'UTC')::date + 1)
);
create index on public.drink_logs (user_id, local_date);
create index on public.drink_logs (user_id, logged_at desc);
create index on public.drink_logs (created_at);

-- A log can't claim a time in the future (5 minutes of clock skew allowed). Offline logs from the
-- past are fine; the XP rule in 0009 ignores old ones.
create function private.drink_logs_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.logged_at > private.app_now() + interval '5 minutes' then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'logged_at is in the future';
  end if;
  return new;
end $$;
create trigger drink_logs_before_insert before insert on public.drink_logs
  for each row execute function private.drink_logs_before_insert();

-- last drink (F26) -----------------------------------------------------------
create table public.last_drink_shares (      -- row exists only while sharing is on
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_drink_at  timestamptz not null
);

-- Upserts the latest non-water logged_at while sharing is on; deletes the row otherwise.
create function private.recompute_last_drink(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_on    boolean;
  v_last  timestamptz;
begin
  select s.share_last_drink into v_on from public.user_settings s where s.user_id = p_user;
  if coalesce(v_on, false) then
    select max(l.logged_at) into v_last
    from public.drink_logs l where l.user_id = p_user and l.category <> 'water';
  end if;
  if v_last is null then
    delete from public.last_drink_shares d where d.user_id = p_user;
  else
    insert into public.last_drink_shares (user_id, last_drink_at) values (p_user, v_last)
    on conflict (user_id) do update set last_drink_at = excluded.last_drink_at;
  end if;
end $$;

create function private.drink_logs_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  -- During account deletion the profile is already going; nothing to recompute or record.
  -- The retention job (0017) removes 90-day-old logs silently.
  if not exists (select 1 from public.profiles p where p.id = r.user_id)
     or current_setting('clink.retention', true) = 'on' then
    return null;
  end if;
  if r.category <> 'water' then
    perform private.recompute_last_drink(r.user_id);
  end if;
  perform private.log_event(r.user_id,
    case when tg_op = 'INSERT' then 'drink_logged' else 'drink_log_removed' end,
    jsonb_build_object('kind', case when r.category = 'water' then 'water' else 'drink' end,
                       'category', r.category, 'source', r.source));
  return null;
end $$;
create trigger drink_logs_after_change after insert or delete on public.drink_logs
  for each row execute function private.drink_logs_after_change();

create function private.user_settings_share_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.share_last_drink is distinct from old.share_last_drink then
    perform private.recompute_last_drink(new.user_id);
  end if;
  return null;
end $$;
create trigger user_settings_share_changed after update of share_last_drink on public.user_settings
  for each row execute function private.user_settings_share_changed();

-- RLS ---------------------------------------------------------------------
alter table public.usual_drinks      enable row level security;
alter table public.drink_logs        enable row level security;
alter table public.last_drink_shares enable row level security;

revoke all on public.usual_drinks, public.drink_logs, public.last_drink_shares from anon, authenticated;
grant select, delete on public.usual_drinks to authenticated;
grant insert (user_id, slot, drink_id, custom_name, category, details) on public.usual_drinks to authenticated;
grant update (slot, drink_id, custom_name, category, details) on public.usual_drinks to authenticated;
grant select, delete on public.drink_logs to authenticated;
grant insert (id, user_id, drink_id, drink_name, category, caffeinated, logged_at, local_date, source)
  on public.drink_logs to authenticated;
grant select on public.last_drink_shares to authenticated;

-- usual drinks: owner writes, friends read (surprise drinks, F27)
create policy own on public.usual_drinks for all to authenticated
  using (usual_drinks.user_id = (select auth.uid()))
  with check (usual_drinks.user_id = (select auth.uid()));
create policy friends_read on public.usual_drinks for select to authenticated
  using (private.are_friends(usual_drinks.user_id, (select auth.uid()))
         and not private.is_suspended(usual_drinks.user_id));

-- tracker: owner only, always (counts and water are never shared)
create policy own on public.drink_logs for all to authenticated
  using (drink_logs.user_id = (select auth.uid()))
  with check (drink_logs.user_id = (select auth.uid()));

-- last drink: friends read, only while sharing is on (row exists) and only for 24 h
create policy friends_read on public.last_drink_shares for select to authenticated using (
  last_drink_shares.user_id = (select auth.uid())
  or (private.are_friends(last_drink_shares.user_id, (select auth.uid()))
      and last_drink_shares.last_drink_at > private.app_now() - interval '24 hours'
      and not private.is_suspended(last_drink_shares.user_id))
);

grant execute on function private.recompute_last_drink(uuid) to service_role;
