// The pour motion (DESIGN.md 2.9): switching category, the new tint fills the container from the
// bottom up (260 ms), and the hero fades out, then back in with a 6 pt rise. Under reduced motion
// the fill becomes a 150 ms cross-fade. Interruptible; never blocks input.
import type { LogCategory } from '@clink/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';

import { Hero } from './Art';
import { motion, radius } from './theme';
import { useReducedMotion, useTheme } from './useTheme';

export function PourPanel({
  category,
  children,
  style,
  rim = true,
  testID,
}: {
  category: LogCategory;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  rim?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [base, setBase] = useState(category);
  const fill = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (category === base) return;
    fill.stopAnimation();
    fill.setValue(0);
    const anim = Animated.timing(fill, {
      toValue: 1,
      duration: reduced ? motion.reducedFade : motion.pour.duration,
      easing: motion.pour.easing,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setBase(category);
    });
    return () => anim.stop();
  }, [category, base, fill, reduced]);

  const next = theme.cat(category);
  const prev = theme.cat(base);
  const overlay = reduced
    ? { top: 0, bottom: 0, opacity: fill }
    : { bottom: 0, height: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) };

  return (
    <View testID={testID} style={[{ backgroundColor: prev.tint, overflow: 'hidden' }, style]}>
      {category !== base ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, backgroundColor: next.tint }, overlay]}
        />
      ) : null}
      {rim ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: radius.rimThick, backgroundColor: next.ink }}
        />
      ) : null}
      {children}
    </View>
  );
}

export function PourHero({ category, size }: { category: LogCategory; size: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(category);
  const opacity = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (category === shown) return;
    if (reduced) {
      setShown(category);
      return;
    }
    const out = Animated.timing(opacity, { toValue: 0, duration: motion.heroOut, useNativeDriver: false });
    out.start(({ finished }) => {
      if (!finished) return;
      setShown(category);
      rise.setValue(motion.heroRise);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: motion.heroIn, easing: motion.base.easing, useNativeDriver: false }),
        Animated.timing(rise, { toValue: 0, duration: motion.heroIn, easing: motion.base.easing, useNativeDriver: false }),
      ]).start();
    });
    return () => out.stop();
  }, [category, shown, opacity, rise, reduced]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: rise }] }}>
      <Hero category={shown} size={size} />
    </Animated.View>
  );
}
