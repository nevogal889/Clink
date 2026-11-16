// widget-api against the local test database: the widget token is issued by the real
// register-device handler, then used on GET state and POST log. Happy paths, every limit and every
// refusal: no token, wrong token, revoked token, another user's data, duplicate id, unknown drink.
// Skipped when CLINK_TEST_DB_URL is not set (supabase/tests/README.md).
import { assert, assertEquals, assertFalse } from '@std/assert';
import { registerDevice } from '../register-device/handler.ts';
import { widgetApi } from '../widget-api/handler.ts';
import { isoSeconds } from '../widget-api/state.ts';
import { widgetLogResponse } from '../_shared/shared/api/index.ts';
import { localDateAt, widgetStateSchema } from '../_shared/shared/widget-state/index.ts';
import { cleanup, db, fakes, hasDb, post, signedUpUser, token } from './helpers.ts';
import type postgres from 'postgres';

const opts = { ignore: !hasDb, sanitizeResources: false, sanitizeOps: false };

type Sql = postgres.Sql;

/** Registers an Android device through register-device and returns its widget token. */
async function widgetToken(sql: Sql, userId: string, installId = crypto.randomUUID()) {
  const res = await registerDevice(fakes(sql).deps)(
    post(await token(userId), {
      installId,
      platform: 'android',
      appVersion: '1.0.0',
      timezone: 'Europe/London',
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  return { token: body.widgetToken as string, installId, deviceId: body.deviceId as string };
}

async function readyUser(sql: Sql, name: string): Promise<string> {
  const id = await signedUpUser(sql, name);
  await sql`update public.user_settings set onboarding_step = 'done' where user_id = ${id}`;
  return id;
}

function get(wt: string | null, query = '', path = 'state'): Request {
  const headers: Record<string, string> = {};
  if (wt !== null) headers.authorization = `Bearer ${wt}`;
  return new Request(`http://local/widget-api/${path}${query}`, { headers });
}

function postLog(wt: string | null, body: unknown, path = 'log'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (wt !== null) headers.authorization = `Bearer ${wt}`;
  return new Request(`http://local/widget-api/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const minutesAgo = (m: number) => isoSeconds(new Date(Date.now() - m * 60_000));
const logBody = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  drinkId: 'coffee.flat_white',
  slot: 1,
  category: 'coffee',
  loggedAt: minutesAgo(2),
  ...over,
});

async function befriend(sql: Sql, a: string, b: string) {
  await sql`insert into public.friendships (user_a, user_b)
            values (least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid))`;
}

Deno.test({ name: 'widget-api: auth refusals', ...opts }, async () => {
  const sql = db();
  const api = widgetApi(fakes(sql).deps);
  const id = await readyUser(sql, 'Dana');
  try {
    const { token: wt, installId } = await widgetToken(sql, id);
    const refused = async (req: Request, why: string) => {
      const res = await api(req);
      assertEquals(res.status, 401, why);
      assertEquals(await res.json(), { error: 'unauthorized' }, why);
    };
    await refused(get(null), 'no token');
    await refused(get('not-a-token'), 'malformed token');
    await refused(get('A'.repeat(43)), 'wrong token of the right shape');
    await refused(get(await token(id)), 'a Supabase JWT is not a widget token');
    await refused(postLog(null, logBody()), 'no token on log');
    // No user id parameter is ever read: a stranger naming a user gets nothing.
    await refused(get(null, `?userId=${id}`), 'a user id parameter is not auth');

    assertEquals((await api(get(wt))).status, 200, 'the fresh token works');
    const { token: rotated } = await widgetToken(sql, id, installId);
    await refused(get(wt), 'the previous token stops working when the device registers again');
    assertEquals((await api(get(rotated))).status, 200);

    // Another account registers the same install (no push token): the old token is revoked.
    const other = await readyUser(sql, 'Other');
    try {
      const { token: otherWt } = await widgetToken(sql, other, installId);
      await refused(get(rotated), 'another account on the same device revokes the token');
      assertEquals((await api(get(otherWt))).status, 200);
    } finally {
      await cleanup(sql, [other]);
    }

    // Sign-out revokes.
    const { token: wt3, installId: install3 } = await widgetToken(sql, id);
    await registerDevice(fakes(sql).deps)(
      post(await token(id), { action: 'signout', installId: install3 }),
    );
    await refused(get(wt3), 'signed out');

    // Suspension revokes; the token does not come back when the suspension is lifted.
    const { token: wt4 } = await widgetToken(sql, id);
    await sql`select private.suspend_user(${id}, 'spam', 'test')`;
    await refused(get(wt4), 'suspended');
    await sql`select private.lift_suspension(${id}, 'test')`;
    await refused(get(wt4), 'lifting does not restore the token');
  } finally {
    await cleanup(sql, [id]);
    await sql.end();
  }
});

Deno.test({ name: 'widget-api: routes and methods', ...opts }, async () => {
  const sql = db();
  const api = widgetApi(fakes(sql).deps);
  const id = await readyUser(sql, 'Dana');
  try {
    const { token: wt } = await widgetToken(sql, id);
    assertEquals((await api(get(wt, '', 'nope'))).status, 404);
    assertEquals((await api(postLog(wt, logBody(), 'state'))).status, 405);
    assertEquals((await api(get(wt, '', 'log'))).status, 405);
    const bad = await api(get(wt, '?instance=17'));
    assertEquals(bad.status, 400, 'instance without size');
    assertEquals(await bad.json(), { error: 'bad_input' });
    assertEquals((await api(get(wt, '?size=huge&instance=1'))).status, 400);
    assertEquals((await api(get(wt, '?userId=x'))).status, 400, 'unknown query keys are refused');
  } finally {
    await cleanup(sql, [id]);
    await sql.end();
  }
});

Deno.test({ name: 'widget-api: GET state, setup and ready', ...opts }, async () => {
  const sql = db();
  const api = widgetApi(fakes(sql).deps);
  const id = await signedUpUser(sql, 'dana Smith');
  try {
    const { token: wt, deviceId } = await widgetToken(sql, id);

    const setup = await api(get(wt));
    assertEquals(setup.status, 200);
    const s0 = await setup.json();
    assertEquals(s0.state, 'setup', 'onboarding unfinished');
    assert(widgetStateSchema.safeParse(s0).success);

    await sql`update public.user_settings set onboarding_step = 'done' where user_id = ${id}`;
    await sql`insert into public.usual_drinks (user_id, slot, drink_id, custom_name, category, details) values
      (${id}, 1, 'coffee.flat_white', null, 'coffee', ${sql.json({ temp: 'Iced', milk: 'Oat milk', shots: 'Double shot' })}),
      (${id}, 2, null, 'Grandma special blend', 'tea', '{}'),
      (${id}, 3, 'matcha.ceremonial', null, 'matcha', '{}')`;
    const today = localDateAt(new Date(), 'Europe/London');
    await sql`insert into public.drink_logs (id, user_id, drink_id, drink_name, category, caffeinated, logged_at, local_date, source) values
      (${crypto.randomUUID()}, ${id}, 'coffee.flat_white', 'Flat White', 'coffee', true, now() - interval '3 hours', ${today}::date, 'app'),
      (${crypto.randomUUID()}, ${id}, 'water.still', 'Water', 'water', false, now() - interval '1 minute', ${today}::date, 'app'),
      (${crypto.randomUUID()}, ${id}, 'tea.chamomile', 'Chamomile', 'tea', false, now() - interval '30 minutes', ${today}::date, 'app'),
      (${crypto.randomUUID()}, ${id}, 'coffee.espresso', 'Espresso', 'coffee', true, now() - interval '3 days', ${today}::date - 3, 'app')`;

    const res = await api(get(wt, '?instance=42&size=medium&audience=auto&tz=Europe/London'));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('cache-control'), 'no-store');
    const s = await res.json();
    const parsed = widgetStateSchema.safeParse(s);
    assert(parsed.success, 'the state decodes with the shared schema');
    assertEquals(s.state, 'ready');
    assertEquals(s.me, { initial: 'D', friendsCount: 0 });
    assertEquals(s.usual.length, 3);
    assertEquals(s.usual[0], {
      slot: 1,
      drinkId: 'coffee.flat_white',
      category: 'coffee',
      name: 'Flat White',
      drinkShort: 'Flat White',
      summary: 'Iced · Double shot · Oat milk',
      hasDetails: true,
    });
    assertEquals(s.usual[1].drinkShort, 'Grandma specia…');
    assertEquals(s.usual[1].drinkId, null);
    assertEquals(s.today.localDate, today);
    assertEquals([s.today.drinks, s.today.water, s.today.caffeinated], [2, 1, 1]);
    assert(
      Date.now() - Date.parse(s.today.lastDrinkAt) > 25 * 60_000,
      'last drink is the latest non-water log of today (the chamomile), not the water',
    );
    assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s.updatedAt), 'timestamps to the second');
    assertEquals(
      [s.groups, s.incoming, s.snaps, s.outbox, s.myFlare, s.lastPlace],
      [[], [], [], [], null, null],
    );
    assertEquals(s.auto, { daytimeGroupId: null, otherGroupId: null });
    const text = JSON.stringify(s);
    for (const banned of ['xp', 'level', 'phone', 'total']) {
      assertFalse(text.toLowerCase().includes(`"${banned}`), `no ${banned} field`);
    }

    // widget_added once per instance (3.5).
    await api(get(wt, '?instance=42&size=medium&audience=auto'));
    await api(get(wt, '?instance=43&size=small'));
    const events = await sql`select props from public.app_events
                             where user_id = ${id} and name = 'widget_added' order by id`;
    assertEquals(
      events.map((e) => e.props),
      [
        { size: 'medium', audience_type: 'auto' },
        { size: 'small', audience_type: null },
      ],
    );
    assertEquals(
      (
        await sql`select count(*)::int as n from private.widget_instances where device_id = ${deviceId}`
      )[0]?.n,
      2,
    );
    // The app calls state without an instance: nothing is recorded.
    await api(get(wt));
    assertEquals(
      (
        await sql`select count(*)::int as n from public.app_events where user_id = ${id} and name = 'widget_added'`
      )[0]?.n,
      2,
    );
  } finally {
    await cleanup(sql, [id]);
    await sql.end();
  }
});

