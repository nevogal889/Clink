// Native on-device stores (ARCHITECTURE.md 5, "Session storage"). The Supabase session is larger
// than SecureStore's comfortable value size on Android, so a random 256-bit AES key lives in the
// Keychain / Keystore and the values live as AES-GCM ciphertext in AsyncStorage. Losing the key
// (a restored backup on a new phone) makes the old ciphertext unreadable, which reads as "signed
// out" and an empty cache. Nothing here leaves the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { KeyValue } from './kv';

export * from './kv';

const KEY_NAME = 'clink.storage_key.v1';
let keyPromise: Promise<Uint8Array> | null = null;

function storageKey(): Promise<Uint8Array> {
  keyPromise ??= (async () => {
    const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    const hex = await SecureStore.getItemAsync(KEY_NAME, opts);
    if (hex && hex.length === 64) return hexToBytes(hex);
    const fresh = getRandomBytes(32);
    await SecureStore.setItemAsync(KEY_NAME, bytesToHex(fresh), opts);
    return fresh;
  })().catch((e: unknown) => {
    keyPromise = null;
    throw e;
  });
  return keyPromise;
}

/** AES-GCM over AsyncStorage: `nonce.ciphertext` in hex. The key name binds each value to its key. */
function sealed(prefix: string): KeyValue {
  return {
    async getItem(k) {
      const raw = await AsyncStorage.getItem(prefix + k);
      if (!raw) return null;
      const [nonceHex, ctHex] = raw.split('.');
      try {
        const key = await storageKey();
        const plain = gcm(key, hexToBytes(nonceHex ?? ''), utf8ToBytes(prefix + k)).decrypt(
          hexToBytes(ctHex ?? ''),
        );
        return bytesToUtf8(plain);
      } catch {
        await AsyncStorage.removeItem(prefix + k);
        return null;
      }
    },
    async setItem(k, v) {
      const key = await storageKey();
      const nonce = getRandomBytes(12);
      const ct = gcm(key, nonce, utf8ToBytes(prefix + k)).encrypt(utf8ToBytes(v));
      await AsyncStorage.setItem(prefix + k, `${bytesToHex(nonce)}.${bytesToHex(ct)}`);
    },
    async removeItem(k) {
      await AsyncStorage.removeItem(prefix + k);
    },
  };
}

function plainAsync(prefix: string): KeyValue {
  return {
    getItem: (k) => AsyncStorage.getItem(prefix + k),
    setItem: (k, v) => AsyncStorage.setItem(prefix + k, v),
    removeItem: (k) => AsyncStorage.removeItem(prefix + k),
  };
}

let sealedKv: KeyValue | null = null;
let plainKv: KeyValue | null = null;

export function sealedStore(): KeyValue {
  return (sealedKv ??= sealed('clink.s.'));
}

export function plainStore(): KeyValue {
  return (plainKv ??= plainAsync('clink.p.'));
}
