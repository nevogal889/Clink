// App state over the data layer. Screens read `state` and call `actions`; every action goes
// through ClinkApi, so the mock and Supabase behave the same here.
//
// Loading (PRD 3.20, DESIGN.md 4.21): the last good state is kept on the device (sealed store).
// If a refresh fails and a copy exists, the app shows it with `loadError: 'stale'` (the small
// retry line). With nothing cached it is `'full'` (the full-screen retry).
//
// The home-screen widget (lib/widget): register-device hands the widget its token once the
// account exists; every foreground and every change to the usual 3 or the tracker pushes a fresh
// widget state; sign-out and deletion clear the widget. Logs the widget hasn't sent yet are merged
// into Today by id, so a widget log shows once in the app (ARCHITECTURE.md 3.1, 3.2, 3.6).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as RNAppState } from 'react-native';

import {
  ApiError,
  createDefaultApi,
  type AgeAnswer,
  type Audience,
  type AuthMethod,
  type ClinkApi,
  type FlareRequest,
  type LiveFlare,
  type LogEntry,
  type LogInput,
  type Me,
  type OnboardingStep,
  type Session,
  type SnapRequest,
  type UsualDrink,
  type XpState,
} from './api';
import { localDate } from './api/supabase';
import {
  memoryStore,
  plainStore,
  readJson,
  sealedStore,
  writeJson,
  type KeyValue,
} from './storage';
import { lastEntry } from './tracker';
import {
  createPreviewHost,
  defaultWidgetHost,
  type InstalledWidget,
  type WidgetHost,
  type WidgetSize,
} from './widget/host';
import { mergeToday, widgetPendingLogs } from './widget/state';
import { createWidgetSync, type PushResult } from './widget/sync';

/** The refused age screen stays for 24 hours on this device (PRD 3.1 rule 10, M-05). */
export const AGE_REFUSED_MS = 24 * 60 * 60_000;
const DEFAULT_MIN_AGE = 16;

export type LoadError = 'none' | 'stale' | 'full';

/** A snackbar to show once the app reaches `on` (a pathname), e.g. after sign-in or deletion. */
export interface Notice {
  text: 'welcome_back' | 'deleted';
  name?: string;
  on: string;
}

export interface AppState {
  ready: boolean;
  session: Session | null;
  me: Me | null;
  usual: UsualDrink[];
  today: LogEntry[];
  xp: XpState | null;
  audience: Audience | null;
  lastPlace: string;
  live: LiveFlare | null;
  loadError: LoadError;
  /** Epoch ms until which this device shows the refused age screen, or null. */
  ageRefusedUntil: number | null;
  ageMin: number;
  notice: Notice | null;
  widgets: WidgetsState;
}

export interface WidgetsState {
  /** False where this platform has no widget yet (iOS until the Swift widget ships). */
  supported: boolean;
  /** Widgets on the home screen, or null until the first check. */
  installed: InstalledWidget[] | null;
}

export interface Actions {
  signIn(method: AuthMethod): Promise<void>;
  sendCode(e164: string): Promise<void>;
  /** Signs in with the code. `returning` is true when the account already finished setup. */
  verifyCode(e164: string, code: string): Promise<{ returning: boolean }>;
  /** Holds the age answer in memory until the name step creates the account. Never stored. */
  setAge(age: AgeAnswer): void;
  hasAge(): boolean;
  /** complete-signup with the held age answer. Throws ApiError `under_age`. */
  completeSignup(displayName: string): Promise<void>;
  updateMe(patch: Partial<Pick<Me, 'displayName' | 'photoUri'>>): Promise<void>;
  setStep(step: OnboardingStep): Promise<void>;
  setUsual(list: UsualDrink[]): Promise<void>;
  log(input: LogInput): Promise<LogEntry>;
  remove(entry: LogEntry): Promise<void>;
  restore(entry: LogEntry): Promise<void>;
  /** Removes the most recent entry and returns it, for the snackbar's Undo. */
  undoLast(): Promise<LogEntry | null>;
  sendFlare(req: FlareRequest): Promise<LiveFlare>;
  shareSnap(req: SnapRequest): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  markLevelSeen(level: number): Promise<void>;
  addPhone(e164: string): Promise<void>;
  retryLoad(): Promise<void>;
  clearNotice(): void;
  /** Reads which widgets are on the home screen (F8, ARCHITECTURE.md 3.5). */
  checkWidgets(): Promise<InstalledWidget[]>;
  /** Asks the launcher to add a widget. False where it can't (then the guide's steps). */
  pinWidget(size: WidgetSize): Promise<boolean>;
  /** Pushes this account's widget state now (after the debug screen's test states). */
  refreshWidget(): Promise<PushResult>;
}