Deno.test(
  { name: "widget-api: another user's data, groups, flares, snaps and the block case", ...opts },
  async () => {
    const sql = db();
    const api = widgetApi(fakes(sql).deps);
    const me = await readyUser(sql, 'Dana');
    const maya = await readyUser(sql, 'Maya Cohen');
    const stranger = await readyUser(sql, 'Stranger');
    try {
      await befriend(sql, me, maya);
      const { token: wt } = await widgetToken(sql, me);
      // Maya's private data: logs, water, usual. None of it may reach Dana's widget.
      const today = localDateAt(new Date(), 'UTC');
      await sql`insert into public.drink_logs (id, user_id, drink_id, drink_name, category, caffeinated, logged_at, local_date, source)
        values (${crypto.randomUUID()}, ${maya}, 'water.still', 'Water', 'water', false, now(), ${today}::date, 'app')`;
      await sql`update public.profiles set avatar_path = ${maya + '/1.jpg'} where id = ${maya}`;
      // A group with Maya and a stranger who is not a friend.
      const [g] = await sql`insert into public.groups (owner_id, name, emoji, auto_role)
                            values (${me}, 'Work', '🏢', 'work') returning id`;
      await sql`insert into public.group_members (group_id, member_id) values (${g!.id}, ${maya}), (${g!.id}, ${stranger})`;
      // Maya flares to everyone and posts a snap; the stranger does too.
      const [mf] =
        await sql`select (private.create_flare(${maya}, 'matcha', 'matcha.ceremonial', 'Ceremonial Matcha',
                               'Café Lumi', 0, now(), 'everyone', null, 'UTC', 'app', false)->>'flare_id') as id`;
      await sql`select private.create_flare(${stranger}, 'coffee', null, 'Mystery', null, 0, now(), 'everyone', null, 'UTC', 'app', false)`;
      const snapId = crypto.randomUUID();
      await sql`insert into public.snaps (id, sender_id, image_path, thumb_path, place)
                values (${snapId}, ${maya}, ${`${maya}/${snapId}.jpg`}, ${`${maya}/${snapId}_t.jpg`}, 'Office kitchen')`;
      // Dana's own live flare with Maya bringing.
      await sql`insert into public.usual_drinks (user_id, slot, drink_id, category, details)
                values (${maya}, 1, 'coffee.cortado', 'coffee', ${sql.json({ note: 'extra hot please' })})`;
      const [df] =
        await sql`select (private.create_flare(${me}, 'coffee', 'coffee.cortado', 'Cortado', 'Kaffa Roastery',
                               15, now(), 'everyone', null, 'UTC', 'app', false)->>'flare_id') as id`;
      await sql`select private.respond_flare(${maya}, ${df!.id}, 'bring', 1::smallint, null, 'app')`;
      await sql`select private.respond_flare(${me}, ${mf!.id}, 'in', null, null, 'widget')`;

      const s = await (await api(get(wt, '?tz=UTC'))).json();
      assert(widgetStateSchema.safeParse(s).success);
      assertEquals(s.me.friendsCount, 1);
      assertEquals([s.today.drinks, s.today.water], [0, 0], "Maya's water is not Dana's");
      assertEquals(s.groups, [
        { id: g!.id, name: 'Work', emoji: '🏢', memberCount: 1, avatarFiles: [`a_${maya}_1.jpg`] },
      ]);
      assertEquals(s.auto, { daytimeGroupId: g!.id, otherGroupId: null });
      assertEquals(s.lastPlace, 'Kaffa Roastery');
      assertEquals(s.myFlare.id, df!.id);
      assertEquals(s.myFlare.label, 'coffee');
      assertEquals(s.myFlare.audience, { type: 'everyone', groupId: null });
      assertEquals(s.myFlare.replies, [
        { name: 'Maya', kind: 'bring', drinkShort: 'Cortado', hasNotes: true },
      ]);
      assertEquals(s.incoming.length, 1, "only Maya's flare: the stranger's never reached Dana");
      assertEquals(s.incoming[0].flareId, mf!.id);
      assertEquals(s.incoming[0].senderName, 'Maya');
      assertEquals(s.incoming[0].avatarFile, `a_${maya}_1.jpg`);
      assertEquals(s.incoming[0].myResponse, { kind: 'in' });
      assertEquals(s.incoming[0].wants, 'matcha');
      assertEquals(
        s.snaps.map((x: { id: string }) => x.id),
        [snapId],
      );
      assertEquals(s.snaps[0].thumbFile, `s_${maya}_${snapId}_t.jpg`);
      assertFalse(
        JSON.stringify(s).includes('extra hot please'),
        'note text never reaches the widget',
      );

      // M-03: once Dana blocks Maya, Maya's flare, snap and group membership vanish.
      await sql`select private.block_user(${me}, ${maya})`;
      const after = await (await api(get(wt))).json();
      assert(widgetStateSchema.safeParse(after).success);
      assertEquals(after.incoming, []);
      assertEquals(after.snaps, []);
      assertEquals(after.me.friendsCount, 0);
      assertEquals(after.groups[0].memberCount, 0);
      assertEquals(after.groups[0].avatarFiles, []);
      assertEquals(after.myFlare.replies, [], 'the block removed her reply');
    } finally {
      await cleanup(sql, [me, maya, stranger]);
      await sql.end();
    }
  },
);

