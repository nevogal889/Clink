import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_EVENTS,
  EVENT_NAMES,
  EVENT_NAME_RE,
  EVENT_PROPS,
  EVENT_SENT_BY,
  REACTIONS,
  WIDGET_LOG_REJECT_CODES,
  clientEventSchema,
  parseEventProps,
} from './index';

const PRD = readFileSync(join(__dirname, '../../../../docs/PRD.md'), 'utf8');

/** Event names from the PRD 6 "Event list" table, first column, split on " / ". */
function prdEventNames(): string[] {
  const start = PRD.indexOf('### Event list');
  const table = PRD.slice(start, PRD.indexOf('## 7.', start));
  const names: string[] = [];
  for (const line of table.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const first = line.split('|')[1] ?? '';
    for (const m of first.matchAll(/`([a-z_]+)`/g)) if (m[1]) names.push(m[1]);
  }
  return names;
}

describe('analytics events (PRD.md 6)', () => {
  it('lists exactly the PRD events', () => {
    expect([...EVENT_NAMES].sort()).toEqual(prdEventNames().sort());
  });

  it('every name fits the app_events.name check', () => {
    for (const n of EVENT_NAMES) expect(n).toMatch(EVENT_NAME_RE);
  });

  it('has a writer for every event and keeps server events off the client', () => {
    for (const n of EVENT_NAMES) expect(['client', 'server']).toContain(EVENT_SENT_BY[n]);
    expect(CLIENT_EVENTS).toContain('app_opened');
    expect(CLIENT_EVENTS).toContain('widget_removed');
    expect(CLIENT_EVENTS).not.toContain('flare_sent');
    expect(clientEventSchema.safeParse({ name: 'flare_sent', props: {} }).success).toBe(false);
  });

  it('validates props strictly', () => {
    expect(
      parseEventProps('flare_sent', {
        source: 'widget',
        category: 'coffee',
        timing_min: 0,
        audience_type: 'auto',
        has_photo: false,
      }),
    ).toBeTruthy();
    expect(() =>
      parseEventProps('flare_sent', {
        source: 'widget',
        category: 'water',
        timing_min: 0,
        audience_type: 'auto',
        has_photo: false,
      }),
    ).toThrow();
    expect(
      clientEventSchema.safeParse({ name: 'app_opened', props: { entry: 'widget' } }).success,
    ).toBe(true);
    expect(
      clientEventSchema.safeParse({ name: 'app_opened', props: { entry: 'widget', place: 'Café' } })
        .success,
    ).toBe(false);
  });

  it('carries no free text: every prop is an enum, boolean or number', () => {
    for (const n of EVENT_NAMES) {
      const shape = EVENT_PROPS[n].shape as Record<
        string,
        { def: { type: string; innerType?: { def: { type: string } } } }
      >;
      for (const [prop, schema] of Object.entries(shape)) {
        const type =
          schema.def.type === 'nullable' ? schema.def.innerType?.def.type : schema.def.type;
        expect([`${n}.${prop}`, ['enum', 'boolean', 'number'].includes(type ?? '')]).toEqual([
          `${n}.${prop}`,
          true,
        ]);
      }
    }
  });

  it('reports a refused widget log by code and kind only (ARCHITECTURE.md 3.2)', () => {
    expect(CLIENT_EVENTS).toContain('widget_log_rejected');
    expect(WIDGET_LOG_REJECT_CODES).toEqual(
      expect.arrayContaining(['bad_input', 'unknown_drink', 'usual_changed']),
    );
    expect(WIDGET_LOG_REJECT_CODES).not.toContain('rate_limited');
    const ok = { code: 'unknown_drink', kind: 'malformed', category: 'coffee' };
    expect(clientEventSchema.safeParse({ name: 'widget_log_rejected', props: ok }).success).toBe(
      true,
    );
    for (const bad of [
      { ...ok, code: 'Drink "Mocha" is not in the catalog' },
      { ...ok, kind: 'retryable' },
      { ...ok, drinkId: 'coffee.latte' },
    ]) {
      expect(clientEventSchema.safeParse({ name: 'widget_log_rejected', props: bad }).success).toBe(
        false,
      );
    }
  });

  it('names the five reactions', () => {
    expect(Object.values(REACTIONS)).toEqual(['☕', '🍵', '🫖', '❤️', '😂']);
  });
});
