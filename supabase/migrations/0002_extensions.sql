-- 0002_extensions (ARCHITECTURE.md 4.2).
-- pgcrypto lives in the extensions schema, as on Supabase. pg_cron and pg_net exist on Supabase
-- (hosted and `supabase start`) but not in a plain Postgres 16, which the pgTAP suite uses
-- (supabase/tests/README.md). They are created only where available; 0018 schedules the jobs only
-- when pg_cron exists. Nothing else depends on them.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron not available here; scheduled jobs are skipped (test database)';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  else
    raise notice 'pg_net not available here; scheduled function calls are skipped (test database)';
  end if;
end $$;
