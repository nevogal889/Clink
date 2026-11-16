// Drink art lookups and the dark-mode export rules (DESIGN.md 3.5, docs/build-notes/art-a.md and
// art-b.md). Masters are drawn for light surfaces; dark variants are derived here, once per file.
import type { LogCategory } from '@clink/shared';

import { BRAND, GLYPHS, HEROES, ICONS_L, ICONS_S } from './art.generated';

export const OUTLINE = { light: '#17202A', dark: '#EEF2F5' } as const;

/** Icon dark swap: outline and the five category inks (app/assets/art/icons/theme.json). */
export const ICON_DARK_SWAP: Record<string, string> = {
  '#17202A': '#EEF2F5',
  '#4B3527': '#DDC1AE',
  '#36591A': '#B7D69A',
  '#6B5306': '#E8CF78',
  '#9E2460': '#F5B0D0',
  '#085C74': '#99D9EB',
};

function swapGleam(svg: string): string {
  return svg.replace(/((?:fill|stroke)-opacity=")0\.85(")/g, '$10.7$2');
}

/**
 * Heroes: only elements inside a group whose id starts with "contour" swap steel to the light
 * outline. Cast shadows and speckle keep steel. Same rule as darkHero() in gen-art-gallery.mjs.
 */
export function darkHero(svg: string): string {
  let depth = 0;
  const swapped = svg.replace(
    /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g,
    (tag: string, close: string, _name: string, attrs: string, self: string) => {
      if (depth > 0) {
        if (close) depth -= 1;
        else if (!self) depth += 1;
        return tag.split(OUTLINE.light).join(OUTLINE.dark);
      }
      if (!close && /\bid="contour/.test(attrs)) {
        if (!self) depth = 1;
        return tag.split(OUTLINE.light).join(OUTLINE.dark);
      }
      return tag;
    },
  );
  return swapGleam(swapped);
}

export function darkIcon(svg: string): string {
  let out = svg;
  for (const [from, to] of Object.entries(ICON_DARK_SWAP)) {
    out = out.split(from).join(to).split(from.toLowerCase()).join(to);
  }
  return swapGleam(out);
}

/** Glyphs are one colour: they take the colour of the text beside them (DESIGN.md 2.8). */
export function tintGlyph(svg: string, color: string): string {
  return svg.split(OUTLINE.light).join(color);
}

const cache = new Map<string, string>();
function memo(key: string, make: () => string): string {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

export type Mode = 'light' | 'dark';

export function heroSvg(category: LogCategory, mode: Mode): string {
  const master = HEROES[category];
  if (!master) throw new Error(`No hero for ${category}`);
  return mode === 'dark' ? memo(`hero:${category}`, () => darkHero(master)) : master;
}

export function iconSvg(drinkId: string, size: 'S' | 'L', mode: Mode): string | null {
  const master = (size === 'S' ? ICONS_S : ICONS_L)[drinkId];
  if (!master) return null;
  return mode === 'dark' ? memo(`icon:${size}:${drinkId}`, () => darkIcon(master)) : master;
}

export function glyphSvg(category: LogCategory, color: string): string {
  const master = GLYPHS[category];
  if (!master) throw new Error(`No glyph for ${category}`);
  return memo(`glyph:${category}:${color}`, () => tintGlyph(master, color));
}

export function brandSvg(name: 'wordmark' | 'mark' | 'mark-small' | 'app-icon', mode: Mode) {
  const file = name === 'wordmark' && mode === 'dark' ? 'wordmark-dark' : name;
  const svg = BRAND[file];
  if (!svg) throw new Error(`No brand art ${file}`);
  return svg;
}

export function hasIcon(drinkId: string): boolean {
  return drinkId in ICONS_L && drinkId in ICONS_S;
}
