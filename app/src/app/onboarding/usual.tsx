// Onboarding step 3: usual 3 (DESIGN.md 4.3, 4.14; PRD 3.2 rule 2). Presets first, then the
// slots and the catalog. Continue needs at least one drink. 2 taps with a preset.
import { t } from '@clink/shared';
import { useState } from 'react';

import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { useUsualEditor } from '@/features/usual/UsualEditor';
import { PrimaryButton } from '@/ui/controls';
import { Txt } from '@/ui/Txt';

export default function UsualStep() {
  const { state, actions } = useData();
  const advance = useAdvance('usual');
  const [busy, setBusy] = useState(false);
  const list = state.usual;
  const editor = useUsualEditor({
    list,
    onChange: (next) => void actions.setUsual(next),
    mode: 'onboarding',
  });
  const ok = list.length > 0;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await advance();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OnboardingFrame
        testID="screen-onb-usual"
        step={stepNumber('usual')}
        title={t('onb.usual.title')}
        sub={t('onb.usual.sub')}
        stickyHeaderIndices={[editor.tabsIndex + 1]}
        actions={
          <>
            <PrimaryButton
              testID="onb-continue"
              label={t('onb.cta')}
              disabled={!ok}
              busy={busy}
              onPress={submit}
            />
            {!ok ? (
              <Txt variant="caption" tone="secondary">
                {t('empty.usual')}
              </Txt>
            ) : null}
          </>
        }
      >
        {editor.blocks}
      </OnboardingFrame>
      {editor.overlays}
    </>
  );
}
