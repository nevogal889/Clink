// Common frame for onboarding steps 2 to 6 (DESIGN.md 4.3): 6-segment progress, title in
// display.l, one body line, content, and the bottom action area in thumb reach.
import { t } from '@clink/shared';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function Progress({ step }: { step: number }) {
  const { c } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('onb.progress', { n: step })}
      accessibilityValue={{ min: 1, max: 6, now: step }}
      style={{ flexDirection: 'row', gap: 4 }}
      testID="onb-progress"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.cobalt : c.lineHairline }}
        />
      ))}
    </View>
  );
}

export function OnboardingFrame({
  step,
  title,
  sub,
  children,
  actions,
  testID,
  stickyHeaderIndices,
  scrollRef,
}: {
  step: number;
  title: string;
  sub?: string;
  children: ReactNode;
  actions: ReactNode;
  testID?: string;
  stickyHeaderIndices?: number[];
  scrollRef?: RefObject<ScrollViewInstance | null>;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.surfaceBase }}
      testID={testID}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={stickyHeaderIndices}
        contentContainerStyle={{ paddingBottom: spacing.s8 }}
      >
        <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.s2 }}>
          <Progress step={step} />
          <Txt variant="displayL" accessibilityRole="header" style={{ marginTop: spacing.s6 }}>
            {title}
          </Txt>
          {sub ? (
            <Txt variant="body" tone="secondary" style={{ marginTop: spacing.s2, maxWidth: 520 }}>
              {sub}
            </Txt>
          ) : null}
        </View>
        {children}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.s3,
          paddingBottom: insets.bottom + spacing.s4,
          gap: spacing.s1,
          borderTopWidth: 1,
          borderTopColor: c.lineHairline,
          backgroundColor: c.surfaceBase,
        }}
      >
        {actions}
      </View>
    </KeyboardAvoidingView>
  );
}
