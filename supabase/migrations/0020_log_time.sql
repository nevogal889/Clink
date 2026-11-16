-- 0020: the server owns a log's time (ARCHITECTURE.md 0 principle 8, 3.2 "Log time").
--
-- A well-formed log is never refused because of its logged_at. The device's time is clamped into
-- the tracker window instead:
--   later than private.app_now()           -> app_now()  (a phone clock running fast)
--   earlier than app_now() - 90 days       -> app_now() - 90 days  (the 4.8 drink_logs retention)
--   anything in between                    -> kept as sent (an offline phone replaying its outbox)
-- The device-made id still makes every retry idempotent. The nightly retention job removes a log
-- clamped to the oldest edge like any other 90-day-old log.
--
-- 1. private.log_time(): the rule, in one place.
-- 2. drink_logs_before_insert (0007) clamps instead of refusing, for app and widget writes alike.
--    When it has to move the time, the local date follows the account's saved zone.
-- 3. widget_log_drink takes the device zone instead of a local date and computes the date from the
--    clamped time, so the widget's Today lands on the right day. The 0019 signature (with a date)
--    is dropped; CLOLD (too_old) is no longer raised anywhere. While this migration is applied and
--    widget-api is not yet redeployed, the old function call fails with 500 `internal`, which the
--    widget retries (WIDGET_API_ERRORS), so nothing is lost.

-- 1 -------------------------------------------------------------------------------------------
create function private.log_time(p_at timestamptz)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case
           when p_at is null then null
           else least(greatest(p_at, private.app_now() - interval '90 days'), private.app_now())
         end;
$$;

-- 2 -------------------------------------------------------------------------------------------
create or replace function private.drink_logs_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz := private.log_time(new.logged_at);
begin
  if v_at is distinct from new.logged_at then
    new.logged_at := v_at;
    new.local_date := private.user_local_date(new.user_id, v_at);
  end if;
  return new;
end $$;

-- 3 -------------------------------------------------------------------------------------------
drop function private.widget_log_drink(uuid, uuid, text, text, text, boolean, timestamptz, date);

-- p_time_zone is the zone widget-api picked (device, else saved, else UTC; already checked by the
-- runtime). A zone Postgres doesn't know, or null, falls back to the account's saved zone.
create function private.widget_log_drink(p_user uuid, p_id uuid, p_drink_id text, p_drink_name text,
                                         p_category text, p_caffeinated boolean, p_logged_at timestamptz,
                                         p_time_zone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_at    timestamptz;
  v_date  date;
begin
  if p_user is null or p_id is null or p_logged_at is null then
    raise exception 'bad_input' using errcode = 'CLBAD';
  end if;
  if private.is_suspended(p_user) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  v_at := private.log_time(p_logged_at);
  begin
    v_date := (v_at at time zone p_time_zone)::date;
  exception when invalid_parameter_value then
    v_date := null;
  end;
  if v_date is null then
    v_date := private.user_local_date(p_user, v_at);
  end if;
  insert into public.drink_logs (id, user_id, drink_id, drink_name, category, caffeinated, logged_at,
                                 local_date, source)
  values (p_id, p_user, p_drink_id, p_drink_name, p_category, p_caffeinated, v_at, v_date, 'widget')
  on conflict (id) do nothing;
  if found then
    return 'logged';
  end if;
  select l.user_id into v_owner from public.drink_logs l where l.id = p_id;
  if v_owner = p_user then
    return 'duplicate';
  end if;
  raise exception 'conflict' using errcode = 'CLCON';
end $$;

revoke execute on function
  private.log_time(timestamptz),
  private.widget_log_drink(uuid, uuid, text, text, text, boolean, timestamptz, text)
  from public, anon, authenticated;
grant execute on function
  private.log_time(timestamptz),
  private.widget_log_drink(uuid, uuid, text, text, text, boolean, timestamptz, text)
  to service_role;
