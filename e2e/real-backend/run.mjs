// End-to-end check of the web build against the real clink-dev backend (docs/build-notes/app-supabase.md).
//
//   npm run export:web                     # builds app/dist with the public clink-dev settings
//   SUPABASE_ACCESS_TOKEN=proxy-injected node e2e/real-backend/run.mjs
//
// Drives the app in Chromium at 390 x 844: phone sign-in with a test number and its fixed code, the
// age check, name and photo, usual 3 with details, onboarding to the camera, 2 drinks and 1 water,
// undo, the profile, a reload, then account deletion from Settings. After each part it reads the
// rows back as postgres through the Management API query endpoint. Screenshots go to
// docs/screens/real-backend/. Whatever happens, the test user and its rows are gone at the end.
//
// clink-dev only. Uses +1 201 555 0104 (the hand-testing range in supabase-connect.md).
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import {
  ensureProxyEnv,
  literal,
  projectRef,
  query,
  requireDevRef,
  ROOT,
} from '../../scripts/supabase/lib.mjs';

ensureProxyEnv();

const require = createRequire(join(ROOT, 'docs/screens/capture.mjs'));
const { chromium } = require('playwright');

const dist = join(ROOT, 'app/dist');
const shots = join(ROOT, 'docs/screens/real-backend');
const project = JSON.parse(readFileSync(join(ROOT, 'supabase/projects.json'), 'utf8')).dev;
const numbers = JSON.parse(readFileSync(join(ROOT, 'supabase/auth.dev.json'), 'utf8')).testPhones
  .numbers;
const PHONE = '12015550104';
const CODE = numbers[PHONE];
const NAME = 'Robin Tester';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(dist, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

function builtForDev() {
  const dir = join(dist, '_expo/static/js/web');
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some(
    (f) => f.startsWith('entry-') && readFileSync(join(dir, f), 'utf8').includes(project.url),
  );
}

const id = (testId) => `[data-testid="${testId}"]`;

async function tap(page, testId) {
  await page.locator(id(testId)).last().click();
}

async function waitFor(page, testId, timeout = 20_000) {
  await page.locator(id(testId)).last().waitFor({ state: 'visible', timeout });
}

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, `${name}.png`) });
}

const sql = (ref, text) => query(ref, text);

async function userId(ref) {
  const rows = await sql(ref, `select id::text from auth.users where phone = ${literal(PHONE)}`);
  return rows[0]?.id ?? null;
}

