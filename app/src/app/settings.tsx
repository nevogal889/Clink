// Settings, the part this build has (DESIGN.md 4.17). Profile and My usual 3, Widgets, then Sign
// out and Delete account on the root list (deletion within 3 taps, PRD AC 3.19.1). Groups,
// Notifications, Privacy, Blocked people and Help come with their milestones (ARCHITECTURE.md 13:
// M3 to M5); they are not shown until they work.
//
// Widgets (PRD 3.3 group configuration rule 3, 3.14 item 4): one row per widget on the home
// screen. A medium widget's audience is Automatic until groups and the widget configuration
// screen arrive (M3); the row says where Who joins? goes right now. Changing it from here is M3,
// so the rows don't open anything yet. The section is hidden where the platform has no widget.
import { t } from '@clink/shared';
import { Stack, useIsFocused, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';

import { isDevVariant } from '@/lib/config';
import { useData } from '@/lib/store';
import type { InstalledWidget } from '@/lib/widget/host';
import { resolveChoice } from '@/features/camera/audience';
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

/** A row that shows something and opens nothing (DESIGN.md 4.17 iOS-style read-only rows). */
function InfoRow({
  label,
  sub,
  testID,
  last,
}: {
  label: string;
  sub?: string;
  testID: string;
  last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      style={{
        minHeight: 56,
        justifyContent: 'center',
        paddingHorizontal: spacing.gutter,
        paddingVertical: spacing.s3,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.lineHairline,
      }}
    >
      <Txt variant="body">{label}</Txt>
      {sub ? (
        <Txt variant="callout" tone="secondary">
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

function widgetRow(w: InstalledWidget, autoNow: string): { label: string; sub: string } {
  if (w.size === 'small') {
    return {
      label: t('set.widgets.row_plain', { size: t('set.widgets.size.small') }),
      sub: t('set.widgets.small_note'),
    };
  }
  return {
    label: t('set.widgets.row', {
      size: t('set.widgets.size.medium'),
      audience: t('wcfg.auto'),
    }),
    sub: t('set.widgets.auto_now', { audience: autoNow }),
  };
}

function WidgetsSection() {
  const router = useRouter();
  const { state, actions } = useData();
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) void actions.checkWidgets();
  }, [focused, actions]);
  if (!state.widgets.supported) return null;
  const installed = state.widgets.installed ?? [];
  const audience = state.audience ?? {
    friendCount: 0,
    groups: [],
    auto: { daytimeGroupId: null, otherGroupId: null },
  };
  const autoNow = resolveChoice({ kind: 'auto' }, audience, new Date()).label;
  const dev = isDevVariant();
  return (
    <Section title={t('set.sec.widgets')}>
      {state.widgets.installed === null ? null : installed.length === 0 ? (
        <InfoRow testID="set-widgets-none" label={t('set.widgets.none')} />
      ) : (
        installed.map((w) => {
          const row = widgetRow(w, autoNow);
          return (
            <InfoRow key={w.id} testID={`set-widget-${w.id}`} label={row.label} sub={row.sub} />
          );
        })
      )}
      <Row
        testID="set-widgets-guide"
        label={t('set.widgets.guide')}
        onPress={() => router.push('/widget-guide')}
        last={!dev}
      />
      {dev ? (
        <Row
          testID="set-widgets-debug"
          label={t('dev.ws.row')}
          onPress={() => router.push('/dev/widget-states')}
          last
        />
      ) : null}
    </Section>
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
        <WidgetsSection />
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
