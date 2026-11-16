-- 0010_invites: invite codes (ARCHITECTURE.md 4.2, 6; PRD.md 3.15; RISK_REVIEW.md M-04, S-24).
-- redeem_invite() is in 0013 with the other friendship writers.

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),  -- Crockford base32, 40 bits
  max_uses    int not null default 20 check (max_uses between 1 and 20),  -- a code can't make more friends than anyone can have
  uses        int not null default 0 check (uses >= 0),
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked_at  timestamptz,                  -- set by rotation ("Stop my old invites", or expiry)
  created_at  timestamptz not null default now()
);
create unique index invites_one_active on public.invites (inviter_id) where revoked_at is null;

create table private.invite_redemptions (
  invite_id    uuid not null references public.invites(id) on delete cascade,
  invitee_id   uuid not null references public.profiles(id) on delete cascade,
  redeemed_at  timestamptz not null default now(),
  primary key (invite_id, invitee_id)
);

-- 8 Crockford base32 characters from 40 random bits.
create function private.new_invite_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes    bytea := extensions.gen_random_bytes(5);
  v_bits     bigint := 0;
  v_code     text := '';
begin
  for i in 0..4 loop
    v_bits := (v_bits << 8) | get_byte(v_bytes, i);
  end loop;
  for i in reverse 7..0 loop
    v_code := v_code || substr(v_alphabet, ((v_bits >> (i * 5)) & 31)::int + 1, 1);
  end loop;
  return v_code;
end $$;

-- Revokes the user's active code and creates a fresh one. Returns the new code.
create function private.rotate_invite(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now   timestamptz := private.app_now();
  v_code  text;
begin
  update public.invites i set revoked_at = v_now where i.inviter_id = p_user and i.revoked_at is null;
  loop
    v_code := private.new_invite_code();
    begin
      insert into public.invites (inviter_id, code, created_at, expires_at)
      values (p_user, v_code, v_now, v_now + interval '30 days');
      return v_code;
    exception when unique_violation then
      -- code collision (1 in 2^40 per existing code): try another
      if exists (select 1 from public.invites i where i.inviter_id = p_user and i.revoked_at is null) then
        raise;
      end if;
    end;
  end loop;
end $$;

-- Returns the active code, rotating it silently when it is missing, expired or used up.
create function private.ensure_invite(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites;
begin
  select * into v_inv from public.invites i where i.inviter_id = p_user and i.revoked_at is null for update;
  if found and v_inv.expires_at > private.app_now() and v_inv.uses < v_inv.max_uses then
    return v_inv.code;
  end if;
  return private.rotate_invite(p_user);
end $$;

-- invite-preview (public landing page): the inviter's first name only, or null for every bad code.
create function private.invite_preview(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select split_part(btrim(p.display_name), ' ', 1)
  from public.invites i
  join public.profiles p on p.id = i.inviter_id
  where i.code = upper(p_code) and i.revoked_at is null
    and i.expires_at > private.app_now() and i.uses < i.max_uses
    and not private.is_suspended(i.inviter_id);
$$;

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;
create policy own_read on public.invites for select to authenticated
  using (invites.inviter_id = (select auth.uid()));

grant execute on function private.new_invite_code(), private.rotate_invite(uuid), private.ensure_invite(uuid),
                          private.invite_preview(text) to service_role;
