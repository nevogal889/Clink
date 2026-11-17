// Tracker sheet (DESIGN.md 4.15, PRD 3.11): today's drinks and water, private. Two counts, the
// caffeine note after the 4th caffeinated drink, six quick-log buttons, today's entries with
// Undo last and per-entry remove. Undo is 2 taps from the camera (chip, Undo last).
import { FLARE_CATEGORIES, WIDGET_WATER_ID, t, type FlareCategory } from '@clink/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';

import type { LogEntry, LogInput, UsualDrink } from '@/lib/api';
import { agoLine, formatClock, splitCount } from '@/lib/format';
import { playHaptic } from '@/lib/platform';
import { useData } from '@/lib/store';
import { entryName, summarizeToday, usualName } from '@/lib/tracker';
import { CategoryHeader, CategoryTabs, DrinkRows } from '@/features/catalog/Catalog';
import { DrinkIcon, Glyph } from '@/ui/Art';
import { Press, TextButton } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { useSnackbar } from '@/ui/Snackbar';
import { motion, radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useReducedMotion, useTheme } from '@/ui/useTheme';

const SPARKLING_ID = 'water.sparkling';

/** Count roll (DESIGN.md 2.9): the new number rises into place; instant under reduced motion. */
function RollingCount({
  value,
  color,
  testID,
}: {
  value: number;
  color?: string;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const y = useState(() => new Animated.Value(0))[0];
  const last = useRef(value);
  useEffect(() => {
    if (value === last.current) return;
    const dir = value > last.current ? 1 : -1;
    last.current = value;
    if (reduced) return;
    y.setValue(14 * dir);
    Animated.timing(y, {
      toValue: 0,
      duration: motion.base.duration,
      easing: motion.base.easing,
      useNativeDriver: false,
    }).start();
  }, [value, reduced, y]);
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        <Txt variant="displayXl" color={color} testID={testID}>
          {String(value)}
        </Txt>
      </Animated.View>
    </View>
  );
}

function Count({
  label,
  value,
  glyph,
  color,
  testID,
}: {
  label: string;
  value: number;
  glyph: IconName;
  color: string;
  testID: string;
}) {
  const { word } = splitCount(label);
  return (
    <View accessible accessibilityLabel={label} style={{ flex: 1 }}>
      <RollingCount value={value} color={color} testID={testID} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s1 }}>
        <Icon name={glyph} size={18} color={color} />
        <Txt variant="headline" color={color}>
          {word}
        </Txt>
      </View>
    </View>
  );
}

interface QuickItem {
  key: string;
  label: string;
  input: LogInput | null;
  drinkId: string | null;
  category: FlareCategory | 'water';
}

function QuickButton({ item, onPress }: { item: QuickItem; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      testID={`quick-${item.key}`}
      onPress={onPress}
      accessibilityLabel={item.input ? t('a11y.w.pick', { drink: item.label }) : item.label}
      style={{
        width: 80,
        minHeight: 96,
        borderRadius: radius.tile,
        borderCurve: 'continuous',
        backgroundColor: c.surfaceSunk,
        alignItems: 'center',
        paddingTop: spacing.s3,
        paddingHorizontal: spacing.s1,
        gap: spacing.s2,
      }}
    >
      {item.input ? (
        <DrinkIcon drinkId={item.drinkId} category={item.category as FlareCategory} size={40} />
      ) : (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.lineControl,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={18} color={c.cobalt} />
        </View>
      )}
      <Txt
        variant="caption"
        align="center"
        numberOfLines={2}
        style={{ fontFamily: 'Archivo-SemiBold' }}
        color={item.input ? c.inkPrimary : c.cobalt}
      >
        {item.label}
      </Txt>
    </Press>
  );
}

export function quickItems(usual: readonly UsualDrink[]): QuickItem[] {
  const fromUsual = usual.map<QuickItem>((u, i) => ({
    key: `usual-${i + 1}`,
    label: usualName(u),
    drinkId: u.drinkId,
    category: u.category,
    input: {
      drinkId: u.drinkId,
      customName: u.customName,
      category: u.category,
      details: u.details,
    },
  }));
  return [
    ...fromUsual,
    {
      key: 'water',
      label: t('today.log.water'),
      drinkId: WIDGET_WATER_ID,
      category: 'water',
      input: { drinkId: WIDGET_WATER_ID, customName: null, category: 'water', details: {} },
    },
    {
      key: 'sparkling',
      label: t('today.log.sparkling'),
      drinkId: SPARKLING_ID,
      category: 'water',
      input: { drinkId: SPARKLING_ID, customName: null, category: 'water', details: {} },
    },
    { key: 'other', label: t('today.log.other'), drinkId: null, category: 'coffee', input: null },
  ];
}

