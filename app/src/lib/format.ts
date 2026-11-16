// Time and number formats for the {ago}, {mins}, {time} variables (COPY.md 0.2). Clock times use
// the device's locale and 12/24 h setting (PRD 3.0 "Time").
import { pt } from './pendingCopy';

const MIN = 60_000;

/** {ago}: "just now", "12m", "1h 42m". Minute precision. */
export function formatAgo(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MIN));
  if (total < 1) return pt('fmt.ago.now');
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return pt('fmt.ago.m', { m });
  if (m === 0) return pt('fmt.ago.h', { h });
  return pt('fmt.ago.hm', { h, m });
}

/** {ago_words} / {left_words}: spoken, for screen readers. */
export function formatDurationWords(ms: number): string {
  const total = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return pt('fmt.words.m', { m });
  if (m === 0) return pt('fmt.words.h', { h });
  return pt('fmt.words.hm', { h, m });
}

/** {mins}: "now" or "in 15 min". */
export function formatMins(minutes: number, capital = false): string {
  if (minutes <= 0) return pt(capital ? 'fmt.mins_cap.now' : 'fmt.mins.now');
  return pt(capital ? 'fmt.mins_cap.in' : 'fmt.mins.in', { n: minutes });
}

/** {time}: clock time in the device format, "10:45" or "10:45 AM". */
export function formatClock(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);
}

/** Short date for history rows, in the device locale. */
export function formatShortDate(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(at);
}

/** {xp}: signed, "+50" or "−50" (COPY.md 4.16 uses the minus sign). */
export function formatSignedXp(amount: number): string {
  const abs = new Intl.NumberFormat(undefined).format(Math.abs(amount));
  return `${amount < 0 ? '−' : '+'}${abs}`;
}

/** "mm:ss" for countdowns, tabular in the UI. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/**
 * Splits a counted string like "3 drinks" into its number and its word, so the number can be set
 * large with the word under it. Falls back to the whole string as the word.
 */
export function splitCount(text: string): { num: string; word: string } {
  const m = /^(\d+)\s+(.+)$/.exec(text);
  return m ? { num: m[1] ?? '', word: m[2] ?? '' } : { num: '', word: text };
}
