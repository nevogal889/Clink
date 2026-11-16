// In-memory implementation of ClinkApi for unit tests and the offline review build (`?mock=` on
// the web build, or CLINK_API=mock). Nothing leaves the device and nothing persists across a
// reload. Names and places here are test data, standing in for what the server would return.
// Simplification: Apple and Google sign-in skip the age check here; the phone flow runs it.
import {
  flareExpiresAt,
  isFlareDrink,
  getDrink,
  type DrinkDetails,
  type FlareCategory,
} from '@clink/shared';

import { buildWidgetState } from '../widget/state';
import { ApiError } from './errors';
import type {
  AgeAnswer,
  Audience,
  AuthMethod,
  ClinkApi,
  ContactMatch,
  LiveFlare,
  LogEntry,
  Me,
  PermissionResult,
  Session,
  UsualDrink,
  XpState,
} from './types';

export type MockScenario = 'new' | 'setup';

/** The code the mock accepts in the phone flow. Any other 6 digits is a wrong code. */
export const MOCK_CODE = '123456';
const MOCK_MIN_AGE = 16;

export interface MockOptions {
  scenario?: MockScenario;
  /** Artificial latency in ms, so loading states show. 0 in tests. */
  latencyMs?: number;
  now?: () => Date;
}

interface MockState {
  session: Session | null;
  me: Me;
  usual: UsualDrink[];
  logs: LogEntry[];
  xp: XpState;
  audience: Audience;
  lastPlace: string;
  live: LiveFlare | null;
  contactsAllowed: boolean | null;
  contacts: ContactMatch[];
  shares: number;
  notifications: PermissionResult | null;
  /** register-device calls that issued a token. */
  registrations: number;
  snapsShared: number;
}

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}_${(++idSeq).toString(36)}`;

function catalogUsual(drinkId: string, details: DrinkDetails = {}): UsualDrink {
  const d = getDrink(drinkId);
  if (!d || !isFlareDrink(drinkId)) throw new Error(`${drinkId} can't be a usual drink`);
  return { drinkId, customName: null, category: d.category as FlareCategory, details };
}

function seed(scenario: MockScenario, now: Date): MockState {
  const base: MockState = {
    session: null,
    me: {
      displayName: '',
      photoUri: null,
      providerName: null,
      hasPhone: false,
      onboarding: 'name',
      needsSignup: false,
    },
    usual: [],
    logs: [],
    xp: { total: 0, history: [], levelSeen: 1 },
    audience: { friendCount: 0, groups: [], auto: { daytimeGroupId: null, otherGroupId: null } },
    lastPlace: '',
    live: null,
    contactsAllowed: null,
    contacts: [
      { id: 'c_ana', name: 'Ana Ruiz', state: 'none' },
      { id: 'c_sam', name: 'Sam Okafor', state: 'none' },
    ],
    shares: 0,
    notifications: null,
    registrations: 0,
    snapsShared: 0,
  };
  if (scenario === 'new') return base;

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  // Earlier today, never before midnight even when the review runs just after it.
  const ago = (min: number, i: number) =>
    new Date(Math.max(now.getTime() - min * 60_000, midnight.getTime() + i * 60_000)).toISOString();
  const log = (drinkId: string, min: number, i: number, details: DrinkDetails = {}): LogEntry => {
    const d = getDrink(drinkId);
    if (!d) throw new Error(drinkId);
    return {
      id: nextId('log'),
      drinkId,
      customName: null,
      category: d.category,
      details,
      loggedAt: ago(min, i),
    };
  };
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  return {
    ...base,
    session: { userId: 'u_me', method: 'apple', phone: null },
    me: {
      displayName: 'Dana Kim',
      photoUri: null,
      providerName: 'Dana',
      hasPhone: false,
      onboarding: 'done',
      needsSignup: false,
    },
    usual: [
      catalogUsual('coffee.flat_white', {
        size: 'Regular',
        milk: 'Oat milk',
        sweet: 'No sugar',
        note: 'Very hot',
      }),
      catalogUsual('matcha.latte', { temp: 'Iced', ice: 'Light ice', milk: 'Oat milk' }),
      catalogUsual('tea.jasmine'),
    ],
    logs: [
      log('coffee.flat_white', 420, 1, { milk: 'Oat milk' }),
      log('water.still', 360, 2),
      log('coffee.americano', 260, 3),
      log('matcha.latte', 170, 4, { temp: 'Iced' }),
      log('water.sparkling', 140, 5),
      log('tea.english_breakfast', 102, 6),
    ],
    xp: {
      total: 380,
      levelSeen: 2,
      history: [
        { id: 'x1', kind: 'daily_log', amount: 5, name: null, at: day(0) },
        { id: 'x2', kind: 'flare_joined', amount: 10, name: 'Maya', at: day(1) },
        { id: 'x3', kind: 'drink_run_done', amount: 20, name: 'Leo', at: day(1) },
        { id: 'x4', kind: 'flare_got_joiner', amount: 15, name: null, at: day(2) },
        { id: 'x5', kind: 'invite_accepted', amount: 50, name: 'Leo', at: day(4) },
        { id: 'x6', kind: 'invite_accepted', amount: 50, name: 'Maya', at: day(5) },
      ],
    },
    audience: {
      friendCount: 5,
      groups: [
        { id: 'g_work', name: 'Work', emoji: '💼', memberCount: 3 },
        { id: 'g_home', name: 'Home friends', emoji: '🏠', memberCount: 2 },
      ],
      auto: { daytimeGroupId: 'g_work', otherGroupId: 'g_home' },
    },
    lastPlace: 'Kaffa Roastery',
  };
}

