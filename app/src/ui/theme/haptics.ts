// Haptic events. Source: docs/DESIGN.md 2.10. Playback goes through the clink-native module
// (app/src/lib/haptics.ts); this table is what each event means on each platform.
export const haptics = {
  shutter: { ios: 'impact.medium', android: 'VIRTUAL_KEY', androidLegacy: 'VIRTUAL_KEY' },
  flareSent: {
    ios: 'impact.rigid 1.0, impact.rigid 0.6 after 70 ms',
    android: 'PRIMITIVE_CLICK 1.0, PRIMITIVE_CLICK 0.6 after 70 ms, else CONFIRM',
    androidLegacy: 'EFFECT_DOUBLE_CLICK on API 29, none on 26 to 28',
  },
  replyArrived: { ios: 'notification.success', android: 'CONFIRM', androidLegacy: 'VIRTUAL_KEY' },
  replySent: { ios: 'notification.success', android: 'CONFIRM', androidLegacy: 'VIRTUAL_KEY' },
  logged: { ios: 'impact.light', android: 'KEYBOARD_TAP', androidLegacy: 'KEYBOARD_TAP' },
  selection: {
    ios: 'selection',
    android: 'CLOCK_TICK (SEGMENT_TICK on API 34+)',
    androidLegacy: 'CLOCK_TICK',
  },
  undo: { ios: 'impact.soft', android: 'CLOCK_TICK', androidLegacy: 'CLOCK_TICK' },
  error: { ios: 'notification.error', android: 'REJECT', androidLegacy: 'none' },
  inviteMeterFull: { ios: 'same as flareSent', android: 'same', androidLegacy: 'same' },
  levelUp: { ios: 'notification.success', android: 'CONFIRM', androidLegacy: 'VIRTUAL_KEY' },
} as const;

export type HapticEvent = keyof typeof haptics;
