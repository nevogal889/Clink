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
  CLOLD: 422, // 0019: a log older than the 90-day history
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

export function handle(fn: Handler): Handler {
  return async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
