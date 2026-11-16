-- snaps, snap_hides, snap_reactions, reports, moderation notices, suspension
-- (ARCHITECTURE.md 4.3, 8.4; PRD.md 3.4, 3.18; QA_PLAN PV1, PV5, PV6, PV16, PV17; RISK_REVIEW.md M-06, S-06).
begin;
select plan(27);
select tests.seed();
create function pg_temp.snap(p_sender text, p_id uuid) returns uuid[] language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values
    ('snaps', tests.id(p_sender) || '/' || p_id || '.jpg'), ('snaps', tests.id(p_sender) || '/' || p_id || '_t.jpg');
  return private.create_snap(tests.id(p_sender), p_id, 'coffee', 'Corner cafe');
end $$;

select is((select array_agg(u.name order by u.name) from unnest(pg_temp.snap('a', '00000000-0000-0000-0000-00000000aa01')) x
           join tests.users u on u.id = x),
          array['b', 'e', 'k', 'w'], 'a snap goes to all friends (not suspended f, not blocked d)');
select throws_ok($$select private.create_snap(tests.id('b'), '00000000-0000-0000-0000-00000000bb01', null, null)$$,
                 'CLBAD', 'bad_input', 'share-snap refuses a snap whose files were not uploaded');

-- visibility
select is(tests.rows_as('b', 'select 1 from public.snaps'), 1::bigint, 'friend b sees a''s snap');
select is(tests.rows_as('c', 'select 1 from public.snaps'), 0::bigint, 'stranger c cannot read a''s snap');
select is(tests.rows_as('d', 'select 1 from public.snaps'), 0::bigint, 'blocked d cannot read a''s snap');
select is(tests.rows_as('g', 'select 1 from public.snaps'), 0::bigint, 'pending requester g cannot read a''s snap');
do $$ begin perform pg_temp.snap('f', '00000000-0000-0000-0000-00000000ff01'); exception when others then null; end $$;
insert into public.snaps (id, sender_id, image_path, thumb_path)
values ('00000000-0000-0000-0000-00000000ff02', tests.id('f'),
        tests.id('f') || '/00000000-0000-0000-0000-00000000ff02.jpg', tests.id('f') || '/00000000-0000-0000-0000-00000000ff02_t.jpg');
select is(tests.rows_as('a', format('select 1 from public.snaps where sender_id = %L', tests.id('f'))), 0::bigint,
          'a suspended friend''s snaps are hidden');
select throws_ok($$select private.create_snap(tests.id('f'), gen_random_uuid(), null, null)$$, 'CLSUS', 'suspended',
                 'a suspended user cannot share');
select throws_ok(tests.q('b', format($q$insert into public.snaps (sender_id, image_path, thumb_path) values (%L, 'x', 'y')$q$, tests.id('b'))),
                 '42501', null, 'clients cannot insert snaps directly');

-- expiry after 24 h
do $$ begin perform tests.set_clock(24 * 3600 + 1); end $$;
select is(tests.rows_as('b', 'select 1 from public.snaps'), 0::bigint, 'the snap is gone for friends after 24 h');
select is(tests.rows_as('a', 'select 1 from public.snaps'), 1::bigint, '... the sender still has the row until cleanup');
do $$ begin perform tests.set_clock(0); end $$;

-- reactions: one per person, the first one notifies once
select is(private.react_snap(tests.id('b'), '00000000-0000-0000-0000-00000000aa01', '❤️'), true, 'the first reaction notifies');
select is(private.react_snap(tests.id('e'), '00000000-0000-0000-0000-00000000aa01', '😂'), false, 'later reactions do not notify');
select is(private.react_snap(tests.id('b'), '00000000-0000-0000-0000-00000000aa01', '☕'), false, 'changing a reaction does not notify');
select is(tests.rows_as('a', 'select 1 from public.snap_reactions'), 2::bigint, 'the sender sees every reaction (one per person)');
select is(tests.rows_as('b', 'select 1 from public.snap_reactions'), 1::bigint, 'b sees only its own reaction');
select throws_ok($$select private.react_snap(tests.id('c'), '00000000-0000-0000-0000-00000000aa01', '❤️')$$,
                 'CLNFD', 'not_found', 'a stranger cannot react');

-- reports: function only, hidden for the reporter, auto-hide at 3 -------------------------------
select throws_ok($$select tests.rows_as('a', 'select 1 from private.reports')$$, '42501', null, 'no client reads reports');
select is(private.file_report(tests.id('b'), 'snap', '00000000-0000-0000-0000-00000000aa01', 'spam', null)->>'object',
          tests.id('a') || '/00000000-0000-0000-0000-00000000aa01.jpg', 'report returns the object to copy as evidence');
select is((select target_user from private.reports limit 1), tests.id('a'), 'target_user is derived from the snap');
select is(tests.rows_as('b', 'select 1 from public.snaps'), 0::bigint, 'the snap is hidden for the reporter at once');
select is(tests.rows_as('e', 'select 1 from public.snaps'), 1::bigint, '... and still visible to others');
do $$ begin
  perform private.file_report(tests.id('e'), 'snap', '00000000-0000-0000-0000-00000000aa01', 'nudity', null);
  perform private.file_report(tests.id('k'), 'snap', '00000000-0000-0000-0000-00000000aa01', 'not_consented', null);
end $$;
select is(tests.rows_as('w', 'select 1 from public.snaps'), 0::bigint, 'at 3 distinct reporters it is hidden for everyone');
select throws_ok($$select private.file_report(tests.id('c'), 'user', tests.id('a'), 'spam', null)$$, 'CLNFD', 'not_found',
                 'a stranger cannot report someone they cannot see');

-- moderation notices: own only, seen_at only
do $$ begin
  perform private.close_report((select id from private.reports where reporter_id = tests.id('b')), 'actioned', 'mod1');
end $$;
select is(tests.rows_as('a', 'select 1 from public.moderation_notices'), 1::bigint, 'the owner sees why the snap was removed');
select is(tests.rows_as('b', 'select 1 from public.moderation_notices'), 0::bigint, 'others never see it');
select throws_ok(tests.q('a', 'update public.moderation_notices set reason = ''spam'''), '42501', null,
                 'only seen_at can be changed');

select * from finish();
rollback;
