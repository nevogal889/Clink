// A stand-in for the parts of SupabaseClient the adapter uses. Every call is recorded; each test
// answers queries with `onQuery` and edge functions with `onInvoke`. No network.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueryCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  values?: unknown;
  options?: unknown;
  columns?: string;
  filters: [string, string, unknown][];
  single: boolean;
}

export interface Resp {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string | null } | null;
  status?: number;
  count?: number | null;
}

export interface FakeSession {
  user: {
    id: string;
    phone?: string;
    phone_confirmed_at?: string | null;
    app_metadata?: { provider?: string };
    user_metadata?: Record<string, unknown>;
  };
  access_token: string;
}

class Query {
  call: QueryCall;
  constructor(
    table: string,
    private fake: FakeSupabase,
  ) {
    this.call = { table, op: 'select', filters: [], single: false };
  }
  select(columns?: string, opts?: unknown) {
    if (this.call.op === 'select') {
      this.call.columns = columns;
      if (opts) this.call.options = opts;
    } else {
      this.call.columns = columns;
    }
    return this;
  }
  insert(values: unknown) {
    Object.assign(this.call, { op: 'insert', values });
    return this;
  }
  update(values: unknown) {
    Object.assign(this.call, { op: 'update', values });
    return this;
  }
  upsert(values: unknown, options?: unknown) {
    Object.assign(this.call, { op: 'upsert', values, options });
    return this;
  }
  delete() {
    this.call.op = 'delete';
    return this;
  }
  private f(kind: string, col: string, v: unknown) {
    this.call.filters.push([kind, col, v]);
    return this;
  }
  eq(c: string, v: unknown) {
    return this.f('eq', c, v);
  }
  gt(c: string, v: unknown) {
    return this.f('gt', c, v);
  }
  is(c: string, v: unknown) {
    return this.f('is', c, v);
  }
  in(c: string, v: unknown) {
    return this.f('in', c, v);
  }
  not(c: string, op: string, v: unknown) {
    return this.f(`not.${op}`, c, v);
  }
  order(c: string, o?: unknown) {
    return this.f('order', c, o);
  }
  limit(n: number) {
    return this.f('limit', 'limit', n);
  }
  maybeSingle() {
    this.call.single = true;
    return this;
  }
  then<A, B>(ok: (v: Required<Resp>) => A, bad?: (e: unknown) => B) {
    this.fake.queries.push(this.call);
    return Promise.resolve()
      .then(() => this.fake.onQuery(this.call))
      .then((r) => {
        const data = r.data !== undefined ? r.data : this.call.single ? null : [];
        return {
          data: r.error ? null : data,
          error: r.error ?? null,
          status: r.status ?? (r.error ? 400 : 200),
          count: r.count ?? null,
        };
      })
      .then(ok, bad);
  }
}

export class FakeSupabase {
  session: FakeSession | null = null;
  queries: QueryCall[] = [];
  invokes: { name: string; body: unknown }[] = [];
  uploads: { bucket: string; path: string; bytes: number; options: unknown }[] = [];
  removed: { bucket: string; paths: string[] }[] = [];
  otpSent: string[] = [];
  signOuts: unknown[] = [];
  listeners: ((event: string, session: FakeSession | null) => void)[] = [];

  onQuery: (c: QueryCall) => Resp | Promise<Resp> = () => ({});
  onInvoke: (name: string, body: unknown) => { status: number; body: unknown } | 'offline' =
    () => ({
      status: 200,
      body: {},
    });
  onOtp: (phone: string) => { message: string; status: number; code?: string } | null = () => null;
  onVerify: (
    phone: string,
    token: string,
  ) => { error?: { message: string; status: number; code?: string } } | null = () => null;
  sessionError: { name?: string; message: string; status?: number } | null = null;

  constructor(readonly userId = '00000000-0000-4000-8000-000000000001') {}

  signedIn(extra: Partial<FakeSession['user']> = {}): this {
    this.session = {
      user: {
        id: this.userId,
        phone: '12015550104',
        phone_confirmed_at: '2026-11-16T07:00:00Z',
        app_metadata: { provider: 'phone' },
        user_metadata: {},
        ...extra,
      },
      access_token: 'token',
    };
    return this;
  }

  asClient(): SupabaseClient {
    const fake = this;
    const err = (e: { message: string; status: number; code?: string }) =>
      Object.assign(new Error(e.message), { name: 'AuthApiError', status: e.status, code: e.code });
    const client = {
      from: (table: string) => new Query(table, fake),
      auth: {
        async getSession() {
          if (fake.sessionError) {
            return {
              data: { session: null },
              error: Object.assign(new Error(fake.sessionError.message), fake.sessionError),
            };
          }
          return { data: { session: fake.session }, error: null };
        },
        async signInWithOtp({ phone }: { phone: string }) {
          fake.otpSent.push(phone);
          const e = fake.onOtp(phone);
          return { data: {}, error: e ? err(e) : null };
        },
        async verifyOtp({ phone, token }: { phone: string; token: string }) {
          const r = fake.onVerify(phone, token);
          if (r?.error) return { data: { session: null, user: null }, error: err(r.error) };
          fake.signedIn({ phone: phone.replace('+', '') });
          return { data: { session: fake.session, user: fake.session!.user }, error: null };
        },
        async signOut(opts: unknown) {
          fake.signOuts.push(opts);
          fake.session = null;
          for (const l of fake.listeners) l('SIGNED_OUT', null);
          return { error: null };
        },
        async updateUser(attrs: unknown) {
          fake.invokes.push({ name: 'auth.updateUser', body: attrs });
          return { data: {}, error: null };
        },
        onAuthStateChange(cb: (event: string, s: FakeSession | null) => void) {
          fake.listeners.push(cb);
          return {
            data: {
              subscription: {
                unsubscribe: () => (fake.listeners = fake.listeners.filter((l) => l !== cb)),
              },
            },
          };
        },
      },
      functions: {
        async invoke(name: string, { body }: { body: unknown }) {
          fake.invokes.push({ name, body });
          const r = fake.onInvoke(name, body);
          if (r === 'offline') {
            return {
              data: null,
              error: Object.assign(new Error('Failed to send a request'), {
                name: 'FunctionsFetchError',
              }),
            };
          }
          if (r.status >= 200 && r.status < 300) return { data: r.body, error: null };
          const res = new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { 'content-type': 'application/json' },
          });
          return {
            data: null,
            error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
              name: 'FunctionsHttpError',
              context: res,
            }),
          };
        },
      },
      storage: {
        from: (bucket: string) => ({
          async upload(path: string, bytes: Uint8Array, options: unknown) {
            fake.uploads.push({ bucket, path, bytes: bytes.length, options });
            return { data: { path }, error: null };
          },
          async createSignedUrl(path: string, sec: number) {
            return {
              data: { signedUrl: `https://signed.test/${bucket}/${path}?e=${sec}` },
              error: null,
            };
          },
          async remove(paths: string[]) {
            fake.removed.push({ bucket, paths });
            return { data: [], error: null };
          },
        }),
      },
    };
    return client as unknown as SupabaseClient;
  }

  /** The queries against one table, in order. */
  on(table: string): QueryCall[] {
    return this.queries.filter((q) => q.table === table);
  }
}

export const filter = (c: QueryCall, kind: string, col: string) =>
  c.filters.find(([k, name]) => k === kind && name === col)?.[2];
