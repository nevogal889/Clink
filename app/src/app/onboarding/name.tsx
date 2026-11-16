// Onboarding step 2: name and photo (DESIGN.md 4.3, PRD 3.2 rule 1). 1 tap when pre-filled.
import { t } from '@clink/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/lib/store';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { NamePhotoEditor, isNameValid } from '@/features/profile/NamePhotoEditor';
import { PrimaryButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';

export default function NameStep() {
  const { state, actions } = useData();
  const advance = useAdvance('name');
  const [name, setName] = useState(state.me?.displayName || state.me?.providerName || '');
  const [photo, setPhoto] = useState<string | null>(state.me?.photoUri ?? null);
  const [busy, setBusy] = useState(false);
  const valid = isNameValid(name);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await actions.updateMe({ displayName: name.trim(), photoUri: photo });
      await advance();
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      testID="screen-onb-name"
      step={stepNumber('name')}
      title={t('onb.name.title')}
      actions={<PrimaryButton testID="onb-continue" label={t('onb.cta')} disabled={!valid} busy={busy} onPress={submit} />}
    >
      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s8, gap: spacing.s4 }}>
        <NamePhotoEditor name={name} photoUri={photo} onName={setName} onPhoto={setPhoto} onSubmit={submit} />
        <Txt variant="caption" tone="secondary">
          {t('onb.photo.helper')}
        </Txt>
      </View>
    </OnboardingFrame>
  );
}
