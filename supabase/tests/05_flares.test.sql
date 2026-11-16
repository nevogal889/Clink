-- flares, flare_audience, flare_recipients, flare_responses, flare_photos, flare_view, incoming_flares
-- (ARCHITECTURE.md 4.3, 4.4, 4.6; PRD.md 3.5, 3.6, 3.10; QA_PLAN PV8 to PV12, PV15, 6.3 T22 to T32;
-- RISK_REVIEW.md M-02, M-03).
begin;
select plan(56);
select tests.seed();
select tests.give_usual(n, 'iced today please') from unnest(array['b', 'e', 'w', 'k']) n;

-- A flare to Work reaches w only -----------------------------------------------------
create temp table t_ids (name text primary key, id uuid);
grant select on t_ids to authenticated;
insert into t_ids values ('work', tests.flare('a', 'group', '00000000-0000-0000-0000-0000000000a1'));

select is(tests.rows_as('w', 'select 1 from public.flares'), 1::bigint, 'w (in Work) sees a''s Work flare');
select is(tests.rows_as('b', 'select 1 from public.flares'), 0::bigint, 'b (friend, not in Work) gets no flares row');
select is(tests.rows_as('b', 'select 1 from public.flare_recipients'), 0::bigint, 'b gets no flare_recipients row');
select is(tests.rows_as('c', 'select 1 from public.flares'), 0::bigint, 'stranger c sees no flares');
select is(tests.rows_as('d', 'select 1 from public.flares'), 0::bigint, 'blocked d sees no flares');
select is(tests.rows_as('a', 'select 1 from public.flares'), 1::bigint, 'the sender sees own flare');

-- Recipients never learn the group (PV9)
select is(tests.rows_as('w', 'select 1 from public.flare_audience'), 0::bigint, 'w cannot read flare_audience');
select is(tests.run('a', '(select audience from public.flare_audience limit 1)'), 'group', 'the sender reads the audience');
select is(tests.rows_as('w', 'select 1 from public.flare_recipients'), 1::bigint, 'w reads only its own recipient row');
select is(tests.rows_as('a', 'select 1 from public.flare_recipients'), 0::bigint,
          'the sender does not read the recipient list (nobody is shown as seen or declined)');
select is(tests.rows_as('w', 'select 1 from public.incoming_flares()'), 1::bigint, 'incoming_flares() lists it for w');
select is(tests.rows_as('b', 'select 1 from public.incoming_flares()'), 0::bigint, 'incoming_flares() lists nothing for b');
select ok(not exists (select 1 from pg_proc p, unnest(p.proargnames) a(n)
                      where p.proname = 'incoming_flares' and a.n ilike '%group%' or (p.proname = 'incoming_flares' and a.n ilike '%audience%')),
          'incoming_flares() returns no group or audience field');
select ok(tests.run('w', format('public.flare_view(%L)', (select id from t_ids where name = 'work')))::jsonb ?& array['id', 'in', 'others_in']
          and not tests.run('w', format('public.flare_view(%L)', (select id from t_ids where name = 'work'))) ilike '%group%',
          'flare_view for w has no group field');
select is(tests.run('b', format('public.flare_view(%L)', (select id from t_ids where name = 'work'))), null,
          'flare_view returns nothing to b');
select throws_ok(tests.qrun('anon', format('public.flare_view(%L)', (select id from t_ids where name = 'work'))),
                 '42501', null, 'anon cannot call flare_view');

-- One live flare per sender; timing rules ------------------------------------------------
select throws_ok($$select tests.flare('a', 'everyone')$$, 'CLLIV', 'live_flare_exists', 'a second live flare is refused');
select throws_ok(format($$select private.create_flare(%L, 'coffee', null, 'Latte', null, 15, now(), 'everyone', null,
                                 'UTC', 'widget', true)$$, tests.id('a')),
                 'CLLIV', 'live_flare_exists', 'the widget cannot replace a live flare');
select throws_ok($$select tests.flare('b', 'everyone', null, 7)$$, 'CLBAD', 'bad_input', 'timing must be in 5-minute steps');
select throws_ok($$select tests.flare('b', 'everyone', null, 65)$$, 'CLBAD', 'bad_input', 'timing over 60 minutes is refused');
select ok((select expires_at - created_at from public.flares where id = (select id from t_ids where name = 'work'))
          = interval '15 minutes', 'a 15-minute flare stays open until meet time');
insert into t_ids values ('now', tests.flare('b', 'everyone', null, 0));
select ok((select expires_at - created_at = interval '15 minutes' and meet_at = created_at
           from public.flares where id = (select id from t_ids where name = 'now')),
          'a Now flare stays open the 15-minute minimum');
