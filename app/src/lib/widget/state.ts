// The widget state the app can build or patch itself (ARCHITECTURE.md 3.1 "What the app writes":
// fetch widget-api/state, "or build the same JSON"). The server's state is the normal source; the
// app builds one only when that call can't be made (offline, no widget token yet), so the widget
// still shows a log made in the app. Derived fields use the shared builders widget-api uses.
import {
  CAPS,
  TEXT_LIMITS,
  charLength,
  usualSlotFromRow,
  widgetInitial,
  widgetStateSchema,
  type OutboxEntry,
  type WidgetState,
} from '@clink/shared';

import type { Audience, LogEntry, Me, UsualDrink } from '../api/types';
import { summarizeToday } from '../tracker';

/** What the app knows that the widget shows. */
export interface AppWidgetInput {
  me: Me | null;
  usual: readonly UsualDrink[];
  /** Today's entries, without the widget's own unsent logs (the widget adds those itself). */
  today: readonly LogEntry[];
  audience: Audience | null;
  lastPlace: string;
}

/** `YYYY-MM-DDTHH:MM:SSZ`: the timestamp form every widget decoder reads. */
export function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Device-local calendar date, YYYY-MM-DD (the Today view's day, PRD 3.11 rule 2). */
export function deviceDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Ready = Extract<WidgetState, { state: 'ready' }>;

export function todayBlock(entries: readonly LogEntry[], now: Date): Ready['today'] {
  const day = deviceDate(now);
  const mine = entries.filter((e) => deviceDate(new Date(e.loggedAt)) === day);
  const s = summarizeToday(mine, now);
  return {
    localDate: day,
    drinks: s.drinks,
    water: s.water,
    caffeinated: s.caffeinated,
    lastDrinkAt: s.lastDrinkAt ? isoSeconds(s.lastDrinkAt) : null,
  };
}

function usualBlock(usual: readonly UsualDrink[]): Ready['usual'] {
  return usual.slice(0, 3).map((u, i) =>
    usualSlotFromRow({
      slot: i + 1,
      drinkId: u.drinkId,
      customName: u.customName,
      category: u.category,
      details: u.details,
    }),
  );
}

const fits = (s: string, max: number) => charLength(s) <= max;

/** The whole state from app data. Null when there is nothing to show yet (no account). */
export function buildWidgetState(input: AppWidgetInput, now: Date): WidgetState | null {
  const { me } = input;
  if (!me || me.needsSignup) return null;
  const header = { v: 1 as const, updatedAt: isoSeconds(now) };
  if (me.onboarding !== 'done') return { ...header, state: 'setup' };
  const audience = input.audience ?? {
    friendCount: 0,
    groups: [],
    auto: { daytimeGroupId: null, otherGroupId: null },
  };
  const groups = audience.groups
    .filter((g) => fits(g.name, TEXT_LIMITS.groupName))
    .slice(0, 10)
    .map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji && g.emoji.length <= TEXT_LIMITS.groupEmoji ? g.emoji : null,
      memberCount: Math.min(g.memberCount, CAPS.friends),
      avatarFiles: [],
    }));
  const place = input.lastPlace.trim();
  const state: WidgetState = {
    ...header,
    state: 'ready',
    me: {
      initial: widgetInitial(me.displayName),
      friendsCount: Math.min(audience.friendCount, CAPS.friends),
    },
    usual: usualBlock(input.usual),
    today: todayBlock(input.today, now),
    groups,
    auto: audience.auto,
    lastPlace: place && fits(place, TEXT_LIMITS.place) ? place : null,
    myFlare: null,
    incoming: [],
    snaps: [],
    outbox: [],
  };
  return widgetStateSchema.safeParse(state).success ? state : null;
}

/**
 * The last state the server sent, with what the app changed since: usual 3 and today's counts.
 * Friends' flares, snaps and groups stay as the server last said. Without a server state, or
 * when the account's setup state changed, the app's own build.
 */
export function patchWidgetState(
  server: WidgetState | null,
  input: AppWidgetInput,
  now: Date,
): WidgetState | null {
  const built = buildWidgetState(input, now);
  if (!built || built.state !== 'ready' || !server || server.state !== 'ready') return built;
  const patched: WidgetState = {
    ...server,
    updatedAt: built.updatedAt,
    me: { ...server.me, initial: built.me.initial },
    usual: built.usual,
    today: built.today,
    outbox: [],
  };
  return widgetStateSchema.safeParse(patched).success ? patched : built;
}

/**
 * The widget's logs that haven't reached the server yet, as tracker entries, so the app's Today
 * shows them at once (same id as the server row they become, so nothing doubles). A custom drink
 * takes its name from the usual slot it was picked from; a saved Decaf keeps counting as Decaf.
 */
export function widgetPendingLogs(
  pending: readonly OutboxEntry[],
  usual: readonly UsualDrink[],
): LogEntry[] {
  const out: LogEntry[] = [];
  for (const e of pending) {
    if (e.op !== 'log') continue;
    const p = e.payload;
    const slot = p.slot ? usual[p.slot - 1] : undefined;
    const sameSlot = !!slot && slot.drinkId === p.drinkId && slot.category === p.category;
    if (p.drinkId === null && !sameSlot) continue; // custom drink whose slot changed since
    out.push({
      id: e.id,
      drinkId: p.drinkId,
      customName: p.drinkId === null ? (slot?.customName ?? null) : null,
      category: p.category,
      details: sameSlot ? { ...slot.details } : {},
      loggedAt: new Date(p.loggedAt).toISOString(),
    });
  }
  return out;
}

/** Today's entries plus the widget's unsent logs of today, by id, oldest first. */
export function mergeToday(
  entries: readonly LogEntry[],
  widgetPending: readonly LogEntry[],
  now: Date,
): LogEntry[] {
  const day = deviceDate(now);
  const byId = new Map<string, LogEntry>();
  for (const e of widgetPending) {
    if (deviceDate(new Date(e.loggedAt)) === day) byId.set(e.id, e);
  }
  // The app's and the server's copy win: same id, same log.
  for (const e of entries) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}
