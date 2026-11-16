// The widget state the app builds or patches when it can't fetch widget-api/state, and how the
// widget's unsent logs join Today without doubling.
import { widgetStateSchema, type OutboxEntry, type WidgetState } from '@clink/shared';

import type { LogEntry, Me, UsualDrink } from '../api/types';
import {
  buildWidgetState,
  deviceDate,
  isoSeconds,
  mergeToday,
  patchWidgetState,
  todayBlock,
  widgetPendingLogs,
  type AppWidgetInput,
} from './state';

const NOW = new Date(2026, 10, 16, 10, 30, 15, 250); // local Monday 10:30
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).toISOString();

const me: Me = {
  displayName: 'dana Cole',
  photoUri: null,
  providerName: null,
  hasPhone: true,
  onboarding: 'done',
  needsSignup: false,
};
const usual: UsualDrink[] = [
  {
    drinkId: 'coffee.flat_white',
    customName: null,
    category: 'coffee',
    details: { caf: 'Decaf' },
  },
  { drinkId: null, customName: 'Office brew', category: 'tea', details: {} },
];
const log = (id: string, over: Partial<LogEntry> = {}): LogEntry => ({
  id,
  drinkId: 'coffee.americano',
  customName: null,
  category: 'coffee',
  details: {},
  loggedAt: at(8),
  ...over,
});
const input = (over: Partial<AppWidgetInput> = {}): AppWidgetInput => ({
  me,
  usual,
  today: [
    log('a'),
    log('b', { drinkId: 'water.still', category: 'water', loggedAt: at(9) }),
    log('c', { drinkId: 'coffee.latte', details: { caf: 'Decaf' }, loggedAt: at(9, 45) }),
  ],
  audience: {
    friendCount: 3,
    groups: [{ id: 'g1', name: 'Work', emoji: '💼', memberCount: 3 }],
    auto: { daytimeGroupId: 'g1', otherGroupId: null },
  },
  lastPlace: 'Kaffa Roastery',
  ...over,
});

