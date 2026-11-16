// "I added it" and "Add it for me" for the add-widget guide (PRD F8, COPY.md 4.3 step 6), shared
// by onboarding step 6 and the guide the camera notice opens. "Add it for me" asks the launcher
// to place the medium widget (Android 8+, where the launcher supports it); the launcher's own
// dialog confirms, so the app then watches for the widget for up to a minute and moves on by
// itself. Where pinning isn't supported the button goes away and the written steps stay.
import { useEffect, useRef, useState } from 'react';

import { useData } from '@/lib/store';
import { lookPlatform } from '@/ui/theme/look';

const WATCH_MS = 60_000;
const WATCH_EVERY_MS = 1_000;

export function useAddWidget(onAdded: () => void | Promise<void>) {
  const { state, actions } = useData();
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinOk, setPinOk] = useState(true);
  const [pinning, setPinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function added() {
    if (done.current) return;
    done.current = true;
    if (timer.current) clearTimeout(timer.current);
    await onAdded();
  }

  /** "I added it": looks for a widget; without one the guide says so (DESIGN.md 4.3). */
  async function check() {
    setBusy(true);
    try {
      const found = await actions.checkWidgets();
      if (found.length > 0) await added();
      else setMissing(true);
    } finally {
      setBusy(false);
    }
  }

  /** "Add it for me". */
  async function pin() {
    setPinning(true);
    const shown = await actions.pinWidget('medium');
    if (!shown) {
      setPinOk(false);
      setPinning(false);
      return;
    }
    const until = Date.now() + WATCH_MS;
    const watch = async () => {
      const found = await actions.checkWidgets();
      if (found.length > 0) {
        setPinning(false);
        await added();
      } else if (Date.now() < until) {
        timer.current = setTimeout(() => void watch(), WATCH_EVERY_MS);
      } else {
        setPinning(false);
      }
    };
    timer.current = setTimeout(() => void watch(), WATCH_EVERY_MS);
  }

  return {
    missing,
    busy,
    check,
    /** Android with a widget to pin, until the launcher says it can't. */
    canPin: state.widgets.supported && lookPlatform() === 'android' && pinOk,
    pinning,
    pin,
  };
}
