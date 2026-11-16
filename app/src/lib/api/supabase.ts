// ClinkApi over Supabase (ARCHITECTURE.md 4 to 6). Reads go through the Data API as the signed-in
// user, so RLS decides what comes back; every query still names the caller's id, because some
// tables (usual_drinks, profiles) also show friends' rows. Shared truth is written by edge
// functions (complete-signup, register-device, delete-account). The tracker writes its own rows,
// as its RLS allows, with ids made on the device so a retry never logs twice.
//
// Not on this backend yet (later milestones), and thrown as ApiError `unsupported`: Apple and
// Google sign-in (no native SDKs and the providers are off on clink-dev), send-flare (M4),
// share-snap (M5), adding a contact (M3). The OS permission prompts for contacts and
// notifications need their native modules; until they ship the answer is `denied` and nothing is
// stored on the server.
import {
  getDrink,
  isCaffeinated,
  isFlareDrink,
  LOG_CATEGORIES,
  registerDeviceResponse,
  WIDGET_API_PATHS,
  WIDGET_API_REGION_HEADER,
  WIDGET_API_TIMEOUT_MS,
  widgetStateReadSchema,
  xpKindSchema,
  type DrinkDetails,
  type FlareCategory,
  type LogCategory,
  type WidgetState,
} from '@clink/shared';
import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js';

import { readJson, writeJson, type KeyValue } from '../kv';
import { ApiError, type ApiErrorCode } from './errors';
import type {
  AuthMethod,
  ClinkApi,
  DeviceRegistration,
  LogEntry,
  Me,
  OnboardingStep,
  PermissionResult,
  Session,
  UsualDrink,
  XpEntry,
} from './types';
import { ONBOARDING_STEPS } from './types';

export interface SupabaseApiDeps {
  client: SupabaseClient;
  /** Encrypted on native: the offline log queue. */
  sealed: KeyValue;
  /** Install id, the level already seen, wrong-code counts. */
  plain: KeyValue;
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
  now?: () => Date;
  uuid?: () => string;
  timezone?: () => string;
  locale?: () => string | null;
  /** Picked photo to avatar JPEG bytes (lib/avatar.ts). */
  prepareAvatar?: (uri: string) => Promise<Uint8Array>;
  /** https origin for invite URLs; null until the domain exists (PRD 8 question 4). */
  inviteBase?: string | null;
  /** Where widget-api lives: the project URL and its region (supabase/projects.json). */
  widgetApi?: { url: string; region: string | null };
  fetch?: typeof fetch;
}

/** A code is valid 10 minutes; 5 wrong codes lock the number for 15 (ARCHITECTURE.md 5). */
export const CODE_VALID_MS = 10 * 60_000;
export const CODE_MAX_WRONG = 5;
export const CODE_LOCK_MS = 15 * 60_000;
const SIGNED_URL_SEC = 3600;

// Error mapping ------------------------------------------------------------------------------

const DB_CODES: Record<string, ApiErrorCode> = {
  CLTXT: 'text_blocked',
  CLRTL: 'rate_limited',
  CLSUS: 'suspended',
  CLBAD: 'bad_input',
  CLNFD: 'not_found',
  CLBLK: 'not_found',
  CLEND: 'flare_ended',
  CLLIV: 'live_flare_exists',
  CLCAP: 'bad_input',
  PGRST301: 'unauthorized',
  PGRST303: 'unauthorized',
  '23514': 'bad_input',
  '22P02': 'bad_input',
  '23502': 'bad_input',
};

interface PgError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** A Data API or Storage failure. postgrest-js reports a failed fetch as status 0. */
export function fromPostgrest(error: PgError | null, status?: number): ApiError {
  if (status === 0 || looksOffline(error?.message)) return new ApiError('network');
  const mapped = error?.code ? DB_CODES[error.code] : undefined;
  if (mapped === 'rate_limited') {
    const sec = Number(error?.details);
    return new ApiError('rate_limited', Number.isFinite(sec) ? { retryAfterSec: sec } : {});
  }
  if (mapped) return new ApiError(mapped);
  if (status === 401) return new ApiError('unauthorized');
  return new ApiError('server');
}

function looksOffline(message: string | undefined): boolean {
  return (
    !!message &&
    /failed to fetch|network request failed|networkerror|load failed|fetch failed|timed? ?out/i.test(
      message,
    )
  );
}

interface AuthErr {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
}

