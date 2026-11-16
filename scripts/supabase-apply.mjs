#!/usr/bin/env node
// Applies supabase/migrations to a hosted Supabase project through the Management API query
// endpoint, in version order, each migration in one transaction together with its tracking row.
// Re-runnable: applied versions are skipped.
//
// Tracking uses the Supabase CLI's own table, supabase_migrations.schema_migrations
// (version, name, statements), created with the same statements the CLI uses, so
// `supabase migration list` and `supabase db push` later agree with what this script applied.
// `statements` holds the whole file as one element, so `supabase migration fetch` gives the file back.
//
// Usage (see docs/build-notes/supabase-connect.md):
//   SUPABASE_ACCESS_TOKEN=... node scripts/supabase-apply.mjs [--ref <ref>] [--status] [--dry-run]
//   --status   list local and remote versions, change nothing
//   --dry-run  print what would be applied, change nothing
// An applied migration whose file has changed since is an error: migrations are never edited after
// they reach a shared database (CLAUDE.md "Database"). Write a new migration instead.
import {
  dollarQuote,
  ensureProxyEnv,
  hasFlag,
  literal,
  localMigrations,
  projectRef,
  query,
  run,
} from './supabase/lib.mjs';

// The Supabase CLI's tracking DDL (pkg/migration/history.go), all idempotent.
export const TRACKING_DDL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
`;

/** One transaction: lock, refuse if already applied, the migration, then its tracking row. */
export function applySql(m) {
  return [
    `select pg_advisory_xact_lock(hashtext('clink.supabase-apply'));`,
    `do $guard$ begin
       if exists (select 1 from supabase_migrations.schema_migrations where version = ${literal(m.version)}) then
         raise exception 'migration % is already applied', ${literal(m.version)};
       end if;
     end $guard$;`,
    m.sql,
    ';',
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values (${literal(m.version)}, ${literal(m.name)}, array[${dollarQuote(m.sql)}]);`,
    `select ${literal(m.version)} as applied;`,
  ].join('\n');
}

/** Compares local files with the remote tracking rows. */
export function plan(local, remote) {
  const byVersion = new Map(remote.map((r) => [r.version, r]));
  const localVersions = new Set(local.map((m) => m.version));
  const pending = [];
  const changed = [];
  for (const m of local) {
    const r = byVersion.get(m.version);
    if (!r) pending.push(m);
    else if (Array.isArray(r.statements) && r.statements.join(';\n') !== m.sql) changed.push(m);
  }
  const remoteOnly = remote.filter((r) => !localVersions.has(r.version)).map((r) => r.version);
  // A pending version older than the newest applied one means history diverged.
  const newestApplied = remote
    .map((r) => r.version)
    .sort()
    .at(-1);
  const outOfOrder = pending.filter((m) => newestApplied && m.version < newestApplied);
  return { pending, changed, remoteOnly, outOfOrder };
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  const statusOnly = hasFlag('--status');
  const dryRun = hasFlag('--dry-run');

  const local = localMigrations();
  if (!statusOnly && !dryRun) await query(ref, TRACKING_DDL);
  const exists = await query(
    ref,
    `select to_regclass('supabase_migrations.schema_migrations') is not null as ok`,
  );
  const remote = exists[0]?.ok
    ? await query(
        ref,
        `select version, name, statements from supabase_migrations.schema_migrations order by version`,
      )
    : [];

  const p = plan(local, remote);
  console.log(`project ${ref}: ${local.length} local, ${remote.length} applied`);
  for (const m of local) {
    const state = p.pending.includes(m) ? 'pending' : p.changed.includes(m) ? 'CHANGED' : 'applied';
    console.log(`  ${m.version}  ${m.name.padEnd(22)} ${state}`);
  }
  for (const v of p.remoteOnly) console.log(`  ${v}  (remote only, no local file)`);

  if (p.changed.length) {
    throw new Error(
      `Applied migration(s) changed locally: ${p.changed.map((m) => m.file).join(', ')}. ` +
        'Restore the applied text and put the change in a new migration.',
    );
  }
  if (p.outOfOrder.length) {
    throw new Error(
      `Pending migration(s) older than the newest applied one: ${p.outOfOrder.map((m) => m.file).join(', ')}.`,
    );
  }
  if (statusOnly || dryRun) {
    if (dryRun) console.log(`dry run: would apply ${p.pending.length}`);
    return;
  }

  for (const m of p.pending) {
    const t = Date.now();
    try {
      await query(ref, applySql(m));
    } catch (e) {
      throw new Error(`${m.file} failed and was rolled back: ${e.sqlMessage ?? e.message}`);
    }
    console.log(`applied ${m.file} (${Date.now() - t} ms)`);
  }
  console.log(p.pending.length ? `done: ${p.pending.length} applied` : 'up to date');
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
