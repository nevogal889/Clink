// Sign-in provider buttons. On device builds these are the providers' own components
// (expo-apple-authentication's AppleAuthenticationButton, Google's branded button) per their
// brand rules (DESIGN.md 4.1). The web review build draws a stand-in with the same colours and
// words, without the providers' logos.
import { ActivityIndicator } from 'react-native';

import { Press } from '@/ui/controls';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export type Provider = 'apple' | 'google' | 'phone';

export function ProviderButton({
  provider,
  label,
  onPress,
  busy,
  disabled,
  testID,
}: {
  provider: Provider;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { c, mode } = useTheme();
  // Apple: black in light mode, white in dark. Google: its light and dark neutral buttons.
  const look =
    provider === 'apple'
      ? mode === 'dark'
        ? { bg: '#FFFFFF', fg: '#000000', border: '#FFFFFF' }
        : { bg: '#000000', fg: '#FFFFFF', border: '#000000' }
      : provider === 'google'
        ? mode === 'dark'
          ? { bg: '#131314', fg: '#E3E3E3', border: '#8E918F' }
          : { bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' }
        : { bg: 'transparent', fg: c.inkPrimary, border: c.lineControl };
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={{
        minHeight: spacing.primaryButton,
        borderRadius: provider === 'phone' ? radius.button : provider === 'google' ? 999 : 12,
        borderCurve: 'continuous',
        borderWidth: provider === 'phone' ? 1.5 : 1,
        borderColor: look.border,
        backgroundColor: look.bg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.s2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? <ActivityIndicator color={look.fg} /> : null}
      <Txt variant="label" color={look.fg}>
        {label}
      </Txt>
    </Press>
  );
}
