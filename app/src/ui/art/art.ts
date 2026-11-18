// Drink art lookups and the dark-mode export rules (DESIGN.md 3.5, docs/build-notes/art-a.md and
// art-b.md). Masters are drawn for light surfaces; dark variants are derived here, once per file.
import type { LogCategory } from '@clink/shared';

import {
  BRAND,
  GLYPHS,
  HEROES,
  ICONS_L,
  ICONS_L_DARK,
  ICONS_S,
  ICONS_S_DARK,
} from './art.generated';

export const OUTLINE = { light: '#17202A', dark: '#EEF2F5' } as const;

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
  // Dark icons are prebuilt with the shared contour rule (gen-art.mjs, DESIGN.md 3.2).
  const table =
    mode === 'dark'
      ? size === 'S'
        ? ICONS_S_DARK
        : ICONS_L_DARK
      : size === 'S'
        ? ICONS_S
        : ICONS_L;
  return table[drinkId] ?? null;
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
