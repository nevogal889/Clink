// Invite pieces (DESIGN.md 4.3 step 4, PRD 3.15): the two-ring meter and the share buttons.
// Only WhatsApp, Messages and More. No URL, no link preview, no "Invite link" label and no copy
// button anywhere (CEO guideline 6): the URL only ever travels inside the share message.
import { t } from '@clink/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import type { ShareChannel } from '@/lib/api';
import { canUseWhatsApp, openShare, playHaptic } from '@/lib/platform';
import { useData } from '@/lib/store';
import { Press } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icons';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useReducedMotion, useTheme } from '@/ui/useTheme';

const RING = 40;

/** Two rim rings with "{n} of 2". At 2 of 2 the rings slide together and touch (the clink). */
export function InviteMeter({ filled }: { filled: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const n = Math.min(2, filled);
  const gap = useState(() => new Animated.Value(n >= 2 ? -6 : spacing.s2))[0];
  const was = useRef(n);

  useEffect(() => {
    if (n >= 2 && was.current < 2) {
      playHaptic('inviteMeterFull');
      if (reduced) gap.setValue(-6);
      else
        Animated.sequence([
          Animated.timing(gap, {
            toValue: -9,
            duration: 240,
            easing: Easing.bezier(0.3, 0, 0.2, 1),
            useNativeDriver: false,
          }),
          Animated.timing(gap, { toValue: -6, duration: 60, useNativeDriver: false }),
        ]).start();
    }
    was.current = n;
  }, [n, gap, reduced]);

  const ring = (on: boolean, i: number) => (
    <View
      key={i}
      style={{
        width: RING,
        height: RING,
        borderRadius: RING / 2,
        borderWidth: 5,
        borderColor: on ? c.cobalt : c.lineControl,
        backgroundColor: on ? c.cobaltTint : 'transparent',
      }}
    />
  );

  return (
    <View
      testID="invite-meter"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('onb.invite.meter', { n })}
      accessibilityValue={{ min: 0, max: 2, now: n }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s4 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {ring(n >= 1, 0)}
        <Animated.View style={{ width: gap }} />
        {ring(n >= 2, 1)}
      </View>
      <Txt variant="headline">{t('onb.invite.meter', { n })}</Txt>
    </View>
  );
}

const CHANNELS: { channel: ShareChannel; icon: IconName; label: () => string }[] = [
  { channel: 'whatsapp', icon: 'whatsapp', label: () => t('share.whatsapp') },
  { channel: 'messages', icon: 'bubble', label: () => t('share.messages') },
  { channel: 'more', icon: 'share', label: () => t('share.more') },
];

/** Three equal buttons in one row, 72 high, icon above label. WhatsApp hides when not installed. */
export function ShareButtons({ onShared }: { onShared?: (channel: ShareChannel) => void }) {
  const { c } = useTheme();
  const { api } = useData();
  const [whatsapp, setWhatsapp] = useState(true);

  useEffect(() => {
    let alive = true;
    canUseWhatsApp().then((ok) => alive && setWhatsapp(ok));
    return () => {
      alive = false;
    };
  }, []);

  async function share(channel: ShareChannel) {
    const url = await api.getInviteUrl();
    const opened = await openShare(channel, url);
    if (!opened) return;
    await api.recordInviteShare(channel);
    onShared?.(channel);
  }

  return (
    <View style={{ flexDirection: 'row', gap: spacing.s2 }} testID="share-buttons">
      {CHANNELS.filter((ch) => ch.channel !== 'whatsapp' || whatsapp).map((ch) => (
        <Press
          key={ch.channel}
          testID={`share-${ch.channel}`}
          onPress={() => void share(ch.channel)}
          accessibilityLabel={ch.label()}
          style={{
            flex: 1,
            minHeight: 72,
            borderRadius: radius.button === 999 ? 20 : radius.button,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: c.lineControl,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.s1,
            paddingVertical: spacing.s2,
          }}
        >
          <Icon name={ch.icon} size={26} color={c.inkPrimary} />
          <Txt variant="caption" style={{ fontFamily: 'Archivo-SemiBold' }}>
            {ch.label()}
          </Txt>
        </Press>
      ))}
    </View>
  );
}
