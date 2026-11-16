-- 0006_groups: private labels (ARCHITECTURE.md 4.2, 4.3; PRD.md 3.10).
-- Only the owner ever reads a group or its members. Recipients never learn a group exists.

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  org_id      uuid,                         -- future Teams. Always null in v1; FK added with the orgs table.
  name        text not null check (char_length(name) between 1 and 20 and btrim(name) <> ''),
  emoji       text check (char_length(emoji) <= 16),
  auto_role   text check (auto_role in ('work', 'home')),   -- "Automatic uses this for": weekdays / other times
  created_at  timestamptz not null default now(),
  check (org_id is null)                    -- no org groups in v1; dropped when Teams ships
);
create unique index groups_one_role_per_owner on public.groups (owner_id, auto_role) where auto_role is not null;
create index on public.groups (owner_id);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, member_id)
);
create index on public.group_members (member_id);

-- Max 10 groups per user (PRD 3.10 rule 2). The advisory lock serialises concurrent inserts.
create function private.groups_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('groups:' || new.owner_id::text, 0));
  if (select count(*) from public.groups g where g.owner_id = new.owner_id) >= 10 then
    raise exception 'group_cap' using errcode = 'CLCAP';
  end if;
  return new;
end $$;
create trigger groups_cap before insert on public.groups
  for each row execute function private.groups_cap();

-- Ex-friends leave each other's groups (removal, block, deletion).
create function private.friendship_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_members m
  using public.groups g
  where g.id = m.group_id
    and ((g.owner_id = old.user_a and m.member_id = old.user_b)
      or (g.owner_id = old.user_b and m.member_id = old.user_a));
  return old;
end $$;
create trigger friendship_removed after delete on public.friendships
  for each row execute function private.friendship_removed();

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

revoke all on public.groups, public.group_members from anon, authenticated;
grant select, delete on public.groups to authenticated;
grant insert (name, emoji, auto_role, owner_id) on public.groups to authenticated;
grant update (name, emoji, auto_role) on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;

create policy own on public.groups for all to authenticated
  using (groups.owner_id = (select auth.uid()))
  with check (groups.owner_id = (select auth.uid()) and groups.org_id is null);
create policy own on public.group_members for all to authenticated
  using (exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = (select auth.uid()))
              and private.are_friends(group_members.member_id, (select auth.uid())));


