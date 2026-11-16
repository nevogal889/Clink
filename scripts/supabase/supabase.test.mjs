// Unit tests for the hosted-Supabase scripts (no network). Run: node --test scripts/supabase/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { classify } from '../supabase-advisors.mjs';
import { applySql, plan } from '../supabase-apply.mjs';
import { desiredConfig, mismatches, testOtpString } from '../supabase-auth-dev.mjs';
import { clinkEnv, localFunctions } from '../supabase-deploy-functions.mjs';
import { buildTestRequest } from '../supabase-pgtap.mjs';
import {
  DEV_REF,
  ROOT,
  dollarQuote,
  localMigrations,
  parseMigrationName,
  projectRef,
  requireDevRef,
} from './lib.mjs';
import { firstKeyword, parseTap, splitStatements } from './sql.mjs';

test('splitStatements keeps semicolons inside quotes, dollar bodies and comments', () => {
  const sql = `select 'a;b'; -- c;d
create function f() returns int language sql as $f$ select 1; $f$;
/* x; /* nested; */ y; */ select "q;"; select E'it\\'s;'`;
  const s = splitStatements(sql);
  assert.equal(s.length, 4);
  assert.equal(firstKeyword(s[1]), 'create');
  assert.match(s[1], /\$f\$ select 1; \$f\$$/);
  assert.equal(firstKeyword(s[2]), 'select');
  assert.equal(s[3], `select E'it\\'s;'`);
});

test('every migration splits and has a CLI-style name', () => {
  const list = localMigrations();
  assert.ok(list.length >= 18);
  for (const m of list) assert.ok(splitStatements(m.sql).length > 0, m.file);
  assert.deepEqual(parseMigrationName('0001_security.sql'), { version: '0001', name: 'security' });
  assert.throws(() => parseMigrationName('security.sql'));
});

test('dollarQuote picks a tag the text does not contain', () => {
  assert.equal(dollarQuote('x'), '$q$x$q$');
  assert.equal(dollarQuote('a $q$ b'), '$q1$a $q$ b$q1$');
});

test('plan finds pending, changed, remote-only and out-of-order migrations', () => {
  const local = [
    { version: '0001', sql: 'a' },
    { version: '0002', sql: 'b2' },
    { version: '0003', sql: 'c' },
    { version: '0004', sql: 'd' },
  ];
  const remote = [
    { version: '0001', statements: ['a'] },
    { version: '0002', statements: ['b'] },
    { version: '0004', statements: ['d'] },
    { version: '0009', statements: ['z'] },
  ];
  const p = plan(local, remote);
  assert.deepEqual(
    p.pending.map((m) => m.version),
    ['0003'],
  );
  assert.deepEqual(
    p.changed.map((m) => m.version),
    ['0002'],
  );
  assert.deepEqual(p.remoteOnly, ['0009']);
  assert.deepEqual(
    p.outOfOrder.map((m) => m.version),
    ['0003'],
  );
  assert.equal(plan(local, []).pending.length, 4);
});

test('applySql guards against a second apply and records the whole file', () => {
  const sql = applySql({ version: '0042', name: 'x', sql: "select '$q$';" });
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /already applied/);
  assert.match(sql, /array\[\$q1\$select '\$q\$';\$q1\$\]/);
});

test('buildTestRequest captures selects and refuses transaction control', () => {
  const req = buildTestRequest(
    'begin;\nselect plan(1);\nselect ok(true);\nrollback;',
    '-- helpers',
  );
  assert.match(req, /^begin;/);
  assert.match(req, /rollback;$/);
  assert.equal((req.match(/insert into pg_temp.__clink_tap/g) ?? []).length, 2);
  assert.throws(() => buildTestRequest('begin; commit; rollback;', ''), /transaction/);
  assert.throws(() => buildTestRequest('select 1;', ''), /begin/);
});

