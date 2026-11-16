import { t } from '@clink/shared';

import { agoLine, formatAgo, formatDurationWords, formatMins } from './format';

const MIN = 60_000;

describe('formatAgo ({ago}, COPY.md 0.2 and 4.27)', () => {
  it('says just now under a minute (PRD F9)', () => {
    expect(formatAgo(0)).toBe('just now');
    expect(formatAgo(59_000)).toBe('just now');
    expect(formatAgo(-5_000)).toBe('just now');
  });

  it('agoLine never reads "just now ago"', () => {
    expect(agoLine('today.last', 10_000)).toBe('Last drink just now');
    expect(agoLine('friends.last_drink', 0)).toBe('last drink just now');
    expect(agoLine('wm.last', 59_999)).toBe('Last drink just now');
    expect(agoLine('today.last', 12 * MIN)).toBe(t('today.last', { ago: '12m' }));
    expect(agoLine('today.last', 12 * MIN)).toBe('Last drink 12m ago');
  });

  it('uses minutes, whole hours, and hours with minutes', () => {
    expect(formatAgo(12 * MIN)).toBe('12m');
    expect(formatAgo(60 * MIN)).toBe('1h');
    expect(formatAgo(102 * MIN + 30_000)).toBe('1h 42m');
  });

  it('fits the 8-character budget up to 23h 59m', () => {
    expect(formatAgo((23 * 60 + 59) * MIN).length).toBeLessThanOrEqual(8);
  });
});

describe('formatDurationWords ({ago_words}, {left_words})', () => {
  it('spells out units with plurals', () => {
    expect(formatDurationWords(1 * MIN)).toBe('1 minute');
    expect(formatDurationWords(14 * MIN)).toBe('14 minutes');
    expect(formatDurationWords(60 * MIN)).toBe('1 hour');
    expect(formatDurationWords(102 * MIN)).toBe('1 hour 42 minutes');
    expect(formatDurationWords(121 * MIN)).toBe('2 hours 1 minute');
  });
});

describe('formatMins ({mins}, {mins_cap})', () => {
  it('says now at zero or below, and in N min after', () => {
    expect(formatMins(0)).toBe('now');
    expect(formatMins(-3)).toBe('now');
    expect(formatMins(5)).toBe('in 5 min');
    expect(formatMins(0, true)).toBe('Now');
    expect(formatMins(10, true)).toBe('In 10 min');
  });
});
