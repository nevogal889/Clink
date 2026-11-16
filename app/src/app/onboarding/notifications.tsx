// Onboarding step 5: notification pre-prompt (DESIGN.md 4.3, PRD 3.2 rule 4). Our explainer comes
// first; the system dialog shows only after "Continue". The button never says "Allow".
import { t } from '@clink/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { pt } from '@/lib/pendingCopy';
import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { AppIcon } from '@/ui/Art';
import { PrimaryButton, TextButton } from '@/ui/controls';
import { lookPlatform } from '@/ui/theme/look';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

/** A notification drawn the way this platform draws one: iOS banner or Android shade card. */
function ExampleNotification({ title, body }: { title: string; body: string }) {
  const { c, mode } = useTheme();
  const android = lookPlatform() === 'android';
  const bg = mode === 'dark' ? '#242C36' : '#FFFFFF';
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.s3,
        padding: spacing.s3,
        borderRadius: android ? 24 : 20,
        borderCurve: 'continuous',
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: c.lineHairline,
      }}
    >
      <AppIcon size={android ? 28 : 38} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.s2 }}>
          <Txt variant="headline" style={{ flex: 1 }}>
            {title}
          </Txt>
          <Txt variant="caption" tone="tertiary">
            {pt('fmt.mins.now')}
          </Txt>
        </View>
        <Txt variant="callout" tone="secondary">
          {body}
        </Txt>
      </View>
    </View>
  );
}

export default function NotificationsStep() {
  const { api } = useData();
  const advance = useAdvance('notifications');
  const [busy, setBusy] = useState(false);

  async function yes() {
    setBusy(true);
    try {
      // The system dialog. Whatever the answer, onboarding moves on (PRD 3.2 edge cases).
      await api.requestNotifications();
      await advance();
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      testID="screen-onb-notifications"
      step={stepNumber('notifications')}
      title={t('perm.notif.title')}
      sub={t('perm.notif.body')}
      actions={
        <>
          <PrimaryButton testID="notif-yes" label={t('perm.notif.yes')} busy={busy} onPress={yes} />
          <TextButton testID="notif-no" label={t('perm.notif.no')} align="center" onPress={() => void advance()} />
        </>
      }
    >
      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s8, gap: spacing.s3 }}>
        <ExampleNotification title={t('perm.notif.example1.title')} body={t('perm.notif.example1.body')} />
        <ExampleNotification title={t('perm.notif.example2.title')} body={t('perm.notif.example2.body')} />
      </View>
    </OnboardingFrame>
  );
}
