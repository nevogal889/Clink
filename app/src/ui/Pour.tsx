// The pour motion (DESIGN.md 2.9): switching category, the new tint fills the container from the
// bottom up (260 ms), and the hero fades out, then back in with a 6 pt rise. Under reduced motion
// the fill becomes a 150 ms cross-fade. Interruptible; never blocks input.
import type { LogCategory } from '@clink/shared';
import { useEffect, useState, type ReactNode } from 'react';
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
  const fill = useState(() => new Animated.Value(1))[0];

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
    let done = false;
    anim.start(({ finished }) => {
      if (!finished) return;
      done = true;
      setBase(category);
    });
    return () => {
      if (!done) anim.stop();
    };
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: radius.rimThick,
            backgroundColor: next.ink,
          }}
        />
      ) : null}
      {children}
    </View>
  );
}

export function PourHero({ category, size }: { category: LogCategory; size: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(category);
  const opacity = useState(() => new Animated.Value(1))[0];
  const rise = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    // Reduced motion shows the new hero at once (render below); nothing to animate.
    if (category === shown || reduced) return;
    const out = Animated.timing(opacity, {
      toValue: 0,
      duration: motion.heroOut,
      useNativeDriver: false,
    });
    let outDone = false;
    out.start(({ finished }) => {
      if (!finished) return;
      outDone = true;
      setShown(category);
      rise.setValue(motion.heroRise);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.heroIn,
          easing: motion.base.easing,
          useNativeDriver: false,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: motion.heroIn,
          easing: motion.base.easing,
          useNativeDriver: false,
        }),
      ]).start();
    });
    // stop() stops whatever runs on the value, so only stop the fade-out while it is running;
    // otherwise it would cut off the fade-in started above.
    return () => {
      if (!outDone) out.stop();
    };
  }, [category, shown, opacity, rise, reduced]);

  return (
    <Animated.View style={reduced ? null : { opacity, transform: [{ translateY: rise }] }}>
      <Hero category={reduced ? category : shown} size={size} />
    </Animated.View>
  );
}
