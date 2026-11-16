// Push interface used by the M1 functions. Payloads carry string keys and ids only; devices render
// the words from the string table (COPY.md 5), so no text and no personal data goes to APNs or FCM.
// The real APNs and FCM senders come from M0 spike 4 (ARCHITECTURE.md 7, 13). Until then
// pushFromEnv() returns a sender that delivers nothing and says so in its result.

export type PushTarget = {
  platform: 'ios' | 'android';
  push_token: string;
  apns_env?: 'sandbox' | 'production' | null;
};

export type PushMessage =
  | { type: 'new_signin' } // n.new_signin with the "Not me" action (S-04)
  | { type: 'clear_user'; userId: string }; // background: drop this user's items from widgets (3.3)

export type PushResult = { sent: number; skipped: number };

export interface PushSender {
  send(targets: PushTarget[], message: PushMessage): Promise<PushResult>;
}

export const notConfiguredPush: PushSender = {
  send(targets) {
    return Promise.resolve({ sent: 0, skipped: targets.length });
  },
};

export function pushFromEnv(): PushSender {
  return notConfiguredPush;
}
