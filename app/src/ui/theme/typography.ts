// Type scale and font families. Source: docs/DESIGN.md 2.4.
// One family, Archivo, shipped as static cuts in app/assets/fonts (OFL 1.1, see OFL.txt).
// Every token sets maxFontSizeMultiplier from the "Max scale" column; allowFontScaling stays on.
import type { TextStyle } from 'react-native';

import { lookPlatform } from './look';

export const fontFiles = {
  'Archivo-Regular': require('../../../assets/fonts/Archivo-Regular.ttf'),
  'Archivo-Medium': require('../../../assets/fonts/Archivo-Medium.ttf'),
  'Archivo-SemiBold': require('../../../assets/fonts/Archivo-SemiBold.ttf'),
  'Archivo-Bold': require('../../../assets/fonts/Archivo-Bold.ttf'),
  'ArchivoSemiCondensed-Bold': require('../../../assets/fonts/ArchivoSemiCondensed-Bold.ttf'),
  'ArchivoSemiCondensed-ExtraBold': require('../../../assets/fonts/ArchivoSemiCondensed-ExtraBold.ttf'),
} as const;

export type FontFace = keyof typeof fontFiles;

export interface TypeToken extends TextStyle {
  fontFamily: FontFace;
  fontSize: number;
  lineHeight: number;
  maxFontSizeMultiplier: number;
}

const android = lookPlatform() === 'android';

function tok(
  fontFamily: FontFace,
  ios: [number, number],
  and: [number, number],
  maxIos: number,
  maxAndroid: number = maxIos,
  extra: Omit<TextStyle, 'fontFamily'> = {},
): TypeToken {
  const [fontSize, lineHeight] = android ? and : ios;
  return {
    ...extra,
    fontFamily,
    fontSize,
    lineHeight,
    maxFontSizeMultiplier: android ? maxAndroid : maxIos,
  };
}

// Letter spacing in RN is absolute points: -1% of the size.
const tight = (size: number) => ({ letterSpacing: -0.01 * size });
const tnum: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  displayXl: tok('ArchivoSemiCondensed-ExtraBold', [48, 50], [48, 52], 1.35, 1.35, {
    ...tight(48),
    ...tnum,
  }),
  displayL: tok('ArchivoSemiCondensed-Bold', [32, 36], [32, 38], 1.5, 1.5, tight(32)),
  title: tok('Archivo-SemiBold', [22, 28], [22, 28], 2.0),
  headline: tok('Archivo-SemiBold', [17, 22], [16, 22], 3.0, 2.0),
  body: tok('Archivo-Regular', [17, 24], [16, 24], 3.0, 2.0),
  callout: tok('Archivo-Regular', [15, 20], [14, 20], 3.0, 2.0),
  label: tok('Archivo-SemiBold', [17, 22], [16, 20], 2.0),
  caption: tok('Archivo-Medium', [13, 18], [12, 16], 2.0),
  numeralL: tok('ArchivoSemiCondensed-ExtraBold', [34, 36], [34, 38], 1.35, 1.35, tnum),
  /** Top-bar tracker chip numerals: numeral style at 17 pt (DESIGN.md 4.4). */
  numeralS: tok('ArchivoSemiCondensed-ExtraBold', [17, 20], [17, 20], 1.35, 1.35, tnum),
  /** Usual 3 slot numbers: numeral.l at 22 pt (DESIGN.md 4.14). */
  numeralM: tok('ArchivoSemiCondensed-ExtraBold', [22, 26], [22, 26], 1.35, 1.35, tnum),
  micro: tok('Archivo-Medium', [11, 13], [11, 14], 1.3),
  baristaDrink: tok('Archivo-Bold', [44, 50], [44, 52], 1.5),
  baristaOption: tok('Archivo-SemiBold', [30, 38], [30, 38], 1.5),
  baristaNote: tok('Archivo-Regular', [26, 34], [26, 34], 1.5),
} as const;

export type TypeName = keyof typeof typography;
