// Which platform's shapes and sizes to draw. Native builds use their own OS. The web build is for
// review only: it draws iOS by default and Android with `?look=android` in the URL.
import { Platform } from 'react-native';

export type Look = 'ios' | 'android';

export function lookPlatform(): Look {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
  return /[?&]look=android\b/.test(search) ? 'android' : 'ios';
}

/**
 * Web review only: `?text=max` draws every text style at the largest accessibility size, capped
 * by its token's max scale (DESIGN.md 2.4), so screenshots can check truncation. Native builds
 * follow the OS text size and always get 1 here.
 */
export function reviewTextScale(): number {
  if (Platform.OS !== 'web') return 1;
  // Read once: the entry route's redirect drops the query string, and a screen loaded after it
  // must still see the same scale as the text it draws.
  if (reviewScale === null) {
    const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
    reviewScale = /[?&]text=max\b/.test(search) ? 3.1 : 1;
  }
  return reviewScale;
}
let reviewScale: number | null = null;
