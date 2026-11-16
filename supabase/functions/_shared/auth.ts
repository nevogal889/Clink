// Verifies the caller's Supabase access token (ARCHITECTURE.md 4.4: "checks the user JWT").
// Hosted projects sign access tokens with an asymmetric key (clink-dev: ES256), verified against
// the project's JWKS. Local `supabase start` and the tests sign with the legacy shared secret
// (SUPABASE_JWT_SECRET). With both available, the token's header picks the path, and each path
// accepts only its own algorithms, so a token can't choose a weaker check.
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './http.ts';

export type AuthMethod = 'apple' | 'google' | 'phone';

export type Claims = {
  sub: string;
  role: string;
  iat?: number;
  phone?: string;
  is_anonymous?: boolean;
  amr?: { method: string; timestamp: number; provider?: string }[];
  app_metadata?: { provider?: string; providers?: string[] };
};

export interface Verifier {
  verify(token: string): Promise<Claims>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function secretVerifier(secret: string, issuer?: string): Verifier {
  const key = new TextEncoder().encode(secret);
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        audience: 'authenticated',
        issuer,
      });
      return payload as unknown as Claims;
    },
  };
}

export function jwksVerifier(supabaseUrl: string): Verifier {
  const jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
  );
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ASYMMETRIC_ALGS,
        audience: 'authenticated',
        issuer: `${supabaseUrl}/auth/v1`,
      });
      return payload as unknown as Claims;
    },
  };
}

// Signing algorithms Supabase offers for asymmetric JWT signing keys.
const ASYMMETRIC_ALGS = ['ES256', 'RS256', 'EdDSA'];

// HS256 tokens go to `hs` (when a shared secret is configured), everything else to `jwks`.
export function headerRoutedVerifier(jwks: Verifier, hs: Verifier | null): Verifier {
  return {
    verify(token) {
      let alg: string | undefined;
      try {
        alg = decodeProtectedHeader(token).alg;
      } catch {
        return Promise.reject(new Error('malformed token'));
      }
      if (alg === 'HS256') {
        return hs ? hs.verify(token) : Promise.reject(new Error('HS256 not accepted'));
      }
      return jwks.verify(token);
    },
  };
}

export function verifierFromEnv(): Verifier {
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!url) {
    if (secret) return secretVerifier(secret);
    throw new Error('SUPABASE_URL is not set');
  }
  const issuer = `${url}/auth/v1`;
  return headerRoutedVerifier(jwksVerifier(url), secret ? secretVerifier(secret, issuer) : null);
}

export async function requireUser(req: Request, verifier: Verifier): Promise<Claims> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new HttpError(401, 'unauthorized');
  let claims: Claims;
  try {
    claims = await verifier.verify(match[1]);
  } catch {
    throw new HttpError(401, 'unauthorized');
  }
  if (claims.role !== 'authenticated' || !UUID.test(claims.sub ?? '') || claims.is_anonymous) {
    throw new HttpError(401, 'unauthorized');
  }
  return claims;
}

// How the user signed in: Supabase puts the provider in app_metadata.provider ('apple', 'google',
// 'phone'). Anything else is refused: email and anonymous sign-in are off (ARCHITECTURE.md 5).
export function signInMethod(claims: Claims): AuthMethod {
  const provider = claims.app_metadata?.provider;
  if (provider === 'apple' || provider === 'google' || provider === 'phone') return provider;
  throw new HttpError(403, 'unsupported_sign_in');
}

// Signed in within the last `maxAgeSeconds` (account deletion needs a fresh session, 4.7 step 1).
export function isFreshSession(claims: Claims, nowSeconds: number, maxAgeSeconds = 600): boolean {
  const latest = Math.max(0, ...(claims.amr ?? []).map((a) => a.timestamp ?? 0));
  return latest > 0 && nowSeconds - latest <= maxAgeSeconds;
}
