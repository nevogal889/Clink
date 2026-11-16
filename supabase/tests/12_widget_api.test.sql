-- widget-api database half: widget token check and revocation, the device rate limit, widget
-- instances, the idempotent widget log (ARCHITECTURE.md 3.1, 3.5, 3.6, 4.4, 8.3; migration 0019).
begin;
select plan(45);
select tests.seed();

create function pg_temp.reg(p_user text, p_install uuid, p_hash bytea, p_push text default null)
returns uuid language sql as $$
  select (private.register_device(tests.id(p_user), 'android', p_install, '1.0.0', p_push, null, 'en-US',
                                  'Europe/London', false, null, null, p_hash, 'phone')->>'device_id')::uuid;
$$;
create function pg_temp.begin_count(p_hash bytea) returns int language sql as $$
  select count(*)::int from private.widget_begin(p_hash);
$$;

-- widget_begin -------------------------------------------------------------------------------------
do $$ begin perform pg_temp.reg('b', '00000000-0000-0000-0000-00000000b101', sha256('wb1')); end $$;
select is((select user_id from private.widget_begin(sha256('wb1'))), tests.id('b'), 'a fresh token resolves to its user');
select is((select platform from private.widget_begin(sha256('wb1'))), 'android', '... with the device platform');
select is((select token_hash from private.widget_begin(sha256('wb1'))), sha256('wb1'),
          '... and the stored hash for the constant-time compare');
select ok((select last_used_at is not null from private.widget_credentials where token_hash = sha256('wb1')),
          'last_used_at is recorded');
select is(pg_temp.begin_count(sha256('nope')), 0, 'an unknown token resolves to nothing');
select is(pg_temp.begin_count(substring(sha256('wb1') from 1 for 16)), 0, 'a malformed hash resolves to nothing');
select is(pg_temp.begin_count(null), 0, 'no hash resolves to nothing');

do $$ begin perform pg_temp.reg('b', '00000000-0000-0000-0000-00000000b101', sha256('wb2')); end $$;
select is(pg_temp.begin_count(sha256('wb1')), 0, 'a rotated token stops working');
select is(pg_temp.begin_count(sha256('wb2')), 1, '... and the new one works');

-- Rate limit: 120 calls per hour per device (8.3). Counted from here in this hour's window.
delete from private.rate_counters where user_id = tests.id('b');
do $$ begin for i in 1..120 loop perform private.widget_begin(sha256('wb2')); end loop; end $$;
select throws_ok($$select private.widget_begin(sha256('wb2'))$$, 'CLRTL', 'rate_limited', 'the 121st call in an hour is refused');
select ok((select (count = 120) from private.rate_counters
           where user_id = tests.id('b') and bucket like 'widget_api:%'), 'the refused call is not counted');
do $$ begin perform pg_temp.reg('b', '00000000-0000-0000-0000-00000000b102', sha256('wb3')); end $$;
select is(pg_temp.begin_count(sha256('wb3')), 1, 'the limit is per device: another device of the same user still works');
delete from private.rate_counters where user_id = tests.id('b');

-- Same install, another account: the previous account's device and token go ------------------------
do $$ begin perform pg_temp.reg('c', '00000000-0000-0000-0000-00000000b101', sha256('wc1')); end $$;
select is(pg_temp.begin_count(sha256('wb2')), 0, 'another account on the same install revokes the old token (no push token)');
select is((select count(*)::int from public.push_devices
           where install_id = '00000000-0000-0000-0000-00000000b101' and user_id = tests.id('b')), 0,
          '... and the old device row is gone');
select is((select user_id from private.widget_begin(sha256('wc1'))), tests.id('c'), '... and the new account''s token works');
select is(pg_temp.begin_count(sha256('wb3')), 1, 'the old account''s other install is untouched');
do $$ begin perform pg_temp.reg('c', '00000000-0000-0000-0000-00000000b101', sha256('wc2')); end $$;
select is((select count(*)::int from public.push_devices where install_id = '00000000-0000-0000-0000-00000000b101'), 1,
          'the same account registering again keeps its one row');

-- Suspension revokes; lifting does not restore ---------------------------------------------------
do $$ begin perform private.suspend_user(tests.id('c'), 'spam', 'test'); end $$;
select is((select count(*)::int from private.widget_credentials where user_id = tests.id('c') and revoked_at is null), 0,
          'a suspension revokes every widget token of the account');
select is(pg_temp.begin_count(sha256('wc2')), 0, '... so the token resolves to nothing');
do $$ begin perform private.lift_suspension(tests.id('c'), 'test'); end $$;
select is(pg_temp.begin_count(sha256('wc2')), 0, 'lifting the suspension does not bring the token back');
-- A credential that exists while suspended (never made by register_device, which refuses) is refused.
do $$ begin perform private.suspend_user(tests.id('c'), 'spam', 'test'); end $$;
insert into private.widget_credentials (user_id, device_id, token_hash)
select tests.id('c'), d.id, sha256('wc3') from public.push_devices d where d.user_id = tests.id('c') limit 1;
select throws_ok($$select private.widget_begin(sha256('wc3'))$$, 'CLSUS', 'suspended', 'a suspended account is refused');

