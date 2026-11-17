// Every call path between the app and the widget bridge, with the bridge mocked (the preview
// host records each call; the Kotlin side has its own tests).
import type { WidgetState } from '@clink/shared';

import { ApiError } from '../api/errors';
import type { ClinkApi, WidgetLogRejected } from '../api/types';
import { createPreviewHost } from './host';
import { buildWidgetState, isoSeconds, type AppWidgetInput } from './state';
import { createWidgetSync, rejectReport } from './sync';

const TOKEN = 'T0k3n_-'.repeat(6) + 'x'; // 43 characters, test value
const NOW = new Date(2026, 10, 16, 10, 30);

const input: AppWidgetInput = {
  me: {
    displayName: 'Dana',
    photoUri: null,
    providerName: null,
    hasPhone: true,
    onboarding: 'done',
    needsSignup: false,
  },
  usual: [{ drinkId: 'coffee.latte', customName: null, category: 'coffee', details: {} }],
  today: [
    {
      id: 'l1',
      drinkId: 'coffee.latte',
      customName: null,
      category: 'coffee',
      details: {},
      loggedAt: new Date(2026, 10, 16, 9).toISOString(),
    },
  ],
  audience: null,
  lastPlace: '',
};

const serverState = (drinks: number): WidgetState =>
  ({
    ...(buildWidgetState(input, NOW) as Extract<WidgetState, { state: 'ready' }>),
    today: {
      localDate: '2026-11-16',
      drinks,
      water: 0,
      caffeinated: drinks,
      lastDrinkAt: isoSeconds(NOW),
    },
  }) as WidgetState;

type Api = Pick<ClinkApi, 'registerDevice' | 'getWidgetState' | 'recordWidgetLogRejected'>;

function setup(api: Partial<Api> = {}, hostOpts: Parameters<typeof createPreviewHost>[0] = {}) {
  const host = createPreviewHost(hostOpts);
  const calls = { register: 0, state: 0 };
  const reports: WidgetLogRejected[] = [];
  const full: Api = {
    recordWidgetLogRejected: async (props) => {
      reports.push(props);
    },
    registerDevice: async () => {
      calls.register += 1;
      return { widgetToken: TOKEN };
    },
    getWidgetState: async () => {
      calls.state += 1;
      return serverState(5);
    },
    ...api,
  };
  const sync = createWidgetSync({
    host,
    api: full,
    now: () => NOW,
    timeZone: () => 'Europe/London',
  });
  return { host, sync, calls, reports };
}

const pushed = (host: ReturnType<typeof createPreviewHost>) =>
  JSON.parse(host.state ?? 'null') as WidgetState;

