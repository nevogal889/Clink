// Phone numbers (DESIGN.md 4.2, PRD 3.1 rule 3). Parsing is libphonenumber's; the server checks
// again whatever the client sends. A number is shown only to its owner (PRD 3.1 rule 5).
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

/** Launch markets first in the picker (DECISIONS.md, "Age and markets"). */
export const LAUNCH_COUNTRIES: CountryCode[] = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ'];

/** A loose shape check for the optional number field in onboarding step 4. */
export function looksLikePhone(input: string): boolean {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/** The device's region from its locale ("en-US" → US), else US. */
export function deviceCountry(locale?: string): CountryCode {
  let tag = locale;
  try {
    tag ??= Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    tag = undefined;
  }
  const region = /[-_]([A-Z]{2})\b/.exec(tag ?? '')?.[1];
  return region && (getCountries() as string[]).includes(region) ? (region as CountryCode) : 'US';
}

export function dialCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** Regional indicator letters; the system draws the flag. */
export function flagOf(country: CountryCode): string {
  return String.fromCodePoint(...[...country].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** The country's name as the system writes it, or its code where the runtime has no names. */
export function countryName(country: CountryCode): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(country) ?? country;
  } catch {
    return country;
  }
}

export function countryList(): CountryCode[] {
  const rest = getCountries()
    .filter((c) => !LAUNCH_COUNTRIES.includes(c))
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return [...LAUNCH_COUNTRIES, ...rest];
}

export interface ParsedPhone {
  e164: string;
  country: CountryCode | undefined;
}

/**
 * The typed number in E.164 when it can be a real number for the country (length and prefix).
 * A number typed with + and a country code wins over the picker.
 */
export function parsePhone(input: string, country: CountryCode): ParsedPhone | null {
  const text = input.trim();
  if (!/\d/.test(text)) return null;
  const parsed = text.startsWith('+')
    ? parsePhoneNumberFromString(text)
    : parsePhoneNumberFromString(text, country);
  if (!parsed || !parsed.isPossible()) return null;
  return { e164: parsed.number, country: parsed.country };
}

/** "+1 201 555 0104" for the code screen's sub-line. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
