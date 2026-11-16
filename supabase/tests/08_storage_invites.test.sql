-- Storage RLS (ARCHITECTURE.md 4.3 buckets; RISK_REVIEW.md M-02) and invites (ARCHITECTURE.md 6;
-- PRD.md 3.15 AC 8 to 10; QA_PLAN PV2, PV6).
begin;
select plan(31);
select tests.seed();

-- avatars -----------------------------------------------------------------------------
select lives_ok(tests.q('a', format($q$insert into storage.objects (bucket_id, name) values ('avatars', %L)$q$, tests.id('a') || '/1.jpg')),
                'a uploads an avatar into its own folder');
select throws_ok(tests.q('a', format($q$insert into storage.objects (bucket_id, name) values ('avatars', %L)$q$, tests.id('b') || '/1.jpg')),
                 '42501', null, 'a cannot upload into b''s folder');
select throws_ok(tests.q('a', format($q$insert into storage.objects (bucket_id, name) values ('avatars', %L)$q$, tests.id('a') || '/x.png')),
                 '42501', null, 'avatar names must be {user}/{version}.jpg');
select is(tests.rows_as('b', 'select 1 from storage.objects where bucket_id = ''avatars'''), 1::bigint, 'friend b can read a''s avatar');
select is(tests.rows_as('g', 'select 1 from storage.objects where bucket_id = ''avatars'''), 1::bigint,
          'pending requester g can read a''s avatar');
select is(tests.rows_as('c', 'select 1 from storage.objects where bucket_id = ''avatars'''), 0::bigint, 'stranger c cannot read it');
select is(tests.rows_as('d', 'select 1 from storage.objects where bucket_id = ''avatars'''), 0::bigint, 'blocked d cannot read it');
select is(tests.rows_as('anon', 'select 1 from storage.objects'), 0::bigint, 'anon reads no objects');

-- snaps: file readable only while the row is visible ------------------------------------------
insert into storage.objects (bucket_id, name) values
  ('snaps', tests.id('a') || '/00000000-0000-0000-0000-00000000aa01.jpg'),
  ('snaps', tests.id('a') || '/00000000-0000-0000-0000-00000000aa01_t.jpg');
select is(tests.rows_as('b', 'select 1 from storage.objects where bucket_id = ''snaps'''), 0::bigint,
          'before share-snap, friends cannot read the uploaded files');
select is(tests.rows_as('a', 'select 1 from storage.objects where bucket_id = ''snaps'''), 2::bigint, 'the uploader can');
do $$ begin perform private.create_snap(tests.id('a'), '00000000-0000-0000-0000-00000000aa01', null, null); end $$;
select is(tests.rows_as('b', 'select 1 from storage.objects where bucket_id = ''snaps'''), 2::bigint, 'friend b can read the snap files');
select is(tests.rows_as('c', 'select 1 from storage.objects where bucket_id = ''snaps'''), 0::bigint, 'stranger c cannot');
do $$ begin perform tests.set_clock(24 * 3600 + 1); end $$;
select is(tests.rows_as('b', 'select 1 from storage.objects where bucket_id = ''snaps'''), 0::bigint,
          'after 24 h no URL can be minted');
do $$ begin perform tests.set_clock(0); end $$;
select is(tests.affected('b', 'update storage.objects set metadata = ''{}'' where bucket_id = ''snaps'''), 0::bigint,
          'b cannot change a''s snap files');

-- flare photos: friend outside the audience gets nothing (PV10) --------------------------------
create temp table t_f as select tests.flare('a', 'group', '00000000-0000-0000-0000-0000000000a1') as id;
grant select on t_f to authenticated;
insert into storage.objects (bucket_id, name) select 'flare-photos', tests.id('a') || '/' || id || x from t_f, unnest(array['.jpg', '_t.jpg']) x;
do $$ begin perform private.attach_flare_photo(tests.id('a'), (select id from t_f)); end $$;
select is(tests.rows_as('w', 'select 1 from storage.objects where bucket_id = ''flare-photos'''), 2::bigint,
          'w (in the audience) can read the flare photo files');
