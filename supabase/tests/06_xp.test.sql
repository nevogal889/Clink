-- XP: private ledger, caps, reversals, idempotency (ARCHITECTURE.md 4.5; PRD.md 4.3, 4.6 AC 1 to 9, 11).
begin;
select plan(25);
select tests.seed();
create function pg_temp.xp(p_name text) returns int language sql as $$
  select coalesce((select total from public.xp_totals where user_id = tests.id(p_name)), 0);
$$;
create function pg_temp.log(p_name text, p_id uuid, p_at timestamptz default now()) returns void language sql as $$
  insert into public.drink_logs (id, user_id, drink_name, category, caffeinated, logged_at, local_date, source)
  values (p_id, tests.id(p_name), 'Latte', 'coffee', true, p_at, (p_at at time zone 'UTC')::date, 'app');
$$;

-- Privacy (AC 9) ------------------------------------------------------------------------
do $$ begin perform private.award_xp(tests.id('a'), 'flare_got_joiner', gen_random_uuid(), null); end $$;
select is(tests.rows_as('a', 'select 1 from public.xp_events'), 1::bigint, 'a reads own ledger');
select is(tests.rows_as('b', format('select 1 from public.xp_events where user_id = %L', tests.id('a'))), 0::bigint,
          'friend b never reads a''s XP events');
select is(tests.rows_as('b', format('select 1 from public.xp_totals where user_id = %L', tests.id('a'))), 0::bigint,
          'friend b never reads a''s XP total');
select throws_ok(tests.q('a', format('insert into public.xp_events (user_id, kind, amount, local_date) values (%L, %L, 1000, current_date)',
                                     tests.id('a'), 'daily_log')),
                 '42501', null, 'clients cannot write XP');
select throws_ok(tests.q('a', format('update public.xp_totals set total = 99999 where user_id = %L', tests.id('a'))),
                 '42501', null, 'clients cannot change their total');

-- Sending flares and snaps earns nothing (AC 1) ---------------------------------------------
do $$ declare v uuid; begin
  v := tests.flare('b', 'everyone');
  perform private.close_flare(tests.id('b'), v, 'going');
end $$;
select is(pg_temp.xp('b'), 0, 'a flare with no replies earns its sender nothing');

-- Joining: 3 per day, same friend once per day (AC 4, 5) ----------------------------------------
do $$ declare s text; v uuid; begin
  perform tests.create_user(x) from unnest(array['s1', 's2', 's3', 's4', 'j']) x;
  foreach s in array array['s1', 's2', 's3', 's4'] loop
    perform tests.befriend(s, 'j');
    v := tests.flare(s, 'everyone');
    perform private.respond_flare(tests.id('j'), v, 'in', null, null, 'app');
    perform private.close_flare(tests.id(s), v, 'going');
  end loop;
end $$;
select is(pg_temp.xp('j'), 30, 'joining 4 flares from 4 friends in a day gives +30, not +40');
select is(pg_temp.xp('s1'), 15, 'the sender of a joined flare gets +15');

do $$ declare v uuid; i int; begin
  perform tests.create_user(x) from unnest(array['p', 'q']) x;
  perform tests.befriend('p', 'q');
  for i in 1..2 loop
    v := tests.flare('p', 'everyone');
    perform private.respond_flare(tests.id('q'), v, 'in', null, null, 'app');
    perform private.close_flare(tests.id('p'), v, 'going');
  end loop;
end $$;
select is(pg_temp.xp('q'), 10, 'joining 2 flares from the same friend in a day gives +10 once');

-- Cancelled flares and withdrawn orders earn nothing (AC 6, 7) ------------------------------------
do $$ declare v uuid; begin
  perform tests.create_user(x) from unnest(array['m', 'n']) x;
  perform tests.befriend('m', 'n');
  perform tests.give_usual('n');
  v := tests.flare('m', 'everyone');
  perform private.respond_flare(tests.id('n'), v, 'bring', null, null, 'app');
  perform private.close_flare(tests.id('m'), v, 'cancelled');
