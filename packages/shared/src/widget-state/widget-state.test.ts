import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDrink } from '../catalog';
import {
  EMPTY_LOCAL,
  WIDGET_STATE_VERSION,
  decodeWidgetState,
  localDateAt,
  resolveWidgetView,
  widgetConfigSchema,
  widgetLocalSchema,
  widgetStateSchema,
  type WidgetState,
} from './index';

const DIR = join(__dirname, '../../fixtures/widget-states');

interface Fixture {
  id: string;
  title: string;
  now: string;
  timeZone: string;
  config: { audience: string };
  state: unknown;
  local: unknown;
  expect: { small: Record<string, unknown> | null; medium: Record<string, unknown> | null };
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const fixtures: Fixture[] = files.map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
const invalid = readdirSync(join(DIR, 'invalid'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, 'invalid', f), 'utf8'))] as const);

describe('widget state fixtures W1 to W22 (QA_PLAN.md 4.1)', () => {
  it('has one fixture per QA state, W1 to W22', () => {
    expect(fixtures.map((f) => f.id)).toEqual(Array.from({ length: 22 }, (_, i) => `W${i + 1}`));
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s decodes with the schema', (_id, f) => {
    const r = widgetStateSchema.safeParse(f.state);
    if (!r.success) throw new Error(`${f.id}: ${JSON.stringify(r.error.issues, null, 2)}`);
    if (f.local !== null) widgetLocalSchema.parse(f.local);
    widgetConfigSchema.parse({ size: 'medium', ...f.config });
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s resolves to the expected view on each size',
    (_id, f) => {
      const state = widgetStateSchema.parse(f.state);
      const local = f.local === null ? EMPTY_LOCAL : widgetLocalSchema.parse(f.local);
      for (const size of ['small', 'medium'] as const) {
        const want = f.expect[size];
        if (want === null) continue;
        const view = resolveWidgetView({
          state,
          local,
          config: widgetConfigSchema.parse({ size, ...f.config }),
          now: new Date(f.now),
          timeZone: f.timeZone,
        });
        expect({ size, view }).toMatchObject({
          size,
          view: { overlay: null, ...want },
        });
      }
    },
  );

  it('uses catalog drink ids and widget names in the ready fixtures', () => {
    for (const f of fixtures) {
      const s = f.state as WidgetState;
      if (s.state !== 'ready') continue;
      for (const u of s.usual) {
        if (u.drinkId === null) continue;
        expect(getDrink(u.drinkId)?.widgetName).toBe(u.drinkShort);
        expect(getDrink(u.drinkId)?.category).toBe(u.category);
      }
    }
  });
});

describe('invalid documents (QA_PLAN.md L6, ST8)', () => {
  it.each(invalid)('%s is rejected, so the widget keeps its last good state', (_f, doc) => {
    expect(widgetStateSchema.safeParse(doc.state).success).toBe(false);
    expect(decodeWidgetState(doc.state)).toBeNull();
  });

  it('covers an older and a newer version', () => {
    expect(invalid.map(([f]) => f)).toEqual(
      expect.arrayContaining(['old-version.json', 'new-version.json']),
    );
    expect(WIDGET_STATE_VERSION).toBe(1);
  });
});

describe('view rules beyond the fixtures', () => {
  const ready = () => widgetStateSchema.parse(fixtures.find((f) => f.id === 'W11')?.state);
  const now = new Date('2026-11-17T09:12:00Z');
  const tz = 'Europe/London';
  const medium = { size: 'medium' as const, audience: 'auto' };

  it('after replying to the friend flare, your live flare shows (PRD 3.3 AC 6, WP2)', () => {
    const s = ready();
    if (s.state !== 'ready') throw new Error();
    const replied = {
      ...s,
      incoming: s.incoming.map((f) => ({ ...f, myResponse: { kind: 'in' as const } })),
    };
    expect(resolveWidgetView({ state: replied, config: medium, now, timeZone: tz }).kind).toBe(
      'my_flare',
    );
  });

  it('a dismissed friend flare gives way to the next state (WP5)', () => {
    const view = resolveWidgetView({
      state: ready(),
      local: { ...EMPTY_LOCAL, dismissedFlareIds: ['flr_maya'] },
      config: medium,
      now,
      timeZone: tz,
    });
    expect(view.kind).toBe('my_flare');
  });

  it('a picker past its 30 s timeout closes by itself (PRD 3.3 rule 3)', () => {
    const local = { ...EMPTY_LOCAL, mode: 'picker' as const, modeOpenedAt: '2026-11-17T09:11:30Z' };
    expect(
      resolveWidgetView({ state: ready(), local, config: medium, now, timeZone: tz }).kind,
    ).toBe('incoming');
  });

  it('a group id the widget no longer knows is treated as Automatic (G7)', () => {
    const state = widgetStateSchema.parse(fixtures.find((f) => f.id === 'W3')?.state);
    const view = resolveWidgetView({
      state,
      config: { size: 'medium', audience: 'grp_deleted' },
      now,
      timeZone: tz,
    });
    expect(view).toMatchObject({ kind: 'idle', audience: { type: 'auto', groupId: 'grp_work' } });
  });

  it('the Automatic label flips at 18:00 with no network (G9)', () => {
    const state = widgetStateSchema.parse(fixtures.find((f) => f.id === 'W3')?.state);
    const at = (iso: string) =>
      resolveWidgetView({ state, config: medium, now: new Date(iso), timeZone: tz });
    expect(at('2026-11-17T17:59:00Z')).toMatchObject({ audience: { groupId: 'grp_work' } });
    expect(at('2026-11-17T18:00:00Z')).toMatchObject({ audience: { groupId: 'grp_home' } });
  });

  it('a live flare past its close time disappears offline (ST2)', () => {
    const view = resolveWidgetView({
      state: ready(),
      config: medium,
      now: new Date('2026-11-17T09:40:00Z'),
      timeZone: tz,
    });
    expect(view.kind).toBe('idle');
  });

  it('reads the local date in the device zone', () => {
    expect(localDateAt(new Date('2026-11-17T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-18');
    expect(localDateAt(new Date('2026-11-17T23:30:00Z'), 'Europe/London')).toBe('2026-11-17');
  });
});
