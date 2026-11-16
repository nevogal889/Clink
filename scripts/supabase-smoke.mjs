#!/usr/bin/env node
// End-to-end check of the deployed M1 edge functions on clink-dev, signed in with Supabase test
// phone numbers (supabase/auth.dev.json, no SMS is sent). Happy path and refusals for
// complete-signup, register-device and delete-account, plus two Data API checks of the public key.
// Every auth user this run creates is deleted at the end (through the Management API query
// endpoint, by id), whatever happened. Dev only.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/supabase-smoke.mjs
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ROOT,
  ensureProxyEnv,
  literal,
  projectRef,
  query,
  requireDevRef,
  run,
} from './supabase/lib.mjs';

const project = JSON.parse(readFileSync(path.join(ROOT, 'supabase/projects.json'), 'utf8')).dev;
const phones = Object.entries(
  JSON.parse(readFileSync(path.join(ROOT, 'supabase/auth.dev.json'), 'utf8')).testPhones.numbers,
);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok    ' : 'FAIL  '} ${name}${detail ? `  (${detail})` : ''}`);
}

async function call(pathname, { method = 'POST', token, body, apikey = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (apikey) headers.apikey = project.publishableKey;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${project.url}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const fn = (name, opts) => call(`/functions/v1/${name}`, opts);

/** Signs in a test number with its fixed code. Returns { token, userId }. */
async function signIn([phone, code]) {
  const otp = await call('/auth/v1/otp', { body: { phone: `+${phone}` } });
  if (otp.status !== 200) throw new Error(`otp for test number failed: ${otp.status}`);
  const v = await call('/auth/v1/verify', {
    body: { phone: `+${phone}`, token: code, type: 'sms' },
  });
  if (v.status !== 200) throw new Error(`verify for test number failed: ${v.status}`);
  return { token: v.json.access_token, userId: v.json.user.id };
}

async function authUserCount(ref, ids) {
  if (!ids.length) return 0;
  const rows = await query(
    ref,
    `select count(*)::int as n from auth.users where id in (${ids.map(literal).join(',')})`,
  );
  return rows[0].n;
}

async function main() {
  ensureProxyEnv();
  const ref = projectRef();
  requireDevRef(ref);
  if (phones.length < 3) throw new Error('need 3 test phone numbers in supabase/auth.dev.json');
  const created = [];
  const year = new Date().getUTCFullYear();
  const adult = { birthMonth: 1, birthYear: year - 30, displayName: 'Smoke Test', timezone: 'Europe/Dublin' };

  try {
    // Leftovers from an earlier interrupted run would make "created" read "exists".
    await query(
      ref,
      `delete from auth.users where phone in (${phones
        .slice(0, 3)
        .map(([p]) => literal(p))
        .join(',')})`,
    );

    // Refusals before sign-in.
    const noAuth = await fn('complete-signup', { body: { ...adult, installId: randomUUID() } });
    check('complete-signup without a token is refused', noAuth.status === 401, `${noAuth.status}`);
    const keyOnly = await fn('register-device', { token: project.publishableKey, body: {} });
    check('the publishable key is not a user token', keyOnly.status === 401, `${keyOnly.status}`);

    // A: adult sign-up.
    const a = await signIn(phones[0]);
    created.push(a.userId);
    const bad = await fn('complete-signup', {
      token: a.token,
      body: { ...adult, installId: randomUUID(), userId: a.userId },
    });
    check('complete-signup refuses unknown fields (no user id in the body)', bad.status === 400 && bad.json?.error === 'bad_input', `${bad.status} ${bad.json?.error}`);
    const installId = randomUUID();
    const ok = await fn('complete-signup', { token: a.token, body: { ...adult, installId } });
    check('complete-signup creates the account', ok.status === 200 && ok.json?.status === 'created' && !!ok.json?.inviteCode, `${ok.status} ${ok.json?.status}`);
    const again = await fn('complete-signup', { token: a.token, body: { ...adult, installId } });
    check('a second complete-signup answers exists', again.status === 200 && again.json?.status === 'exists', `${again.status} ${again.json?.status}`);

    // Data API with the user's token and with the public key alone.
    const own = await call(`/rest/v1/profiles?select=id,display_name&id=eq.${a.userId}`, { method: 'GET', token: a.token });
    check('the user reads their own profile through the Data API', own.status === 200 && own.json?.[0]?.display_name === 'Smoke Test', `${own.status}`);
    const anon = await call('/rest/v1/profiles?select=id', { method: 'GET' });
    check('the public key alone reads no profiles', anon.status === 401 || (anon.status === 200 && anon.json?.length === 0), `${anon.status}`);
    const priv = await call('/rest/v1/user_private?select=*', { method: 'GET', token: a.token, apikey: true });
    check('the private schema is not reachable through the Data API', priv.status === 404 || priv.status === 401 || priv.status === 403, `${priv.status}`);

    // register-device.
    const device = { installId, platform: 'android', appVersion: '0.1.0', timezone: 'Europe/Dublin', notifPermission: false };
    const r1 = await fn('register-device', { token: a.token, body: device });
    check('register-device registers and returns a widget token', r1.status === 200 && r1.json?.status === 'registered' && !!r1.json?.widgetToken, `${r1.status} ${r1.json?.status}`);
    const r2 = await fn('register-device', { token: a.token, body: device });
    check('the widget token rotates on every call', r2.status === 200 && r2.json?.widgetToken !== r1.json?.widgetToken && r2.json?.deviceId === r1.json?.deviceId);
    const rBad = await fn('register-device', { token: a.token, body: { ...device, apnsEnv: 'sandbox' } });
    check('register-device refuses iOS-only fields on Android', rBad.status === 400 && rBad.json?.error === 'bad_input', `${rBad.status} ${rBad.json?.error}`);
    const out = await fn('register-device', { token: a.token, body: { action: 'signout', installId } });
    check('sign-out removes the device', out.status === 200 && out.json?.status === 'signed_out' && out.json?.removed === true, `${out.status} ${out.json?.removed}`);

    // B: under-age refusal leaves no account.
    const b = await signIn(phones[1]);
    created.push(b.userId);
    const young = await fn('complete-signup', {
      token: b.token,
      body: { ...adult, birthYear: year - 12, installId: randomUUID() },
    });
    check('complete-signup refuses under 16', young.status === 403 && young.json?.error === 'under_age' && young.json?.min === 16, `${young.status} ${young.json?.error} ${young.json?.min}`);
    check('... and the auth user is deleted', (await authUserCount(ref, [b.userId])) === 0);

    // delete-account.
    const dBad = await fn('delete-account', { token: a.token, body: { confirm: true } });
    check('delete-account refuses unknown fields', dBad.status === 400 && dBad.json?.error === 'bad_input', `${dBad.status} ${dBad.json?.error}`);
    const dNo = await fn('delete-account', { body: {} });
    check('delete-account without a token is refused', dNo.status === 401, `${dNo.status}`);
    const del = await fn('delete-account', { token: a.token, body: {} });
    check('delete-account deletes the account', del.status === 200 && del.json?.status === 'deleted', `${del.status} ${del.json?.status ?? del.json?.error}`);
    const left = await query(ref, `select private.account_leftovers(${literal(a.userId)}) as j`);
    check('no row or file is left for the deleted user', JSON.stringify(left[0]?.j) === '{}', JSON.stringify(left[0]?.j));
    check('... and the auth user is gone', (await authUserCount(ref, [a.userId])) === 0);
    const after = await fn('register-device', { token: a.token, body: device });
    check('the deleted user\'s token no longer registers a device', after.status !== 200, `${after.status} ${after.json?.error}`);
  } finally {
    if (created.length) {
      await query(ref, `delete from auth.users where id in (${created.map(literal).join(',')})`);
      const n = await authUserCount(ref, created);
      console.log(`cleanup: ${created.length} test user(s) created, ${n} left`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
