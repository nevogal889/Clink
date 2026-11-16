#!/usr/bin/env node
// Deploys the edge functions in supabase/functions to a hosted Supabase project with the Supabase
// CLI through the Management API (--use-api: no Docker, no database connection), then sets the one
// non-secret function setting, CLINK_ENV, and reads the function list back.
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
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { DEV_REF, ROOT, api, ensureProxyEnv, flagValue, projectRef, run } from './supabase/lib.mjs';

// Pinned CLI (CLAUDE.md: versions are pinned). 3.1.0 is the version this was verified with.
export const CLI = 'supabase@3.1.0';
const FUNCTIONS = path.join(ROOT, 'supabase/functions');

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
  const all = localFunctions();
  const named = process.argv
    .slice(2)
    .filter((a, i, argv) => !a.startsWith('--') && !['--ref', '--env'].includes(argv[i - 1]));
  for (const n of named) if (!all.includes(n)) throw new Error(`No function named ${n}`);
  const names = named.length ? named : all;

  const before = new Map(
    ((await api('GET', `/v1/projects/${ref}/functions`)) ?? []).map((f) => [f.slug, f.version]),
  );

  // `--yes` confirms the hosted change; running this script is that confirmation.
  const r = spawnSync(
    'npx',
    [
      '-y',
      CLI,
      'functions',
      'deploy',
      ...names,
      '--use-api',
      '--import-map',
      'supabase/functions/deno.json',
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

  // Non-secret config. The secrets endpoint is the only way to set a function env var.
  await api('POST', `/v1/projects/${ref}/secrets`, [{ name: 'CLINK_ENV', value: env }]);

  const after = (await api('GET', `/v1/projects/${ref}/functions`)) ?? [];
  let bad = 0;
  for (const n of names) {
    const f = after.find((x) => x.slug === n);
    const ok = f && f.status === 'ACTIVE' && f.version > (before.get(n) ?? 0);
    if (!ok) bad++;
    console.log(
      `  ${n.padEnd(18)} ${f ? `${f.status} v${f.version} verify_jwt=${f.verify_jwt}` : 'missing'}${ok ? '' : '   NOT UPDATED'}`,
    );
  }
  console.log(`CLINK_ENV=${env}`);
  if (bad) throw new Error(`${bad} function(s) not deployed`);
  console.log(`deployed ${names.length} function(s) to ${ref}`);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
