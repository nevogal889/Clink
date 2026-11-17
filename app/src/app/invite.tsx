// The invite screen (PRD 3.15 rule 9, F5 and F15 "no friends → invite screen"): where the widget's
// Invite friends button lands, through `<scheme>:///invite` (DECISIONS.md, "Invite friends on
// the widget"). The same pieces and words as onboarding step 4, without the progress bar and the
// phone row: the meter, the three share buttons and Already on Clink. Share buttons only; no URL
// and no "Invite link" anywhere (CEO guideline 6).
// Signed out, or setup not finished, it goes through the entry route like any other link, so the
// sign-in gate and the setup steps apply. The close button goes home (the camera).
import { t } from '@clink/shared';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/lib/store';
import { InviteMeter, OnClinkContacts, ShareButtons } from '@/features/invite/InviteShare';
import { IconButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function Invite() {
  const { state } = useData();
  const { c } = useTheme();
  if (!state.ready) return <View style={{ flex: 1, backgroundColor: c.surfaceBase }} />;
  if (!state.session || !state.me || state.me.needsSignup || state.me.onboarding !== 'done') {
    return <Redirect href="/" />;
  }
  return <InviteScreen />;
}

function InviteScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [sent, setSent] = useState(0);

  // Opened from the widget there is nothing behind it, so close replaces it with home.
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/camera');
  }, [router]);

  // Android back does the same as close instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  return (
    <View
      testID="screen-invite"
      style={{ flex: 1, backgroundColor: c.surfaceBase, paddingTop: insets.top }}
    >
      <View style={{ paddingHorizontal: spacing.gutter - 10, paddingTop: spacing.s1 }}>
        <IconButton
          testID="invite-close"
          name="close"
          accessibilityLabel={t('a11y.w.close')}
          onPress={close}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s8 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.s2 }}>
          <Txt variant="displayL" accessibilityRole="header">
            {t('onb.invite.title')}
          </Txt>
          <Txt variant="body" tone="secondary" style={{ marginTop: spacing.s2, maxWidth: 520 }}>
            {t('onb.invite.sub')}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s8, gap: spacing.s6 }}>
          <InviteMeter filled={sent} />
          <ShareButtons surface="widget" onShared={() => setSent((n) => n + 1)} />
        </View>
        <OnClinkContacts onAdded={() => setSent((n) => n + 1)} />
      </ScrollView>
    </View>
  );
}
