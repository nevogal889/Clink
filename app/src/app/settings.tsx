// Settings, the part this build has (DESIGN.md 4.17). Profile and My usual 3, then Sign out and
// Delete account on the root list (deletion within 3 taps, PRD AC 3.19.1). Groups, Widgets,
// Notifications, Privacy, Blocked people and Help come with their milestones (ARCHITECTURE.md 13:
// M3 to M5); they are not shown until they work.
import { t } from '@clink/shared';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useData } from '@/lib/store';
import { Press } from '@/ui/controls';
import { Icon } from '@/ui/icons';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: spacing.s8 }}>
      <Txt
        variant="headline"
        tone="secondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.s2 }}
      >
        {title}
      </Txt>
      <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.lineHairline }}>
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  onPress,
  testID,
  danger,
  chevron = true,
  last,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  danger?: boolean;
  chevron?: boolean;
  last?: boolean;
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
        paddingHorizontal: spacing.gutter,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.lineHairline,
      }}
    >
      <Txt variant="body" color={danger ? c.danger : c.inkPrimary} style={{ flex: 1 }}>
        {label}
      </Txt>
      {chevron ? <Icon name="chevronRight" size={20} color={c.inkTertiary} /> : null}
    </Press>
  );
}

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
  const { actions } = useData();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-settings">
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
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s12 }}>
        <Txt
          variant="displayL"
          accessibilityRole="header"
          style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.s2 }}
        >
          {t('set.title')}
        </Txt>
        <Section title={t('set.sec.profile')}>
          <Row
            testID="set-profile"
            label={t('set.sec.profile')}
            onPress={() => router.push('/profile')}
          />
          <Row
            testID="set-usual"
            label={t('set.usual')}
            onPress={() => router.push('/usual')}
            last
          />
        </Section>
        <Section title={t('set.sec.account')}>
          <Row
            testID="set-signout"
            label={t('set.a.signout')}
            chevron={false}
            onPress={async () => {
              // No confirm: it only signs out, and signing back in restores everything.
              await actions.signOut();
              router.replace('/sign-in');
            }}
          />
          <Row
            testID="set-delete"
            label={t('set.a.delete')}
            danger
            last
            onPress={() => router.push('/delete-account')}
          />
        </Section>
      </ScrollView>
    </View>
  );
}