/** A Supabase Auth failure. `otp_expired` (wrong or old code) is decided by the caller. */
export function fromAuth(e: unknown): ApiError {
  const err = (e ?? {}) as AuthErr;
  if (
    err.name === 'AuthRetryableFetchError' ||
    err.status === 0 ||
    looksOffline(err.message) ||
    (typeof err.status === 'number' && err.status >= 502 && err.status <= 504)
  ) {
    return new ApiError('network');
  }
  switch (err.code) {
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return new ApiError('rate_limited');
    case 'validation_failed':
    case 'phone_invalid':
      return new ApiError('phone_invalid');
    case 'phone_exists':
      return new ApiError('phone_taken');
    case 'sms_send_failed':
      return new ApiError('sms_failed');
    case 'user_banned':
      return new ApiError('suspended');
    case 'phone_provider_disabled':
    case 'provider_disabled':
      return new ApiError('unsupported');
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'bad_jwt':
    case 'user_not_found':
      return new ApiError('unauthorized');
  }
  // No SMS provider configured (clink-dev: only the test numbers have codes).
  if (err.status === 500 && /sms provider/i.test(err.message ?? ''))
    return new ApiError('sms_failed');
  if (err.status === 401 || err.status === 403) return new ApiError('unauthorized');
  return new ApiError('server');
}

interface FnErr {
  name?: string;
  context?: unknown;
}

/** An edge function failure. The body carries an API code only ({ error, min?, retryAfter? }). */
export async function fromFunction(e: unknown): Promise<ApiError> {
  const err = (e ?? {}) as FnErr;
  if (err.name === 'FunctionsFetchError' || err.name === 'FunctionsRelayError') {
    return new ApiError('network');
  }
  const res = err.context as Response | undefined;
  if (!res || typeof res.status !== 'number') return new ApiError('network');
  let body: { error?: string; code?: string; min?: number; retryAfter?: number } = {};
  try {
    body = (await res.clone().json()) as typeof body;
  } catch {
    // not JSON: a gateway answer
  }
  const code = body.error;
  const retryHeader = Number(res.headers?.get?.('retry-after'));
  switch (code) {
    case 'under_age':
      return new ApiError('under_age', typeof body.min === 'number' ? { min: body.min } : {});
    case 'reauth_required':
      return new ApiError('reauth_required');
    case 'suspended':
      return new ApiError('suspended');
    case 'text_blocked':
      return new ApiError('text_blocked');
    case 'rate_limited': {
      const sec = body.retryAfter ?? retryHeader;
      return new ApiError('rate_limited', Number.isFinite(sec) ? { retryAfterSec: sec } : {});
    }
    case 'bad_input':
      return new ApiError('bad_input');
    case 'not_found':
      return new ApiError('not_found');
    case 'flare_ended':
      return new ApiError('flare_ended');
    case 'live_flare_exists':
      return new ApiError('live_flare_exists');
  }
  // The gateway's answer for a function that isn't deployed: {"code":"NOT_FOUND", ...}.
  if (res.status === 404 && body.code === 'NOT_FOUND') return new ApiError('unsupported');
  if (res.status === 401) return new ApiError('unauthorized');
  if (res.status >= 502 && res.status <= 504) return new ApiError('network');
  return new ApiError('server');
}

// Rows and mapping ---------------------------------------------------------------------------

export interface DrinkLogRow {
  id: string;
  user_id: string;
  drink_id: string | null;
  drink_name: string;
  category: LogCategory;
  caffeinated: boolean;
  logged_at: string;
  local_date: string;
  source: 'app' | 'widget';
}

interface UsualRow {
  slot: number;
  drink_id: string | null;
  custom_name: string | null;
  category: FlareCategory;
  details: DrinkDetails | null;
}

/** Device-local calendar date, YYYY-MM-DD. The Today view only; XP uses server time (4.5). */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A server row back to an entry. Rows keep only `caffeinated`, not the details, so a drink the
 * catalog marks caffeinated but the row doesn't comes back as Decaf, the one detail that changes
 * the count (PRD 3.11 rule 5).
 */
export function entryFromRow(r: DrinkLogRow): LogEntry {
  const usuallyCaf = r.drink_id
    ? isCaffeinated({ drinkId: r.drink_id })
    : isCaffeinated({ category: r.category });
  return {
    id: r.id,
    drinkId: r.drink_id,
    customName: r.drink_id ? null : r.drink_name,
    category: r.category,
    details: usuallyCaf && !r.caffeinated ? { caf: 'Decaf' } : {},
    loggedAt: new Date(r.logged_at).toISOString(),
  };
}

