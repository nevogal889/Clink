// Pure helpers: age rule, error mapping, crypto, schemas, session freshness. No database needed.
import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';
import { generateKeyPair, SignJWT } from 'jose';
import { isOldEnough, todayUtc } from '../_shared/age.ts';
import {
  headerRoutedVerifier,
  isFreshSession,
  secretVerifier,
  signInMethod,
  type Verifier,
} from '../_shared/auth.ts';
import { base64url, decrypt, encrypt, phoneHmac, sha256, toBase64 } from '../_shared/crypto.ts';
import { errorResponse, fromDbError, HttpError } from '../_shared/http.ts';
import {
  completeSignupInput,
  deleteAccountInput,
  registerDeviceInput,
} from '../_shared/schemas.ts';

Deno.test('age: 16 from the first day of the birth month', () => {
  const today = { year: 2026, month: 11 };
  assert(isOldEnough({ year: 2010, month: 11 }, today, 16), 'turns 16 this month');
  assert(isOldEnough({ year: 2010, month: 1 }, today, 16));
  assertFalse(isOldEnough({ year: 2010, month: 12 }, today, 16), 'turns 16 next month');
  assertFalse(isOldEnough({ year: 2011, month: 1 }, today, 16));
  assert(isOldEnough({ year: 1950, month: 6 }, today, 16));
  assertFalse(isOldEnough({ year: 2000, month: 13 }, today, 16), 'invalid month never passes');
  assertEquals(todayUtc(new Date('2026-12-31T23:30:00Z')), { year: 2026, month: 12 });
});

Deno.test('db errors map to API codes and statuses', async () => {
  assertEquals(fromDbError({ code: 'CLTXT', message: 'text_blocked' })?.status, 422);
  assertEquals(fromDbError({ code: 'CLCAP', message: 'friend_cap' })?.code, 'friend_cap');
  assertEquals(
    fromDbError({ code: 'CLBLK', message: 'blocked' })?.code,
    'not_found',
    'a block is never revealed',
  );
  assertEquals(fromDbError({ code: '23505', message: 'dup' }), null);
  const limited = errorResponse({ code: 'CLRTL', message: 'rate_limited', detail: '42' });
  assertEquals(limited.status, 429);
  assertEquals(limited.headers.get('retry-after'), '42');
  assertEquals(await limited.json(), { error: 'rate_limited', retryAfter: 42 });
  assertEquals(errorResponse(new HttpError(401, 'unauthorized')).status, 401);
  const internal = errorResponse(new Error('boom with secret detail'));
  assertEquals(await internal.json(), { error: 'internal' }, 'no internal detail leaks');
});

Deno.test('crypto: AES-GCM round trip, sha256, phone HMAC normalisation', async () => {
  const key = new Uint8Array(32).fill(1);
  const sealed = await encrypt(key, 'refresh-token');
  assertEquals(await decrypt(key, sealed), 'refresh-token');
  assertEquals(toBase64(await sha256('abc')), 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  const pepper = new Uint8Array(32).fill(9);
  assertEquals(await phoneHmac(pepper, '15550001111'), await phoneHmac(pepper, '+1 555 000 1111'));
  assertEquals(base64url(new Uint8Array([251, 255])), '-_8');
});

Deno.test('schemas: PRD limits and strictness', () => {
  const ok = {
    birthMonth: 3,
    birthYear: 1990,
    displayName: ' Sam ',
    timezone: 'Europe/London',
    installId: crypto.randomUUID(),
  };
  assertEquals(completeSignupInput.parse(ok).displayName, 'Sam');
  assertFalse(
    completeSignupInput.safeParse({ ...ok, displayName: 'x'.repeat(31) }).success,
    'name over 30',
  );
  assertFalse(completeSignupInput.safeParse({ ...ok, displayName: '   ' }).success, 'blank name');
  assertFalse(completeSignupInput.safeParse({ ...ok, birthMonth: 13 }).success);
  assertFalse(
    completeSignupInput.safeParse({ ...ok, birthDay: 3 }).success,
    'no birth day field is accepted',
  );
  assertFalse(
    completeSignupInput.safeParse({ ...ok, userId: crypto.randomUUID() }).success,
    'no caller id from the body',
  );
  assert(
    registerDeviceInput.safeParse({ action: 'signout', installId: crypto.randomUUID() }).success,
  );
  assertFalse(
    registerDeviceInput.safeParse({
      action: 'register',
      installId: 'x',
      platform: 'ios',
      appVersion: '1',
    }).success,
  );
  assertFalse(deleteAccountInput.safeParse({ userId: crypto.randomUUID() }).success);
});

Deno.test('auth: fresh session and sign-in method', () => {
  const now = 1_800_000_000;
  assert(
    isFreshSession(
      { sub: 'x', role: 'authenticated', amr: [{ method: 'otp', timestamp: now - 60 }] },
      now,
    ),
  );
  assertFalse(
    isFreshSession(
      { sub: 'x', role: 'authenticated', amr: [{ method: 'otp', timestamp: now - 3600 }] },
      now,
    ),
  );
  assertFalse(isFreshSession({ sub: 'x', role: 'authenticated' }, now));
  assertEquals(
    signInMethod({ sub: 'x', role: 'authenticated', app_metadata: { provider: 'apple' } }),
    'apple',
  );
  let threw = false;
  try {
    signInMethod({ sub: 'x', role: 'authenticated', app_metadata: { provider: 'email' } });
  } catch (e) {
    threw = e instanceof HttpError && e.status === 403;
  }
  assert(threw, 'email sign-in is refused');
});

Deno.test(
  'auth: the token header picks the verifier, and HS256 needs a configured secret',
  async () => {
    const secret = 'test-secret-at-least-32-characters-long';
    const claims = { sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated' };
    const hsToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    const { privateKey } = await generateKeyPair('ES256');
    const esToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(privateKey);
    const seen: string[] = [];
    const fakeJwks: Verifier = {
      verify(token) {
        seen.push(token === esToken ? 'es' : 'other');
        return Promise.resolve({ sub: claims.sub, role: 'authenticated' });
      },
    };
    const both = headerRoutedVerifier(fakeJwks, secretVerifier(secret));
    assertEquals((await both.verify(hsToken)).sub, claims.sub, 'HS256 goes to the secret');
    await both.verify(esToken);
    assertEquals(seen, ['es'], 'ES256 goes to the JWKS');
    const jwksOnly = headerRoutedVerifier(fakeJwks, null);
    await assertRejects(() => jwksOnly.verify(hsToken), Error, 'HS256 not accepted');
    await assertRejects(() => jwksOnly.verify('not-a-jwt'), Error, 'malformed');
  },
);
