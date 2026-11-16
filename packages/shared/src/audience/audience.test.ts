import fixtures from '../../fixtures/automatic-rule.json';
import {
  EVERYONE,
  defaultAutoRole,
  isDaytime,
  localTimeAt,
  nextBoundaryMinutes,
  resolveAutomatic,
  resolveAutomaticAt,
  type AutoSettings,
} from './index';

type Case = (typeof fixtures.cases)[number];

describe('Automatic rule fixtures (QA_PLAN.md 6.3, shared with Swift and Kotlin)', () => {
  it('covers T22 to T33', () => {
    const ids = fixtures.cases.map((c) => c.id);
    for (let n = 22; n <= 33; n++) expect(ids).toContain(`T${n}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(fixtures.cases.map((c) => [c.id, c] as [string, Case]))(
    '%s: local fields match the instant in its zone',
    (_id, c) => {
      expect(localTimeAt(new Date(c.at), c.timeZone)).toEqual(c.local);
    },
  );

  it.each(fixtures.cases.map((c) => [c.id, c] as [string, Case]))(
    '%s resolves from local time',
    (_id, c) => {
      expect(resolveAutomatic(c.local, c.settings as AutoSettings, c.groups)).toBe(c.expected);
    },
  );

  it.each(fixtures.cases.map((c) => [c.id, c] as [string, Case]))(
    '%s resolves from the tap instant and zone',
    (_id, c) => {
      expect(
        resolveAutomaticAt(new Date(c.at), c.timeZone, c.settings as AutoSettings, c.groups),
      ).toBe(c.expected);
    },
  );

  it('T30 and T31: the send time would give a different answer, so the tap time matters', () => {
    for (const id of ['T30', 'T31']) {
      const c = fixtures.cases.find((x) => x.id === id) as Case & { sentAt: string };
      const atSend = resolveAutomaticAt(
        new Date(c.sentAt),
        c.timeZone,
        c.settings as AutoSettings,
        c.groups,
      );
      expect(atSend).not.toBe(c.expected);
    }
  });

  it("T32: the recipients' zone would give a different answer, so the sender's zone matters", () => {
    const c = fixtures.cases.find((x) => x.id === 'T32') as Case & { recipientTimeZone: string };
    expect(
      resolveAutomaticAt(new Date(c.at), c.recipientTimeZone, c.settings as AutoSettings, c.groups),
    ).not.toBe(c.expected);
  });

  it('T33: a group created by hand and named Work takes the weekday role', () => {
    const c = fixtures.cases.find((x) => x.id === 'T33') as Case;
    const g = c.groups[0];
    if (!g) throw new Error('T33 has no group');
    expect(defaultAutoRole(g.name, [])).toBe('work');
    expect(c.settings).toEqual({ daytimeGroupId: g.id, otherGroupId: null });
  });
});

describe('edges', () => {
  const groups = [
    { id: 'w', memberCount: 1 },
    { id: 'h', memberCount: 2 },
  ];
  const both = { daytimeGroupId: 'w', otherGroupId: 'h' };

  it('17:59 is daytime, 18:00 is not; 07:59 is not, 08:00 is', () => {
    expect(isDaytime({ weekday: 3, hour: 17, minute: 59 })).toBe(true);
    expect(isDaytime({ weekday: 3, hour: 18, minute: 0 })).toBe(false);
    expect(isDaytime({ weekday: 3, hour: 7, minute: 59 })).toBe(false);
    expect(isDaytime({ weekday: 3, hour: 8, minute: 0 })).toBe(true);
  });

  it('weekends are never daytime', () => {
    expect(isDaytime({ weekday: 6, hour: 12, minute: 0 })).toBe(false);
    expect(isDaytime({ weekday: 7, hour: 9, minute: 0 })).toBe(false);
  });

  it('a group with one member is enough; zero is not', () => {
    const t = { weekday: 1, hour: 9, minute: 0 };
    expect(resolveAutomatic(t, both, groups)).toBe('w');
    expect(resolveAutomatic(t, both, [{ id: 'w', memberCount: 0 }])).toBe(EVERYONE);
  });

  it('missing groups fall back to Everyone', () => {
    expect(resolveAutomatic({ weekday: 1, hour: 9, minute: 0 }, both, [])).toBe(EVERYONE);
    expect(resolveAutomatic({ weekday: 6, hour: 9, minute: 0 }, both, [])).toBe(EVERYONE);
  });

  it('defaultAutoRole matches names case-insensitively and only when the role is free', () => {
    expect(defaultAutoRole(' work ', [])).toBe('work');
    expect(defaultAutoRole('Home friends', [])).toBe('home');
    expect(defaultAutoRole('Work', ['work'])).toBeNull();
    expect(defaultAutoRole('Climbing', [])).toBeNull();
  });

  it('nextBoundaryMinutes gives the next 08:00 or 18:00 on a weekday', () => {
    expect(nextBoundaryMinutes({ weekday: 1, hour: 7, minute: 59 })).toBe(1);
    expect(nextBoundaryMinutes({ weekday: 1, hour: 8, minute: 0 })).toBe(600);
    // Friday 18:00 -> Monday 08:00
    expect(nextBoundaryMinutes({ weekday: 5, hour: 18, minute: 0 })).toBe(2 * 1440 + 14 * 60);
  });

  it('reads local time across a DST change', () => {
    // US clocks go back at 02:00 on 2026-11-01.
    expect(localTimeAt(new Date('2026-11-02T13:00:00Z'), 'America/New_York')).toEqual({
      weekday: 1,
      hour: 8,
      minute: 0,
    });
    expect(localTimeAt(new Date('2026-10-30T12:00:00Z'), 'America/New_York')).toEqual({
      weekday: 5,
      hour: 8,
      minute: 0,
    });
  });
});
