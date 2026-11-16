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

  it('has the fixtures folder', () => {
    expect(existsSync(join(__dirname, '..', 'fixtures'))).toBe(true);
  });
});
