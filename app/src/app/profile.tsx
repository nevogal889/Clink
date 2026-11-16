// Profile with the private level (DESIGN.md 4.16, PRD 3.13 and 4.5). The level and XP appear here
// and nowhere else; there is no share button. Opening it after a level-up shows the new level
// once (an 8 pt rise and fade) and clears the top-bar dot.
import { LEVEL_THRESHOLDS, levelForTotal, t, type StringKey } from '@clink/shared';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatShortDate } from '@/lib/format';
import { playHaptic } from '@/lib/platform';
import { useData } from '@/lib/store';
import { usualName } from '@/lib/tracker';
import { xpRow } from '@/lib/xpHistory';
import { NamePhotoEditor, isNameValid } from '@/features/profile/NamePhotoEditor';
import { DrinkIcon } from '@/ui/Art';
import { Avatar } from '@/ui/Avatar';
import { Press, PrimaryButton, TextButton } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { motion, radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useReducedMotion, useTheme } from '@/ui/useTheme';

const HOW_KEYS = ['xp.how.1', 'xp.how.2', 'xp.how.3', 'xp.how.4', 'xp.how.5', 'xp.how.6'] as const;

function Row({
  label,
  onPress,
  testID,
  children,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      scaleTo={0.99}
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s3,
        paddingHorizontal: spacing.gutter,
        borderTopWidth: 1,
        borderTopColor: c.lineHairline,
      }}
    >
      <Txt variant="headline" style={{ flex: 1 }}>
        {label}
      </Txt>
      {children}
      <Icon name="chevronRight" size={20} color={c.inkTertiary} />
    </Press>
  );
}