export function TrackerSheet({
  visible,
  onClose,
  now = () => new Date(),
}: {
  visible: boolean;
  onClose: () => void;
  now?: () => Date;
}) {
  const theme = useTheme();
  const { c } = theme;
  const water = theme.cat('water');
  const tea = theme.cat('tea');
  const { state, actions } = useData();
  const snack = useSnackbar();
  const [catalog, setCatalog] = useState(false);
  const [cat, setCat] = useState<FlareCategory>(state.usual[0]?.category ?? FLARE_CATEGORIES[0]);
  const at = now();
  const summary = summarizeToday(state.today, at);
  const entries = [...state.today].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  async function log(input: LogInput) {
    playHaptic('logged');
    const entry = await actions.log(input);
    snack.show({
      text: t('today.logged', { drink: entryName(entry) }),
      onAction: () => void actions.remove(entry),
    });
  }

  async function remove(entry: LogEntry) {
    playHaptic('undo');
    await actions.remove(entry);
    snack.show({
      text: t('today.removed', { drink: entryName(entry) }),
      onAction: () => void actions.restore(entry),
    });
  }

  async function undoLast() {
    playHaptic('undo');
    const removed = await actions.undoLast();
    if (removed)
      snack.show({
        text: t('today.removed', { drink: entryName(removed) }),
        onAction: () => void actions.restore(removed),
      });
  }

  return (
    <>
      <Sheet visible={visible} onClose={onClose} detent="large" testID="sheet-tracker">
        <View style={{ paddingTop: spacing.s2 }}>
          <Txt variant="title" accessibilityRole="header">
            {t('today.title')}
          </Txt>
          <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>
            {t('today.footer')}
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', marginTop: spacing.s5, gap: spacing.s4 }}>
          <Count
            testID="count-drinks"
            label={t('today.drinks', { n: summary.drinks })}
            value={summary.drinks}
            glyph="mug"
            color={c.inkPrimary}
          />
          <Count
            testID="count-water"
            label={t('today.water', { n: summary.water })}
            value={summary.water}
            glyph="tumbler"
            color={water.ink}
          />
        </View>
        {/* Only once there is a last drink. With nothing logged, the one empty line sits under
            the quick-log row (DESIGN.md 4.15), so the sheet doesn't say it twice. */}
        {summary.lastDrinkAt ? (
          <Txt
            variant="callout"
            tone="secondary"
            style={{ marginTop: spacing.s3 }}
            testID="last-drink"
          >
            {agoLine('today.last', at.getTime() - summary.lastDrinkAt.getTime())}
          </Txt>
        ) : null}

        {summary.caffeineNoteKey ? (
          <View
            testID="caffeine-note"
            accessibilityLiveRegion="polite"
            style={{
              marginTop: spacing.s4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s3,
              paddingVertical: spacing.s3,
              paddingHorizontal: spacing.s4,
              backgroundColor: tea.tint,
              borderRadius: radius.field,
              borderCurve: 'continuous',
            }}
          >
            <Glyph category="tea" size={22} color={tea.ink} />
            <Txt variant="callout" style={{ flex: 1 }}>
              {t(summary.caffeineNoteKey)}
            </Txt>
          </View>
        ) : null}

        <Txt variant="headline" accessibilityRole="header" style={{ marginTop: spacing.s6 }}>
          {t('today.log')}
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -spacing.gutter, marginTop: spacing.s2 }}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.s2 }}
        >
          {quickItems(state.usual).map((item) => (
            <QuickButton
              key={item.key}
              item={item}
              onPress={() => (item.input ? void log(item.input) : setCatalog(true))}
            />
          ))}
        </ScrollView>

        {entries.length === 0 ? (
          <Txt
            variant="callout"
            tone="secondary"
            style={{ marginTop: spacing.s4 }}
            testID="today-empty"
          >
            {t('empty.today')}
          </Txt>
        ) : (
          <View style={{ marginTop: spacing.s6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
                {t('today.entries')}
              </Txt>
              <TextButton
                testID="undo-last"
                label={t('today.undo')}
                onPress={() => void undoLast()}
              />
            </View>
            {entries.map((e, i) => {
              const name = entryName(e);
              const time = formatClock(new Date(e.loggedAt));
              return (
                <View
                  key={e.id}
                  testID={`entry-${e.id}`}
                  style={{
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.s3,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: c.lineHairline,
                  }}
                >
                  <View
                    accessible
                    accessibilityLabel={t('today.row', { time, drink: name })}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s3 }}
                  >
                    <Txt
                      variant="callout"
                      tone="secondary"
                      style={{ width: 72, fontVariant: ['tabular-nums'] }}
                    >
                      {time}
                    </Txt>
                    <DrinkIcon drinkId={e.drinkId} category={e.category} size={24} />
                    <Txt variant="body" style={{ flex: 1 }}>
                      {name}
                    </Txt>
                  </View>
                  <Press
                    testID={`entry-${e.id}-remove`}
                    onPress={() => void remove(e)}
                    accessibilityLabel={`${t('today.remove')}, ${name}`}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="close" size={18} color={c.inkSecondary} />
                  </Press>
                </View>
              );
            })}
          </View>
        )}
      </Sheet>

      <Sheet
        visible={catalog}
        onClose={() => setCatalog(false)}
        detent="large"
        title={t('today.log.other')}
        testID="sheet-log-other"
      >
        <View style={{ marginHorizontal: -spacing.gutter }}>
          <CategoryTabs value={cat} onChange={setCat} background={c.surfaceRaised} />
          <View style={{ marginTop: spacing.s2 }}>
            <CategoryHeader category={cat} />
          </View>
          <DrinkRows
            category={cat}
            showPlus={false}
            onPick={(id) => {
              setCatalog(false);
              void log({ drinkId: id, customName: null, category: cat, details: {} });
            }}
          />
        </View>
      </Sheet>
    </>
  );
}