interface Ctx {
  api: ClinkApi;
  /** The widget bridge. Screens use `state.widgets` and the actions; the debug screen this. */
  widgetHost: WidgetHost;
  state: AppState;
  actions: Actions;
}

const empty: AppState = {
  ready: false,
  session: null,
  me: null,
  usual: [],
  today: [],
  xp: null,
  audience: null,
  lastPlace: '',
  live: null,
  loadError: 'none',
  ageRefusedUntil: null,
  ageMin: DEFAULT_MIN_AGE,
  notice: null,
  widgets: { supported: false, installed: null },
};

interface Snapshot {
  userId: string;
  me: Me;
  usual: UsualDrink[];
  today: LogEntry[];
  xp: XpState | null;
  audience: Audience | null;
  lastPlace: string;
}

const SNAPSHOT = 'snapshot';
const AGE_FLAG = 'age_refused';

/** Signed out, keeping what belongs to the device (the age flag) and any pending notice. */
const signedOut = (s: AppState): AppState => ({
  ...empty,
  ready: true,
  ageRefusedUntil: s.ageRefusedUntil,
  ageMin: s.ageMin,
  notice: s.notice,
  widgets: s.widgets,
});

export function DataProvider({
  api: given,
  cache: givenCache,
  device: givenDevice,
  widgets: givenWidgets,
  widgetDebounceMs = 600,
  now = Date.now,
  children,
}: {
  api?: ClinkApi;
  /** Where the last good state is kept. Tests get memory; the app the sealed store. */
  cache?: KeyValue;
  /** Device flags (the age refusal). */
  device?: KeyValue;
  /** The widget bridge. Tests get the preview host; the app the native module. */
  widgets?: WidgetHost;
  /** Changes within this window go to the widget as one state (it counts toward 120 an hour). */
  widgetDebounceMs?: number;
  now?: () => number;
  children: ReactNode;
}) {
  const [api] = useState<ClinkApi>(() => given ?? createDefaultApi());
  const [cache] = useState<KeyValue>(() => givenCache ?? (given ? memoryStore() : sealedStore()));
  const [device] = useState<KeyValue>(() => givenDevice ?? (given ? memoryStore() : plainStore()));
  const [host] = useState<WidgetHost>(
    () => givenWidgets ?? (given ? createPreviewHost() : defaultWidgetHost()),
  );
  const [sync] = useState(() => createWidgetSync({ host, api, now: () => new Date(now()) }));
  const [state, setState] = useState<AppState>(() => ({
    ...empty,
    widgets: { supported: host.widgetsSupported, installed: null },
  }));
  const stateRef = useRef(state);
  const ageRef = useRef<AgeAnswer | null>(null);
  /** The widget's unsent logs, as tracker entries (merged into `today` by id). */
  const widgetPendingRef = useRef<LogEntry[]>([]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);

  const fromSnapshot = useCallback(
    async (userId: string | null): Promise<Partial<AppState> | null> => {
      const snap = await readJson<Snapshot>(cache, SNAPSHOT);
      if (!snap || (userId && snap.userId !== userId)) return null;
      const today = localDate(new Date(now()));
      return {
        me: snap.me,
        usual: snap.usual,
        today: snap.today.filter((e) => localDate(new Date(e.loggedAt)) === today),
        xp: snap.xp,
        audience: snap.audience,
        lastPlace: snap.lastPlace,
        live: null,
      };
    },
    [cache, now],
  );

  const loadAll = useCallback(async (): Promise<Me | null> => {
    const flag = await readJson<{ until: number; min: number }>(device, AGE_FLAG);
    const refused =
      flag && flag.until > now() ? { ageRefusedUntil: flag.until, ageMin: flag.min } : {};
    let session: Session | null;
    try {
      session = await api.getSession();
    } catch {
      // Offline while the token needed a refresh: show the last copy if there is one.
      const snap = await fromSnapshot(null);
      const userId = (await readJson<Snapshot>(cache, SNAPSHOT))?.userId;
      if (snap && userId) {
        patch({
          ...snap,
          ...refused,
          ready: true,
          session: { userId, method: 'phone', phone: null },
          loadError: 'stale',
        });
      } else {
        setState((s) => ({ ...signedOut(s), ...refused, loadError: 'full' }));
      }
      return snap?.me ?? null;
    }
    if (!session) {
      setState((s) => ({ ...signedOut(s), ...refused }));
      return null;
    }
    try {
      const [me, usual, today, xp, audience, lastPlace, live] = await Promise.all([
        api.getMe(),
        api.getUsual(),
        api.getToday(),
        api.getXp(),
        api.getAudience(),
        api.getLastPlace(),
        api.getLiveFlare(),
      ]);
      patch({
        ...refused,
        ready: true,
        session,
        me,
        usual,
        today: mergeToday(today, widgetPendingRef.current, new Date(now())),
        xp,
        audience,
        lastPlace,
        live,
        loadError: 'none',
      });
      return me;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unauthorized') {
        setState((s) => ({ ...signedOut(s), ...refused }));
        return null;
      }
      const snap = await fromSnapshot(session.userId);
      if (snap) patch({ ...snap, ...refused, ready: true, session, loadError: 'stale' });
      else patch({ ...refused, ready: true, session, me: null, loadError: 'full' });
      return snap?.me ?? null;
    }
  }, [api, cache, device, fromSnapshot, now, patch]);

  // First load from the data layer. The state updates happen when the requests resolve.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll().catch(() => patch({ ready: true, loadError: 'full' }));
  }, [loadAll, patch]);

  // A session that ends on its own (revoked, refresh refused) signs the app out, and the widget.
  useEffect(() => {
    if (!api.onSessionEnd) return;
    return api.onSessionEnd(() => {
      if (stateRef.current.session) void sync.signedOut();
      setState((s) => (s.session ? signedOut(s) : s));
    });
  }, [api, sync]);

  // Widget: register-device once per launch and account, which hands the widget its token.
  const accountId =
    state.ready && state.session && state.me && !state.me.needsSignup ? state.session.userId : null;
  useEffect(() => {
    if (accountId) void sync.register(accountId);
  }, [accountId, sync]);

  // Widget: every change the widget shows goes out as one state, shortly after it settles.
  useEffect(() => {
    if (!accountId || !sync.supported) return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      const pending = new Set(widgetPendingRef.current.map((e) => e.id));
      void sync.push({
        me: s.me,
        usual: s.usual,
        // The widget adds its own unsent logs; sending them too would count them twice.
        today: s.today.filter((e) => !pending.has(e.id)),
        audience: s.audience,
        lastPlace: s.lastPlace,
      });
    }, widgetDebounceMs);
    return () => clearTimeout(timer);
  }, [
    accountId,
    sync,
    widgetDebounceMs,
    state.me,
    state.usual,
    state.today,
    state.audience,
    state.lastPlace,
  ]);

  // Widget: on every foreground, hand over drops, read the installed widgets, and pick up the
  // widget's logs (unsent ones from its outbox, sent ones with a fresh tracker read).
  const foreground = useCallback(
    async (reread: boolean) => {
      if (!sync.supported) return;
      const fg = await sync.foreground();
      widgetPendingRef.current = widgetPendingLogs(fg.pending, stateRef.current.usual);
      const at = new Date(now());
      setState((s) => ({
        ...s,
        widgets: { supported: true, installed: fg.installed },
        today: s.session ? mergeToday(s.today, widgetPendingRef.current, at) : s.today,
      }));
      const s = stateRef.current;
      if (!reread || !s.session || !s.me || s.me.needsSignup) return;
      try {
        const today = await api.getToday();
        setState((st) =>
          st.session ? { ...st, today: mergeToday(today, widgetPendingRef.current, at) } : st,
        );
      } catch {
        // Offline: Today keeps what it has; the next foreground reads again.
      }
    },
    [api, now, sync],
  );
  useEffect(() => {
    if (!state.ready) return;
    void foreground(false);
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'active') void foreground(true);
    });
    return () => sub.remove();
  }, [state.ready, foreground]);

  // Keep the last good state for offline launches. Only a finished, freshly loaded state is kept.
  useEffect(() => {
    if (!state.ready || !state.session || !state.me || state.me.needsSignup) return;
    if (state.loadError === 'full') return;
    const snap: Snapshot = {
      userId: state.session.userId,
      me: state.me,
      usual: state.usual,
      today: state.today,
      xp: state.xp,
      audience: state.audience,
      lastPlace: state.lastPlace,
    };
    void writeJson(cache, SNAPSHOT, snap);
  }, [cache, state]);

  const actions = useMemo<Actions>(() => {
    // XP is awarded on the server (the daily log rule, 0009), so it is read again after a log
    // changes. Quietly: a failed refresh keeps the last total.
    const refreshXp = () => {
      api
        .getXp()
        .then((xp) => patch({ xp }))
        .catch(() => undefined);
    };
    const forget = async () => {
      ageRef.current = null;
      await cache.removeItem(SNAPSHOT);
    };
    return {
      async signIn(method) {
        await api.signIn(method);
        await loadAll();
      },
      async sendCode(e164) {
        await api.sendPhoneCode(e164);
      },
      async verifyCode(e164, code) {
        const before = stateRef.current.session?.userId ?? null;
        const session = await api.verifyPhoneCode(e164, code);
        if (before !== session.userId) await cache.removeItem(SNAPSHOT);
        const me = await loadAll();
        const returning = !!me && !me.needsSignup && me.onboarding === 'done';
        if (returning && me) {
          patch({
            notice: {
              text: 'welcome_back',
              name: me.displayName.trim().split(/\s+/)[0],
              on: '/camera',
            },
          });
        }
        return { returning };
      },
      setAge(age) {
        ageRef.current = age;
      },
      hasAge() {
        return ageRef.current !== null;
      },
      async completeSignup(displayName) {
        const age = ageRef.current;
        if (!age) throw new ApiError('bad_input');
        try {
          await api.completeSignup(age, displayName);
        } catch (e) {
          if (e instanceof ApiError && e.code === 'under_age') {
            const flag = { until: now() + AGE_REFUSED_MS, min: e.min ?? DEFAULT_MIN_AGE };
            await writeJson(device, AGE_FLAG, flag);
            await forget();
            setState((s) => ({
              ...signedOut(s),
              ageRefusedUntil: flag.until,
              ageMin: flag.min,
            }));
          }
          throw e;
        }
        ageRef.current = null;
        await loadAll();
      },
      async updateMe(p) {
        patch({ me: await api.updateMe(p) });
      },
      async setStep(step) {
        patch({ me: await api.updateMe({ onboarding: step }) });
      },
      async setUsual(list) {
        // Optimistic: the editor shows the change at once, the server confirms. Callers don't
        // wait, so a failed save resyncs from the server where it can, and never throws.
        patch({ usual: list });
        try {
          patch({ usual: await api.setUsual(list) });
        } catch {
          await api
            .getUsual()
            .then((usual) => patch({ usual }))
            .catch(() => undefined);
        }
      },
      async log(input) {
        const entry = await api.logDrink(input);
        setState((s) => ({ ...s, today: [...s.today, entry] }));
        refreshXp();
        return entry;
      },
      async remove(entry) {
        setState((s) => ({ ...s, today: s.today.filter((e) => e.id !== entry.id) }));
        await api.removeLog(entry.id);
        refreshXp();
      },
      async restore(entry) {
        setState((s) => ({
          ...s,
          today: [...s.today.filter((e) => e.id !== entry.id), entry].sort((a, b) =>
            a.loggedAt.localeCompare(b.loggedAt),
          ),
        }));
        await api.restoreLog(entry);
        refreshXp();
      },
      async undoLast() {
        const removed = lastEntry(stateRef.current.today);
        if (!removed) return null;
        setState((s) => ({ ...s, today: s.today.filter((e) => e.id !== removed.id) }));
        await api.removeLog(removed.id);
        refreshXp();
        return removed;
      },
      async sendFlare(req) {
        const live = await api.sendFlare(req);
        patch({ live, lastPlace: req.place });
        return live;
      },
      async shareSnap(req) {
        await api.shareSnap(req);
        if (req.place) patch({ lastPlace: req.place });
      },
      async signOut() {
        await api.signOut();
        await forget();
        await sync.signedOut();
        setState((s) => signedOut(s));
      },
      async deleteAccount() {
        await api.deleteAccount();
        await forget();
        await sync.signedOut();
        setState((s) => ({ ...signedOut(s), notice: { text: 'deleted', on: '/sign-in' } }));
      },
      async markLevelSeen(level) {
        await api.markLevelSeen(level);
        setState((s) =>
          s.xp ? { ...s, xp: { ...s.xp, levelSeen: Math.max(s.xp.levelSeen, level) } } : s,
        );
      },
      async addPhone(e164) {
        patch({ me: await api.addPhone(e164) });
      },
      async retryLoad() {
        await loadAll();
      },
      clearNotice() {
        patch({ notice: null });
      },
      async checkWidgets() {
        const installed = await sync.installed();
        setState((s) => ({ ...s, widgets: { ...s.widgets, installed } }));
        return installed;
      },
      async pinWidget(size) {
        if (!sync.supported) return false;
        try {
          return await host.requestPinWidget(size);
        } catch {
          return false;
        }
      },
      async refreshWidget() {
        const s = stateRef.current;
        const pending = new Set(widgetPendingRef.current.map((e) => e.id));
        return sync.push({
          me: s.me,
          usual: s.usual,
          today: s.today.filter((e) => !pending.has(e.id)),
          audience: s.audience,
          lastPlace: s.lastPlace,
        });
      },
    };
  }, [api, cache, device, host, loadAll, now, patch, sync]);

  const value = useMemo(
    () => ({ api, widgetHost: host, state, actions }),
    [api, host, state, actions],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

const DataContext = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
