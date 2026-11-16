-- 0005_friends: requests, friendships, blocks, the four RLS helpers, profiles policies
-- (ARCHITECTURE.md 4.2, 4.3; RISK_REVIEW.md M-01, S-05).

create table public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  source      text not null check (source in ('contacts', 'invite')),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create unique index friend_requests_one_pending
  on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
create index on public.friend_requests (to_id) where status = 'pending';
create index on public.friend_requests (from_id);
-- No 'declined' status. Ignoring leaves it pending; the daily job sets it to 'expired' after 30 days (F6).

create trigger friend_requests_touch before update on public.friend_requests
  for each row execute function private.touch_updated_at();

create table public.friendships (
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index on public.friendships (user_b);
-- Inserted only by private.make_friends(), which locks both users and enforces the 20-friend cap.

create table public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on public.blocks (blocked_id);

-- helpers -----------------------------------------------------------------
-- are_friends / is_blocked answer only for the caller (or for the server, where auth.uid() is null),
-- so they can't be used as a social-graph oracle.
create function private.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (select 1 from public.friendships f
                 where f.user_a = least(a, b) and f.user_b = greatest(a, b));
$$;

create function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (select 1 from public.blocks bl
                 where (bl.blocker_id = a and bl.blocked_id = b) or (bl.blocker_id = b and bl.blocked_id = a));
$$;

create function private.is_suspended(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.suspensions s where s.user_id = u and s.lifted_at is null);
$$;

-- Server-only: friend count, used by the cap.
create function private.friend_count(u uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.friendships f where f.user_a = u or f.user_b = u;
$$;

grant execute on function private.are_friends(uuid, uuid), private.is_blocked(uuid, uuid),
                          private.is_suspended(uuid), private.app_now() to authenticated, service_role;
grant execute on function private.friend_count(uuid) to service_role;

-- RLS ---------------------------------------------------------------------
alter table public.friend_requests enable row level security;
alter table public.friendships     enable row level security;
alter table public.blocks          enable row level security;

-- Writes go through private functions only (second lock besides having no write policy).
revoke all on public.friend_requests, public.friendships, public.blocks from anon, authenticated;
grant select on public.friend_requests, public.friendships, public.blocks to authenticated;

create policy mine on public.friendships for select to authenticated
  using ((select auth.uid()) in (friendships.user_a, friendships.user_b));
create policy mine on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (friend_requests.from_id, friend_requests.to_id));
-- Only the blocker sees a block. The blocked person never learns of it.
create policy own_read on public.blocks for select to authenticated
  using (blocks.blocker_id = (select auth.uid()));

-- profiles: me, my friends, and people with a pending request either way. Suspended users are
-- hidden from others. Blocking removes the friendship and cancels requests, so a blocked user
-- matches neither branch.
create policy profiles_read on public.profiles for select to authenticated using (
  profiles.id = (select auth.uid())
  or (not private.is_suspended(profiles.id)
      and (private.are_friends(profiles.id, (select auth.uid()))
           or exists (select 1 from public.friend_requests r
                      where r.status = 'pending'
                        and ((r.from_id = profiles.id and r.to_id = (select auth.uid()))
                          or (r.to_id = profiles.id and r.from_id = (select auth.uid()))))))
);
create policy profiles_write on public.profiles for update to authenticated
  using (profiles.id = (select auth.uid())) with check (profiles.id = (select auth.uid()));
-- Insert happens in complete-signup; delete via delete-account only.
