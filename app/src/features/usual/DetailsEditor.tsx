// "Make it yours" (DESIGN.md 4.14, PRD 3.7): the drink's own fields first, the rest of its
// category under "More options", then Note and Plan B. Every field is optional and can be
// cleared. Closing the sheet any way saves; there is no discard dialog.
import {
  TEXT_LIMITS,
  editorFields,
  fieldValues,
  getDrink,
  isIceVisible,
  orderSummary,
  t,
  type DrinkDetails,
  type OptionField,
} from '@clink/shared';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { UsualDrink } from '@/lib/api';
import { usualName } from '@/lib/tracker';
import { cleanDetails } from '@/lib/usual';
import { DrinkIcon } from '@/ui/Art';
import { Chip, Field, PrimaryButton, Press, TextButton } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

type Values = Record<string, string | string[] | undefined>;

/** Single choice: tap selects, tapping the selected chip clears it. Any: chips toggle. */
export function toggleValue(details: DrinkDetails, field: OptionField, value: string): DrinkDetails {
  const v = details as Values;
  if (field.multi) {
    const cur = Array.isArray(v[field.key]) ? (v[field.key] as string[]) : [];
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    return { ...details, [field.key]: next };
  }
  return { ...details, [field.key]: v[field.key] === value ? undefined : value };
}

/** What gets saved: empty values dropped, and Ice dropped when it isn't shown. */
export function detailsToSave(drink: UsualDrink, details: DrinkDetails): DrinkDetails {
  const target = drink.drinkId ? { drinkId: drink.drinkId } : { category: drink.category };
  const out = { ...details };
  if (!isIceVisible(target, out)) delete out.ice;
  return cleanDetails(out);
}

function FieldSection({
  field,
  drinkId,
  details,
  onChange,
}: {
  field: OptionField;
  drinkId: string | null;
  details: DrinkDetails;
  onChange: (d: DrinkDetails) => void;
}) {
  const v = (details as Values)[field.key];
  return (
    <View style={{ marginTop: spacing.s6 }} testID={`field-${field.key}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.s2 }}>
        <Txt variant="headline" accessibilityRole="header">
          {field.label}
        </Txt>
        {field.multi ? (
          <Txt variant="caption" tone="tertiary">
            {t('det.any')}
          </Txt>
        ) : null}
      </View>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s2 }}
        accessibilityRole={field.multi ? undefined : 'radiogroup'}
        accessibilityLabel={field.label}
      >
        {fieldValues(field, drinkId).map((value) => {
          const selected = Array.isArray(v) ? v.includes(value) : v === value;
          return (
            <Chip
              key={value}
              testID={`opt-${field.key}-${value}`}
              accessibilityRole={field.multi ? 'checkbox' : 'radio'}
              label={value}
              selected={selected}
              check={field.multi}
              onPress={() => onChange(toggleValue(details, field, value))}
            />
          );
        })}
      </View>
    </View>
  );
}

export function DetailsEditor({
  drink,
  visible,
  onClose,
}: {
  drink: UsualDrink | null;
  visible: boolean;
  /** Called with the details to save. Closing any way saves. */
  onClose: (details: DrinkDetails) => void;
}) {
  const { c } = useTheme();
  const [details, setDetails] = useState<DrinkDetails>(drink?.details ?? {});
  const target = drink?.drinkId ? { drinkId: drink.drinkId } : { category: drink?.category ?? 'coffee' };
  const fields = useMemo(() => (drink ? editorFields(target) : { primary: [], more: [] }), [drink?.drinkId, drink?.category]); // eslint-disable-line react-hooks/exhaustive-deps
  const moreHasValue = fields.more.some((f) => {
    const v = (drink?.details as Values | undefined)?.[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  const [moreOpen, setMoreOpen] = useState(moreHasValue);

  useEffect(() => {
    if (visible && drink) {
      setDetails(drink.details);
      setMoreOpen(moreHasValue);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drink) return null;
  const drinkId = drink.drinkId;
  const iceShown = isIceVisible(target, details);
  const visibleField = (f: OptionField) => f.key !== 'ice' || iceShown;
  const summary = orderSummary(drink.category, details);
  const name = usualName(drink);
  const close = () => onClose(detailsToSave(drink, details));

  return (
    <Sheet
      visible={visible}
      onClose={close}
      detent="large"
      testID="sheet-details"
      header={
        <View style={{ flexDirection: 'row', gap: spacing.s4, alignItems: 'center', paddingHorizontal: spacing.gutter, paddingBottom: spacing.s4, borderBottomWidth: 1, borderBottomColor: c.lineHairline }}>
          <DrinkIcon drinkId={drinkId} category={drink.category} size={64} />
          <View style={{ flex: 1 }}>
            <Txt variant="title" accessibilityRole="header">
              {t('det.title', { drink: name })}
            </Txt>
            {summary ? (
              <Txt variant="callout" tone="secondary" testID="details-summary" style={{ marginTop: 2 }}>
                {summary}
              </Txt>
            ) : null}
            <Txt variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
              {t('det.helper')}
            </Txt>
          </View>
        </View>
      }
      footer={
        <View style={{ gap: spacing.s1 }}>
          <PrimaryButton testID="details-done" label={t('det.save')} onPress={close} />
          <TextButton testID="details-clear" label={t('det.clear')} align="center" onPress={() => setDetails({})} />
        </View>
      }
    >
      <View style={{ marginTop: -spacing.s4 }}>
        {fields.primary.filter(visibleField).map((f) => (
          <FieldSection key={f.key} field={f} drinkId={drinkId} details={details} onChange={setDetails} />
        ))}
        {fields.more.length > 0 ? (
          <>
            <Press
              testID="details-more"
              scaleTo={0.99}
              onPress={() => setMoreOpen((o) => !o)}
              accessibilityLabel={t('det.more')}
              accessibilityState={{ expanded: moreOpen }}
              style={{ marginTop: spacing.s6, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: moreOpen ? 0 : 1, borderColor: c.lineHairline }}
            >
              <Txt variant="headline" color={c.cobalt}>
                {t('det.more')}
              </Txt>
              <View style={{ transform: [{ rotate: moreOpen ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" color={c.cobalt} />
              </View>
            </Press>
            {moreOpen
              ? fields.more.filter(visibleField).map((f) => (
                  <FieldSection key={f.key} field={f} drinkId={drinkId} details={details} onChange={setDetails} />
                ))
              : null}
          </>
        ) : null}
        <View style={{ marginTop: spacing.s8, gap: spacing.s2 }}>
          <Txt variant="headline">{t('det.note')}</Txt>
          <Field
            testID="details-note"
            multiline
            value={details.note ?? ''}
            onChangeText={(note) => setDetails((d) => ({ ...d, note }))}
            placeholder={t('det.note.field')}
            accessibilityLabel={t('det.note')}
            maxLength={TEXT_LIMITS.note}
            countFrom={100}
          />
        </View>
        <View style={{ marginTop: spacing.s5, gap: spacing.s2 }}>
          <Txt variant="headline">{t('det.planb')}</Txt>
          <Field
            testID="details-planb"
            value={details.planB ?? ''}
            onChangeText={(planB) => setDetails((d) => ({ ...d, planB }))}
            placeholder={t('det.planb.field')}
            accessibilityLabel={t('det.planb')}
            maxLength={TEXT_LIMITS.planB}
            countFrom={60}
          />
        </View>
      </View>
    </Sheet>
  );
}

export function drinkLabel(drinkId: string | null): string {
  return drinkId ? (getDrink(drinkId)?.name ?? '') : '';
}
