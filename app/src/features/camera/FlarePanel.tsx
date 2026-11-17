// The flare panel on the camera screen (DESIGN.md 4.4, PRD 3.5). Category tint with the rim band,
// category chips, place, timing pills with Meet time and the To: line. Who joins? is
// WhoJoinsBar, pinned by the camera screen under the scrolling panel.
// Layout call: the four category chips get the full width and wrap, so all four show without
// scrolling (Coffee, Matcha and Tea, then Smoothie & Juice on a 360 dp phone). Beside the hero
// they were cut at "Te" and Smoothie & Juice was off screen. The place field and the five timing
// pills get the full width too (sharing one row, so five fit at 360 dp), and the hero (88 pt) sits
// right of the Meet and To: lines, just above Who joins?.
// The send block is two lines, not one row: the To: line reads in full (group emoji + name, the
// small Auto marker, a chevron) and Who joins? spans the width, so the one filled button on the
// panel is the obvious next step. Side by side, a 168 pt button left a 20-character group name
// about 150 pt and cut it.
import { FLARE_CATEGORIES, TEXT_LIMITS, TIMING_PILLS, t, type FlareCategory } from '@clink/shared';
import { ActivityIndicator, View } from 'react-native';

import { formatClock, formatMins } from '@/lib/format';
import { catName } from '@/features/catalog/Catalog';
import { Glyph } from '@/ui/Art';
import { Chip, Field, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { PourHero, PourPanel } from '@/ui/Pour';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useLargeText } from '@/ui/useLargeText';
import { useTheme } from '@/ui/useTheme';

import type { ResolvedAudience } from './audience';

/** The flare panel's hero, beside the Meet and To: lines (DESIGN.md 3.6, 4.4). */
const HERO = 88;

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
  noFriends,
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
  noFriends: boolean;
  now: Date;
}) {
  const theme = useTheme();
  const { c } = theme;
  // From 1.5x text the hero gives its width to the To: line, which would otherwise wrap word by
  // word beside it (DESIGN.md 4.4 "Large text").
  const showHero = !useLargeText();
  const empty = !noFriends && audience.count === 0;
  const meetAt = new Date(now.getTime() + timing.minutes * 60_000);
  // Group emoji + name, in full: it wraps rather than truncates (DESIGN.md 4.5).
  const toLabel = t('compose.to', {
    audience: audience.group?.emoji ? `${audience.group.emoji} ${audience.label}` : audience.label,
  });

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
      <View
        testID="cam-cats"
        accessibilityRole="radiogroup"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.s2,
          paddingHorizontal: spacing.gutter,
        }}
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
              lines={2}
              onPress={() => onCategory(cat)}
              leading={(ink) => <Glyph category={cat} size={18} color={ink} />}
            />
          );
        })}
      </View>
      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s3 }}>
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
                  fill
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
                fill
                onPress={() => onTiming({ minutes: p.minutes, other: false })}
              />
            );
          })}
        </View>
      </View>

      {/* Meet time and who it goes to, read in full, with the hero on the right. Who joins? is
          right under them (WhoJoinsBar). */}
      <View style={{ flexDirection: 'row', paddingLeft: spacing.gutter, marginTop: spacing.s2 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Txt variant="caption" tone="secondary" testID="cam-meet">
            {t('compose.meet', { time: formatClock(meetAt) })}
          </Txt>
          <Press
            testID="cam-to"
            onPress={onAudience}
            scaleTo={0.99}
            accessibilityLabel={t('a11y.to', { audience: audience.label })}
            accessibilityHint={t('a11y.to.hint')}
            style={{
              minHeight: 44,
              alignSelf: 'flex-start',
              maxWidth: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s2,
            }}
          >
            <Txt variant="headline" style={{ flexShrink: 1 }} testID="cam-to-label">
              {toLabel}
            </Txt>
            {audience.auto ? (
              <Txt
                variant="micro"
                tone="secondary"
                testID="cam-to-auto"
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: c.inkTertiary,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {t('compose.auto_tag')}
              </Txt>
            ) : null}
            <Icon name="chevronDown" size={18} color={c.inkSecondary} />
          </Press>
          {empty ? (
            <Txt
              variant="caption"
              tone="secondary"
              accessibilityLiveRegion="polite"
              style={{ marginBottom: spacing.s2 }}
            >
              {t('compose.audience_empty', { group: audience.label })}
            </Txt>
          ) : null}
        </View>
        {showHero ? (
          <View
            testID="cam-hero"
            style={{
              width: HERO + spacing.s3,
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              paddingRight: spacing.gutter - 8,
            }}
          >
            <PourHero category={category} size={HERO} />
          </View>
        ) : (
          <View style={{ width: spacing.gutter }} />
        )}
      </View>
      <View style={{ height: spacing.s2 }} />
    </PourPanel>
  );
}

/**
 * Who joins?, pinned under the panel: full width, category solid, the one filled button in the
 * flare zone. It stays put while the panel scrolls at large text sizes (DESIGN.md 4.4 states).
 */
export function WhoJoinsBar({
  category,
  onSend,
  sending,
  sendFailed,
  noFriends,
  empty,
  thumbnail,
}: {
  category: FlareCategory;
  onSend: () => void;
  sending: boolean;
  sendFailed: boolean;
  noFriends: boolean;
  /** The chosen audience has nobody in it: disabled, with the hint on the panel. */
  empty: boolean;
  thumbnail: boolean;
}) {
  const theme = useTheme();
  const { c } = theme;
  const col = theme.cat(category);
  return (
    <PourPanel category={category} rim={false} testID="who-joins-bar">
      <View style={{ paddingHorizontal: spacing.gutter, paddingBottom: spacing.s4 }}>
        <Press
          testID="cam-send"
          onPress={onSend}
          disabled={sending || empty}
          accessibilityLabel={noFriends ? t('top.friends_none') : t('compose.send')}
          accessibilityState={{ disabled: empty, busy: sending }}
          style={{
            minHeight: 56,
            borderRadius: radius.button,
            borderCurve: 'continuous',
            backgroundColor: empty ? c.surfaceSunk : noFriends ? c.cobalt : col.solid,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.s4,
            paddingVertical: spacing.s2,
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
          <Txt
            variant="label"
            color={empty ? c.inkTertiary : noFriends ? c.onCobalt : col.onSolid}
            style={{ flexShrink: 1 }}
          >
            {sending ? t('off.sending') : noFriends ? t('top.friends_none') : t('compose.send')}
          </Txt>
        </Press>
        {sendFailed ? (
          <Txt
            variant="caption"
            color={c.danger}
            accessibilityLiveRegion="polite"
            style={{ marginTop: spacing.s2 }}
          >
            {t('off.retry')}
          </Txt>
        ) : null}
      </View>
    </PourPanel>
  );
}
