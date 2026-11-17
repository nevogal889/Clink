// The preview host decodes like the Kotlin widget: widgetStateReadSchema, so an unknown key is
// dropped and every other broken document is refused (packages/shared/fixtures/README.md).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPreviewHost, STATE_REFUSED } from './host';

const INVALID = join(__dirname, '../../../../packages/shared/fixtures/widget-states/invalid');
const invalid = readdirSync(INVALID)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => [f, JSON.parse(readFileSync(join(INVALID, f), 'utf8')).state] as const);

describe('preview host decoding', () => {
  it('accepts a state with an unknown key and drops the key, as the widget does', async () => {
    const host = createPreviewHost();
    const doc = invalid.find(([f]) => f === 'xp-field.json')![1];
    await host.setWidgetState(doc);
    expect(JSON.parse(host.state!).state).toBe('ready');
    expect(host.state).not.toMatch(/xp/i);
  });

  it.each(invalid.filter(([f]) => f !== 'xp-field.json'))(
    'refuses %s and keeps the last good state',
    async (_f, doc) => {
      const host = createPreviewHost();
      await expect(host.setWidgetState(doc)).rejects.toMatchObject({ code: STATE_REFUSED });
      expect(host.state).toBeNull();
    },
  );

  it('hands rejected logs over once', async () => {
    const rejected = {
      entry: {
        id: '33333333-3333-4333-8333-333333333333',
        op: 'log' as const,
        createdAt: '2026-11-16T09:00:00Z',
        dropAt: null,
        payload: {
          drinkId: 'tea.jasmine',
          slot: null,
          category: 'tea' as const,
          loggedAt: '2026-11-16T09:00:00Z',
        },
      },
      status: 422,
      code: 'unknown_drink',
      kind: 'malformed' as const,
      rejectedAt: '2026-11-16T09:01:00Z',
    };
    const host = createPreviewHost({ rejected: [rejected] });
    expect((await host.getOutbox()).rejected).toEqual([rejected]);
    expect(await host.takeRejected!()).toEqual([rejected]);
    expect(await host.takeRejected!()).toEqual([]);
    expect((await host.getOutbox()).rejected).toEqual([]);
  });
});
