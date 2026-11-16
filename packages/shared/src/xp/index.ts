// XP kinds, values, caps, level thresholds and names. Values mirror docs/PRD.md 4.2 to 4.4
// (a test reads the PRD tables and fails on drift); names come from COPY.md 3 through the string
// table. The server (`private.award_xp()`) is the authority; these pure functions are the same
// rules for the app's "How XP works" sheet, edge functions and tests.
import { z } from 'zod';
import type { StringKey } from '../strings';

export const XP_AWARD_KINDS = [
  'invite_accepted',
  'new_friend',
  'flare_joined',
  'flare_got_joiner',
  'drink_run_done',
  'daily_log',
] as const;
export const XP_REVERSAL_KINDS = ['invite_reversed', 'log_reversed'] as const;
export const XP_KINDS = [...XP_AWARD_KINDS, ...XP_REVERSAL_KINDS] as const;

export type XpAwardKind = (typeof XP_AWARD_KINDS)[number];
export type XpReversalKind = (typeof XP_REVERSAL_KINDS)[number];
export type XpKind = (typeof XP_KINDS)[number];
export const xpKindSchema = z.enum(XP_KINDS);

/**
 * Pair rule per kind (PRD 4.3 rules 3 and 4):
 * - once_ever: invite and new-friend XP, once per pair across both kinds, ever.
 * - once_per_day: one award per counterpart per local day for this kind.
 * - none: no counterpart.
 */
export type PairRule = 'once_ever' | 'once_per_day' | 'none';

export const XP_RULES = {
  invite_accepted: { amount: 50, dailyCap: 10, pair: 'once_ever' },
  new_friend: { amount: 10, dailyCap: 5, pair: 'once_ever' },
  flare_joined: { amount: 10, dailyCap: 3, pair: 'once_per_day' },
  flare_got_joiner: { amount: 15, dailyCap: 2, pair: 'once_per_day' },
  drink_run_done: { amount: 20, dailyCap: 3, pair: 'once_per_day' },
  daily_log: { amount: 5, dailyCap: 1, pair: 'none' },
} as const satisfies Record<XpAwardKind, { amount: number; dailyCap: number; pair: PairRule }>;

export const XP_REVERSALS = {
  invite_reversed: { reverses: 'invite_accepted', amount: -50 },
  log_reversed: { reverses: 'daily_log', amount: -5 },
} as const satisfies Record<XpReversalKind, { reverses: XpAwardKind; amount: number }>;

/** Invite XP is reversed when the friendship ends or the invitee leaves within this window. */
export const INVITE_REVERSAL_WINDOW_DAYS = 7;
/** daily_log counts only logs received within this many hours of `logged_at` (PRD 4.3 rule 11). */
export const LOG_XP_WINDOW_HOURS = 36;

/** PRD 4.4. Defaults only: thresholds are server config, so pass the served list when known. */
export const LEVEL_THRESHOLDS = [0, 100, 300, 700, 1400, 2500, 4000, 6000] as const;
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** History line per ledger kind (COPY.md 4.16). `xp.e.adjust` names nobody on purpose. */
export const XP_HISTORY_KEYS = {
  invite_accepted: 'xp.e.invite',
  new_friend: 'xp.e.friend',
  flare_joined: 'xp.e.joined',
  flare_got_joiner: 'xp.e.replied',
  drink_run_done: 'xp.e.run',
  daily_log: 'xp.e.log',
  invite_reversed: 'xp.e.adjust',
  log_reversed: 'xp.e.log_undo',
} as const satisfies Record<XpKind, StringKey>;

export interface LevelInfo {
  level: number;
  nameKey: StringKey;
  descKey: StringKey;
  /** Total needed for this level. */
  floor: number;
  /** null at the top level. */
  next: { level: number; at: number; nameKey: StringKey } | null;
  /** XP still needed for the next level; null at the top level ("Top level"). */
  xpToNext: number | null;
  /** 0 to 1 through the current level; 1 at the top level. */
  progress: number;
}

function levelKeys(level: number): { nameKey: StringKey; descKey: StringKey } {
  return {
    nameKey: `level.${level}` as StringKey,
    descKey: `level.${level}.desc` as StringKey,
  };
}