select throws_ok(format($$select private.create_flare(%L, 'water', null, 'Water', null, 0, now(), 'everyone', null, 'UTC', 'app', false)$$,
                        tests.id('e')),
                 '23514', null, 'water is never a flare type');

-- Replace from the app: the old flare ends as replaced -------------------------------------
select is(private.respond_flare(tests.id('w'), (select id from t_ids where name = 'work'), 'bring', 1::smallint,
                                'iced today', 'app')->>'kind', 'bring', 'w answers Bring me one with a one-time note');
select is(tests.rows_as('a', 'select 1 from public.flare_responses where one_time_note is not null'), 1::bigint,
          'the sender reads the order and the one-time note');
select is(tests.rows_as('w', 'select 1 from public.flare_responses'), 1::bigint, 'w reads its own response');
select is(tests.rows_as('b', 'select 1 from public.flare_responses'), 0::bigint, 'b reads no responses');
select throws_ok(format($$select private.respond_flare(%L, %L, 'in', null, null, 'app')$$, tests.id('b'),
                        (select id from t_ids where name = 'work')),
                 'CLEND', 'flare_ended', 'b, not a recipient, cannot respond (answers flare_ended)');

insert into t_ids values ('everyone', (private.create_flare(tests.id('a'), 'matcha', 'matcha.latte', 'Matcha Latte', null, 30,
                                       now(), 'everyone', null, 'UTC', 'app', true)->>'flare_id')::uuid);
select is((select status from public.flares where id = (select id from t_ids where name = 'work')), 'replaced',
          'replace ends the old flare as replaced');
select is((select array_agg(u.name order by u.name) from public.flare_recipients r join tests.users u on u.id = r.recipient_id
           where r.flare_id = (select id from t_ids where name = 'everyone')),
          array['b', 'e', 'k', 'w'], 'Everyone = current friends, minus blocked d and suspended f');

-- Co-responders see names only of their own friends ("2 others are in", PV11) ------------------
do $$ begin
  perform private.respond_flare(tests.id('b'), (select id from t_ids where name = 'everyone'), 'in', null, null, 'widget');
  perform private.respond_flare(tests.id('e'), (select id from t_ids where name = 'everyone'), 'bring', null, null, 'widget');
  perform private.respond_flare(tests.id('w'), (select id from t_ids where name = 'everyone'), 'in', null, null, 'notification');
end $$;
do $$ begin perform tests.befriend('b', 'w'); end $$;
select is(tests.run('b', format($q$(public.flare_view(%L)->>'others_in')$q$, (select id from t_ids where name = 'everyone'))), '1',
          'b sees 1 other (e, not b''s friend) as a count');
select is(tests.run('b', format($q$(public.flare_view(%L)->'in'->0->>'user_id')$q$, (select id from t_ids where name = 'everyone'))),
          tests.id('w')::text, 'b sees friend w by name');
select is(tests.run('a', format($q$(jsonb_array_length(public.flare_view(%L)->'in'))$q$, (select id from t_ids where name = 'everyone'))),
          '3', 'the sender sees every responder by name');
select is(tests.run('e', format($q$(select drink->>'drinkId' from public.flare_responses where user_id = %L)$q$, tests.id('e'))),
          'coffee.flat_white', 'Bring me one copies the saved order');
select is((select one_time_note from public.flare_responses r
           where r.user_id = tests.id('e') and r.flare_id = (select id from t_ids where name = 'everyone')), null,
          'a one-time note is never taken from the widget');

-- Withdraw: the sender just sees one fewer --------------------------------------------------
select is(private.respond_flare(tests.id('w'), (select id from t_ids where name = 'everyone'), 'withdraw', null, null, 'app')->>'withdrew',
          'true', 'w withdraws');
select is(tests.run('a', format($q$(jsonb_array_length(public.flare_view(%L)->'in'))$q$, (select id from t_ids where name = 'everyone'))),
          '2', 'the sender sees one fewer');

-- Block during a live flare: e loses everything at once (M-03) --------------------------------
do $$ begin perform private.block_user(tests.id('a'), tests.id('e')); end $$;
select is(tests.rows_as('e', 'select 1 from public.flares'), 0::bigint, 'after a blocks e, e gets no flares row');
select is(tests.run('e', format('public.flare_view(%L)', (select id from t_ids where name = 'everyone'))), null,
          'after the block, flare_view returns nothing to e');
select is(tests.rows_as('e', 'select 1 from public.flare_responses'), 0::bigint, 'e''s response on a''s live flare is gone');
select throws_ok(format($$select private.respond_flare(%L, %L, 'in', null, null, 'app')$$, tests.id('e'),
                        (select id from t_ids where name = 'everyone')),
                 'CLEND', 'flare_ended', 'e can no longer respond');

