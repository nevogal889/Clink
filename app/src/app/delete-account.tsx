// Delete account (DESIGN.md 4.20, PRD 3.19). Settings row (tap 1), this screen's button (tap 2),
// the system confirm (tap 3). If the session is older than 10 minutes, delete-account asks for a
// fresh sign-in: phone users get a code (the 4.2 code screen) and deletion runs right after it.
import { t } from '@clink/shared';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText, isApiError } from '@/lib/api';
import { confirm } from '@/lib/platform';
import { useData } from '@/lib/store';
import { ErrorLine } from '@/features/signin/AuthFrame';
import { PrimaryButton, TextButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

const POINTS = ['del.1', 'del.2', 'del.3', 'del.4'] as const;

export default function DeleteAccount() {
  const router = useRouter();
  const { state, actions } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = await confirm({
      title: t('del.confirm.title'),
      body: t('del.confirm.body'),
      yes: t('del.confirm.yes'),
      no: t('del.confirm.no'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await actions.deleteAccount();
      router.replace('/sign-in');
    } catch (e) {
      const phone = state.session?.phone;
      if (isApiError(e, 'reauth_required') && phone) {
        try {
          await actions.sendCode(phone);
          router.push({ pathname: '/code', params: { phone, mode: 'reauth' } });
        } catch (sendError) {
          setError(errorText(sendError, 'del.error'));
        }
      } else {
        setError(errorText(e, 'del.error'));
      }
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-delete">
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
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.s2,
          paddingBottom: spacing.s8,
          gap: spacing.s4,
        }}
      >
        <Txt variant="displayL" accessibilityRole="header">
          {t('del.title')}
        </Txt>
        <View style={{ gap: spacing.s3, marginTop: spacing.s2 }}>
          {POINTS.map((key) => (
            <View key={key} style={{ flexDirection: 'row', gap: spacing.s3 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  marginTop: 9,
                  backgroundColor: c.inkSecondary,
                }}
              />
              <Txt variant="body" style={{ flex: 1 }}>
                {t(key)}
              </Txt>
            </View>
          ))}
        </View>
        <ErrorLine text={error} testID="delete-error" />
      </ScrollView>
      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.s3,
          paddingBottom: insets.bottom + spacing.s4,
          gap: spacing.s1,
        }}
      >
        <PrimaryButton
          testID="delete-confirm"
          label={busy ? t('del.deleting') : t('del.cta')}
          busy={busy}
          fill={c.danger}
          ink={c.onCobalt}
          onPress={run}
        />
        <TextButton
          testID="delete-keep"
          label={t('del.keep')}
          align="center"
          onPress={() => router.back()}
          disabled={busy}
        />
      </View>
    </View>
  );
}
