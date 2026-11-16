-- 0012_flares: flares, photos, audience, recipients, responses, Live Activity tokens, and the
-- server rules around them (ARCHITECTURE.md 4.2 to 4.6; PRD.md 3.5, 3.6, 3.10; RISK_REVIEW.md M-02, M-03).
-- Nobody is ever shown as having declined or seen a flare: there are no seen/opened/delivered columns.

create table public.flares (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  category    text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice')),
  drink_id    text check (drink_id ~ '^(coffee|matcha|tea|smoothie_juice)\.[a-z0-9_]{1,30}$'),
  drink_name  text not null check (char_length(drink_name) between 1 and 30),
  place       text check (char_length(place) <= 40),     -- set to null 24 h after the flare ends (4.8)
  meet_at     timestamptz not null,          -- set by the server: created_at + timingMin. Clients never send it.
  expires_at  timestamptz not null,
  status      text not null default 'live' check (status in ('live', 'going', 'expired', 'cancelled', 'replaced')),
  source      text not null check (source in ('app', 'widget')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  settled_at  timestamptz,                   -- XP awarded once, here
  check (drink_id is null or split_part(drink_id, '.', 1) = category),
  check (meet_at between created_at and created_at + interval '60 minutes'),
  check (expires_at = greatest(meet_at, created_at + interval '15 minutes')),
  check ((status = 'live') = (ended_at is null))
);
create unique index flares_one_live_per_sender on public.flares (sender_id) where status = 'live';
create index flares_live_expiry on public.flares (expires_at) where status = 'live';
create index on public.flares (sender_id, created_at desc);
create index on public.flares (ended_at);

create table public.flare_photos (           -- never a snaps row (M-02)
  flare_id    uuid primary key references public.flares(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  image_path  text not null,                 -- {sender_id}/{flare_id}.jpg in bucket flare-photos
  thumb_path  text not null,                 -- {sender_id}/{flare_id}_t.jpg
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (image_path = sender_id::text || '/' || flare_id::text || '.jpg'),
  check (thumb_path = sender_id::text || '/' || flare_id::text || '_t.jpg')
);

create table public.flare_photo_hides (      -- "hide for me" after a report, like snap_hides
  user_id   uuid not null references public.profiles(id) on delete cascade,
  flare_id  uuid not null references public.flare_photos(flare_id) on delete cascade,
  primary key (user_id, flare_id)
);

create table public.flare_audience (         -- sender only. Recipients must never learn the group.
  flare_id  uuid primary key references public.flares(id) on delete cascade,
  audience  text not null check (audience in ('group', 'everyone')),
  requested text not null check (requested in ('auto', 'group', 'everyone')),   -- what the composer said
  group_id  uuid references public.groups(id) on delete set null
);

create table public.flare_recipients (       -- snapshot of who got it at send time
  flare_id      uuid not null references public.flares(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (flare_id, recipient_id)
);
create index on public.flare_recipients (recipient_id);

create table public.flare_responses (
  flare_id       uuid not null references public.flares(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('in', 'bring')),
  drink          jsonb check (drink is null or (jsonb_typeof(drink) = 'object' and pg_column_size(drink) < 2560)),
  one_time_note  text check (char_length(one_time_note) <= 80),   -- app only ("iced today")
  source         text not null check (source in ('app', 'widget', 'notification')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,                -- "Can't make it anymore"; sender just sees one fewer
  primary key (flare_id, user_id),
  check (kind <> 'in' or (drink is null and one_time_note is null))
);
create index on public.flare_responses (user_id);

create table private.live_activity_tokens (  -- iOS, per flare per device
  flare_id   uuid not null references public.flares(id) on delete cascade,
  device_id  uuid not null references public.push_devices(id) on delete cascade,
  token      text not null check (char_length(token) <= 4096),
  primary key (flare_id, device_id)
);

-- RLS ---------------------------------------------------------------------
alter table public.flares            enable row level security;
alter table public.flare_photos      enable row level security;
alter table public.flare_photo_hides enable row level security;
alter table public.flare_audience    enable row level security;
alter table public.flare_recipients  enable row level security;
alter table public.flare_responses   enable row level security;

revoke all on public.flares, public.flare_photos, public.flare_photo_hides, public.flare_audience,
              public.flare_recipients, public.flare_responses from anon, authenticated;
grant select on public.flares, public.flare_photos, public.flare_audience, public.flare_recipients,
                public.flare_responses to authenticated;
grant select, insert, delete on public.flare_photo_hides to authenticated;

-- The recipient rule (M-03): a recipient who is still a friend, sender not suspended, until 2 h after close.
create function private.can_see_flare(p_flare uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.flares f
    join public.flare_recipients r on r.flare_id = f.id and r.recipient_id = p_user
    where f.id = p_flare
      and private.are_friends(f.sender_id, p_user)
      and not private.is_suspended(f.sender_id)
      and coalesce(f.ended_at, f.expires_at) > private.app_now() - interval '2 hours');
$$;

-- flares: the sender, or a recipient who is still a friend, until 2 h after close (M-03)
create policy visible on public.flares for select to authenticated using (
  flares.sender_id = (select auth.uid())
  or (exists (select 1 from public.flare_recipients r
              where r.flare_id = flares.id and r.recipient_id = (select auth.uid()))
      and private.are_friends(flares.sender_id, (select auth.uid()))
      and not private.is_suspended(flares.sender_id)
      and coalesce(flares.ended_at, flares.expires_at) > private.app_now() - interval '2 hours')
);
-- flare photos: same rule, through the parent flare (M-02)
create policy visible on public.flare_photos for select to authenticated using (
  flare_photos.sender_id = (select auth.uid())
  or (flare_photos.hidden_at is null
      and exists (select 1 from public.flares f
                  join public.flare_recipients r on r.flare_id = f.id and r.recipient_id = (select auth.uid())
                  where f.id = flare_photos.flare_id
                    and private.are_friends(f.sender_id, (select auth.uid()))
                    and not private.is_suspended(f.sender_id)
                    and coalesce(f.ended_at, f.expires_at) > private.app_now() - interval '2 hours')
      and not exists (select 1 from public.flare_photo_hides h
                      where h.flare_id = flare_photos.flare_id and h.user_id = (select auth.uid())))
);
create policy own on public.flare_photo_hides for all to authenticated
  using (flare_photo_hides.user_id = (select auth.uid()))
  with check (flare_photo_hides.user_id = (select auth.uid()));
create policy sender_only on public.flare_audience for select to authenticated using (
  exists (select 1 from public.flares f where f.id = flare_audience.flare_id and f.sender_id = (select auth.uid()))
);
create policy own on public.flare_recipients for select to authenticated
  using (flare_recipients.recipient_id = (select auth.uid()));
-- Responses: the sender sees all; a responder sees only their own row. Co-responders get names
-- only for their own friends, through public.flare_view().
create policy visible on public.flare_responses for select to authenticated using (
  flare_responses.user_id = (select auth.uid())
  or exists (select 1 from public.flares f where f.id = flare_responses.flare_id and f.sender_id = (select auth.uid()))
);

-- The Automatic audience (4.6) ------------------------------------------------
-- Eligible recipients: current friends of the sender, minus blocks either way, minus suspended users.
create function private.eligible_friends(p_sender uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select x.friend_id from (
    select case when f.user_a = p_sender then f.user_b else f.user_a end as friend_id
    from public.friendships f where f.user_a = p_sender or f.user_b = p_sender
  ) x
  where not private.is_suspended(x.friend_id)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = p_sender and b.blocked_id = x.friend_id)
                       or (b.blocker_id = x.friend_id and b.blocked_id = p_sender));
$$;

-- Resolves "To:" to real recipients. p_audience: auto, group or everyone. p_tz is the sender's zone
-- and p_at the tap instant (already clamped by the caller). Returns the group used (null = Everyone).
create function private.resolve_audience(p_sender uuid, p_audience text, p_group uuid, p_tz text, p_at timestamptz,
                                         out group_id uuid, out recipients uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare
  v_local  timestamp;
  v_role   text;
begin
  if p_audience = 'everyone' then
    group_id := null;
  elsif p_audience = 'group' then
    select g.id into group_id from public.groups g where g.id = p_group and g.owner_id = p_sender;
    if group_id is null then
      raise exception 'bad_input' using errcode = 'CLBAD', detail = 'unknown group';
    end if;
  elsif p_audience = 'auto' then
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
      raise exception 'bad_input' using errcode = 'CLBAD', detail = 'unknown time zone';
    end if;
    v_local := p_at at time zone p_tz;
    -- isodow 1..5 = Monday to Friday; 08:00 to 17:59 local
    if extract(isodow from v_local) between 1 and 5 and extract(hour from v_local) between 8 and 17 then
      v_role := 'work';
    else
      v_role := 'home';
    end if;
    select g.id into group_id from public.groups g
    where g.owner_id = p_sender and g.auto_role = v_role
      and exists (select 1 from public.group_members m
                  where m.group_id = g.id and m.member_id in (select private.eligible_friends(p_sender)));
  else
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'unknown audience';
  end if;

  if group_id is null then
    recipients := array(select private.eligible_friends(p_sender));
  else
    recipients := array(select m.member_id from public.group_members m
                        where m.group_id = resolve_audience.group_id
                          and m.member_id in (select private.eligible_friends(p_sender)));
  end if;
end $$;

-- XP settlement (4.5) ----------------------------------------------------------
create function private.settle_flare(p_flare uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_f       public.flares;
  v_r       record;
  v_date    date;
  v_replies int := 0;
  v_orders  int := 0;
begin
  select * into v_f from public.flares f where f.id = p_flare for update;
  if not found or v_f.status = 'live' or v_f.settled_at is not null then
    return;
  end if;
  update public.flares f set settled_at = now() where f.id = p_flare;

  if v_f.status in ('going', 'expired') then
    for v_r in
      select r.user_id, r.kind from public.flare_responses r
      where r.flare_id = p_flare and r.withdrawn_at is null
        and private.are_friends(v_f.sender_id, r.user_id)
    loop
      v_replies := v_replies + 1;
      perform private.award_xp(v_r.user_id, 'flare_joined', p_flare, v_f.sender_id);
      if v_r.kind = 'bring' then
        v_orders := v_orders + 1;
        perform private.award_xp(v_f.sender_id, 'drink_run_done', p_flare, v_r.user_id);
      end if;
    end loop;
    if v_replies > 0 then
      perform private.award_xp(v_f.sender_id, 'flare_got_joiner', p_flare, null);
    end if;
  else
    select count(*) filter (where true), count(*) filter (where r.kind = 'bring')
      into v_replies, v_orders
    from public.flare_responses r where r.flare_id = p_flare and r.withdrawn_at is null;
  end if;

  perform private.log_event(v_f.sender_id, 'flare_closed', jsonb_build_object(
    'outcome', case v_f.status when 'going' then 'done' else v_f.status end,
    'replies', v_replies, 'orders', v_orders));
  if v_f.status in ('going', 'expired') and v_orders > 0 then
    perform private.log_event(v_f.sender_id, 'drink_run_completed', jsonb_build_object('orders', v_orders));
  end if;
end $$;

-- send-flare -------------------------------------------------------------------
-- One transaction: refuse or replace a live flare, set meet_at from server time, resolve the
-- audience, insert the flare, its audience and its recipients. Returns what the fan-out needs.
create function private.create_flare(
  p_sender uuid, p_category text, p_drink_id text, p_drink_name text, p_place text,
  p_timing_min int, p_tapped_at timestamptz, p_audience text, p_group uuid, p_tz text,
  p_source text, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now     timestamptz := private.app_now();
  v_at      timestamptz;
  v_live    public.flares;
  v_aud     record;
  v_id      uuid := gen_random_uuid();
  v_meet    timestamptz;
  v_recent  int;
begin
  if private.is_suspended(p_sender) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  if p_timing_min is null or p_timing_min not between 0 and 60 or p_timing_min % 5 <> 0 then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'timingMin';
  end if;
  perform private.assert_text(p_place);
  perform private.assert_text(p_drink_name);

  -- One live flare per sender. The row lock plus the partial unique index make this race-free.
  perform pg_advisory_xact_lock(hashtextextended('flare:' || p_sender::text, 0));
  select * into v_live from public.flares f where f.sender_id = p_sender and f.status = 'live' for update;
  if found then
    if v_live.expires_at <= v_now then
      update public.flares f set status = 'expired', ended_at = f.expires_at where f.id = v_live.id;
      perform private.settle_flare(v_live.id);
    elsif coalesce(p_replace, false) and p_source = 'app' then
      update public.flares f set status = 'replaced', ended_at = v_now where f.id = v_live.id;
      perform private.settle_flare(v_live.id);
    else
      raise exception 'live_flare_exists' using errcode = 'CLLIV', detail = v_live.id::text;
    end if;
  end if;

  perform private.require_rate_limit(p_sender, 'flare', 12, interval '1 day');

  -- Which instant decides Automatic: the tap, when it is within 2 minutes of server time.
  v_at := case when p_tapped_at between v_now - interval '2 minutes' and v_now + interval '2 minutes'
               then p_tapped_at else v_now end;
  select * into v_aud from private.resolve_audience(p_sender, p_audience, p_group, p_tz, v_at);

  v_meet := v_now + make_interval(mins => p_timing_min);
  insert into public.flares (id, sender_id, category, drink_id, drink_name, place, meet_at, expires_at,
                             source, created_at)
  values (v_id, p_sender, p_category, p_drink_id, p_drink_name, nullif(btrim(p_place), ''), v_meet,
          greatest(v_meet, v_now + interval '15 minutes'), p_source, v_now);
  insert into public.flare_audience (flare_id, audience, requested, group_id)
  values (v_id, case when v_aud.group_id is null then 'everyone' else 'group' end, p_audience, v_aud.group_id);
  insert into public.flare_recipients (flare_id, recipient_id)
  select v_id, x from unnest(v_aud.recipients) x;

  -- PRD 3.5 rule 15: the 4th and later flares in 60 minutes go out silent.
  select count(*) into v_recent from public.flares f
  where f.sender_id = p_sender and f.created_at > v_now - interval '60 minutes';

  perform private.log_event(p_sender, 'flare_sent', jsonb_build_object(
    'source', p_source, 'category', p_category, 'timing_min', p_timing_min,
    'audience_type', p_audience, 'has_photo', false));

  return jsonb_build_object('flare_id', v_id, 'recipients', to_jsonb(v_aud.recipients),
                            'silent', v_recent >= 4,
                            'meet_at', v_meet, 'expires_at', greatest(v_meet, v_now + interval '15 minutes'),
                            'replaced_id', case when v_live.status is not null and v_live.expires_at > v_now
                                                then v_live.id end);
end $$;

-- Attaches the photo the sender uploaded to their own folder (send-flare with a photo).
create function private.attach_flare_photo(p_sender uuid, p_flare uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_image text := p_sender::text || '/' || p_flare::text || '.jpg';
  v_thumb text := p_sender::text || '/' || p_flare::text || '_t.jpg';
begin
  if not exists (select 1 from public.flares f where f.id = p_flare and f.sender_id = p_sender and f.status = 'live') then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  if (select count(*) from storage.objects o
      where o.bucket_id = 'flare-photos' and o.name in (v_image, v_thumb)) <> 2 then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'photo files missing';
  end if;
  insert into public.flare_photos (flare_id, sender_id, image_path, thumb_path)
  values (p_flare, p_sender, v_image, v_thumb);
end $$;

-- respond-flare ----------------------------------------------------------------
-- p_kind: in, bring or withdraw. For bring, the order is copied from the usual-3 slot (default #1).
create function private.respond_flare(p_user uuid, p_flare uuid, p_kind text, p_slot smallint,
                                      p_note text, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f      public.flares;
  v_u      public.usual_drinks;
  v_drink  jsonb;
  v_note   text := nullif(btrim(p_note), '');
begin
  if private.is_suspended(p_user) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  select * into v_f from public.flares f where f.id = p_flare;
  if not found or v_f.status <> 'live' or v_f.expires_at <= private.app_now()
     or not exists (select 1 from public.flare_recipients r where r.flare_id = p_flare and r.recipient_id = p_user)
     or not private.are_friends(v_f.sender_id, p_user)
     or private.is_blocked(v_f.sender_id, p_user)
     or private.is_suspended(v_f.sender_id) then
    raise exception 'flare_ended' using errcode = 'CLEND';
  end if;

  if p_kind = 'withdraw' then
    update public.flare_responses r set withdrawn_at = now(), updated_at = now()
    where r.flare_id = p_flare and r.user_id = p_user and r.withdrawn_at is null;
    if found then
      perform private.log_event(p_user, 'flare_reply_cancelled', jsonb_build_object('source', p_source));
    end if;
    return jsonb_build_object('sender_id', v_f.sender_id, 'kind', 'withdraw', 'withdrew', found);
  elsif p_kind not in ('in', 'bring') then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'kind';
  end if;

  if p_kind = 'bring' then
    select * into v_u from public.usual_drinks u where u.user_id = p_user and u.slot = coalesce(p_slot, 1);
    if not found then
      raise exception 'bad_input' using errcode = 'CLBAD', detail = 'no usual drink in that slot';
    end if;
    if v_note is not null and p_source <> 'app' then
      v_note := null;                        -- one-time notes come from the app only
    end if;
    perform private.assert_text(v_note);
    v_drink := jsonb_build_object('drinkId', v_u.drink_id, 'name', v_u.custom_name,
                                  'category', v_u.category, 'details', v_u.details);
  else
    v_note := null;
  end if;

  insert into public.flare_responses (flare_id, user_id, kind, drink, one_time_note, source)
  values (p_flare, p_user, p_kind, v_drink, v_note, p_source)
  on conflict (flare_id, user_id) do update
    set kind = excluded.kind, drink = excluded.drink, one_time_note = excluded.one_time_note,
        source = excluded.source, withdrawn_at = null, updated_at = now();
  perform private.log_event(p_user, 'flare_reply', jsonb_build_object(
    'type', p_kind, 'source', p_source, 'has_oneoff_note', v_note is not null));
  return jsonb_build_object('sender_id', v_f.sender_id, 'kind', p_kind);
end $$;

-- close-flare: the sender taps "We're going" (going) or cancels (cancelled). Returns standing repliers.
create function private.close_flare(p_sender uuid, p_flare uuid, p_outcome text)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_repliers uuid[];
begin
  if p_outcome not in ('going', 'cancelled') then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'outcome';
  end if;
  update public.flares f set status = p_outcome, ended_at = private.app_now()
  where f.id = p_flare and f.sender_id = p_sender and f.status = 'live';
  if not found then
    raise exception 'flare_ended' using errcode = 'CLEND';
  end if;
  v_repliers := array(select r.user_id from public.flare_responses r
                      where r.flare_id = p_flare and r.withdrawn_at is null);
  perform private.settle_flare(p_flare);
  return v_repliers;
end $$;

-- flare-tick: expires due flares and settles them. Returns the flares it ended.
create function private.expire_due_flares()
returns setof uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in
    update public.flares f set status = 'expired', ended_at = f.expires_at
    where f.status = 'live' and f.expires_at <= private.app_now()
    returning f.id
  loop
    perform private.settle_flare(v_id);
    return next v_id;
  end loop;
end $$;

-- Exposed to clients ------------------------------------------------------------
-- Both take the caller from auth.uid() and apply the recipient rule. Neither returns group fields.

-- incoming_flares(): live flares sent to me by friends.
create function public.incoming_flares()
returns table (id uuid, sender_id uuid, category text, drink_id text, drink_name text, place text,
               meet_at timestamptz, expires_at timestamptz, created_at timestamptz, has_photo boolean,
               my_response text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.sender_id, f.category, f.drink_id, f.drink_name, f.place, f.meet_at, f.expires_at,
         f.created_at,
         exists (select 1 from public.flare_photos p
                 where p.flare_id = f.id and p.hidden_at is null
                   and not exists (select 1 from public.flare_photo_hides h
                                   where h.flare_id = f.id and h.user_id = (select auth.uid()))),
         (select r.kind from public.flare_responses r
          where r.flare_id = f.id and r.user_id = (select auth.uid()) and r.withdrawn_at is null)
  from public.flares f
  join public.flare_recipients rc on rc.flare_id = f.id and rc.recipient_id = (select auth.uid())
  where (select auth.uid()) is not null
    and f.status = 'live' and f.expires_at > private.app_now()
    and private.are_friends(f.sender_id, (select auth.uid()))
    and not private.is_suspended(f.sender_id)
  order by f.created_at desc;
$$;

-- flare_view(id): one flare for its sender or a recipient. Names only for the caller's own friends;
-- everyone else is a count ("2 others are in"). Null when the caller may not see it.
create function public.flare_view(p_flare uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  f as (
    select fl.* from public.flares fl, me
    where fl.id = p_flare and me.uid is not null
      and (fl.sender_id = me.uid or private.can_see_flare(fl.id, me.uid))
  ),
  resp as (
    select r.user_id, r.kind, p.display_name, p.avatar_path,
           (r.user_id = f.sender_id) as is_sender,
           (r.user_id = me.uid) as is_me,
           (f.sender_id = me.uid or private.are_friends(r.user_id, me.uid)) as named
    from public.flare_responses r
    join f on f.id = r.flare_id
    cross join me
    join public.profiles p on p.id = r.user_id
    where r.withdrawn_at is null and not private.is_suspended(r.user_id)
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = me.uid and b.blocked_id = r.user_id)
                         or (b.blocker_id = r.user_id and b.blocked_id = me.uid))
  )
  select jsonb_build_object(
    'id', f.id, 'sender_id', f.sender_id, 'category', f.category, 'drink_id', f.drink_id,
    'drink_name', f.drink_name, 'place', f.place, 'meet_at', f.meet_at, 'expires_at', f.expires_at,
    'status', f.status, 'created_at', f.created_at, 'ended_at', f.ended_at,
    'is_sender', f.sender_id = (select uid from me),
    'my_response', (select resp.kind from resp where resp.is_me),
    'in', coalesce((select jsonb_agg(jsonb_build_object('user_id', resp.user_id, 'display_name', resp.display_name,
                                                        'avatar_path', resp.avatar_path, 'kind', resp.kind)
                                     order by resp.display_name)
                    from resp where resp.named and not resp.is_me), '[]'::jsonb),
    'others_in', (select count(*) from resp where not resp.named and not resp.is_me))
  from f;
$$;

revoke execute on function public.incoming_flares(), public.flare_view(uuid) from public, anon;
grant execute on function public.incoming_flares(), public.flare_view(uuid) to authenticated;

grant execute on function private.can_see_flare(uuid, uuid), private.eligible_friends(uuid),
  private.resolve_audience(uuid, text, uuid, text, timestamptz), private.settle_flare(uuid),
  private.create_flare(uuid, text, text, text, text, int, timestamptz, text, uuid, text, text, boolean),
  private.attach_flare_photo(uuid, uuid), private.respond_flare(uuid, uuid, text, smallint, text, text),
  private.close_flare(uuid, uuid, text), private.expire_due_flares() to service_role;
