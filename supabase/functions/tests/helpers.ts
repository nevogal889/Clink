// Test harness: the real handlers against the local test database built by scripts/run-pgtap.sh
// (migrations plus the Supabase shim), with fakes for Auth admin, Storage, push and Apple.
// CLINK_TEST_DB_URL points at that database; see supabase/tests/README.md.
import { SignJWT } from 'jose';
import postgres from 'postgres';
import type { AppleClient } from '../_shared/apple.ts';
import { secretVerifier } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import type { PushMessage, PushSender, PushTarget } from '../_shared/push.ts';

export const SECRET = 'clink-test-secret-at-least-32-characters-long';
export const DB_URL = Deno.env.get('CLINK_TEST_DB_URL') ?? '';
export const hasDb = DB_URL !== '';

export function db(): postgres.Sql {
  return postgres(DB_URL, { prepare: false, max: 3, onnotice: () => {} });
}

export type Fakes = {
  deps: Deps;
  deleted: string[];
  removed: { bucket: string; names: string[] }[];
  pushes: { targets: PushTarget[]; message: PushMessage }[];
  apple: { exchanged: string[]; revoked: string[] };
};

export function fakes(sql: postgres.Sql, opts: { now?: Date; apple?: boolean } = {}): Fakes {
  const deleted: string[] = [];
  const removed: { bucket: string; names: string[] }[] = [];
  const pushes: { targets: PushTarget[]; message: PushMessage }[] = [];
  const appleLog = { exchanged: [] as string[], revoked: [] as string[] };
  const push: PushSender = {
    send(targets, message) {
      pushes.push({ targets, message });
      return Promise.resolve({ sent: targets.length, skipped: 0 });
    },
  };
  const apple: AppleClient = {
    exchangeCode(code) {
      if (code === 'bad-code') return Promise.reject(new Error('apple_token_400'));
      appleLog.exchanged.push(code);
      return Promise.resolve(`refresh-for-${code}`);
    },
    revoke(token) {
      appleLog.revoked.push(token);
      return Promise.resolve();
    },
    sealToken: (t) => Promise.resolve(new TextEncoder().encode(`sealed:${t}`)),
    openToken: (s) => Promise.resolve(new TextDecoder().decode(s).replace(/^sealed:/, '')),
  };
  const deps: Deps = {
    sql,
    verifier: secretVerifier(SECRET),
    // The fakes do what Supabase would: deleting the auth user cascades through profiles.
    admin: {
      async deleteUser(id) {
        deleted.push(id);
        await sql`delete from auth.users where id = ${id}`;
      },
    },
    storage: {
      async remove(bucket, names) {
        removed.push({ bucket, names });
        await sql`delete from storage.objects where bucket_id = ${bucket} and name = any(${names})`;
      },
    },
    push,
    apple: opts.apple === false ? null : apple,
    phonePepper: new Uint8Array(32).fill(7),
    now: () => opts.now ?? new Date(),
  };
  return { deps, deleted, removed, pushes, apple: appleLog };
}

export async function token(
  sub: string,
  opts: { provider?: string; phone?: string; authAgeSeconds?: number; role?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: opts.role ?? 'authenticated',
    phone: opts.phone,
    app_metadata: { provider: opts.provider ?? 'phone' },
    amr: [
      {
        method: opts.provider === 'phone' || !opts.provider ? 'otp' : 'oauth',
        timestamp: now - (opts.authAgeSeconds ?? 30),
      },
    ],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

export function post(jwt: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (jwt) headers.authorization = `Bearer ${jwt}`;
  return new Request('http://local/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

// A fresh auth user (what Supabase Auth creates on first sign-in), with a confirmed phone.
export async function authUser(sql: postgres.Sql): Promise<{ id: string; phone: string }> {
  const id = crypto.randomUUID();
  const phone = `1555${Math.floor(Math.random() * 1e7)
    .toString()
    .padStart(7, '0')}`;
  await sql`insert into auth.users (id, phone, phone_confirmed_at) values (${id}, ${phone}, now())`;
  return { id, phone };
}

export async function signedUpUser(sql: postgres.Sql, name = 'Sam'): Promise<string> {
  const { id } = await authUser(sql);
  await sql`select private.complete_signup(${id}, ${name}, 1::smallint, ${crypto.randomUUID()}, 'UTC', 'phone')`;
  return id;
}

export async function cleanup(sql: postgres.Sql, ids: string[]): Promise<void> {
  if (ids.length) {
    await sql`delete from auth.users where id = any(${ids})`;
    await sql`delete from private.rate_counters where user_id = any(${ids})`;
    await sql`delete from private.install_history where user_id = any(${ids})`;
  }
}