-- Sign-out and account deletion -------------------------------------------------------------------
do $$ begin perform pg_temp.reg('e', '00000000-0000-0000-0000-00000000e101', sha256('we1')); end $$;
do $$ begin perform private.signout_device(tests.id('e'), '00000000-0000-0000-0000-00000000e101'); end $$;
select is(pg_temp.begin_count(sha256('we1')), 0, 'sign-out revokes the token');
do $$ begin perform pg_temp.reg('e', '00000000-0000-0000-0000-00000000e102', sha256('we2')); end $$;
do $$ begin perform private.prepare_account_deletion(tests.id('e')); end $$;
select is(pg_temp.begin_count(sha256('we2')), 0, 'account deletion revokes the token');

-- widget_record_instance --------------------------------------------------------------------------
create temp table dev as select pg_temp.reg('k', '00000000-0000-0000-0000-00000000c101', sha256('wk1')) as id;
select is(private.widget_record_instance(tests.id('k'), (select id from dev), '17', 'medium', 'group'), true,
          'a new widget instance is recorded');
select is(private.widget_record_instance(tests.id('k'), (select id from dev), '17', 'small', null), false,
          'the same instance again is not');
select is((select count(*)::int from public.app_events where user_id = tests.id('k') and name = 'widget_added'), 1,
          'widget_added is written once per instance');
select is((select props from public.app_events where user_id = tests.id('k') and name = 'widget_added'),
          '{"size": "medium", "audience_type": "group"}'::jsonb, '... with its size and audience type');
do $$ begin perform private.widget_record_instance(tests.id('k'), (select id from dev), '18', 'small', 'auto'); end $$;
select is((select props->'audience_type' from public.app_events
           where user_id = tests.id('k') and name = 'widget_added' order by id desc limit 1), 'null'::jsonb,
          'a small widget has no audience type');
select throws_ok($$select private.widget_record_instance(tests.id('a'), (select id from dev), '19', 'small', null)$$,
                 'CLNFD', 'not_found', 'another user''s device is refused');
select throws_ok($$select private.widget_record_instance(tests.id('k'), (select id from dev), '19', 'large', null)$$,
                 'CLBAD', 'bad_input', 'an unknown size is refused');
do $$ begin for i in 20..37 loop perform private.widget_record_instance(tests.id('k'), (select id from dev), i::text, 'small', null); end loop; end $$;
select is(private.widget_record_instance(tests.id('k'), (select id from dev), '99', 'small', null), false,
          'at most 20 instances per device are recorded');
update public.user_settings set share_usage = false where user_id = tests.id('k');
delete from private.widget_instances where device_id = (select id from dev) and instance_key = '17';
select is(private.widget_record_instance(tests.id('k'), (select id from dev), '17', 'medium', 'auto'), true,
          'with usage stats off the instance is still recorded');
select is((select count(*)::int from public.app_events where user_id = tests.id('k') and name = 'widget_added'), 20,
          '... but no event is written');

-- widget_log_drink --------------------------------------------------------------------------------
select is(private.widget_log_drink(tests.id('a'), '00000000-0000-0000-0000-0000000d0001', 'coffee.flat_white', 'Flat White',
                                   'coffee', true, now() - interval '1 minute', current_date), 'logged', 'a widget log is written');
select is((select source from public.drink_logs where id = '00000000-0000-0000-0000-0000000d0001'), 'widget',
          '... with source widget');
select is(private.widget_log_drink(tests.id('a'), '00000000-0000-0000-0000-0000000d0001', 'coffee.flat_white', 'Flat White',
                                   'coffee', true, now() - interval '1 minute', current_date), 'duplicate',
          'the same id again is a duplicate');
select is((select count(*)::int from public.drink_logs where user_id = tests.id('a')), 1, '... and writes nothing');
select is((select count(*)::int from public.xp_events where user_id = tests.id('a') and kind = 'daily_log'), 1,
          'the first log of the day earns daily_log XP through the drink_logs trigger');
select throws_ok($$select private.widget_log_drink(tests.id('b'), '00000000-0000-0000-0000-0000000d0001', 'water.still', 'Water',
                                                   'water', false, now(), current_date)$$,
                 'CLCON', 'conflict', 'an id that belongs to another account is refused');
select throws_ok($$select private.widget_log_drink(tests.id('a'), gen_random_uuid(), 'water.still', 'Water', 'water', false,
                                                   now() - interval '91 days', current_date - 91)$$,
                 'CLOLD', 'too_old', 'a log older than the 90-day history is refused');
select throws_ok($$select private.widget_log_drink(tests.id('a'), gen_random_uuid(), 'water.still', 'Water', 'water', false,
                                                   now() + interval '1 hour', current_date)$$,
                 'CLBAD', 'bad_input', 'a log in the future is refused');
select throws_ok($$select private.widget_log_drink(tests.id('f'), gen_random_uuid(), 'water.still', 'Water', 'water', false,
                                                   now(), current_date)$$,
                 'CLSUS', 'suspended', 'a suspended user cannot log');

-- Deny: no client reaches any of it ------------------------------------------------------------------
select throws_ok(tests.qrun('a', $$(select count(*) from private.widget_begin(sha256('wk1')))$$), '42501', null,
                 'authenticated cannot call widget_begin');
select throws_ok(tests.qrun('a', $$private.widget_log_drink(auth.uid(), gen_random_uuid(), 'water.still', 'Water', 'water', false, now(), current_date)$$),
                 '42501', null, 'authenticated cannot call widget_log_drink');
select throws_ok(tests.q('a', 'select * from private.widget_instances'), '42501', null,
                 'authenticated cannot read widget instances');

select * from finish();
rollback;
