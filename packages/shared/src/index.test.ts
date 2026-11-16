import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MODULES = [
  'catalog',
  'strings',
  'xp',
  'audience',
  'limits',
  'events',
  'widget-state',
  'api',
] as const;

describe('@clink/shared entry', () => {
  it('loads as a module', async () => {
    await expect(import('./index')).resolves.toBeDefined();
  });

  it.each(MODULES)('has the %s module with an index', (name) => {
    expect(existsSync(join(__dirname, name, 'index.ts'))).toBe(true);
  });

  it('exports the api schemas from the entry, with no name clash', async () => {
    const shared = await import('./index');
    const api = await import('./api');
    for (const name of Object.keys(api)) {
      expect(shared[name as keyof typeof shared]).toBe(api[name as keyof typeof api]);
    }
    expect(shared.WIDGET_API_ERRORS).toBeDefined();
    expect(shared.widgetStateReadSchema).toBeDefined();
  });

  it('has the fixtures folder', () => {
    expect(existsSync(join(__dirname, '..', 'fixtures'))).toBe(true);
  });
});