Deno.test({ name: 'widget-api: POST log happy paths and idempotency', ...opts }, async () => {
  const sql = db();
  const api = widgetApi(fakes(sql).deps);
  const id = await readyUser(sql, 'Dana');
  try {
    const { token: wt } = await widgetToken(sql, id);
    await sql`insert into public.usual_drinks (user_id, slot, drink_id, custom_name, category, details) values
      (${id}, 1, 'coffee.flat_white', null, 'coffee', ${sql.json({ caf: 'Decaf' })}),
      (${id}, 2, null, 'My brew', 'tea', '{}')`;

    const first = logBody();
    const r1 = await api(postLog(wt, first));
    assertEquals(r1.status, 200);
    const b1 = await r1.json();
    assert(widgetLogResponse.safeParse(b1).success);
    assertEquals(b1.status, 'logged');
    assertEquals(b1.id, first.id);
    assertEquals([b1.today.drinks, b1.today.water, b1.today.caffeinated], [1, 0, 0], 'Decaf slot');
    assertEquals(b1.today.lastDrinkAt, first.loggedAt);

    const again = await (await api(postLog(wt, first))).json();
    assertEquals(again.status, 'duplicate', 'the same id twice is logged once');
    assertEquals(again.today.drinks, 1);

    const water = await (
      await api(postLog(wt, logBody({ drinkId: 'water.still', slot: null, category: 'water' })))
    ).json();
    assertEquals([water.today.drinks, water.today.water], [1, 1]);

    const custom = logBody({ drinkId: null, slot: 2, category: 'tea' });
    const rc = await (await api(postLog(wt, custom))).json();
    assertEquals(rc.status, 'logged');
    assertEquals(rc.today.caffeinated, 1, 'a custom tea counts as caffeinated');

    const noSlot = logBody({ slot: null, drinkId: 'coffee.flat_white' });
    assertEquals((await (await api(postLog(wt, noSlot))).json()).today.caffeinated, 2);

    const rows = await sql`select id, drink_id, drink_name, category, caffeinated, source
                           from public.drink_logs where user_id = ${id} order by created_at`;
    assertEquals(rows.length, 4);
    assertEquals(rows[2], {
      id: custom.id,
      drink_id: null,
      drink_name: 'My brew',
      category: 'tea',
      caffeinated: true,
      source: 'widget',
    });
    assertEquals(rows[0]?.drink_name, 'Flat White');

    // The local date follows the device zone sent with the log.
    const far = logBody({ timeZone: 'Pacific/Kiritimati', slot: null });
    await api(postLog(wt, far));
    const [ld] =
      await sql`select local_date::text as d from public.drink_logs where id = ${far.id}`;
    assertEquals(ld?.d, localDateAt(new Date(far.loggedAt), 'Pacific/Kiritimati'));

    // daily_log XP comes from the trigger; the response carries none of it.
    assertFalse(JSON.stringify(rc).includes('xp'));
    assertEquals(
      (
        await sql`select count(*)::int as n from public.xp_events where user_id = ${id} and kind = 'daily_log'`
      )[0]?.n,
      1,
    );
  } finally {
    await cleanup(sql, [id]);
    await sql.end();
  }
});

