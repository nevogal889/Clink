// Invite pieces (DESIGN.md 4.3 step 4, PRD 3.15): the two-ring meter, the share buttons and the
// "Already on Clink" contact list. Onboarding step 4 and the invite screen (/invite) use them.
// Only WhatsApp, Messages and More. No URL, no link preview, no "Invite link" label and no copy
// button anywhere (CEO guideline 6): the URL only ever travels inside the share message.
import { t } from '@clink/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import type { ContactMatch, InviteSurface, ShareChannel } from '@/lib/api';
import { canUseWhatsApp, openShare, playHaptic } from '@/lib/platform';
import { useData } from '@/lib/store';
import { Avatar } from '@/ui/Avatar';
import { Press, TonalButton } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icons';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useReducedMotion, useTheme } from '@/ui/useTheme';

const RING = 40;

/** Two rim rings with "{n} of 2". At 2 of 2 the rings slide together and touch (the clink). */
// The rings fill at 2 (the widget comes alive), then the count keeps going with no ceiling
// (DECISIONS.md, "Invite goal"). It counts invites sent, never friends who joined.
export function InviteMeter({ filled }: { filled: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const n = Math.min(2, filled);
  const label =
    filled > 2 ? t('onb.invite.meter_more', { n: filled }) : t('onb.invite.meter', { n });
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
      accessibilityLabel={label}
      accessibilityValue={filled > 2 ? { text: label } : { min: 0, max: 2, now: n }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s4 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {ring(n >= 1, 0)}
        <Animated.View style={{ width: gap }} />
        {ring(n >= 2, 1)}
      </View>
      <Txt variant="headline">{label}</Txt>
    </View>
  );
}

const CHANNELS: { channel: ShareChannel; icon: IconName; label: () => string }[] = [
  { channel: 'whatsapp', icon: 'whatsapp', label: () => t('share.whatsapp') },
  { channel: 'messages', icon: 'bubble', label: () => t('share.messages') },
  { channel: 'more', icon: 'share', label: () => t('share.more') },
];

/** Three equal buttons in one row, 72 high, icon above label. WhatsApp hides when not installed. */
export function ShareButtons({
  onShared,
  surface = 'onboarding',
}: {
  onShared?: (channel: ShareChannel) => void;
  /** Where these buttons are, for the invite_share_tapped event (PRD 6). */
  surface?: InviteSurface;
}) {
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
    await api.recordInviteShare(channel, surface);
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

type ContactsState =
  { kind: 'unasked' } | { kind: 'denied' } | { kind: 'loaded'; list: ContactMatch[] };

/**
 * "Already on Clink" (DECISIONS.md): before contacts permission one "Find friends in contacts"
 * row, then the people from your contacts who are on Clink, each with Add. Denied: one line.
 */
export function OnClinkContacts({ onAdded }: { onAdded?: () => void }) {
  const { c } = useTheme();
  const { api } = useData();
  const [contacts, setContacts] = useState<ContactsState>({ kind: 'unasked' });

  async function findContacts() {
    const res = await api.requestContacts();
    if (res === 'denied') return setContacts({ kind: 'denied' });
    setContacts({ kind: 'loaded', list: await api.getContactMatches() });
  }

  async function add(id: string) {
    const updated = await api.addContact(id);
    setContacts((s) =>
      s.kind === 'loaded'
        ? { kind: 'loaded', list: s.list.map((x) => (x.id === id ? updated : x)) }
        : s,
    );
    onAdded?.();
  }

  return (
    <View style={{ marginTop: spacing.s8 }}>
      <Txt
        variant="headline"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.s2 }}
      >
        {t('onb.invite.on_clink')}
      </Txt>
      {contacts.kind === 'unasked' ? (
        <Press
          testID="find-contacts"
          scaleTo={0.99}
          onPress={() => void findContacts()}
          accessibilityLabel={t('onb.invite.find')}
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s3,
            paddingHorizontal: spacing.gutter,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.lineHairline,
          }}
        >
          <Txt variant="headline" color={c.cobalt} style={{ flex: 1 }}>
            {t('onb.invite.find')}
          </Txt>
          <Icon name="chevronRight" size={20} color={c.cobalt} />
        </Press>
      ) : contacts.kind === 'denied' ? (
        <Txt variant="callout" tone="secondary" style={{ paddingHorizontal: spacing.gutter }}>
          {t('onb.invite.contacts_off')}
        </Txt>
      ) : contacts.list.length === 0 ? (
        <Txt variant="callout" tone="secondary" style={{ paddingHorizontal: spacing.gutter }}>
          {t('onb.invite.none_found')}
        </Txt>
      ) : (
        contacts.list.map((m, i) => (
          <View
            key={m.id}
            testID={`contact-${m.id}`}
            style={{
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.s3,
              paddingHorizontal: spacing.gutter,
              borderTopWidth: i === 0 ? 1 : 0,
              borderBottomWidth: 1,
              borderColor: c.lineHairline,
            }}
          >
            <Avatar name={m.name} size={40} />
            <Txt variant="headline" style={{ flex: 1 }}>
              {m.name}
            </Txt>
            {m.state === 'none' ? (
              <TonalButton
                align="center"
                testID={`contact-${m.id}-add`}
                label={t('invite.fallback.add')}
                accessibilityLabel={`${t('invite.fallback.add')}, ${m.name}`}
                onPress={() => void add(m.id)}
              />
            ) : (
              <View
                accessible
                accessibilityLabel={`${m.name}, ${t('contact.requested')}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s1 }}
              >
                <Icon name="check" size={18} color={c.inkPrimary} />
                <Txt variant="caption" tone="secondary">
                  {t('contact.requested')}
                </Txt>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}
