// Age check for complete-signup (PRD.md 3.1 rule 10, RISK_REVIEW.md M-05).
// Input is birth month and year only. Decision: the birth month counts as the birthday, so a person
// is old enough from the first day of the month they turn the minimum age. The day isn't asked, and
// refusing someone for the whole month they turn 16 would be wrong for most of them.
// The values are used for this comparison and then dropped; they are never stored or logged.

export type YearMonth = { year: number; month: number }; // month 1..12

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

export function isOldEnough(birth: YearMonth, today: YearMonth, minAge: number): boolean {
  if (birth.month < 1 || birth.month > 12 || today.month < 1 || today.month > 12) return false;
  return monthsBetween(birth, today) >= minAge * 12;
}

export function todayUtc(now: Date): YearMonth {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}
