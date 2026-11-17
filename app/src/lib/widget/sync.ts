// Keeps the home-screen widget in step with the app (ARCHITECTURE.md 3.1 "What the app writes",
// 3.5, 3.6). The store (lib/store.tsx) calls it:
//   register(userId)  after sign-in and on every launch with an account: register-device, then
//                     the widget token goes to the widget (setWidgetToken).
//   push(input)       on every foreground and after any change to the usual 3 or the tracker:
//                     GET widget-api/state, setWidgetState, reloadWidgets. Offline (or with no
//                     token) the last server state is patched with the app's own counts.
//   foreground()      drainOutbox, getInstalledWidgets, and the widget's unsent logs for Today.
//                     Signed in, it also takes the logs the server refused for good
//                     (takeRejected) and reports each as a widget_log_rejected app event:
//                     code, kind and category only, never the drink, its name or a time.
//   signedOut()       sign-out, account deletion, a session that ended: clearAll.
// The widget token never comes back out of the bridge, and nothing here logs it or the state.
import { WIDGET_LOG_REJECT_CODES, type OutboxEntry, type WidgetState } from '@clink/shared';

import { ApiError } from '../api/errors';
import type { ClinkApi, WidgetLogRejected } from '../api/types';
import type { DroppedOp, InstalledWidget, RejectedLog, WidgetHost } from './host';
import { patchWidgetState, type AppWidgetInput } from './state';

export type PushResult = 'server' | 'local' | 'refused' | 'skipped';

export interface WidgetSync {
  readonly supported: boolean;
  register(userId: string): Promise<boolean>;
  push(input: AppWidgetInput): Promise<PushResult>;
  foreground(): Promise<{
    installed: InstalledWidget[];
    dropped: DroppedOp[];
    pending: OutboxEntry[];
  }>;
  installed(): Promise<InstalledWidget[]>;
  signedOut(): Promise<void>;
  /** Resolves when the reports the last foreground started have finished (tests, sign-out). */
  reported(): Promise<void>;
}

export interface WidgetSyncDeps {
  host: WidgetHost;
  api: Pick<ClinkApi, 'registerDevice' | 'getWidgetState' | 'recordWidgetLogRejected'>;
  now?: () => Date;
  timeZone?: () => string;
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Reports kept in memory while offline, at most. Older ones go first. */
const MAX_UNREPORTED = 50;

/**
 * The app event for one refused widget log (ARCHITECTURE.md 3.2). Only enums leave the device: a
 * code the shared table doesn't list becomes "other", so server text never lands in analytics.
 */
export function rejectReport(r: RejectedLog): WidgetLogRejected | null {
  if (r.entry.op !== 'log') return null;
  const code = r.code !== null && WIDGET_LOG_REJECT_CODES.includes(r.code) ? r.code : 'other';
  const kind = r.kind === 'malformed' || r.kind === 'stale' ? r.kind : 'other';
  return { code, kind, category: r.entry.payload.category };
}

export function createWidgetSync(deps: WidgetSyncDeps): WidgetSync {
  const { host, api } = deps;
  const now = deps.now ?? (() => new Date());
  const tz = deps.timeZone ?? deviceZone;
  const supported = host.widgetsSupported;
  let userId: string | null = null;
  let registering: Promise<boolean> | null = null;
  let reauthTried = false;
  let lastServer: WidgetState | null = null;
  // Pushes run one at a time, so an older state can never land after a newer one.
  let chain: Promise<unknown> = Promise.resolve();
  // Refused logs taken from the widget but not reported yet (offline). Lost if the app is killed;
  // the widget has already forgotten them.
  let unreported: WidgetLogRejected[] = [];
  let reporting: Promise<void> = Promise.resolve();

  async function reportRejected(): Promise<void> {
    const who = userId;
    if (!who || !host.takeRejected) return;
    const taken = await host.takeRejected().catch((): RejectedLog[] => []);
    for (const r of taken) {
      const report = rejectReport(r);
      if (report) unreported.push(report);
    }
    const left: WidgetLogRejected[] = [];
    for (const report of unreported) {
      try {
        await api.recordWidgetLogRejected(report);
      } catch {
        left.push(report); // offline: try again on the next foreground
      }
    }
    // A sign-out while this ran has already dropped what belonged to that account.
    unreported = userId === who ? left.slice(-MAX_UNREPORTED) : [];
  }

  function doRegister(): Promise<boolean> {
    registering = (async () => {
      let reg: { widgetToken: string } | null = null;
      try {
        reg = await api.registerDevice();
      } catch {
        reg = null; // offline, rate limited or suspended: the widget keeps its token
      }
      if (!reg) return false;
      // register-device runs on every platform (time zone, invite code, new sign-in notice,
      // ARCHITECTURE.md 4.4); only a platform with a widget gets the token.
      if (supported) await host.setWidgetToken(reg.widgetToken);
      return true;
    })();
    return registering;
  }

  async function serverState(): Promise<WidgetState | null> {
    try {
      return await api.getWidgetState(tz());
    } catch (e) {
      // A rotated or revoked token: register once more (this also hands the widget the new
      // token), then try again. A second 401 waits for the next launch.
      if (e instanceof ApiError && e.code === 'unauthorized' && userId && !reauthTried) {
        reauthTried = true;
        if (await doRegister()) {
          try {
            return await api.getWidgetState(tz());
          } catch {
            return null;
          }
        }
      }
      return null;
    }
  }

  async function pushNow(input: AppWidgetInput): Promise<PushResult> {
    if (!supported || !userId) return 'skipped';
    if (registering) await registering;
    const fresh = await serverState();
    if (fresh) lastServer = fresh;
    const state = fresh ?? patchWidgetState(lastServer, input, now());
    if (!state) return 'skipped';
    try {
      await host.setWidgetState(state);
    } catch {
      // The widget's decoder refused it; it keeps its last good state (QA_PLAN ST8).
      return 'refused';
    }
    await host.reloadWidgets();
    return fresh ? 'server' : 'local';
  }

  return {
    supported,

    register(uid) {
      if (userId === uid && registering) return registering;
      userId = uid;
      reauthTried = false;
      lastServer = null;
      return doRegister();
    },

    push(input) {
      const run = chain.catch(() => undefined).then(() => pushNow(input));
      chain = run;
      return run;
    },

    async foreground() {
      if (!supported) return { installed: [], dropped: [], pending: [] };
      const dropped = await host.drainOutbox().catch(() => []);
      const installed = await host.getInstalledWidgets().catch(() => []);
      const outbox = await host.getOutbox().catch(() => ({ pending: [], dropped: [] }));
      // Not awaited: a slow network must not hold up Today and the installed widgets.
      reporting = reporting.catch(() => undefined).then(reportRejected);
      return { installed, dropped, pending: outbox.pending };
    },

    reported() {
      return reporting.catch(() => undefined);
    },

    async installed() {
      if (!supported) return [];
      return host.getInstalledWidgets().catch(() => []);
    },

    async signedOut() {
      userId = null;
      registering = null;
      lastServer = null;
      reauthTried = false;
      unreported = [];
      if (!supported) return;
      await chain.catch(() => undefined);
      await host.clearAll().catch(() => undefined);
    },
  };
}
