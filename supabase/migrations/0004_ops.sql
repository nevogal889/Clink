-- 0004_ops: rate limits and first-party events (ARCHITECTURE.md 4.2, 8.3; PRD.md 6).

create table private.rate_counters (
  user_id       uuid not null,
  bucket        text not null,               -- 'flare', 'snap', 'friend_request', 'contacts', 'report', ...
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Counts one hit in a fixed window and returns true when the call is allowed. A refused hit is not
-- counted, so a client hammering the limit doesn't extend it. Windows are aligned to the epoch
-- (a "day" is a UTC day), which is enough for abuse limits.
create function private.hit_rate_limit(p_user uuid, p_bucket text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now    timestamptz := private.app_now();
  v_secs   double precision := extract(epoch from p_window);
  v_start  timestamptz := to_timestamp(floor(extract(epoch from v_now) / v_secs) * v_secs);
  v_count  int;
begin
  if p_user is null or p_max < 1 or v_secs <= 0 then
    raise exception 'bad_input' using errcode = 'CLBAD';
  end if;
  insert into private.rate_counters as rc (user_id, bucket, window_start, count)
  values (p_user, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set count = rc.count + 1
    where rc.count < p_max
  returning rc.count into v_count;
  return v_count is not null;
end $$;

-- Raises rate_limited with the seconds until the window ends in DETAIL (the API's retryAfter).
create function private.require_rate_limit(p_user uuid, p_bucket text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_secs double precision := extract(epoch from p_window);
  v_now  double precision := extract(epoch from private.app_now());
begin
  if not private.hit_rate_limit(p_user, p_bucket, p_max, p_window) then
    raise exception 'rate_limited' using errcode = 'CLRTL',
      detail = ceil(v_secs - (v_now - floor(v_now / v_secs) * v_secs))::int::text;
  end if;
end $$;

-- events (PRD 6) ------------------------------------------------------------
create table public.app_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  name        text not null check (name ~ '^[a-z_]{3,40}$'),   -- the list is the zod enum in packages/shared/src/events
  props       jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) < 1024),
  created_at  timestamptz not null default now()
);
create index on public.app_events (created_at);

-- Server-written events. Writes nothing when the user turned "Share usage stats" off.
create function private.log_event(p_user uuid, p_name text, p_props jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.app_events (user_id, name, props)
  select p_user, p_name, coalesce(p_props, '{}'::jsonb)
  where exists (select 1 from public.user_settings s where s.user_id = p_user and s.share_usage);
$$;

alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;
grant insert (user_id, name, props) on public.app_events to authenticated;

-- Clients insert their own events, only while share_usage is on. No client reads events.
create policy insert_own on public.app_events for insert to authenticated with check (
  app_events.user_id = (select auth.uid())
  and exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.share_usage)
);

grant execute on function private.hit_rate_limit(uuid, text, int, interval),
                          private.require_rate_limit(uuid, text, int, interval),
                          private.log_event(uuid, text, jsonb) to service_role;
