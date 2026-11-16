// Request and response schemas for the edge functions (ARCHITECTURE.md 4.4, 3.1, 3.2). The app,
// the edge functions (through scripts/supabase/sync-shared.mjs) and the native widget code all
// follow these shapes. Error bodies carry an API code only, never user text; COPY.md maps codes to
// words in the app.
import { z } from 'zod';
import { LOG_CATEGORIES } from '../catalog';
import { TEXT_LIMITS } from '../limits';

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
/** An IANA zone name as the device reports it. The server checks it is a real zone. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/);
const pushToken = z.string().min(1).max(4096);
/** Timestamps with a zone: "2026-11-17T09:12:00Z" (no fractional seconds from the server). */
const iso = z.iso.datetime({ offset: true });

/** Every error body: `{ "error": code }`, plus `retryAfter` (seconds) on 429. */
export const apiErrorSchema = z.object({
  error: z.string().min(1).max(40),
  retryAfter: z.number().int().min(0).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------------------------------------
// complete-signup, register-device, delete-account (M1)

export const completeSignupInput = z
  .object({
    birthMonth: z.number().int().min(1).max(12),
    birthYear: z.number().int().min(1900).max(2100),
    displayName: z.string().trim().min(1).max(TEXT_LIMITS.displayName),
    timezone: timeZoneSchema,
    installId: uuidSchema,
    appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type CompleteSignupInput = z.infer<typeof completeSignupInput>;

export const registerDeviceInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('register'),
      installId: uuidSchema,
      platform: z.enum(['ios', 'android']),
      appVersion: z.string().min(1).max(40),
      pushToken: pushToken.nullish(),
      apnsEnv: z.enum(['sandbox', 'production']).nullish(),
      locale: z.string().max(35).nullish(),
      timezone: timeZoneSchema.nullish(),
      notifPermission: z.boolean().default(false),
      laPushToStartToken: pushToken.nullish(),
      widgetPushToken: pushToken.nullish(),
    })
    .strict(),
  z.object({ action: z.literal('signout'), installId: uuidSchema }).strict(),
]);
export type RegisterDeviceInput = z.infer<typeof registerDeviceInput>;

/**
 * The widget token: 32 random bytes, base64url without padding (43 characters). Issued by
 * register-device on every call, shown once, stored on the server only as its SHA-256. It
 * authorises widget-api only, for one user and one device (ARCHITECTURE.md 3.1).
 */
export const WIDGET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const widgetTokenSchema = z.string().regex(WIDGET_TOKEN_RE);

export const registerDeviceResponse = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('registered'),
    deviceId: uuidSchema,
    /** New on every call; the previous token of this device stops working at once. */
    widgetToken: widgetTokenSchema,
    inviteCode: z.string(),
    minIosBuild: z.number().int().min(0),
    minAndroidBuild: z.number().int().min(0),
  }),
  z.strictObject({ status: z.literal('signed_out'), removed: z.boolean() }),
]);
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponse>;

