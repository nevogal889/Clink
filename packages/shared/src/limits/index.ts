// PRD limits as zod schemas and constants, shared by the app, edge functions and native ports.
// Sources: PRD.md 3.1 to 3.20 (text limits, caps, timers), DECISIONS.md (flare timing),
// ARCHITECTURE.md 4.2 (database checks), 5 (OTP) and 8.3 (rate limits).
import { z } from 'zod';

/** Characters as Postgres `char_length` counts them: code points, not UTF-16 units. */
export function charLength(s: string): number {
  return Array.from(s).length;
}

/** Free-text limits, in characters (PRD 3.0 "Text other people see"). */
export const TEXT_LIMITS = {
  displayName: 30, // PRD 3.2 rule 1: 1 to 30
  place: 40, // PRD 3.4 rule 2, 3.5 rule 4
  customDrinkName: 30, // PRD 3.7 rule 2
  note: 120, // PRD 3.7 option table
  planB: 80, // PRD 3.7 option table
  oneTimeNote: 80, // PRD 3.6 rule 5
  groupName: 20, // PRD 3.10 rule 2
  groupEmoji: 16, // ARCHITECTURE.md 4.2 groups.emoji (one emoji, ZWJ sequences included)
  reportNote: 200, // PRD 3.18 rule 1
} as const;

function text(max: number, min = 0) {
  return z
    .string()
    .refine((s) => charLength(s) <= max, { message: `At most ${max} characters` })
    .refine((s) => charLength(s.trim()) >= min, { message: `At least ${min} character` });
}

export const displayNameSchema = text(TEXT_LIMITS.displayName, 1);
export const placeSchema = text(TEXT_LIMITS.place);
export const customDrinkNameSchema = text(TEXT_LIMITS.customDrinkName, 1);
export const noteSchema = text(TEXT_LIMITS.note);
export const planBSchema = text(TEXT_LIMITS.planB);
export const oneTimeNoteSchema = text(TEXT_LIMITS.oneTimeNote);
export const groupNameSchema = text(TEXT_LIMITS.groupName, 1);
export const groupEmojiSchema = text(TEXT_LIMITS.groupEmoji, 1);
export const reportNoteSchema = text(TEXT_LIMITS.reportNote);

/** Invite codes: 8 characters of Crockford base32 (ARCHITECTURE.md 4.2 invites.code). */
export const INVITE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const inviteCodeSchema = z.string().regex(INVITE_CODE_RE);

/** Caps on people and things. */
export const CAPS = {
  friends: 20, // DECISIONS.md "Mutual friends, capped at 20"
  groups: 10, // PRD 3.10 rule 2
  usualDrinks: 3, // PRD 3.7 rule 1
  groupSuggestionAtFriends: 6, // PRD 3.10 rule 4
  liveFlaresPerSender: 1, // PRD 3.5 rule 7
  caffeineNoteAfter: 4, // PRD 3.11 rule 6: the note shows after the 4th caffeinated drink
  reportReasons: 5, // PRD 3.18 rule 1
} as const;

/** Server rate limits (ARCHITECTURE.md 8.3). Exceeding one returns 429 with `retryAfter`. */
export const RATE_LIMITS = {
  flaresPerDay: 12,
  /** The 4th and later flares in 60 minutes reach widgets but notify silently (PRD 3.5 rule 15). */
  loudFlaresPerHour: 3,
  snapsPerDay: 20,
  reactionChangesPerHour: 60,
  friendRequestsPerDay: 30,
  contactChecksPerDay: 3,
  contactHashesPerCall: 2000,
  inviteRedemptionsPerDay: 10,
  invitePreviewsPerHourPerIp: 60,
  reportsPerDay: 20,
  avatarUploadsPerDay: 10,
  registerDevicePerDay: 20,
  webDeletionOtpPerNumberPerHour: 5,
  widgetApiCallsPerHourPerDevice: 120,
} as const;

