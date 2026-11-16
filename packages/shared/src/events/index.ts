// app_events names and props (PRD.md 6 "Event list") as zod schemas. First-party analytics only.
// Every event also carries user_id, platform, app_version and ts, which the writer adds.
// No event carries free text, photos, phone numbers, contact data or place names: every prop
// below is an enum, a boolean or a small integer, and the schemas are strict.
import { z } from 'zod';
import { FLARE_CATEGORIES, LOG_CATEGORIES } from '../catalog';

const count = z.number().int().min(0).max(1000);
const audienceType = z.enum(['auto', 'group', 'everyone']);

/** The five reactions, by name (COPY.md 0.3: ☕ 🍵 🫖 ❤️ 😂). */
export const REACTIONS = {
  coffee: '☕',
  matcha: '🍵',
  tea: '🫖',
  heart: '❤️',
  laughing: '😂',
} as const;
export type ReactionName = keyof typeof REACTIONS;
export const reactionNameSchema = z.enum(
  Object.keys(REACTIONS) as [ReactionName, ...ReactionName[]],
);

const none = z.strictObject({});

export const EVENT_PROPS = {
  auth_signed_up: z.strictObject({ method: z.enum(['apple', 'google', 'phone']) }),
  auth_signed_in: z.strictObject({ method: z.enum(['apple', 'google', 'phone']) }),
  onboarding_step_viewed: z.strictObject({ step: z.number().int().min(1).max(6) }),
  onboarding_step_completed: z.strictObject({ step: z.number().int().min(1).max(6) }),
  onboarding_step_skipped: z.strictObject({ step: z.number().int().min(1).max(6) }),
  invite_share_tapped: z.strictObject({
    channel: z.enum(['whatsapp', 'messages', 'more']),
    // Where the share buttons were: a screen id, never text the user typed.
    surface: z.enum(['onboarding', 'friends', 'widget', 'camera']),
  }),
  invite_opened: z.strictObject({ installed: z.boolean() }),
  invite_accepted: z.strictObject({
    attribution: z.enum(['deeplink', 'paste', 'fallback']),
    existing_user: z.boolean(),
  }),
  friend_added: z.strictObject({ source: z.enum(['invite', 'contacts', 'request']) }),
  friend_removed: z.strictObject({ source: z.enum(['invite', 'contacts', 'request']) }),
  widget_added: z.strictObject({
    size: z.enum(['small', 'medium']),
    // Small widgets have no audience (PRD 3.3 group configuration rule 6).
    audience_type: audienceType.nullable(),
  }),
  widget_removed: z.strictObject({
    size: z.enum(['small', 'medium']),
    audience_type: audienceType.nullable(),
  }),
  flare_sent: z.strictObject({
    source: z.enum(['widget', 'app']),
    category: z.enum(FLARE_CATEGORIES),
    timing_min: z.number().int().min(0).max(60),
    audience_type: audienceType,
    has_photo: z.boolean(),
  }),
  flare_reply: z.strictObject({
    type: z.enum(['in', 'bring']),
    source: z.enum(['widget', 'notification', 'app']),
    has_oneoff_note: z.boolean(),
  }),
  flare_reply_cancelled: z.strictObject({
    type: z.enum(['in', 'bring']),
    source: z.enum(['widget', 'notification', 'app']),
    has_oneoff_note: z.boolean(),
  }),
  flare_closed: z.strictObject({
    outcome: z.enum(['done', 'expired', 'cancelled', 'replaced']),
    replies: count,
    orders: count,
  }),
  drink_run_completed: z.strictObject({ orders: count }),
  order_card_opened: z.strictObject({ source: z.enum(['run_list', 'friends']) }),
  barista_mode_opened: z.strictObject({ source: z.enum(['run_list', 'friends']) }),
  snap_shared: none,
  snap_reacted: z.strictObject({ reaction: reactionNameSchema }),
  snap_viewed: none,
  drink_logged: z.strictObject({
    kind: z.enum(['drink', 'water']),
    category: z.enum(LOG_CATEGORIES),
    source: z.enum(['widget', 'app']),
  }),
  drink_log_removed: z.strictObject({
    kind: z.enum(['drink', 'water']),
    category: z.enum(LOG_CATEGORIES),
    source: z.enum(['widget', 'app']),
  }),
  usual_details_saved: z.strictObject({
    category: z.enum(FLARE_CATEGORIES),
    fields_set: z.number().int().min(0).max(20),
  }),
  level_reached: z.strictObject({ level: z.number().int().min(1).max(8) }),
  report_submitted: z.strictObject({ target: z.enum(['snap', 'flare_photo', 'person']) }),
  user_blocked: z.strictObject({ target: z.enum(['snap', 'flare_photo', 'person']) }),
  notification_permission: z.strictObject({ result: z.enum(['granted', 'denied', 'not_now']) }),
  account_deleted: none,
  app_opened: z.strictObject({ entry: z.enum(['icon', 'widget', 'notification', 'link']) }),
} as const;

export type EventName = keyof typeof EVENT_PROPS;
export const EVENT_NAMES = Object.keys(EVENT_PROPS) as EventName[];
export const eventNameSchema = z.enum(EVENT_NAMES as [EventName, ...EventName[]]);
export type EventProps<N extends EventName> = z.infer<(typeof EVENT_PROPS)[N]>;

/** Who writes each event (PRD 6 "Sent by"). Server events also count widget and notification actions. */
export const EVENT_SENT_BY: Record<EventName, 'client' | 'server'> = {
  auth_signed_up: 'server',
  auth_signed_in: 'server',
  onboarding_step_viewed: 'client',
  onboarding_step_completed: 'client',
  onboarding_step_skipped: 'client',
  invite_share_tapped: 'client',
  invite_opened: 'client',
  invite_accepted: 'server',
  friend_added: 'server',
  friend_removed: 'server',
  // widget_added is server-written once per instance; widget_removed is sent by the client.
  widget_added: 'server',
  widget_removed: 'client',
  flare_sent: 'server',
  flare_reply: 'server',
  flare_reply_cancelled: 'server',
  flare_closed: 'server',
  drink_run_completed: 'server',
  order_card_opened: 'client',
  barista_mode_opened: 'client',
  snap_shared: 'server',
  snap_reacted: 'server',
  snap_viewed: 'client',
  drink_logged: 'server',
  drink_log_removed: 'server',
  usual_details_saved: 'client',
  level_reached: 'server',
  report_submitted: 'server',
  user_blocked: 'server',
  notification_permission: 'client',
  account_deleted: 'server',
  app_opened: 'client',
};

export const CLIENT_EVENTS = EVENT_NAMES.filter((n) => EVENT_SENT_BY[n] === 'client');

/** Database check on app_events.name (ARCHITECTURE.md 4.2). */
export const EVENT_NAME_RE = /^[a-z_]{3,40}$/;

/** A client event as the app sends it: name plus props, validated strictly. */
export const clientEventSchema = z
  .object({ name: eventNameSchema, props: z.record(z.string(), z.unknown()).default({}) })
  .superRefine((ev, ctx) => {
    if (EVENT_SENT_BY[ev.name] !== 'client') {
      ctx.addIssue({ code: 'custom', message: `${ev.name} is written by the server only` });
      return;
    }
    const r = EVENT_PROPS[ev.name].safeParse(ev.props);
    if (!r.success) {
      for (const issue of r.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['props', ...issue.path] });
      }
    }
  });

/** Validates one event's props. Throws on unknown or extra props. */
export function parseEventProps<N extends EventName>(name: N, props: unknown): EventProps<N> {
  return EVENT_PROPS[name].parse(props) as EventProps<N>;
}
