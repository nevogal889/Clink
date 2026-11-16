// Avatar: a photo, or the initial on surface.sunk. People get no colour coding (DESIGN.md 2.3).
import { Image } from 'expo-image';
import { View } from 'react-native';

import { Txt } from './Txt';
import { useTheme } from './useTheme';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ? Array.from(parts[0])[0] : '';
  const last = parts.length > 1 && parts[parts.length - 1] ? Array.from(parts[parts.length - 1] as string)[0] : '';
  return `${first ?? ''}${last ?? ''}`.toLocaleUpperCase();
}

export function Avatar({ name, photoUri, size }: { name: string; photoUri?: string | null; size: number }) {
  const { c } = useTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.surfaceSunk,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Txt
          variant={size >= 72 ? 'displayL' : 'headline'}
          style={size >= 72 ? { fontSize: size * 0.38, lineHeight: size * 0.44 } : { fontSize: size * 0.4, lineHeight: size * 0.5 }}
          importantForAccessibility="no"
        >
          {initials(name)}
        </Txt>
      )}
    </View>
  );
}