/** Timers, in the unit their name says. */
export const TIMERS = {
  pickerTimeoutSec: 30, // PRD 3.3 rule 3
  widgetConfirmationSec: 4, // DESIGN.md 5.2 "about 4 s"
  sendFailedAfterSec: 30, // ARCHITECTURE.md 3.2 outbox: Failed state from createdAt + 30 s
  flareDropAfterMin: 2, // PRD 3.20: a flare not sent within 2 minutes is dropped
  snapDropAfterMin: 60, // COPY.md 4.23 off.snap_dropped
  widgetCallTimeoutSec: 8, // ARCHITECTURE.md 3.2
  widgetStaleAfterMin: 10, // ARCHITECTURE.md 3.3: refresh state older than 10 minutes
  snapLifetimeHours: 24, // DECISIONS.md, from upload
  runListHours: 2, // PRD 3.5 rule 11
  recipientVisibleAfterCloseHours: 2, // PRD 3.5 rule 18
  friendRequestExpiryDays: 30, // COPY.md 4.12 friends.req.helper
  undoSnackbarSec: 5, // COPY.md 4.7 cancel.toast
  undoSnackbarScreenReaderSec: 10, // QA_PLAN.md T42
  smsCodeValidMin: 10, // ARCHITECTURE.md 5
  smsResendSec: 30, // ARCHITECTURE.md 5
  smsWrongCodesBeforeLock: 5, // ARCHITECTURE.md 5
  smsLockMin: 15, // ARCHITECTURE.md 5
  smsSlowHintSec: 30, // COPY.md 4.1 code.slow
  tappedAtToleranceSec: 120, // ARCHITECTURE.md 4.6: tappedAt trusted within 2 minutes
  lastDrinkShareMaxHours: 24, // PRD 3.11 rule 7
  trackerHistoryDays: 90, // PRD 3.11 rule 9
} as const;

/** Local hour from which the caffeine note uses the evening wording (COPY.md 4.15). */
export const CAFFEINE_EVENING_FROM_HOUR = 17;

// ---------------------------------------------------------------------------------------------
// Flare timing (DECISIONS.md "Flare timing", PRD 3.5 rules 2 and 3)

/** Pills, in order: Now, 5m, 15m, 30m, Other. */
export const TIMING_PILLS = [
  { kind: 'now', minutes: 0 },
  { kind: 'minutes', minutes: 5 },
  { kind: 'minutes', minutes: 15 },
  { kind: 'minutes', minutes: 30 },
  { kind: 'other' },
] as const;

export const OTHER_TIMING_MIN = 5;
export const OTHER_TIMING_MAX = 60;
export const OTHER_TIMING_STEP = 5;
/** The Other grid: 5 to 60 in steps of 5. Nothing beyond 60. */
export const OTHER_TIMING_VALUES: readonly number[] = Array.from(
  { length: (OTHER_TIMING_MAX - OTHER_TIMING_MIN) / OTHER_TIMING_STEP + 1 },
  (_, i) => OTHER_TIMING_MIN + i * OTHER_TIMING_STEP,
);
/** A flare stays open until the meet time, and at least this long after sending. */
export const MIN_OPEN_MINUTES = 15;

/** Every timing the API accepts: 0 (Now) or an Other value (which covers the 5, 15, 30 pills). */
export const VALID_TIMING_MINUTES: readonly number[] = [0, ...OTHER_TIMING_VALUES];

export const timingMinSchema = z
  .number()
  .int()
  .refine((m) => VALID_TIMING_MINUTES.includes(m), {
    message: 'Timing is 0 or 5 to 60 in steps of 5',
  });

export interface FlareTimes {
  meetAt: Date;
  /** Close time. Every countdown counts to this (ARCHITECTURE.md 3.4). */
  expiresAt: Date;
}

const MINUTE = 60_000;

/**
 * Meet and close times for a flare the server received at `createdAt`
 * (ARCHITECTURE.md 4.2: expires_at = greatest(meet_at, created_at + 15 minutes)).
 */
export function flareTimes(createdAt: Date, timingMin: number): FlareTimes {
  timingMinSchema.parse(timingMin);
  const meetAt = new Date(createdAt.getTime() + timingMin * MINUTE);
  const minClose = createdAt.getTime() + MIN_OPEN_MINUTES * MINUTE;
  return { meetAt, expiresAt: new Date(Math.max(meetAt.getTime(), minClose)) };
}

/** The flare's close time. */
export function flareExpiresAt(createdAt: Date, timingMin: number): Date {
  return flareTimes(createdAt, timingMin).expiresAt;
}

/** Open until close time, exclusive: at `expiresAt` it has ended. */
export function isFlareOpen(expiresAt: Date, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}

/** Milliseconds left on a countdown, never negative. */
export function msLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/** The sender's run list stays in the app this long after the flare closes as done. */
export function runListUntil(closedAt: Date): Date {
  return new Date(closedAt.getTime() + TIMERS.runListHours * 60 * MINUTE);
}

/** Recipients can see a flare until 2 hours after it closes (PRD 3.5 rule 18). */
export function recipientVisibleUntil(closedAt: Date): Date {
  return new Date(closedAt.getTime() + TIMERS.recipientVisibleAfterCloseHours * 60 * MINUTE);
}

/**
 * Which instant decides Automatic and the flare's window: the client's tap time when it is
 * within 2 minutes of server time, else server time (ARCHITECTURE.md 4.6).
 */
export function decisionInstant(tappedAt: Date | null, serverNow: Date): Date {
  if (!tappedAt) return serverNow;
  const drift = Math.abs(serverNow.getTime() - tappedAt.getTime());
  return drift <= TIMERS.tappedAtToleranceSec * 1000 ? tappedAt : serverNow;
}
