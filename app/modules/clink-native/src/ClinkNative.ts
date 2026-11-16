// The clink-native bridge. On Android it calls the Kotlin module (android/.../ClinkNativeModule.kt).
// On iOS the Swift module is a no-op stub until the Apple account exists; on web and in Jest there
// is no native module, so the same no-op answers apply.
import { requireOptionalNativeModule } from 'expo-modules-core';

import type {
  ClinkNativeApi,
  DroppedOp,
  InstalledWidget,
  OutboxSnapshot,
  RejectedLog,
  WidgetSize,
  WidgetState,
} from './ClinkNative.types';

interface NativeShape {
  widgetsSupported: boolean;
  setWidgetState(json: string): Promise<void>;
  setWidgetToken(token: string | null): Promise<void>;
  getInstalledWidgets(): Promise<InstalledWidget[]>;
  requestPinWidget(size: WidgetSize): Promise<boolean>;
  reloadWidgets(): Promise<void>;
  getOutbox(): Promise<OutboxSnapshot>;
  drainOutbox(): Promise<DroppedOp[]>;
  takeRejected?(): Promise<RejectedLog[]>;
  clearAll(): Promise<void>;
}

const native = requireOptionalNativeModule<NativeShape>('ClinkNative');

const SIZES: readonly WidgetSize[] = ['small', 'medium'];

export const ClinkNative: ClinkNativeApi = {
  widgetsSupported: native?.widgetsSupported ?? false,

  async setWidgetState(state: WidgetState | string) {
    if (!native) return;
    await native.setWidgetState(typeof state === 'string' ? state : JSON.stringify(state));
  },

  async setWidgetToken(token: string | null) {
    if (token !== null && !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new Error('setWidgetToken: the token has an unexpected format');
    }
    if (!native) return;
    await native.setWidgetToken(token);
  },

  async getInstalledWidgets() {
    return native ? native.getInstalledWidgets() : [];
  },

  async requestPinWidget(size: WidgetSize) {
    if (!SIZES.includes(size)) throw new Error(`requestPinWidget: unknown size "${size}"`);
    return native ? native.requestPinWidget(size) : false;
  },

  async reloadWidgets() {
    if (native) await native.reloadWidgets();
  },

  async getOutbox() {
    if (!native) return { pending: [], dropped: [], rejected: [] };
    const out = await native.getOutbox();
    return { ...out, rejected: out.rejected ?? [] };
  },

  async drainOutbox() {
    return native ? native.drainOutbox() : [];
  },

  async takeRejected() {
    return native?.takeRejected ? native.takeRejected() : [];
  },

  async clearAll() {
    if (native) await native.clearAll();
  },
};
