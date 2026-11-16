// Picks the data layer implementation. Only the mock exists until the Supabase project does.
// On the web review build, `?mock=setup` starts signed in with a finished setup and sample data;
// without it the mock starts as a brand-new user at the sign-in screen.
import { Platform } from 'react-native';

import { createMockApi, type MockScenario } from './mock';
import type { ClinkApi } from './types';

export * from './types';
export { createMockApi } from './mock';

function scenarioFromUrl(): MockScenario {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'new';
  return /[?&]mock=setup\b/.test(window.location?.search ?? '') ? 'setup' : 'new';
}

export function createDefaultApi(): ClinkApi {
  return createMockApi({ scenario: scenarioFromUrl(), latencyMs: 250 });
}
