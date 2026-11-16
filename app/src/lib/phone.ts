// A loose shape check for a phone number typed in onboarding step 4. The real parse (country,
// length, E.164) is libphonenumber's job once the phone flow is built (DESIGN.md 4.2); the server
// validates again whatever the client sends.
export function looksLikePhone(input: string): boolean {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
