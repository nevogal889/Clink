// On-device key-value stores. This file serves the web review build and tests; native builds use
// storage.native.ts, with the same exports. Every value here stays on this device.
//
// - `sealedStore()`: the Supabase session and cached personal data (name, usual 3, today's
//   drinks). Native: AES-GCM ciphertext with the key in the Keychain / Keystore
//   (ARCHITECTURE.md 5). Web review build: localStorage.
// - `plainStore()`: non-personal flags (install id, the age-refused flag, the level already seen).
import { memoryStore, type KeyValue } from './kv';

export * from './kv';

/** localStorage when the page has it (blocked or private modes throw), else memory. */
function webStore(prefix: string): KeyValue {
  const fallback = memoryStore();
  const ls = (): Storage | null => {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    async getItem(k) {
      try {
        const s = ls();
        return s ? s.getItem(prefix + k) : fallback.getItem(k);
      } catch {
        return fallback.getItem(k);
      }
    },
    async setItem(k, v) {
      try {
        const s = ls();
        if (s) s.setItem(prefix + k, v);
        else await fallback.setItem(k, v);
      } catch {
        await fallback.setItem(k, v);
      }
    },
    async removeItem(k) {
      try {
        ls()?.removeItem(prefix + k);
      } catch {
        // nothing stored
      }
      await fallback.removeItem(k);
    },
  };
}

let sealed: KeyValue | null = null;
let plain: KeyValue | null = null;

export function sealedStore(): KeyValue {
  return (sealed ??= webStore('clink.s.'));
}

export function plainStore(): KeyValue {
  return (plain ??= webStore('clink.p.'));
}
