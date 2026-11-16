// Onboarding step 6: add the widget (DESIGN.md 4.3, PRD 3.2 rule 5, F8). A 3-step guide for this
// platform, plus "Add it for me" where the Android launcher can pin. "I added it" checks for an
// installed widget; without one the guide stays with a "can't see it yet" line and the text
// button becomes "Skip for now". Where the platform has no widget yet (iOS until the Swift widget
// ships) the step passes straight on: there is nothing to add.
import { t } from '@clink/shared';
import { useEffect } from 'react';

import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { AddWidgetGuide } from '@/features/widgets/AddWidgetGuide';
import { useAddWidget } from '@/features/widgets/useAddWidget';
import { PrimaryButton, TextButton } from '@/ui/controls';

export default function WidgetStep() {
  const { state } = useData();
  const advance = useAdvance('widget');
  const add = useAddWidget(advance);
  const supported = state.widgets.supported;

  useEffect(() => {
    if (!supported) void advance();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

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
            label={add.missing ? t('onb.widget.retry.again') : t('onb.widget.done')}
            busy={add.busy}
            onPress={add.check}
          />
          <TextButton
            testID="widget-later"
            label={add.missing ? t('onb.widget.retry.skip') : t('onb.widget.later')}
            align="center"
            onPress={() => void advance()}
          />
        </>
      }
    >
      <AddWidgetGuide
        missing={add.missing}
        canPin={add.canPin}
        pinning={add.pinning}
        onPin={() => void add.pin()}
      />
    </OnboardingFrame>
  );
}
