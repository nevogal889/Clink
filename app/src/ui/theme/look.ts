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
