// Drink art and brand marks. Heroes, icons and glyphs are decorative wherever a name sits next to
// them, so they are hidden from screen readers (DESIGN.md 7).
import type { FlareCategory, LogCategory } from '@clink/shared';
import { getDrink } from '@clink/shared';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { brandSvg, glyphSvg, heroSvg, iconSvg } from './art/art';
import { useTheme } from './useTheme';

const hidden = {
  accessible: false,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
} as const;

export function Hero({ category, size }: { category: LogCategory; size: number }) {
  const { mode } = useTheme();
  return (
    <View {...hidden} style={{ width: size, height: size }} testID={`hero-${category}`}>
      <SvgXml xml={heroSvg(category, mode)} width={size} height={size} />
    </View>
  );
}

export function Glyph({
  category,
  size = 24,
  color,
}: {
  category: LogCategory;
  size?: number;
  color: string;
}) {
  return (
    <View {...hidden} style={{ width: size, height: size }}>
      <SvgXml xml={glyphSvg(category, color)} width={size} height={size} />
    </View>
  );
}

/**
 * A drink's icon at Icon S (24 grid) or Icon L (64 grid). Custom drinks have no drawing of their
 * own: they show their category glyph on the category tint, so the picture still says the kind.
 */
export function DrinkIcon({
  drinkId,
  category,
  size,
}: {
  drinkId: string | null;
  category: FlareCategory | 'water';
  size: number;
}) {
  const theme = useTheme();
  const grid = size <= 32 ? 'S' : 'L';
  const xml = drinkId ? iconSvg(drinkId, grid, theme.mode) : null;
  if (xml) {
    return (
      <View {...hidden} style={{ width: size, height: size }}>
        <SvgXml xml={xml} width={size} height={size} />
      </View>
    );
  }
  const cat = drinkId ? (getDrink(drinkId)?.category ?? category) : category;
  const col = theme.cat(cat);
  return (
    <View
      {...hidden}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: col.tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Glyph category={cat} size={Math.round(size * 0.55)} color={col.ink} />
    </View>
  );
}

const WORDMARK_RATIO = 146 / 348;

export function Wordmark({ width }: { width: number }) {
  const { mode } = useTheme();
  return (
    <View {...hidden} style={{ width, height: width * WORDMARK_RATIO }}>
      <SvgXml xml={brandSvg('wordmark', mode)} width={width} height={width * WORDMARK_RATIO} />
    </View>
  );
}

export function AppIcon({ size }: { size: number }) {
  return (
    <View {...hidden} style={{ width: size, height: size, borderRadius: size * 0.225, overflow: 'hidden' }}>
      <SvgXml xml={brandSvg('app-icon', 'light')} width={size} height={size} />
    </View>
  );
}
