-- Allow and deny for the policies the other files touch only one way (ARCHITECTURE.md 4.3, 9:
-- "every RLS policy has allow and deny tests").
begin;
select plan(17);
select tests.seed();
insert into storage.objects (bucket_id, name) values
  ('snaps', tests.id('a') || '/00000000-0000-0000-0000-00000000aa01.jpg'),
  ('snaps', tests.id('a') || '/00000000-0000-0000-0000-00000000aa01_t.jpg'),
  ('avatars', tests.id('a') || '/1.jpg');
do $$ begin perform private.create_snap(tests.id('a'), '00000000-0000-0000-0000-00000000aa01', null, null); end $$;

-- snap_hides: own rows only
select lives_ok(tests.q('b', format($q$insert into public.snap_hides (user_id, snap_id) values (%L, '00000000-0000-0000-0000-00000000aa01')$q$,
                                    tests.id('b'))), 'b hides a snap for itself');
select throws_ok(tests.q('b', format($q$insert into public.snap_hides (user_id, snap_id) values (%L, '00000000-0000-0000-0000-00000000aa01')$q$,
                                     tests.id('e'))), '42501', null, 'b cannot hide a snap for e');
select is(tests.rows_as('e', 'select 1 from public.snap_hides'), 0::bigint, 'e cannot see b''s hides');

-- flare_photo_hides: own rows only
create temp table t_f as select tests.flare('a', 'everyone') as id;
grant select on t_f to authenticated;
insert into storage.objects (bucket_id, name) select 'flare-photos', tests.id('a') || '/' || id || x from t_f, unnest(array['.jpg', '_t.jpg']) x;
do $$ begin perform private.attach_flare_photo(tests.id('a'), (select id from t_f)); end $$;
select lives_ok(tests.q('b', format('insert into public.flare_photo_hides (user_id, flare_id) values (%L, %L)', tests.id('b'), (select id from t_f))),
                'b hides a flare photo for itself');
select is(tests.rows_as('b', 'select 1 from public.flare_photos'), 0::bigint, '... and no longer sees it');
select throws_ok(tests.q('b', format('insert into public.flare_photo_hides (user_id, flare_id) values (%L, %L)', tests.id('e'), (select id from t_f))),
                 '42501', null, 'b cannot hide it for e');

-- moderation_notices: the owner marks seen; nobody else can
insert into public.moderation_notices (user_id, kind, reason) values (tests.id('a'), 'content_removed', 'spam');
select is(tests.affected('a', 'update public.moderation_notices set seen_at = now()'), 1::bigint, 'the owner marks a notice seen');
select is(tests.affected('b', 'update public.moderation_notices set seen_at = now()'), 0::bigint, 'b cannot touch a''s notices');

-- storage deletes: own folder only. The Storage API sets this flag for its deletes; hosted
-- Supabase refuses direct deletes from storage tables without it (storage.protect_delete).
set local storage.allow_delete_query = 'true';
select is(tests.affected('b', format($q$delete from storage.objects where bucket_id = 'avatars' and name = %L$q$, tests.id('a') || '/1.jpg')),
          0::bigint, 'b cannot delete a''s avatar');
select is(tests.affected('a', format($q$delete from storage.objects where bucket_id = 'avatars' and name = %L$q$, tests.id('a') || '/1.jpg')),
          1::bigint, 'a deletes its own avatar');
select is(tests.affected('b', 'delete from storage.objects where bucket_id = ''snaps'''), 0::bigint, 'b cannot delete a''s snap files');

-- server-written tables refuse every client write
select throws_ok(tests.q('a', format('insert into public.push_devices (user_id, platform, install_id, app_version) values (%L, %L, %L, %L)',
                                     tests.id('a'), 'ios', gen_random_uuid(), '1')), '42501', null, 'no client insert on push_devices');
select throws_ok(tests.q('a', format('insert into public.invites (inviter_id, code) values (%L, %L)', tests.id('a'), 'ABCDEFGH')),
                 '42501', null, 'no client insert on invites');
select throws_ok(tests.q('a', 'update public.app_config set value = ''99'' where key = ''min_age'''), '42501', null,
                 'no client write on app_config');
select throws_ok(tests.q('a', format('insert into public.last_drink_shares (user_id, last_drink_at) values (%L, now())', tests.id('a'))),
                 '42501', null, 'no client write on last_drink_shares');
select throws_ok(tests.q('w', format('insert into public.flare_responses (flare_id, user_id, kind, source) values (%L, %L, %L, %L)',
                                     (select id from t_f), tests.id('w'), 'in', 'app')),
                 '42501', null, 'no client write on flare_responses (respond-flare only)');
select throws_ok(tests.q('b', format($q$insert into public.snap_reactions (snap_id, user_id, emoji) values ('00000000-0000-0000-0000-00000000aa01', %L, '❤️')$q$,
                                     tests.id('b'))), '42501', null, 'no client write on snap_reactions (react-snap only)');

select * from finish();
rollback;