export function createMockApi(opts: MockOptions = {}): ClinkApi & { state: MockState } {
  const now = opts.now ?? (() => new Date());
  const latency = opts.latencyMs ?? 0;
  const state = seed(opts.scenario ?? 'new', now());

  const wait = <T>(v: T, ms = latency): Promise<T> =>
    ms > 0 ? new Promise((r) => setTimeout(() => r(v), ms)) : Promise.resolve(v);
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  const todayLogs = () => {
    const midnight = new Date(now());
    midnight.setHours(0, 0, 0, 0);
    return state.logs.filter((l) => new Date(l.loggedAt) >= midnight);
  };

  const api: ClinkApi & { state: MockState } = {
    state,
    getSession: () => wait(clone(state.session)),
    async signIn(method: AuthMethod) {
      state.session = { userId: 'u_me', method, phone: null };
      if (!state.me.providerName && method !== 'phone') state.me.providerName = 'Dana';
      return wait(clone(state.session), latency * 2);
    },
    async signOut() {
      state.session = null;
    },
    async sendPhoneCode(e164) {
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) throw new ApiError('phone_invalid');
      await wait(undefined, latency * 2);
    },
    async verifyPhoneCode(e164, code) {
      await wait(undefined, latency * 2);
      if (code !== MOCK_CODE) throw new ApiError('code_wrong');
      const isNew = state.me.displayName === '';
      state.session = { userId: 'u_me', method: 'phone', phone: e164 };
      state.me.hasPhone = true;
      if (isNew) state.me.needsSignup = true;
      return clone(state.session);
    },
    async completeSignup(age: AgeAnswer, displayName: string) {
      await wait(undefined, latency * 2);
      const today = now();
      const months =
        (today.getUTCFullYear() - age.birthYear) * 12 + (today.getUTCMonth() + 1 - age.birthMonth);
      // Born in the month that makes them exactly the minimum counts as old enough.
      if (months < MOCK_MIN_AGE * 12) {
        state.session = null;
        state.me = seed('new', today).me;
        throw new ApiError('under_age', { min: MOCK_MIN_AGE });
      }
      state.me.needsSignup = false;
      state.me.displayName = displayName.trim();
    },
    async deleteAccount() {
      await wait(undefined, latency * 2);
      const fresh = seed('new', now());
      Object.assign(state, fresh);
    },

    getMe: () => wait(clone(state.me)),
    async updateMe(patch) {
      state.me = { ...state.me, ...patch };
      return wait(clone(state.me));
    },
    async addPhone() {
      state.me.hasPhone = true;
      return wait(clone(state.me));
    },

    getUsual: () => wait(clone(state.usual)),
    async setUsual(drinks) {
      if (drinks.length > 3) throw new Error('At most 3 usual drinks');
      for (const d of drinks)
        if (d.drinkId && !isFlareDrink(d.drinkId)) throw new Error('Water never takes a slot');
      state.usual = clone(drinks);
      return wait(clone(state.usual));
    },

    getToday: () => wait(clone(todayLogs())),
    async logDrink(input) {
      const entry: LogEntry = { id: nextId('log'), ...clone(input), loggedAt: now().toISOString() };
      state.logs.push(entry);
      return wait(clone(entry));
    },
    async removeLog(id) {
      state.logs = state.logs.filter((l) => l.id !== id);
      await wait(undefined);
    },
    async restoreLog(entry) {
      if (!state.logs.some((l) => l.id === entry.id)) state.logs.push(clone(entry));
      state.logs.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
      await wait(undefined);
    },

    getXp: () => wait(clone(state.xp)),
    async markLevelSeen(level) {
      state.xp.levelSeen = Math.max(state.xp.levelSeen, level);
    },

    getAudience: () => wait(clone(state.audience)),
    getLastPlace: () => wait(state.lastPlace),
    getLiveFlare: () => wait(clone(state.live)),
    async sendFlare(req) {
      if (state.audience.friendCount === 0) throw new Error('No friends yet');
      const createdAt = now();
      state.lastPlace = req.place;
      state.live = {
        id: nextId('flare'),
        category: req.category,
        place: req.place,
        createdAt: createdAt.toISOString(),
        expiresAt: flareExpiresAt(createdAt, req.timingMin).toISOString(),
      };
      return wait(clone(state.live), Math.max(latency, 0) * 3);
    },

    async shareSnap(req) {
      if (!req.photoUri) throw new Error('No photo');
      state.snapsShared += 1;
      if (req.place) state.lastPlace = req.place;
      await wait(undefined, latency * 2);
    },

    getInviteUrl: () => wait('https://example.invalid/i/MOCK0000'),
    async recordInviteShare() {
      state.shares += 1;
    },
    async requestContacts() {
      state.contactsAllowed = true;
      return wait<PermissionResult>('granted');
    },
    getContactMatches: () => wait(state.contactsAllowed ? clone(state.contacts) : []),
    async addContact(id) {
      const c = state.contacts.find((x) => x.id === id);
      if (!c) throw new Error('No such contact');
      c.state = 'requested';
      return wait(clone(c));
    },

    async requestNotifications() {
      state.notifications = 'granted';
      return wait<PermissionResult>('granted');
    },

    async registerDevice() {
      // The real token is 32 random bytes; this one only has the same shape.
      if (!state.session || state.me.needsSignup) return null;
      state.registrations += 1;
      const n = String(state.registrations);
      return wait({ widgetToken: 'mock_widget_token_'.padEnd(43 - n.length, 'x') + n });
    },
    async getWidgetState() {
      if (!state.session) throw new ApiError('unauthorized');
      return wait(
        buildWidgetState(
          {
            me: state.me,
            usual: state.usual,
            today: todayLogs(),
            audience: state.audience,
            lastPlace: state.lastPlace,
          },
          now(),
        ),
      );
    },
  };
  return api;
}
