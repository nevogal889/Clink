// Widget token auth for widget-api (ARCHITECTURE.md 3.1, 4.4). The only credential widget-api
// accepts is `Authorization: Bearer <widget token>`: 32 random bytes from register-device,
// base64url. The server keeps only SHA-256 of it. Missing, malformed, unknown and revoked tokens all
// answer 401 unauthorized, so a caller can't tell them apart. The user always comes from the
// token, never from the request.
import { fromBase64, sha256, timingSafeEqual } from './crypto.ts';
import { asService, type Sql } from './db.ts';
import { HttpError } from './http.ts';
import { WIDGET_TOKEN_RE } from './shared/api/index.ts';

export type WidgetCaller = { userId: string; deviceId: string; platform: 'ios' | 'android' };

/** The token from the Authorization header, or null when it is missing or not a widget token. */
export function bearerWidgetToken(req: Request): Uint8Array | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  const token = match?.[1];
  if (!token || !WIDGET_TOKEN_RE.test(token)) return null;
  const bytes = fromBase64(token);
  return bytes.length === 32 ? bytes : null;
}

/**
 * Resolves the caller, checks suspension and the 120-per-hour device limit (private.widget_begin),
 * then compares the stored hash with the computed one in constant time as a second check.
 */
export async function requireWidgetCaller(req: Request, sql: Sql): Promise<WidgetCaller> {
  const token = bearerWidgetToken(req);
  if (!token) throw new HttpError(401, 'unauthorized');
  const hash = await sha256(token as Uint8Array<ArrayBuffer>);
  const rows = await asService(
    sql,
    (tx) =>
      tx<
        {
          user_id: string;
          device_id: string;
          platform: 'ios' | 'android';
          token_hash: Uint8Array;
        }[]
      >`
        select user_id, device_id, platform, token_hash from private.widget_begin(${hash})`,
  );
  const row = rows[0];
  if (!row || !timingSafeEqual(new Uint8Array(row.token_hash), hash)) {
    throw new HttpError(401, 'unauthorized');
  }
  return { userId: row.user_id, deviceId: row.device_id, platform: row.platform };
}
