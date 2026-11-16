-- Test helpers (test database only). Modelled on the usual Supabase pgTAP helpers: switch to the
-- authenticated role with a JWT for a named test user, or to service_role, inside the test's
-- transaction. plpgsql bodies are checked at call time, so these load before the migrations.

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create table if not exists tests.users (
  name  text primary key,
  id    uuid not null unique
);
grant select on tests.users to anon, authenticated, service_role;

-- Creates an auth user with a confirmed phone and, unless p_signup is false, completes sign-up
-- (profile, settings, private row, invite) through private.complete_signup.
create or replace function tests.create_user(p_name text, p_signup boolean default true, p_tz text default 'UTC')
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, phone, phone_confirmed_at)
  values (v_id, '+1555' || lpad((abs(hashtext(p_name)) % 10000000)::text, 7, '0'), now());
  insert into tests.users (name, id) values (p_name, v_id);
  if p_signup then
    perform private.complete_signup(v_id, p_name, 1::smallint, gen_random_uuid(), p_tz, 'phone');
  end if;
  return v_id;
end $$;

create or replace function tests.id(p_name text)
returns uuid language sql stable as $$
  select u.id from tests.users u where u.name = p_name;
$$;

-- Acts as the named user through PostgREST: role authenticated, JWT claims with sub.
create or replace function tests.login(p_name text)
returns void language plpgsql as $$
declare
  v_id uuid := tests.id(p_name);
begin
  if v_id is null then
    raise exception 'tests.login: unknown user %', p_name;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
end $$;

create or replace function tests.login_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end $$;

-- Acts as an edge function: role service_role, no user JWT.
create or replace function tests.as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Back to the migration role.
create or replace function tests.logout()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Graph setup as the migration role (bypasses the functions, for arranging state quickly).
create or replace function tests.befriend(a text, b text)
returns void language plpgsql as $$
begin
  insert into public.friendships (user_a, user_b)
  values (least(tests.id(a), tests.id(b)), greatest(tests.id(a), tests.id(b)))
  on conflict do nothing;
end $$;

-- Moves the server clock (private.clock_offset) by p_seconds from now.
create or replace function tests.set_clock(p_seconds int)
returns void language plpgsql as $$
begin
  insert into private.clock_offset (id, seconds) values (1, p_seconds)
  on conflict (id) do update set seconds = excluded.seconds;
end $$;

-- Counts rows of a query run as the current role.
create or replace function tests.rows(p_sql text)
returns bigint language plpgsql as $$
declare
  v_n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into v_n;
  return v_n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- The run-as helpers below switch role only for the one statement and switch back before
-- returning, so the pgTAP assertion functions always run as the migration role. If the statement
-- raises, the role change is undone with the failed subtransaction (throws_ok, lives_ok).
-- p_who: a test user's name, 'anon', or 'service'.
create or replace function tests.become(p_who text)
returns void language plpgsql as $$
begin
  if p_who = 'anon' then
    perform tests.login_anon();
  elsif p_who = 'service' then
    perform tests.as_service();
  else
    perform tests.login(p_who);
  end if;
end $$;

-- Row count of a query, as p_who.
create or replace function tests.rows_as(p_who text, p_sql text)
returns bigint language plpgsql as $$
declare
  v_n bigint;
begin
  perform tests.become(p_who);
  execute 'select count(*) from (' || p_sql || ') q' into v_n;
  perform tests.logout();
  return v_n;
end $$;

-- First column of the first row, as text, as p_who.
create or replace function tests.run(p_who text, p_sql text)
returns text language plpgsql as $$
declare
  v_out text;
begin
  perform tests.become(p_who);
  execute 'select (' || p_sql || ')::text' into v_out;
  perform tests.logout();
  return v_out;
end $$;

-- Rows affected by a DML statement, as p_who.
create or replace function tests.affected(p_who text, p_sql text)
returns bigint language plpgsql as $$
declare
  v_n bigint;
begin
  perform tests.become(p_who);
  execute p_sql;
  get diagnostics v_n = row_count;
  perform tests.logout();
  return v_n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- The standard graph (ARCHITECTURE.md 4.3 RLS tests):
--   a  me
--   b  friend of a
--   c  stranger to everyone
--   d  was a's friend, then a blocked d
--   e  friend of a, not in a's Work group
--   f  friend of a, suspended
--   g  sent a a friend request (pending)
--   h  a sent h a friend request (pending)
--   w  friend of a, in a's Work group (auto_role work)
--   k  friend of a, in a's Home friends group (auto_role home)
create or replace function tests.seed()
returns void language plpgsql as $$
begin
  perform tests.create_user(n) from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'w', 'k']) n;
  perform tests.befriend('a', x) from unnest(array['b', 'd', 'e', 'f', 'w', 'k']) x;
  perform private.block_user(tests.id('a'), tests.id('d'));
  perform private.suspend_user(tests.id('f'), 'spam', 'test');
  insert into public.friend_requests (from_id, to_id, source) values
    (tests.id('g'), tests.id('a'), 'contacts'),
    (tests.id('a'), tests.id('h'), 'contacts');
  insert into public.groups (id, owner_id, name, auto_role) values
    ('00000000-0000-0000-0000-0000000000a1', tests.id('a'), 'Work', 'work'),
    ('00000000-0000-0000-0000-0000000000a2', tests.id('a'), 'Home friends', 'home');
  insert into public.group_members (group_id, member_id) values
    ('00000000-0000-0000-0000-0000000000a1', tests.id('w')),
    ('00000000-0000-0000-0000-0000000000a2', tests.id('k'));
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- SQL text that runs p_sql as p_who, for throws_ok / lives_ok.
create or replace function tests.q(p_who text, p_sql text)
returns text language sql immutable as $$
  select format('select tests.affected(%L, %L)', p_who, p_sql);
$$;

-- Same, for a scalar expression (a function call), for throws_ok / lives_ok.
create or replace function tests.qrun(p_who text, p_sql text)
returns text language sql immutable as $$
  select format('select tests.run(%L, %L)', p_who, p_sql);
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Moves the server clock so private.app_now() reads p_at.
create or replace function tests.set_clock_to(p_at timestamptz)
returns void language plpgsql as $$
begin
  perform tests.set_clock(round(extract(epoch from (p_at - now())))::int);
end $$;

-- Gives a user a usual #1 so "Bring me one" has an order to copy.
create or replace function tests.give_usual(p_name text, p_note text default null)
returns void language plpgsql as $$
begin
  insert into public.usual_drinks (user_id, slot, drink_id, category, details)
  values (tests.id(p_name), 1, 'coffee.flat_white', 'coffee',
          case when p_note is null then '{"milk": "Oat milk"}'::jsonb
               else jsonb_build_object('milk', 'Oat milk', 'note', p_note) end)
  on conflict (user_id, slot) do nothing;
end $$;

-- Sends a flare as the server would (send-flare), returning its id.
create or replace function tests.flare(p_sender text, p_audience text, p_group uuid default null,
                                       p_timing int default 15, p_source text default 'app')
returns uuid language plpgsql as $$
begin
  return (private.create_flare(tests.id(p_sender), 'coffee', 'coffee.latte', 'Latte', 'Corner cafe', p_timing,
                               private.app_now(), p_audience, p_group, 'UTC', p_source, false)->>'flare_id')::uuid;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
