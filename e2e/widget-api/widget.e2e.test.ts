// End to end on clink-dev (M2): the app's own data layer (app/src/lib/api/supabase.ts) signs in
// a test phone number, finishes the account, saves usual 3 and registers the device for Android;
// then the widget's calls go out exactly as the Kotlin worker sends them
// (app/modules/clink-native/android/.../net/WidgetApi.kt): GET state with instance, size and tz,
// POST log with {id, drinkId, slot, category, loggedAt, timeZone}, the widget token as the only
// credential and x-region. Rows are checked as postgres through the Management API. The app's
// tracker then reads the widget's logs once each, sign-out revokes the token, and the account is
// deleted through the app's own delete path. Everything the run creates is removed at the end.
//
// Run (dev only; the proxy adds the real Management API token, which is never read here):
//   NODE_USE_ENV_PROXY=1 SUPABASE_ACCESS_TOKEN=proxy-injected CLINK_E2E=1 \
//     npx jest -c e2e/widget-api/jest.config.js
// The widget token, the access token and the state body are never printed.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { widgetLogResponse, widgetStateSchema, type WidgetState } from '@clink/shared';
// supabase-js is the app workspace's dependency (jest.config.js modulePaths).
// eslint-disable-next-line import/no-unresolved
import { createClient } from '@supabase/supabase-js';

import { createSupabaseApi } from '../../app/src/lib/api/supabase';
import type { ClinkApi } from '../../app/src/lib/api/types';
import { memoryStore } from '../../app/src/lib/kv';

const ROOT = path.resolve(__dirname, '../..');
const project = JSON.parse(readFileSync(path.join(ROOT, 'supabase/projects.json'), 'utf8')).dev as {
  ref: string;
  url: string;
  region: string;
  publishableKey: string;
};
const phones = JSON.parse(readFileSync(path.join(ROOT, 'supabase/auth.dev.json'), 'utf8'))
  .testPhones.numbers as Record<string, string>;
// +1 201 555 0105: the hand-testing range in docs/build-notes/supabase-connect.md.
const PHONE = '12015550105';
const CODE = phones[PHONE]!;
const ZONE = 'Europe/Dublin';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const RUN = process.env.CLINK_E2E === '1';
const suite = RUN ? describe : describe.skip;

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  if (project.ref !== 'tppolgvuckjtxsheskat') throw new Error('clink-dev only');
  const res = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API query failed: ${res.status}`);
  return (await res.json()) as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A widget-api call shaped like HttpWidgetApi.open(): bearer widget token, Accept, x-region. */
async function widgetCall(
  route: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: unknown; ms: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'x-region': project.region,
  };
  if (body) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  const res = await fetch(`${project.url}/functions/v1/widget-api/${route}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, ms: Math.round(performance.now() - started) };
}

/** Instant.toString() of a whole-second instant: what the Kotlin outbox stores as loggedAt. */
const kotlinInstant = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** HttpWidgetApi.logBody(): every key present, nulls included. */
function logBody(drinkId: string | null, slot: number | null, category: string, at: Date) {
  return {
    id: randomUUID(),
    drinkId,
    slot,
    category,
    loggedAt: kotlinInstant(at),
    timeZone: ZONE,
  };
}

