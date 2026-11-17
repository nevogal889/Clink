// True from 1.5x text: layouts that put art beside text give the width to the text, and sticky rows
// that would grow too tall stop sticking (DESIGN.md 4.4, 4.14 "Large text").
import { useWindowDimensions } from 'react-native';

import { reviewTextScale } from './theme/look';

export const LARGE_TEXT_SCALE = 1.5;

export function useLargeText(): boolean {
  const { fontScale } = useWindowDimensions();
  return Math.max(fontScale, reviewTextScale()) >= LARGE_TEXT_SCALE;
}