export function rowFromEntry(userId: string, e: LogEntry): DrinkLogRow {
  const name = e.drinkId ? (getDrink(e.drinkId)?.name ?? e.customName) : e.customName;
  if (!name) throw new ApiError('bad_input');
  if (!(LOG_CATEGORIES as readonly string[]).includes(e.category)) throw new ApiError('bad_input');
  const caffeinated =
    e.category === 'water'
      ? false
      : e.drinkId
        ? isCaffeinated({ drinkId: e.drinkId }, e.details)
        : isCaffeinated({ category: e.category }, e.details);
  return {
    id: e.id,
    user_id: userId,
    drink_id: e.drinkId,
    drink_name: Array.from(name).slice(0, 30).join(''),
    category: e.category,
    caffeinated,
    logged_at: e.loggedAt,
    local_date: localDate(new Date(e.loggedAt)),
    source: 'app',
  };
}

export function usualFromRow(r: UsualRow): UsualDrink {
  return {
    drinkId: r.drink_id,
    customName: r.custom_name,
    category: r.category,
    details: r.details ?? {},
  };
}

/** onboarding_step in user_settings: the app's step names; 'profile' is the column default. */
export function stepFromDb(raw: string | null | undefined): OnboardingStep {
  if (raw === 'done') return 'done';
  return (ONBOARDING_STEPS as readonly string[]).includes(raw ?? '')
    ? (raw as OnboardingStep)
    : 'name';
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function methodOf(s: AuthSession): AuthMethod {
  const p = s.user.app_metadata?.provider;
  return p === 'apple' || p === 'google' ? p : 'phone';
}

function e164Of(phone: string | undefined | null): string | null {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function toSession(s: AuthSession): Session {
  return { userId: s.user.id, method: methodOf(s), phone: e164Of(s.user.phone) };
}

type OutboxOp = { op: 'insert'; entry: LogEntry } | { op: 'delete'; id: string };

// The adapter --------------------------------------------------------------------------------

export function createSupabaseApi(deps: SupabaseApiDeps): ClinkApi {
  const sb = deps.client;
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? (() => globalThis.crypto.randomUUID());
  const timezone =
    deps.timezone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const avatarUrls = new Map<string, { url: string; until: number }>();
  const codeSentAt = new Map<string, number>();
  let flushing: Promise<void> | null = null;
  // The usual 3 editor saves on every change, so writes can overlap; they run one at a time.
  let usualChain: Promise<unknown> = Promise.resolve();

  async function authSession(): Promise<AuthSession | null> {
    const { data, error } = await sb.auth.getSession();
    if (error) throw fromAuth(error);
    return data.session;
  }

  async function uid(): Promise<string> {
    const s = await authSession();
    if (!s) throw new ApiError('unauthorized');
    return s.user.id;
  }

  /** Runs a Data API or Storage call and throws the mapped error. */
  async function q<T>(
    p: PromiseLike<{ data: T; error: PgError | null; status?: number }>,
  ): Promise<T> {
    let res: { data: T; error: PgError | null; status?: number };
    try {
      res = await p;
    } catch (e) {
      throw fromPostgrest({ message: (e as Error)?.message }, 0);
    }
    if (res.error) throw fromPostgrest(res.error, res.status);
    return res.data;
  }

  async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    let res: { data: T | null; error: unknown };
    try {
      res = (await sb.functions.invoke(name, { body })) as { data: T | null; error: unknown };
    } catch (e) {
      throw await fromFunction(e);
    }
    if (res.error) throw await fromFunction(res.error);
    return res.data as T;
  }

  async function installId(): Promise<string> {
    const have = await deps.plain.getItem('install_id');
    if (have) return have;
    const id = uuid();
    await deps.plain.setItem('install_id', id);
    return id;
  }

  // The widget token from the last register-device (ARCHITECTURE.md 3.1). The app uses it only
  // to read widget-api/state for the widget; the widget keeps its own sealed copy. Kept sealed
  // per user so a launch whose register-device failed can still refresh the widget.
  let widgetToken: { userId: string; token: string } | null = null;
  const tokenKey = (u: string) => `widget_token.${u}`;

  async function forgetWidgetToken(u: string): Promise<void> {
    widgetToken = null;
    await deps.sealed.removeItem(tokenKey(u));
  }

  async function currentWidgetToken(u: string): Promise<string | null> {
    if (widgetToken?.userId === u) return widgetToken.token;
    const stored = await deps.sealed.getItem(tokenKey(u));
    if (stored && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      widgetToken = { userId: u, token: stored };
      return stored;
    }
    return null;
  }

  // A sign-out whose register-device call didn't reach the server (ARCHITECTURE.md 3.6 step 3).
  // The plain store keeps only the install id, never a token; the call is sent again on the next
  // launch that has a session, before that launch's register-device.
  const PENDING_SIGNOUT = 'signout_pending';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const transient = (e: unknown) =>
    !(e instanceof ApiError) || ['network', 'server', 'rate_limited'].includes(e.code);

  async function retryPendingSignOut(): Promise<void> {
    const pending = await readJson<{ installId?: unknown }>(deps.plain, PENDING_SIGNOUT);
    if (!pending) return;
    const id = typeof pending.installId === 'string' ? pending.installId : '';
    if (UUID_RE.test(id)) {
      try {
        await invoke('register-device', { action: 'signout', installId: id });
      } catch (e) {
        // Still offline: keep the marker for the next launch. Any other answer is final.
        if (transient(e)) return;
      }
    }
    await deps.plain.removeItem(PENDING_SIGNOUT);
  }

  /** register-device, native only (its schema takes ios or android). Never throws. */
  async function registerDevice(): Promise<DeviceRegistration | null> {
    if (deps.platform === 'web') return null;
    try {
      const u = await uid();
      // First the sign-out an earlier launch couldn't send, so it can't undo this registration.
      await retryPendingSignOut().catch(() => undefined);
      const res = await invoke<unknown>('register-device', {
        action: 'register',
        installId: await installId(),
        platform: deps.platform,
        appVersion: deps.appVersion,
        timezone: timezone(),
        locale: deps.locale?.() ?? null,
        notifPermission: false,
      });
      const parsed = registerDeviceResponse.safeParse(res);
      if (!parsed.success || parsed.data.status !== 'registered') return null;
      widgetToken = { userId: u, token: parsed.data.widgetToken };
      await deps.sealed.setItem(tokenKey(u), parsed.data.widgetToken);
      return { widgetToken: parsed.data.widgetToken };
    } catch {
      // Offline, no account yet (404), rate limited or suspended: retried on the next launch.
      return null;
    }
  }

  async function getWidgetState(tz: string): Promise<WidgetState | null> {
    const cfg = deps.widgetApi;
    if (!cfg || deps.platform === 'web') return null;
    const u = await uid();
    const token = await currentWidgetToken(u);
    if (!token) return null;
    const doFetch = deps.fetch ?? globalThis.fetch;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), WIDGET_API_TIMEOUT_MS) : null;
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };
      if (cfg.region) headers[WIDGET_API_REGION_HEADER] = cfg.region;
      res = await doFetch(`${cfg.url}${WIDGET_API_PATHS.state}?tz=${encodeURIComponent(tz)}`, {
        method: 'GET',
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      throw new ApiError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 401) {
      // Rotated by another register-device, or revoked. Never reused.
      await forgetWidgetToken(u);
      throw new ApiError('unauthorized');
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (res.status === 429) {
      const sec = Number((body as { retryAfter?: number } | null)?.retryAfter);
      throw new ApiError('rate_limited', Number.isFinite(sec) ? { retryAfterSec: sec } : {});
    }
    if (res.status === 403) throw new ApiError('suspended');
    if (res.status >= 502 && res.status <= 504) throw new ApiError('network');
    if (!res.ok) throw new ApiError('server');
    // Add fields only (ARCHITECTURE.md 3.1): a newer server's extra keys are ignored and dropped.
    const parsed = widgetStateReadSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('server');
    return parsed.data;
  }

  // Outbox: drink logs never fail visibly (PRD 3.20). Ops replay in order.
  const outboxKey = (u: string) => `outbox.${u}`;
  const readOutbox = async (u: string) =>
    (await readJson<OutboxOp[]>(deps.sealed, outboxKey(u))) ?? [];
  const writeOutbox = (u: string, ops: OutboxOp[]) => writeJson(deps.sealed, outboxKey(u), ops);

  async function insertLog(u: string, entry: LogEntry): Promise<void> {
    // ON CONFLICT DO NOTHING: a retry of a row that already landed is a no-op.
    await q(
      sb
        .from('drink_logs')
        .upsert(rowFromEntry(u, entry), { onConflict: 'id', ignoreDuplicates: true }),
    );
  }

  async function deleteLog(u: string, id: string): Promise<void> {
    await q(sb.from('drink_logs').delete().eq('user_id', u).eq('id', id));
  }

  async function flush(u: string): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      let ops = await readOutbox(u);
      while (ops.length > 0) {
        const op = ops[0]!;
        try {
          if (op.op === 'insert') await insertLog(u, op.entry);
          else await deleteLog(u, op.id);
        } catch (e) {
          if (e instanceof ApiError && e.code === 'network') break;
          // Refused for good (a bad row): drop it rather than block the rest. A time is never the
          // reason: the server clamps it (ARCHITECTURE.md 3.2 "Log time").
        }
        ops = ops.slice(1);
        await writeOutbox(u, ops);
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function avatarUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const hit = avatarUrls.get(path);
    if (hit && hit.until > Date.now() + 60_000) return hit.url;
    const data = await q(sb.storage.from('avatars').createSignedUrl(path, SIGNED_URL_SEC));
    const url = (data as { signedUrl: string }).signedUrl;
    avatarUrls.set(path, { url, until: Date.now() + SIGNED_URL_SEC * 1000 });
    return url;
  }

  async function profileRow(u: string) {
    return q(
      sb
        .from('profiles')
        .select('display_name, avatar_path')
        .eq('id', u)
        .maybeSingle<{ display_name: string; avatar_path: string | null }>(),
    );
  }

  async function getMe(): Promise<Me> {
    const s = await authSession();
    if (!s) throw new ApiError('unauthorized');
    const u = s.user.id;
    const meta = (s.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const providerName = (meta.full_name || meta.name || '').trim() || null;
    const hasPhone = !!s.user.phone && !!s.user.phone_confirmed_at;
    const [profile, settings] = await Promise.all([
      profileRow(u),
      q(
        sb
          .from('user_settings')
          .select('onboarding_step')
          .eq('user_id', u)
          .maybeSingle<{ onboarding_step: string }>(),
      ),
    ]);
    if (!profile) {
      return {
        displayName: '',
        photoUri: null,
        providerName,
        hasPhone,
        onboarding: 'name',
        needsSignup: true,
      };
    }
    return {
      displayName: profile.display_name,
      photoUri: await avatarUrl(profile.avatar_path).catch(() => null),
      providerName,
      hasPhone,
      onboarding: stepFromDb(settings?.onboarding_step),
      needsSignup: false,
    };
  }

  async function setPhoto(u: string, photoUri: string | null): Promise<void> {
    const profile = await profileRow(u);
    const oldPath = profile?.avatar_path ?? null;
    const oldUrl = oldPath ? avatarUrls.get(oldPath)?.url : undefined;
    if (photoUri === oldUrl) return;
    if (photoUri === null) {
      if (!oldPath) return;
      await q(sb.from('profiles').update({ avatar_path: null }).eq('id', u));
    } else {
      if (!deps.prepareAvatar) throw new ApiError('unsupported');
      let bytes: Uint8Array;
      try {
        bytes = await deps.prepareAvatar(photoUri);
      } catch {
        throw new ApiError('bad_input');
      }
      const path = `${u}/${now().getTime()}.jpg`;
      await q(
        sb.storage
          .from('avatars')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: false }),
      );
      await q(sb.from('profiles').update({ avatar_path: path }).eq('id', u));
    }
    if (oldPath) {
      avatarUrls.delete(oldPath);
      // Old versions go now; snap-cleanup removes any that a failure here leaves behind.
      await sb.storage
        .from('avatars')
        .remove([oldPath])
        .catch(() => undefined);
    }
  }

  async function signOutLocal(): Promise<void> {
    try {
      await sb.auth.signOut({ scope: 'local' });
    } catch {
      // the stored session is cleared either way
    }
  }

  async function writeUsual(drinks: UsualDrink[]): Promise<UsualDrink[]> {
    const u = await uid();
    // Slot by slot: update the row if it exists, else insert it. An upsert would also try to
    // update user_id, which the column grants don't allow.
    for (const [i, d] of drinks.entries()) {
      const slot = i + 1;
      const fields = {
        drink_id: d.drinkId,
        custom_name: d.drinkId ? null : d.customName,
        category: d.category,
        details: d.details,
      };
      const updated = await q(
        sb.from('usual_drinks').update(fields).eq('user_id', u).eq('slot', slot).select('slot'),
      );
      if ((updated as unknown[]).length === 0) {
        await q(sb.from('usual_drinks').insert({ user_id: u, slot, ...fields }));
      }
    }
    await q(sb.from('usual_drinks').delete().eq('user_id', u).gt('slot', drinks.length));
    return api.getUsual();
  }

  const api: ClinkApi = {
    async getSession() {
      const s = await authSession();
      return s ? toSession(s) : null;
    },

    async signIn() {
      throw new ApiError('unsupported');
    },

    async signOut() {
      const s = await authSession().catch(() => null);
      if (deps.platform !== 'web') {
        const install = await installId();
        try {
          await invoke('register-device', { action: 'signout', installId: install });
          await deps.plain.removeItem(PENDING_SIGNOUT);
        } catch {
          // Signing out still works offline. The server call is sent again on the next launch
          // with a session (3.6 step 3); until then any register-device on this install revokes
          // this account's widget token (0019).
          await writeJson(deps.plain, PENDING_SIGNOUT, { installId: install });
        }
      }
      if (s) await forgetWidgetToken(s.user.id);
      await signOutLocal();
    },

    async sendPhoneCode(e164) {
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) throw new ApiError('phone_invalid');
      const { error } = await sb.auth.signInWithOtp({
        phone: e164,
        options: { shouldCreateUser: true },
      });
      if (error) throw fromAuth(error);
      codeSentAt.set(e164, now().getTime());
    },

    async verifyPhoneCode(e164, code) {
      const key = `code_wrong.${e164}`;
      const t = now().getTime();
      const tries = ((await readJson<number[]>(deps.plain, key)) ?? []).filter(
        (at) => t - at < CODE_LOCK_MS,
      );
      if (tries.length >= CODE_MAX_WRONG) {
        const until = Math.min(...tries) + CODE_LOCK_MS;
        throw new ApiError('code_locked', { retryAfterSec: Math.ceil((until - t) / 1000) });
      }
      const { data, error } = await sb.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
      if (error || !data.session) {
        const mapped = error ? fromAuth(error) : new ApiError('server');
        // Supabase answers otp_expired for a wrong code and an old one alike.
        if (
          error?.code === 'otp_expired' ||
          error?.code === 'invalid_otp' ||
          mapped.code === 'unauthorized'
        ) {
          const sent = codeSentAt.get(e164);
          if (sent !== undefined && t - sent > CODE_VALID_MS) throw new ApiError('code_expired');
          const next = [...tries, t];
          await writeJson(deps.plain, key, next);
          if (next.length >= CODE_MAX_WRONG) {
            throw new ApiError('code_locked', { retryAfterSec: CODE_LOCK_MS / 1000 });
          }
          throw new ApiError('code_wrong');
        }
        throw mapped;
      }
      await deps.plain.removeItem(key);
      codeSentAt.delete(e164);
      // register-device runs from the store once the account exists (lib/widget/sync.ts).
      return toSession(data.session);
    },

    async completeSignup(age, displayName) {
      try {
        await invoke('complete-signup', {
          birthMonth: age.birthMonth,
          birthYear: age.birthYear,
          displayName: displayName.trim(),
          timezone: timezone(),
          installId: await installId(),
        });
      } catch (e) {
        // Too young: the server already deleted the identity, so this session is dead.
        if (e instanceof ApiError && e.code === 'under_age') await signOutLocal();
        throw e;
      }
    },

    async deleteAccount() {
      const u = await uid();
      await invoke('delete-account', {});
      await deps.sealed.removeItem(outboxKey(u));
      await forgetWidgetToken(u);
      await deps.plain.removeItem(`level_seen.${u}`);
      await signOutLocal();
    },

    onSessionEnd(listener) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) listener();
      });
      return () => data.subscription.unsubscribe();
    },

    getMe,

    async updateMe(patch) {
      const u = await uid();
      if (patch.displayName !== undefined) {
        await q(sb.from('profiles').update({ display_name: patch.displayName.trim() }).eq('id', u));
      }
      if (patch.photoUri !== undefined) await setPhoto(u, patch.photoUri);
      if (patch.onboarding !== undefined) {
        await q(
          sb.from('user_settings').update({ onboarding_step: patch.onboarding }).eq('user_id', u),
        );
      }
      return getMe();
    },

    async addPhone(e164) {
      // Starts the change: Supabase texts a code to the new number. The code step and contact
      // matching arrive in M3; until the number is confirmed, hasPhone stays false.
      const { error } = await sb.auth.updateUser({ phone: e164 });
      if (error) throw fromAuth(error);
      return getMe();
    },

    async getUsual() {
      const u = await uid();
      const rows = await q(
        sb
          .from('usual_drinks')
          .select('slot, drink_id, custom_name, category, details')
          .eq('user_id', u)
          .order('slot', { ascending: true }),
      );
      return (rows as UsualRow[]).map(usualFromRow);
    },

    async setUsual(drinks) {
      if (drinks.length > 3) throw new ApiError('bad_input');
      for (const d of drinks) {
        if (d.drinkId && !isFlareDrink(d.drinkId)) throw new ApiError('bad_input');
      }
      const run = usualChain.catch(() => undefined).then(() => writeUsual(drinks));
      usualChain = run;
      return run;
    },

    async getToday() {
      const u = await uid();
      await flush(u);
      const today = localDate(now());
      const rows = await q(
        sb
          .from('drink_logs')
          .select(
            'id, user_id, drink_id, drink_name, category, caffeinated, logged_at, local_date, source',
          )
          .eq('user_id', u)
          .eq('local_date', today)
          .order('logged_at', { ascending: true }),
      );
      const ops = await readOutbox(u);
      const deleted = new Set(
        ops.filter((o) => o.op === 'delete').map((o) => (o as { id: string }).id),
      );
      const byId = new Map<string, LogEntry>();
      for (const r of rows as DrinkLogRow[])
        if (!deleted.has(r.id)) byId.set(r.id, entryFromRow(r));
      for (const o of ops) {
        if (o.op === 'insert' && localDate(new Date(o.entry.loggedAt)) === today) {
          byId.set(o.entry.id, o.entry);
        }
      }
      return [...byId.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    },

    async logDrink(input) {
      const u = await uid();
      const entry: LogEntry = { id: uuid(), ...input, loggedAt: now().toISOString() };
      rowFromEntry(u, entry); // validates before anything is queued
      try {
        await insertLog(u, entry);
        void flush(u).catch(() => undefined);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'network')) throw e;
        await writeOutbox(u, [...(await readOutbox(u)), { op: 'insert', entry }]);
      }
      return entry;
    },

    async removeLog(id) {
      const u = await uid();
      const ops = await readOutbox(u);
      if (ops.some((o) => o.op === 'insert' && o.entry.id === id)) {
        await writeOutbox(
          u,
          ops.filter((o) => !(o.op === 'insert' && o.entry.id === id)),
        );
        return;
      }
      try {
        await deleteLog(u, id);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'network')) throw e;
        await writeOutbox(u, [...ops, { op: 'delete', id }]);
      }
    },

    async restoreLog(entry) {
      const u = await uid();
      const ops = await readOutbox(u);
      const pendingDelete = ops.some((o) => o.op === 'delete' && o.id === entry.id);
      if (pendingDelete) {
        // The delete never reached the server, so the row is still there.
        await writeOutbox(
          u,
          ops.filter((o) => !(o.op === 'delete' && o.id === entry.id)),
        );
        return;
      }
      try {
        await insertLog(u, entry);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'network')) throw e;
        await writeOutbox(u, [...ops, { op: 'insert', entry }]);
      }
    },

    async getXp() {
      const u = await uid();
      const [totalRow, events] = await Promise.all([
        q(sb.from('xp_totals').select('total').eq('user_id', u).maybeSingle<{ total: number }>()),
        q(
          sb
            .from('xp_events')
            .select('id, kind, amount, counterpart, created_at')
            .eq('user_id', u)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(20),
        ),
      ]);
      const evs = events as {
        id: number;
        kind: string;
        amount: number;
        counterpart: string | null;
        created_at: string;
      }[];
      const ids = [...new Set(evs.map((e) => e.counterpart).filter((c): c is string => !!c))];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        // RLS returns only friends and pending requests; anyone else stays unnamed.
        const people = await q(sb.from('profiles').select('id, display_name').in('id', ids));
        for (const p of people as { id: string; display_name: string }[]) {
          names.set(p.id, firstName(p.display_name));
        }
      }
      const history: XpEntry[] = [];
      for (const e of evs) {
        const kind = xpKindSchema.safeParse(e.kind);
        if (!kind.success) continue;
        history.push({
          id: String(e.id),
          kind: kind.data,
          amount: e.amount,
          name: e.counterpart ? (names.get(e.counterpart) ?? null) : null,
          at: new Date(e.created_at).toISOString(),
        });
      }
      const seen = Number(await deps.plain.getItem(`level_seen.${u}`));
      return {
        total: totalRow?.total ?? 0,
        history,
        levelSeen: Number.isFinite(seen) && seen >= 1 ? seen : 1,
      };
    },

    async markLevelSeen(level) {
      // On this device only: the server has no column for it, and nobody else may see a level.
      const u = await uid();
      const key = `level_seen.${u}`;
      const prev = Number(await deps.plain.getItem(key)) || 1;
      await deps.plain.setItem(key, String(Math.max(prev, level)));
    },

    async getAudience() {
      const u = await uid();
      const [friends, groups] = await Promise.all([
        sb.from('friendships').select('user_a', { count: 'exact', head: true }),
        q(
          sb
            .from('groups')
            .select('id, name, emoji, auto_role, group_members(count)')
            .eq('owner_id', u)
            .order('created_at', { ascending: true }),
        ),
      ]);
      if (friends.error) throw fromPostgrest(friends.error, friends.status);
      const gs = groups as {
        id: string;
        name: string;
        emoji: string | null;
        auto_role: 'work' | 'home' | null;
        group_members: { count: number }[];
      }[];
      return {
        friendCount: friends.count ?? 0,
        groups: gs.map((g) => ({
          id: g.id,
          name: g.name,
          emoji: g.emoji ?? '',
          memberCount: g.group_members[0]?.count ?? 0,
        })),
        auto: {
          daytimeGroupId: gs.find((g) => g.auto_role === 'work')?.id ?? null,
          otherGroupId: gs.find((g) => g.auto_role === 'home')?.id ?? null,
        },
      };
    },

    async getLastPlace() {
      const u = await uid();
      const row = await q(
        sb
          .from('flares')
          .select('place')
          .eq('sender_id', u)
          .not('place', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ place: string | null }>(),
      );
      return row?.place ?? '';
    },

    async getLiveFlare() {
      const u = await uid();
      const row = await q(
        sb
          .from('flares')
          .select('id, category, place, created_at, expires_at')
          .eq('sender_id', u)
          .eq('status', 'live')
          .maybeSingle<{
            id: string;
            category: FlareCategory;
            place: string | null;
            created_at: string;
            expires_at: string;
          }>(),
      );
      return row
        ? {
            id: row.id,
            category: row.category,
            place: row.place ?? '',
            createdAt: row.created_at,
            expiresAt: row.expires_at,
          }
        : null;
    },

    async sendFlare() {
      // send-flare lands in M4 (ARCHITECTURE.md 13).
      throw new ApiError('unsupported');
    },

    async shareSnap() {
      // share-snap lands in M5.
      throw new ApiError('unsupported');
    },

    async getInviteUrl() {
      const u = await uid();
      const row = await q(
        sb
          .from('invites')
          .select('code')
          .eq('inviter_id', u)
          .is('revoked_at', null)
          .maybeSingle<{ code: string }>(),
      );
      if (!row) throw new ApiError('not_found');
      // The URL only ever goes inside a share message (guideline 6). The domain is not bought yet.
      return `${deps.inviteBase ?? 'https://example.invalid'}/i/${row.code}`;
    },

    async recordInviteShare(channel) {
      // First-party analytics (PRD 6). RLS refuses it when "Share usage stats" is off; that's fine.
      try {
        const u = await uid();
        await sb.from('app_events').insert({
          user_id: u,
          name: 'invite_share_tapped',
          props: { channel, surface: 'onboarding' },
        });
      } catch {
        // never blocks sharing
      }
    },

    async requestContacts(): Promise<PermissionResult> {
      return 'denied';
    },
    async getContactMatches() {
      return [];
    },
    async addContact() {
      throw new ApiError('unsupported');
    },

    async requestNotifications(): Promise<PermissionResult> {
      // The pre-prompt stores nothing on the server; register-device carries the permission
      // once expo-notifications ships with push (M4).
      return 'denied';
    },

    registerDevice,
    getWidgetState,
  };
  return api;
}
