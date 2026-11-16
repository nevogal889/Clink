// The usual 3 editor (DESIGN.md 4.14, PRD 3.7): slots, presets and the catalog, plus the
// "Make it yours" and "Add your own" sheets. Onboarding shows presets first (DESIGN.md 4.3 step 3).
// The editor returns its blocks as an array so the screen's ScrollView can keep the category tabs
// sticky (stickyHeaderIndices counts direct children, and arrays flatten into children).
import { PRESETS, orderSummary, t, type DrinkDetails, type FlareCategory, type Preset } from '@clink/shared';
import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, ScrollView, View } from 'react-native';

import type { UsualDrink } from '@/lib/api';
import { pt } from '@/lib/pendingCopy';
import { playHaptic } from '@/lib/platform';
import { usualName } from '@/lib/tracker';
import { applyPreset, custom, fromCatalog, move, slotOf, toggleDrink, withDetails } from '@/lib/usual';
import { AddOwnSheet, CategoryHeader, CategoryTabs, DrinkRows } from '@/features/catalog/Catalog';
import { DetailsEditor } from '@/features/usual/DetailsEditor';
import { DrinkIcon } from '@/ui/Art';
import { Press, TonalButton } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { useSnackbar } from '@/ui/Snackbar';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

const SLOT_H = 72;

export type EditorMode = 'onboarding' | 'settings';

