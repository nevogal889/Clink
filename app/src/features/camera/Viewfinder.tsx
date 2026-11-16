// Viewfinder and shutter row (DESIGN.md 4.4). The live camera (expo-camera / the native module)
// is not wired yet, so the frame is a placeholder on every platform: dark until a feed arrives,
// which is also what a real viewfinder shows while the camera starts. The shutter takes a stand-in
// still so the photo-taken state can be reviewed.
import type { FlareCategory } from '@clink/shared';
import { t } from '@clink/shared';
import { useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Hero } from '@/ui/Art';
import { IconButton, PrimaryButton, TextButton } from '@/ui/controls';
import { motion, radius, spacing } from '@/ui/theme';
import { useReducedMotion, useTheme } from '@/ui/useTheme';

/** What a taken photo is in this build: the category the user was on, as a stand-in still. */
export interface Still {
  uri: string;
  category: FlareCategory;
}

export function Viewfinder({
  size,
  still,
  flash,
  onFlash,
}: {
  size: number;
  still: Still | null;
  flash: boolean;
  onFlash: () => void;
}) {
  const { c, cat } = useTheme();
  return (
    <View
      testID="viewfinder"
      style={{
        width: size,
        height: size,
        alignSelf: 'center',
        borderRadius: radius.viewfinder,
        borderCurve: 'continuous',
        borderWidth: radius.rimThin,
        borderColor: c.viewfinderRim,
        backgroundColor: still ? cat(still.category).tint : c.cameraIdle,
        overflow: 'hidden',
      }}
    >
      {still ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} testID="still">
          <Hero category={still.category} size={size * 0.78} />
        </View>
      ) : null}
      {!still ? (
        <View style={{ position: 'absolute', top: spacing.s3, left: spacing.s3 }}>
          <IconButton
            testID="cam-flash"
            name={flash ? 'flashOn' : 'flashOff'}
            color="#FFFFFF"
            disc={c.cameraDisc}
            accessibilityLabel={flash ? t('cam.flash.on.a11y') : t('cam.flash.off.a11y')}
            accessibilityState={{ checked: flash }}
            onPress={onFlash}
          />
        </View>
      ) : null}
    </View>
  );
}

function Shutter({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.timing(scale, { toValue: v, duration: motion.press.duration, useNativeDriver: false }).start();
  return (
    <Pressable
      testID="cam-shutter"
      accessibilityRole="button"
      accessibilityLabel={t('cam.shutter.a11y')}
      onPress={onPress}
      onPressIn={() => !reduced && to(motion.shutterScale)}
      onPressOut={() => to(1)}
    >
      <Animated.View
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          borderWidth: 4,
          borderColor: c.shutter,
          padding: 4,
          transform: [{ scale }],
        }}
      >
        <View style={{ flex: 1, borderRadius: 30, backgroundColor: c.shutter }} />
      </Animated.View>
    </Pressable>
  );
}

export function ShutterRow({
  still,
  onShutter,
  onFlip,
  onRetake,
  onShare,
  sharing,
}: {
  still: Still | null;
  onShutter: () => void;
  onFlip: () => void;
  onRetake: () => void;
  onShare: () => void;
  sharing: boolean;
}) {
  if (still) {
    return (
      <View style={{ height: spacing.shutterRow, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter, gap: spacing.s4 }}>
        <TextButton testID="snap-retake" label={t('snap.retake')} onPress={onRetake} />
        <View style={{ flex: 1 }} />
        <PrimaryButton testID="snap-share" label={t('snap.share')} busy={sharing} onPress={onShare} style={{ minWidth: 168 }} />
      </View>
    );
  }
  return (
    <View style={{ height: spacing.shutterRow, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter }}>
      {/* Left: the latest friend snap thumbnail. Hidden when there is none (no snaps in this build). */}
      <View style={{ flex: 1 }} />
      <Shutter onPress={onShutter} />
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <IconButton testID="cam-flip" name="flip" accessibilityLabel={t('cam.flip.a11y')} onPress={onFlip} />
      </View>
    </View>
  );
}
