// Sign in, onboarding step 1 (DESIGN.md 4.1, PRD 3.1). One tap plus the provider's sheet.
import { t } from '@clink/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AuthMethod } from '@/lib/api';
import { legalUrl } from '@/lib/config';
import { useData } from '@/lib/store';
import { ProviderButton } from '@/features/signin/ProviderButton';
import { Shelf } from '@/features/signin/Shelf';
import { Wordmark } from '@/ui/Art';
import { TextButton } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { spacing, typography } from '@/ui/theme';
import { lookPlatform } from '@/ui/theme/look';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function SignIn() {
  const router = useRouter();
  const { actions } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState<AuthMethod | null>(null);
  const [error, setError] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const android = lookPlatform() === 'android';

  const primary: AuthMethod = android ? 'google' : 'apple';
  const other: AuthMethod = android ? 'apple' : 'google';

  async function go(method: AuthMethod) {
    setError(false);
    setBusy(method);
    setOtherOpen(false);
    try {
      await actions.signIn(method);
      router.replace('/');
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + spacing.s8,
        paddingBottom: insets.bottom + spacing.s4,
      }}
      style={{ backgroundColor: c.surfaceBase }}
      testID="screen-sign-in"
    >
      <View style={{ paddingHorizontal: spacing.gutter }}>
        <Wordmark width={84} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing.s6 }}>
        <Shelf height={Math.max(180, Math.min(height * 0.3, 300))} />
        <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s6 }}>
          <Txt variant="displayL" accessibilityRole="header" style={{ maxWidth: 320 }}>
            {t('splash.tagline')}
          </Txt>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.gutter, gap: spacing.s3 }}>
        <ProviderButton
          testID="signin-primary"
          provider={primary}
          label={android ? t('signin.google') : t('signin.apple')}
          busy={busy === primary}
          disabled={busy !== null && busy !== primary}
          onPress={() => go(primary)}
        />
        <ProviderButton
          testID="signin-phone"
          provider="phone"
          label={t('signin.phone')}
          busy={busy === 'phone'}
          disabled={busy !== null && busy !== 'phone'}
          onPress={() => go('phone')}
        />
        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s3,
              flexWrap: 'wrap',
            }}
          >
            <Txt variant="callout" color={c.danger} accessibilityLiveRegion="polite">
              {t('err.signin_failed')}
            </Txt>
          </View>
        ) : null}
        <TextButton
          testID="signin-other"
          small
          label={t('signin.other')}
          onPress={() => setOtherOpen(true)}
        />
        <LegalLine />
      </View>

      <Sheet
        visible={otherOpen}
        onClose={() => setOtherOpen(false)}
        detent="small"
        testID="sheet-other"
      >
        <View style={{ paddingTop: spacing.s2, paddingBottom: spacing.s4 }}>
          <ProviderButton
            testID="signin-other-provider"
            provider={other}
            label={android ? t('signin.apple_other') : t('signin.google_other')}
            busy={busy === other}
            onPress={() => go(other)}
          />
        </View>
      </Sheet>
    </ScrollView>
  );
}

/** signin.legal with "Terms" and "Privacy Policy" tappable inside the sentence. */
function LegalLine() {
  const { c } = useTheme();
  const text = t('signin.legal');
  const links = [
    { word: t('set.h.terms'), url: legalUrl('terms') },
    { word: t('set.h.policy'), url: legalUrl('privacy') },
  ];
  const parts: { text: string; url?: string | null }[] = [];
  let rest = text;
  for (const l of links) {
    const at = rest.indexOf(l.word);
    if (at < 0) continue;
    parts.push({ text: rest.slice(0, at) });
    parts.push({ text: l.word, url: l.url });
    rest = rest.slice(at + l.word.length);
  }
  parts.push({ text: rest });
  const cap = typography.caption;
  return (
    <Text
      maxFontSizeMultiplier={cap.maxFontSizeMultiplier}
      style={{
        fontFamily: cap.fontFamily,
        fontSize: cap.fontSize,
        lineHeight: cap.lineHeight,
        color: c.inkSecondary,
      }}
    >
      {parts.map((p, i) =>
        p.url !== undefined ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => (p.url ? Linking.openURL(p.url) : undefined)}
            style={{ color: c.cobalt, textDecorationLine: 'underline' }}
          >
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}
