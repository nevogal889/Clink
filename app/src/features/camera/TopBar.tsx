// Camera top bar (DESIGN.md 4.4), 52 high: profile avatar with the level-up dot, the friends pill,
// then on the right the tracker chip (numerals and glyphs only; label top.today.a11y) and Settings.
import { t } from '@clink/shared';
import { View } from 'react-native';

import { Avatar } from '@/ui/Avatar';
import { IconButton, Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function TopBar({
  name,
  photoUri,
  newLevel,
  friendCount,
  drinks,
  water,
  onProfile,
  onFriends,
  onTracker,
  onSettings,
}: {
  name: string;
  photoUri: string | null;
  newLevel: boolean;
  friendCount: number;
  drinks: number;
  water: number;
  onProfile: () => void;
  onFriends: () => void;
  onTracker: () => void;
  onSettings: () => void;
}) {
  const { c, cat } = useTheme();
  const water_ = cat('water');
  const profileLabel = newLevel ? `${t('top.profile.a11y')}, ${t('top.profile.dot.a11y')}` : t('top.profile.a11y');
  return (
    <View
      testID="top-bar"
      style={{ height: spacing.topBar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter - 4, gap: spacing.s1 }}
    >
      <Press testID="top-profile" onPress={onProfile} accessibilityLabel={profileLabel} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Avatar name={name} photoUri={photoUri} size={36} />
        {newLevel ? (
          <View
            testID="level-dot"
            style={{ position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: c.cobalt, borderWidth: 2, borderColor: c.surfaceBase }}
          />
        ) : null}
      </Press>
      <Press
        testID="top-friends"
        onPress={onFriends}
        accessibilityLabel={friendCount > 0 ? t('top.friends', { n: friendCount }) : t('top.friends_none')}
        hitSlop={4}
        style={{ minHeight: 36, paddingHorizontal: spacing.s3, borderRadius: radius.chip, borderCurve: 'continuous', borderWidth: 1, borderColor: c.lineControl, justifyContent: 'center' }}
      >
        <Txt variant="callout" style={{ fontFamily: 'Archivo-SemiBold' }} color={friendCount > 0 ? c.inkPrimary : c.cobalt}>
          {friendCount > 0 ? t('top.friends', { n: friendCount }) : t('top.friends_none')}
        </Txt>
      </Press>
      <View style={{ flex: 1 }} />
      <Press
        testID="top-tracker"
        onPress={onTracker}
        accessibilityLabel={t('top.today.a11y', { drinks, water })}
        hitSlop={4}
        style={{ minHeight: 36, paddingHorizontal: spacing.s3, borderRadius: radius.chip, borderCurve: 'continuous', backgroundColor: c.surfaceSunk, flexDirection: 'row', alignItems: 'center', gap: spacing.s1 }}
      >
        <Icon name="mug" size={18} color={c.inkPrimary} />
        <Txt variant="numeralS" testID="top-drinks">
          {String(drinks)}
        </Txt>
        <View style={{ width: spacing.s2 }} />
        <Icon name="tumbler" size={18} color={water_.ink} />
        <Txt variant="numeralS" color={water_.ink} testID="top-water">
          {String(water)}
        </Txt>
      </Press>
      <IconButton testID="top-settings" name="settings" accessibilityLabel={t('set.title')} onPress={onSettings} />
    </View>
  );
}
