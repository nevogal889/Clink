// Age check (DESIGN.md 4.1b, PRD 3.1 rule 10, RISK_REVIEW M-05). After sign-in succeeds for a new
// identity, before the account exists. Month and year, both empty at start, no hint of the
// minimum. The answer stays in memory until the name step sends it to complete-signup with the
// name, and is never stored. Refused: the same frame, title and body, one way out, for 24 hours.
import { t, type StringKey } from '@clink/shared';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/lib/store';
import { AuthFrame } from '@/features/signin/AuthFrame';
import { PrimaryButton, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthName = (m: number) => t(`age.m.${m}` as StringKey as 'age.m.1');

export default function AgeScreen() {
  const router = useRouter();
  const { state, actions } = useData();
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [open, setOpen] = useState<null | 'month' | 'year'>(null);
  const years = useMemo(() => {
    const top = new Date().getFullYear();
    return Array.from({ length: top - 1900 + 1 }, (_, i) => top - i);
  }, []);

  // The store sets this only while the 24 hours run.
  if (state.ageRefusedUntil !== null) {
    return (
      <AuthFrame
        testID="screen-age-refused"
        back={false}
        title={t('age.too_young.title')}
        sub={t('age.too_young', { min: state.ageMin })}
        actions={
          <PrimaryButton
            testID="age-refused-close"
            label={t('age.too_young.close')}
            onPress={() => router.replace('/sign-in')}
          />
        }
      />
    );
  }
  if (!state.session) return <Redirect href="/sign-in" />;
  if (state.me && !state.me.needsSignup) return <Redirect href="/" />;

  return (
    <AuthFrame
      testID="screen-age"
      back={false}
      title={t('age.title')}
      sub={t('age.helper')}
      actions={
        <PrimaryButton
          testID="age-continue"
          label={t('age.cta')}
          disabled={month === null || year === null}
          onPress={() => {
            if (month === null || year === null) return;
            actions.setAge({ birthMonth: month, birthYear: year });
            router.replace('/onboarding/name');
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: spacing.s3 }}>
        <PickerButton
          testID="age-month"
          label={t('age.month')}
          value={month === null ? null : monthName(month)}
          onPress={() => setOpen('month')}
        />
        <PickerButton
          testID="age-year"
          label={t('age.year')}
          value={year === null ? null : String(year)}
          onPress={() => setOpen('year')}
        />
      </View>

      <OptionSheet
        visible={open === 'month'}
        title={t('age.month')}
        testID="sheet-month"
        options={MONTHS}
        selected={month}
        label={monthName}
        onClose={() => setOpen(null)}
        onPick={(m) => {
          setMonth(m);
          setOpen(null);
        }}
      />
      <OptionSheet
        visible={open === 'year'}
        title={t('age.year')}
        testID="sheet-year"
        options={years}
        selected={year}
        label={String}
        onClose={() => setOpen(null)}
        onPick={(y) => {
          setYear(y);
          setOpen(null);
        }}
      />
    </AuthFrame>
  );
}

/** A menu-style picker field: the label until something is picked, then the value. */
function PickerButton({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string | null;
  onPress: () => void;
  testID: string;
}) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      onPress={onPress}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={{
        flex: 1,
        minHeight: 56,
        paddingHorizontal: spacing.s4,
        borderRadius: radius.field,
        borderCurve: 'continuous',
        backgroundColor: c.surfaceSunk,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s2,
      }}
    >
      <Txt variant="body" tone={value ? 'primary' : 'tertiary'} style={{ flex: 1 }}>
        {value ?? label}
      </Txt>
      <Icon name="chevronDown" size={18} color={c.inkSecondary} />
    </Press>
  );
}

function OptionSheet({
  visible,
  title,
  options,
  selected,
  label,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  options: number[];
  selected: number | null;
  label: (n: number) => string;
  onPick: (n: number) => void;
  onClose: () => void;
  testID: string;
}) {
  const { c } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} detent="large" testID={testID}>
      {options.map((item) => (
        <Press
          key={item}
          testID={`${testID}-${item}`}
          scaleTo={0.99}
          onPress={() => onPick(item)}
          accessibilityRole="radio"
          accessibilityState={{ selected: item === selected }}
          accessibilityLabel={label(item)}
          style={{
            minHeight: spacing.rowOneLine,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: c.lineHairline,
          }}
        >
          <Txt variant="body" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
            {label(item)}
          </Txt>
          {item === selected ? <Icon name="check" size={20} color={c.cobalt} /> : null}
        </Press>
      ))}
    </Sheet>
  );
}
