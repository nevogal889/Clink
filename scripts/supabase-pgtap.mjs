#!/usr/bin/env node
// Runs the pgTAP suite (supabase/tests/**/*.test.sql) against a hosted Supabase project through the
// Management API query endpoint, leaving nothing behind.
//
// Each test file runs in one request, inside one transaction that ends in ROLLBACK:
//   begin; temp output table; supabase/tests/setup/01_test_helpers.sql; the test's statements;
//   select the captured output; rollback;
// The endpoint returns only the last result set, so every top-level SELECT of the test is rewritten
// to insert its first column into the temp table, which is read back just before the rollback.
// The plain-Postgres shim (setup/00_supabase_shim.sql) is not loaded: the project has the real
// auth, storage and roles. pgTAP is created in the extensions schema if missing (the only change
// the run keeps).
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/supabase-pgtap.mjs [--ref <ref>] [file filter]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { ROOT, ensureProxyEnv, projectRef, query, run } from './supabase/lib.mjs';
import { firstKeyword, parseTap, splitStatements } from './supabase/sql.mjs';

const TESTS = path.join(ROOT, 'supabase/tests');
const HELPERS = path.join(TESTS, 'setup/01_test_helpers.sql');

function findTests(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'setup') out.push(...findTests(p));
    } else if (name.endsWith('.test.sql')) out.push(p);
  }
  return out;
}

/** Builds the one-request script for a test file. */
export function buildTestRequest(testSql, helpersSql) {
  const stmts = splitStatements(testSql);
  if (firstKeyword(stmts[0] ?? '') !== 'begin' || firstKeyword(stmts.at(-1) ?? '') !== 'rollback') {
    throw new Error('test file must start with begin; and end with rollback;');
  }
  const body = stmts.slice(1, -1).map((s) => {
    const kw = firstKeyword(s);
    if (kw === 'commit' || kw === 'begin' || kw === 'rollback' || kw === 'end') {
      throw new Error(`test file may not control the transaction: ${s.slice(0, 60)}`);
    }
    if (kw === 'select' || kw === 'with' || kw === 'values' || kw === 'table') {
      return `insert into pg_temp.__clink_tap (line) select _x::text from (${s}) as _t(_x);`;
    }
    return `${s};`;
  });
  return [
    'begin;',
    'create temp table __clink_tap (id bigserial primary key, line text) on commit drop;',
    helpersSql,
    ';',
    ...body,
    `select coalesce(json_agg(line order by id), '[]'::json) as tap from pg_temp.__clink_tap;`,
    'rollback;',
  ].join('\n');
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  const filter = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--ref');
  const files = findTests(TESTS).filter((f) => !filter || f.includes(filter));
  const helpers = readFileSync(HELPERS, 'utf8');

  await query(ref, 'create extension if not exists pgtap with schema extensions;');

  let totalPassed = 0;
  let totalPlanned = 0;
  let bad = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    let tap;
    try {
      const rows = await query(ref, buildTestRequest(readFileSync(file, 'utf8'), helpers));
      tap = parseTap(rows[0]?.tap ?? []);
    } catch (e) {
      bad++;
      console.log(`${rel}: ERROR ${e.sqlMessage ?? e.message}`);
      continue;
    }
    totalPassed += tap.passed;
    totalPlanned += tap.planned ?? tap.ran;
    if (tap.ok) {
      console.log(`${rel}: ok ${tap.passed}/${tap.planned}`);
    } else {
      bad++;
      console.log(`${rel}: FAIL ${tap.passed} passed, ${tap.failed} failed, planned ${tap.planned}`);
      for (const f of tap.failures) {
        console.log(`  not ok ${f.number} - ${f.description}`);
        for (const d of f.diag) console.log(`    ${d}`);
      }
      for (const note of tap.notes) console.log(`  ${note}`);
    }
  }
  console.log(
    `${files.length} file(s), ${totalPassed}/${totalPlanned} tests passed, ${bad} file(s) failed`,
  );
  // Proves the rollback: no test helper schema is left on the project.
  const left = await query(ref, `select to_regnamespace('tests') is null as clean`);
  if (!left[0]?.clean) {
    bad++;
    console.log('schema tests is still present on the project');
  }
  if (bad) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
