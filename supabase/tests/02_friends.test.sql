-- friendships, friend_requests, blocks and their functions (ARCHITECTURE.md 4.2, 4.3, 4.4 friend-request;
-- PRD.md 3.9, 3.18; QA_PLAN L4 "20-friend cap").
begin;
select plan(30);
select tests.seed();

-- friendships: members only ------------------------------------------------------
select is(tests.rows_as('a', 'select 1 from public.friendships'), 5::bigint, 'a sees own 5 friendships (b, e, f, w, k)');
select is(tests.rows_as('b', 'select 1 from public.friendships'), 1::bigint, 'b sees only the friendship with a');
select is(tests.rows_as('c', 'select 1 from public.friendships'), 0::bigint, 'stranger c sees no friendships');
select is(tests.rows_as('d', 'select 1 from public.friendships'), 0::bigint, 'blocked d has no friendship left');
select throws_ok(tests.q('c', format('insert into public.friendships (user_a, user_b) values (%L, %L)',
                                     least(tests.id('a'), tests.id('c')), greatest(tests.id('a'), tests.id('c')))),
                 '42501', null, 'clients cannot insert friendships');
select throws_ok(tests.q('b', format('delete from public.friendships where user_a = %L or user_b = %L', tests.id('b'), tests.id('b'))),
                 '42501', null, 'clients cannot delete friendships directly');

-- friend_requests: both sides, nobody else -------------------------------------------
select is(tests.rows_as('a', 'select 1 from public.friend_requests where status = ''pending'''), 2::bigint,
          'a sees the request from g and the one to h');
select is(tests.rows_as('g', 'select 1 from public.friend_requests'), 1::bigint, 'g sees its own request');
select is(tests.rows_as('b', 'select 1 from public.friend_requests'), 0::bigint, 'b sees no one else''s requests');
select throws_ok(tests.q('c', format('insert into public.friend_requests (from_id, to_id, source) values (%L, %L, %L)',
                                     tests.id('c'), tests.id('a'), 'contacts')),
                 '42501', null, 'clients cannot insert requests');

-- blocks: only the blocker ------------------------------------------------------------
select is(tests.rows_as('a', 'select 1 from public.blocks'), 1::bigint, 'a sees the block a made');
select is(tests.rows_as('d', 'select 1 from public.blocks'), 0::bigint, 'd never sees it was blocked');
select throws_ok(tests.q('d', format('delete from public.blocks where blocker_id = %L', tests.id('a'))),
                 '42501', null, 'clients cannot remove blocks directly');

-- helpers answer only for the caller ----------------------------------------------------
select is(tests.run('c', format('private.are_friends(%L, %L)', tests.id('a'), tests.id('b'))), 'false',
          'are_friends is not an oracle for third parties');
select is(tests.run('b', format('private.are_friends(%L, %L)', tests.id('a'), tests.id('b'))), 'true',
          'are_friends answers for the caller');
select is(tests.run('c', format('private.is_blocked(%L, %L)', tests.id('a'), tests.id('d'))), 'false',
          'is_blocked is not an oracle for third parties');

-- request flow ----------------------------------------------------------------------
select is(private.send_friend_request(tests.id('c'), tests.id('b'), 'contacts'), 'sent', 'c sends b a request');
select is(private.send_friend_request(tests.id('b'), tests.id('c'), 'contacts'), 'friends',
          'mutual requests become one friendship');
select is((select count(*)::int from public.friendships
           where user_a = least(tests.id('b'), tests.id('c')) and user_b = greatest(tests.id('b'), tests.id('c'))),
          1, 'exactly one friendship row');
select is(private.send_friend_request(tests.id('d'), tests.id('a'), 'contacts'), 'sent',
          'a request from blocked d answers sent');
select is((select count(*)::int from public.friend_requests where from_id = tests.id('d')), 0,
          '... and writes nothing, so the block is not revealed');
select throws_ok(format('select private.accept_friend_request(%L, (select id from public.friend_requests where from_id = %L))',
                        tests.id('b'), tests.id('g')),
                 'CLNFD', 'not_found', 'only the recipient can accept a request');

-- 20-friend cap (PRD 3.9 rule 2, AC 1) ---------------------------------------------------
do $$
declare i int;
begin
  for i in 1..15 loop
    perform tests.create_user('cap' || i);
    perform tests.befriend('a', 'cap' || i);
  end loop;
end $$;
select is(private.friend_count(tests.id('a')), 20, 'a is at 20 friends');
select throws_ok(format('select private.accept_friend_request(%L, (select id from public.friend_requests where from_id = %L and status = ''pending''))',
                        tests.id('a'), tests.id('g')),
                 'CLCAP', 'friend_cap', 'accepting a 21st friend is refused');
select throws_ok(format('select private.make_friends(%L, %L)', tests.id('c'), tests.id('a')),
                 'CLCAP', 'friend_cap', 'make_friends refuses the 21st friend from either side');
select is((select status from public.friend_requests where from_id = tests.id('g')), 'pending',
          'the refused request stays pending');

-- remove friend: silent, clears groups -------------------------------------------------
select is(array_length(private.remove_friend(tests.id('a'), tests.id('w')), 1), null, 'remove w (no live flares)');
select is((select count(*)::int from public.group_members where member_id = tests.id('w')), 0,
          'removed friend leaves every group of a');

-- block: removes friendship and group membership both ways --------------------------------
insert into public.groups (id, owner_id, name) values ('00000000-0000-0000-0000-0000000000b1', tests.id('k'), 'Mine');
insert into public.group_members (group_id, member_id) values ('00000000-0000-0000-0000-0000000000b1', tests.id('a'));
do $$ begin perform private.block_user(tests.id('a'), tests.id('k')); end $$;
select is((select count(*)::int from public.group_members m
           where (m.member_id = tests.id('k') and m.group_id in (select id from public.groups where owner_id = tests.id('a')))
              or (m.member_id = tests.id('a') and m.group_id = '00000000-0000-0000-0000-0000000000b1')), 0,
          'block removes group memberships both ways');
do $$ begin perform private.unblock_user(tests.id('a'), tests.id('k')); end $$;
select ok(not exists (select 1 from public.blocks where blocker_id = tests.id('a') and blocked_id = tests.id('k'))
          and not private.are_friends(tests.id('a'), tests.id('k')),
          'unblock removes the block and does not restore the friendship');

select * from finish();
rollback;