/** Level for a total. Totals below 0 (after reversals) are level 1. */
export function levelForTotal(
  total: number,
  thresholds: readonly number[] = LEVEL_THRESHOLDS,
): LevelInfo {
  if (thresholds.length === 0 || thresholds[0] !== 0) {
    throw new Error('Level thresholds must start at 0');
  }
  for (let i = 1; i < thresholds.length; i++) {
    if ((thresholds[i] ?? 0) <= (thresholds[i - 1] ?? 0)) {
      throw new Error('Level thresholds must increase');
    }
  }
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) if (total >= (thresholds[i] ?? Infinity)) idx = i;
  const level = idx + 1;
  const floor = thresholds[idx] ?? 0;
  const nextAt = thresholds[idx + 1];
  if (nextAt === undefined) {
    return { level, ...levelKeys(level), floor, next: null, xpToNext: null, progress: 1 };
  }
  const clamped = Math.max(total, floor);
  return {
    level,
    ...levelKeys(level),
    floor,
    next: { level: level + 1, at: nextAt, nameKey: levelKeys(level + 1).nameKey },
    xpToNext: nextAt - clamped,
    progress: (clamped - floor) / (nextAt - floor),
  };
}

/** One row of the receiver's ledger (`xp_events`), as far as the award rules need it. */
export interface LedgerEntry {
  kind: XpKind;
  counterpart: string | null;
  refId: string | null;
  localDate: string;
}

export type FlareOutcome = 'done' | 'expired_no_replies' | 'cancelled' | 'replaced';

/** Something that may earn XP. `localDate` is the receiver's local day for the award. */
export type AwardCandidate =
  | {
      kind: 'invite_accepted';
      localDate: string;
      /** The invitee. */
      counterpart: string;
      /** The invitee's account was created through this invite. */
      inviteeIsNewAccount: boolean;
      /** The invitee has a verified phone, Apple or Google identity. */
      inviteeVerified: boolean;
      /** The invitee's install id or push token belonged to another account in the last 30 days. */
      inviteeDeviceReused: boolean;
    }
  | { kind: 'new_friend'; localDate: string; counterpart: string }
  | {
      kind: 'flare_joined';
      localDate: string;
      /** The flare. */
      refId: string;
      /** The flare's sender. */
      counterpart: string;
      flareOutcome: FlareOutcome;
      /** The reply was not withdrawn before close. */
      replyStands: boolean;
    }
  | {
      kind: 'flare_got_joiner';
      localDate: string;
      refId: string;
      flareOutcome: FlareOutcome;
      /** Repliers whose reply still stands, in reply order. The first one not yet counted today is the counterpart. */
      joiners: readonly string[];
    }
  | {
      kind: 'drink_run_done';
      localDate: string;
      refId: string;
      /** The friend who asked for the drink. */
      counterpart: string;
      flareOutcome: FlareOutcome;
      /** The Bring me one was still attached at done or close. */
      orderStands: boolean;
    }
  | {
      kind: 'daily_log';
      localDate: string;
      /** When the drink was logged (device time), ISO 8601. */
      loggedAt: string;
      /** When the server received it, ISO 8601. */
      receivedAt: string;
      /** The receiver's local date today, YYYY-MM-DD. `localDate` must be this or the day before. */
      todayLocalDate: string;
    };

export type AwardRefusal =
  | 'flare_not_done'
  | 'reply_withdrawn'
  | 'order_cancelled'
  | 'no_joiners'
  | 'invite_not_eligible'
  | 'log_out_of_window'
  | 'duplicate'
  | 'pair_once'
  | 'pair_cap'
  | 'daily_cap';

export type AwardDecision =
  | {
      awardable: true;
      kind: XpAwardKind;
      amount: number;
      counterpart: string | null;
      refId: string | null;
      localDate: string;
    }
  | { awardable: false; reason: AwardRefusal };

export interface AwardContext {
  /** The receiver's ledger rows for `candidate.localDate` (other days are ignored). */
  ledgerForDay: readonly LedgerEntry[];
  /** Everyone the receiver ever got invite or new-friend XP for, on any day. */
  pairsEver?: readonly string[];
}

function previousDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Decides whether a candidate earns XP, given the receiver's ledger. Checks, in order: the
 * outcome rules (PRD 4.3 rules 1, 5, 6, 8, 11), idempotency (rule 9), the pair rules (3, 4) and
 * the daily cap (4.2). Pure: the caller writes the ledger row.
 */