select is(tests.rows_as('e', 'select 1 from storage.objects where bucket_id = ''flare-photos'''), 0::bigint,
          'e (friend outside the audience) cannot mint a URL');

-- moderation bucket: service role only
insert into storage.objects (bucket_id, name) values ('moderation', gen_random_uuid() || '.jpg');
select is(tests.rows_as('a', 'select 1 from storage.objects where bucket_id = ''moderation'''), 0::bigint,
          'no client reads moderation evidence');
select is(tests.rows_as('service', 'select 1 from storage.objects where bucket_id = ''moderation'''), 1::bigint,
          'the service role does');

-- invites -----------------------------------------------------------------------------------
select ok((select code ~ '^[0-9A-HJKMNP-TV-Z]{8}$' from public.invites where inviter_id = tests.id('a')),
          'each user has one Crockford base32 code');
select is(tests.rows_as('b', 'select 1 from public.invites'), 1::bigint, 'b reads only its own invite');
select is(private.invite_preview((select code from public.invites where inviter_id = tests.id('a'))), 'a',
          'invite-preview returns the first name only');
select is(private.invite_preview('ZZZZZZZZ'), null, 'an unknown code previews as nothing');

do $$ begin perform tests.create_user('newbie'); end $$;
select is(private.redeem_invite(tests.id('newbie'), lower((select code from public.invites where inviter_id = tests.id('a'))),
                                false, 'paste')->>'status',
          'friends', 'a new account arriving through the invite is friends at once');
select is(private.redeem_invite(tests.id('c'), (select code from public.invites where inviter_id = tests.id('b')), false, 'deeplink')->>'status',
          'friends', 'c, just created, also counts as new');
update public.profiles set created_at = now() - interval '3 days' where id = tests.id('h');
select is(private.redeem_invite(tests.id('h'), (select code from public.invites where inviter_id = tests.id('b')), false, 'deeplink')->>'status',
          'needs_confirm', 'an existing account gets the confirm card and nothing is written');
select ok(not private.are_friends(tests.id('h'), tests.id('b')), '... no friendship before Add');
select is(private.redeem_invite(tests.id('h'), (select code from public.invites where inviter_id = tests.id('b')), true, 'deeplink')->>'status',
          'friends', 'Add on the confirm card makes the friendship');

-- every bad code answers the same error (AC 9)
select throws_ok(format('select private.redeem_invite(%L, %L, true, null)', tests.id('d'),
                        (select code from public.invites where inviter_id = tests.id('a'))),
                 'CLINV', 'invite_code', 'a blocked person cannot redeem the blocker''s code');
update public.invites set expires_at = now() - interval '1 second' where inviter_id = tests.id('k');
select throws_ok(format('select private.redeem_invite(%L, %L, true, null)', tests.id('g'),
                        (select code from public.invites where inviter_id = tests.id('k'))),
                 'CLINV', 'invite_code', 'an expired code answers invite_code');
update public.invites set uses = 20, expires_at = now() + interval '1 day' where inviter_id = tests.id('k');
select throws_ok(format('select private.redeem_invite(%L, %L, true, null)', tests.id('g'),
                        (select code from public.invites where inviter_id = tests.id('k'))),
                 'CLINV', 'invite_code', 'a code used 20 times answers invite_code');
create temp table t_old as select code from public.invites where inviter_id = tests.id('k');
do $$ begin perform private.ensure_invite(tests.id('k')); end $$;
select ok((select code from public.invites where inviter_id = tests.id('k') and revoked_at is null) <> (select code from t_old)
          and (select revoked_at is not null from public.invites where code = (select code from t_old)),
          'a used-up code is renewed silently and the old one revoked');

select * from finish();
rollback;
