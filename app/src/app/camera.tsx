// Camera home (DESIGN.md 4.4): the root screen. Two zones, one primary each: the shutter for
// snaps and Who joins? for flares. Custom flare with defaults is 2 taps (open app, Who joins?).
import { drinkWords, levelForTotal, msLeft, t, type FlareCategory } from '@clink/shared';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Audience, AudienceChoice, LiveFlare } from '@/lib/api';
import { formatCountdown } from '@/lib/format';
import { confirm, playHaptic } from '@/lib/platform';
import { useData } from '@/lib/store';
import { summarizeToday } from '@/lib/tracker';
import { AudienceSheet } from '@/features/camera/AudienceSheet';
import { resolveChoice } from '@/features/camera/audience';
import { FlarePanel, WhoJoinsBar, type Timing } from '@/features/camera/FlarePanel';
import { OtherTimeSheet } from '@/features/camera/OtherTimeSheet';
import { TopBar } from '@/features/camera/TopBar';
import { ShutterRow, Viewfinder, type Still } from '@/features/camera/Viewfinder';
import { InviteMeter, ShareButtons } from '@/features/invite/InviteShare';
import { TrackerSheet } from '@/features/tracker/TrackerSheet';
import { Glyph } from '@/ui/Art';
import { IconButton, Press } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { useSnackbar, useSnackbarInset } from '@/ui/Snackbar';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

const NO_AUDIENCE: Audience = {
  friendCount: 0,
  groups: [],
  auto: { daytimeGroupId: null, otherGroupId: null },
};

/** Ticks once a second while something on screen counts down. */
function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), active ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function LiveBar({ live, now }: { live: LiveFlare; now: Date }) {
  const theme = useTheme();
  const col = theme.cat(live.category);
  const left = msLeft(new Date(live.expiresAt), now);
  const cat = drinkWords({ category: live.category }).label;
  return (
    <View
      testID="live-bar"
      accessible
      accessibilityLabel={`${t('live.title', { cat })}. ${t('live.countdown', { 'mm:ss': formatCountdown(left) })}`}
      style={{
        height: 48,
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.s2,
        paddingHorizontal: spacing.s4,
        borderRadius: radius.field,
        borderCurve: 'continuous',
        backgroundColor: col.solid,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s2,
      }}
    >
      <Glyph category={live.category} size={20} color={col.onSolid} />
      <Txt variant="headline" color={col.onSolid} style={{ flex: 1 }} numberOfLines={1}>
        {t('live.title', { cat })}
      </Txt>
      <Txt variant="numeralS" color={col.onSolid}>
        {t('live.countdown', { 'mm:ss': formatCountdown(left) })}
      </Txt>
    </View>
  );
}

