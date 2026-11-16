// Spacing and layout grid. Source: docs/DESIGN.md 2.5. Base unit 4.
import { lookPlatform } from './look';

export const spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  /** Screen gutter: 20 pt on iOS, 16 dp on Android. */
  gutter: lookPlatform() === 'android' ? 16 : 20,
  /** Minimum touch target: 44 pt (iOS), 48 dp (Android). */
  target: lookPlatform() === 'android' ? 48 : 44,
  rowOneLine: 56,
  rowTwoLine: 72,
  primaryButton: 56,
  textButton: 44,
  topBar: 52,
  shutterRow: 96,
} as const;
