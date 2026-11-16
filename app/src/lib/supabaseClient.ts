// The one Supabase client (ARCHITECTURE.md 5). Public URL and publishable key from app config
// `extra.supabase` (8.5). The session lives in the sealed store; on native the token refresh runs
// only while the app is in the foreground, as Supabase recommends for React Native.
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import type { KeyValue } from './kv';

export interface PublicSupabase {
  url: string;
  publishableKey: string;
}

type Extra = { api?: 'supabase' | 'mock'; supabase?: PublicSupabase; supabaseRegion?: string };

export function publicSupabase(): PublicSupabase | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  if (extra.api === 'mock') return null;
  const sb = extra.supabase;
  return sb?.url && sb.publishableKey ? sb : null;
}

/** The project's region (widget-api's x-region header), or null. Public, like the URL. */
export function publicRegion(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  return extra.supabaseRegion ?? null;
}

export function createSupabaseClient(cfg: PublicSupabase, storage: KeyValue): SupabaseClient {
  const client = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      storage,
      storageKey: 'clink.auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      ...(Platform.OS === 'web' ? {} : { lock: processLock }),
    },
  });
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (s) => {
      if (s === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }
  return client;
}
