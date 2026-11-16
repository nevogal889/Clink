// Everything a handler needs from outside, so tests can swap in fakes and a local database.
import {
  type AuthAdmin,
  authAdminFromEnv,
  type StorageAdmin,
  storageAdminFromEnv,
} from './admin.ts';
import { type AppleClient, appleFromEnv } from './apple.ts';
import { type Verifier, verifierFromEnv } from './auth.ts';
import { connect, type Sql } from './db.ts';
import { pushFromEnv, type PushSender } from './push.ts';
import { type Bytes, fromBase64 } from './crypto.ts';

export type Deps = {
  sql: Sql;
  verifier: Verifier;
  admin: AuthAdmin;
  storage: StorageAdmin;
  push: PushSender;
  apple: AppleClient | null; // null until the Apple Developer account exists
  phonePepper: Bytes | null; // null until the secret is set; phone_hmac is then left empty
  now: () => Date;
};

export function depsFromEnv(): Deps {
  const pepper = Deno.env.get('PHONE_PEPPER');
  return {
    sql: connect(),
    verifier: verifierFromEnv(),
    admin: authAdminFromEnv(),
    storage: storageAdminFromEnv(),
    push: pushFromEnv(),
    apple: appleFromEnv(),
    phonePepper: pepper ? fromBase64(pepper) : null,
    now: () => new Date(),
  };
}
