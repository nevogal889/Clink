// Frame for the sign-in screens that come before the account exists (DESIGN.md 4.1b, 4.2): title
// in display.l, a callout line, content, and the bottom action area in thumb reach. The system
// back button comes from the stack header.
import { Stack, useIsFocused } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbarInset } from '@/ui/Snackbar';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function AuthFrame({
  title,
  sub,
  children,
  actions,
  testID,
  back = true,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  actions?: ReactNode;
  testID?: string;
  /** Show the stack header with its back button. */
  back?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [actionsHeight, setActionsHeight] = useState(0);
  useSnackbarInset(actionsHeight, useIsFocused());
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.surfaceBase }}
      testID={testID}
    >
      <Stack.Screen
        options={{
          headerShown: back,
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.surfaceBase },
          headerTintColor: c.inkPrimary,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: back ? spacing.s2 : insets.top + spacing.s8,
          paddingBottom: spacing.s8,
          paddingHorizontal: spacing.gutter,
        }}
      >
        <Txt variant="displayL" accessibilityRole="header">
          {title}
        </Txt>
        {sub ? (
          <Txt variant="callout" tone="secondary" style={{ marginTop: spacing.s2, maxWidth: 520 }}>
            {sub}
          </Txt>
        ) : null}
        <View style={{ marginTop: spacing.s8, gap: spacing.s4 }}>{children}</View>
      </ScrollView>
      {actions ? (
        <View
          onLayout={(e) => setActionsHeight(Math.round(e.nativeEvent.layout.height))}
          style={{
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.s3,
            paddingBottom: insets.bottom + spacing.s4,
            gap: spacing.s1,
            backgroundColor: c.surfaceBase,
          }}
        >
          {actions}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** One danger caption under a field, announced politely. */
export function ErrorLine({ text, testID }: { text: string | null; testID?: string }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <Txt variant="callout" color={c.danger} accessibilityLiveRegion="polite" testID={testID}>
      {text}
    </Txt>
  );
}