function SlotRow({
  index,
  drink,
  count,
  onDetails,
  onMove,
}: {
  index: number;
  drink: UsualDrink | null;
  count: number;
  onDetails: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const { c } = useTheme();
  const n = index + 1;
  const dy = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_, g) => dy.setValue(g.dy),
      onPanResponderRelease: (_, g) => {
        setDragging(false);
        dy.setValue(0);
        const steps = Math.round(g.dy / SLOT_H);
        if (steps !== 0) {
          playHaptic('selection');
          onMove(index, index + steps);
        }
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        dy.setValue(0);
      },
    }),
  ).current;

  if (!drink) {
    return (
      <View
        testID={`slot-${n}`}
        accessible
        accessibilityLabel={`${t('usual.slot', { n })} ${t('usual.slot_empty')}`}
        style={{
          minHeight: SLOT_H - 8,
          marginVertical: 4,
          borderRadius: radius.tile,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: c.lineControl,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.s4,
          gap: spacing.s4,
        }}
      >
        <Txt variant="numeralM" tone="tertiary" style={{ width: 22 }}>
          {String(n)}
        </Txt>
        <Txt variant="callout" tone="secondary">
          {t('usual.slot_empty')}
        </Txt>
      </View>
    );
  }

  const name = usualName(drink);
  const summary = orderSummary(drink.category, drink.details);
  const actions = [
    ...(index > 0 ? [{ name: 'moveUp', label: t('a11y.act.move_up') }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: t('a11y.act.move_down') }] : []),
  ];
  return (
    <Animated.View
      testID={`slot-${n}`}
      style={{
        minHeight: SLOT_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s3,
        borderTopWidth: index === 0 ? 0 : 1,
        borderTopColor: c.lineHairline,
        backgroundColor: dragging ? c.surfaceRaised : c.surfaceBase,
        zIndex: dragging ? 2 : 1,
        transform: [{ translateY: dy }],
      }}
    >
      <View
        accessible
        accessibilityLabel={t('a11y.usual.slot', { n, drink: name })}
        accessibilityValue={summary ? { text: summary } : undefined}
        accessibilityActions={actions}
        onAccessibilityAction={(e) => onMove(index, index + (e.nativeEvent.actionName === 'moveUp' ? -1 : 1))}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s3 }}
      >
        <Txt variant="numeralM" style={{ width: 22 }}>
          {String(n)}
        </Txt>
        <DrinkIcon drinkId={drink.drinkId} category={drink.category} size={48} />
        <View style={{ flex: 1, paddingVertical: spacing.s2 }}>
          <Txt variant="headline">{name}</Txt>
          {summary ? (
            <Txt variant="callout" tone="secondary" numberOfLines={2}>
              {summary}
            </Txt>
          ) : null}
          {index === 0 ? (
            <Txt variant="caption" tone="tertiary">
              {t('usual.slot1_helper')}
            </Txt>
          ) : null}
        </View>
      </View>
      {summary ? (
        <Press
          testID={`slot-${n}-details`}
          onPress={onDetails}
          accessibilityLabel={`${t('usual.edit_details')}, ${name}`}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="pencil" size={20} color={c.cobalt} />
        </Press>
      ) : (
        <TonalButton testID={`slot-${n}-details`} label={t('usual.make_yours')} accessibilityLabel={`${t('usual.make_yours')}, ${name}`} onPress={onDetails} />
      )}
      {count > 1 ? (
        <View
          {...pan.panHandlers}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          testID={`slot-${n}-grip`}
          style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as never}
        >
          <Icon name="grip" size={20} color={c.inkTertiary} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function PresetChip({ preset, onPress }: { preset: Preset; onPress: () => void }) {
  const { c } = useTheme();
  const label = t(preset.key);
  return (
    <Press
      testID={`preset-${preset.key}`}
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        minHeight: 48,
        borderRadius: radius.chip,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: c.lineControl,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: spacing.s2,
        paddingRight: spacing.s4,
        gap: spacing.s2,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {preset.drinkIds.map((id, i) => (
          <View key={id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
            <DrinkIcon drinkId={id} category={fromCatalog(id).category} size={28} />
          </View>
        ))}
      </View>
      <Txt variant="callout" style={{ fontFamily: 'Archivo-Medium' }}>
        {label}
      </Txt>
    </Press>
  );
}

export interface UsualEditorParts {
  /** Blocks for the parent ScrollView, in order. */
  blocks: ReactNode[];
  /** Index (inside `blocks`) of the category tabs, for stickyHeaderIndices. */
  tabsIndex: number;
  /** Sheets; render them once, outside the ScrollView. */
  overlays: ReactNode;
}

export function useUsualEditor({
  list,
  onChange,
  mode,
}: {
  list: UsualDrink[];
  onChange: (next: UsualDrink[]) => void;
  mode: EditorMode;
}): UsualEditorParts {
  const { c } = useTheme();
  const snack = useSnackbar();
  const [category, setCategory] = useState<FlareCategory>(list[0]?.category ?? 'coffee');
  const [editing, setEditing] = useState<number | null>(null);
  const [addOwn, setAddOwn] = useState(false);

  function change(next: UsualDrink[]) {
    onChange(next);
  }

  function pick(drink: UsualDrink) {
    const before = list;
    const { list: next, replaced } = toggleDrink(list, drink);
    if (next.length === 0 && mode === 'settings') {
      snack.show({ text: t('usual.min') });
      return;
    }
    playHaptic('selection');
    change(next);
    if (replaced) {
      snack.show({ text: t('usual.replaced', { drink: usualName(replaced) }), onAction: () => change(before) });
    }
  }

  function preset(p: Preset) {
    const before = list;
    playHaptic('selection');
    change(applyPreset(p));
    setCategory(fromCatalog(p.drinkIds[0]).category);
    snack.show({ text: pt('usual.preset_set', { preset: t(p.key) }), onAction: () => change(before) });
  }

  const slots = (
    <View key="slots" style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s6 }} testID="usual-slots">
      {[0, 1, 2].map((i) => (
        <SlotRow
          key={list[i] ? `${list[i]?.drinkId ?? list[i]?.customName}-${i}` : `empty-${i}`}
          index={i}
          drink={list[i] ?? null}
          count={list.length}
          onDetails={() => setEditing(i)}
          onMove={(from, to) => change(move(list, from, to))}
        />
      ))}
    </View>
  );

  const presets = (
    <View key="presets" style={{ marginTop: spacing.s6 }}>
      <Txt variant="headline" style={{ paddingHorizontal: spacing.gutter }}>
        {t('onb.usual.presets')}
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.s2, paddingTop: spacing.s2 }}
      >
        {PRESETS.map((p) => (
          <PresetChip key={p.key} preset={p} onPress={() => preset(p)} />
        ))}
      </ScrollView>
    </View>
  );

  const tabs = (
    <View key="tabs" style={{ marginTop: spacing.s8 }}>
      <CategoryTabs value={category} onChange={(cat) => { playHaptic('selection'); setCategory(cat); }} background={c.surfaceBase} />
    </View>
  );

  const catalog = (
    <View key="catalog" style={{ marginTop: spacing.s2 }}>
      <CategoryHeader category={category} />
      <DrinkRows
        category={category}
        slotOf={(id) => {
          const at = slotOf(list, id);
          return at >= 0 ? at + 1 : null;
        }}
        onPick={(id) => pick(fromCatalog(id))}
        onAddOwn={() => setAddOwn(true)}
      />
    </View>
  );

  const blocks = mode === 'onboarding' ? [presets, slots, tabs, catalog] : [slots, presets, tabs, catalog];
  const editingDrink = editing !== null ? (list[editing] ?? null) : null;

  const overlays = (
    <>
      <DetailsEditor
        drink={editingDrink}
        visible={editingDrink !== null}
        onClose={(details: DrinkDetails) => {
          if (editing !== null) change(withDetails(list, editing, details));
          setEditing(null);
        }}
      />
      <AddOwnSheet
        visible={addOwn}
        initialCategory={category}
        onClose={() => setAddOwn(false)}
        onAdd={(name, cat) => {
          setAddOwn(false);
          setCategory(cat);
          pick(custom(name, cat));
        }}
      />
    </>
  );

  return { blocks, tabsIndex: blocks.indexOf(tabs), overlays };
}
