// "Widget states" (ARCHITECTURE.md 13 M2): dev builds only. Each row sends one QA fixture (W1 to
// W22) to every Clink widget on the phone through setWidgetState, moved to the real clock, so the
// widget can be checked state by state on a device or emulator. "Back to my data" pushes this
// account's real state again. A store build has no route here: it goes back to Settings.
import { t } from '@clink/shared';
import { Redirect, Stack, useIsFocused } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDevVariant } from '@/lib/config';
import { useData } from '@/lib/store';
import { needsWidgetTap, shiftFixture, WIDGET_FIXTURES } from '@/features/widgets/fixtures';
import { PrimaryButton, Press } from '@/ui/controls';
import { useSnackbar, useSnackbarInset } from '@/ui/Snackbar';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function WidgetStates() {
  if (!isDevVariant()) return <Redirect href="/settings" />;
  return <WidgetStatesScreen />;
}

function WidgetStatesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const snack = useSnackbar();
  // Snackbars sit above the bottom button.
  useSnackbarInset(insets.bottom + spacing.primaryButton + spacing.s3 + spacing.s4, useIsFocused());
  const { state, actions, widgetHost } = useData();
  const supported = state.widgets.supported;
  const none = supported && (state.widgets.installed?.length ?? 0) === 0;

  async function send(index: number) {
    const f = WIDGET_FIXTURES[index]!;
    const shifted = shiftFixture(f, new Date());
    try {
      if (!shifted) throw new Error('fixture');
      await widgetHost.setWidgetState(shifted);
      await widgetHost.reloadWidgets();
      snack.show({ text: t('dev.ws.sent', { id: f.id }) });
    } catch {
      snack.show({ text: t('dev.ws.refused', { id: f.id }) });
    }
  }

  async function backToMine() {
    await actions.refreshWidget();
    snack.show({ text: t('dev.ws.live_done') });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-widget-states">
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
            {t('dev.ws.title')}
          </Txt>
          <Txt variant="body" tone="secondary" style={{ marginTop: spacing.s2 }}>
            {t('dev.ws.sub')}
          </Txt>
          {!supported || none ? (
            <Txt
              testID="ws-status"
              variant="callout"
              color={c.cobalt}
              style={{ marginTop: spacing.s3 }}
            >
              {supported ? t('dev.ws.none') : t('dev.ws.unsupported')}
            </Txt>
          ) : null}
        </View>
        <View
          style={{
            marginTop: spacing.s6,
            borderTopWidth: 1,
            borderTopColor: c.lineHairline,
          }}
        >
          {WIDGET_FIXTURES.map((f, i) => {
            const tap = needsWidgetTap(f);
            return (
              <Press
                key={f.id}
                testID={`ws-${f.id}`}
                scaleTo={0.99}
                disabled={!supported}
                onPress={() => void send(i)}
                accessibilityLabel={`${f.id}. ${f.title}${tap ? `. ${t('dev.ws.needs_tap')}` : ''}`}
                style={{
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: spacing.s3,
                  paddingHorizontal: spacing.gutter,
                  paddingVertical: spacing.s3,
                  borderBottomWidth: 1,
                  borderBottomColor: c.lineHairline,
                }}
              >
                <Txt variant="numeralS" color={c.cobalt} style={{ width: 40 }}>
                  {f.id}
                </Txt>
                <View style={{ flex: 1 }}>
                  <Txt variant="callout">{f.title}</Txt>
                  {tap ? (
                    <Txt variant="caption" tone="secondary">
                      {t('dev.ws.needs_tap')}
                    </Txt>
                  ) : null}
                </View>
              </Press>
            );
          })}
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
          testID="ws-live"
          label={t('dev.ws.live')}
          disabled={!supported}
          onPress={() => void backToMine()}
        />
      </View>
    </View>
  );
}
