-- Security baseline (ARCHITECTURE.md 4.2, 4.3, 9; RISK_REVIEW.md M-01; CLAUDE.md database conventions).
begin;
select plan(16);

-- RLS is on for every public table.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, 'every public table has RLS enabled');

-- Every public table has at least one policy (no table relies on "RLS on, no policy" by accident
-- except where the table is meant to be unreadable by clients).
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  null, 'every public table has at least one policy');

-- anon has no privilege on any public table.
select is(
  (select array_agg(distinct g.table_name::text) from information_schema.role_table_grants g
   join information_schema.tables t on t.table_schema = g.table_schema and t.table_name = g.table_name
   where g.table_schema = 'public' and g.grantee = 'anon' and t.table_type = 'BASE TABLE'),
  null, 'anon has no table privilege in public');

-- No client role holds any privilege on a private table or view.
select is(
  (select array_agg(distinct table_name::text) from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  null, 'no client privilege on anything in private');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on schema private');

-- authenticated may execute exactly the four RLS helpers in private.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')),
  array['app_now', 'are_friends', 'is_blocked', 'is_suspended'],
  'authenticated executes only the four helpers in private');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon executes nothing in private');

-- Exposed functions in public: only flare_view and incoming_flares, authenticated only.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['flare_view', 'incoming_flares'],
  'authenticated executes only flare_view and incoming_flares in public');
select is(
  (select array_agg(p.proname::text) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon executes nothing in public');

-- Every security definer function pins search_path to ''.
select is(
  (select array_agg(n.nspname || '.' || p.proname) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']),
  null, 'every security definer function sets search_path = ''''');

-- No views in public (a view there runs with its owner's rights and ignores RLS).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
  0, 'no views in public (outside extensions such as pgTAP)');
select is(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'v'
     and not coalesce(c.reloptions, '{}') @> array['security_invoker=true']),
  null, 'every private view is security_invoker');

-- Every private function (except the four helpers and triggers) refuses authenticated with
-- permission denied when actually called. Arguments are nulls; the privilege check comes first.
create function pg_temp.private_call_failures() returns text[] language plpgsql as $$
declare
  r        record;
  v_fail   text[] := '{}';
  v_args   text;
begin
  for r in
    select p.oid, p.proname, p.pronargs, p.proargtypes from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('app_now', 'are_friends', 'is_blocked', 'is_suspended')
  loop
    select coalesce(string_agg('null::' || format_type(t, null), ', '), '') into v_args
    from unnest(r.proargtypes::oid[]) t;
    begin
      perform tests.login('sec_a');
      execute format('select private.%I(%s)', r.proname, v_args);
      v_fail := v_fail || (r.proname || ': no error');
    exception
      when insufficient_privilege then null;
      when others then v_fail := v_fail || (r.proname || ': ' || sqlstate);
    end;
    perform tests.logout();
  end loop;
  return v_fail;
end $$;
do $$ begin perform tests.create_user('sec_a'); end $$;
select is(pg_temp.private_call_failures(), '{}'::text[],
          'every private function fails with permission denied for authenticated');

-- service_role can execute every private function.
select is(
  (select array_agg(p.proname::text) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prorettype <> 'trigger'::regtype
     and not has_function_privilege('service_role', p.oid, 'execute')),
  null, 'service_role executes every private function');

-- CEO guideline 5: no quiet hours anywhere in the schema.
select is(
  (select count(*)::int from information_schema.columns
   where table_schema in ('public', 'private') and (column_name ilike '%quiet%' or column_name ilike '%dnd%')),
  0, 'no quiet-hours column exists');

-- Every policy calls auth.uid() through (select auth.uid()), never bare, so it is evaluated once.
select is(
  (select array_agg(schemaname || '.' || tablename || '.' || policyname) from pg_policies
   where schemaname in ('public', 'storage')
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi')
         ~* 'auth\.uid\(\)'),
  null, 'policies only use (select auth.uid())');

select * from finish();
rollback;
