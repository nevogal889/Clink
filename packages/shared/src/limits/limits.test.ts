import {
  CAPS,
  MIN_OPEN_MINUTES,
  OTHER_TIMING_VALUES,
  TEXT_LIMITS,
  TIMING_PILLS,
  VALID_TIMING_MINUTES,
  charLength,
  decisionInstant,
  displayNameSchema,
  flareExpiresAt,
  flareTimes,
  groupNameSchema,
  inviteCodeSchema,
  isFlareOpen,
  msLeft,
  noteSchema,
  placeSchema,
  recipientVisibleUntil,
  runListUntil,
  timingMinSchema,
} from './index';

const T0 = new Date('2026-11-17T09:00:00Z');
const plus = (min: number) => new Date(T0.getTime() + min * 60_000);

describe('flare timing (DECISIONS.md, PRD 3.5 rules 2 and 3, QA_PLAN.md 6.2)', () => {
  it('pills are Now, 5m, 15m, 30m, Other', () => {
    expect(TIMING_PILLS.map((p) => ('minutes' in p ? p.minutes : p.kind))).toEqual([
      0,
      5,
      15,
      30,
      'other',
    ]);
  });

  it('Other offers 5 to 60 in steps of 5 and nothing else', () => {
    expect(OTHER_TIMING_VALUES).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });

  it('the API accepts 0 and the Other values only (T17)', () => {
    for (const m of VALID_TIMING_MINUTES) expect(timingMinSchema.safeParse(m).success).toBe(true);
    for (const m of [-5, 1, 7, 61, 65, 90, 2.5]) {
      expect(timingMinSchema.safeParse(m).success).toBe(false);
    }
    expect(() => flareTimes(T0, 65)).toThrow();
  });

  it.each([
    ['T10 Now', 0, 0, 15],
    ['T11 5m', 5, 5, 15],
    ['T14 Other 10', 10, 10, 15],
    ['T12/T15 15m', 15, 15, 15],
    ['T16 Other 20', 20, 20, 20],
    ['T13 30m', 30, 30, 30],
    ['AC 3 Other 45', 45, 45, 45],
    ['T16 Other 60', 60, 60, 60],
  ])('%s: meet +%i, open until +%i', (_label, timing, meet, close) => {
    const t = flareTimes(T0, timing);
    expect(t.meetAt).toEqual(plus(meet));
    expect(t.expiresAt).toEqual(plus(close));
    expect(flareExpiresAt(T0, timing)).toEqual(plus(close));
  });

  it('every valid timing stays open at least 15 minutes and at most 60', () => {
    for (const m of VALID_TIMING_MINUTES) {
      const open = (flareExpiresAt(T0, m).getTime() - T0.getTime()) / 60_000;
      expect(open).toBeGreaterThanOrEqual(MIN_OPEN_MINUTES);
      expect(open).toBeLessThanOrEqual(60);
    }
  });

  it('is open until the close instant, exclusive', () => {
    const close = flareExpiresAt(T0, 0);
    expect(isFlareOpen(close, plus(14.99))).toBe(true);
    expect(isFlareOpen(close, close)).toBe(false);
    expect(msLeft(close, plus(10))).toBe(5 * 60_000);
    expect(msLeft(close, plus(20))).toBe(0);
  });

  it('run list and recipient visibility last 2 hours after close', () => {
    expect(runListUntil(T0)).toEqual(plus(120));
    expect(recipientVisibleUntil(T0)).toEqual(plus(120));
  });

  it('trusts the tap time within 2 minutes of server time, else uses server time (T30, T18)', () => {
    expect(decisionInstant(plus(-1.9), T0)).toEqual(plus(-1.9));
    expect(decisionInstant(plus(-2.1), T0)).toEqual(T0);
    expect(decisionInstant(plus(5), T0)).toEqual(T0);
    expect(decisionInstant(null, T0)).toEqual(T0);
  });
});

describe('text limits (PRD 3.0, ARCHITECTURE.md 4.2)', () => {
  it('match the PRD numbers', () => {
    expect(TEXT_LIMITS).toMatchObject({
      displayName: 30,
      place: 40,
      customDrinkName: 30,
      note: 120,
      planB: 80,
      oneTimeNote: 80,
      groupName: 20,
      reportNote: 200,
    });
  });

  it('count code points like Postgres char_length', () => {
    expect(charLength('Café')).toBe(4);
    expect(charLength('☕☕')).toBe(2);
    expect('🍵'.length).toBe(2);
    expect(charLength('🍵')).toBe(1);
    expect(placeSchema.safeParse('🍵'.repeat(40)).success).toBe(true);
    expect(placeSchema.safeParse('🍵'.repeat(41)).success).toBe(false);
  });

  it('enforces each limit at its edge', () => {
    expect(placeSchema.safeParse('x'.repeat(40)).success).toBe(true);
    expect(placeSchema.safeParse('x'.repeat(41)).success).toBe(false);
    expect(noteSchema.safeParse('x'.repeat(120)).success).toBe(true);
    expect(noteSchema.safeParse('x'.repeat(121)).success).toBe(false);
    expect(groupNameSchema.safeParse('x'.repeat(20)).success).toBe(true);
    expect(groupNameSchema.safeParse('x'.repeat(21)).success).toBe(false);
  });

  it('needs at least one visible character in a display name', () => {
    expect(displayNameSchema.safeParse('Dana').success).toBe(true);
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
    expect(displayNameSchema.safeParse('').success).toBe(false);
    expect(displayNameSchema.safeParse('x'.repeat(31)).success).toBe(false);
  });

  it('accepts Crockford base32 invite codes only', () => {
    expect(inviteCodeSchema.safeParse('7K3M9QZT').success).toBe(true);
    expect(inviteCodeSchema.safeParse('7K3M9QZI').success).toBe(false);
    expect(inviteCodeSchema.safeParse('7k3m9qzt').success).toBe(false);
    expect(inviteCodeSchema.safeParse('7K3M9QZ').success).toBe(false);
  });
});

describe('caps', () => {
  it('match DECISIONS.md and PRD 3.10', () => {
    expect(CAPS.friends).toBe(20);
    expect(CAPS.groups).toBe(10);
    expect(CAPS.usualDrinks).toBe(3);
    expect(CAPS.groupSuggestionAtFriends).toBe(6);
    expect(CAPS.caffeineNoteAfter).toBe(4);
  });
});
