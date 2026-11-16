// HTTP helpers shared by every edge function. Error bodies carry an API code only, never user text
// (COPY.md maps codes to words in the app). Nothing here logs a request body (ARCHITECTURE.md 8.1, 8.6).

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

// SQLSTATE class CL is ours (supabase/migrations/0003_clock_people.sql). The message is the API code.
const DB_STATUS: Record<string, number> = {
  CLTXT: 422,
  CLCAP: 409,
  CLLIV: 409,
  CLRTL: 429,
  CLEND: 404,
  CLINV: 404,
  CLSUS: 403,
  CLBAD: 400,
  CLNFD: 404,
  CLBLK: 404,
  CLCON: 409, // 0019: an id that belongs to another account
  // CLOLD (0019, too_old) is retired by 0020: a log's time is clamped, never refused. Nothing
  // raises it; if anything ever did, it would answer 500, which the widget retries.
};

type DbError = { code?: unknown; message?: unknown; detail?: unknown };

export function fromDbError(e: unknown): HttpError | null {
  const err = e as DbError;
  if (typeof err?.code !== 'string' || !(err.code in DB_STATUS)) return null;
  const status = DB_STATUS[err.code] ?? 500;
  // A block is never revealed: it answers exactly like not_found.
  const code = err.code === 'CLBLK' ? 'not_found' : String(err.message);
  const extra: Record<string, unknown> = {};
  if (err.code === 'CLRTL' && typeof err.detail === 'string') extra.retryAfter = Number(err.detail);
  return new HttpError(status, code, extra);
}

export function errorResponse(e: unknown): Response {
  const http = e instanceof HttpError ? e : fromDbError(e);
  if (http) {
    const headers: Record<string, string> = {};
    if (typeof http.extra.retryAfter === 'number')
      headers['retry-after'] = String(http.extra.retryAfter);
    return json(http.status, { error: http.code, ...http.extra }, headers);
  }
  // Unknown failure: log the error class and SQLSTATE only, never values (Sentry rules, 8.6).
  const err = e as DbError;
  console.error(
    'internal_error',
    typeof err?.code === 'string' ? err.code : ((e as Error)?.name ?? 'unknown'),
  );
  return json(500, { error: 'internal' });
}

export async function readJson(req: Request): Promise<unknown> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
  const text = await req.text();
  if (text.length > 16_384) throw new HttpError(413, 'too_large');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_input');
  }
}

export type Handler = (req: Request) => Promise<Response>;

// CORS (docs/build-notes/app-supabase.md item 1). Only the functions a browser calls take it:
// complete-signup, register-device and delete-account (the web review build, the web deletion
// page). widget-api is native-only and answers OPTIONS like any other wrong method.
// The allow-list is exact origins from config (CLINK_CORS_ORIGINS, set by
// scripts/supabase-deploy-functions.mjs from supabase/projects.json `corsOrigins`). No wildcard.

/** An exact origin: scheme, host and optional port, nothing else. */
const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

/** Parses the comma-separated allow-list. Anything that isn't an exact origin is ignored. */
export function parseCorsOrigins(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => ORIGIN_RE.test(o));
}

const CORS_ALLOW_HEADERS = 'authorization, apikey, content-type, x-client-info, x-region';
const CORS_MAX_AGE = '3600';

function allowedOrigin(req: Request, origins: readonly string[]): string | null {
  const origin = req.headers.get('origin');
  return origin && origins.includes(origin) ? origin : null;
}

function withCorsHeaders(res: Response, origin: string): Response {
  const headers = new Headers(res.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-expose-headers', 'retry-after');
  headers.append('vary', 'Origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function handle(fn: Handler, opts: { cors?: readonly string[] } = {}): Handler {
  const cors = opts.cors;
  return async (req) => {
    // The preflight is answered before auth: browsers never send credentials with it.
    if (cors && req.method === 'OPTIONS') {
      const origin = allowedOrigin(req, cors);
      if (!origin) {
        return json(403, { error: 'origin_not_allowed' }, { vary: 'Origin' });
      }
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': CORS_ALLOW_HEADERS,
          'access-control-max-age': CORS_MAX_AGE,
          vary: 'Origin',
        },
      });
    }
    let res: Response;
    try {
      res = await fn(req);
    } catch (e) {
      res = errorResponse(e);
    }
    // Every answer to an allowed origin, errors included, so the web app can read the error code.
    const origin = cors ? allowedOrigin(req, cors) : null;
    return origin ? withCorsHeaders(res, origin) : res;
  };
}
