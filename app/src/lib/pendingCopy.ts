// Strings the screens need that COPY.md does not define yet. COPY.md 0.2 describes the formats of
// {ago}, {mins}, {mins_cap}, {ago_words} and {left_words} but gives them no keys, and there is no
// key for a few labels. Each entry is named by the key we propose to Copy (see
// docs/build-notes/screens.md). Remove an entry once COPY.md has the key, and switch the caller
// to t(). Nothing else in the app may hold user-facing text.
import { formatIcu, parseIcu, type IcuVars } from '@clink/shared';

export const PENDING_COPY = {
  /** {ago}: "just now", "12m", "1h 42m" (COPY.md 0.2). */
  'fmt.ago.now': 'just now',
  'fmt.ago.m': '{m}m',
  'fmt.ago.hm': '{h}h {m}m',
  'fmt.ago.h': '{h}h',
  /** {mins}: "now", "in 5 min" (COPY.md 0.2). */
  'fmt.mins.now': 'now',
  'fmt.mins.in': 'in {n} min',
  /** {mins_cap}: "Now", "In 10 min" (COPY.md 5 notes). */
  'fmt.mins_cap.now': 'Now',
  'fmt.mins_cap.in': 'In {n} min',
  /** {ago_words} and {left_words}: "1 hour 42 minutes", "14 minutes". */
  'fmt.words.m': '{m, plural, one {# minute} other {# minutes}}',
  'fmt.words.h': '{h, plural, one {# hour} other {# hours}}',
  'fmt.words.hm':
    '{h, plural, one {# hour} other {# hours}} {m, plural, one {# minute} other {# minutes}}',
  /** The small tag on the To: chip when Automatic picked the audience (DESIGN.md 4.5). */
  'compose.auto_tag': 'Auto',
  /** Undo snackbar after a preset fills the usual 3 (DESIGN.md 4.14 "shows an undo snackbar"). */
  'usual.preset_set': 'Set to {preset}.',
  /** Profile level number above the level name in display.l (DESIGN.md 4.16). COPY has only
   * the combined "Level {n} · {level_name}", which we use as the screen reader label. */
  'profile.level_n': 'Level {n}',
  /** Total on the right under the progress bar (DESIGN.md 4.16, "580 XP"). */
  'profile.total': '{xp} XP',
  /** State of a contact match after Add (DESIGN.md 4.3 step 4). */
  'friends.req.sent': 'Request sent',
  /** Onboarding step 4, after the optional number is saved. */
  'onb.phone.added': 'Number added. Nobody sees it.',
} as const;

export type PendingKey = keyof typeof PENDING_COPY;

export function pt(key: PendingKey, vars: IcuVars = {}): string {
  return formatIcu(parseIcu(PENDING_COPY[key]), vars);
}