export function decideAward(candidate: AwardCandidate, ctx: AwardContext): AwardDecision {
  const rule = XP_RULES[candidate.kind];
  const day = ctx.ledgerForDay.filter((e) => e.localDate === candidate.localDate);
  const no = (reason: AwardRefusal): AwardDecision => ({ awardable: false, reason });

  let counterpart: string | null = null;
  let refId: string | null = null;

  switch (candidate.kind) {
    case 'invite_accepted':
      if (
        !candidate.inviteeIsNewAccount ||
        !candidate.inviteeVerified ||
        candidate.inviteeDeviceReused
      ) {
        return no('invite_not_eligible');
      }
      counterpart = candidate.counterpart;
      break;
    case 'new_friend':
      counterpart = candidate.counterpart;
      break;
    case 'flare_joined':
      if (candidate.flareOutcome !== 'done') return no('flare_not_done');
      if (!candidate.replyStands) return no('reply_withdrawn');
      counterpart = candidate.counterpart;
      refId = candidate.refId;
      break;
    case 'drink_run_done':
      if (candidate.flareOutcome !== 'done') return no('flare_not_done');
      if (!candidate.orderStands) return no('order_cancelled');
      counterpart = candidate.counterpart;
      refId = candidate.refId;
      break;
    case 'flare_got_joiner': {
      if (candidate.flareOutcome !== 'done') return no('flare_not_done');
      if (candidate.joiners.length === 0) return no('no_joiners');
      refId = candidate.refId;
      if (day.some((e) => e.kind === 'flare_got_joiner' && e.refId === refId)) {
        return no('duplicate');
      }
      const used = new Set(
        day.filter((e) => e.kind === 'flare_got_joiner').map((e) => e.counterpart),
      );
      const fresh = candidate.joiners.find((j) => !used.has(j));
      if (fresh === undefined) return no('pair_cap');
      counterpart = fresh;
      break;
    }
    case 'daily_log': {
      const logged = Date.parse(candidate.loggedAt);
      const received = Date.parse(candidate.receivedAt);
      if (!Number.isFinite(logged) || !Number.isFinite(received)) return no('log_out_of_window');
      const ageHours = (received - logged) / 3_600_000;
      const okDate =
        candidate.localDate === candidate.todayLocalDate ||
        candidate.localDate === previousDate(candidate.todayLocalDate);
      if (ageHours > LOG_XP_WINDOW_HOURS || ageHours < -LOG_XP_WINDOW_HOURS || !okDate) {
        return no('log_out_of_window');
      }
      // The day's key is used once, even after a reversal (ARCHITECTURE.md 4.5).
      if (day.some((e) => e.kind === 'daily_log' || e.kind === 'log_reversed')) {
        return no('duplicate');
      }
      break;
    }
  }

  if (
    day.some((e) => e.kind === candidate.kind && e.refId === refId && e.counterpart === counterpart)
  ) {
    return no('duplicate');
  }
  if (rule.pair === 'once_ever' && counterpart !== null) {
    const ever = new Set(ctx.pairsEver ?? []);
    for (const e of day) {
      if ((e.kind === 'invite_accepted' || e.kind === 'new_friend') && e.counterpart) {
        ever.add(e.counterpart);
      }
    }
    if (ever.has(counterpart)) return no('pair_once');
  }
  if (rule.pair === 'once_per_day' && counterpart !== null) {
    if (day.some((e) => e.kind === candidate.kind && e.counterpart === counterpart)) {
      return no('pair_cap');
    }
  }
  const awardedToday = day.filter((e) => e.kind === candidate.kind).length;
  if (awardedToday >= rule.dailyCap) return no('daily_cap');

  return {
    awardable: true,
    kind: candidate.kind,
    amount: rule.amount,
    counterpart,
    refId,
    localDate: candidate.localDate,
  };
}

/** PRD 4.3 rule 2: reverse invite XP when the friendship ends or the invitee leaves within 7 days. */
export function shouldReverseInvite(awardedAt: string, endedAt: string): boolean {
  const ms = Date.parse(endedAt) - Date.parse(awardedAt);
  return ms >= 0 && ms <= INVITE_REVERSAL_WINDOW_DAYS * 86_400_000;
}

/**
 * PRD 4.3 rule 7: reverse the day's log XP when its last remaining log is undone or removed,
 * once per day.
 */
export function shouldReverseLog(ledgerForDay: readonly LedgerEntry[], logsLeft: number): boolean {
  if (logsLeft > 0) return false;
  const awarded = ledgerForDay.some((e) => e.kind === 'daily_log');
  const reversed = ledgerForDay.some((e) => e.kind === 'log_reversed');
  return awarded && !reversed;
}

/** Theoretical daily maximum without invites (PRD 4.2: 175). */
export function maxDailyXpWithoutInvites(): number {
  return (Object.keys(XP_RULES) as XpAwardKind[])
    .filter((k) => k !== 'invite_accepted')
    .reduce((sum, k) => sum + XP_RULES[k].amount * XP_RULES[k].dailyCap, 0);
}