export default function Profile() {
  const router = useRouter();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { state, actions } = useData();
  const [editOpen, setEditOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [name, setName] = useState(state.me?.displayName ?? '');
  const [photo, setPhoto] = useState<string | null>(state.me?.photoUri ?? null);

  const xp = state.xp ?? { total: 0, history: [], levelSeen: 1 };
  const info = levelForTotal(xp.total, LEVEL_THRESHOLDS);
  const fresh = info.level > xp.levelSeen;
  const reveal = useState(() => new Animated.Value(fresh && !reduced ? 0 : 1))[0];

  useEffect(() => {
    if (!fresh) return;
    playHaptic('levelUp');
    if (!reduced)
      Animated.timing(reveal, {
        toValue: 1,
        duration: motion.base.duration,
        easing: motion.base.easing,
        useNativeDriver: false,
      }).start();
    void actions.markLevelSeen(info.level);
    // Once per new level.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function closeEdit() {
    setEditOpen(false);
    // Closing saves (DESIGN.md 8 rule 8); an empty name keeps the old one.
    if (isNameValid(name)) void actions.updateMe({ displayName: name.trim(), photoUri: photo });
    else setName(state.me?.displayName ?? '');
  }

  const levelName = t(info.nameKey as StringKey as 'level.1');
  const levelDesc = t(info.descKey as StringKey as 'level.1.desc');
  const history = xp.history.slice(0, 20);
  const first = state.usual[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-profile">
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.surfaceBase },
          headerTintColor: c.inkPrimary,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s8 }}>
        <View
          style={{
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.s2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s4,
          }}
        >
          <Avatar name={state.me?.displayName ?? ''} photoUri={state.me?.photoUri} size={72} />
          <View style={{ flex: 1 }}>
            <Txt variant="title" accessibilityRole="header">
              {state.me?.displayName ?? ''}
            </Txt>
            <TextButton
              testID="profile-edit"
              label={t('profile.edit')}
              onPress={() => setEditOpen(true)}
            />
          </View>
        </View>

        <Animated.View
          testID="profile-level"
          accessible
          accessibilityLabel={`${t('profile.level', { n: info.level, level_name: levelName })}. ${info.next && info.xpToNext !== null ? t('profile.to_next', { xp: info.xpToNext, next_level_name: t(info.next.nameKey as 'level.1') }) : t('profile.top')}. ${t('profile.private')}`}
          style={{
            paddingHorizontal: spacing.gutter,
            marginTop: spacing.s8,
            opacity: reveal,
            transform: [
              { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            ],
          }}
        >
          <Txt variant="headline" tone="secondary">
            {t('profile.level_n', { n: info.level })}
          </Txt>
          <Txt variant="displayL" style={{ marginTop: 2 }}>
            {levelName}
          </Txt>
          <Txt variant="callout" tone="secondary" style={{ marginTop: spacing.s1, maxWidth: 520 }}>
            {levelDesc}
          </Txt>
          <View
            style={{
              height: 8,
              borderRadius: radius.bar,
              backgroundColor: c.cobaltTint,
              marginTop: spacing.s5,
              overflow: 'hidden',
            }}
          >
            <View
              testID="level-bar"
              style={{
                width: `${Math.round(info.progress * 100)}%`,
                height: 8,
                borderRadius: radius.bar,
                backgroundColor: c.cobalt,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: spacing.s2,
              gap: spacing.s3,
            }}
          >
            <Txt variant="callout" style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }}>
              {info.next && info.xpToNext !== null
                ? t('profile.to_next', {
                    xp: info.xpToNext,
                    next_level_name: t(info.next.nameKey as 'level.1'),
                  })
                : t('profile.top')}
            </Txt>
            <Txt variant="callout" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {t('profile.total', { xp: xp.total })}
            </Txt>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s1,
              marginTop: spacing.s3,
            }}
          >
            <Icon name="lock" size={14} color={c.inkSecondary} />
            <Txt variant="caption" tone="secondary">
              {t('profile.private')}
            </Txt>
          </View>
        </Animated.View>

        <View style={{ marginTop: spacing.s8 }}>
          <Row
            testID="profile-usual"
            label={t('usual.title')}
            onPress={() => router.push('/usual')}
          >
            {first ? (
              <DrinkIcon drinkId={first.drinkId} category={first.category} size={28} />
            ) : null}
            {first ? (
              <Txt variant="callout" tone="secondary" numberOfLines={1} style={{ maxWidth: 140 }}>
                {usualName(first)}
              </Txt>
            ) : null}
          </Row>
          <Row testID="profile-how" label={t('profile.how')} onPress={() => setHowOpen(true)} />
          <View style={{ borderTopWidth: 1, borderTopColor: c.lineHairline }} />
        </View>

        <View style={{ marginTop: spacing.s8, paddingHorizontal: spacing.gutter }}>
          <Txt variant="headline" accessibilityRole="header">
            {t('profile.history')}
          </Txt>
          {history.length === 0 ? (
            <Txt
              variant="callout"
              tone="secondary"
              style={{ marginTop: spacing.s2 }}
              testID="xp-empty"
            >
              {t('profile.history_empty')}
            </Txt>
          ) : (
            history.map((e, i) => {
              const row = xpRow(e);
              const date = formatShortDate(new Date(e.at));
              return (
                <View
                  key={e.id}
                  testID={`xp-${e.id}`}
                  accessible
                  accessibilityLabel={`${row.full}, ${date}`}
                  style={{
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.s3,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: c.lineHairline,
                    marginTop: i === 0 ? spacing.s2 : 0,
                  }}
                >
                  <Txt
                    variant="headline"
                    color={e.amount < 0 ? c.inkSecondary : c.cobalt}
                    style={{ width: 52, fontVariant: ['tabular-nums'] }}
                  >
                    {row.amount}
                  </Txt>
                  <Txt variant="body" style={{ flex: 1 }}>
                    {row.reason}
                  </Txt>
                  <Txt variant="caption" tone="tertiary">
                    {date}
                  </Txt>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={editOpen}
        onClose={closeEdit}
        detent="medium"
        title={t('set.sec.profile')}
        testID="sheet-profile-edit"
        footer={
          <PrimaryButton
            testID="profile-edit-done"
            label={t('det.save')}
            disabled={!isNameValid(name)}
            onPress={closeEdit}
          />
        }
      >
        <NamePhotoEditor
          name={name}
          photoUri={photo}
          onName={setName}
          onPhoto={setPhoto}
          onSubmit={closeEdit}
        />
      </Sheet>

      <Sheet
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        detent="medium"
        title={t('xp.how.title')}
        testID="sheet-xp-how"
      >
        {HOW_KEYS.map((k, i) => (
          <View
            key={k}
            style={{
              minHeight: 48,
              justifyContent: 'center',
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.lineHairline,
            }}
          >
            <Txt variant="body">{t(k)}</Txt>
          </View>
        ))}
        <Txt variant="caption" tone="secondary" style={{ marginTop: spacing.s4 }}>
          {t('xp.how.footer')}
        </Txt>
      </Sheet>
    </View>
  );
}
