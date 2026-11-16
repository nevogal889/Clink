#!/usr/bin/env node
// Runs the Supabase security and performance advisors for a project through the Management API
// (GET /v1/projects/{ref}/advisors/security and /advisors/performance) and prints every finding.
// Exits 1 when an ERROR or WARN is not in supabase/advisors-accepted.json (accepted findings carry
// their reason there). INFO findings are printed but never fail the run.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/supabase-advisors.mjs [--ref <ref>] [--json]
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, api, ensureProxyEnv, hasFlag, projectRef, run } from './supabase/lib.mjs';

const ACCEPTED = path.join(ROOT, 'supabase/advisors-accepted.json');

/** The advisors quote identifiers with backslash-escaped backticks; make them readable. */
export function cleanDetail(detail) {
  return String(detail ?? '').replace(/\\`/g, '`');
}

export function acceptedReason(lint, accepted) {
  const detail = cleanDetail(lint.detail).replace(/`/g, '');
  return accepted.find((a) => a.name === lint.name && detail.includes(a.detail))?.reason;
}

/** Splits findings into blocking (ERROR or WARN, not accepted), accepted and info. */
export function classify(lints, accepted) {
  const blocking = [];
  const acceptedHits = [];
  const info = [];
  for (const l of lints) {
    const reason = acceptedReason(l, accepted);
    if (reason) acceptedHits.push({ ...l, reason });
    else if (l.level === 'ERROR' || l.level === 'WARN') blocking.push(l);
    else info.push(l);
  }
  return { blocking, accepted: acceptedHits, info };
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  const accepted = JSON.parse(readFileSync(ACCEPTED, 'utf8')).accepted;
  const lints = [];
  for (const kind of ['security', 'performance']) {
    const res = await api('GET', `/v1/projects/${ref}/advisors/${kind}`);
    for (const l of res?.lints ?? []) lints.push({ ...l, kind });
  }
  if (hasFlag('--json')) {
    console.log(JSON.stringify(lints, null, 2));
    return;
  }
  const c = classify(lints, accepted);
  const line = (l) => `  ${l.level} ${l.kind}/${l.name}: ${cleanDetail(l.detail)}`;
  console.log(`project ${ref}: ${lints.length} finding(s)`);
  if (c.blocking.length) console.log('Blocking:\n' + c.blocking.map(line).join('\n'));
  if (c.accepted.length) {
    console.log(
      'Accepted (supabase/advisors-accepted.json):\n' +
        c.accepted.map((l) => `${line(l)}\n      reason: ${l.reason}`).join('\n'),
    );
  }
  if (c.info.length) console.log('Info:\n' + c.info.map(line).join('\n'));
  if (c.blocking.length) process.exit(1);
  console.log('no blocking findings');
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
