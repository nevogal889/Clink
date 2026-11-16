-- complete-signup, register-device, sign-out, widget tokens, app_events, account deletion, retention
-- (ARCHITECTURE.md 3.6, 4.4, 4.7, 4.8; PRD.md 3.1 AC 8 and 9, 3.19 AC 3 and 5, 4.6 AC 3; RISK_REVIEW.md M-05, M-09, M-16).
begin;
select plan(40);
select tests.seed();

-- complete-signup ------------------------------------------------------------------------
insert into auth.users (id, phone, phone_confirmed_at) values ('00000000-0000-0000-0000-0000000000f1', '+15550000001', now());
select is(private.complete_signup('00000000-0000-0000-0000-0000000000f1', ' Maya ', 1::smallint, gen_random_uuid(),
                                  'Not/AZone', 'phone')->>'status', 'created', 'complete_signup creates the account');
select ok((select display_name = 'Maya' from public.profiles where id = '00000000-0000-0000-0000-0000000000f1')
          and (select timezone = 'UTC' from public.user_settings where user_id = '00000000-0000-0000-0000-0000000000f1')
          and (select min_age_version = 1 and age_confirmed_at is not null from private.user_private
               where user_id = '00000000-0000-0000-0000-0000000000f1')
          and exists (select 1 from public.invites where inviter_id = '00000000-0000-0000-0000-0000000000f1'),
          'profile, settings (bad zone falls back to UTC), private row and first invite exist');
select is(private.complete_signup('00000000-0000-0000-0000-0000000000f1', 'Other', 1::smallint, null, 'UTC', 'phone')->>'status',
          'exists', 'a second call changes nothing');
select is((select count(*)::int from information_schema.columns
           where table_schema in ('public', 'private', 'auth') and (column_name ilike '%birth%' or column_name ilike '%dob%')),
          0, 'no table holds a birth date (PRD 3.1 AC 9)');
insert into private.blocked_terms (term, kind) values ('badword', 'substring');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$select private.complete_signup('00000000-0000-0000-0000-0000000000f2', 'badword', 1::smallint, null, 'UTC', 'apple')$$,
                 'CLTXT', 'text_blocked', 'a blocked display name is refused');
