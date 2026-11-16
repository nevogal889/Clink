// Types of the clink-native bridge. The widget-state document is the shared schema
// (packages/shared/src/widget-state); this file only adds what the bridge itself returns.
import type { OutboxEntry, WidgetState } from '@clink/shared';

export type { OutboxEntry, WidgetState };

/** Android picks the layout from the widget's size; this is the provider it was added as. */
export type WidgetSize = 'small' | 'medium';

export interface InstalledWidget {
  /** Android appWidgetId (the per-widget instance key, ARCHITECTURE.md 3.5). */
  id: number;
  size: WidgetSize;
}

/** A widget flare or reply that was never accepted before its drop time (ARCHITECTURE.md 3.2). */
export interface DroppedOp {
  id: string;
  op: 'flare' | 'respond';
  /** ISO time the widget dropped it. */
  droppedAt: string;
}

export interface OutboxSnapshot {
  /** Ops the widget made that the server has not accepted yet, oldest first. */
  pending: OutboxEntry[];
  /** Ops dropped since the last drainOutbox(); the app shows off.flare_dropped / off.reply_dropped. */
  dropped: DroppedOp[];
}

export interface ClinkNativeApi {
  /** True where a native widget exists (Android today). False on iOS until the Swift widget lands. */
  readonly widgetsSupported: boolean;
  setWidgetState(state: WidgetState | string): Promise<void>;
  setWidgetToken(token: string | null): Promise<void>;
  getInstalledWidgets(): Promise<InstalledWidget[]>;
  requestPinWidget(size: WidgetSize): Promise<boolean>;
  reloadWidgets(): Promise<void>;
  getOutbox(): Promise<OutboxSnapshot>;
  drainOutbox(): Promise<DroppedOp[]>;
  clearAll(): Promise<void>;
}
