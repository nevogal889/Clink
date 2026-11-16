-- 0008_devices: push devices, widget credentials, widget instances (ARCHITECTURE.md 3.5, 3.6, 4.2, 4.4).
-- Created before live_activity_tokens (0013), which references push_devices.

create table public.push_devices (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  platform               text not null check (platform in ('ios', 'android')),
  push_token             text unique check (char_length(push_token) between 1 and 4096),
  install_id             uuid not null,      -- random per install, kept in Keychain / Keystore
  apns_env               text check (apns_env in ('sandbox', 'production')),
  la_push_to_start_token text check (char_length(la_push_to_start_token) <= 4096),
  widget_push_token      text check (char_length(widget_push_token) <= 4096),
  notif_permission       boolean not null default false,
  app_version            text not null check (char_length(app_version) between 1 and 40),
  locale                 text check (char_length(locale) <= 35),
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (user_id, install_id),
  check (platform = 'ios' or (apns_env is null and la_push_to_start_token is null and widget_push_token is null))
);
create index on public.push_devices (user_id);
create index on public.push_devices (install_id);
create index on public.push_devices (last_seen_at);

-- Which install ids each account has used, kept after the device row goes (sign-out, 90-day cleanup),
-- for the invite XP abuse rule: an install that belonged to another account in the last 30 days
-- earns no invite XP (ARCHITECTURE.md 4.5). Rows older than 30 days are deleted by the daily job.
create table private.install_history (
  install_id  uuid not null,
  user_id     uuid not null,                 -- no FK: must outlive a deleted account for 30 days
  push_token_hash bytea,                     -- sha256 of the push token, same rule for tokens
  seen_at     timestamptz not null default now(),
  primary key (install_id, user_id)
);
create index on private.install_history (push_token_hash);

create table private.widget_credentials (    -- no client access
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_id     uuid not null references public.push_devices(id) on delete cascade,
  token_hash    bytea not null unique check (octet_length(token_hash) = 32),   -- sha256 of the 256-bit token
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create unique index widget_credentials_one_active on private.widget_credentials (device_id) where revoked_at is null;

create table private.widget_instances (      -- widget_added once per instance (3.5)
  device_id     uuid not null references public.push_devices(id) on delete cascade,
  instance_key  text not null check (char_length(instance_key) between 1 and 200),
  size          text not null check (size in ('small', 'medium')),
  first_seen_at timestamptz not null default now(),
  primary key (device_id, instance_key)
);

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant select on public.push_devices to authenticated;
create policy own_read on public.push_devices for select to authenticated
  using (push_devices.user_id = (select auth.uid()));
-- Writes go through register-device (private.register_device, 0017).

-- Resolves a widget token hash to its user for widget-api. Revoked or unknown: no row. widget-api
-- answers 403 suspended when `suspended` is true.
create function private.widget_user(p_token_hash bytea)
returns table (user_id uuid, device_id uuid, suspended boolean) language sql security definer set search_path = '' as $$
  update private.widget_credentials c set last_used_at = now()
  where c.token_hash = p_token_hash and c.revoked_at is null
  returning c.user_id, c.device_id, private.is_suspended(c.user_id);
$$;
grant execute on function private.widget_user(bytea) to service_role;
