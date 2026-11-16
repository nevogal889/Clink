// Sign in with Apple server calls (ARCHITECTURE.md 5, 4.7 step 2): exchange an authorization code
// for a refresh token at sign-up, and revoke it on deletion or under-age refusal.
// Configured by function secrets APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID (the app's bundle id
// for native sign-in), APPLE_PRIVATE_KEY (.p8 PEM) and APPLE_TOKEN_KEY (32-byte AES key, base64).
// Without them (no Apple Developer account yet) appleFromEnv() returns null and the caller skips
// the Apple step; see docs/build-notes/database.md.
import { importPKCS8, SignJWT } from 'jose';
import { type Bytes, decrypt, encrypt, fromBase64 } from './crypto.ts';

export interface AppleClient {
  exchangeCode(code: string): Promise<string>; // returns the refresh token
  revoke(refreshToken: string): Promise<void>;
  sealToken(refreshToken: string): Promise<Bytes>;
  openToken(sealed: Bytes): Promise<string>;
}

const APPLE = 'https://appleid.apple.com';

export function appleFromEnv(fetchFn: typeof fetch = fetch): AppleClient | null {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  const tokenKey = Deno.env.get('APPLE_TOKEN_KEY');
  if (!teamId || !keyId || !clientId || !privateKey || !tokenKey) return null;
  return appleClient(
    { teamId, keyId, clientId, privateKey, tokenKey: fromBase64(tokenKey) },
    fetchFn,
  );
}

export function appleClient(
  cfg: { teamId: string; keyId: string; clientId: string; privateKey: string; tokenKey: Bytes },
  fetchFn: typeof fetch = fetch,
): AppleClient {
  async function clientSecret(): Promise<string> {
    const key = await importPKCS8(cfg.privateKey, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
      .setIssuer(cfg.teamId)
      .setSubject(cfg.clientId)
      .setAudience(APPLE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  function post(path: string, form: Record<string, string>): Promise<Response> {
    return fetchFn(`${APPLE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
  }

  return {
    async exchangeCode(code) {
      const res = await post('/auth/token', {
        client_id: cfg.clientId,
        client_secret: await clientSecret(),
        code,
        grant_type: 'authorization_code',
      });
      if (!res.ok) throw new Error(`apple_token_${res.status}`);
      const body = (await res.json()) as { refresh_token?: string };
      if (!body.refresh_token) throw new Error('apple_token_missing');
      return body.refresh_token;
    },
    async revoke(refreshToken) {
      const res = await post('/auth/revoke', {
        client_id: cfg.clientId,
        client_secret: await clientSecret(),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      if (!res.ok) throw new Error(`apple_revoke_${res.status}`);
    },
    sealToken: (t) => encrypt(cfg.tokenKey, t),
    openToken: (s) => decrypt(cfg.tokenKey, s),
  };
}