test('parseTap counts passes and keeps failure diagnostics', () => {
  const t = parseTap(['1..3', 'ok 1 - a', 'not ok 2 - b\n# Failed test 2\n#   have: 1', 'ok 3']);
  assert.equal(t.passed, 2);
  assert.equal(t.failed, 1);
  assert.equal(t.ok, false);
  assert.deepEqual(t.failures[0].diag, ['# Failed test 2', '#   have: 1']);
  assert.equal(parseTap(['1..2', 'ok 1']).ok, false);
  assert.equal(parseTap(['1..1', 'ok 1']).ok, true);
});

test('advisor findings: accepted ones need a match, INFO never blocks', () => {
  const accepted = [{ name: 'a', detail: 'public.f(', reason: 'r' }];
  const c = classify(
    [
      { name: 'a', level: 'WARN', detail: 'Function \\`public.f(x)\\`' },
      { name: 'a', level: 'WARN', detail: 'Function \\`public.g()\\`' },
      { name: 'b', level: 'INFO', detail: '' },
      { name: 'c', level: 'ERROR', detail: '' },
    ],
    accepted,
  );
  assert.equal(c.accepted.length, 1);
  assert.deepEqual(
    c.blocking.map((l) => l.name),
    ['a', 'c'],
  );
  assert.equal(c.info.length, 1);
  // Every accepted entry in the repo carries a reason.
  const file = JSON.parse(readFileSync(path.join(ROOT, 'supabase/advisors-accepted.json'), 'utf8'));
  for (const a of file.accepted)
    assert.ok(a.name && typeof a.detail === 'string' && a.reason, a.name);
});

test('auth dev config: test numbers are fictional, codes are 6 digits, no secrets', () => {
  const file = JSON.parse(readFileSync(path.join(ROOT, 'supabase/auth.dev.json'), 'utf8'));
  for (const phone of Object.keys(file.testPhones.numbers).filter((k) => !k.startsWith('$'))) {
    assert.match(phone, /^1[2-9][0-9]{2}55501[0-9]{2}$/, `${phone} is not a 555-01xx number`);
  }
  const d = desiredConfig(file, new Date('2026-01-01T00:00:00Z'));
  assert.equal(d.external_phone_enabled, true);
  assert.equal(d.external_email_enabled, false);
  assert.equal(d.external_anonymous_users_enabled, false);
  assert.equal(d.jwt_exp, 3600);
  assert.equal(
    d.sms_test_otp.split(',').length,
    Object.keys(file.testPhones.numbers).filter((k) => !k.startsWith('$')).length,
  );
  for (const k of Object.keys(d)) assert.doesNotMatch(k, /secret|password|auth_token|api_key/i);
  assert.throws(() => testOtpString({ '+1555': '1' }));
  assert.deepEqual(
    mismatches({ a: 1, sms_test_otp: 'x=1,y=2' }, { a: 1, sms_test_otp: 'y=2,x=1' }),
    [],
  );
  assert.deepEqual(mismatches({ a: 1 }, { a: 2 }), ['a']);
});

test('projects.json holds only public values', () => {
  const text = readFileSync(path.join(ROOT, 'supabase/projects.json'), 'utf8');
  const dev = JSON.parse(text).dev;
  assert.equal(dev.ref, DEV_REF);
  assert.equal(dev.url, `https://${DEV_REF}.supabase.co`);
  assert.match(dev.publishableKey, /^sb_publishable_/);
  assert.doesNotMatch(text, /sb_secret_|service_role|eyJ[A-Za-z0-9_-]{10,}\.|postgres(ql)?:\/\//);
});

test('project ref guard and CLINK_ENV', () => {
  assert.equal(projectRef([], {}), DEV_REF);
  assert.throws(() => projectRef(['--ref', 'nope'], {}));
  assert.throws(() => requireDevRef('abcdefghijabcdefghij'));
  assert.equal(clinkEnv(DEV_REF), 'dev');
  assert.throws(() => clinkEnv(DEV_REF, 'prod'));
  assert.throws(() => clinkEnv('abcdefghijabcdefghij'));
  assert.equal(clinkEnv('abcdefghijabcdefghij', 'prod'), 'prod');
});

test('deployable functions are the M1 three', () => {
  assert.deepEqual(localFunctions(), ['complete-signup', 'delete-account', 'register-device']);
});