describe('widget sync', () => {
  it('registers once per account and hands the widget its token', async () => {
    const { host, sync, calls } = setup();
    expect(await sync.register('u1')).toBe(true);
    expect(await sync.register('u1')).toBe(true);
    expect(calls.register).toBe(1);
    expect(host.hasToken).toBe(true);
    expect(host.calls).toEqual(['setWidgetToken']);
    // Another account on this install registers again.
    await sync.register('u2');
    expect(calls.register).toBe(2);
  });

  it('keeps the widget token it has when register-device fails', async () => {
    const { host, sync } = setup({
      registerDevice: async () => {
        throw new ApiError('network');
      },
    });
    expect(await sync.register('u1')).toBe(false);
    expect(host.calls).not.toContain('setWidgetToken');
  });

  it('pushes the server state, then reloads the widgets', async () => {
    const { host, sync, calls } = setup();
    await sync.register('u1');
    expect(await sync.push(input)).toBe('server');
    expect(calls.state).toBe(1);
    expect(pushed(host)).toMatchObject({ state: 'ready', today: { drinks: 5 } });
    expect(host.calls.slice(-2)).toEqual(['setWidgetState', 'reloadWidgets']);
  });

  it('does nothing before an account is registered', async () => {
    const { host, sync } = setup();
    expect(await sync.push(input)).toBe('skipped');
    expect(host.calls).toEqual([]);
  });

  it("patches the last server state with the app's counts when offline", async () => {
    let online = true;
    const { host, sync } = setup({
      getWidgetState: async () => {
        if (!online) throw new ApiError('network');
        return serverState(5);
      },
    });
    await sync.register('u1');
    await sync.push(input);
    online = false;
    expect(await sync.push(input)).toBe('local');
    expect(pushed(host)).toMatchObject({ state: 'ready', today: { drinks: 1 } });
  });

  it('builds the state itself when there is no widget token yet', async () => {
    const { host, sync } = setup({ getWidgetState: async () => null });
    await sync.register('u1');
    expect(await sync.push(input)).toBe('local');
    expect(pushed(host)).toMatchObject({ state: 'ready', me: { initial: 'D' } });
  });

  it('registers again once when the token was rotated, then reads again', async () => {
    let n = 0;
    const { sync, calls } = setup({
      getWidgetState: async () => {
        n += 1;
        if (n === 1) throw new ApiError('unauthorized');
        return serverState(2);
      },
    });
    await sync.register('u1');
    expect(await sync.push(input)).toBe('server');
    expect(calls.register).toBe(2);
    expect(n).toBe(2);
  });

  it('tries the rotation only once per launch', async () => {
    const { sync, calls } = setup({
      getWidgetState: async () => {
        throw new ApiError('unauthorized');
      },
    });
    await sync.register('u1');
    expect(await sync.push(input)).toBe('local');
    expect(await sync.push(input)).toBe('local');
    expect(calls.register).toBe(2);
  });

  it('keeps the last good state when the widget refuses one', async () => {
    // A newer version than this app knows: every decoder refuses it (an unknown key alone is
    // dropped, not refused).
    const bad = { ...serverState(1), v: 2 } as unknown as WidgetState;
    const { host, sync } = setup({ getWidgetState: async () => bad });
    await sync.register('u1');
    expect(await sync.push(input)).toBe('refused');
    expect(host.state).toBeNull();
    expect(host.calls).not.toContain('reloadWidgets');
  });

  it('on foreground hands over drops, the installed widgets and unsent logs', async () => {
    const pending = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        op: 'log' as const,
        createdAt: '2026-11-16T09:00:00Z',
        dropAt: null,
        payload: {
          drinkId: 'water.still',
          slot: null,
          category: 'water' as const,
          loggedAt: '2026-11-16T09:00:00Z',
        },
      },
    ];
    const { host, sync } = setup({}, { installed: [{ id: 7, size: 'small' }], pending });
    host.dropped = [{ id: 'f1', op: 'flare', droppedAt: '2026-11-16T09:02:00Z' }];
    const fg = await sync.foreground();
    expect(fg.installed).toEqual([{ id: 7, size: 'small' }]);
    expect(fg.dropped).toHaveLength(1);
    expect(fg.pending).toEqual(pending);
    expect(host.calls).toEqual(['drainOutbox', 'getInstalledWidgets', 'getOutbox']);
    expect((await sync.foreground()).dropped).toEqual([]);
  });

  describe('logs the server refused for good (ARCHITECTURE.md 3.2, review item 7)', () => {
    const log = (drinkId: string, category: 'coffee' | 'water') => ({
      id: '22222222-2222-4222-8222-222222222222',
      op: 'log' as const,
      createdAt: '2026-11-16T09:00:00Z',
      dropAt: null,
      payload: { drinkId, slot: null, category, loggedAt: '2026-11-16T09:00:00Z' },
    });
    const rejected = (
      code: string | null,
      kind: 'malformed' | 'stale' | null,
      status = 422,
      entry = log('coffee.latte', 'coffee'),
    ) => ({ entry, status, code, kind, rejectedAt: '2026-11-16T09:01:00Z' });

    it('takes them on foreground and reports each by code, kind and category only', async () => {
      const { host, sync, reports } = setup(
        {},
        {
          rejected: [
            rejected('unknown_drink', 'malformed'),
            rejected('usual_changed', 'stale', 409, log('water.still', 'water')),
          ],
        },
      );
      await sync.register('u1');
      await sync.foreground();
      await sync.reported();
      expect(host.calls).toContain('takeRejected');
      expect(host.rejected).toEqual([]);
      expect(reports).toEqual([
        { code: 'unknown_drink', kind: 'malformed', category: 'coffee' },
        { code: 'usual_changed', kind: 'stale', category: 'water' },
      ]);
      // Nothing that identifies the drink, the time or the log leaves the device.
      expect(JSON.stringify(reports)).not.toMatch(/latte|still|2026|2222/);
      // Taken once: the next foreground has nothing to report.
      await sync.foreground();
      await sync.reported();
      expect(reports).toHaveLength(2);
    });

    it('sends an unknown code or kind as "other", never the server text', () => {
      expect(rejectReport(rejected('Drink "Mocha" is not ours', null, 418))).toEqual({
        code: 'other',
        kind: 'other',
        category: 'coffee',
      });
      expect(rejectReport(rejected(null, 'malformed', 400))).toMatchObject({ code: 'other' });
    });

    it('keeps a report that could not be sent and sends it on the next foreground', async () => {
      let online = false;
      const sent: WidgetLogRejected[] = [];
      const { host, sync } = setup(
        {
          recordWidgetLogRejected: async (p) => {
            if (!online) throw new ApiError('network');
            sent.push(p);
          },
        },
        { rejected: [rejected('bad_input', 'malformed', 400)] },
      );
      await sync.register('u1');
      await sync.foreground();
      await sync.reported();
      expect(sent).toEqual([]);
      expect(host.rejected).toEqual([]); // the widget handed it over; the app holds it now
      online = true;
      await sync.foreground();
      await sync.reported();
      expect(sent).toEqual([{ code: 'bad_input', kind: 'malformed', category: 'coffee' }]);
    });

    it('leaves them with the widget while signed out', async () => {
      const { host, sync, reports } = setup({}, { rejected: [rejected('conflict', 'malformed')] });
      await sync.foreground();
      await sync.reported();
      expect(host.calls).not.toContain('takeRejected');
      expect(host.rejected).toHaveLength(1);
      expect(reports).toEqual([]);
    });
  });

  it('clears the widget on sign-out and stops pushing', async () => {
    const { host, sync } = setup();
    await sync.register('u1');
    await sync.push(input);
    await sync.signedOut();
    expect(host.calls.at(-1)).toBe('clearAll');
    expect(host.hasToken).toBe(false);
    expect(pushed(host)).toMatchObject({ state: 'signed_out' });
    expect(await sync.push(input)).toBe('skipped');
  });

  it('makes no bridge call where the platform has no widget, but still registers the device', async () => {
    const { host, sync, calls } = setup({}, { supported: false });
    // register-device runs on every platform (ARCHITECTURE.md 4.4: time zone, invite code,
    // new sign-in notice); only the widget token hand-over is skipped.
    expect(await sync.register('u1')).toBe(true);
    expect(calls.register).toBe(1);
    expect(host.hasToken).toBe(false);
    expect(await sync.push(input)).toBe('skipped');
    expect(await sync.foreground()).toEqual({ installed: [], dropped: [], pending: [] });
    await sync.signedOut();
    expect(host.calls).toEqual([]);
  });
});
