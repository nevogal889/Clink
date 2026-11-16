// App state over the data layer. Screens read `state` and call `actions`; every action goes
// through ClinkApi, so swapping the mock for Supabase changes nothing here.
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

import {
  createDefaultApi,
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
import { lastEntry } from './tracker';

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
}

export interface Actions {
  signIn(method: AuthMethod): Promise<void>;
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
  markLevelSeen(level: number): Promise<void>;
  addPhone(e164: string): Promise<void>;
}

interface Ctx {
  api: ClinkApi;
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
};

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ api: given, children }: { api?: ClinkApi; children: ReactNode }) {
  const apiRef = useRef<ClinkApi>(given ?? createDefaultApi());
  const api = apiRef.current;
  const [state, setState] = useState<AppState>(empty);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);

  const loadAll = useCallback(async () => {
    const session = await api.getSession();
    if (!session) {
      patch({ ...empty, ready: true });
      return;
    }
    const [me, usual, today, xp, audience, lastPlace, live] = await Promise.all([
      api.getMe(),
      api.getUsual(),
      api.getToday(),
      api.getXp(),
      api.getAudience(),
      api.getLastPlace(),
      api.getLiveFlare(),
    ]);
    patch({ ready: true, session, me, usual, today, xp, audience, lastPlace, live });
  }, [api, patch]);

  useEffect(() => {
    loadAll().catch(() => patch({ ready: true }));
  }, [loadAll, patch]);

  const actions = useMemo<Actions>(
    () => ({
      async signIn(method) {
        await api.signIn(method);
        await loadAll();
      },
      async updateMe(p) {
        patch({ me: await api.updateMe(p) });
      },
      async setStep(step) {
        patch({ me: await api.updateMe({ onboarding: step }) });
      },
      async setUsual(list) {
        // Optimistic: the editor shows the change at once, the server confirms.
        patch({ usual: list });
        patch({ usual: await api.setUsual(list) });
      },
      async log(input) {
        const entry = await api.logDrink(input);
        setState((s) => ({ ...s, today: [...s.today, entry] }));
        return entry;
      },
      async remove(entry) {
        setState((s) => ({ ...s, today: s.today.filter((e) => e.id !== entry.id) }));
        await api.removeLog(entry.id);
      },
      async restore(entry) {
        setState((s) => ({
          ...s,
          today: [...s.today.filter((e) => e.id !== entry.id), entry].sort((a, b) =>
            a.loggedAt.localeCompare(b.loggedAt),
          ),
        }));
        await api.restoreLog(entry);
      },
      async undoLast() {
        const removed = lastEntry(stateRef.current.today);
        if (!removed) return null;
        setState((s) => ({ ...s, today: s.today.filter((e) => e.id !== removed.id) }));
        await api.removeLog(removed.id);
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
        patch({ ...empty, ready: true });
      },
      async markLevelSeen(level) {
        await api.markLevelSeen(level);
        setState((s) => (s.xp ? { ...s, xp: { ...s.xp, levelSeen: Math.max(s.xp.levelSeen, level) } } : s));
      },
      async addPhone(e164) {
        patch({ me: await api.addPhone(e164) });
      },
    }),
    [api, loadAll, patch],
  );

  const value = useMemo(() => ({ api, state, actions }), [api, state, actions]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