export const deleteAccountInput = z
  .object({
    appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountInput>;

// ---------------------------------------------------------------------------------------------
// widget-api (M2). Auth: `Authorization: Bearer <widgetToken>`, nothing else. Never a user id.

/** Paths under the project URL. */
export const WIDGET_API_PATHS = {
  state: '/functions/v1/widget-api/state',
  log: '/functions/v1/widget-api/log',
} as const;

/**
 * Send this header with the project's region (supabase/projects.json `region`; clink-dev
 * `eu-west-1`) so the function runs next to the database (Supabase regional invocation). Without
 * it the function runs near the caller and every database round trip crosses regions: about
 * 2.5 s per call instead of 0.2 s, measured from outside Europe on clink-dev (2026-11-16).
 */
export const WIDGET_API_REGION_HEADER = 'x-region';

/** Every widget call gives up after this long (ARCHITECTURE.md 3.2); the server answers well inside it. */
export const WIDGET_API_TIMEOUT_MS = 8000;

/**
 * GET state query string. `instance` and `size` identify the calling widget so the server records
 * widget_added once per instance (ARCHITECTURE.md 3.5): Android `appWidgetId`; iOS kind, family
 * and configuration hash. The app leaves both out. `audience` is the medium widget's setting,
 * for the event only. `tz` is the device's zone; today's counts use it (PRD 3.11 rule 2), and
 * the account's saved zone when it is missing or unknown.
 */
export const widgetStateQuery = z
  .strictObject({
    instance: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional(),
    size: z.enum(['small', 'medium']).optional(),
    audience: z.enum(['auto', 'group', 'everyone']).optional(),
    tz: timeZoneSchema.optional(),
  })
  .refine((q) => (q.instance === undefined) === (q.size === undefined), {
    message: 'instance and size come together',
  });
export type WidgetStateQuery = z.infer<typeof widgetStateQuery>;

const drinkIdPattern = /^(coffee|matcha|tea|smoothie_juice|water)\.[a-z0-9_]{1,30}$/;

/**
 * POST log body: the outbox `log` entry (widget-state `outboxEntrySchema`) with its id, plus the
 * device's zone. `drinkId` is a catalog id (water included); null means the custom drink in usual
 * slot `slot`. A catalog drink may also name the usual slot it was picked from, so a saved
 * "Decaf" counts as not caffeinated. Water never has a slot.
 */
export const widgetLogInput = z
  .strictObject({
    id: z.uuid(),
    drinkId: z.string().regex(drinkIdPattern).nullable(),
    slot: z.number().int().min(1).max(3).nullable(),
    category: z.enum(LOG_CATEGORIES),
    loggedAt: iso,
    timeZone: timeZoneSchema.optional(),
  })
  .refine((b) => b.drinkId !== null || b.slot !== null, { message: 'drinkId or slot' })
  .refine((b) => b.category !== 'water' || b.slot === null, { message: 'water has no slot' });
export type WidgetLogInput = z.infer<typeof widgetLogInput>;

export const widgetTodaySchema = z.strictObject({
  localDate: z.iso.date(),
  drinks: z.number().int().min(0),
  water: z.number().int().min(0),
  caffeinated: z.number().int().min(0),
  lastDrinkAt: iso.nullable(),
});

export const widgetLogResponse = z.strictObject({
  /** `duplicate`: this id was logged before; nothing changed. Both mean "remove from the outbox". */
  status: z.enum(['logged', 'duplicate']),
  id: z.uuid(),
  /** Today's counts after the write, in the same shape as the widget state's `today`. */
  today: widgetTodaySchema,
});
export type WidgetLogResponse = z.infer<typeof widgetLogResponse>;

/**
 * widget-api error codes and what the widget does with each (ARCHITECTURE.md 3.2, 4.4).
 *
 * `kind` says why the server refused:
 * - `retryable`: the request is fine, but the server or the account can't take it now (token
 *   rotated or revoked, suspended, rate limited, a server fault). The widget keeps it.
 * - `malformed`: the request can never be valid as sent (schema, unknown drink, an id that belongs
 *   to another account, wrong path, method or size). The widget drops it.
 * - `stale`: it was valid when tapped, but what it points at is gone (the custom drink in that
 *   usual slot changed). The widget drops it.
 *
 * `then`: `retry` keeps it and tries again (after `retryAfter` on 429); `reauth` keeps it, reads
 * the stored token again (the app may have rotated it) and retries once, then waits for the app to
 * register the device again; `drop` removes it from the outbox.
 *
 * No code is about time. The server owns time: a log's `loggedAt` is clamped into the 90-day
 * window ending at server now (migration 0020), never refused, so the widget never drops a log
 * because of the phone's clock. `too_old` (0019) is retired.
 */
export const WIDGET_API_ERRORS = {
  unauthorized: { status: 401, then: 'reauth', kind: 'retryable' },
  suspended: { status: 403, then: 'retry', kind: 'retryable' },
  rate_limited: { status: 429, then: 'retry', kind: 'retryable' },
  internal: { status: 500, then: 'retry', kind: 'retryable' },
  bad_input: { status: 400, then: 'drop', kind: 'malformed' },
  unknown_drink: { status: 422, then: 'drop', kind: 'malformed' },
  conflict: { status: 409, then: 'drop', kind: 'malformed' },
  not_found: { status: 404, then: 'drop', kind: 'malformed' },
  method_not_allowed: { status: 405, then: 'drop', kind: 'malformed' },
  too_large: { status: 413, then: 'drop', kind: 'malformed' },
  usual_changed: { status: 409, then: 'drop', kind: 'stale' },
} as const satisfies Record<
  string,
  {
    status: number;
    then: 'retry' | 'reauth' | 'drop';
    kind: 'retryable' | 'malformed' | 'stale';
  }
>;
export type WidgetApiErrorCode = keyof typeof WIDGET_API_ERRORS;

/**
 * What a widget does with a widget-api answer that isn't 2xx: by code when the body names a known
 * one, else by status (401 reauth; 403, 408, 429 and 5xx retry; any other 4xx drop). The Swift
 * and Kotlin ports follow the same rule.
 */
export function widgetApiAction(status: number, code?: string | null): 'retry' | 'reauth' | 'drop' {
  if (code && Object.hasOwn(WIDGET_API_ERRORS, code)) {
    return WIDGET_API_ERRORS[code as WidgetApiErrorCode].then;
  }
  if (status === 401) return 'reauth';
  if (status === 403 || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'drop';
}
