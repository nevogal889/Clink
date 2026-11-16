// "Add the widget" from the camera notice and from Settings > Widgets (DESIGN.md 4.4 state "Widget
// not added", 4.17). The same guide as onboarding step 6, outside onboarding: no progress bar, and
// it closes back to where it came from once a widget is found.
import { t } from '@clink/shared';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddWidgetGuide } from '@/features/widgets/AddWidgetGuide';
import { useAddWidget } from '@/features/widgets/useAddWidget';
import { PrimaryButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function WidgetGuide() {
  const router = useRouter();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const add = useAddWidget(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/camera');
  });

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
        <AddWidgetGuide
          missing={add.missing}
          canPin={add.canPin}
          pinning={add.pinning}
          onPin={() => void add.pin()}
        />
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
          label={add.missing ? t('onb.widget.retry.again') : t('onb.widget.done')}
          busy={add.busy}
          onPress={add.check}
        />
      </View>
    </View>
  );
}
