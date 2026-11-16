// Errors the data layer throws, as API codes. Screens never see a vendor error: every
// implementation maps its failures to an ApiError, and `errorText` turns a code into COPY.md words.
import { t } from '@clink/shared';

export type ApiErrorCode =
  /** No connection, a timeout, or the server could not be reached. Safe to retry. */
  | 'network'
  /** The session is gone or was refused. The user signs in again. */
  | 'unauthorized'
  /** Account deletion needs a sign-in from the last 10 minutes (ARCHITECTURE.md 4.7 step 1). */
  | 'reauth_required'
  | 'under_age'
  | 'code_wrong'
  | 'code_expired'
  | 'code_locked'
  | 'phone_invalid'
  | 'phone_taken'
  /** The phone provider couldn't send a code (on clink-dev: any number but the test numbers). */
  | 'sms_failed'
  | 'rate_limited'
  | 'text_blocked'
  | 'suspended'
  | 'not_found'
  | 'flare_ended'
  | 'live_flare_exists'
  | 'no_friends'
  /** Not built on this backend yet (a later milestone), or a provider that is switched off. */
  | 'unsupported'
  | 'bad_input'
  | 'server';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** Seconds to wait, from a 429 or the local code lock. */
  readonly retryAfterSec?: number;
  /** The minimum age, from an under_age answer. */
  readonly min?: number;

  constructor(code: ApiErrorCode, opts: { retryAfterSec?: number; min?: number } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    if (opts.retryAfterSec !== undefined) this.retryAfterSec = opts.retryAfterSec;
    if (opts.min !== undefined) this.min = opts.min;
  }
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

export function errorCode(e: unknown): ApiErrorCode {
  return e instanceof ApiError ? e.code : 'server';
}

const minutes = (sec: number | undefined) => Math.max(1, Math.ceil((sec ?? 60) / 60));

/**
 * The words for an error (COPY.md 4.22 and the rate limits table). `fallback` is the screen's own
 * last-resort line, `err.generic` unless the screen says otherwise.
 */
export function errorText(
  e: unknown,
  fallback: 'err.generic' | 'err.signin_failed' | 'del.error' | 'err.load' = 'err.generic',
): string {
  if (!(e instanceof ApiError)) return t(fallback);
  switch (e.code) {
    case 'code_wrong':
      return t('err.code_wrong');
    case 'code_expired':
      return t('err.code_expired');
    case 'code_locked':
      return t('err.code_locked', { n: minutes(e.retryAfterSec) });
    case 'phone_invalid':
      return t('err.phone_invalid');
    case 'phone_taken':
      return t('err.phone_taken');
    case 'text_blocked':
      return t('err.text_blocked');
    case 'rate_limited':
      return t('rl.generic', { n: minutes(e.retryAfterSec) });
    case 'flare_ended':
      return t('err.flare_ended');
    case 'no_friends':
      return t('err.no_friends');
    case 'sms_failed':
      return t('err.signin_failed');
    default:
      return t(fallback);
  }
}
