// Undo snackbar (DESIGN.md 4 "Shared pieces"): inverse surface, bottom of the screen, 5 s, or 10 s
// while a screen reader runs, announced, with the action reachable before it times out.
import { TIMERS, t } from '@clink/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { radius, spacing } from './theme';
import { Txt } from './Txt';
import { useTheme } from './useTheme';

export interface SnackbarSpec {
  text: string;
  /** Undo by default; the label comes from snack.undo. */
  onAction?: () => void;
}

/**
 * Who owns a snackbar: the layer on top when it was raised. A layer is the focused route
 * ("screen:/onboarding/usual") or an open sheet. A snackbar shows only while its owner is on
 * top, so it never follows the user to another route or onto a sheet raised after it, and it
 * is dropped as soon as its owner leaves the top (route change, sheet opened or closed).
 */
interface Current extends SnackbarSpec {
  id: number;
  owner: string;
}

interface Ctx {
  current: Current | null;
  show: (spec: SnackbarSpec) => void;
  dismiss: () => void;
  /** Height of the focused screen's bottom action area; the root snackbar sits above it. */
  inset: number;
  setInset: (px: number) => void;
  /** The layer on top right now. */
  top: string;
  /** The focused route's layer, which the root host draws for. */
  screenLayer: string;
  pushLayer: (id: string) => void;
  popLayer: (id: string) => void;
}

const SnackbarContext = createContext<Ctx>({
  current: null,
  show: () => undefined,
  dismiss: () => undefined,
  inset: 0,
  setInset: () => undefined,
  top: 'screen:',
  screenLayer: 'screen:',
  pushLayer: () => undefined,
  popLayer: () => undefined,
});

export function SnackbarProvider({
  children,
  routeKey = '',
}: {
  children: ReactNode;
  /** The focused route (usePathname()). A change dismisses the snackbar. */
  routeKey?: string;
}) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [inset, setInset] = useState(0);
  const [layers, setLayers] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const readerOn = useRef(false);
  const screenLayer = `screen:${routeKey}`;
  // show() reads the top layer from refs, so a snackbar raised right after a sheet closes (the
  // tracker's "Something else" picker) belongs to whatever is on top at that moment.
  const layersRef = useRef<string[]>([]);
  const screenRef = useRef(screenLayer);
  useLayoutEffect(() => {
    screenRef.current = screenLayer;
  }, [screenLayer]);
  const top = layers.at(-1) ?? screenLayer;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => (readerOn.current = v))
      .catch(() => undefined);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const show = useCallback((spec: SnackbarSpec) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    const owner = layersRef.current.at(-1) ?? screenRef.current;
    setCurrent({ ...spec, id: seq.current, owner });
    AccessibilityInfo.announceForAccessibility?.(spec.text);
    const secs = readerOn.current ? TIMERS.undoSnackbarScreenReaderSec : TIMERS.undoSnackbarSec;
    timer.current = setTimeout(() => setCurrent(null), secs * 1000);
  }, []);

  const pushLayer = useCallback((id: string) => {
    layersRef.current = [...layersRef.current.filter((l) => l !== id), id];
    setLayers(layersRef.current);
  }, []);

  const popLayer = useCallback((id: string) => {
    layersRef.current = layersRef.current.filter((l) => l !== id);
    setLayers(layersRef.current);
  }, []);

  // The owner left the top: navigation, or a sheet opened over it or closed under it. Adjusted
  // during render, so a stale snackbar never paints for a frame on the new top.
  const [seenTop, setSeenTop] = useState(top);
  if (seenTop !== top) {
    setSeenTop(top);
    if (current && current.owner !== top) setCurrent(null);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({
      current,
      show,
      dismiss,
      inset,
      setInset,
      top,
      screenLayer,
      pushLayer,
      popLayer,
    }),
    [current, show, dismiss, inset, top, screenLayer, pushLayer, popLayer],
  );
  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>;
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

/**
 * Makes a sheet its own snackbar layer while it is open. Layout effect, so the layer is on the
 * stack (or off it) before any snackbar the same tap raises.
 */
export function useSnackbarLayer(id: string, open: boolean) {
  const { pushLayer, popLayer } = useSnackbar();
  useLayoutEffect(() => {
    if (!open) return;
    pushLayer(id);
    return () => popLayer(id);
  }, [id, open, pushLayer, popLayer]);
}

/**
 * Keeps the root snackbar above a screen's bottom action area while that screen is focused, so
 * Undo never covers Continue or Who joins? (DESIGN.md 8 rule 9).
 */
export function useSnackbarInset(px: number, focused: boolean) {
  const { setInset } = useSnackbar();
  useEffect(() => {
    if (!focused) return;
    setInset(px);
    return () => setInset(0);
  }, [px, focused, setInset]);
}

export function SnackbarHost({
  bottom: base = spacing.s4,
  followInset = false,
  layer,
}: {
  bottom?: number;
  followInset?: boolean;
  /** The sheet this host draws for; the root host (no layer) draws for the focused route. */
  layer?: string;
}) {
  const { current, dismiss, inset, screenLayer } = useSnackbar();
  const bottom = followInset && inset > 0 ? inset + spacing.s2 : base;
  const theme = useTheme();
  if (!current || current.owner !== (layer ?? screenLayer)) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: spacing.gutter, right: spacing.gutter, bottom }}
    >
      <View
        accessibilityLiveRegion="polite"
        testID="snackbar"
        style={[
          {
            minHeight: 48,
            borderRadius: radius.field,
            borderCurve: 'continuous',
            backgroundColor: theme.c.inverseSurface,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: spacing.s4,
            paddingRight: spacing.s1,
          },
          theme.mode === 'light' ? theme.floating : null,
        ]}
      >
        <Txt
          variant="callout"
          color={theme.c.inverseInk}
          style={{ flex: 1, paddingVertical: spacing.s3 }}
        >
          {current.text}
        </Txt>
        {current.onAction ? (
          <Pressable
            testID="snackbar-undo"
            accessibilityRole="button"
            accessibilityLabel={t('snack.undo')}
            onPress={() => {
              current.onAction?.();
              dismiss();
            }}
            style={{
              minHeight: 44,
              minWidth: 64,
              paddingHorizontal: spacing.s3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt variant="label" color={theme.c.inverseAction}>
              {t('snack.undo')}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
