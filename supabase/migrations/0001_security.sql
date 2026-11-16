-- 0001_security: the private schema and function lockdown (ARCHITECTURE.md 4.2, RISK_REVIEW.md M-01).
-- Runs as the migration role before any function or table exists.
--
-- private is never exposed through PostgREST. anon and authenticated never get a table privilege
-- in it. authenticated gets schema usage only so RLS policies can call the four helpers granted in
-- 0005 (are_friends, is_blocked, is_suspended, app_now). service_role gets execute on every private
-- function; edge functions call them as the service role.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Functions: nobody executes anything by default. Each function that must be callable is granted
-- by name in the migration that creates it.
-- Postgres grants execute to PUBLIC on every new function, globally. A per-schema revoke can't undo a
-- global default, so the global one is revoked first, then the per-schema grants Supabase adds.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- service_role executes private functions (granted per function too, so a test can prove it).
alter default privileges in schema private grant execute on functions to service_role;

-- Tables in private: no grants to client roles, ever. service_role (the edge functions' role, set
-- with `set local role service_role` on their direct database connection) reads and writes them.
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private grant select, insert, update, delete on tables to service_role;
alter default privileges in schema private grant usage, select on sequences to service_role;

-- Tables in public: Supabase grants everything to anon and authenticated by default and relies on
-- RLS. We also take the grants away and give back only what each table needs (per-table migrations),
-- so a table with a missing policy still fails closed. anon reads nothing in public.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
