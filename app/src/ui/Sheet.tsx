// Bottom sheet. Small, medium and large heights stand in for the iOS detents and the M3 modal
// bottom sheet (DESIGN.md 4 "Structure"). Closing any way (scrim, back, swipe) calls onClose,
// and editors save on close (DESIGN.md 8 rule 8). This is the one place to swap in native
// detent sheets on device builds.
import { t } from '@clink/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SnackbarHost } from './Snackbar';
import { motion, radius, spacing } from './theme';
import { Txt } from './Txt';
import { useReducedMotion, useTheme } from './useTheme';

export type Detent = 'small' | 'medium' | 'large';

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  detent = 'medium',
  header,
  footer,
  children,
  testID,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  detent?: Detent;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
  scroll?: boolean;
}) {
  const theme = useTheme();
  const { c } = theme;
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    rise.setValue(reduced ? 1 : 0);
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.base.duration,
      easing: motion.base.easing,
      useNativeDriver: false,
    }).start();
  }, [visible, reduced, rise]);

  const max = detent === 'large' ? height * 0.92 : detent === 'medium' ? height * 0.68 : height * 0.5;
  const body = (
    <View style={{ paddingHorizontal: spacing.gutter, paddingBottom: spacing.s4 }}>
      {title ? (
        <View style={{ paddingTop: spacing.s2, paddingBottom: spacing.s4 }}>
          <Txt variant="title" accessibilityRole="header">
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }} testID={testID}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrimModal }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.w.close')}
          testID={testID ? `${testID}-scrim` : undefined}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              maxHeight: max,
              height: detent === 'large' ? max : undefined,
              backgroundColor: c.surfaceRaised,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              borderCurve: 'continuous',
              paddingBottom: insets.bottom,
              overflow: 'hidden',
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
              opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
            },
            theme.floating,
          ]}
        >
          <View style={{ alignItems: 'center', paddingTop: spacing.s2, paddingBottom: spacing.s2 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.lineHairline }} />
          </View>
          {header}
          {scroll ? (
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {body}
            </ScrollView>
          ) : (
            <View style={{ flexShrink: 1 }}>{body}</View>
          )}
          {footer ? (
            <View
              style={{
                paddingHorizontal: spacing.gutter,
                paddingTop: spacing.s2,
                paddingBottom: spacing.s4,
                borderTopWidth: 1,
                borderTopColor: c.lineHairline,
              }}
            >
              {footer}
            </View>
          ) : null}
          <SnackbarHost />
        </Animated.View>
      </View>
    </Modal>
  );
}