describe('building the widget state', () => {
  it('writes timestamps the way every decoder reads them', () => {
    expect(isoSeconds(new Date('2026-11-16T09:30:15.250Z'))).toBe('2026-11-16T09:30:15Z');
  });

  it('builds a ready state that passes the shared schema', () => {
    const s = buildWidgetState(input(), NOW)!;
    expect(widgetStateSchema.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({
      v: 1,
      state: 'ready',
      updatedAt: isoSeconds(NOW),
      me: { initial: 'D', friendsCount: 3 },
      today: {
        localDate: deviceDate(NOW),
        drinks: 2,
        water: 1,
        caffeinated: 1, // the Decaf latte doesn't count
        lastDrinkAt: isoSeconds(new Date(at(9, 45))),
      },
      groups: [{ id: 'g1', name: 'Work', emoji: '💼', memberCount: 3, avatarFiles: [] }],
      auto: { daytimeGroupId: 'g1', otherGroupId: null },
      lastPlace: 'Kaffa Roastery',
      myFlare: null,
      incoming: [],
      snaps: [],
      outbox: [],
    });
    expect(s.state === 'ready' && s.usual).toEqual([
      expect.objectContaining({ slot: 1, drinkId: 'coffee.flat_white', hasDetails: true }),
      expect.objectContaining({ slot: 2, drinkId: null, name: 'Office brew' }),
    ]);
  });

  it('is setup while onboarding runs, and nothing before the account exists', () => {
    expect(buildWidgetState(input({ me: { ...me, onboarding: 'usual' } }), NOW)).toEqual({
      v: 1,
      state: 'setup',
      updatedAt: isoSeconds(NOW),
    });
    expect(buildWidgetState(input({ me: { ...me, needsSignup: true } }), NOW)).toBeNull();
    expect(buildWidgetState(input({ me: null }), NOW)).toBeNull();
  });

  it("counts only today's entries", () => {
    const yesterday = new Date(2026, 10, 15, 22).toISOString();
    expect(todayBlock([log('y', { loggedAt: yesterday })], NOW)).toEqual({
      localDate: deviceDate(NOW),
      drinks: 0,
      water: 0,
      caffeinated: 0,
      lastDrinkAt: null,
    });
  });

  it('keeps an unusual group or place out instead of failing the whole state', () => {
    const s = buildWidgetState(
      input({
        audience: {
          friendCount: 40,
          groups: [{ id: 'g2', name: 'x'.repeat(30), emoji: '', memberCount: 3 }],
          auto: { daytimeGroupId: null, otherGroupId: null },
        },
        lastPlace: '   ',
      }),
      NOW,
    )!;
    expect(s).toMatchObject({ me: { friendsCount: 20 }, groups: [], lastPlace: null });
  });
});

describe('patching the last server state', () => {
  const server = {
    ...(buildWidgetState(input({ today: [] }), new Date(2026, 10, 16, 7)) as WidgetState),
    snaps: [
      {
        id: 's1',
        senderName: 'Leo',
        thumbFile: 's_leo_1.jpg',
        place: null,
        createdAt: '2026-11-16T07:00:00Z',
        expiresAt: '2026-11-17T07:00:00Z',
      },
    ],
  } as WidgetState;

  it("keeps friends' parts and replaces the usual 3 and today's counts", () => {
    const p = patchWidgetState(server, input(), NOW)!;
    expect(p.state === 'ready' && p.snaps).toHaveLength(1);
    expect(p).toMatchObject({ updatedAt: isoSeconds(NOW), today: { drinks: 2, water: 1 } });
  });

  it('falls back to its own build without a server state or after setup changes', () => {
    expect(patchWidgetState(null, input(), NOW)).toEqual(buildWidgetState(input(), NOW));
    const setup = { v: 1, state: 'setup', updatedAt: '2026-11-16T07:00:00Z' } as WidgetState;
    expect(patchWidgetState(setup, input(), NOW)?.state).toBe('ready');
  });
});

describe("the widget's unsent logs in Today", () => {
  const pending = (
    id: string,
    payload: Partial<Extract<OutboxEntry, { op: 'log' }>['payload']>,
  ): OutboxEntry => ({
    id,
    op: 'log',
    createdAt: '2026-11-16T09:00:00Z',
    dropAt: null,
    payload: {
      drinkId: 'coffee.flat_white',
      slot: 1,
      category: 'coffee',
      loggedAt: '2026-11-16T09:00:00Z',
      ...payload,
    },
  });

  it('turns them into tracker entries with the usual slot name and details', () => {
    const out = widgetPendingLogs(
      [
        pending('11111111-1111-4111-8111-111111111111', {}),
        pending('22222222-2222-4222-8222-222222222222', {
          drinkId: null,
          slot: 2,
          category: 'tea',
        }),
        pending('33333333-3333-4333-8333-333333333333', {
          drinkId: 'water.still',
          slot: null,
          category: 'water',
        }),
        // A custom drink whose slot is now something else: no name to show, so it waits.
        pending('44444444-4444-4444-8444-444444444444', { drinkId: null, slot: 1 }),
      ],
      usual,
    );
    expect(out.map((e) => [e.id.slice(0, 1), e.drinkId, e.customName, e.details])).toEqual([
      ['1', 'coffee.flat_white', null, { caf: 'Decaf' }],
      ['2', null, 'Office brew', {}],
      ['3', 'water.still', null, {}],
    ]);
  });

  it('merges by id, so a log the server already has shows once', () => {
    const w = log('w1', { loggedAt: at(10) });
    const old = log('w0', { loggedAt: new Date(2026, 10, 15, 10).toISOString() });
    const merged = mergeToday([log('a'), { ...w, details: { caf: 'Decaf' } }], [w, old], NOW);
    expect(merged.map((e) => e.id)).toEqual(['a', 'w1']);
    expect(merged[1]!.details).toEqual({ caf: 'Decaf' }); // the app's copy wins
  });
});
