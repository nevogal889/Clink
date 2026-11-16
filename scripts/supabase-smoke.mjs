#!/usr/bin/env node
// End-to-end check of the deployed edge functions on clink-dev, signed in with Supabase test
// phone numbers (supabase/auth.dev.json, no SMS is sent). Happy path and refusals for
// complete-signup, register-device, widget-api (M2) and delete-account, plus Data API checks of
// the public key.
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

async function call(pathname, { method = 'POST', token, body, apikey = true, region } = {}) {
  // widget-api is called the way a widget calls it: the widget token only, no apikey header, and
  // x-region so the function runs next to the database.
  const headers = { 'content-type': 'application/json' };
  if (apikey) headers.apikey = project.publishableKey;
  if (region) headers['x-region'] = region;
  if (token) headers.authorization = `Bearer ${token}`;
  const started = performance.now();
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
  return { status: res.status, json, ms: Math.round(performance.now() - started) };
}

const fn = (name, opts) => call(`/functions/v1/${name}`, opts);
const widget = (route, opts = {}) =>
  call(`/functions/v1/widget-api/${route}`, { apikey: false, region: project.region, ...opts });
const isoNow = (offsetMs = 0) =>
  new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

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
  // Server time at the start, to find this run's ownerless app_events rows at cleanup.
  const startedAt = (await query(ref, 'select now()::text as t'))[0].t;
  const year = new Date().getUTCFullYear();
  const adult = {
    birthMonth: 1,
    birthYear: year - 30,
    displayName: 'Smoke Test',
    timezone: 'Europe/Dublin',
  };

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
    check(
      'complete-signup refuses unknown fields (no user id in the body)',
      bad.status === 400 && bad.json?.error === 'bad_input',
      `${bad.status} ${bad.json?.error}`,
    );
    const installId = randomUUID();
    const ok = await fn('complete-signup', { token: a.token, body: { ...adult, installId } });
    check(
      'complete-signup creates the account',
      ok.status === 200 && ok.json?.status === 'created' && !!ok.json?.inviteCode,
      `${ok.status} ${ok.json?.status}`,
    );
    const again = await fn('complete-signup', { token: a.token, body: { ...adult, installId } });
    check(
      'a second complete-signup answers exists',
      again.status === 200 && again.json?.status === 'exists',
      `${again.status} ${again.json?.status}`,
    );

    // Data API with the user's token and with the public key alone.
    const own = await call(`/rest/v1/profiles?select=id,display_name&id=eq.${a.userId}`, {
      method: 'GET',
      token: a.token,
    });
    check(
      'the user reads their own profile through the Data API',
      own.status === 200 && own.json?.[0]?.display_name === 'Smoke Test',
      `${own.status}`,
    );
    const anon = await call('/rest/v1/profiles?select=id', { method: 'GET' });
    check(
      'the public key alone reads no profiles',
      anon.status === 401 || (anon.status === 200 && anon.json?.length === 0),
      `${anon.status}`,
    );
    const priv = await call('/rest/v1/user_private?select=*', {
      method: 'GET',
      token: a.token,
      apikey: true,
    });
    check(
      'the private schema is not reachable through the Data API',
      priv.status === 404 || priv.status === 401 || priv.status === 403,
      `${priv.status}`,
    );

    // register-device.
    const device = {
      installId,
      platform: 'android',
      appVersion: '0.1.0',
      timezone: 'Europe/Dublin',
      notifPermission: false,
    };
    const r1 = await fn('register-device', { token: a.token, body: device });
    check(
      'register-device registers and returns a widget token',
      r1.status === 200 && r1.json?.status === 'registered' && !!r1.json?.widgetToken,
      `${r1.status} ${r1.json?.status}`,
    );
    const r2 = await fn('register-device', { token: a.token, body: device });
    check(
      'the widget token rotates on every call',
      r2.status === 200 &&
        r2.json?.widgetToken !== r1.json?.widgetToken &&
        r2.json?.deviceId === r1.json?.deviceId,
    );
    const rBad = await fn('register-device', {
      token: a.token,
      body: { ...device, apnsEnv: 'sandbox' },
    });
    check(
      'register-device refuses iOS-only fields on Android',
      rBad.status === 400 && rBad.json?.error === 'bad_input',
      `${rBad.status} ${rBad.json?.error}`,
    );
    // widget-api, end to end with the widget token (ARCHITECTURE.md 3, 4.4).
    const wt = r2.json?.widgetToken;
    const wNo = await widget('state', { method: 'GET' });
    check('widget-api without a token is refused', wNo.status === 401, `${wNo.status}`);
    const wOld = await widget('state', { method: 'GET', token: r1.json?.widgetToken });
    check('widget-api refuses the rotated token', wOld.status === 401, `${wOld.status}`);
    const wJwt = await widget('state', { method: 'GET', token: a.token });
    check('widget-api refuses a Supabase JWT', wJwt.status === 401, `${wJwt.status}`);
    const wOther = await fn('register-device', { token: wt, body: device });
    check('the widget token opens no other function', wOther.status === 401, `${wOther.status}`);
    const instance = '?instance=smoke-1&size=medium&audience=auto&tz=Europe/Dublin';
    const wSetup = await widget(`state${instance}`, { method: 'GET', token: wt });
    check(
      'widget-api state before onboarding is setup',
      wSetup.status === 200 && wSetup.json?.v === 1 && wSetup.json?.state === 'setup',
      `${wSetup.status} ${wSetup.json?.state ?? wSetup.json?.error}`,
    );
    const done = await call(`/rest/v1/user_settings?user_id=eq.${a.userId}`, {
      method: 'PATCH',
      token: a.token,
      body: { onboarding_step: 'done' },
    });
    const usual = await call('/rest/v1/usual_drinks', {
      token: a.token,
      body: {
        user_id: a.userId,
        slot: 1,
        drink_id: 'coffee.flat_white',
        category: 'coffee',
        details: { caf: 'Decaf', milk: 'Oat milk' },
      },
    });
    check(
      'the app finishes onboarding and saves usual #1 through the Data API',
      done.status === 204 && usual.status === 201,
      `${done.status} ${usual.status}`,
    );
    const wReady = await widget(`state${instance}`, { method: 'GET', token: wt });
    const st = wReady.json;
    check(
      'widget-api state is ready with usual #1 and empty counts',
      wReady.status === 200 &&
        st?.state === 'ready' &&
        st?.me?.initial === 'S' &&
        st?.usual?.[0]?.drinkShort === 'Flat White' &&
        st?.usual?.[0]?.summary === 'Decaf · Oat milk' &&
        st?.today?.drinks === 0 &&
        st?.today?.water === 0 &&
        Array.isArray(st?.incoming) &&
        Array.isArray(st?.outbox),
      `${wReady.status} ${st?.state ?? st?.error}`,
    );
    const added = await query(
      ref,
      `select count(*)::int as n from public.app_events
        where user_id = ${literal(a.userId)} and name = 'widget_added'`,
    );
    check('widget_added is recorded once for the instance', added[0].n === 1, `${added[0].n}`);
    const logId = randomUUID();
    const logBody = {
      id: logId,
      drinkId: 'coffee.flat_white',
      slot: 1,
      category: 'coffee',
      loggedAt: isoNow(-60_000),
      timeZone: 'Europe/Dublin',
    };
    const l1 = await widget('log', { token: wt, body: logBody });
    check(
      'widget-api logs a drink (Decaf from the saved order)',
      l1.status === 200 &&
        l1.json?.status === 'logged' &&
        l1.json?.today?.drinks === 1 &&
        l1.json?.today?.caffeinated === 0,
      `${l1.status} ${l1.json?.status ?? l1.json?.error}`,
    );
    const l2 = await widget('log', { token: wt, body: logBody });
    check(
      'the same log id again is a duplicate and counts once',
      l2.status === 200 && l2.json?.status === 'duplicate' && l2.json?.today?.drinks === 1,
      `${l2.status} ${l2.json?.status ?? l2.json?.error}`,
    );
    const l3 = await widget('log', {
      token: wt,
      body: { ...logBody, id: randomUUID(), drinkId: 'water.still', slot: null, category: 'water' },
    });
    check(
      'widget-api logs water',
      l3.status === 200 && l3.json?.today?.water === 1,
      `${l3.status} ${l3.json?.error ?? ''}`,
    );
    const l4 = await widget('log', {
      token: wt,
      body: { ...logBody, id: randomUUID(), drinkId: 'coffee.not_a_drink' },
    });
    check(
      'widget-api refuses an unknown drink',
      l4.status === 422 && l4.json?.error === 'unknown_drink',
      `${l4.status} ${l4.json?.error}`,
    );
    const l5 = await widget('log', { token: wt, body: { ...logBody, userId: a.userId } });
    check(
      'widget-api refuses a user id in the body',
      l5.status === 400 && l5.json?.error === 'bad_input',
      `${l5.status} ${l5.json?.error}`,
    );
    const stored = await query(
      ref,
      `select source, caffeinated, local_date::text as d from public.drink_logs where id = ${literal(logId)}`,
    );
    check(
      'the widget log is stored once, from the widget',
      stored.length === 1 && stored[0].source === 'widget' && stored[0].caffeinated === false,
      JSON.stringify(stored[0] ?? null),
    );
    const wAfter = await widget('state?tz=Europe/Dublin', { method: 'GET', token: wt });
    // The widget gives up after 8 s (ARCHITECTURE.md 3.2); warm calls should be far inside it.
    const slowest = Math.max(wReady.ms, l1.ms, l2.ms, wAfter.ms);
    check(
      'widget-api answers inside the 8 s widget timeout',
      slowest < 8000,
      `state ${wReady.ms} ms, log ${l1.ms} ms, retry ${l2.ms} ms, state ${wAfter.ms} ms`,
    );
    check(
      'widget-api state shows the counts',
      wAfter.json?.today?.drinks === 1 && wAfter.json?.today?.water === 1,
      `${wAfter.json?.today?.drinks} ${wAfter.json?.today?.water}`,
    );

    const out = await fn('register-device', {
      token: a.token,
      body: { action: 'signout', installId },
    });
    check(
      'sign-out removes the device',
      out.status === 200 && out.json?.status === 'signed_out' && out.json?.removed === true,
      `${out.status} ${out.json?.removed}`,
    );
    const wGone = await widget('state', { method: 'GET', token: wt });
    check('after sign-out the widget token is refused', wGone.status === 401, `${wGone.status}`);

    // Another account on the same install revokes the first account's widget token.
    const r3 = await fn('register-device', { token: a.token, body: device });
    const c = await signIn(phones[2]);
    created.push(c.userId);
    const cUp = await fn('complete-signup', {
      token: c.token,
      body: { ...adult, displayName: 'Smoke Other', installId: randomUUID() },
    });
    const cReg = await fn('register-device', { token: c.token, body: device });
    const wMoved = await widget('state', { method: 'GET', token: r3.json?.widgetToken });
    const wC = await widget('state', { method: 'GET', token: cReg.json?.widgetToken });
    check(
      'another account registering the same install revokes the old widget token',
      cUp.status === 200 && cReg.status === 200 && wMoved.status === 401 && wC.status === 200,
      `${cUp.status} ${cReg.status} ${wMoved.status} ${wC.status}`,
    );

    // B: under-age refusal leaves no account.
    const b = await signIn(phones[1]);
    created.push(b.userId);
    const young = await fn('complete-signup', {
      token: b.token,
      body: { ...adult, birthYear: year - 12, installId: randomUUID() },
    });
    check(
      'complete-signup refuses under 16',
      young.status === 403 && young.json?.error === 'under_age' && young.json?.min === 16,
      `${young.status} ${young.json?.error} ${young.json?.min}`,
    );
    check('... and the auth user is deleted', (await authUserCount(ref, [b.userId])) === 0);

    // delete-account.
    const dBad = await fn('delete-account', { token: a.token, body: { confirm: true } });
    check(
      'delete-account refuses unknown fields',
      dBad.status === 400 && dBad.json?.error === 'bad_input',
      `${dBad.status} ${dBad.json?.error}`,
    );
    const dNo = await fn('delete-account', { body: {} });
    check('delete-account without a token is refused', dNo.status === 401, `${dNo.status}`);
    const del = await fn('delete-account', { token: a.token, body: {} });
    check(
      'delete-account deletes the account',
      del.status === 200 && del.json?.status === 'deleted',
      `${del.status} ${del.json?.status ?? del.json?.error}`,
    );
    const left = await query(ref, `select private.account_leftovers(${literal(a.userId)}) as j`);
    check(
      'no row or file is left for the deleted user',
      JSON.stringify(left[0]?.j) === '{}',
      JSON.stringify(left[0]?.j),
    );
    check('... and the auth user is gone', (await authUserCount(ref, [a.userId])) === 0);
    const after = await fn('register-device', { token: a.token, body: device });
    check(
      "the deleted user's token no longer registers a device",
      after.status !== 200,
      `${after.status} ${after.json?.error}`,
    );
  } finally {
    if (created.length) {
      const ids = created.map(literal).join(',');
      // Deleting the account keeps install_history (30 days, invite abuse rule) and an ownerless
      // account_deleted event by design. They are this run's test data, so they go too.
      await query(
        ref,
        `delete from auth.users where id in (${ids});
         delete from private.install_history where user_id in (${ids});
         delete from private.rate_counters where user_id in (${ids});
         delete from public.app_events
          where created_at >= ${literal(startedAt)}::timestamptz
            and (user_id in (${ids}) or user_id is null);`,
      );
      const n = await authUserCount(ref, created);
      console.log(`cleanup: ${created.length} test user(s) created, ${n} left`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) run(main);
