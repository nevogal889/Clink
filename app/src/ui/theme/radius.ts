// Shape and radius. Source: docs/DESIGN.md 2.6. Each platform keeps its own shapes.
import { lookPlatform } from './look';

const android = lookPlatform() === 'android';

export const radius = {
  /** Filled and outlined buttons: 14 pt continuous (iOS), full pill (Android). */
  button: android ? 999 : 14,
  /** Chips (category, timing, To:, options): full pill (iOS), 8 dp (Android). */
  chip: android ? 8 : 999,
  /** Text fields: 12 pt continuous filled (iOS), 4 dp outlined (Android). */
  field: android ? 4 : 12,
  sheet: 28,
  dialog: 28,
  viewfinder: android ? 28 : 32,
  ticket: android ? 16 : 20,
  tile: 16,
  /** Flare panel top corners (DESIGN.md 4.4). */
  panel: 28,
  /** Progress bars. */
  bar: 4,
  /** Rim band thickness (DESIGN.md 2.6 rim tokens). */
  rimThick: 4,
  rimThin: 2,
} as const;
