-- 0016_account: sign-up, devices, sign-out, account deletion (ARCHITECTURE.md 3.6, 4.4, 4.7, 5;
-- PRD.md 3.1, 3.19; RISK_REVIEW.md M-05, M-09, M-16, S-04).
-- Called by the complete-signup, register-device and delete-account edge functions as service_role.

-- complete-signup: the age check already passed in the edge function, which discarded the birth
-- month and year. Creates profile, settings, private row, install history and the first invite.
-- Idempotent: a second call for an existing profile changes nothing and answers 'exists'.
create function private.complete_signup(
  p_user uuid, p_display_name text, p_min_age_version smallint, p_install_id uuid, p_timezone text,
  p_method text, p_phone_hmac bytea default null, p_apple_refresh_token_enc bytea default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tz text := 'UTC';
begin
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user) then
    return jsonb_build_object('status', 'exists', 'invite_code', private.ensure_invite(p_user));
  end if;
  if p_method not in ('apple', 'google', 'phone') then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'method';
  end if;
  if exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    v_tz := p_timezone;
  end if;

  insert into public.profiles (id, display_name) values (p_user, btrim(p_display_name));
  insert into public.user_settings (user_id, timezone) values (p_user, v_tz);
  insert into private.user_private (user_id, phone_hmac, age_confirmed_at, min_age_version,
                                    apple_refresh_token_enc, install_id)
  values (p_user, p_phone_hmac, now(), p_min_age_version, p_apple_refresh_token_enc, p_install_id);
  if p_install_id is not null then
    insert into private.install_history (install_id, user_id) values (p_install_id, p_user)
    on conflict (install_id, user_id) do update set seen_at = now();
  end if;
  perform private.log_event(p_user, 'auth_signed_up', jsonb_build_object('method', p_method));
  return jsonb_build_object('status', 'created', 'invite_code', private.ensure_invite(p_user));
end $$;

-- A verified phone number's HMAC (match-contacts, 8.1). Null clears it.
create function private.set_phone_hmac(p_user uuid, p_hmac bytea)
returns void language sql security definer set search_path = '' as $$
  update private.user_private up set phone_hmac = p_hmac where up.user_id = p_user;
$$;

create function private.set_apple_refresh_token(p_user uuid, p_enc bytea)
returns void language sql security definer set search_path = '' as $$
  update private.user_private up set apple_refresh_token_enc = p_enc where up.user_id = p_user;
$$;

