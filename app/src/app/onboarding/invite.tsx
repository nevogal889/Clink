// Onboarding step 4: invite friends (DESIGN.md 4.3, PRD 3.2 rule 3 and 3.15). Share buttons only:
// WhatsApp, Messages, More. Nothing on this screen shows or copies the invite URL (guideline 6).
import { t } from '@clink/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { looksLikePhone } from '@/lib/phone';
import { useData } from '@/lib/store';
import { InviteMeter, OnClinkContacts, ShareButtons } from '@/features/invite/InviteShare';
import { OnboardingFrame } from '@/features/onboarding/OnboardingFrame';
import { stepNumber } from '@/features/onboarding/steps';
import { useAdvance } from '@/features/onboarding/useAdvance';
import { Field, PrimaryButton, Press, TextButton, TonalButton } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function InviteStep() {
  const { c } = useTheme();
  const { state, actions } = useData();
  const advance = useAdvance('invite');
  const [filled, setFilled] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const showPhone = state.session?.method !== 'phone' && !state.me?.hasPhone;

  async function next() {
    setBusy(true);
    try {
      await advance();
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      testID="screen-onb-invite"
      step={stepNumber('invite')}
      title={t('onb.invite.title')}
      sub={t('onb.invite.sub')}
      actions={
        filled > 0 ? (
          <PrimaryButton testID="onb-continue" label={t('onb.cta')} busy={busy} onPress={next} />
        ) : (
          <TextButton testID="onb-later" label={t('onb.later')} align="center" onPress={next} />
        )
      }
    >
      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s8, gap: spacing.s6 }}>
        <InviteMeter filled={filled} />
        <ShareButtons onShared={() => setFilled((n) => n + 1)} />
      </View>

      <OnClinkContacts onAdded={() => setFilled((n) => n + 1)} />

      {showPhone ? (
        <View style={{ marginTop: spacing.s8, paddingHorizontal: spacing.gutter }}>
          {!phoneOpen ? (
            <Press
              testID="phone-row"
              scaleTo={0.99}
              onPress={() => setPhoneOpen(true)}
              accessibilityLabel={t('onb.phone.title')}
              accessibilityState={{ expanded: false }}
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.s3 }}
            >
              <View style={{ flex: 1 }}>
                <Txt variant="headline">{t('onb.phone.title')}</Txt>
                <Txt variant="caption" tone="secondary">
                  {t('onb.phone.helper')}
                </Txt>
              </View>
              <Icon name="chevronDown" size={20} color={c.inkSecondary} />
            </Press>
          ) : (
            <View style={{ gap: spacing.s2 }}>
              <Txt variant="headline">{t('onb.phone.title')}</Txt>
              <Field
                testID="phone-field"
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setPhoneError(false);
                }}
                error={phoneError}
                placeholder={t('phone.field')}
                maxLength={20}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                autoFocus
              />
              <Txt
                variant="caption"
                color={phoneError ? c.danger : undefined}
                tone="secondary"
                accessibilityLiveRegion="polite"
              >
                {phoneError ? t('err.phone_invalid') : t('onb.phone.helper')}
              </Txt>
              <View style={{ marginTop: spacing.s2 }}>
                <TonalButton
                  testID="phone-add"
                  label={t('onb.phone.cta')}
                  onPress={() => {
                    if (looksLikePhone(phone)) void actions.addPhone(phone.trim());
                    else setPhoneError(true);
                  }}
                />
              </View>
            </View>
          )}
        </View>
      ) : state.me?.hasPhone && state.session?.method !== 'phone' ? (
        <View
          style={{
            marginTop: spacing.s8,
            paddingHorizontal: spacing.gutter,
            flexDirection: 'row',
            gap: spacing.s2,
            alignItems: 'center',
          }}
        >
          <Icon name="check" size={18} color={c.inkPrimary} />
          <Txt variant="callout" tone="secondary" testID="phone-added">
            {t('onb.phone.added')}
          </Txt>
        </View>
      ) : null}
    </OnboardingFrame>
  );
}
