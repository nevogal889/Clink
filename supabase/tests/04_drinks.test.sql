-- usual_drinks, drink_logs, last_drink_shares (ARCHITECTURE.md 4.3; PRD.md 3.7, 3.11 AC 5 and 6;
-- QA_PLAN PV13, PV14; RISK_REVIEW.md S-07).
begin;
select plan(29);
select tests.seed();

-- usual drinks --------------------------------------------------------------------
select lives_ok(tests.q('a', format($q$insert into public.usual_drinks (user_id, slot, drink_id, category, details)
                                        values (%L, 1, 'coffee.cortado', 'coffee', '{"milk": "Oat milk", "note": "very hot"}')$q$,
                                     tests.id('a'))), 'a saves usual #1 with details');
select throws_ok(tests.q('a', format($q$insert into public.usual_drinks (user_id, slot, drink_id, category)
                                         values (%L, 2, 'water.still', 'water')$q$, tests.id('a'))),
                 '23514', null, 'water never takes a usual slot');
select throws_ok(tests.q('a', format($q$insert into public.usual_drinks (user_id, slot, custom_name, category, details)
                                         values (%L, 2, 'Mine', 'tea', jsonb_build_object('note', repeat('x', 121)))$q$, tests.id('a'))),
                 '23514', null, 'note over 120 characters is refused');
select throws_ok(tests.q('a', format($q$insert into public.usual_drinks (user_id, slot, custom_name, category, details)
                                         values (%L, 2, 'Mine', 'tea', '{"hack": 1}')$q$, tests.id('a'))),
                 '23514', null, 'unknown details keys are refused');
insert into private.blocked_terms (term, kind) values ('badword', 'substring');
select throws_ok(tests.q('a', format($q$insert into public.usual_drinks (user_id, slot, custom_name, category, details)
                                         values (%L, 2, 'Tea', 'tea', '{"planB": "a badword"}')$q$, tests.id('a'))),
                 'CLTXT', 'text_blocked', 'blocked words in Plan B are refused');
select throws_ok(tests.q('b', format($q$insert into public.usual_drinks (user_id, slot, custom_name, category)
                                         values (%L, 3, 'Fake', 'tea')$q$, tests.id('a'))),
                 '42501', null, 'b cannot write a''s usual 3');

select is(tests.rows_as('b', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))), 1::bigint,
          'friend b reads a''s usual 3 (surprise drinks)');
select is(tests.run('b', format($q$(select details->>'note' from public.usual_drinks where user_id = %L)$q$, tests.id('a'))),
          'very hot', '... with full details');
select is(tests.rows_as('c', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))), 0::bigint,
          'stranger c cannot read a''s order details');
select is(tests.rows_as('d', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))), 0::bigint,
          'blocked d cannot read a''s order details');
select is(tests.rows_as('g', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))), 0::bigint,
          'pending requester g cannot read a''s order details');
insert into public.usual_drinks (user_id, slot, drink_id, category) values (tests.id('f'), 1, 'tea.chai', 'tea');
select is(tests.rows_as('a', format('select 1 from public.usual_drinks where user_id = %L', tests.id('f'))), 0::bigint,
          'a suspended friend''s usual 3 is hidden');

-- drink logs: owner only ------------------------------------------------------------
select lives_ok(tests.q('a', format($q$insert into public.drink_logs (id, user_id, drink_id, drink_name, category, caffeinated,
                                         logged_at, local_date, source)
                                       values (gen_random_uuid(), %L, 'coffee.latte', 'Latte', 'coffee', true,
                                               now() - interval '2 hours', current_date, 'app'),
                                              (gen_random_uuid(), %L, 'water.still', 'Water', 'water', false,
                                               now() - interval '1 hour', current_date, 'widget')$q$,
                                     tests.id('a'), tests.id('a'))),
                'a logs a latte and a water');
select is(tests.rows_as('a', 'select 1 from public.drink_logs'), 2::bigint, 'a reads own logs');
select is(tests.rows_as('b', format('select 1 from public.drink_logs where user_id = %L', tests.id('a'))), 0::bigint,
          'friend b never reads a''s logs (counts and water are private)');
select throws_ok(tests.q('b', format($q$insert into public.drink_logs (id, user_id, drink_name, category, caffeinated,
                                          logged_at, local_date, source)
                                        values (gen_random_uuid(), %L, 'Latte', 'coffee', true, now(), current_date, 'app')$q$,
                                      tests.id('a'))),
                 '42501', null, 'b cannot log for a');
-- The server owns time (0020): a future time is clamped to now, never refused. More in 13_log_time.
select lives_ok(tests.q('h', format($q$insert into public.drink_logs (id, user_id, drink_name, category, caffeinated,
                                         logged_at, local_date, source)
                                       values (gen_random_uuid(), %L, 'Latte', 'coffee', true, now() + interval '1 hour',
                                               current_date, 'app')$q$, tests.id('h'))),
                'a log in the future is accepted (its time is clamped)');

-- last drink sharing (F26) --------------------------------------------------------------
select is(tests.rows_as('b', format('select 1 from public.last_drink_shares where user_id = %L', tests.id('a'))), 0::bigint,
          'sharing off: friend sees no last-drink time');
select is((select count(*)::int from public.last_drink_shares where user_id = tests.id('a')), 0,
          'sharing off: no row exists at all');
select is(tests.affected('a', format('update public.user_settings set share_last_drink = true where user_id = %L', tests.id('a'))),
          1::bigint, 'a turns sharing on');
select ok(tests.run('b', format('(select last_drink_at from public.last_drink_shares where user_id = %L)', tests.id('a')))::timestamptz
          < now() - interval '119 minutes', 'friend sees the latte time, not the later water');
select is(tests.rows_as('c', 'select 1 from public.last_drink_shares'), 0::bigint, 'stranger c sees no last-drink time');
select is(tests.rows_as('d', 'select 1 from public.last_drink_shares'), 0::bigint, 'blocked d sees no last-drink time');

-- undo the latest drink: the one before shows
insert into public.drink_logs (id, user_id, drink_name, category, caffeinated, logged_at, local_date, source)
values ('00000000-0000-0000-0000-00000000d001', tests.id('a'), 'Mocha', 'coffee', true, now() - interval '10 minutes',
        current_date, 'app');
select ok(tests.run('b', format('(select last_drink_at from public.last_drink_shares where user_id = %L)', tests.id('a')))::timestamptz
          > now() - interval '11 minutes', 'a new drink updates the shared time');
select is(tests.affected('a', $q$delete from public.drink_logs where id = '00000000-0000-0000-0000-00000000d001'$q$), 1::bigint,
          'a undoes the mocha');
select ok(tests.run('b', format('(select last_drink_at from public.last_drink_shares where user_id = %L)', tests.id('a')))::timestamptz
          < now() - interval '119 minutes', 'after undo, the time of the drink before shows');

-- more than 24 h ago: hidden
do $$ begin perform tests.set_clock(26 * 3600); end $$;
select is(tests.rows_as('b', format('select 1 from public.last_drink_shares where user_id = %L', tests.id('a'))), 0::bigint,
          'last drink over 24 h ago is not returned');
do $$ begin perform tests.set_clock(0); end $$;

-- off again: gone at once
select is(tests.affected('a', format('update public.user_settings set share_last_drink = false where user_id = %L', tests.id('a'))),
          1::bigint, 'a turns sharing off');
select is((select count(*)::int from public.last_drink_shares where user_id = tests.id('a')), 0,
          'turning sharing off deletes the shared time at once');

select * from finish();
rollback;