-- register-device, every launch. Upserts the device for (user, install), moves a push token that
-- belonged to another account (deleting that device row revokes its widget credentials and Live
-- Activity tokens), applies a time-zone change at most once per 24 h, rotates the widget token
-- (p_widget_token_hash = sha256 of a fresh 256-bit token made by the edge function) and the invite
-- code when due. Returns what the app and the new-sign-in notification need.
create function private.register_device(
  p_user uuid, p_platform text, p_install_id uuid, p_app_version text, p_push_token text,
  p_apns_env text, p_locale text, p_timezone text, p_notif_permission boolean,
  p_la_push_to_start_token text, p_widget_push_token text, p_widget_token_hash bytea, p_method text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now          timestamptz := private.app_now();
  v_moved_from   uuid;
  v_new_install  boolean;
  v_device       uuid;
  v_settings     public.user_settings;
  v_tz_applied   boolean := false;
  v_notify       jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'not_found' using errcode = 'CLNFD', detail = 'no profile; call complete-signup';
  end if;
  if private.is_suspended(p_user) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  perform private.require_rate_limit(p_user, 'register_device', 20, interval '1 day');

  -- The token moved to this account: the previous owner's device row goes, with its credentials.
  if p_push_token is not null then
    delete from public.push_devices d
    where d.push_token = p_push_token and (d.user_id <> p_user or d.install_id <> p_install_id)
    returning d.user_id into v_moved_from;
    if v_moved_from = p_user then
      v_moved_from := null;   -- same account, older install: not a move between accounts
    end if;
  end if;

  v_new_install := not exists (select 1 from private.install_history h
                               where h.install_id = p_install_id and h.user_id = p_user);

  insert into public.push_devices as d (user_id, platform, push_token, install_id, apns_env, la_push_to_start_token,
                                        widget_push_token, notif_permission, app_version, locale, last_seen_at)
  values (p_user, p_platform, p_push_token, p_install_id, p_apns_env, p_la_push_to_start_token,
          p_widget_push_token, coalesce(p_notif_permission, false), p_app_version, p_locale, v_now)
  on conflict (user_id, install_id) do update set
    platform = excluded.platform, push_token = excluded.push_token, apns_env = excluded.apns_env,
    la_push_to_start_token = excluded.la_push_to_start_token, widget_push_token = excluded.widget_push_token,
    notif_permission = excluded.notif_permission, app_version = excluded.app_version,
    locale = excluded.locale, last_seen_at = excluded.last_seen_at
  returning d.id into v_device;

  insert into private.install_history (install_id, user_id, push_token_hash, seen_at)
  values (p_install_id, p_user, case when p_push_token is not null then sha256(convert_to(p_push_token, 'UTF8')) end, v_now)
  on conflict (install_id, user_id) do update
    set seen_at = excluded.seen_at, push_token_hash = coalesce(excluded.push_token_hash, private.install_history.push_token_hash);

  -- Time zone (4.5): applied when valid, changed, and the last change is over 24 h old.
  select * into v_settings from public.user_settings s where s.user_id = p_user for update;
  if p_timezone is not null and p_timezone is distinct from v_settings.timezone
     and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone)
     and (v_settings.tz_changed_at is null or v_settings.tz_changed_at < v_now - interval '24 hours') then
    update public.user_settings s set timezone = p_timezone, tz_changed_at = v_now where s.user_id = p_user;
    v_tz_applied := true;
  end if;

  -- Widget token: one active credential per device, rotated on every launch.
  if p_widget_token_hash is not null then
    update private.widget_credentials c set revoked_at = v_now where c.device_id = v_device and c.revoked_at is null;
    insert into private.widget_credentials (user_id, device_id, token_hash) values (p_user, v_device, p_widget_token_hash);
  end if;

  -- New install for this account: tell its other devices (n.new_signin, "Not me").
  if v_new_install then
    v_notify := coalesce((select jsonb_agg(jsonb_build_object('device_id', d.id, 'platform', d.platform,
                                                              'push_token', d.push_token, 'apns_env', d.apns_env))
                          from public.push_devices d
                          where d.user_id = p_user and d.id <> v_device and d.push_token is not null), '[]'::jsonb);
    perform private.log_event(p_user, 'auth_signed_in', jsonb_build_object('method', coalesce(p_method, 'phone')));
  else
    v_notify := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'device_id', v_device,
    'new_install', v_new_install,
    'notify_devices', v_notify,
    'moved_from_user', v_moved_from,
    'timezone_applied', v_tz_applied,
    'invite_code', private.ensure_invite(p_user),
    'min_ios_build', (select c.value from public.app_config c where c.key = 'min_ios_build'),
    'min_android_build', (select c.value from public.app_config c where c.key = 'min_android_build'));
end $$;

-- Sign-out (3.6): the device row goes, with its widget credentials and Live Activity tokens.
create function private.signout_device(p_user uuid, p_install_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_devices d where d.user_id = p_user and d.install_id = p_install_id;
  return found;
end $$;

-- "Not me" on the new-sign-in notification: every widget token of the account stops working.
-- The edge function also signs out every session (auth.admin.signOut(user, 'global')).
create function private.revoke_all_widget_credentials(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update private.widget_credentials c set revoked_at = now() where c.user_id = p_user and c.revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- delete-account, the database half of steps 3 to 7 (4.7). Every step is idempotent.
-- Returns what the edge function needs for the rest: devices to send clear messages to, Storage
-- objects to delete through the Storage API, and the stored Apple refresh token.
create function private.prepare_account_deletion(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_flares    uuid[];
  v_people    uuid[];
  v_devices   jsonb;
  v_objects   jsonb;
  v_apple     bytea;
  v_reversed  int := 0;
  v_ev        record;
  v_usage     boolean;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return jsonb_build_object('status', 'no_profile', 'clear_devices', '[]'::jsonb,
                              'objects', coalesce((select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name))
                                                   from storage.objects o
                                                   where o.bucket_id in ('avatars', 'snaps', 'flare-photos')
                                                     and o.name like p_user::text || '/%'), '[]'::jsonb),
                              'apple_refresh_token_enc', null);
  end if;

  -- 3. End any live flare, silently (cancelled earns nobody XP).
  v_flares := array(select f.id from public.flares f where f.sender_id = p_user and f.status = 'live');
  update public.flares f set status = 'cancelled', ended_at = private.app_now()
  where f.id = any (v_flares);
  perform private.settle_flare(x) from unnest(v_flares) x;

  -- 4. Who must drop this user from their widgets: friends and recipients of those flares.
  v_people := array(
    select case when f.user_a = p_user then f.user_b else f.user_a end
    from public.friendships f where f.user_a = p_user or f.user_b = p_user
    union
    select r.recipient_id from public.flare_recipients r where r.flare_id = any (v_flares));
  v_devices := coalesce((select jsonb_agg(jsonb_build_object('user_id', d.user_id, 'platform', d.platform,
                                                             'push_token', d.push_token, 'apns_env', d.apns_env))
                         from public.push_devices d
                         where d.user_id = any (v_people) and d.push_token is not null), '[]'::jsonb);

  -- 5. Reverse invite XP this user gave others in the last 7 days.
  for v_ev in
    select e.user_id from public.xp_events e
    where e.kind = 'invite_accepted' and e.counterpart = p_user
  loop
    v_reversed := v_reversed + private.reverse_recent_invite_xp(v_ev.user_id, p_user);
  end loop;

  -- 6. Files to delete (the edge function deletes them through the Storage API).
  v_objects := coalesce((select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name))
                         from storage.objects o
                         where o.bucket_id in ('avatars', 'snaps', 'flare-photos')
                           and o.name like p_user::text || '/%'), '[]'::jsonb);

  -- 7. Widget credentials and push devices. Rate counters have no FK, so they go here too.
  update private.widget_credentials c set revoked_at = now() where c.user_id = p_user and c.revoked_at is null;
  delete from public.push_devices d where d.user_id = p_user;
  delete from private.rate_counters c where c.user_id = p_user;

  select up.apple_refresh_token_enc into v_apple from private.user_private up where up.user_id = p_user;

  -- account_deleted carries no user id (PRD 6), and only for users who share usage stats.
  select s.share_usage into v_usage from public.user_settings s where s.user_id = p_user;
  if coalesce(v_usage, false) then
    insert into public.app_events (user_id, name) values (null, 'account_deleted');
  end if;

  return jsonb_build_object('status', 'ready', 'ended_flares', to_jsonb(v_flares), 'clear_devices', v_devices,
                            'objects', v_objects, 'xp_reversed', v_reversed,
                            'apple_refresh_token_enc', case when v_apple is null then null
                                                            else encode(v_apple, 'base64') end);
