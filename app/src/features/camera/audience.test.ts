import { t } from '@clink/shared';

import type { Audience } from '@/lib/api';

import { resolveChoice } from './audience';

const audience: Audience = {
  friendCount: 5,
  groups: [
    { id: 'g_work', name: 'Work', emoji: '💼', memberCount: 3 },
    { id: 'g_home', name: 'Home friends', emoji: '🏠', memberCount: 0 },
  ],
  auto: { daytimeGroupId: 'g_work', otherGroupId: 'g_home' },
};

describe('resolveChoice (To: chip)', () => {
  // Monday 2026-11-16, in UTC so the test does not depend on the machine's zone.
  const weekdayNoon = new Date('2026-11-16T12:00:00Z');
  const weekdayNight = new Date('2026-11-16T21:00:00Z');

  it('Automatic resolves to the daytime group on weekday working hours', () => {
    expect(resolveChoice({ kind: 'auto' }, audience, weekdayNoon, 'UTC')).toMatchObject({
      label: 'Work',
      auto: true,
      count: 3,
    });
  });

  it('Automatic falls back to Everyone when the other-times group is empty', () => {
    expect(resolveChoice({ kind: 'auto' }, audience, weekdayNight, 'UTC')).toMatchObject({
      label: t('aud.everyone'),
      auto: true,
      count: 5,
    });
  });

  it('a picked group stays picked, even when empty (the camera then shows the empty hint)', () => {
    expect(
      resolveChoice({ kind: 'group', id: 'g_home' }, audience, weekdayNoon, 'UTC'),
    ).toMatchObject({ label: 'Home friends', count: 0, auto: false });
  });

  it('a deleted group falls back to Everyone', () => {
    expect(resolveChoice({ kind: 'group', id: 'gone' }, audience, weekdayNoon, 'UTC').label).toBe(
      t('aud.everyone'),
    );
  });
});
