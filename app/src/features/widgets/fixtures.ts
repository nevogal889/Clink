// The QA widget fixtures W1 to W22 (packages/shared/fixtures/widget-states, QA_PLAN.md 4.1) for the
// dev-only "Widget states" screen. Each fixture is pinned to a moment (`now`); shiftFixture moves
// every timestamp in its state by the same amount so it lands on the real clock, and sets today's
// date to the device's, so countdowns, "last drink" and snaps show as the fixture means them.
import { widgetStateSchema, type WidgetState } from '@clink/shared';

import w01 from '@clink/shared/fixtures/widget-states/W01-signed-out.json';
import w02 from '@clink/shared/fixtures/widget-states/W02-setup.json';
import w03 from '@clink/shared/fixtures/widget-states/W03-idle-snap.json';
import w04 from '@clink/shared/fixtures/widget-states/W04-idle-no-snap.json';
import w05 from '@clink/shared/fixtures/widget-states/W05-idle-no-friends.json';
import w06 from '@clink/shared/fixtures/widget-states/W06-idle-no-usual.json';
import w07 from '@clink/shared/fixtures/widget-states/W07-idle-caffeine-note.json';
import w08 from '@clink/shared/fixtures/widget-states/W08-picker.json';
import w09 from '@clink/shared/fixtures/widget-states/W09-my-flare-no-replies.json';
import w10 from '@clink/shared/fixtures/widget-states/W10-my-flare-replies.json';
import w11 from '@clink/shared/fixtures/widget-states/W11-incoming.json';
import w12 from '@clink/shared/fixtures/widget-states/W12-incoming-photo.json';
import w13 from '@clink/shared/fixtures/widget-states/W13-incoming-more.json';
import w14 from '@clink/shared/fixtures/widget-states/W14-bring-picker.json';
import w15 from '@clink/shared/fixtures/widget-states/W15-replied-in.json';
import w16 from '@clink/shared/fixtures/widget-states/W16-replied-bring.json';
import w17 from '@clink/shared/fixtures/widget-states/W17-confirmation.json';
import w18 from '@clink/shared/fixtures/widget-states/W18-sending.json';
import w19 from '@clink/shared/fixtures/widget-states/W19-failed.json';
import w20 from '@clink/shared/fixtures/widget-states/W20-ended-tapped.json';
import w21 from '@clink/shared/fixtures/widget-states/W21-audience-empty.json';
import w22 from '@clink/shared/fixtures/widget-states/W22-done-flare.json';

import { deviceDate, isoSeconds } from '@/lib/widget/state';

export interface WidgetFixture {
  id: string;
  /** QA's description of the state. Test data, not user copy. */
  title: string;
  now: string;
  config: { audience: string };
  state: unknown;
  local: unknown;
}

export const WIDGET_FIXTURES: readonly WidgetFixture[] = [
  w01,
  w02,
  w03,
  w04,
  w05,
  w06,
  w07,
  w08,
  w09,
  w10,
  w11,
  w12,
  w13,
  w14,
  w15,
  w16,
  w17,
  w18,
  w19,
  w20,
  w21,
  w22,
] as readonly WidgetFixture[];

/**
 * True when part of the fixture lives on the widget itself (an open picker, a confirmation, an
 * outbox entry, a per-widget audience). The app can't set those; a tap on the widget shows them.
 */
export function needsWidgetTap(f: WidgetFixture): boolean {
  const st = f.state as { outbox?: unknown[] };
  return f.local !== null || (st.outbox?.length ?? 0) > 0 || f.config.audience !== 'auto';
}

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function shiftValue(v: unknown, deltaMs: number): unknown {
  if (typeof v === 'string' && ISO_Z.test(v)) return isoSeconds(new Date(Date.parse(v) + deltaMs));
  if (Array.isArray(v)) return v.map((x) => shiftValue(x, deltaMs));
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shiftValue(x, deltaMs)]),
    );
  }
  return v;
}

/** The fixture's state moved to `now`, checked with the shared schema. Null if it fails. */
export function shiftFixture(f: WidgetFixture, now: Date): WidgetState | null {
  const deltaMs = Math.round((now.getTime() - Date.parse(f.now)) / 1000) * 1000;
  const shifted = shiftValue(f.state, deltaMs) as { today?: { localDate: string } };
  if (shifted.today) shifted.today = { ...shifted.today, localDate: deviceDate(now) };
  const parsed = widgetStateSchema.safeParse(shifted);
  return parsed.success ? parsed.data : null;
}