function WidgetNotice({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <View
      testID="widget-notice"
      style={{
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.s2,
        minHeight: 48,
        paddingLeft: spacing.s4,
        borderRadius: radius.field,
        borderCurve: 'continuous',
        backgroundColor: c.cobaltTint,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Press
        testID="widget-notice-open"
        onPress={onOpen}
        accessibilityLabel={`${t('widget_card.title')}. ${t('widget_card.cta')}`}
        style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
      >
        <Txt variant="callout" color={c.cobalt} style={{ fontFamily: 'Archivo-SemiBold' }}>
          {t('widget_card.title')}
        </Txt>
      </Press>
      <IconButton
        testID="widget-notice-close"
        name="close"
        size={18}
        color={c.cobalt}
        accessibilityLabel={t('a11y.w.close')}
        onPress={onClose}
      />
    </View>
  );
}

/** Defaults (usual #1, last place) are read once on mount, so wait for the first data load. */
export default function Camera() {
  const { state } = useData();
  const { c } = useTheme();
  if (!state.ready) return <View style={{ flex: 1, backgroundColor: c.surfaceBase }} />;
  return <CameraScreen />;
}

function CameraScreen() {
  const router = useRouter();
  const { api, state, actions } = useData();
  const theme = useTheme();
  const { c } = theme;
  const snack = useSnackbar();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [category, setCategory] = useState<FlareCategory>(state.usual[0]?.category ?? 'coffee');
  const [place, setPlace] = useState(state.lastPlace);
  const [timing, setTiming] = useState<Timing>({ minutes: 0, other: false });
  const [choice, setChoice] = useState<AudienceChoice>({ kind: 'auto' });
  const [sheet, setSheet] = useState<null | 'audience' | 'other' | 'tracker' | 'invite'>(null);
  const [still, setStill] = useState<Still | null>(null);
  const [flash, setFlash] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [widgetMissing, setWidgetMissing] = useState(false);
  const [invites, setInvites] = useState(0);
  const [panelH, setPanelH] = useState(260);
  const [barH, setBarH] = useState(72);
  useSnackbarInset(panelH + barH + insets.bottom, useIsFocused());

  const now = useNow(!!state.live);

  useEffect(() => {
    let alive = true;
    api.isWidgetInstalled().then((ok) => alive && setWidgetMissing(!ok));
    return () => {
      alive = false;
    };
  }, [api]);

  // A live flare that has closed leaves the bar quietly (PRD 3.5 rules 12 and 13).
  const live = state.live && msLeft(new Date(state.live.expiresAt), now) > 0 ? state.live : null;

  const audience = state.audience ?? NO_AUDIENCE;
  const resolved = useMemo(() => resolveChoice(choice, audience, now), [choice, audience, now]);
  const noFriends = audience.friendCount === 0;
  const today = summarizeToday(state.today, now);
  const level = state.xp ? levelForTotal(state.xp.total).level : 1;
  const newLevel = !!state.xp && level > state.xp.levelSeen;

  // Viewfinder: square, full width inside the gutters; under 700 pt tall it shrinks to fit,
  // never below 240 (DESIGN.md 4.4 "Small screens"). The panel is measured; past that the
  // screen scrolls (large text) and Who joins? stays pinned under it.
  const chrome =
    insets.top +
    spacing.topBar +
    spacing.shutterRow +
    panelH +
    barH +
    insets.bottom +
    (live ? 56 : 0) +
    (widgetMissing ? 56 : 0);
  const viewSize = Math.max(240, Math.min(width - spacing.gutter * 2, height - chrome));

  async function send() {
    if (noFriends) return setSheet('invite');
    if (live) {
      const cat = drinkWords({ category: live.category }).label;
      const ok = await confirm({
        title: t('replace.title'),
        body: t('replace.body', { cat }),
        yes: t('replace.yes'),
        no: t('replace.no'),
      });
      if (!ok) return;
    }
    setSending(true);
    setSendFailed(false);
    try {
      await actions.sendFlare({
        category,
        place: place.trim(),
        timingMin: timing.minutes,
        audience: choice,
        tappedAt: new Date().toISOString(),
      });
      playHaptic('flareSent');
      setStill(null);
    } catch {
      playHaptic('error');
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  async function shareSnap() {
    if (!still) return;
    setSharing(true);
    try {
      await actions.shareSnap({ photoUri: still.uri, place: place.trim() });
      setStill(null);
      snack.show({ text: noFriends ? t('snap.shared_alone') : t('snap.shared') });
    } catch {
      snack.show({ text: t('err.generic') });
    } finally {
      setSharing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.surfaceBase }}
      testID="screen-camera"
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top }}
        keyboardShouldPersistTaps="handled"
      >
        <TopBar
          name={state.me?.displayName ?? ''}
          photoUri={state.me?.photoUri ?? null}
          newLevel={newLevel}
          friendCount={audience.friendCount}
          drinks={today.drinks}
          water={today.water}
          onProfile={() => router.push('/profile')}
          onFriends={() => setSheet('invite')}
          onTracker={() => setSheet('tracker')}
          onSettings={() => router.push('/settings')}
        />
        {live ? <LiveBar live={live} now={now} /> : null}
        {widgetMissing && !live ? (
          <WidgetNotice
            onOpen={() => router.push('/widget-guide')}
            onClose={() => setWidgetMissing(false)}
          />
        ) : null}
        <Viewfinder
          size={viewSize}
          still={still}
          flash={flash}
          onFlash={() => setFlash((f) => !f)}
        />
        {/* Spare height on tall phones goes around the shutter, keeping it between the two zones. */}
        <View style={{ flexGrow: 1, minHeight: spacing.shutterRow, justifyContent: 'center' }}>
          <ShutterRow
            still={still}
            sharing={sharing}
            onShutter={() => {
              playHaptic('shutter');
              setStill({ uri: `mock-still:${category}`, category });
            }}
            onFlip={() => playHaptic('selection')}
            onRetake={() => setStill(null)}
            onShare={() => void shareSnap()}
          />
        </View>
        <View>
          <View onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}>
            <FlarePanel
              category={category}
              onCategory={(cat) => {
                playHaptic('selection');
                setCategory(cat);
              }}
              place={place}
              onPlace={setPlace}
              timing={timing}
              onTiming={(v) => {
                playHaptic('selection');
                setTiming(v);
              }}
              onOther={() => setSheet('other')}
              audience={resolved}
              onAudience={() => setSheet('audience')}
              noFriends={noFriends}
              now={now}
            />
          </View>
        </View>
      </ScrollView>
      <View onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}>
        <WhoJoinsBar
          category={category}
          onSend={() => void send()}
          sending={sending}
          sendFailed={sendFailed}
          noFriends={noFriends}
          empty={!noFriends && resolved.count === 0}
          thumbnail={!!still}
        />
      </View>
      <View style={{ height: insets.bottom, backgroundColor: theme.cat(category).tint }} />

      <AudienceSheet
        visible={sheet === 'audience'}
        audience={audience}
        value={choice}
        onPick={(v) => {
          playHaptic('selection');
          setChoice(v);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <OtherTimeSheet
        visible={sheet === 'other'}
        value={timing.other ? timing.minutes : null}
        onPick={(minutes) => {
          playHaptic('selection');
          setTiming({ minutes, other: true });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <TrackerSheet visible={sheet === 'tracker'} onClose={() => setSheet(null)} />
      <Sheet
        visible={sheet === 'invite'}
        onClose={() => setSheet(null)}
        detent="medium"
        title={t('friends.share.title')}
        subtitle={
          noFriends ? t('compose.no_friends') : t('top.friends', { n: audience.friendCount })
        }
        testID="sheet-invite"
      >
        <View style={{ gap: spacing.s5 }}>
          {noFriends ? <InviteMeter filled={invites} /> : null}
          <ShareButtons onShared={() => setInvites((n) => n + 1)} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
