// Undo snackbar (DESIGN.md 4 "Shared pieces"): inverse surface, bottom of the screen, 5 s, or 10 s
// while a screen reader runs, announced, with the action reachable before it times out.
import { TIMERS, t } from '@clink/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { radius, spacing } from './theme';
import { Txt } from './Txt';
import { useTheme } from './useTheme';

export interface SnackbarSpec {
  text: string;
  /** Undo by default; the label comes from snack.undo. */
  onAction?: () => void;
}

interface Ctx {
  current: (SnackbarSpec & { id: number }) | null;
  show: (spec: SnackbarSpec) => void;
  dismiss: () => void;
}

const SnackbarContext = createContext<Ctx>({ current: null, show: () => undefined, dismiss: () => undefined });

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Ctx['current']>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const readerOn = useRef(false);

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
    setCurrent({ ...spec, id: seq.current });
    AccessibilityInfo.announceForAccessibility?.(spec.text);
    const secs = readerOn.current ? TIMERS.undoSnackbarScreenReaderSec : TIMERS.undoSnackbarSec;
    timer.current = setTimeout(() => setCurrent(null), secs * 1000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ current, show, dismiss }), [current, show, dismiss]);
  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>;
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

export function SnackbarHost({ bottom = spacing.s4 }: { bottom?: number }) {
  const { current, dismiss } = useSnackbar();
  const theme = useTheme();
  if (!current) return null;
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
        <Txt variant="callout" color={theme.c.inverseInk} style={{ flex: 1, paddingVertical: spacing.s3 }}>
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
            style={{ minHeight: 44, minWidth: 64, paddingHorizontal: spacing.s3, alignItems: 'center', justifyContent: 'center' }}
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
