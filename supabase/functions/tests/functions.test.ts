// complete-signup, register-device and delete-account against the local test database.
// Skipped (with a message) when CLINK_TEST_DB_URL is not set. See supabase/tests/README.md.
import { assert, assertEquals, assertFalse } from '@std/assert';
import { completeSignup } from '../complete-signup/handler.ts';
import { deleteAccount } from '../delete-account/handler.ts';
import { registerDevice } from '../register-device/handler.ts';
import { sha256 } from '../_shared/crypto.ts';
import { authUser, cleanup, db, fakes, hasDb, post, signedUpUser, token } from './helpers.ts';

const opts = { ignore: !hasDb, sanitizeResources: false, sanitizeOps: false };
if (!hasDb) console.warn('CLINK_TEST_DB_URL not set: database-backed function tests are skipped');

const signupBody = (over: Record<string, unknown> = {}) => ({
  birthMonth: 4,
  birthYear: 1995,
  displayName: 'Maya',
  timezone: 'Europe/London',
  installId: crypto.randomUUID(),
  ...over,
});

Deno.test({ name: 'complete-signup: happy path, then returning user', ...opts }, async () => {
  const sql = db();
  const f = fakes(sql);
  const handler = completeSignup(f.deps);
  const { id, phone } = await authUser(sql);
  try {
    const res = await handler(post(await token(id, { phone }), signupBody()));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, 'created');
    assert(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(body.inviteCode));
    const [row] =
      await sql`select p.display_name, s.timezone, up.min_age_version, up.phone_hmac is not null as has_hmac
                            from public.profiles p join public.user_settings s on s.user_id = p.id
                            join private.user_private up on up.user_id = p.id where p.id = ${id}`;
    assertEquals(row, {
      display_name: 'Maya',
      timezone: 'Europe/London',
      min_age_version: 1,
      has_hmac: true,
    });

    // Returning: no age check, nothing changes.
    const again = await handler(
      post(await token(id), signupBody({ birthYear: 2020, displayName: 'Other' })),
    );
    assertEquals(again.status, 200);
    assertEquals((await again.json()).status, 'exists');
    assertEquals(
      (await sql`select display_name from public.profiles where id = ${id}`)[0]?.display_name,
      'Maya',
    );
  } finally {
    await cleanup(sql, [id]);
    await sql.end();
  }
});

Deno.test(
  { name: 'complete-signup: under 16 leaves no account and no identity', ...opts },
  async () => {
    const sql = db();
    const f = fakes(sql, { now: new Date('2026-11-15T12:00:00Z') });
    const handler = completeSignup(f.deps);
    const { id } = await authUser(sql);
    try {
      const res = await handler(
        post(
          await token(id, { provider: 'apple' }),
          signupBody({ birthYear: 2010, birthMonth: 12, appleAuthorizationCode: 'code-1' }),
        ),
      );
      assertEquals(res.status, 403);
      assertEquals(await res.json(), { error: 'under_age', min: 16 });
      assertEquals(f.deleted, [id], 'the sign-in identity is deleted');
      assertEquals(f.apple.revoked, ['refresh-for-code-1'], 'the Apple token is revoked');
      assertEquals((await sql`select 1 from auth.users where id = ${id}`).length, 0);
      assertEquals((await sql`select 1 from public.profiles where id = ${id}`).length, 0);

      // Turning 16 this month is old enough.
      const { id: id2 } = await authUser(sql);
      const ok = await handler(
        post(await token(id2), signupBody({ birthYear: 2010, birthMonth: 11 })),
      );
      assertEquals(ok.status, 200);
      await cleanup(sql, [id2]);
    } finally {
      await cleanup(sql, [id]);
      await sql.end();
    }
  },
);

Deno.test({ name: 'complete-signup: refusals', ...opts }, async () => {
  const sql = db();
  const f = fakes(sql);
  const handler = completeSignup(f.deps);
  const { id } = await authUser(sql);
  await sql`insert into private.blocked_terms (term, kind) values ('badword', 'substring') on conflict do nothing`;
  try {
    assertEquals((await handler(post(null, signupBody()))).status, 401, 'no JWT');
    assertEquals((await handler(post('not-a-jwt', signupBody()))).status, 401, 'bad JWT');
    assertEquals(
      (await handler(post(await token(id, { role: 'anon' }), signupBody()))).status,
      401,
      'anon key',
    );
    assertEquals(
      (await handler(post(await token(id), signupBody({ displayName: 'x'.repeat(31) })))).status,
      400,
      'name over 30 characters',
    );
    assertEquals((await handler(post(await token(id), signupBody({ birthMonth: 0 })))).status, 400);
    assertEquals(
      (await handler(post(await token(id, { provider: 'email' }), signupBody()))).status,
      403,
      'email sign-in is not a Clink method',
    );
    const blocked = await handler(post(await token(id), signupBody({ displayName: 'Mr Badword' })));
    assertEquals(blocked.status, 422);
    assertEquals(await blocked.json(), { error: 'text_blocked' });
    assertEquals(
      (await sql`select 1 from public.profiles where id = ${id}`).length,
      0,
      'nothing was created',
    );
  } finally {
    await sql`delete from private.blocked_terms where term = 'badword'`;
    await cleanup(sql, [id]);
    await sql.end();
  }
});

