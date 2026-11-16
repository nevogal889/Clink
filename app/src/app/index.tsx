// Entry: sends the user where they belong. A refused age check stays on its screen for 24 hours.
// Signed out goes to sign-in; a signed-in identity with no account yet goes to the age check; an
// unfinished setup resumes on its step (PRD 3.2 rule 7); everyone else lands on the camera.
// With nothing cached and the server unreachable it shows the full-screen retry (DESIGN.md 4.21).
import { t } from '@clink/shared';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/lib/store';
import { routeFor } from '@/features/onboarding/steps';
import { Wordmark } from '@/ui/Art';
import { PrimaryButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function Index() {
  const { state } = useData();
  const { c } = useTheme();
  if (!state.ready)
    return <View testID="booting" style={{ flex: 1, backgroundColor: c.surfaceBase }} />;
  if (state.ageRefusedUntil !== null) return <Redirect href="/age" />;
  if (state.loadError === 'full') return <LoadFailed />;
  if (!state.session || !state.me) return <Redirect href="/sign-in" />;
  if (state.me.needsSignup) return <Redirect href="/age" />;
  return <Redirect href={routeFor(state.me.onboarding)} />;
}

function LoadFailed() {
  const { actions } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <View
      testID="screen-load-failed"
      style={{
        flex: 1,
        backgroundColor: c.surfaceBase,
        paddingTop: insets.top + spacing.s8,
        paddingBottom: insets.bottom + spacing.s4,
        paddingHorizontal: spacing.gutter,
      }}
    >
      <Wordmark width={84} />
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.s2 }}>
        <Txt variant="displayL" accessibilityRole="header">
          {t('err.load_full.title')}
        </Txt>
        <Txt variant="body" tone="secondary">
          {t('err.load_full.body')}
        </Txt>
      </View>
      <PrimaryButton
        testID="load-retry"
        label={t('err.load_full.cta')}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await actions.retryLoad();
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
