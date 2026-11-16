import { XP_KINDS, t } from '@clink/shared';

import { xpRow } from './xpHistory';

describe('xpRow (COPY.md 4.16)', () => {
  it('splits the amount off the COPY line', () => {
    const row = xpRow({
      id: 'a',
      kind: 'invite_accepted',
      amount: 50,
      name: 'Leo',
      at: '2026-11-16T10:00:00Z',
    });
    expect(row.amount).toBe('+50');
    expect(row.reason).toBe(t('xp.e.invite', { name: 'Leo', xp: '+50' }).replace(' · +50', ''));
    expect(row.full).toBe(t('xp.e.invite', { name: 'Leo', xp: '+50' }));
  });

  it('uses the minus sign for reversals', () => {
    const row = xpRow({
      id: 'b',
      kind: 'invite_reversed',
      amount: -50,
      name: null,
      at: '2026-11-16T10:00:00Z',
    });
    expect(row.amount).toBe('−50');
    expect(row.reason).not.toContain('50');
  });

  it('has a line for every ledger kind', () => {
    for (const kind of XP_KINDS) {
      const row = xpRow({ id: kind, kind, amount: 10, name: 'Maya', at: '2026-11-16T10:00:00Z' });
      expect(row.reason.length).toBeGreaterThan(0);
      expect(row.reason).not.toContain('{');
    }
  });
});
