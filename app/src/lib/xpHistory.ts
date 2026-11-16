// XP history rows for the private profile (DESIGN.md 4.16, COPY.md 4.16). COPY's lines end in
// " · {xp}" ("Leo joined through you · +50"); the profile sets the amount in its own column, so
// the reason is the formatted line with that suffix taken off.
import { XP_HISTORY_KEYS, t } from '@clink/shared';

import type { XpEntry } from './api';
import { formatSignedXp } from './format';

export interface XpRow {
  amount: string;
  reason: string;
  /** The whole COPY.md line, for screen readers. */
  full: string;
}

export function xpRow(entry: XpEntry): XpRow {
  const amount = formatSignedXp(entry.amount);
  const key = XP_HISTORY_KEYS[entry.kind];
  const vars = { xp: amount, name: entry.name ?? '' };
  const full = (t as (k: string, v: Record<string, string>) => string)(key, vars);
  const suffix = ` · ${amount}`;
  const reason = full.endsWith(suffix) ? full.slice(0, -suffix.length) : full;
  return { amount, reason, full };
}