end $$;

-- Step 9: audit log rows that name the user (Supabase payload shape: actor_id, traits.user_id;
-- verify against the live project at build time).
create function private.purge_auth_audit(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  delete from auth.audit_log_entries a
  where a.payload->>'actor_id' = p_user::text or a.payload->'traits'->>'user_id' = p_user::text;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- After auth.admin.deleteUser: what is left for this user anywhere in public or private. The
-- deletion test asserts this is empty. Not counted, on purpose: reports and the moderation log
-- (kept for the 4.8 periods), install_history (30 days, invite XP abuse rule), and other people's
-- XP ledger rows whose ref_id / counterpart hold the deleted id (no row points at it any more).
create function private.account_leftovers(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_out  jsonb := '{}'::jsonb;
  v_n    bigint;
  r      record;
begin
  for r in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema in ('public', 'private') and t.table_type = 'BASE TABLE'
      and c.data_type = 'uuid'
      and c.column_name in ('id', 'user_id', 'sender_id', 'from_id', 'to_id', 'user_a', 'user_b', 'blocker_id',
                            'blocked_id', 'owner_id', 'member_id', 'recipient_id', 'inviter_id', 'invitee_id')
      and not (c.table_schema = 'private' and c.table_name in ('reports', 'moderation_log', 'install_history'))
      and not (c.column_name = 'id' and c.table_name <> 'profiles')
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name)
      into v_n using p_user;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(r.table_schema || '.' || r.table_name || '.' || r.column_name, v_n);
    end if;
  end loop;
  select count(*) into v_n from storage.objects o
  where o.bucket_id in ('avatars', 'snaps', 'flare-photos') and o.name like p_user::text || '/%';
  if v_n > 0 then
    v_out := v_out || jsonb_build_object('storage.objects', v_n);
  end if;
  select count(*) into v_n from auth.audit_log_entries a
  where a.payload->>'actor_id' = p_user::text or a.payload->'traits'->>'user_id' = p_user::text;
  if v_n > 0 then
    v_out := v_out || jsonb_build_object('auth.audit_log_entries', v_n);
  end if;
  return v_out;
end $$;

grant execute on function
  private.complete_signup(uuid, text, smallint, uuid, text, text, bytea, bytea),
  private.set_phone_hmac(uuid, bytea), private.set_apple_refresh_token(uuid, bytea),
  private.register_device(uuid, text, uuid, text, text, text, text, text, boolean, text, text, bytea, text),
  private.signout_device(uuid, uuid), private.revoke_all_widget_credentials(uuid),
  private.prepare_account_deletion(uuid), private.purge_auth_audit(uuid), private.account_leftovers(uuid)
  to service_role;
