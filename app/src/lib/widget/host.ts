// The home-screen widget as the app sees it: the clink-native bridge (app/modules/clink-native).
// Android has the Glance widget; iOS answers `widgetsSupported: false` until the Swift widget
// exists (no Apple account yet, docs/build-notes/widget-app.md). The web review build and the tests
// use the preview host below, which keeps everything in memory and decodes states with the shared
// schema, as strictly as the Kotlin decoder does.
import { widgetStateSchema, type OutboxEntry } from '@clink/shared';
import { Platform } from 'react-native';

import { ClinkNative } from '../../../modules/clink-native';
import { isoSeconds } from './state';
import type {
  ClinkNativeApi,
  DroppedOp,
  InstalledWidget,
  WidgetSize,
} from '../../../modules/clink-native';

export type WidgetHost = ClinkNativeApi;
export type { DroppedOp, InstalledWidget, WidgetSize };

/** The error code the native side rejects a state with (ClinkNativeModule.kt). */
export const STATE_REFUSED = 'ERR_WIDGET_STATE_INVALID';

export interface PreviewHost extends WidgetHost {
  /** Bridge calls in order, by name. Never holds the token or the state. */
  readonly calls: string[];
  installed: InstalledWidget[];
  /** The last state accepted, as JSON. */
  state: string | null;
  hasToken: boolean;
  pending: OutboxEntry[];
  dropped: DroppedOp[];
}

export interface PreviewOptions {
  supported?: boolean;
  installed?: InstalledWidget[];
  /** requestPinWidget answers this. Default false (the launcher can't pin). */
  pinSupported?: boolean;
  /** When pinning is supported, the widget lands on the home screen at once. */
  pinAdds?: boolean;
  pending?: OutboxEntry[];
}

export function createPreviewHost(opts: PreviewOptions = {}): PreviewHost {
  let nextId = 100;
  const host: PreviewHost = {
    widgetsSupported: opts.supported ?? true,
    calls: [],
    installed: [...(opts.installed ?? [])],
    state: null,
    hasToken: false,
    pending: [...(opts.pending ?? [])],
    dropped: [],

    async setWidgetState(state) {
      host.calls.push('setWidgetState');
      const json = typeof state === 'string' ? state : JSON.stringify(state);
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        parsed = null;
      }
      if (!widgetStateSchema.safeParse(parsed).success) {
        throw Object.assign(new Error('Widget state refused'), { code: STATE_REFUSED });
      }
      host.state = json;
    },
    async setWidgetToken(token) {
      host.calls.push('setWidgetToken');
      if (token !== null && !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new Error('setWidgetToken: the token has an unexpected format');
      }
      host.hasToken = token !== null;
    },
    async getInstalledWidgets() {
      host.calls.push('getInstalledWidgets');
      return host.installed.map((w) => ({ ...w }));
    },
    async requestPinWidget(size) {
      host.calls.push('requestPinWidget');
      const ok = opts.pinSupported ?? false;
      if (ok && opts.pinAdds) host.installed.push({ id: nextId++, size });
      return ok;
    },
    async reloadWidgets() {
      host.calls.push('reloadWidgets');
    },
    async getOutbox() {
      host.calls.push('getOutbox');
      return { pending: host.pending.map((e) => ({ ...e })), dropped: [...host.dropped] };
    },
    async drainOutbox() {
      host.calls.push('drainOutbox');
      const out = host.dropped;
      host.dropped = [];
      return out;
    },
    async clearAll() {
      host.calls.push('clearAll');
      host.state = JSON.stringify({ v: 1, state: 'signed_out', updatedAt: isoSeconds(new Date()) });
      host.hasToken = false;
      host.pending = [];
      host.dropped = [];
    },
  };
  return host;
}

/**
 * The host for this build: the native bridge on iOS and Android, the preview host on the web
 * review build (`?mock=setup` shows a medium and a small widget, otherwise none; `&widgets=none`
 * shows none either way).
 */
export function defaultWidgetHost(): WidgetHost {
  if (Platform.OS !== 'web') return ClinkNative;
  const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
  const some = /[?&]mock=setup\b/.test(search) && !/[?&]widgets=none\b/.test(search);
  const installed: InstalledWidget[] = some
    ? [
        { id: 41, size: 'medium' },
        { id: 42, size: 'small' },
      ]
    : [];
  return createPreviewHost({ installed });
}
