-- usual_drinks policies after 0018 split them per command (one SELECT policy for owner and
-- friends, own_insert, own_update, own_delete). Allow and deny for each (ARCHITECTURE.md 4.3, 9).
begin;
select plan(9);
select tests.seed();
select tests.give_usual('a');
select tests.give_usual('b');

select is(tests.rows_as('a', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))),
          1::bigint, 'the owner reads their own usual');
select is(tests.rows_as('b', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))),
          1::bigint, 'a friend reads it');
select is(tests.rows_as('c', format('select 1 from public.usual_drinks where user_id = %L', tests.id('a'))),
          0::bigint, 'a stranger does not');

select is(tests.affected('a', format($q$update public.usual_drinks set drink_id = 'coffee.latte' where user_id = %L$q$,
                                     tests.id('a'))), 1::bigint, 'the owner updates their usual');
select is(tests.affected('b', format($q$update public.usual_drinks set drink_id = 'coffee.mocha' where user_id = %L$q$,
                                     tests.id('a'))), 0::bigint, 'a friend cannot update it');
select throws_ok(tests.q('a', format($q$update public.usual_drinks set user_id = %L where user_id = %L$q$,
                                     tests.id('b'), tests.id('a'))),
                 '42501', null, 'the owner cannot hand the row to someone else');

select is(tests.affected('b', format('delete from public.usual_drinks where user_id = %L', tests.id('a'))),
          0::bigint, 'a friend cannot delete it');
select is(tests.affected('a', format('delete from public.usual_drinks where user_id = %L', tests.id('a'))),
          1::bigint, 'the owner deletes their usual');
select throws_ok(tests.q('b', format($q$insert into public.usual_drinks (user_id, slot, drink_id, category)
                                         values (%L, 2, 'tea.chai', 'tea')$q$, tests.id('a'))),
                 '42501', null, 'nobody inserts a usual for someone else');

select * from finish();
rollback;
