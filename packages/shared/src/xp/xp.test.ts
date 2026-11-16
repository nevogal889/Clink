import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS } from '../strings';
import {
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  XP_HISTORY_KEYS,
  XP_KINDS,
  XP_REVERSALS,
  XP_RULES,
  decideAward,
  levelForTotal,
  maxDailyXpWithoutInvites,
  shouldReverseInvite,
  shouldReverseLog,
  type AwardCandidate,
  type LedgerEntry,
} from './index';

const PRD = readFileSync(join(__dirname, '../../../../docs/PRD.md'), 'utf8');
const DAY = '2026-11-17';

/** Applies candidates in order, writing each awarded row to the ledger, like award_xp(). */
function run(cands: AwardCandidate[], ledger: LedgerEntry[] = [], pairsEver: string[] = []) {
  let total = 0;
  const reasons: string[] = [];
  for (const c of cands) {
    const d = decideAward(c, { ledgerForDay: ledger, pairsEver });
    if (d.awardable) {
      total += d.amount;
      ledger.push({
        kind: d.kind,
        counterpart: d.counterpart,
        refId: d.refId,
        localDate: d.localDate,
      });
    } else reasons.push(d.reason);
  }
  return { total, reasons, ledger };
}

const joined = (sender: string, flare: string): AwardCandidate => ({
  kind: 'flare_joined',
  localDate: DAY,
  refId: flare,
  counterpart: sender,
  flareOutcome: 'done',
  replyStands: true,
});
const invite = (invitee: string, over: Partial<AwardCandidate> = {}): AwardCandidate =>
  ({
    kind: 'invite_accepted',
    localDate: DAY,
    counterpart: invitee,
    inviteeIsNewAccount: true,
    inviteeVerified: true,
    inviteeDeviceReused: false,
    ...over,
  }) as AwardCandidate;
const run_ = (asker: string, flare: string): AwardCandidate => ({
  kind: 'drink_run_done',
  localDate: DAY,
  refId: flare,
  counterpart: asker,
  flareOutcome: 'done',
  orderStands: true,
});
const gotJoiner = (flare: string, joiners: string[]): AwardCandidate => ({
  kind: 'flare_got_joiner',
  localDate: DAY,
  refId: flare,
  flareOutcome: 'done',
  joiners,
});
const log = (
  over: Partial<Extract<AwardCandidate, { kind: 'daily_log' }>> = {},
): AwardCandidate => ({
  kind: 'daily_log',
  localDate: DAY,
  loggedAt: `${DAY}T08:00:00Z`,
  receivedAt: `${DAY}T08:00:05Z`,
  todayLocalDate: DAY,
  ...over,
});

describe('values match PRD.md 4.2 and 4.4', () => {
  it('event values and daily caps', () => {
    const table = PRD.slice(PRD.indexOf('### 4.2 Events and values'), PRD.indexOf('### 4.3'));
    const rows = table.split('\n').filter((l) => /^\| [A-Y]/.test(l) && !l.startsWith('| Event'));
    const parsed = rows.map((r) => {
      const cells = r.split('|').map((c) => c.trim());
      return {
        xp: Number(/\+(\d+)/.exec(cells[2] ?? '')?.[1]),
        cap: Number(/\d+/.exec(cells[4] ?? '')?.[0]),
      };
    });
    const ours = [
      XP_RULES.invite_accepted,
      XP_RULES.new_friend,
      XP_RULES.flare_joined,
      XP_RULES.flare_got_joiner,
      XP_RULES.drink_run_done,
      XP_RULES.daily_log,
    ].map((r) => ({ xp: r.amount, cap: r.dailyCap }));
    expect(parsed).toEqual(ours);
  });

  it('level thresholds', () => {
    const table = PRD.slice(PRD.indexOf('### 4.4 Levels'), PRD.indexOf('### 4.5'));
    const totals = table
      .split('\n')
      .filter((l) => /^\| \d /.test(l))
      .map((l) => Number((l.split('|')[3] ?? '').trim().replace(/,/g, '')));
    expect(totals).toEqual([...LEVEL_THRESHOLDS]);
    expect(MAX_LEVEL).toBe(8);
  });

  it('daily maximum without invites is 175', () => {
    expect(maxDailyXpWithoutInvites()).toBe(175);
  });

  it('reversals mirror their awards', () => {
    expect(XP_REVERSALS.invite_reversed.amount).toBe(-XP_RULES.invite_accepted.amount);
    expect(XP_REVERSALS.log_reversed.amount).toBe(-XP_RULES.daily_log.amount);
  });

  it('has a history string for every kind, and a level name for every level', () => {
    for (const k of XP_KINDS) expect(STRINGS[XP_HISTORY_KEYS[k]]).toBeTruthy();
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const info = levelForTotal(LEVEL_THRESHOLDS[l - 1] ?? 0);
      expect(info.level).toBe(l);
      expect(STRINGS[info.nameKey]).toBeTruthy();
      expect(STRINGS[info.descKey]).toBeTruthy();
    }
  });
});

