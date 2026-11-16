#!/usr/bin/env node
// Applies supabase/auth.dev.json to clink-dev's Auth config through the Management API
// (PATCH /v1/projects/{ref}/config/auth), then reads the config back and checks every value.
// Refuses any project other than clink-dev: test phone numbers with fixed codes are dev only.
// Re-run before testPhones.validDays runs out to renew the test numbers.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/supabase-auth-dev.mjs [--dry-run]
// Prints only the keys it sets; the Auth config also holds provider secrets, which are never printed.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ROOT,
  api,
  ensureProxyEnv,
  hasFlag,
  projectRef,
  requireDevRef,
  run,
} from './supabase/lib.mjs';

const FILE = path.join(ROOT, 'supabase/auth.dev.json');

/** sms_test_otp format used by the Auth config API: "<digits>=<code>,<digits>=<code>". */
export function testOtpString(numbers) {
  return Object.entries(numbers)
    .filter(([k]) => !k.startsWith('$'))
    .map(([phone, code]) => {
      if (!/^[1-9][0-9]{6,14}$/.test(phone)) throw new Error(`bad test phone ${phone}`);
      if (!/^[0-9]{6}$/.test(code)) throw new Error(`bad test code for ${phone}`);
      return `${phone}=${code}`;
    })
    .join(',');
}

export function desiredConfig(file, now = new Date()) {
  const settings = Object.fromEntries(
    Object.entries(file.settings).filter(([k]) => !k.startsWith('$')),
  );
  const until = new Date(now.getTime() + file.testPhones.validDays * 86400_000);
  return {
    ...settings,
    sms_test_otp: testOtpString(file.testPhones.numbers),
    sms_test_otp_valid_until: until.toISOString(),
  };
}

/** Keys whose read-back value differs from what was sent (the timestamp is compared as a date). */
export function mismatches(desired, actual) {
  return Object.keys(desired).filter((k) => {
    if (k === 'sms_test_otp_valid_until') {
      return Math.abs(Date.parse(actual[k]) - Date.parse(desired[k])) > 60_000;
    }
    if (k === 'sms_test_otp') {
      const norm = (s) =>
        String(s ?? '')
          .split(',')
          .sort()
          .join(',');
      return norm(actual[k]) !== norm(desired[k]);
    }
    return actual[k] !== desired[k];
  });
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  requireDevRef(ref);
  const file = JSON.parse(readFileSync(FILE, 'utf8'));
  const desired = desiredConfig(file);
  if (hasFlag('--dry-run')) {
    console.log(JSON.stringify(desired, null, 2));
    return;
  }
  await api('PATCH', `/v1/projects/${ref}/config/auth`, desired);
  const actual = await api('GET', `/v1/projects/${ref}/config/auth`);
  const bad = mismatches(desired, actual);
  for (const k of Object.keys(desired)) {
    const shown =
      k === 'sms_test_otp' ? `${desired.sms_test_otp.split(',').length} numbers` : actual[k];
    console.log(`  ${k} = ${JSON.stringify(shown)}${bad.includes(k) ? '   MISMATCH' : ''}`);
  }
  if (bad.length) throw new Error(`Auth config did not take: ${bad.join(', ')}`);
  console.log(`auth config applied to ${ref}`);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
