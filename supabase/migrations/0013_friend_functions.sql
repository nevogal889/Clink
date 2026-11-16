-- 0013_friend_functions: every writer of friendships, requests and blocks, and invite redemption
-- (ARCHITECTURE.md 4.2, 4.4 friend-request / redeem-invite, 6, 8.4; PRD.md 3.9, 3.15, 3.18).
-- Clients have no write grant on friendships, friend_requests or blocks; only these functions write.

-- Clears the live-flare rows between two people, both directions: recipient rows and responses.
-- Returns the flares touched, so the edge function can send clear messages (3.3).
create function private.clear_live_flares_between(a uuid, b uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  v_ids := array(select f.id from public.flares f
                 where f.status = 'live' and f.sender_id in (a, b)
                   and exists (select 1 from public.flare_recipients r
                               where r.flare_id = f.id and r.recipient_id in (a, b) and r.recipient_id <> f.sender_id));
  delete from public.flare_responses r
  using public.flares f
  where f.id = r.flare_id and f.id = any (v_ids) and r.user_id in (a, b) and r.user_id <> f.sender_id;
  delete from public.flare_recipients r
  using public.flares f
  where f.id = r.flare_id and f.id = any (v_ids) and r.recipient_id in (a, b) and r.recipient_id <> f.sender_id;
  return v_ids;
end $$;

-- Creates the friendship under a lock on both users and enforces the 20-friend cap. Pending requests
-- between the two become accepted. Returns true when a new friendship was made.
create function private.make_friends(a uuid, b uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_made boolean;
begin
  if a = b then
    raise exception 'bad_input' using errcode = 'CLBAD';
  end if;
  -- Lock both users in a fixed order so two concurrent accepts can't pass the cap together.
  perform pg_advisory_xact_lock(hashtextextended('friends:' || least(a, b)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('friends:' || greatest(a, b)::text, 0));
  if private.is_blocked(a, b) then
    raise exception 'blocked' using errcode = 'CLBLK';
  end if;
  if exists (select 1 from public.friendships f where f.user_a = least(a, b) and f.user_b = greatest(a, b)) then
    return false;
  end if;
  if private.friend_count(a) >= 20 then
    raise exception 'friend_cap' using errcode = 'CLCAP', detail = a::text;
  end if;
  if private.friend_count(b) >= 20 then
    raise exception 'friend_cap' using errcode = 'CLCAP', detail = b::text;
  end if;
  insert into public.friendships (user_a, user_b) values (least(a, b), greatest(a, b))
  on conflict do nothing;
  v_made := found;
  update public.friend_requests r set status = 'accepted'
  where r.status = 'pending' and least(r.from_id, r.to_id) = least(a, b) and greatest(r.from_id, r.to_id) = greatest(a, b);
  return v_made;
end $$;

-- friend-request send. A request to someone who blocked you (or whom you blocked), or who is
-- suspended, answers 'sent' and writes nothing, so a block is never revealed. Mutual requests
-- become a friendship (PRD 3.9 edge case).
create function private.send_friend_request(p_from uuid, p_to uuid, p_source text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_req public.friend_requests;
begin
  if private.is_suspended(p_from) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  if p_from = p_to or not exists (select 1 from public.profiles p where p.id = p_to) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  perform private.require_rate_limit(p_from, 'friend_request', 30, interval '1 day');
  if private.is_blocked(p_from, p_to) or private.is_suspended(p_to) then
    return 'sent';
  end if;
  if private.are_friends(p_from, p_to) then
    return 'already_friends';
  end if;
  select * into v_req from public.friend_requests r
  where r.status = 'pending' and r.from_id = p_to and r.to_id = p_from;
  if found then
    return private.accept_friend_request(p_from, v_req.id);
  end if;
  insert into public.friend_requests (from_id, to_id, source) values (p_from, p_to, p_source)
  on conflict do nothing;
  return 'sent';
end $$;

-- friend-request accept. Only the recipient of a pending request can accept it. Returns 'friends'.
create function private.accept_friend_request(p_user uuid, p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_req public.friend_requests;
begin
  if private.is_suspended(p_user) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  select * into v_req from public.friend_requests r
  where r.id = p_request and r.to_id = p_user and r.status = 'pending' for update;
  if not found or private.is_suspended(v_req.from_id) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  if private.make_friends(v_req.from_id, p_user) then
    perform private.award_xp(p_user, 'new_friend', v_req.from_id, v_req.from_id);
    perform private.award_xp(v_req.from_id, 'new_friend', p_user, p_user);
    perform private.log_event(p_user, 'friend_added', jsonb_build_object('source', 'request'));
    perform private.log_event(v_req.from_id, 'friend_added', jsonb_build_object('source', v_req.source));
  end if;
  return 'friends';
end $$;

create function private.cancel_friend_request(p_user uuid, p_request uuid)
returns void language sql security definer set search_path = '' as $$
  update public.friend_requests r set status = 'cancelled'
  where r.id = p_request and r.from_id = p_user and r.status = 'pending';
$$;

-- Remove friend: silent. Ex-friends leave each other's groups (trigger in 0006) and live flares,
-- and invite XP under 7 days old is reversed both ways. Returns the live flares touched.
create function private.remove_friend(p_user uuid, p_friend uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_flares uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('friends:' || least(p_user, p_friend)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('friends:' || greatest(p_user, p_friend)::text, 0));
  delete from public.friendships f
  where f.user_a = least(p_user, p_friend) and f.user_b = greatest(p_user, p_friend);
  if not found then
    return '{}';
  end if;
  v_flares := private.clear_live_flares_between(p_user, p_friend);
  perform private.reverse_recent_invite_xp(p_user, p_friend);
  perform private.reverse_recent_invite_xp(p_friend, p_user);
  perform private.log_event(p_user, 'friend_removed', '{}'::jsonb);
  return v_flares;
end $$;

-- Block: friendship removed, requests cancelled, group memberships removed (both ways, via the
-- friendship trigger and explicitly), live-flare rows removed both ways, invite XP reversed.
-- The blocked person is not told. Returns the live flares touched.
create function private.block_user(p_blocker uuid, p_blocked uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_flares uuid[];
begin
  if p_blocker = p_blocked or not exists (select 1 from public.profiles p where p.id = p_blocked) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('friends:' || least(p_blocker, p_blocked)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('friends:' || greatest(p_blocker, p_blocked)::text, 0));
  insert into public.blocks (blocker_id, blocked_id) values (p_blocker, p_blocked) on conflict do nothing;
  delete from public.friendships f
  where f.user_a = least(p_blocker, p_blocked) and f.user_b = greatest(p_blocker, p_blocked);
  update public.friend_requests r set status = 'cancelled'
  where r.status = 'pending'
    and ((r.from_id = p_blocker and r.to_id = p_blocked) or (r.from_id = p_blocked and r.to_id = p_blocker));
  delete from public.group_members m using public.groups g
  where g.id = m.group_id
    and ((g.owner_id = p_blocker and m.member_id = p_blocked) or (g.owner_id = p_blocked and m.member_id = p_blocker));
  v_flares := private.clear_live_flares_between(p_blocker, p_blocked);
  perform private.reverse_recent_invite_xp(p_blocker, p_blocked);
  perform private.reverse_recent_invite_xp(p_blocked, p_blocker);
  perform private.log_event(p_blocker, 'user_blocked', jsonb_build_object('target', 'person'));
  return v_flares;
end $$;

-- Unblock does not restore the friendship (PRD 3.18 rule 5).
create function private.unblock_user(p_blocker uuid, p_blocked uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocks b where b.blocker_id = p_blocker and b.blocked_id = p_blocked;
$$;

-- Invite XP abuse rule (4.5, PRD 4.3 rule 8): no invite XP when the invitee's install or push token
-- belonged to another account in the last 30 days, or when the invitee has no verified phone,
-- Apple or Google identity.
create function private.invite_xp_allowed(p_invitee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (exists (select 1 from auth.users u where u.id = p_invitee and u.phone_confirmed_at is not null)
     or exists (select 1 from auth.identities i where i.user_id = p_invitee and i.provider in ('apple', 'google')))
    and not exists (
      select 1 from private.install_history mine
      join private.install_history other
        on (other.install_id = mine.install_id
            or (mine.push_token_hash is not null and other.push_token_hash = mine.push_token_hash))
       and other.user_id <> p_invitee
      where mine.user_id = p_invitee
        and other.seen_at > private.app_now() - interval '30 days')
    and not exists (
      select 1 from private.user_private up
      join private.install_history other on other.install_id = up.install_id and other.user_id <> p_invitee
      where up.user_id = p_invitee and other.seen_at > private.app_now() - interval '30 days');
$$;

-- redeem-invite (ARCHITECTURE.md 6). Every bad code, including blocked pairs and the inviter's own
-- code, raises the same invite_code error, so codes can't be probed.
-- Statuses: friends | already_friends | needs_confirm | invitee_at_cap | request_sent.
-- p_confirm is the existing user's Add on the confirm card. A new account is one created in the
-- last 24 hours that hasn't claimed an invite yet; the server decides, not the client.
create function private.redeem_invite(p_invitee uuid, p_code text, p_confirm boolean, p_attribution text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inv      public.invites;
  v_name     text;
  v_new      boolean;
  v_made     boolean;
begin
  if private.is_suspended(p_invitee) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  perform private.require_rate_limit(p_invitee, 'invite_redeem', 10, interval '1 day');

  select * into v_inv from public.invites i where i.code = upper(btrim(p_code)) for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= private.app_now()
     or v_inv.uses >= v_inv.max_uses or v_inv.inviter_id = p_invitee
     or private.is_blocked(v_inv.inviter_id, p_invitee) or private.is_suspended(v_inv.inviter_id) then
    raise exception 'invite_code' using errcode = 'CLINV';
  end if;
  select split_part(btrim(p.display_name), ' ', 1) into v_name from public.profiles p where p.id = v_inv.inviter_id;

  if private.are_friends(v_inv.inviter_id, p_invitee) then
    return jsonb_build_object('status', 'already_friends', 'inviter_id', v_inv.inviter_id, 'inviter_name', v_name);
  end if;

  select (p.created_at > private.app_now() - interval '24 hours'
          and not exists (select 1 from private.user_private up where up.user_id = p_invitee and up.via_invite_id is not null)
          and not exists (select 1 from private.invite_redemptions r where r.invitee_id = p_invitee))
    into v_new
  from public.profiles p where p.id = p_invitee;

  if not v_new and not coalesce(p_confirm, false) then
    return jsonb_build_object('status', 'needs_confirm', 'inviter_id', v_inv.inviter_id, 'inviter_name', v_name);
  end if;
  if private.friend_count(p_invitee) >= 20 then
    -- Nothing written, nothing sent to the inviter (PRD 3.15).
    return jsonb_build_object('status', 'invitee_at_cap', 'inviter_id', v_inv.inviter_id, 'inviter_name', v_name);
  end if;

  insert into private.invite_redemptions (invite_id, invitee_id) values (v_inv.id, p_invitee)
  on conflict do nothing;
  update public.invites i set uses = i.uses + 1 where i.id = v_inv.id;
  if v_new then
    update private.user_private up set via_invite_id = v_inv.id where up.user_id = p_invitee;
  end if;

  if private.friend_count(v_inv.inviter_id) >= 20 then
    -- Inviter at the cap: a request to the inviter instead (PRD 3.9 edge case).
    insert into public.friend_requests (from_id, to_id, source) values (p_invitee, v_inv.inviter_id, 'invite')
    on conflict do nothing;
    return jsonb_build_object('status', 'request_sent', 'inviter_id', v_inv.inviter_id, 'inviter_name', v_name);
  end if;

  v_made := private.make_friends(v_inv.inviter_id, p_invitee);
  if v_made then
    if v_new then
      if private.invite_xp_allowed(p_invitee) then
        perform private.award_xp(v_inv.inviter_id, 'invite_accepted', p_invitee, p_invitee);
      end if;
    else
      perform private.award_xp(v_inv.inviter_id, 'new_friend', p_invitee, p_invitee);
      perform private.award_xp(p_invitee, 'new_friend', v_inv.inviter_id, v_inv.inviter_id);
    end if;
    perform private.log_event(p_invitee, 'invite_accepted', jsonb_build_object(
      'attribution', coalesce(p_attribution, 'deeplink'), 'existing_user', not v_new));
    perform private.log_event(v_inv.inviter_id, 'friend_added', jsonb_build_object('source', 'invite'));
  end if;
  return jsonb_build_object('status', 'friends', 'inviter_id', v_inv.inviter_id, 'inviter_name', v_name,
                            'new_account', v_new);
end $$;

grant execute on function private.clear_live_flares_between(uuid, uuid), private.make_friends(uuid, uuid),
  private.send_friend_request(uuid, uuid, text), private.accept_friend_request(uuid, uuid),
  private.cancel_friend_request(uuid, uuid), private.remove_friend(uuid, uuid), private.block_user(uuid, uuid),
  private.unblock_user(uuid, uuid), private.invite_xp_allowed(uuid),
  private.redeem_invite(uuid, text, boolean, text) to service_role;
