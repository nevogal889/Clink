// The flare panel on the camera screen (DESIGN.md 4.4, PRD 3.5). Category tint with the rim band,
// category chips, place, timing pills with Meet time, the To: chip and Who joins?.
// Layout call: the 112 pt hero sits right of the chips and the place field, so the five timing
// pills get the full width. Five pills with 44 pt targets don't fit beside the hero on a 390 pt
// phone.
import { FLARE_CATEGORIES, TEXT_LIMITS, TIMING_PILLS, t, type FlareCategory } from '@clink/shared';
import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';

import { formatClock, formatMins } from '@/lib/format';
import { catName } from '@/features/catalog/Catalog';
import { Glyph } from '@/ui/Art';
import { Chip, Field, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { PourHero, PourPanel } from '@/ui/Pour';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

import type { ResolvedAudience } from './audience';

export interface Timing {
  minutes: number;
  /** True when the value came from the Other sheet. */
  other: boolean;
}

export function FlarePanel({
  category,
  onCategory,
  place,
  onPlace,
  timing,
  onTiming,
  onOther,
  audience,
  onAudience,
  onSend,
  sending,
  sendFailed,
  noFriends,
  thumbnail,
  now,
}: {
  category: FlareCategory;
  onCategory: (c: FlareCategory) => void;
  place: string;
  onPlace: (v: string) => void;
  timing: Timing;
  onTiming: (t: Timing) => void;
  onOther: () => void;
  audience: ResolvedAudience;
  onAudience: () => void;
  onSend: () => void;
  sending: boolean;
  sendFailed: boolean;
  noFriends: boolean;
  thumbnail: boolean;
  now: Date;
}) {
  const theme = useTheme();
  const { c } = theme;
  const col = theme.cat(category);
  const { width } = useWindowDimensions();
  const heroSize = width < 360 ? 88 : 112;
  const empty = !noFriends && audience.count === 0;
  const meetAt = new Date(now.getTime() + timing.minutes * 60_000);
  const toLabel = t('compose.to', { audience: audience.label });

  return (
    <PourPanel
      category={category}
      testID="flare-panel"
      style={{
        borderTopLeftRadius: radius.panel,
        borderTopRightRadius: radius.panel,
        borderCurve: 'continuous',
        paddingTop: spacing.s4,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: spacing.s3 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingLeft: spacing.gutter,
              paddingRight: spacing.s2,
              gap: spacing.s2,
            }}
            accessibilityRole="radiogroup"
          >
            {FLARE_CATEGORIES.map((cat) => {
              const cc = theme.cat(cat);
              return (
                <Chip
                  key={cat}
                  testID={`cam-cat-${cat}`}
                  accessibilityRole="radio"
                  label={catName(cat)}
                  accessibilityLabel={t('a11y.chip.cat', { cat_name: catName(cat) })}
                  selected={cat === category}
                  onTint
                  fillSelected={cc.solid}
                  inkSelected={cc.onSolid}
                  onPress={() => onCategory(cat)}
                  leading={(ink) => <Glyph category={cat} size={18} color={ink} />}
                />
              );
            })}
          </ScrollView>
          <View style={{ paddingLeft: spacing.gutter }}>
            <Field
              testID="cam-place"
              value={place}
              onChangeText={onPlace}
              placeholder={t('compose.place')}
              accessibilityLabel={t('compose.place')}
              maxLength={TEXT_LIMITS.place}
              onTint
              leading={<Icon name="pencil" size={18} color={c.inkSecondary} />}
              returnKeyType="done"
              style={{ fontSize: 15 }}
            />
          </View>
        </View>
        <View
          style={{
            width: heroSize + spacing.s3,
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            paddingRight: spacing.gutter - 8,
          }}
        >
          <PourHero category={category} size={heroSize} />
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s3 }}>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
          accessibilityRole="radiogroup"
        >
          {TIMING_PILLS.map((p) => {
            if (p.kind === 'other') {
              const label = timing.other ? t('time.pill', { n: timing.minutes }) : t('time.other');
              return (
                <Chip
                  key="other"
                  testID="pill-other"
                  accessibilityRole="radio"
                  label={label}
                  accessibilityLabel={
                    timing.other
                      ? t('a11y.pill.time', { mins_cap: formatMins(timing.minutes, true) })
                      : t('time.other')
                  }
                  selected={timing.other}
                  onTint
                  onPress={onOther}
                />
              );
            }
            const label = p.minutes === 0 ? t('time.now') : t('time.pill', { n: p.minutes });
            return (
              <Chip
                key={p.minutes}
                testID={`pill-${p.minutes}`}
                accessibilityRole="radio"
                label={label}
                accessibilityLabel={t('a11y.pill.time', { mins_cap: formatMins(p.minutes, true) })}
                selected={!timing.other && timing.minutes === p.minutes}
                onTint
                onPress={() => onTiming({ minutes: p.minutes, other: false })}
              />
            );
          })}
        </View>
        <Txt variant="caption" tone="secondary" style={{ marginTop: spacing.s2 }} testID="cam-meet">
          {t('compose.meet', { time: formatClock(meetAt) })}
        </Txt>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.s3,
          paddingHorizontal: spacing.gutter,
          marginTop: spacing.s3,
          paddingBottom: spacing.s4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Press
            testID="cam-to"
            onPress={onAudience}
            accessibilityLabel={t('a11y.to', { audience: audience.label })}
            accessibilityHint={t('a11y.to.hint')}
            style={{
              minHeight: 44,
              alignSelf: 'flex-start',
              maxWidth: '100%',
              paddingHorizontal: spacing.s3,
              borderRadius: radius.chip,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: c.inkSecondary,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s1,
            }}
          >
            <Txt
              variant="callout"
              style={{ fontFamily: 'Archivo-SemiBold', flexShrink: 1 }}
              numberOfLines={1}
            >
              {toLabel}
            </Txt>
            {audience.auto ? (
              <View
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                  backgroundColor: c.inkPrimary,
                }}
              >
                <Txt variant="micro" color={c.surfaceBase}>
                  {t('compose.auto_tag')}
                </Txt>
              </View>
            ) : null}
          </Press>
        </View>
        <Press
          testID="cam-send"
          onPress={onSend}
          disabled={sending || empty}
          accessibilityLabel={noFriends ? t('top.friends_none') : t('compose.send')}
          accessibilityState={{ disabled: empty, busy: sending }}
          style={{
            minWidth: 168,
            minHeight: 56,
            borderRadius: radius.button,
            borderCurve: 'continuous',
            backgroundColor: empty ? c.surfaceSunk : noFriends ? c.cobalt : col.solid,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.s4,
            gap: spacing.s2,
          }}
        >
          {sending ? (
            <ActivityIndicator color={col.onSolid} />
          ) : thumbnail && !noFriends ? (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: col.tint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Glyph category={category} size={16} color={col.ink} />
            </View>
          ) : !noFriends ? (
            <Glyph category={category} size={22} color={empty ? c.inkTertiary : col.onSolid} />
          ) : null}
          <Txt variant="label" color={empty ? c.inkTertiary : noFriends ? c.onCobalt : col.onSolid}>
            {sending ? t('off.sending') : noFriends ? t('top.friends_none') : t('compose.send')}
          </Txt>
        </Press>
      </View>
      {empty || sendFailed ? (
        <Txt
          variant="caption"
          color={sendFailed ? c.danger : undefined}
          tone="secondary"
          accessibilityLiveRegion="polite"
          style={{
            paddingHorizontal: spacing.gutter,
            marginTop: -spacing.s2,
            paddingBottom: spacing.s4,
          }}
        >
          {sendFailed ? t('off.retry') : t('compose.audience_empty', { group: audience.label })}
        </Txt>
      ) : null}
    </PourPanel>
  );
}
