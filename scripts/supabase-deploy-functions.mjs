#!/usr/bin/env node
// Deploys the edge functions in supabase/functions to a hosted Supabase project with the Supabase
// CLI through the Management API (--use-api: no Docker, no database connection), then sets the
// non-secret function settings, CLINK_ENV and CLINK_CORS_ORIGINS, and reads the function list back.
//
// Every directory under supabase/functions with an index.ts is a function; _shared and tests are
// not. All of them share supabase/functions/deno.json as the import map, which the CLI does not
// find on its own without a config.toml, so it is passed with --import-map.
//
// Secrets (pepper, APNs, FCM, Twilio, ...) are never set here: they go in with
// `supabase secrets set` by the CEO or CTO (ARCHITECTURE.md 8.5). SUPABASE_URL, SUPABASE_DB_URL,
// the service key and the JWKS come from the Supabase runtime.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/supabase-deploy-functions.mjs [--ref <ref>] [name ...]
//   --env dev|prod   CLINK_ENV for the project (default: dev for clink-dev; required otherwise)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { DEV_REF, ROOT, api, ensureProxyEnv, flagValue, projectRef, run } from './supabase/lib.mjs';
import { diff as sharedDiff } from './supabase/sync-shared.mjs';

// Pinned CLI (CLAUDE.md: versions are pinned). 3.1.0 is the version this was verified with.
export const CLI = 'supabase@3.1.0';
const FUNCTIONS = path.join(ROOT, 'supabase/functions');

/**
 * Functions that check their own credential instead of a Supabase JWT, so the gateway's JWT check
 * is off for them (`--no-verify-jwt`). widget-api takes only the widget token (ARCHITECTURE.md 4.4).
 */
export const NO_VERIFY_JWT = new Set(['widget-api']);

/** The CLI applies --no-verify-jwt to every function in one call, so the two kinds deploy apart. */
export function deployGroups(names) {
  return [
    { names: names.filter((n) => !NO_VERIFY_JWT.has(n)), verifyJwt: true },
    { names: names.filter((n) => NO_VERIFY_JWT.has(n)), verifyJwt: false },
  ].filter((g) => g.names.length > 0);
}

export function localFunctions(dir = FUNCTIONS) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'tests')
    .filter((d) => existsSync(path.join(dir, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort();
}

/** CLINK_ENV for a project: dev for clink-dev, otherwise it must be given. */
export function clinkEnv(ref, flag) {
  const env = flag ?? (ref === DEV_REF ? 'dev' : undefined);
  if (env !== 'dev' && env !== 'prod') {
    throw new Error(`Pass --env dev or --env prod for project ${ref}.`);
  }
  if (ref === DEV_REF && env !== 'dev') throw new Error('clink-dev is always CLINK_ENV=dev.');
  return env;
}

/**
 * CLINK_CORS_ORIGINS for a project: the exact browser origins in supabase/projects.json
 * `corsOrigins` for the project with this ref (docs/ARCHITECTURE.md 4.4 "CORS"). Exact origins
 * only, no wildcard and no path. https, except http://localhost and http://127.0.0.1 on dev.
 */
export function corsOrigins(ref, env, projects = readProjects()) {
  const project = Object.values(projects).find((p) => p && typeof p === 'object' && p.ref === ref);
  const list = project?.corsOrigins ?? [];
  if (!Array.isArray(list)) throw new Error('corsOrigins must be a list of origins.');
  for (const o of list) {
    const ok =
      typeof o === 'string' &&
      (/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(o) ||
        (env === 'dev' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(o)));
    if (!ok) throw new Error(`Not an allowed CORS origin for ${env}: ${JSON.stringify(o)}`);
  }
  return list.join(',');
}

function readProjects() {
  return JSON.parse(readFileSync(path.join(ROOT, 'supabase/projects.json'), 'utf8'));
}

/**
 * The CLI checks the token's shape (sbp_ + 40 hex) before sending it. Behind the agent proxy the
 * real token is added to the request, so a placeholder of the right shape is enough.
 */
function cliToken() {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN is not set.');
  return t === 'proxy-injected' ? `sbp_${'0'.repeat(40)}` : t;
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  const env = clinkEnv(ref, flagValue('--env'));
  const cors = corsOrigins(ref, env);
  const all = localFunctions();
  const named = process.argv
    .slice(2)
    .filter((a, i, argv) => !a.startsWith('--') && !['--ref', '--env'].includes(argv[i - 1]));
  for (const n of named) if (!all.includes(n)) throw new Error(`No function named ${n}`);
  const names = named.length ? named : all;

  const before = new Map(
    ((await api('GET', `/v1/projects/${ref}/functions`)) ?? []).map((f) => [f.slug, f.version]),
  );

  // The functions bundle copies of packages/shared; refuse to ship stale ones.
  const stale = sharedDiff();
  if (stale.length) {
    throw new Error(
      `supabase/functions/_shared/shared is out of date: ${stale.join(', ')}. Run node scripts/supabase/sync-shared.mjs`,
    );
  }

  // `--yes` confirms the hosted change; running this script is that confirmation.
  for (const group of deployGroups(names)) {
    const r = spawnSync(
      'npx',
      [
        '-y',
        CLI,
        'functions',
        'deploy',
        ...group.names,
        '--use-api',
        '--import-map',
        'supabase/functions/deno.json',
        ...(group.verifyJwt ? [] : ['--no-verify-jwt']),
        `--remote=${ref}`,
        '--yes',
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: cliToken() },
      },
    );
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
      .split('\n')
      .filter((l) => l && !l.startsWith('Uploading asset'))
      .join('\n');
    console.log(out);
    if (r.status !== 0 || /"_tag":"Error"/.test(out)) throw new Error('functions deploy failed');
  }

  // Non-secret config. The secrets endpoint is the only way to set a function env var. An empty
  // allow-list is stored as a single space (the endpoint refuses empty values); it parses to none.
  await api('POST', `/v1/projects/${ref}/secrets`, [
    { name: 'CLINK_ENV', value: env },
    { name: 'CLINK_CORS_ORIGINS', value: cors || ' ' },
  ]);

  const after = (await api('GET', `/v1/projects/${ref}/functions`)) ?? [];
  let bad = 0;
  for (const n of names) {
    const f = after.find((x) => x.slug === n);
    const ok =
      f &&
      f.status === 'ACTIVE' &&
      f.version > (before.get(n) ?? 0) &&
      f.verify_jwt === !NO_VERIFY_JWT.has(n);
    if (!ok) bad++;
    console.log(
      `  ${n.padEnd(18)} ${f ? `${f.status} v${f.version} verify_jwt=${f.verify_jwt}` : 'missing'}${ok ? '' : '   NOT UPDATED'}`,
    );
  }
  console.log(`CLINK_ENV=${env} CLINK_CORS_ORIGINS=${cors || '(none)'}`);
  if (bad) throw new Error(`${bad} function(s) not deployed`);
  console.log(`deployed ${names.length} function(s) to ${ref}`);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
