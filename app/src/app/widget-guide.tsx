// "Add the widget" from the camera notice (DESIGN.md 4.4 state "Widget not added"). The same guide
// as onboarding step 6, outside onboarding: no progress bar, and it closes back to the camera.
import { t } from '@clink/shared';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/lib/store';
import { WidgetSteps } from '@/features/onboarding/WidgetSteps';
import { PrimaryButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function WidgetGuide() {
  const router = useRouter();
  const { api } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      if (await api.isWidgetInstalled()) router.back();
      else setMissing(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-widget-guide">
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.surfaceBase },
          headerTintColor: c.inkPrimary,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s8 }}>
        <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.s2 }}>
          <Txt variant="displayL" accessibilityRole="header">
            {t('onb.widget.title')}
          </Txt>
          <Txt variant="body" tone="secondary" style={{ marginTop: spacing.s2 }}>
            {t('onb.widget.sub')}
          </Txt>
        </View>
        {missing ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              marginHorizontal: spacing.gutter,
              marginTop: spacing.s6,
              paddingLeft: spacing.s3,
              borderLeftWidth: 4,
              borderLeftColor: c.cobalt,
            }}
          >
            <Txt variant="headline">{t('onb.widget.retry.title')}</Txt>
            <Txt variant="callout" tone="secondary">
              {t('onb.widget.retry.body')}
            </Txt>
          </View>
        ) : null}
        <View style={{ marginTop: spacing.s6 }}>
          <WidgetSteps />
        </View>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.s3,
          paddingBottom: insets.bottom + spacing.s4,
          borderTopWidth: 1,
          borderTopColor: c.lineHairline,
        }}
      >
        <PrimaryButton
          testID="guide-done"
          label={missing ? t('onb.widget.retry.again') : t('onb.widget.done')}
          busy={busy}
          onPress={check}
        />
      </View>
    </View>
  );
}