function appApi() {
  const sealed = memoryStore();
  const client = createClient(project.url, project.publishableKey, {
    auth: {
      storage: memoryStore(),
      storageKey: 'clink.auth',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const api = createSupabaseApi({
    client,
    sealed,
    plain: memoryStore(),
    platform: 'android',
    appVersion: '0.1.0',
    timezone: () => ZONE,
    locale: () => 'en-IE',
    widgetApi: { url: project.url, region: project.region },
  });
  return { api, sealed };
}

suite('widget end to end on clink-dev', () => {
  let startedAt = '';
  let userId: string | null = null;
  let app: ClinkApi;
  let sealed: ReturnType<typeof memoryStore>;
  let token = '';
  const logIds: string[] = [];
  const latencies: number[] = [];

  beforeAll(async () => {
    startedAt = (await sql<{ t: string }>('select now()::text as t'))[0]!.t;
    // A run that stopped early leaves its user; start clean.
    await sql(`delete from auth.users where phone = ${lit(PHONE)}`);
    ({ api: app, sealed } = appApi());
  });

  afterAll(async () => {
    const ids = userId ? lit(userId) : null;
    const leftovers = ids
      ? `delete from auth.users where id = ${ids};
         delete from private.install_history where user_id = ${ids};
         delete from private.rate_counters where user_id = ${ids};`
      : '';
    await sql(
      `${leftovers}
       delete from auth.users where phone = ${lit(PHONE)};
       delete from public.app_events
        where created_at >= ${lit(startedAt)}::timestamptz
          and (${ids ? `user_id = ${ids} or ` : ''}user_id is null);`,
    );
    if (userId) {
      const left = await sql<{ n: number }>(
        `select (select count(*) from auth.users where id = ${lit(userId)})::int
              + (select count(*) from public.drink_logs where user_id = ${lit(userId)})::int
              + (select count(*) from public.app_events where user_id = ${lit(userId)})::int as n`,
      );
      expect(left[0]!.n).toBe(0);
    }
    if (latencies.length) {
      const sorted = [...latencies].sort((a, b) => a - b);
      console.log(
        `widget-api calls: ${sorted.length}, median ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted.at(-1)} ms`,
      );
    }
  });

  it('signs in and finishes the account with the app data layer', async () => {
    await app.sendPhoneCode(`+${PHONE}`);
    const session = await app.verifyPhoneCode(`+${PHONE}`, CODE);
    userId = session.userId;
    expect((await app.getMe()).needsSignup).toBe(true);
    // Before the account exists register-device has nothing to register.
    expect(await app.registerDevice()).toBeNull();
    await app.completeSignup(
      { birthMonth: 1, birthYear: new Date().getUTCFullYear() - 30 },
      'Wren Widget',
    );
    await app.setUsual([
      {
        drinkId: 'coffee.flat_white',
        customName: null,
        category: 'coffee',
        details: { caf: 'Decaf' },
      },
      { drinkId: null, customName: 'Office brew', category: 'tea', details: {} },
    ]);
    const me = await app.updateMe({ onboarding: 'done' });
    expect(me).toMatchObject({ needsSignup: false, onboarding: 'done' });
  });

  it('register-device for android returns a widget token, kept sealed by the app', async () => {
    const reg = await app.registerDevice();
    expect(reg).not.toBeNull();
    token = reg!.widgetToken;
    expect(TOKEN_RE.test(token)).toBe(true);
    expect(await sealed.getItem(`widget_token.${userId}`)).toBe(token);
    const rows = await sql<{ platform: string; creds: number }>(
      `select d.platform,
              (select count(*) from private.widget_credentials c
                where c.device_id = d.id and c.revoked_at is null)::int as creds
         from public.push_devices d where d.user_id = ${lit(userId!)}`,
    );
    expect(rows).toEqual([{ platform: 'android', creds: 1 }]);
  });

  it("the app's state read (setWidgetState input) is ready and passes the shared schema", async () => {
    const state = (await app.getWidgetState(ZONE)) as Extract<WidgetState, { state: 'ready' }>;
    expect(state.state).toBe('ready');
    expect(state.me.initial).toBe('W');
    expect(state.usual.map((u) => [u.slot, u.drinkId, u.name])).toEqual([
      [1, 'coffee.flat_white', 'Flat White'],
      [2, null, 'Office brew'],
    ]);
    expect(state.usual[0]!.hasDetails).toBe(true);
    expect(state.today).toMatchObject({ drinks: 0, water: 0, caffeinated: 0, lastDrinkAt: null });
    expect(state.outbox).toEqual([]);
  });

  it('GET state as the widget sends it records widget_added once for the instance', async () => {
    const q = `instance=4242&size=medium&tz=${encodeURIComponent(ZONE)}`;
    for (let i = 0; i < 2; i++) {
      const r = await widgetCall(`state?${q}`, token);
      latencies.push(r.ms);
      expect(r.status).toBe(200);
      expect(widgetStateSchema.safeParse(r.json).success).toBe(true);
    }
    const plain = await widgetCall(`state?tz=${encodeURIComponent(ZONE)}`, token);
    expect(plain.status).toBe(200);
    const rows = await sql<{ instances: number; added: number }>(
      `select (select count(*) from private.widget_instances i
                 join public.push_devices d on d.id = i.device_id
                where d.user_id = ${lit(userId!)})::int as instances,
              (select count(*) from public.app_events
                where user_id = ${lit(userId!)} and name = 'widget_added')::int as added`,
    );
    expect(rows[0]).toEqual({ instances: 1, added: 1 });
  });

  it('POST log: the usual #1 (saved Decaf), a duplicate, water, the custom slot, a late replay', async () => {
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const first = logBody('coffee.flat_white', 1, 'coffee', now);
    const r1 = await widgetCall('log', token, first);
    latencies.push(r1.ms);
    expect(r1.status).toBe(200);
    const a1 = widgetLogResponse.parse(r1.json);
    expect(a1).toMatchObject({ status: 'logged', id: first.id });
    expect(a1.today).toMatchObject({ drinks: 1, water: 0, caffeinated: 0 });
    logIds.push(first.id);

    // The outbox retries the same entry: the server says duplicate and nothing changes.
    const r2 = await widgetCall('log', token, first);
    expect(r2.status).toBe(200);
    expect(widgetLogResponse.parse(r2.json)).toMatchObject({
      status: 'duplicate',
      today: { drinks: 1 },
    });

    const water = logBody('water.still', null, 'water', now);
    const r3 = await widgetCall('log', token, water);
    expect(widgetLogResponse.parse(r3.json).today).toMatchObject({ drinks: 1, water: 1 });
    logIds.push(water.id);

    const custom = logBody(null, 2, 'tea', now);
    const r4 = await widgetCall('log', token, custom);
    expect(widgetLogResponse.parse(r4.json).today).toMatchObject({ drinks: 2, caffeinated: 1 });
    logIds.push(custom.id);

    // Airplane mode, then online: the entry keeps its original time.
    const late = logBody('coffee.flat_white', 1, 'coffee', new Date(now.getTime() - 10 * 60_000));
    const r5 = await widgetCall('log', token, late);
    const a5 = widgetLogResponse.parse(r5.json);
    expect(a5.today).toMatchObject({ drinks: 3, water: 1, caffeinated: 1 });
    expect(a5.today.lastDrinkAt).toBe(kotlinInstant(now));
    logIds.push(late.id);

    // A body the Kotlin decoder would never send is refused and dropped by the widget.
    const bad = await widgetCall('log', token, { ...logBody('water.still', 1, 'water', now) });
    expect(bad.status).toBe(400);
  });

  it('the rows are the widget logs, written once each', async () => {
    const rows = await sql<{
      id: string;
      source: string;
      drink_id: string | null;
      caffeinated: boolean;
    }>(
      `select id::text, source, drink_id, caffeinated from public.drink_logs
        where user_id = ${lit(userId!)} order by logged_at, id`,
    );
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set(logIds));
    expect(rows.every((r) => r.source === 'widget')).toBe(true);
    const flatWhites = rows.filter((r) => r.drink_id === 'coffee.flat_white');
    expect(flatWhites.map((r) => r.caffeinated)).toEqual([false, false]);
  });

  it("the app's tracker shows each widget log once, and its next state read agrees", async () => {
    const today = await app.getToday();
    expect(today.map((e) => e.id).sort()).toEqual([...logIds].sort());
    expect(today.find((e) => e.drinkId === null)?.customName).toBe('Office brew');
    const state = (await app.getWidgetState(ZONE)) as Extract<WidgetState, { state: 'ready' }>;
    expect(state.today).toMatchObject({ drinks: 3, water: 1, caffeinated: 1 });
  });

  it('a new register-device rotates the token: the old one is refused at once', async () => {
    const old = token;
    const reg = await app.registerDevice();
    token = reg!.widgetToken;
    expect(token).not.toBe(old);
    expect((await widgetCall('state', old)).status).toBe(401);
    expect((await widgetCall('state', token)).status).toBe(200);
  });

  it('sign-out revokes the widget token and the app forgets it', async () => {
    await app.signOut();
    expect(await sealed.getItem(`widget_token.${userId}`)).toBeNull();
    expect((await widgetCall('state', token)).status).toBe(401);
    const log = await widgetCall('log', token, logBody('water.still', null, 'water', new Date()));
    expect(log.status).toBe(401);
    const rows = await sql<{ n: number }>(
      `select count(*)::int as n from public.push_devices where user_id = ${lit(userId!)}`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('account deletion through the app removes the logs', async () => {
    await app.verifyPhoneCode(`+${PHONE}`, CODE);
    expect(await app.registerDevice()).not.toBeNull();
    await app.deleteAccount();
    const left = await sql<{ j: unknown }>(
      `select private.account_leftovers(${lit(userId!)}) as j`,
    );
    expect(left[0]!.j).toEqual({});
  });
});