Deno.test({ name: 'widget-api: POST log refusals and limits', ...opts }, async () => {
  const sql = db();
  const api = widgetApi(fakes(sql).deps);
  const id = await readyUser(sql, 'Dana');
  const other = await readyUser(sql, 'Other');
  try {
    const { token: wt, deviceId } = await widgetToken(sql, id);
    const { token: otherWt } = await widgetToken(sql, other);
    const refused = async (body: unknown, status: number, error: string, why: string) => {
      const res = await api(postLog(wt, body));
      assertEquals(res.status, status, why);
      assertEquals((await res.json()).error, error, why);
    };
    await refused(
      logBody({ drinkId: 'coffee.nonexistent' }),
      422,
      'unknown_drink',
      'unknown drink',
    );
    await refused(logBody({ drinkId: 'beer.lager' }), 400, 'bad_input', 'not a drink category');
    await refused(
      logBody({ category: 'tea' }),
      400,
      'bad_input',
      'category does not match the drink',
    );
    await refused(
      logBody({ drinkId: 'water.still', category: 'water', slot: 1 }),
      400,
      'bad_input',
      'water never has a slot',
    );
    await refused(
      logBody({ drinkId: null, slot: 3, category: 'tea' }),
      409,
      'usual_changed',
      'empty slot',
    );
    await refused(logBody({ userId: other }), 400, 'bad_input', 'no user id in the body');
    await refused(logBody({ id: 'nope' }), 400, 'bad_input', 'the id must be a UUID');
    await refused(
      logBody({ loggedAt: isoSeconds(new Date(Date.now() + 3600_000)) }),
      400,
      'bad_input',
      'a log in the future',
    );
    await refused(
      logBody({ loggedAt: isoSeconds(new Date(Date.now() - 91 * 86400_000)) }),
      422,
      'too_old',
      'older than the 90-day history',
    );
    const big = await api(
      new Request('http://local/widget-api/log', {
        method: 'POST',
        headers: { authorization: `Bearer ${wt}` },
        body: 'x'.repeat(20_000),
      }),
    );
    assertEquals(big.status, 413);
    const broken = await api(
      new Request('http://local/widget-api/log', {
        method: 'POST',
        headers: { authorization: `Bearer ${wt}` },
        body: '{',
      }),
    );
    assertEquals(broken.status, 400);

    // Another user's log id: refused, and their row is untouched.
    const theirs = logBody({ slot: null });
    assertEquals((await api(postLog(otherWt, theirs))).status, 200);
    await refused(theirs, 409, 'conflict', "another user's log id");
    assertEquals(
      (await sql`select user_id from public.drink_logs where id = ${theirs.id}`)[0]?.user_id,
      other,
    );

    // 120 calls per hour per device, then 429 with Retry-After. Counted from a clean window.
    await sql`delete from private.rate_counters where user_id = ${id}`;
    for (let i = 0; i < 120; i++) {
      assertEquals((await api(get(wt))).status, 200, `call ${i + 1}`);
    }
    const limited = await api(postLog(wt, logBody()));
    assertEquals(limited.status, 429);
    const lb = await limited.json();
    assertEquals(lb.error, 'rate_limited');
    assert(lb.retryAfter > 0 && lb.retryAfter <= 3600);
    assertEquals(limited.headers.get('retry-after'), String(lb.retryAfter));
    assertEquals(
      (
        await sql`select count::int as n from private.rate_counters where user_id = ${id} and bucket = ${'widget_api:' + deviceId}`
      )[0]?.n,
      120,
    );
    assertEquals((await api(get(otherWt))).status, 200, "another device's budget is separate");
  } finally {
    await cleanup(sql, [id, other]);
    await sql.end();
  }
});
