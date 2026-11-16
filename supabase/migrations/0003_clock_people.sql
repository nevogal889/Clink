-- 0003_clock_people: server clock, people, settings, private user data, suspensions, text filter,
-- app config (ARCHITECTURE.md 4.2, 8.4, 9).
--
-- Error convention for every function and trigger in this schema: raise with a custom SQLSTATE in
-- class CL and the API error code as the message. Edge functions map them:
--   CLTXT text_blocked (422)   CLCAP friend_cap, group_cap (409)   CLLIV live_flare_exists (409)
--   CLRTL rate_limited (429)   CLEND flare_ended (404)     CLINV invite_code (404)
--   CLSUS suspended (403)      CLBAD bad_input (400)       CLNFD not_found (404)
--   CLBLK blocked (404, shown like not_found so a block is never revealed)

-- clock (QA_PLAN QF-S30) ----------------------------------------------------
-- Dev and local only. Production refuses an offset twice: the prod deploy job fails if the row
-- exists, and edge functions refuse to run with CLINK_ENV=prod and an offset set (ARCHITECTURE.md 9).
create table private.clock_offset (
  id       smallint primary key default 1 check (id = 1),
  seconds  int not null
);

create function private.app_now()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select now() + coalesce((select c.seconds from private.clock_offset c where c.id = 1), 0) * interval '1 second';
$$;

-- people ------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 30 and btrim(display_name) <> ''),
  avatar_path   text check (char_length(avatar_path) <= 200),   -- avatars/{id}/{version}.jpg, stored without the bucket
  created_at    timestamptz not null default now(),
  check (avatar_path is null or avatar_path like id::text || '/%')
);
-- Inserted by private.complete_signup() after the age check (4.4), never by a trigger on auth.users.

create table public.user_settings (          -- owner only
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  notify_flares     boolean not null default true,
  notify_replies    boolean not null default true,
  notify_snaps      boolean not null default false,
  notify_reactions  boolean not null default true,
  notify_friends    boolean not null default true,
  share_last_drink  boolean not null default false,
  contact_matching  boolean not null default true,
  discoverable      boolean not null default true,
  share_usage       boolean not null default true,
  timezone          text not null default 'UTC',      -- written by register-device only (column grant below)
  tz_changed_at     timestamptz,                       -- caps use a new zone at most once per 24 h (4.5)
  onboarding_step   text not null default 'profile' check (char_length(onboarding_step) between 1 and 20),
  groups_suggestion_dismissed boolean not null default false,   -- PRD 3.10 rule 4: one-time 6-friend suggestion
  updated_at        timestamptz not null default now()
);                                            -- no quiet hours, by CEO decision

create table private.user_private (          -- no client access
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  phone_hmac              bytea unique,       -- HMAC(pepper, sha256(E.164)); see 8.1
  age_confirmed_at        timestamptz not null,
  min_age_version         smallint not null,  -- which minimum rule the user passed (app_config min_age.version)
  apple_refresh_token_enc bytea,              -- AES-GCM in the edge function; key in function secrets
  install_id              uuid,               -- install that completed sign-up, for the invite XP rule (4.5)
  via_invite_id           uuid                -- the invite this account was created through, if any
);
-- The birth date is never stored, not even here.

create table private.suspensions (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz
);

-- text filter (8.4) ---------------------------------------------------------
create table private.blocked_terms (         -- editable without a release; content is loaded by Moderation
  term  text primary key check (term = lower(term) and term ~ '^[a-z]+$'),
  kind  text not null check (kind in ('exact', 'substring'))
);

-- True when the text is allowed. Matching is case-insensitive and sees through common evasions:
-- digits and symbols used as letters (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s) and separators
-- between letters ("b.a.d"). exact terms match whole words; substring terms match anywhere once
-- separators are removed.
create function private.check_text(p_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  with n as (
    select translate(lower(coalesce(p_text, '')), '013457@$!|', 'oieastasii') as t
  ), parts as (
    select regexp_split_to_array(n.t, '[^a-z]+') as words,
           regexp_replace(n.t, '[^a-z]', '', 'g') as compact
    from n
  )
  select not exists (
    select 1 from private.blocked_terms b, parts p
    where (b.kind = 'exact' and (b.term = any (p.words) or p.compact = b.term))
       or (b.kind = 'substring' and position(b.term in p.compact) > 0)
  );
$$;

create function private.assert_text(p_text text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_text is not null and not private.check_text(p_text) then
    raise exception 'text_blocked' using errcode = 'CLTXT';
  end if;
end $$;

create function private.profiles_check_text()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_text(new.display_name);
  return new;
end $$;
create trigger profiles_check_text before insert or update of display_name on public.profiles
  for each row execute function private.profiles_check_text();

create function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := private.app_now();   -- the test clock moves it too, so retention by updated_at is testable
  return new;
end $$;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- app config --------------------------------------------------------------
create table public.app_config (             -- readable by anyone signed in
  key    text primary key check (key ~ '^[a-z_]{2,40}$'),
  value  jsonb not null
);
insert into public.app_config (key, value) values
  ('min_age',           '{"age": 16, "version": 1}'),   -- CEO answer: 16+ (DECISIONS.md)
  ('min_ios_build',     '0'),
  ('min_android_build', '0');
-- xp_levels is written by 0009 from the PRD 4.4 thresholds.

-- RLS and grants ----------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.app_config    enable row level security;

revoke all on public.profiles, public.user_settings, public.app_config from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant select on public.user_settings to authenticated;
grant update (notify_flares, notify_replies, notify_snaps, notify_reactions, notify_friends,
              share_last_drink, contact_matching, discoverable, share_usage, onboarding_step,
              groups_suggestion_dismissed)
  on public.user_settings to authenticated;
grant select on public.app_config to authenticated;

-- profiles policies are in 0005, once friend_requests exists.
create policy own on public.user_settings for all to authenticated
  using (user_settings.user_id = (select auth.uid()))
  with check (user_settings.user_id = (select auth.uid()));
create policy read_all on public.app_config for select to authenticated using (true);

grant execute on function private.app_now(), private.check_text(text), private.assert_text(text) to service_role;