describe('levelForTotal', () => {
  it('maps totals to levels at and around each threshold', () => {
    expect(levelForTotal(0).level).toBe(1);
    expect(levelForTotal(99).level).toBe(1);
    expect(levelForTotal(100).level).toBe(2);
    expect(levelForTotal(1399).level).toBe(4);
    expect(levelForTotal(1400).level).toBe(5);
    expect(levelForTotal(5999).level).toBe(7);
    expect(levelForTotal(6000).level).toBe(8);
    expect(levelForTotal(99999).level).toBe(8);
  });

  it('gives XP to next and progress, and "Top level" at 8', () => {
    const l2 = levelForTotal(150);
    expect(l2).toMatchObject({ level: 2, floor: 100, xpToNext: 150, progress: 0.25 });
    expect(l2.next).toEqual({ level: 3, at: 300, nameKey: 'level.3' });
    expect(STRINGS[l2.nameKey]).toBe('Second Cup');
    const top = levelForTotal(7000);
    expect(top).toMatchObject({ level: 8, next: null, xpToNext: null, progress: 1 });
    expect(STRINGS[top.nameKey]).toBe('Full Pot');
  });

  it('treats a negative total (after reversals) as level 1', () => {
    expect(levelForTotal(-50)).toMatchObject({ level: 1, xpToNext: 100, progress: 0 });
  });

  it('accepts retuned server thresholds and rejects broken ones', () => {
    expect(levelForTotal(150, [0, 50, 200]).level).toBe(2);
    expect(() => levelForTotal(10, [10, 20])).toThrow();
    expect(() => levelForTotal(10, [0, 20, 20])).toThrow();
  });
});

