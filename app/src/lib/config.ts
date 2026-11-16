// Public app configuration. The web domain doesn't exist until the trademark check clears
// (PRD 8 question 4), so legal pages have no URL yet and their links do nothing.
import Constants from 'expo-constants';

type LegalPage = 'terms' | 'privacy' | 'guidelines';

export function webBase(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { webBase?: string };
  return extra.webBase ?? null;
}

export function legalUrl(page: LegalPage): string | null {
  const base = webBase();
  return base ? `${base}/${page}` : null;
}
