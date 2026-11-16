-- profiles, user_settings, user_private, app_config, text filter (ARCHITECTURE.md 4.2, 4.3, 8.4;
-- PRD.md 3.17; RISK_REVIEW.md S-05, S-08).
begin;
select plan(26);
select tests.seed();

-- profiles_read: allow ------------------------------------------------------------
select is(tests.rows_as('a', format('select 1 from public.profiles where id = %L', tests.id('a'))), 1::bigint,
          'a reads own profile');
select is(tests.rows_as('a', format('select 1 from public.profiles where id = %L', tests.id('b'))), 1::bigint,
          'a reads friend b');
select is(tests.rows_as('b', format('select 1 from public.profiles where id = %L', tests.id('a'))), 1::bigint,
          'b reads friend a');
select is(tests.rows_as('a', format('select 1 from public.profiles where id = %L', tests.id('g'))), 1::bigint,
          'a reads g, who sent a pending request');
select is(tests.rows_as('g', format('select 1 from public.profiles where id = %L', tests.id('a'))), 1::bigint,
          'g reads a while its request is pending');
select is(tests.rows_as('h', format('select 1 from public.profiles where id = %L', tests.id('a'))), 1::bigint,
          'h reads a, who sent h a request');

-- profiles_read: deny -------------------------------------------------------------
select is(tests.rows_as('c', 'select 1 from public.profiles'), 1::bigint, 'stranger c reads only own profile');
select is(tests.rows_as('d', format('select 1 from public.profiles where id = %L', tests.id('a'))), 0::bigint,
          'blocked d cannot read a');
select is(tests.rows_as('a', format('select 1 from public.profiles where id = %L', tests.id('d'))), 0::bigint,
          'a cannot read d after blocking');
select is(tests.rows_as('a', format('select 1 from public.profiles where id = %L', tests.id('f'))), 0::bigint,
          'suspended friend f is hidden from a');
select is(tests.rows_as('f', format('select 1 from public.profiles where id = %L', tests.id('f'))), 1::bigint,
          'suspended f still reads own profile');
select is(tests.rows_as('b', format('select 1 from public.profiles where id = %L', tests.id('g'))), 0::bigint,
          'b cannot read g (a''s request counterpart, not b''s)');
select throws_ok($$select tests.rows_as('anon', 'select 1 from public.profiles')$$, '42501', null,
                 'anon has no select privilege on profiles');

-- request expiry ends profile access (S-05)
update public.friend_requests set status = 'expired' where from_id = tests.id('g');
select is(tests.rows_as('g', format('select 1 from public.profiles where id = %L', tests.id('a'))), 0::bigint,
          'g loses access to a once the request expired');

-- writes --------------------------------------------------------------------------
select is(tests.affected('a', format('update public.profiles set display_name = %L where id = %L', 'Ana', tests.id('a'))),
          1::bigint, 'a renames self');
select is(tests.affected('a', format('update public.profiles set display_name = %L where id = %L', 'X', tests.id('b'))),
          0::bigint, 'a cannot rename friend b');
select throws_ok(tests.q('a', format('update public.profiles set avatar_path = %L where id = %L',
                        tests.id('b') || '/1.jpg', tests.id('a'))),
                 '23514', null, 'avatar_path must be inside the owner''s folder');
select throws_ok(tests.q('a', format('insert into public.profiles (id, display_name) values (%L, %L)',
                        gen_random_uuid(), 'New')),
                 '42501', null, 'clients cannot insert profiles');
select throws_ok(tests.q('a', format('delete from public.profiles where id = %L', tests.id('a'))),
                 '42501', null, 'clients cannot delete profiles');

-- text filter on display names
insert into private.blocked_terms (term, kind) values ('badword', 'substring'), ('meanie', 'exact');
select throws_ok(tests.q('a', format('update public.profiles set display_name = %L where id = %L',
                        'B.4.D-w0rd', tests.id('a'))),
                 'CLTXT', 'text_blocked', 'blocked substring is refused through evasions');
select ok(private.check_text('Meanie Bean') = false and private.check_text('meaniest') = true,
          'exact terms match whole words only');

-- user_settings -------------------------------------------------------------------
select is(tests.rows_as('b', 'select 1 from public.user_settings'), 1::bigint, 'b reads only own settings');
select is(tests.affected('a', format('update public.user_settings set share_last_drink = true where user_id = %L', tests.id('b'))),
          0::bigint, 'a cannot change b''s settings');
select throws_ok(tests.q('a', format('update public.user_settings set timezone = %L where user_id = %L',
                        'Asia/Tokyo', tests.id('a'))),
                 '42501', null, 'clients cannot set their own time zone (register-device owns it)');

-- user_private and app_config
select throws_ok($$select tests.rows_as('a', 'select 1 from private.user_private')$$, '42501', null,
                 'no client access to user_private');
select is(tests.run('a', $$(select value->>'age' from public.app_config where key = 'min_age')$$), '16',
          'signed-in users read app_config (min_age 16)');

select * from finish();
rollback;
