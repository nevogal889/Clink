// The active colour mode and its tokens. Follows the system appearance (light or dark).
import { useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { categoryColors, colors, elevation } from './theme';
import type { CategoryColors } from './theme/categories';
import type { ColorMode, CoreColors } from './theme/colors';
import type { LogCategory } from '@clink/shared';

export interface Theme {
  mode: ColorMode;
  c: CoreColors;
  cat: (category: LogCategory) => CategoryColors;
  floating: (typeof elevation)['light']['floating'];
}

export function themeFor(mode: ColorMode): Theme {
  return {
    mode,
    c: colors[mode],
    cat: (category) => categoryColors[mode][category],
    floating: elevation[mode].floating,
  };
}

const themes = { light: themeFor('light'), dark: themeFor('dark') };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? themes.dark : themes.light;
}

/** iOS Reduce Motion, Android "Remove animations" (DESIGN.md 2.9). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}