/** Fallback: delete the account through delete-account with a fresh test-number session. */
async function deleteThroughFunction() {
  const call = async (path, body, token) => {
    const res = await fetch(`${project.url}${path}`, {
      method: 'POST',
      headers: {
        apikey: project.publishableKey,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  await call('/auth/v1/otp', { phone: `+${PHONE}` });
  const v = await call('/auth/v1/verify', { phone: `+${PHONE}`, token: CODE, type: 'sms' });
  if (v.status !== 200) return v.status;
  const d = await call('/functions/v1/delete-account', {}, v.json.access_token);
  return d.status;
}

async function main() {
  const ref = projectRef();
  requireDevRef(ref);
  if (!CODE) throw new Error(`+${PHONE} is not a test number in supabase/auth.dev.json`);
  if (!builtForDev()) {
    throw new Error('app/dist is not built for clink-dev. Run `npm run export:web` first.');
  }
  mkdirSync(shots, { recursive: true });
  const startedAt = (await sql(ref, 'select now()::text as t'))[0].t;
  const ids = new Set();

  // A run that stopped half way leaves its user behind; start clean.
  const stale = await userId(ref);
  if (stale) {
    ids.add(stale);
    console.log(`removing a leftover test account: ${await deleteThroughFunction()}`);
  }

  const tmp = await mkdtemp(join(tmpdir(), 'clink-e2e-'));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(
    proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {},
  );
  const pageErrors = [];
  let shimmed = 0;
  try {
    // A stand-in photo for the picker: a plain coloured square.
    const photo = join(tmp, 'photo.png');
    {
      const p = await browser.newPage({ viewport: { width: 600, height: 600 } });
      await p.setContent('<body style="margin:0;background:#2f6f5e"></body>');
      await p.screenshot({ path: photo });
      await p.close();
    }

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      timezoneId: 'Europe/Dublin',
      locale: 'en-US',
    });
    // The edge functions answer the browser's CORS preflight with 401 and send no CORS headers
    // (native apps never preflight). This shim answers the preflight and forwards the real
    // request from Node, so the real functions still run. See app-supabase.md, "For the backend".
    await context.route(`${project.url}/functions/v1/**`, async (route) => {
      const req = route.request();
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers':
          'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      shimmed += 1;
      const res = await route.fetch();
      return route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => {
      pageErrors.push(e.message);
      console.log(`page error: ${e.message} at ${page.url()}`);
    });
    page.on('dialog', (d) => d.accept());

    // Sign in with the phone number.
    await page.goto(`${base}/`);
    await waitFor(page, 'screen-sign-in');
    await shot(page, '01-sign-in');
    await tap(page, 'signin-phone');
    await waitFor(page, 'screen-phone');
    await page.locator(id('phone-number')).last().fill('201 555 0104');
    await shot(page, '02-phone');
    await tap(page, 'phone-send');
    await waitFor(page, 'screen-code');
    await shot(page, '03-code');
    await page.locator(id('code-input')).last().fill(CODE);

    // Age check: a new identity has no profile yet.
    await waitFor(page, 'screen-age');
    const uid = await userId(ref);
    if (uid) ids.add(uid);
    check('the code signs in a new auth user', !!uid);
    const pre = await sql(
      ref,
      `select (select count(*) from public.profiles where id = ${literal(uid)})::int as profiles`,
    );
    check('no profile exists before the age check', pre[0].profiles === 0);
    await shot(page, '04-age');
    await tap(page, 'age-month');
    await tap(page, 'sheet-month-3');
    await tap(page, 'age-year');
    await tap(page, 'sheet-year-1994');
    await shot(page, '05-age-picked');
    await tap(page, 'age-continue');

    // Name and photo; Continue creates the account (complete-signup), then uploads the photo.
    await waitFor(page, 'screen-onb-name');
    await page.locator(id('name-field')).last().fill(NAME);
    const chooser = page.waitForEvent('filechooser');
    await tap(page, 'photo-button');
    await (await chooser).setFiles(photo);
    await page.waitForTimeout(800);
    await shot(page, '06-name-photo');
    await tap(page, 'onb-continue');
    await waitFor(page, 'screen-onb-usual', 30_000);

    const acct = await sql(
      ref,
      `select p.display_name, p.avatar_path, s.onboarding_step, s.timezone,
              (up.age_confirmed_at is not null) as age_ok, up.min_age_version,
              (select count(*) from public.invites i where i.inviter_id = p.id and i.revoked_at is null)::int as invites,
              (select count(*) from storage.objects o where o.bucket_id = 'avatars' and o.name = p.avatar_path)::int as files
       from public.profiles p
       join public.user_settings s on s.user_id = p.id
       join private.user_private up on up.user_id = p.id
       where p.id = ${literal(uid)}`,
    );
    const a = acct[0] ?? {};
    check('complete-signup made the profile with the typed name', a.display_name === NAME);
    check(
      'the age check is recorded, the birth date is not',
      a.age_ok === true && a.min_age_version === 1,
    );
    const birthCols = await sql(
      ref,
      `select count(*)::int as n from information_schema.columns
       where table_schema in ('public', 'private') and column_name ilike '%birth%'`,
    );
    check('no table has a birth column', birthCols[0].n === 0);
    check('the first invite code exists', a.invites === 1);
    check('the time zone came from the device', a.timezone === 'Europe/Dublin', a.timezone);
    check(
      'the photo is in the avatars bucket under the user folder',
      typeof a.avatar_path === 'string' && a.avatar_path.startsWith(`${uid}/`) && a.files === 1,
      a.avatar_path,
    );
    check('onboarding moved to step 3', a.onboarding_step === 'usual', a.onboarding_step);

    // Usual 3 with details.
    await tap(page, 'preset-preset.mix');
    await page.waitForTimeout(500);
    await tap(page, 'slot-1-details');
    const sheet = page.locator(id('sheet-details')).last();
    await sheet.getByText('Regular', { exact: true }).click();
    await sheet.getByText('Oat milk', { exact: true }).click();
    await page.waitForTimeout(300);
    await tap(page, 'details-done');
    await shot(page, '07-usual-details');
    await tap(page, 'onb-continue');
    await waitFor(page, 'screen-onb-invite');

    const usual = await sql(
      ref,
      `select slot, drink_id, category, details from public.usual_drinks
       where user_id = ${literal(uid)} order by slot`,
    );
    check('usual 3 saved as 3 slots', usual.length === 3, usual.map((u) => u.drink_id).join(', '));
    check(
      'slot 1 keeps its details',
      usual[0]?.details?.size === 'Regular' && usual[0]?.details?.milk === 'Oat milk',
      JSON.stringify(usual[0]?.details),
    );

    // Steps 4 to 6, skipped.
    await shot(page, '08-invite');
    await tap(page, 'onb-later');
    await waitFor(page, 'screen-onb-notifications');
    await tap(page, 'notif-no');
    await waitFor(page, 'screen-onb-widget');
    await tap(page, 'widget-done');
    await waitFor(page, 'widget-missing');
    await tap(page, 'widget-later');
    await waitFor(page, 'screen-camera', 30_000);
    await shot(page, '09-camera');
    const step = await sql(
      ref,
      `select onboarding_step from public.user_settings where user_id = ${literal(uid)}`,
    );
    check('onboarding is done on the server', step[0]?.onboarding_step === 'done');

    // Tracker: drink, water, drink, then undo the last drink.
    await tap(page, 'top-tracker');
    await waitFor(page, 'quick-usual-1');
    await tap(page, 'quick-usual-1');
    await page.waitForTimeout(700);
    await tap(page, 'quick-water');
    await page.waitForTimeout(700);
    await tap(page, 'quick-usual-2');
    await page.waitForTimeout(1200);
    await shot(page, '10-tracker-logged');
    const logged = await sql(
      ref,
      `select category from public.drink_logs where user_id = ${literal(uid)} order by logged_at`,
    );
    check(
      '3 logs reached the server',
      logged.length === 3,
      logged.map((l) => l.category).join(', '),
    );
    await tap(page, 'undo-last');
    await page.waitForTimeout(1500);
    await shot(page, '11-tracker-undone');
    const logs = await sql(
      ref,
      `select drink_id, category, caffeinated, local_date::text, source from public.drink_logs
       where user_id = ${literal(uid)} order by logged_at`,
    );
    check(
      'undo removed the last drink: 1 drink and 1 water left',
      logs.length === 2 && logs[0]?.category !== 'water' && logs[1]?.category === 'water',
      logs.map((l) => `${l.drink_id}`).join(', '),
    );
    check(
      'logs come from the app with a local date',
      logs.every((l) => l.source === 'app' && l.local_date),
    );
    const xp = await sql(
      ref,
      `select (select total from public.xp_totals where user_id = ${literal(uid)}) as total,
              (select count(*) from public.xp_events where user_id = ${literal(uid)} and kind = 'daily_log')::int as daily`,
    );
    check(
      'the first log of the day gave the daily XP once',
      xp[0].daily === 1 && xp[0].total === 5,
      `${xp[0].total}`,
    );

    // Profile, private level.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await tap(page, 'top-profile');
    await waitFor(page, 'screen-profile');
    await shot(page, '12-profile');
    const total = await page.locator(id('profile-total')).last().innerText();
    check('the profile shows the own XP from the server', /\b5\b/.test(total), total);

    // A reload reads everything back from the server.
    await page.goto(`${base}/`);
    await waitFor(page, 'screen-camera', 30_000);
    const drinks = await page.locator(id('top-drinks')).last().innerText();
    const water = await page.locator(id('top-water')).last().innerText();
    check(
      'after a reload the camera shows 1 drink and 1 water',
      drinks === '1' && water === '1',
      `${drinks}/${water}`,
    );
    await shot(page, '13-camera-reloaded');

    // Delete the account from Settings (the session is under 10 minutes old).
    await tap(page, 'top-settings');
    await waitFor(page, 'screen-settings');
    await tap(page, 'set-delete');
    await waitFor(page, 'screen-delete');
    await shot(page, '14-delete');
    await tap(page, 'delete-confirm');
    await waitFor(page, 'screen-sign-in', 30_000);
    await shot(page, '15-deleted');
    const gone = await sql(
      ref,
      `select (select count(*) from auth.users where id = ${literal(uid)})::int as users,
              (select count(*) from public.profiles where id = ${literal(uid)})::int as profiles,
              (select count(*) from public.drink_logs where user_id = ${literal(uid)})::int as logs,
              (select count(*) from public.usual_drinks where user_id = ${literal(uid)})::int as usual,
              (select count(*) from public.xp_events where user_id = ${literal(uid)})::int as xp,
              (select count(*) from storage.objects where bucket_id = 'avatars' and name like ${literal(`${uid}/%`)})::int as files`,
    );
    const g = gone[0];
    check(
      'delete-account removed the user, rows and photo',
      g.users + g.profiles + g.logs + g.usual + g.xp + g.files === 0,
      JSON.stringify(g),
    );
    check(
      'no uncaught errors in the page',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | '),
    );
    console.log(`function calls forwarded by the CORS shim: ${shimmed}`);
  } finally {
    await browser.close();
    server.close();
    await rm(tmp, { recursive: true, force: true });
    // Whatever failed above, nothing of this run stays on clink-dev.
    const left = await userId(ref);
    if (left) {
      ids.add(left);
      console.log(`cleanup: delete-account answered ${await deleteThroughFunction()}`);
    }
    if (ids.size) {
      const list = [...ids].map(literal).join(',');
      await sql(
        ref,
        `delete from auth.users where id in (${list});
         delete from private.install_history where user_id in (${list});
         delete from public.app_events
          where created_at >= ${literal(startedAt)}::timestamptz
            and (user_id in (${list}) or user_id is null);`,
      );
      const after = await sql(
        ref,
        `select (select count(*) from auth.users where id in (${list}))::int as users,
                (select count(*) from storage.objects where bucket_id = 'avatars'
                   and split_part(name, '/', 1) in (${list}))::int as files`,
      );
      console.log(`cleanup: ${after[0].users} test user(s) and ${after[0].files} file(s) left`);
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
