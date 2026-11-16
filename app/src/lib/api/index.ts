// Picks the data layer. Supabase whenever app config carries the public URL and publishable key
// (app.config.ts, from supabase/projects.json or SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY), unless
// CLINK_API=mock. On the web review build, `?mock=new` or `?mock=setup` forces the in-memory mock:
// `new` starts as a brand-new user at sign-in, `setup` signed in with sample data.
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { webBase } from '../config';
import { prepareAvatar } from '../avatar';
import { plainStore, sealedStore } from '../storage';
import { createSupabaseClient, publicSupabase } from '../supabaseClient';
import { createMockApi, type MockScenario } from './mock';
import { createSupabaseApi } from './supabase';
import type { ClinkApi } from './types';

export * from './types';
export * from './errors';
export { createMockApi } from './mock';
export { createSupabaseApi } from './supabase';

function mockFromUrl(): MockScenario | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const m = /[?&]mock=(new|setup)\b/.exec(window.location?.search ?? '');
  return m ? (m[1] as MockScenario) : null;
}

export function createDefaultApi(): ClinkApi {
  const forced = mockFromUrl();
  const cfg = publicSupabase();
  if (forced || !cfg) return createMockApi({ scenario: forced ?? 'new', latencyMs: 250 });
  return createSupabaseApi({
    client: createSupabaseClient(cfg, sealedStore()),
    sealed: sealedStore(),
    plain: plainStore(),
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    uuid: randomUUID,
    prepareAvatar,
    inviteBase: webBase(),
    locale: () => Intl.DateTimeFormat().resolvedOptions().locale ?? null,
  });
}