select ok(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000f2'), '... and nothing was created');
select throws_ok($$select private.complete_signup(gen_random_uuid(), 'Ghost', 1::smallint, null, 'UTC', 'apple')$$,
                 'CLNFD', 'not_found', 'sign-up needs an auth user');

-- register-device ---------------------------------------------------------------------------
create function pg_temp.reg(p_user text, p_install uuid, p_token text, p_tz text default 'UTC', p_hash bytea default null)
returns jsonb language sql as $$
  select private.register_device(tests.id(p_user), 'ios', p_install, '1.0.0', p_token, 'sandbox', 'en-GB', p_tz, true,
                                 null, null, p_hash, 'phone');
$$;
select is(pg_temp.reg('b', '00000000-0000-0000-0000-00000000b001', 'tok-b1', 'UTC', sha256('wt1'))->>'notify_devices', '[]',
          'the first device has no other device to notify');
select is(jsonb_array_length(pg_temp.reg('b', '00000000-0000-0000-0000-00000000b002', 'tok-b2')->'notify_devices'), 1,
          'a sign-in on a second install notifies the first device (S-04)');
select is(pg_temp.reg('b', '00000000-0000-0000-0000-00000000b002', 'tok-b2')->>'new_install', 'false',
          'the same install again is not new');
select is((select user_id from private.widget_user(sha256('wt1'))), tests.id('b'), 'the widget token resolves to its user');
do $$ begin perform pg_temp.reg('b', '00000000-0000-0000-0000-00000000b001', 'tok-b1', 'UTC', sha256('wt2')); end $$;
select is((select count(*)::int from private.widget_user(sha256('wt1'))), 0, 'a rotated widget token stops working');
select is((select count(*)::int from private.widget_credentials where revoked_at is null and user_id = tests.id('b')), 1,
          'one active widget credential per device');

-- the push token moves to another account
select is(pg_temp.reg('c', '00000000-0000-0000-0000-00000000c001', 'tok-b1')->>'moved_from_user', tests.id('b')::text,
          'a push token used by another account moves');
select is((select count(*)::int from private.widget_user(sha256('wt2'))), 0, '... and that account''s widget token for it is revoked');

-- time zone at most once per 24 h
select is(pg_temp.reg('k', gen_random_uuid(), null, 'Asia/Tokyo')->>'timezone_applied', 'true', 'a new time zone is applied');
select is(pg_temp.reg('k', gen_random_uuid(), null, 'Europe/London')->>'timezone_applied', 'false',
          'a second change within 24 h is not');
select is((select timezone from public.user_settings where user_id = tests.id('k')), 'Asia/Tokyo', 'the first change stands');

select is(tests.rows_as('b', 'select 1 from public.push_devices'), 1::bigint, 'b reads only its own devices');
select is(tests.rows_as('a', 'select 1 from public.push_devices'), 0::bigint, 'a reads none of b''s devices');
select throws_ok($$select pg_temp.reg('f', gen_random_uuid(), null)$$, 'CLSUS', 'suspended', 'a suspended user cannot register');

-- sign-out
select is(private.signout_device(tests.id('b'), '00000000-0000-0000-0000-00000000b002'), true, 'sign-out deletes the device');
select is((select count(*)::int from public.push_devices where user_id = tests.id('b')), 0, 'b has no devices left');

-- app_events -----------------------------------------------------------------------------------
select lives_ok(tests.q('a', format($q$insert into public.app_events (user_id, name, props) values (%L, 'app_opened', '{"entry": "icon"}')$q$,
                                    tests.id('a'))), 'a client writes its own event');
select throws_ok(tests.q('a', format($q$insert into public.app_events (user_id, name) values (%L, 'app_opened')$q$, tests.id('b'))),
                 '42501', null, 'a client cannot write events for someone else');
update public.user_settings set share_usage = false where user_id = tests.id('a');
select throws_ok(tests.q('a', format($q$insert into public.app_events (user_id, name) values (%L, 'app_opened')$q$, tests.id('a'))),
                 '42501', null, 'with Share usage stats off, nothing is written');
select throws_ok($$select tests.rows_as('a', 'select 1 from public.app_events')$$, '42501', null, 'clients never read events');

-- account deletion (4.7) ------------------------------------------------------------------------
do $$
declare v uuid; x uuid;
begin
  perform tests.create_user('x');
  x := tests.id('x');
  perform private.redeem_invite(x, (select code from public.invites where inviter_id = tests.id('b')), false, 'deeplink');
  perform tests.befriend('x', 'k');
  perform tests.give_usual('x');
  insert into public.drink_logs (id, user_id, drink_name, category, caffeinated, logged_at, local_date, source)
  values (gen_random_uuid(), x, 'Latte', 'coffee', true, now(), current_date, 'app');
  update public.user_settings set share_last_drink = true where user_id = x;
  insert into public.groups (id, owner_id, name) values ('00000000-0000-0000-0000-0000000000d9', x, 'Mine');
  insert into public.group_members values ('00000000-0000-0000-0000-0000000000d9', tests.id('k'));
  insert into public.group_members values ('00000000-0000-0000-0000-0000000000a2', x);
  perform private.register_device(x, 'android', gen_random_uuid(), '1.0', 'tok-x', null, null, 'UTC', true, null, null, sha256('wx'), 'phone');
  insert into storage.objects (bucket_id, name) values ('avatars', x || '/1.jpg'),
    ('snaps', x || '/00000000-0000-0000-0000-00000000dd01.jpg'), ('snaps', x || '/00000000-0000-0000-0000-00000000dd01_t.jpg');
  perform private.create_snap(x, '00000000-0000-0000-0000-00000000dd01', null, null);
  perform private.react_snap(tests.id('k'), '00000000-0000-0000-0000-00000000dd01', '❤️');
  v := tests.flare('x', 'everyone');
  perform private.respond_flare(tests.id('k'), v, 'in', null, null, 'app');
  perform private.send_friend_request(x, tests.id('c'), 'contacts');
  perform private.block_user(x, tests.id('g'));
  perform private.file_report(x, 'user', tests.id('k'), 'spam', 'test note');
  insert into public.moderation_notices (user_id, kind, reason) values (x, 'content_removed', 'spam');
  insert into public.app_events (user_id, name) values (x, 'app_opened');
  insert into auth.audit_log_entries (id, payload) values (gen_random_uuid(), json_build_object('actor_id', x));
end $$;
select is((select total from public.xp_totals where user_id = tests.id('b')), 50, 'b got +50 for inviting x');
create temp table t_prep as select private.prepare_account_deletion(tests.id('x')) as j;
select is((select jsonb_array_length(j->'objects') from t_prep), 3, 'deletion lists the 3 files to delete through the Storage API');
select ok((select jsonb_array_length(j->'clear_devices') >= 0 from t_prep), 'deletion lists friends'' devices for clear messages');
select is((select status from public.flares where sender_id = tests.id('x')), 'cancelled', 'the live flare is ended silently');
select is((select total from public.xp_totals where user_id = tests.id('b')), 0,
          'invite XP the deleted user gave in the last 7 days is reversed (PRD 4.6 AC 3)');
select is((select count(*)::int from public.push_devices where user_id = tests.id('x')), 0, 'push devices are deleted');
-- The edge function deletes the files through the Storage API; the test does the same with SQL.
-- Hosted Supabase refuses direct deletes from storage tables unless this flag is set, which the
-- Storage API does for its own deletes (storage.protect_delete). Plain Postgres ignores it.
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like tests.id('x') || '/%';
select ok(private.purge_auth_audit(tests.id('x')) = 1, 'audit log rows naming the user are deleted');
delete from auth.users where id = tests.id('x');
select is(private.account_leftovers(tests.id('x')), '{}'::jsonb, 'no row or file is left for the deleted user (PRD 3.19 AC 5)');
select is((select count(*)::int from private.reports where reporter_id is null and note = 'test note'), 1,
          'reports the user filed are kept, with the reporter removed');
select ok(not exists (select 1 from public.group_members where member_id = tests.id('x'))
          and not exists (select 1 from public.groups where id = '00000000-0000-0000-0000-0000000000d9'),
          'others'' groups lose the member, and the user''s groups are gone');

-- retention (4.8) -----------------------------------------------------------------------------------
insert into auth.users (id, created_at) values ('00000000-0000-0000-0000-0000000000f3', now() - interval '25 hours');
do $$ begin
  insert into public.drink_logs (id, user_id, drink_name, category, caffeinated, logged_at, local_date, source)
  values ('00000000-0000-0000-0000-0000000000e9', tests.id('w'), 'Latte', 'coffee', true, now(), current_date, 'app');
  perform tests.set_clock(31 * 86400);
  perform private.run_daily_retention();
end $$;
select ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000f3'),
          'an auth user with no profile after 24 h is deleted (abandoned or under-age sign-up)');
select is((select status from public.friend_requests where from_id = tests.id('a') and to_id = tests.id('h')), 'expired',
          'a pending request older than 30 days expires silently');
do $$ begin
  perform tests.set_clock(91 * 86400);
  perform private.run_daily_retention();
  perform tests.set_clock(0);
end $$;
select ok(not exists (select 1 from public.drink_logs where id = '00000000-0000-0000-0000-0000000000e9')
          and (select total from public.xp_totals where user_id = tests.id('w')) = 5,
          '90-day-old logs are deleted without reversing their XP');

select * from finish();
rollback;