describe('decideAward: daily caps (PRD 4.2)', () => {
  it('invites: 10 a day, the 11th earns 0 (QA X3)', () => {
    const r = run(Array.from({ length: 11 }, (_, i) => invite(`u${i}`)));
    expect(r.total).toBe(500);
    expect(r.reasons).toEqual(['daily_cap']);
  });

  it('new friends: 5 a day (QA X6)', () => {
    const r = run(
      Array.from({ length: 6 }, (_, i) => ({
        kind: 'new_friend' as const,
        localDate: DAY,
        counterpart: `f${i}`,
      })),
    );
    expect(r.total).toBe(50);
    expect(r.reasons).toEqual(['daily_cap']);
  });

  it('joining flares: 3 a day, 4 flares from 4 friends give +30 (PRD 4.6 AC 4, X7)', () => {
    const r = run([joined('a', 'f1'), joined('b', 'f2'), joined('c', 'f3'), joined('d', 'f4')]);
    expect(r.total).toBe(30);
    expect(r.reasons).toEqual(['daily_cap']);
  });

  it('flares that got a reply: 2 a day (X14)', () => {
    const r = run([gotJoiner('f1', ['a']), gotJoiner('f2', ['b']), gotJoiner('f3', ['c'])]);
    expect(r.total).toBe(30);
    expect(r.reasons).toEqual(['daily_cap']);
  });

  it('drink runs: 3 orders a day (X15)', () => {
    const r = run([run_('a', 'f1'), run_('b', 'f1'), run_('c', 'f2'), run_('d', 'f2')]);
    expect(r.total).toBe(60);
    expect(r.reasons).toEqual(['daily_cap']);
  });

  it('logging: once a day however many logs (X18)', () => {
    const r = run(Array.from({ length: 6 }, () => log()));
    expect(r.total).toBe(5);
    expect(r.reasons).toEqual(Array(5).fill('duplicate'));
  });

  it('caps are per local day: yesterday’s rows do not count', () => {
    const ledger: LedgerEntry[] = [1, 2, 3].map((i) => ({
      kind: 'flare_joined',
      counterpart: `y${i}`,
      refId: `yf${i}`,
      localDate: '2026-11-16',
    }));
    expect(run([joined('a', 'f1')], ledger).total).toBe(10);
  });
});

describe('decideAward: pair rules (PRD 4.3 rules 3 and 4)', () => {
  it('two flares from the same friend on one day give +10 once (AC 5, X8)', () => {
    const r = run([joined('maya', 'f1'), joined('maya', 'f2')]);
    expect(r.total).toBe(10);
    expect(r.reasons).toEqual(['pair_cap']);
  });

  it('two orders from the same friend in a day give +20 once (X16)', () => {
    const r = run([run_('sam', 'f1'), run_('sam', 'f2')]);
    expect(r.total).toBe(20);
    expect(r.reasons).toEqual(['pair_cap']);
  });

  it('flare_got_joiner counts each joiner once a day, picking a fresh joiner', () => {
    const r = run([
      gotJoiner('f1', ['leo']),
      gotJoiner('f2', ['leo']),
      gotJoiner('f3', ['leo', 'sam']),
    ]);
    expect(r.total).toBe(30);
    expect(r.reasons).toEqual(['pair_cap']);
    expect(r.ledger.map((e) => e.counterpart)).toEqual(['leo', 'sam']);
  });

  it('directions are separate: Maya joining mine and me joining hers both count (X9)', () => {
    const r = run([joined('maya', 'her'), gotJoiner('mine', ['maya'])]);
    expect(r.total).toBe(25);
  });

  it('invite and new-friend XP is once per pair, ever (AC 2, X4)', () => {
    expect(run([invite('leo')], [], ['leo']).reasons).toEqual(['pair_once']);
    expect(
      run([{ kind: 'new_friend', localDate: DAY, counterpart: 'leo' }], [], ['leo']).reasons,
    ).toEqual(['pair_once']);
    const same = run([invite('leo'), { kind: 'new_friend', localDate: DAY, counterpart: 'leo' }]);
    expect(same.total).toBe(50);
    expect(same.reasons).toEqual(['pair_once']);
  });
});

