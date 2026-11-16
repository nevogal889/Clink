-- 0011_snaps: drink snaps, hides, reactions (ARCHITECTURE.md 4.2, 4.3; PRD.md 3.4).
-- Snaps always go to all friends, never to a group.

create table public.snaps (
  id                    uuid primary key default gen_random_uuid(),
  sender_id             uuid not null references public.profiles(id) on delete cascade,
  image_path            text not null,       -- {sender_id}/{id}.jpg in bucket snaps (1080 px)
  thumb_path            text not null,       -- {sender_id}/{id}_t.jpg in bucket snaps (480 px, for widgets)
  category              text check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  place                 text check (char_length(place) <= 40),
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '24 hours',
  hidden_at             timestamptz,         -- set by moderation, image screening or auto-hide
  reaction_notified_at  timestamptz,         -- the one reaction notification was sent (PRD 3.4 rule 9)
  check (image_path = sender_id::text || '/' || id::text || '.jpg'),
  check (thumb_path = sender_id::text || '/' || id::text || '_t.jpg'),
  check (expires_at <= created_at + interval '24 hours')
);
create index on public.snaps (sender_id, created_at desc);
create index on public.snaps (expires_at);

create table public.snap_hides (             -- "hide for me" after a report
  user_id  uuid not null references public.profiles(id) on delete cascade,
  snap_id  uuid not null references public.snaps(id) on delete cascade,
  primary key (user_id, snap_id)
);

create table public.snap_reactions (
  snap_id     uuid not null references public.snaps(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('☕', '🍵', '🫖', '❤️', '😂')),
  created_at  timestamptz not null default now(),
  primary key (snap_id, user_id)             -- one reaction per person, can be changed
);

alter table public.snaps          enable row level security;
alter table public.snap_hides     enable row level security;
alter table public.snap_reactions enable row level security;

revoke all on public.snaps, public.snap_hides, public.snap_reactions from anon, authenticated;
grant select on public.snaps, public.snap_reactions to authenticated;
grant select, insert, delete on public.snap_hides to authenticated;

-- snaps: sender, or a friend, while live and not hidden
create policy visible on public.snaps for select to authenticated using (
  snaps.sender_id = (select auth.uid())
  or (snaps.expires_at > private.app_now() and snaps.hidden_at is null
      and private.are_friends(snaps.sender_id, (select auth.uid()))
      and not private.is_suspended(snaps.sender_id)
      and not exists (select 1 from public.snap_hides h
                      where h.snap_id = snaps.id and h.user_id = (select auth.uid())))
);
create policy own on public.snap_hides for all to authenticated
  using (snap_hides.user_id = (select auth.uid()))
  with check (snap_hides.user_id = (select auth.uid()));
-- reactions: your own, and every reaction on your own snaps
create policy read on public.snap_reactions for select to authenticated using (
  snap_reactions.user_id = (select auth.uid())
  or exists (select 1 from public.snaps s where s.id = snap_reactions.snap_id and s.sender_id = (select auth.uid()))
);

-- share-snap: inserts the snap once both files are in the caller's folder, and returns the friends
-- to update. 20 per day.
create function private.create_snap(p_sender uuid, p_snap_id uuid, p_category text, p_place text)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_now    timestamptz := private.app_now();
  v_image  text := p_sender::text || '/' || p_snap_id::text || '.jpg';
  v_thumb  text := p_sender::text || '/' || p_snap_id::text || '_t.jpg';
begin
  if private.is_suspended(p_sender) then
    raise exception 'suspended' using errcode = 'CLSUS';
  end if;
  perform private.assert_text(p_place);
  if (select count(*) from storage.objects o
      where o.bucket_id = 'snaps' and o.name in (v_image, v_thumb)) <> 2 then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'snap files missing';
  end if;
  if exists (select 1 from public.snaps s where s.id = p_snap_id) then
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'snap id already used';
  end if;
  perform private.require_rate_limit(p_sender, 'snap', 20, interval '1 day');
  insert into public.snaps (id, sender_id, image_path, thumb_path, category, place, created_at, expires_at)
  values (p_snap_id, p_sender, v_image, v_thumb, p_category, nullif(btrim(p_place), ''), v_now, v_now + interval '24 hours');
  perform private.log_event(p_sender, 'snap_shared', '{}'::jsonb);
  return array(
    select case when f.user_a = p_sender then f.user_b else f.user_a end
    from public.friendships f
    where (f.user_a = p_sender or f.user_b = p_sender)
      and not private.is_suspended(case when f.user_a = p_sender then f.user_b else f.user_a end));
end $$;

-- react-snap: upserts the reaction and returns true when this is the snap's first notification.
create function private.react_snap(p_user uuid, p_snap uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_snap public.snaps;
begin
  select * into v_snap from public.snaps s where s.id = p_snap for update;
  if not found or v_snap.sender_id = p_user or v_snap.expires_at <= private.app_now()
     or v_snap.hidden_at is not null or not private.are_friends(v_snap.sender_id, p_user)
     or private.is_suspended(v_snap.sender_id) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  perform private.require_rate_limit(p_user, 'reaction', 60, interval '1 hour');
  insert into public.snap_reactions (snap_id, user_id, emoji) values (p_snap, p_user, p_emoji)
  on conflict (snap_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  perform private.log_event(p_user, 'snap_reacted', jsonb_build_object('reaction', p_emoji));
  if v_snap.reaction_notified_at is null then
    update public.snaps s set reaction_notified_at = now() where s.id = p_snap;
    return true;
  end if;
  return false;
end $$;

grant execute on function private.create_snap(uuid, uuid, text, text), private.react_snap(uuid, uuid, text) to service_role;
