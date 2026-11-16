// Key-value store primitives shared by storage.ts (web, tests) and storage.native.ts.

/** The shape Supabase Auth's `storage` option takes, so one store serves both. */
export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function memoryStore(seed: Record<string, string> = {}): KeyValue & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

/** Reads JSON, or null when the value is missing or unreadable. */
export async function readJson<T>(store: KeyValue, key: string): Promise<T | null> {
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(store: KeyValue, key: string, value: unknown): Promise<void> {
  try {
    await store.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store loses a cache entry, never the server's data.
  }
}
