-- The server owns a log's time (ARCHITECTURE.md 3.2 "Log time", migration 0020): a well-formed log
-- is never refused for its logged_at. Later than server now: now. Older than the 90-day tracker
-- window: the window's oldest edge. Anything else: as sent. Widget and app writes alike.
begin;
select plan(28);

do $$ begin
  perform tests.create_user('lt_w', true, 'Europe/London');   -- widget logger
  perform tests.create_user('lt_t', true, 'Asia/Tokyo');      -- saved zone used as the fallback
  perform tests.create_user('lt_a', true, 'America/New_York'); -- app logger
end $$;

create function pg_temp.wlog(p_user text, p_id uuid, p_at timestamptz, p_tz text)
returns text language sql as $$
  select private.widget_log_drink(tests.id(p_user), p_id, 'coffee.latte', 'Latte', 'coffee', true, p_at, p_tz);
$$;
create function pg_temp.at(p_id uuid) returns timestamptz language sql as $$
  select l.logged_at from public.drink_logs l where l.id = p_id;
$$;
create function pg_temp.day(p_id uuid) returns date language sql as $$
  select l.local_date from public.drink_logs l where l.id = p_id;
$$;

-- The rule ---------------------------------------------------------------------------------------
select is(private.log_time(now() + interval '2 hours'), private.app_now(), 'later than now becomes now');
select is(private.log_time(now() - interval '3 days'), now() - interval '3 days', 'inside the window is kept');
select is(private.log_time(now() - interval '200 days'), private.app_now() - interval '90 days',
          'older than the window becomes its oldest edge');
select is(private.log_time(null), null, 'null stays null (the not-null checks refuse it)');

-- Widget: phone clock 2 h fast ---------------------------------------------------------------------
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e001', now() + interval '2 hours', 'Europe/London'),
          'logged', 'a widget log 2 h in the future is logged, not refused');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e001'), private.app_now(), '... at server now');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e001'), (private.app_now() at time zone 'Europe/London')::date,
          '... on today''s date in the device zone');
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e001', now() + interval '2 hours', 'Europe/London'),
          'duplicate', 'its retry is a duplicate: the device id keeps it idempotent');
select is((select count(*)::int from public.xp_events e where e.user_id = tests.id('lt_w') and e.kind = 'daily_log'), 1,
          'a clamped log still earns the day''s daily_log');

-- Widget: 3 days offline ----------------------------------------------------------------------------
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e002', now() - interval '3 days', 'Pacific/Auckland'),
          'logged', 'a log replayed after 3 days offline is logged');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e002'), now() - interval '3 days', '... with its own time');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e002'),
          ((now() - interval '3 days') at time zone 'Pacific/Auckland')::date, '... on its own day in the device zone');

-- Widget: beyond the window -------------------------------------------------------------------------
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e003', now() - interval '120 days', 'Europe/London'),
          'logged', 'a log older than 90 days is logged, not refused');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e003'), private.app_now() - interval '90 days',
          '... at the oldest time the window keeps');
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e004', '2099-01-01T00:00:00Z', 'Europe/London'),
          'logged', 'a log in 2099 is logged');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e004'), private.app_now(), '... at server now');

-- Widget: the zone ----------------------------------------------------------------------------------
select is(pg_temp.wlog('lt_t', '00000000-0000-0000-0000-00000000e005', now(), 'Mars/Olympus_Mons'), 'logged',
          'a zone Postgres doesn''t know is not a refusal');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e005'), (now() at time zone 'Asia/Tokyo')::date,
          '... the local date follows the saved zone');
select is(pg_temp.wlog('lt_t', '00000000-0000-0000-0000-00000000e006', now(), null), 'logged', 'no zone');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e006'), (now() at time zone 'Asia/Tokyo')::date,
          '... the saved zone again');

-- Server time is private.app_now(), not the database clock ------------------------------------------
select tests.set_clock(-86400);
select is(pg_temp.wlog('lt_w', '00000000-0000-0000-0000-00000000e007', now(), 'UTC'), 'logged',
          'with the server clock a day behind, a log at the database clock''s now');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e007'), now() - interval '1 day', '... is clamped to app_now()');
select tests.set_clock(0);

-- App writes (RLS insert) go through the same rule --------------------------------------------------
select lives_ok(tests.q('lt_a', format($q$insert into public.drink_logs (id, user_id, drink_name, category, caffeinated,
                                            logged_at, local_date, source)
                                          values ('00000000-0000-0000-0000-00000000e101', %L, 'Latte', 'coffee', true,
                                                  now() + interval '3 days', current_date + 3, 'app')$q$,
                                        tests.id('lt_a'))),
                'an app log 3 days in the future is accepted');
select is(pg_temp.at('00000000-0000-0000-0000-00000000e101'), private.app_now(), '... at server now');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e101'), (private.app_now() at time zone 'America/New_York')::date,
          '... on today in the saved zone, since the device''s date was for the wrong time');
select lives_ok(tests.q('lt_a', format($q$insert into public.drink_logs (id, user_id, drink_name, category, caffeinated,
                                            logged_at, local_date, source)
                                          values ('00000000-0000-0000-0000-00000000e102', %L, 'Water', 'water', false,
                                                  now() - interval '2 days', current_date - 2, 'app')$q$,
                                        tests.id('lt_a'))),
                'an app log 2 days old is accepted');
select is(pg_temp.day('00000000-0000-0000-0000-00000000e102'), current_date - 2, '... keeping the device''s date');

-- Deny ----------------------------------------------------------------------------------------------
select throws_ok(tests.qrun('lt_a', $$private.log_time(now())$$), '42501', null, 'authenticated cannot call log_time');

select * from finish();
rollback;
