// art.generated.ts must match the SVG masters in app/assets/art (gen-art.mjs --check).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { LOG_CATEGORIES, DRINKS } from '@clink/shared';

import { glyphSvg, hasIcon, heroSvg, iconSvg } from './art';

describe('drink art', () => {
  it('art.generated.ts is up to date with the masters', () => {
    expect(() =>
      execFileSync(process.execPath, [path.join(__dirname, 'gen-art.mjs'), '--check'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('has a hero and a glyph for every category, in both modes', () => {
    for (const c of LOG_CATEGORIES) {
      expect(heroSvg(c, 'light')).toContain('<svg');
      expect(heroSvg(c, 'dark')).toContain('<svg');
      expect(glyphSvg(c, '#000000')).toContain('#000000');
    }
  });

  it('has both icon sizes for every catalog drink', () => {
    const missing = DRINKS.filter((d) => !hasIcon(d.id)).map((d) => d.id);
    expect(missing).toEqual([]);
    // Dark icons keep the light drawing on a light contour (shared rule, DESIGN.md 3.2).
    expect(iconSvg('coffee.latte', 'S', 'dark')).toContain('dark-contour');
    expect(iconSvg('coffee.latte', 'L', 'dark')).toContain('dark-contour');
    expect(iconSvg('coffee.latte', 'L', 'light')).not.toContain('dark-contour');
  });
});
