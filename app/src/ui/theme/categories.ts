// Category colours (coffee, matcha, tea, smoothie_juice, water). Source: docs/DESIGN.md 2.2.
// Keep values here only; components read them through useTheme().
import type { LogCategory } from '@clink/shared';

import type { ColorMode } from './colors';

export interface CategoryColors {
  /** Filled buttons and your own flare's background, with onSolid text. */
  solid: string;
  onSolid: string;
  /** Background of containers holding that drink. */
  tint: string;
  /** Glyphs, rim lines and short labels of 15 pt and up, on tint and on surfaces. */
  ink: string;
}

export const categoryColors: Record<ColorMode, Record<LogCategory, CategoryColors>> = {
  light: {
    coffee: { solid: '#4B3527', onSolid: '#FFFFFF', tint: '#EFE6DF', ink: '#4B3527' },
    matcha: { solid: '#36591A', onSolid: '#FFFFFF', tint: '#E3ECD8', ink: '#36591A' },
    tea: { solid: '#86690A', onSolid: '#FFFFFF', tint: '#F5EDCF', ink: '#6B5306' },
    smoothie_juice: { solid: '#9E2460', onSolid: '#FFFFFF', tint: '#F7E0EA', ink: '#9E2460' },
    water: { solid: '#0B7391', onSolid: '#FFFFFF', tint: '#DCEEF3', ink: '#085C74' },
  },
  dark: {
    coffee: { solid: '#D2B39E', onSolid: '#131A22', tint: '#2A211B', ink: '#DDC1AE' },
    matcha: { solid: '#A9CC86', onSolid: '#131A22', tint: '#1D2817', ink: '#B7D69A' },
    tea: { solid: '#E2C561', onSolid: '#131A22', tint: '#2A2512', ink: '#E8CF78' },
    smoothie_juice: { solid: '#F29AC3', onSolid: '#131A22', tint: '#2F1823', ink: '#F5B0D0' },
    water: { solid: '#7FCFE6', onSolid: '#131A22', tint: '#102A33', ink: '#99D9EB' },
  },
};
