// Today's counts from the entries (PRD 3.11). Counts stay on this device and the user's account;
// they are never sent to friends.
import {
  CAFFEINE_EVENING_FROM_HOUR,
  CAPS,
  getDrink,
  isCaffeinated,
  type StringKey,
} from '@clink/shared';

import type { LogEntry, UsualDrink } from './api';

export interface TodaySummary {
  drinks: number;
  water: number;
  caffeinated: number;
  /** Latest non-water drink, or null. */
  lastDrinkAt: Date | null;
  /** caff.day / caff.evening once the 4th caffeinated drink is logged, else null. */
  caffeineNoteKey: Extract<StringKey, 'caff.day' | 'caff.evening'> | null;
}

export function entryCaffeinated(e: Pick<LogEntry, 'drinkId' | 'category' | 'details'>): boolean {
  if (e.category === 'water') return false;
  return e.drinkId
    ? isCaffeinated({ drinkId: e.drinkId }, e.details)
    : isCaffeinated({ category: e.category }, e.details);
}

export function summarizeToday(entries: readonly LogEntry[], now: Date): TodaySummary {
  let drinks = 0;
  let water = 0;
  let caffeinated = 0;
  let last: Date | null = null;
  for (const e of entries) {
    if (e.category === 'water') {
      water += 1;
      continue;
    }
    drinks += 1;
    if (entryCaffeinated(e)) caffeinated += 1;
    const at = new Date(e.loggedAt);
    if (!last || at > last) last = at;
  }
  const caffeineNoteKey =
    caffeinated >= CAPS.caffeineNoteAfter
      ? now.getHours() >= CAFFEINE_EVENING_FROM_HOUR
        ? 'caff.evening'
        : 'caff.day'
      : null;
  return { drinks, water, caffeinated, lastDrinkAt: last, caffeineNoteKey };
}

/** The most recent entry, which Undo last removes (PRD 3.11 rule 3). */
export function lastEntry(entries: readonly LogEntry[]): LogEntry | null {
  let best: LogEntry | null = null;
  for (const e of entries) if (!best || e.loggedAt >= best.loggedAt) best = e;
  return best;
}

/** App name of what was logged: catalog name or the custom name. */
export function entryName(e: Pick<LogEntry, 'drinkId' | 'customName'>): string {
  if (e.drinkId) return getDrink(e.drinkId)?.name ?? e.customName ?? '';
  return e.customName ?? '';
}

export function usualName(u: UsualDrink): string {
  return entryName(u);
}