end $$;
select is(pg_temp.xp('m') + pg_temp.xp('n'), 0, 'a cancelled flare gives no XP to the sender or the replier');
do $$ declare v uuid; begin
  v := tests.flare('m', 'everyone');
  perform private.respond_flare(tests.id('n'), v, 'bring', null, null, 'app');
  perform private.respond_flare(tests.id('n'), v, 'withdraw', null, null, 'app');
  perform private.close_flare(tests.id('m'), v, 'going');
end $$;
select is(pg_temp.xp('m'), 0, 'a Bring me one withdrawn before close gives no drink-run XP');

-- A drink run at expiry counts (PRD 4.2) ----------------------------------------------------------
do $$ declare v uuid; begin
  perform tests.create_user(x) from unnest(array['r', 't']) x;
  perform tests.befriend('r', 't');
  perform tests.give_usual('t');
  v := tests.flare('r', 'everyone', null, 15);
  perform private.respond_flare(tests.id('t'), v, 'bring', null, null, 'app');
  perform tests.set_clock(16 * 60);
  perform private.expire_due_flares();
  perform tests.set_clock(0);
end $$;
select is(pg_temp.xp('r'), 35, 'an expired flare with an order: +15 got a joiner, +20 drink run');
select is(pg_temp.xp('t'), 10, '... and +10 for the friend who joined');
select is((select count(*)::int from public.flares where sender_id = tests.id('r') and settled_at is not null), 1,
          'settled exactly once');
do $$ begin perform private.settle_flare((select id from public.flares where sender_id = tests.id('r'))); end $$;
select is(pg_temp.xp('r'), 35, 'settling again awards nothing (idempotent, AC 11)');

-- Replays of the same award are no-ops (AC 11) ------------------------------------------------------
select is(private.award_xp(tests.id('t'), 'flare_joined', (select id from public.flares where sender_id = tests.id('r')), tests.id('r')),
          0, 'a replayed award writes nothing');

-- Daily log: +5 once, undo reverses, redo earns nothing more (AC 8, PRD 4.3 rules 7 and 11) -----------
do $$ begin
  perform tests.create_user('l');
  perform pg_temp.log('l', '00000000-0000-0000-0000-0000000000e1');
  perform pg_temp.log('l', '00000000-0000-0000-0000-0000000000e2');
  perform pg_temp.log('l', '00000000-0000-0000-0000-0000000000e3');
end $$;
select is(pg_temp.xp('l'), 5, 'logging 3 drinks gives +5 once');
delete from public.drink_logs where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
select is(pg_temp.xp('l'), 5, 'undoing some logs keeps the +5');
delete from public.drink_logs where id = '00000000-0000-0000-0000-0000000000e3';
select is(pg_temp.xp('l'), 0, 'undoing the day''s last log reverses it');
do $$ begin perform pg_temp.log('l', '00000000-0000-0000-0000-0000000000e4'); end $$;
select is(pg_temp.xp('l'), 0, 'a later log that day earns nothing more');
do $$ begin
  perform tests.create_user('o');
  perform pg_temp.log('o', '00000000-0000-0000-0000-0000000000e5', now() - interval '40 hours');
end $$;
select is(pg_temp.xp('o'), 0, 'a backdated log over 36 hours old earns nothing');

-- Invite XP: once per pair, ever (AC 2) -----------------------------------------------------------------
do $$ begin
  perform tests.create_user(x) from unnest(array['inv', 'newbie']) x;
  perform private.redeem_invite(tests.id('newbie'), (select code from public.invites where inviter_id = tests.id('inv')), false, 'deeplink');
end $$;
select is(pg_temp.xp('inv'), 50, 'an invitee who joins through the invite gives the inviter +50');
do $$ begin
  perform private.remove_friend(tests.id('newbie'), tests.id('inv'));
end $$;
select is(pg_temp.xp('inv'), 0, 'the friendship ending within 7 days reverses the +50');
select is((select count(*)::int from public.xp_events where user_id = tests.id('inv') and kind = 'invite_reversed'), 1,
          '... with one invite_reversed ledger entry');
do $$ begin
  perform private.send_friend_request(tests.id('newbie'), tests.id('inv'), 'contacts');
  perform private.accept_friend_request(tests.id('inv'), (select id from public.friend_requests
                                                          where from_id = tests.id('newbie') and status = 'pending'));
end $$;
select is(pg_temp.xp('inv'), 0, 'removing and re-adding earns nothing more');

select * from finish();
rollback;