describe('decideAward: outcome rules', () => {
  it('cancelled or replaced flares award nothing (AC 6, X11, X12)', () => {
    for (const outcome of ['cancelled', 'replaced', 'expired_no_replies'] as const) {
      expect(
        run([{ ...joined('a', 'f'), flareOutcome: outcome } as AwardCandidate]).reasons,
      ).toEqual(['flare_not_done']);
      expect(run([{ ...run_('a', 'f'), flareOutcome: outcome } as AwardCandidate]).reasons).toEqual(
        ['flare_not_done'],
      );
      expect(
        run([{ ...gotJoiner('f', ['a']), flareOutcome: outcome } as AwardCandidate]).reasons,
      ).toEqual(['flare_not_done']);
    }
  });

  it('a withdrawn reply or cancelled order earns nothing (X10, X17, AC 7)', () => {
    expect(run([{ ...joined('a', 'f'), replyStands: false } as AwardCandidate]).reasons).toEqual([
      'reply_withdrawn',
    ]);
    expect(run([{ ...run_('a', 'f'), orderStands: false } as AwardCandidate]).reasons).toEqual([
      'order_cancelled',
    ]);
    expect(run([gotJoiner('f', [])]).reasons).toEqual(['no_joiners']);
  });

  it('invite XP needs a new, verified account on a device not reused (rule 8, X5, X29)', () => {
    expect(run([invite('a', { inviteeIsNewAccount: false })]).reasons).toEqual([
      'invite_not_eligible',
    ]);
    expect(run([invite('a', { inviteeVerified: false })]).reasons).toEqual(['invite_not_eligible']);
    expect(run([invite('a', { inviteeDeviceReused: true })]).reasons).toEqual([
      'invite_not_eligible',
    ]);
  });

  it('a replayed settlement awards once (AC 11, X24)', () => {
    const r = run([
      joined('a', 'f1'),
      joined('a', 'f1'),
      gotJoiner('f9', ['a']),
      gotJoiner('f9', ['b']),
    ]);
    expect(r.total).toBe(25);
    expect(r.reasons).toEqual(['duplicate', 'duplicate']);
  });

  it('log XP only for logs within 36 hours dated today or yesterday (rule 11, X28)', () => {
    expect(run([log({ localDate: '2026-11-16', loggedAt: '2026-11-16T22:00:00Z' })]).total).toBe(5);
    expect(
      run([log({ localDate: '2026-11-15', loggedAt: '2026-11-15T22:00:00Z' })]).reasons,
    ).toEqual(['log_out_of_window']);
    expect(
      run([log({ loggedAt: '2026-11-15T19:00:00Z', receivedAt: '2026-11-17T08:00:00Z' })]).reasons,
    ).toEqual(['log_out_of_window']);
    expect(run([log({ loggedAt: 'not a date' })]).reasons).toEqual(['log_out_of_window']);
  });

  it('a later log on a day whose log XP was reversed earns nothing', () => {
    const ledger: LedgerEntry[] = [
      { kind: 'daily_log', counterpart: null, refId: null, localDate: DAY },
      { kind: 'log_reversed', counterpart: null, refId: null, localDate: DAY },
    ];
    expect(run([log()], ledger).reasons).toEqual(['duplicate']);
  });

  it('sending flares and snaps is not a kind at all (AC 1, X1)', () => {
    expect(XP_KINDS as readonly string[]).not.toContain('flare_sent');
    expect(XP_KINDS as readonly string[]).not.toContain('snap_shared');
  });
});

describe('reversals (PRD 4.3 rules 2 and 7)', () => {
  it('reverses invite XP within 7 days only (X21 to X23)', () => {
    expect(shouldReverseInvite('2026-11-01T10:00:00Z', '2026-11-04T10:00:00Z')).toBe(true);
    expect(shouldReverseInvite('2026-11-01T10:00:00Z', '2026-11-08T10:00:00Z')).toBe(true);
    expect(shouldReverseInvite('2026-11-01T10:00:00Z', '2026-11-09T10:00:00Z')).toBe(false);
  });

  it('reverses log XP when the last log goes, once (X19, X20)', () => {
    const awarded: LedgerEntry[] = [
      { kind: 'daily_log', counterpart: null, refId: null, localDate: DAY },
    ];
    expect(shouldReverseLog(awarded, 0)).toBe(true);
    expect(shouldReverseLog(awarded, 2)).toBe(false);
    expect(shouldReverseLog([], 0)).toBe(false);
    expect(
      shouldReverseLog(
        [...awarded, { kind: 'log_reversed', counterpart: null, refId: null, localDate: DAY }],
        0,
      ),
    ).toBe(false);
  });
});
