// Shared helpers for the scripts that talk to a hosted Supabase project through the Management API
// (https://api.supabase.com): supabase-apply, supabase-pgtap, supabase-advisors, supabase-auth-dev
// and supabase-smoke. Direct Postgres connections are not needed: SQL goes through
// POST /v1/projects/{ref}/database/query, which runs it as the postgres role.
//
// Credentials: SUPABASE_ACCESS_TOKEN (a personal access token, or "proxy-injected" where a network
// proxy adds the real one). It is read from the environment only and never printed or written.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const API = 'https://api.supabase.com';

/** clink-dev (docs/DECISIONS.md, "Supabase projects"). Any other project must be named with --ref. */
export const DEV_REF = 'tppolgvuckjtxsheskat';

/**
 * Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set at startup, so when a proxy is
 * configured and the flag is missing, the script runs itself again with it. Call before any fetch.
 */
export function ensureProxyEnv() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY === '1') return;
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(r.status ?? 1);
}

/** Value after a flag (`--ref abc`), or undefined. */
export function flagValue(flag, argv = process.argv) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function hasFlag(flag, argv = process.argv) {
  return argv.includes(flag);
}

/** Project ref from --ref, then SUPABASE_PROJECT_REF, then clink-dev. */
export function projectRef(argv = process.argv, env = process.env) {
  const ref = flagValue('--ref', argv) ?? env.SUPABASE_PROJECT_REF ?? DEV_REF;
  if (!/^[a-z]{20}$/.test(ref)) throw new Error(`Not a Supabase project ref: "${ref}"`);
  return ref;
}

/** Throws unless the ref is clink-dev. For dev-only settings (test OTPs, seeded test users). */
export function requireDevRef(ref) {
  if (ref !== DEV_REF) {
    throw new Error(`This script is for clink-dev (${DEV_REF}) only; refusing to run on ${ref}.`);
  }
}

function token() {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not set. Behind the agent proxy use SUPABASE_ACCESS_TOKEN=proxy-injected.',
    );
  }
  return t;
}

/** Calls the Management API. Returns parsed JSON (null for an empty body). Throws on non-2xx. */
export async function api(method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 4000);
    try {
      message = JSON.parse(text).message ?? message;
    } catch {
      // not JSON; keep the raw text
    }
    const err = new Error(`${method} ${pathname}: HTTP ${res.status}: ${message}`);
    err.status = res.status;
    err.sqlMessage = message;
    throw err;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Runs SQL as postgres. Several statements in one call run as one implicit transaction, so an
 * error rolls back all of them. The result is the rows of the last statement that returned rows.
 */
export function query(ref, sql) {
  return api('POST', `/v1/projects/${ref}/database/query`, { query: sql });
}

/** A dollar-quoted SQL literal whose tag doesn't occur in the text. */
export function dollarQuote(text) {
  let tag = 'q';
  let n = 0;
  while (text.includes(`$${tag}$`)) tag = `q${++n}`;
  return `$${tag}$${text}$${tag}$`;
}

/** Single-quoted SQL literal. */
export function literal(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/** Parses a migration file name the way the Supabase CLI does: <digits>_<name>.sql. */
export function parseMigrationName(file) {
  const m = /^([0-9]+)_(.+)\.sql$/.exec(file);
  if (!m) throw new Error(`Migration file name must be <digits>_<name>.sql: ${file}`);
  return { version: m[1], name: m[2] };
}

/** Local migrations sorted by version (0001_security.sql -> version 0001, name security). */
export function localMigrations(dir = path.join(ROOT, 'supabase/migrations')) {
  const list = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => ({
      ...parseMigrationName(file),
      file,
      sql: readFileSync(path.join(dir, file), 'utf8'),
    }))
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  const seen = new Set();
  for (const m of list) {
    if (seen.has(m.version)) throw new Error(`Two migrations share version ${m.version}`);
    seen.add(m.version);
  }
  return list;
}

/** Runs main() and prints only the error message on failure (never a request header). */
export function run(main) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
