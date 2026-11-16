// Onboarding step 2: name and photo (DESIGN.md 4.3, PRD 3.2 rule 1). 1 tap when pre-filled.
// For a new identity this is where the account is made: Continue sends the age answer from the
// age screen and the name to complete-signup (its name field is required), then the photo.
import { t } from '@clink/shared';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, isApiError } from '@/lib/api';
import { useData } from '@/lib/store';
import { ErrorLine } from '@/features/signin/AuthFrame';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { NamePhotoEditor, isNameValid } from '@/features/profile/NamePhotoEditor';
import { PrimaryButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';

export default function NameStep() {
  const router = useRouter();
  const { state, actions } = useData();
  const advance = useAdvance('name');
  const [name, setName] = useState(state.me?.displayName || state.me?.providerName || '');
  const [photo, setPhoto] = useState<string | null>(state.me?.photoUri ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isNameValid(name);
  const needsSignup = !!state.me?.needsSignup;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (needsSignup) {
        await actions.completeSignup(name.trim());
        if (photo) await actions.updateMe({ photoUri: photo });
      } else {
        await actions.updateMe({ displayName: name.trim(), photoUri: photo });
      }
      await advance();
    } catch (e) {
      if (isApiError(e, 'under_age')) {
        router.replace('/age');
        return;
      }
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Back here after a restart, before the account exists: the age answer was never kept.
  if (needsSignup && !actions.hasAge() && !busy) return <Redirect href="/age" />;

  return (
    <OnboardingFrame
      testID="screen-onb-name"
      step={stepNumber('name')}
      title={t('onb.name.title')}
      actions={
        <PrimaryButton
          testID="onb-continue"
          label={t('onb.cta')}
          disabled={!valid}
          busy={busy}
          onPress={submit}
        />
      }
    >
      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s8, gap: spacing.s4 }}>
        <NamePhotoEditor
          name={name}
          photoUri={photo}
          onName={setName}
          onPhoto={setPhoto}
          onSubmit={submit}
        />
        <ErrorLine text={error} testID="onb-name-error" />
        <Txt variant="caption" tone="secondary">
          {t('onb.photo.helper')}
        </Txt>
      </View>
    </OnboardingFrame>
  );
}
