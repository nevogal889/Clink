// Onboarding step 6: add the widget (DESIGN.md 4.3, PRD 3.2 rule 5). A 3-step guide for this
// platform. "I added it" checks for an installed widget; without one the guide stays with a
// "can't see it yet" line and the text button becomes "Skip for now".
import { t } from '@clink/shared';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { WidgetStepArt } from '@/features/onboarding/WidgetStepArt';
import { PrimaryButton, TextButton } from '@/ui/controls';
import { lookPlatform } from '@/ui/theme/look';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

/** iOS 17 opens the widget gallery with + (top left); iOS 18 and later with Edit, Add Widget. */
type StepKey =
  | 'onb.widget.and.1' | 'onb.widget.and.2' | 'onb.widget.and.3'
  | 'onb.widget.ios.1' | 'onb.widget.ios.2' | 'onb.widget.ios.3'
  | 'onb.widget.ios17.1' | 'onb.widget.ios17.2' | 'onb.widget.ios17.3';

export function widgetStepKeys(look: 'ios' | 'android', iosMajor: number): StepKey[] {
  if (look === 'android') return ['onb.widget.and.1', 'onb.widget.and.2', 'onb.widget.and.3'];
  if (iosMajor > 0 && iosMajor < 18) return ['onb.widget.ios17.1', 'onb.widget.ios17.2', 'onb.widget.ios17.3'];
  return ['onb.widget.ios.1', 'onb.widget.ios.2', 'onb.widget.ios.3'];
}

function iosMajor(): number {
  if (Platform.OS !== 'ios') return 0;
  return Number.parseInt(String(Platform.Version), 10) || 0;
}

export default function WidgetStep() {
  const { api } = useData();
  const { c } = useTheme();
  const advance = useAdvance('widget');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const look = lookPlatform();
  const keys = widgetStepKeys(look, iosMajor());

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
          <PrimaryButton testID="widget-done" label={missing ? t('onb.widget.retry.again') : t('onb.widget.done')} busy={busy} onPress={check} />
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
          style={{ marginHorizontal: spacing.gutter, marginTop: spacing.s6, paddingLeft: spacing.s3, borderLeftWidth: 4, borderLeftColor: c.cobalt }}
        >
          <Txt variant="headline">{t('onb.widget.retry.title')}</Txt>
          <Txt variant="callout" tone="secondary">
            {t('onb.widget.retry.body')}
          </Txt>
        </View>
      ) : null}
      <View style={{ marginTop: spacing.s6 }}>
        {keys.map((key, i) => (
          <View
            key={key}
            accessible
            accessibilityLabel={`${i + 1}. ${t(key)}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s4,
              paddingHorizontal: spacing.gutter,
              paddingVertical: spacing.s4,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.lineHairline,
            }}
          >
            <Txt variant="numeralL" color={c.cobalt} style={{ width: 28 }}>
              {String(i + 1)}
            </Txt>
            <Txt variant="body" style={{ flex: 1 }}>
              {t(key)}
            </Txt>
            <WidgetStepArt step={(i + 1) as 1 | 2 | 3} look={look} />
          </View>
        ))}
      </View>
    </OnboardingFrame>
  );
}
