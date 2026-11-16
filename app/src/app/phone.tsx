// Phone number (DESIGN.md 4.2, PRD 3.1 rule 3): country chip defaulting to the device region, the
// number field, Send code. Usually 2 taps with the code screen's autofill.
import { t } from '@clink/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorText } from '@/lib/api';
import {
  countryList,
  countryName,
  deviceCountry,
  dialCode,
  flagOf,
  parsePhone,
  type CountryCode,
} from '@/lib/phone';
import { useData } from '@/lib/store';
import { AuthFrame, ErrorLine } from '@/features/signin/AuthFrame';
import { Field, PrimaryButton, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function PhoneScreen() {
  const router = useRouter();
  const { actions } = useData();
  const { c } = useTheme();
  const [country, setCountry] = useState<CountryCode>(() => deviceCountry());
  const [number, setNumber] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parsePhone(number, country);
  // A number typed with its own +code moves the chip to that country.
  const shown = parsed?.country && number.trim().startsWith('+') ? parsed.country : country;

  async function send() {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await actions.sendCode(parsed.e164);
      router.push({ pathname: '/code', params: { phone: parsed.e164 } });
    } catch (e) {
      setError(errorText(e, 'err.signin_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      testID="screen-phone"
      title={t('phone.title')}
      sub={t('phone.helper')}
      actions={
        <PrimaryButton
          testID="phone-send"
          label={t('phone.cta')}
          disabled={!parsed}
          busy={busy}
          onPress={send}
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: spacing.s2, alignItems: 'stretch' }}>
        <Press
          testID="phone-country"
          onPress={() => setPicker(true)}
          accessibilityLabel={t('a11y.phone.country', { country: countryName(shown) })}
          style={{
            minHeight: 48,
            paddingHorizontal: spacing.s3,
            borderRadius: radius.field,
            borderCurve: 'continuous',
            backgroundColor: c.surfaceSunk,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s1,
          }}
        >
          <Txt variant="body">{flagOf(shown)}</Txt>
          <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>
            {dialCode(shown)}
          </Txt>
          <Icon name="chevronDown" size={18} color={c.inkSecondary} />
        </Press>
        <View style={{ flex: 1 }}>
          <Field
            testID="phone-number"
            value={number}
            onChangeText={(v) => {
              setNumber(v);
              setError(null);
            }}
            placeholder={t('phone.field')}
            maxLength={20}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            returnKeyType="send"
            onSubmitEditing={send}
            error={!!error}
          />
        </View>
      </View>
      <ErrorLine text={error} testID="phone-error" />

      <CountrySheet
        visible={picker}
        selected={shown}
        onClose={() => setPicker(false)}
        onPick={(code) => {
          setCountry(code);
          if (number.trim().startsWith('+')) setNumber('');
          setPicker(false);
        }}
      />
    </AuthFrame>
  );
}

function CountrySheet({
  visible,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  selected: CountryCode;
  onClose: () => void;
  onPick: (c: CountryCode) => void;
}) {
  const { c } = useTheme();
  const list = useMemo(() => (visible ? countryList() : []), [visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('phone.country.pick')}
      detent="large"
      scroll={false}
      testID="sheet-country"
    >
      <FlatList
        data={list}
        keyExtractor={(code) => code}
        initialNumToRender={20}
        renderItem={({ item }) => (
          <Press
            testID={`country-${item}`}
            scaleTo={0.99}
            onPress={() => onPick(item)}
            accessibilityRole="radio"
            accessibilityState={{ selected: item === selected }}
            accessibilityLabel={`${countryName(item)}, ${dialCode(item)}`}
            style={{
              minHeight: spacing.rowOneLine,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s3,
              borderBottomWidth: 1,
              borderBottomColor: c.lineHairline,
            }}
          >
            <Txt variant="body">{flagOf(item)}</Txt>
            <Txt variant="body" style={{ flex: 1 }}>
              {countryName(item)}
            </Txt>
            <Txt variant="body" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {dialCode(item)}
            </Txt>
            {item === selected ? <Icon name="check" size={20} color={c.cobalt} /> : null}
          </Press>
        )}
      />
    </Sheet>
  );
}
