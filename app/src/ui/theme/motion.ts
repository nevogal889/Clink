// Durations and easing. Source: docs/DESIGN.md 2.9.
import { Easing } from 'react-native';

const standard = Easing.bezier(0.3, 0, 0.2, 1);

export const motion = {
  press: { duration: 90, scale: 0.97, easing: Easing.out(Easing.quad) },
  quick: { duration: 140, easing: Easing.out(Easing.quad) },
  base: { duration: 220, easing: standard },
  /** Category switch: the new tint fills the panel from the bottom. */
  pour: { duration: 260, easing: standard },
  /** Pour's hero: out 120 ms, in 160 ms with a 6 pt rise. */
  heroOut: 120,
  heroIn: 160,
  heroRise: 6,
  /** Reduced motion: pour becomes a 150 ms cross-fade. */
  reducedFade: 150,
  /** Shutter press scale. */
  shutterScale: 0.92,
} as const;
