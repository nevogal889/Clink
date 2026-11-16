-- 0019_widget_api: what widget-api needs on top of 0008 and 0016 (ARCHITECTURE.md 3.1, 3.5, 3.6,
-- 4.4, 8.3; RISK_REVIEW.md M-16, S-01). Called by the widget-api edge function as service_role.
--
-- Already in place before this file: the token hash table and one active credential per device
-- (0008), rotation on every register-device call, revocation on a push-token move, sign-out and
-- account deletion (0016), and the 30-day purge of revoked rows (0017). Added here:
--   1. another account registering the same install revokes the previous account's device;
--   2. a suspension revokes every widget token of the account;
--   3. widget_begin: token hash to user, suspension check and the 120-per-hour device limit;
--   4. widget_record_instance: widget_added once per widget instance (3.5);
--   5. widget_log_drink: the idempotent tracker write for POST log.
--
-- New error codes (the 0003 convention): CLCON conflict (409), CLOLD too_old (422).

-- 1. Same install, another account (3.1 "when another account registers the same device") --------
-- register_device (0016) moves a push token between accounts, but an install without a push token
-- (notifications denied) kept the previous account's device row and its live widget token. The
-- install id is per app install, so a second account on it means the phone changed hands. Deleting
-- the old row cascades to its widget credentials, widget instances and Live Activity tokens.
-- BEFORE INSERT also fires for register_device's insert ... on conflict do update.
create function private.push_devices_claim_install()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_devices d
  where d.install_id = new.install_id and d.user_id <> new.user_id;
  return new;
end $$;
create trigger push_devices_claim_install before insert on public.push_devices
  for each row execute function private.push_devices_claim_install();

-- 2. Suspension revokes widget tokens (3.1, 8.4). Lifting does not restore them: the app gets a new
-- token from register-device on its next launch.
create function private.suspensions_revoke_widgets()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lifted_at is null then
    update private.widget_credentials c set revoked_at = now()
    where c.user_id = new.user_id and c.revoked_at is null;
  end if;
  return null;
end $$;
create trigger suspensions_revoke_widgets after insert or update of lifted_at, created_at on private.suspensions
  for each row execute function private.suspensions_revoke_widgets();

-- 3. Widget token check. p_token_hash is sha256 of the raw 256-bit token; the raw token is never
-- stored or sent here. Unknown, revoked or malformed: no row (the function answers 401 the same way
-- for each, so a caller can't tell them apart). Suspended: CLSUS. Over 120 calls in the current hour
-- for this device: CLRTL with the seconds left. The hash comes back so the edge function can
-- compare it in constant time as a second check. last_used_at is written at most once a minute.
create function private.widget_begin(p_token_hash bytea)
returns table (user_id uuid, device_id uuid, platform text, token_hash bytea)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cred private.widget_credentials;
  v_platform text;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return;
  end if;
  select c.* into v_cred from private.widget_credentials c
  where c.token_hash = p_token_hash and c.revoked_at is null;
  if not found then
    return;
  end if;
  select d.platform into v_platform from public.push_devices d where d.id = v_cred.device_id;
  if private.is_suspended(v_cred.user_id) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  perform private.require_rate_limit(v_cred.user_id, 'widget_api:' || v_cred.device_id::text, 120, interval '1 hour');
  if v_cred.last_used_at is null or v_cred.last_used_at < now() - interval '1 minute' then
    update private.widget_credentials c set last_used_at = now() where c.id = v_cred.id;
  end if;
  return query select v_cred.user_id, v_cred.device_id, v_platform, v_cred.token_hash;
end $$;

-- 4. widget_added, once per widget instance (3.5). Instance key: Android appWidgetId, iOS kind plus
-- family plus configuration hash. At most 20 instances per device are recorded, so a token holder
-- can't grow the table without bound; later ones are simply not counted. Returns true when this
-- call recorded the instance.
create function private.widget_record_instance(p_user uuid, p_device uuid, p_instance_key text,
                                               p_size text, p_audience_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.push_devices d where d.id = p_device and d.user_id = p_user) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  if p_size not in ('small', 'medium')
     or (p_audience_type is not null and p_audience_type not in ('auto', 'group', 'everyone')) then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'size or audience';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('widget_instances:' || p_device::text, 0));
  if (select count(*) from private.widget_instances w where w.device_id = p_device) >= 20 then
    return false;
  end if;
  insert into private.widget_instances (device_id, instance_key, size)
  values (p_device, p_instance_key, p_size)
  on conflict (device_id, instance_key) do nothing;
  if not found then
    return false;
  end if;
  perform private.log_event(p_user, 'widget_added', jsonb_build_object(
    'size', p_size,
    'audience_type', case when p_size = 'small' then null else coalesce(p_audience_type, 'auto') end));
  return true;
end $$;

-- 5. POST log. The id is made on the device, so a retried log is a no-op: 'logged' the first
-- time, 'duplicate' after. An id that belongs to another account is CLCON and reveals nothing else.
-- Name, category, caffeine flag and local date come from the edge function, which takes them from
-- the catalog and the caller's own usual 3 (the same fields the app writes through RLS). The
-- drink_logs triggers add the future-time check, last-drink sharing, the event and daily_log XP.
-- Logs older than the 90-day tracker history (4.8) would be purged at once, so they are CLOLD.
create function private.widget_log_drink(p_user uuid, p_id uuid, p_drink_id text, p_drink_name text,
                                         p_category text, p_caffeinated boolean, p_logged_at timestamptz,
                                         p_local_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if p_user is null or p_id is null or p_logged_at is null or p_local_date is null then
    raise exception 'bad_input' using errcode = 'CLBAD';
  end if;
  if private.is_suspended(p_user) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  if p_logged_at < private.app_now() - interval '90 days' then
    raise exception 'too_old' using errcode = 'CLOLD';
  end if;
  insert into public.drink_logs (id, user_id, drink_id, drink_name, category, caffeinated, logged_at,
                                 local_date, source)
  values (p_id, p_user, p_drink_id, p_drink_name, p_category, p_caffeinated, p_logged_at, p_local_date, 'widget')
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
  private.widget_begin(bytea),
  private.widget_record_instance(uuid, uuid, text, text, text),
  private.widget_log_drink(uuid, uuid, text, text, text, boolean, timestamptz, date)
  from public, anon, authenticated;
grant execute on function
  private.widget_begin(bytea),
  private.widget_record_instance(uuid, uuid, text, text, text),
  private.widget_log_drink(uuid, uuid, text, text, text, boolean, timestamptz, date)
  to service_role;
