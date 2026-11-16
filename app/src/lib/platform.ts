// Thin wrappers over platform services the screens use: share targets, haptics, confirm dialogs.
// Each one is a single place to wire the native module when it exists.
import { t, type StringKey } from '@clink/shared';
import { Alert, Linking, Platform, Share } from 'react-native';

import type { HapticEvent } from '../ui/theme/haptics';
import type { ShareChannel } from './api';

/**
 * Haptics run through the clink-native module (DESIGN.md 2.10), which isn't built yet. Until it
 * is, this records nothing and plays nothing; haptics are never the only signal (DESIGN.md 7).
 */
export function playHaptic(event: HapticEvent): void {
  void event;
}

const MESSAGE_KEY: Record<ShareChannel, StringKey> = {
  whatsapp: 'share.msg.whatsapp',
  messages: 'share.msg.messages',
  more: 'share.msg.more',
};

export function inviteMessage(channel: ShareChannel, url: string): string {
  return t(MESSAGE_KEY[channel] as 'share.msg.whatsapp', { url });
}

export async function canUseWhatsApp(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    return await Linking.canOpenURL('whatsapp://send');
  } catch {
    return false;
  }
}

/**
 * Opens the chosen share target with the invite message. The URL is inside the message only; it
 * is never shown on screen (CEO guideline 6). On the web review build nothing opens.
 */
export async function openShare(channel: ShareChannel, url: string): Promise<boolean> {
  const message = inviteMessage(channel, url);
  if (Platform.OS === 'web') return true;
  try {
    if (channel === 'whatsapp') {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
    } else if (channel === 'messages') {
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${sep}body=${encodeURIComponent(message)}`);
    } else {
      await Share.share({ message, title: t('share.msg.more.subject') });
    }
    return true;
  } catch {
    return false;
  }
}

/** A system confirm with two buttons. Used only where undo can't reverse (DESIGN.md 8 rule 3). */
export function confirm(opts: {
  title: string;
  body: string;
  yes: string;
  no: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const fn = typeof window !== 'undefined' ? window.confirm : undefined;
    return Promise.resolve(fn ? fn(`${opts.title}\n\n${opts.body}`) : true);
  }
  return new Promise((resolve) =>
    Alert.alert(opts.title, opts.body, [
      { text: opts.no, style: 'cancel', onPress: () => resolve(false) },
      { text: opts.yes, onPress: () => resolve(true) },
    ]),
  );
}