const regBody = (installId: string, over: Record<string, unknown> = {}) => ({
  installId,
  platform: 'ios',
  appVersion: '1.0.0',
  pushToken: `tok-${installId}`,
  apnsEnv: 'sandbox',
  timezone: 'Europe/London',
  notifPermission: true,
  ...over,
});

Deno.test(
  { name: 'register-device: register, new sign-in notice, widget token, sign-out', ...opts },
  async () => {
    const sql = db();
    const f = fakes(sql);
    const handler = registerDevice(f.deps);
    const id = await signedUpUser(sql);
    const jwt = await token(id);
    const phone1 = crypto.randomUUID();
    const phone2 = crypto.randomUUID();
    try {
      const first = await handler(post(jwt, regBody(phone1)));
      assertEquals(first.status, 200);
      const b1 = await first.json();
      assertEquals(f.pushes.length, 0, 'the first device has nobody to tell');
      assert(b1.widgetToken.length >= 43);
      const hash = await sha256(
        Uint8Array.from(atob(b1.widgetToken.replaceAll('-', '+').replaceAll('_', '/') + '='), (c) =>
          c.charCodeAt(0),
        ),
      );
      const [cred] = await sql`select user_id from private.widget_user(${hash})`;
      assertEquals(cred?.user_id, id, 'only the hash is stored, and it resolves to the user');

      const second = await handler(
        post(jwt, regBody(phone2, { platform: 'android', apnsEnv: null })),
      );
      assertEquals(second.status, 200);
      assertEquals(f.pushes.length, 1);
      assertEquals(f.pushes[0]?.message, { type: 'new_signin' });
      assertEquals(
        f.pushes[0]?.targets.map((t) => t.push_token),
        [`tok-${phone1}`],
        'the other device is told',
      );

      assertEquals(
        (await handler(post(jwt, regBody(phone2, { platform: 'android', apnsEnv: 'sandbox' }))))
          .status,
        400,
        'Android has no APNs fields',
      );

      const out = await handler(post(jwt, { action: 'signout', installId: phone2 }));
      assertEquals(await out.json(), { status: 'signed_out', removed: true });
      assertEquals((await sql`select 1 from public.push_devices where user_id = ${id}`).length, 1);
    } finally {
      await cleanup(sql, [id]);
      await sql.end();
    }
  },
);

Deno.test(
  { name: 'register-device: refusals (no profile, suspended, rate limit)', ...opts },
  async () => {
    const sql = db();
    const f = fakes(sql);
    const handler = registerDevice(f.deps);
    const { id: noProfile } = await authUser(sql);
    const id = await signedUpUser(sql);
    try {
      assertEquals(
        (await handler(post(await token(noProfile), regBody(crypto.randomUUID())))).status,
        404,
        'no profile yet: the app calls complete-signup first',
      );
      assertEquals(
        (
          await handler(
            post(await token(id), { installId: 'nope', platform: 'ios', appVersion: '1' }),
          )
        ).status,
        400,
      );
      const install = crypto.randomUUID();
      for (let i = 0; i < 20; i++) {
        assertEquals((await handler(post(await token(id), regBody(install)))).status, 200);
      }
      const limited = await handler(post(await token(id), regBody(install)));
      assertEquals(limited.status, 429, '21st call in a day');
      assert(Number(limited.headers.get('retry-after')) > 0);
      await sql`select private.suspend_user(${id}, 'spam', 'test')`;
      await sql`delete from private.rate_counters where user_id = ${id}`;
      const suspended = await handler(post(await token(id), regBody(install)));
      assertEquals(suspended.status, 403);
      assertEquals(await suspended.json(), { error: 'suspended' });
    } finally {
      await cleanup(sql, [id, noProfile]);
      await sql.end();
    }
  },
);

