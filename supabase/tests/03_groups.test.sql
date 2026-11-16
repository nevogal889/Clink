-- groups and group_members: owner only, always (ARCHITECTURE.md 4.3; PRD.md 3.10 AC 1).
begin;
select plan(14);
select tests.seed();

select is(tests.rows_as('a', 'select 1 from public.groups'), 2::bigint, 'a reads own 2 groups');
select is(tests.rows_as('a', 'select 1 from public.group_members'), 2::bigint, 'a reads own group members');
select is(tests.rows_as('w', 'select 1 from public.groups'), 0::bigint, 'w, a member of a''s Work, cannot see the group');
select is(tests.rows_as('w', 'select 1 from public.group_members'), 0::bigint, 'w cannot see its own membership');
select is(tests.rows_as('b', 'select 1 from public.groups'), 0::bigint, 'friend b sees no groups');
select is(tests.rows_as('c', 'select 1 from public.group_members'), 0::bigint, 'stranger c sees no memberships');

-- writes
select lives_ok(tests.q('a', format('insert into public.groups (owner_id, name, emoji) values (%L, %L, %L)',
                                     tests.id('a'), 'Gym', '🏋')), 'a creates a group');
select throws_ok(tests.q('b', format('insert into public.groups (owner_id, name) values (%L, %L)', tests.id('a'), 'Fake')),
                 '42501', null, 'b cannot create a group owned by a');
select is(tests.affected('b', 'update public.groups set name = ''Hacked'''), 0::bigint, 'b cannot rename a''s groups');
select lives_ok(tests.q('a', format('insert into public.group_members (group_id, member_id) values (%L, %L)',
                                     '00000000-0000-0000-0000-0000000000a1', tests.id('b'))),
                'a adds friend b to Work');
select throws_ok(tests.q('a', format('insert into public.group_members (group_id, member_id) values (%L, %L)',
                                      '00000000-0000-0000-0000-0000000000a1', tests.id('c'))),
                 '42501', null, 'a cannot add stranger c to a group');
select throws_ok(tests.q('b', format('insert into public.group_members (group_id, member_id) values (%L, %L)',
                                      '00000000-0000-0000-0000-0000000000a1', tests.id('b'))),
                 '42501', null, 'b cannot add itself to a''s group');

-- max 10 groups
do $$ declare i int; begin
  for i in 4..10 loop insert into public.groups (owner_id, name) values (tests.id('a'), 'G' || i); end loop;
end $$;
select throws_ok(format('insert into public.groups (owner_id, name) values (%L, %L)', tests.id('a'), 'G11'),
                 'CLCAP', 'group_cap', 'an 11th group is refused');

-- Teams later: no org groups in v1
select throws_ok(format('insert into public.groups (owner_id, name, org_id) values (%L, %L, %L)',
                        tests.id('b'), 'Org', gen_random_uuid()),
                 '23514', null, 'org_id must be null in v1');

select * from finish();
rollback;
