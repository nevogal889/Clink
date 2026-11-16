// The drink catalog (DESIGN.md 4.14, part 3): category tabs, the category header with its hero,
// and ten drink rows. Used by the usual 3 editor and by the tracker's "Something else".
import {
  FLARE_CATEGORIES,
  TEXT_LIMITS,
  drinksIn,
  t,
  type FlareCategory,
} from '@clink/shared';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DrinkIcon, Glyph } from '@/ui/Art';
import { Chip, Field, PrimaryButton, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { PourHero, PourPanel } from '@/ui/Pour';
import { Sheet } from '@/ui/Sheet';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export const catName = (c: FlareCategory | 'water') => t(`cat.${c}` as 'cat.coffee');

export function CategoryTabs({
  value,
  onChange,
  background,
}: {
  value: FlareCategory;
  onChange: (c: FlareCategory) => void;
  background?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: background ?? theme.c.surfaceBase, paddingVertical: spacing.s2 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.s2 }}
        accessibilityRole="tablist"
      >
        {FLARE_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            testID={`tab-${cat}`}
            accessibilityRole="tab"
            label={catName(cat)}
            accessibilityLabel={t('a11y.chip.cat', { cat_name: catName(cat) })}
            selected={value === cat}
            onPress={() => onChange(cat)}
            leading={(ink) => <Glyph category={cat} size={18} color={ink} />}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Category header: tint, rim band, name in display.l, "10 drinks", hero 168 (guideline 2). */
export function CategoryHeader({ category }: { category: FlareCategory }) {
  const n = drinksIn(category).length;
  return (
    <PourPanel category={category} style={{ marginHorizontal: spacing.gutter, borderRadius: radius.tile, borderCurve: 'continuous' }} testID="category-header">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingLeft: spacing.s5, minHeight: 176 }}>
        <View style={{ flex: 1, paddingBottom: spacing.s5, paddingTop: spacing.s6 }}>
          <Txt variant="displayL" accessibilityRole="header">
            {catName(category)}
          </Txt>
          <Txt variant="caption" tone="secondary" style={{ marginTop: spacing.s1 }}>
            {t('cat.count', { n })}
          </Txt>
        </View>
        <View style={{ marginRight: -spacing.s2, marginBottom: -spacing.s2 }}>
          <PourHero category={category} size={168} />
        </View>
      </View>
    </PourPanel>
  );
}

/** A slot number badge: 1, 2, 3 in a cobalt circle. */
export function SlotBadge({ n }: { n: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.cobalt, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="numeralS" color={c.onCobalt}>
        {String(n)}
      </Txt>
    </View>
  );
}

export function DrinkRows({
  category,
  slotOf,
  onPick,
  onAddOwn,
  showPlus = true,
}: {
  category: FlareCategory;
  /** 1-based slot number when picked, else null. */
  slotOf?: (drinkId: string) => number | null;
  onPick: (drinkId: string) => void;
  onAddOwn?: () => void;
  showPlus?: boolean;
}) {
  const { c } = useTheme();
  const drinks = drinksIn(category);
  return (
    <View style={{ marginTop: spacing.s2 }} testID={`drink-rows-${category}`}>
      {drinks.map((d, i) => {
        const slot = slotOf?.(d.id) ?? null;
        return (
          <Press
            key={d.id}
            testID={`drink-${d.id}`}
            scaleTo={0.99}
            onPress={() => onPick(d.id)}
            accessibilityLabel={d.name}
            accessibilityHint={d.description}
            accessibilityState={{ selected: slot !== null }}
            accessibilityValue={slot !== null ? { text: t('usual.slot', { n: slot }) } : undefined}
            style={{
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: spacing.gutter,
              gap: spacing.s3,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.lineHairline,
            }}
          >
            <DrinkIcon drinkId={d.id} category={category} size={40} />
            <View style={{ flex: 1, paddingVertical: spacing.s2 }}>
              <Txt variant="headline">{d.name}</Txt>
              <Txt variant="caption" tone="tertiary" numberOfLines={1}>
                {d.description}
              </Txt>
            </View>
            {slot !== null ? (
              <SlotBadge n={slot} />
            ) : showPlus ? (
              <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: c.lineControl, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={16} color={c.inkPrimary} />
              </View>
            ) : null}
          </Press>
        );
      })}
      {onAddOwn ? (
        <Press
          testID="add-own"
          scaleTo={0.99}
          onPress={onAddOwn}
          accessibilityLabel={t('usual.add_own')}
          style={{
            minHeight: 64,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.gutter,
            gap: spacing.s3,
            borderTopWidth: 1,
            borderTopColor: c.lineHairline,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineControl, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={18} color={c.cobalt} />
          </View>
          <Txt variant="headline" color={c.cobalt}>
            {t('usual.add_own')}
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

/** "Add your own": name (30), which kind, Add (DESIGN.md 4.14). */
export function AddOwnSheet({
  visible,
  initialCategory,
  onClose,
  onAdd,
}: {
  visible: boolean;
  initialCategory: FlareCategory;
  onClose: () => void;
  onAdd: (name: string, category: FlareCategory) => void;
}) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState<FlareCategory>(initialCategory);
  const ok = name.trim().length > 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      detent="medium"
      title={t('custom.title')}
      testID="sheet-add-own"
      footer={
        <PrimaryButton
          testID="add-own-submit"
          label={t('custom.cta')}
          disabled={!ok}
          onPress={() => {
            onAdd(name.trim(), cat);
            setName('');
          }}
        />
      }
    >
      <Field testID="add-own-name" value={name} onChangeText={setName} placeholder={t('custom.field')} maxLength={TEXT_LIMITS.customDrinkName} autoFocus />
      <Txt variant="headline" style={{ marginTop: spacing.s6 }}>
        {t('custom.cat_label')}
      </Txt>
      <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>
        {t('custom.cat_helper')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s3 }}>
        {FLARE_CATEGORIES.map((c) => (
          <Chip
            key={c}
            accessibilityRole="radio"
            label={catName(c)}
            selected={cat === c}
            onPress={() => setCat(c)}
            leading={(ink) => <Glyph category={c} size={18} color={ink} />}
          />
        ))}
      </View>
    </Sheet>
  );
}