-- Flare photo: recipients only (M-02, PV10) -----------------------------------------------------
insert into storage.objects (bucket_id, name) values
  ('flare-photos', tests.id('a') || '/' || (select id from t_ids where name = 'everyone') || '.jpg'),
  ('flare-photos', tests.id('a') || '/' || (select id from t_ids where name = 'everyone') || '_t.jpg');
select lives_ok(format('select private.attach_flare_photo(%L, %L)', tests.id('a'), (select id from t_ids where name = 'everyone')),
                'the sender attaches the uploaded photo');
select is(tests.rows_as('k', 'select 1 from public.flare_photos'), 1::bigint, 'recipient k sees the flare photo');
select is(tests.rows_as('c', 'select 1 from public.flare_photos'), 0::bigint, 'stranger c gets no flare photo');
select is(tests.rows_as('e', 'select 1 from public.flare_photos'), 0::bigint, 'blocked e gets no flare photo');

-- Close, then the 2-hour window (M-03) -------------------------------------------------------------
select is(array_length(private.close_flare(tests.id('a'), (select id from t_ids where name = 'everyone'), 'going'), 1), 1,
          'close as going returns the one standing replier (b)');
select is(tests.rows_as('k', 'select 1 from public.flares'), 1::bigint, 'k still sees the ended flare within 2 h');
do $$ begin perform tests.set_clock(2 * 3600 + 60); end $$;
select is(tests.rows_as('k', 'select 1 from public.flares'), 0::bigint, 'k no longer sees it 2 h after close');
select is(tests.rows_as('k', 'select 1 from public.flare_photos'), 0::bigint, 'nor its photo');
do $$ begin perform tests.set_clock(0); end $$;

-- Automatic audience (4.6, QA_PLAN 6.3) ----------------------------------------------------------
create function pg_temp.auto(p_sender text, p_at timestamptz, p_tz text default 'UTC') returns text language sql as $$
  select coalesce((select g.name from public.groups g
                   where g.id = (private.resolve_audience(tests.id(p_sender), 'auto', null, p_tz, p_at)).group_id),
                  'Everyone');
$$;
select is(pg_temp.auto('a', '2026-11-16 07:59Z') || ',' || pg_temp.auto('a', '2026-11-16 08:00Z') || ',' ||
          pg_temp.auto('a', '2026-11-20 17:59Z') || ',' || pg_temp.auto('a', '2026-11-20 18:00Z') || ',' ||
          pg_temp.auto('a', '2026-11-21 10:00Z'),
          'Home friends,Work,Work,Home friends,Home friends', 'T22 to T26: weekday 08:00 to 17:59 is Work, else Home friends');
insert into public.groups (id, owner_id, name, auto_role) values ('00000000-0000-0000-0000-0000000000c1', tests.id('b'), 'Office', 'work');
select is(pg_temp.auto('b', '2026-11-17 09:00Z') || ',' || pg_temp.auto('k', '2026-11-17 20:00Z'), 'Everyone,Everyone',
          'T28 and T29: an empty daytime group, or no other-times group, falls back to Everyone');
select is(pg_temp.auto('k', '2026-11-17 09:00Z'), 'Everyone', 'T27: no daytime group falls back to Everyone');
select is(pg_temp.auto('a', '2026-11-17 09:00Z', 'America/New_York'), 'Home friends',
          'T32: the sender''s zone decides (09:00 UTC is 04:00 in New York)');

-- T30 / T31: the tap instant decides when it is within 2 minutes of server time.
create function pg_temp.sent_to(p_tapped timestamptz) returns text language plpgsql as $$
declare v_id uuid;
begin
  v_id := (private.create_flare(tests.id('a'), 'tea', null, 'Tea', null, 0, p_tapped, 'auto', null, 'UTC', 'app', true)->>'flare_id')::uuid;
  return (select string_agg(u.name, ',' order by u.name) from public.flare_recipients r
          join tests.users u on u.id = r.recipient_id where r.flare_id = v_id);
end $$;
do $$ begin perform tests.set_clock_to('2026-11-20 18:00:05Z'); end $$;
select is(pg_temp.sent_to('2026-11-20 17:59:50Z'), 'w', 'T30: tapped 17:59:50, received 18:00:05: goes to Work');
do $$ begin perform tests.set_clock_to('2026-11-20 18:01:00Z'); end $$;
select is(pg_temp.sent_to('2026-11-20 17:59:05Z'), 'w', 'T31: tapped at 17:59, received 18:01: goes to Work');
select is(pg_temp.sent_to('2026-11-20 17:58:00Z'), 'k', 'a tap over 2 minutes old uses server time (Home friends)');
do $$ begin perform tests.set_clock(0); end $$;

select * from finish();
rollback;
