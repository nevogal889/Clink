// Onboarding step 6: add the widget (DESIGN.md 4.3, PRD 3.2 rule 5). A 3-step guide for this
// platform. "I added it" checks for an installed widget; without one the guide stays with a
// "can't see it yet" line and the text button becomes "Skip for now".
import { t } from '@clink/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { WidgetSteps } from '@/features/onboarding/WidgetSteps';
import { PrimaryButton, TextButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function WidgetStep() {
  const { api } = useData();
  const { c } = useTheme();
  const advance = useAdvance('widget');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      if (await api.isWidgetInstalled()) await advance();
      else setMissing(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      testID="screen-onb-widget"
      step={stepNumber('widget')}
      title={t('onb.widget.title')}
      sub={t('onb.widget.sub')}
      actions={
        <>
          <PrimaryButton
            testID="widget-done"
            label={missing ? t('onb.widget.retry.again') : t('onb.widget.done')}
            busy={busy}
            onPress={check}
          />
          <TextButton
            testID="widget-later"
            label={missing ? t('onb.widget.retry.skip') : t('onb.widget.later')}
            align="center"
            onPress={() => void advance()}
          />
        </>
      }
    >
      {missing ? (
        <View
          testID="widget-missing"
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
    </OnboardingFrame>
  );
}