Deno.test(
  { name: 'delete-account: full cascade, clears, Apple revoke, invite XP reversal', ...opts },
  async () => {
    const sql = db();
    const f = fakes(sql);
    const handler = deleteAccount(f.deps);
    const inviter = await signedUpUser(sql, 'Inviter');
    const friend = await signedUpUser(sql, 'Friend');
    const id = await signedUpUser(sql, 'Leaver');
    try {
      // Seed the leaver everywhere: invite friendship (+50 to the inviter), another friend with a
      // device, usual 3, logs, a group, a device, files, a live flare with a reply, a report filed.
      const [{ code }] =
        (await sql`select code from public.invites where inviter_id = ${inviter}`) as unknown as [
          { code: string },
        ];
      await sql`select private.redeem_invite(${id}, ${code}, false, 'deeplink')`;
      await sql`insert into public.friendships (user_a, user_b) values (least(${id}::uuid, ${friend}::uuid), greatest(${id}::uuid, ${friend}::uuid))`;
      await sql`select private.register_device(${friend}, 'android', ${crypto.randomUUID()}, '1.0', 'friend-token', null, null, 'UTC', true, null, null, null, 'phone')`;
      await sql`select private.register_device(${id}, 'ios', ${crypto.randomUUID()}, '1.0', 'leaver-token', 'sandbox', null, 'UTC', true, null, null, ${await sha256(
        'w',
      )}, 'apple')`;
      await sql`insert into public.usual_drinks (user_id, slot, drink_id, category) values (${id}, 1, 'tea.chai', 'tea')`;
      await sql`insert into public.drink_logs (id, user_id, drink_name, category, caffeinated, logged_at, local_date, source)
              values (${crypto.randomUUID()}, ${id}, 'Chai', 'tea', true, now(), current_date, 'app')`;
      await sql`insert into public.groups (owner_id, name) values (${id}, 'Mine')`;
      await sql`insert into storage.objects (bucket_id, name) values ('avatars', ${
        id + '/1.jpg'
      }), ('snaps', ${id + '/x.jpg'})`;
      const [{ fid }] =
        (await sql`select (private.create_flare(${id}, 'tea', null, 'Chai', null, 15, now(), 'everyone', null, 'UTC', 'app', false)->>'flare_id') as fid`) as unknown as [
          { fid: string },
        ];
      await sql`select private.respond_flare(${friend}, ${fid}, 'in', null, null, 'app')`;
      await sql`select private.file_report(${id}, 'user', ${friend}, 'spam', null)`;
      await sql`update private.user_private set apple_refresh_token_enc = ${new TextEncoder().encode(
        'sealed:stored-refresh',
      )} where user_id = ${id}`;
      await sql`insert into auth.audit_log_entries (id, payload) values (${crypto.randomUUID()}, ${sql.json(
        { actor_id: id },
      )})`;
      assertEquals(
        (await sql`select total from public.xp_totals where user_id = ${inviter}`)[0]?.total,
        50,
      );

      // A stale session is refused.
      const stale = await handler(
        post(await token(id, { provider: 'apple', authAgeSeconds: 3600 }), {}),
      );
      assertEquals(stale.status, 401);
      assertEquals(await stale.json(), { error: 'reauth_required' });
      assertEquals(
        (await sql`select 1 from public.profiles where id = ${id}`).length,
        1,
        'nothing deleted yet',
      );

      const res = await handler(post(await token(id, { provider: 'apple' }), {}));
      assertEquals(res.status, 200);
      assertEquals(await res.json(), { status: 'deleted' });

      assertEquals(f.deleted, [id]);
      assertEquals(f.apple.revoked, ['stored-refresh'], 'the stored Apple token is revoked');
      assertEquals(f.pushes[0]?.message, { type: 'clear_user', userId: id });
      assert(
        f.pushes[0]?.targets.some((t) => t.push_token === 'friend-token'),
        'friends get the clear message',
      );
      assertEquals(f.removed.map((r) => r.bucket).sort(), ['avatars', 'snaps']);
      const [left] = await sql`select private.account_leftovers(${id}) as j`;
      assertEquals(left?.j, {}, 'no row and no file is left');
      assertEquals(
        (await sql`select total from public.xp_totals where user_id = ${inviter}`)[0]?.total,
        0,
        'invite XP under 7 days old is reversed',
      );
      assertEquals(
        (
          await sql`select count(*)::int as n from private.reports where reporter_id is null and target_user = ${friend}`
        )[0]?.n,
        1,
        'the report the user filed is kept without the reporter',
      );
      assertEquals(
        (await sql`select status from public.flares where id = ${fid}`).length,
        0,
        'the flare went with the account',
      );

      // A retry after success still answers deleted (idempotent).
      const retry = await handler(post(await token(id, { provider: 'apple' }), {}));
      assertEquals(retry.status, 200);
    } finally {
      await sql`delete from private.reports where target_user = ${friend}`;
      await cleanup(sql, [inviter, friend, id]);
      await sql.end();
    }
  },
);

Deno.test(
  { name: 'delete-account: a fresh Apple code stands in for a fresh session', ...opts },
  async () => {
    const sql = db();
    const f = fakes(sql);
    const handler = deleteAccount(f.deps);
    const id = await signedUpUser(sql);
    try {
      const bad = await handler(
        post(await token(id, { provider: 'apple', authAgeSeconds: 3600 }), {
          appleAuthorizationCode: 'bad-code',
        }),
      );
      assertEquals(bad.status, 401);
      const res = await handler(
        post(await token(id, { provider: 'apple', authAgeSeconds: 3600 }), {
          appleAuthorizationCode: 'fresh',
        }),
      );
      assertEquals(res.status, 200);
      assertEquals(f.apple.revoked, ['refresh-for-fresh']);
      assertFalse((await sql`select 1 from public.profiles where id = ${id}`).length > 0);
    } finally {
      await cleanup(sql, [id]);
      await sql.end();
    }
  },
);
