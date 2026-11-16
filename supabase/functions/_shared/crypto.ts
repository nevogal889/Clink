// Small WebCrypto helpers: random tokens, SHA-256, HMAC for phone matching (ARCHITECTURE.md 8.1),
// AES-GCM for the stored Apple refresh token (5, 4.7).

const enc = new TextEncoder();

export type Bytes = Uint8Array<ArrayBuffer>;

export function randomToken(bytes = 32): Bytes {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

export function base64url(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64(b64: string): Bytes {
  const s = atob(b64.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function toBase64(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function sha256(data: Bytes | string): Promise<Bytes> {
  const input = typeof data === 'string' ? enc.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

export async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// phone_hmac = HMAC(pepper, sha256(E.164)). The device sends sha256(E.164) for contacts; the server
// computes the same for a user's own verified number. Supabase stores phones without the '+'.
export async function phoneHmac(pepper: Bytes, phone: string): Promise<Bytes> {
  const e164 = '+' + phone.replace(/[^0-9]/g, '');
  return hmacSha256(pepper, await sha256(e164));
}

// AES-256-GCM. Output: 12-byte IV followed by the ciphertext and tag.
function aesKey(keyBytes: Bytes): Promise<CryptoKey> {
  if (keyBytes.length !== 32) throw new Error('AES key must be 32 bytes');
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(keyBytes: Bytes, plaintext: string): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await aesKey(keyBytes),
      enc.encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

export async function decrypt(keyBytes: Bytes, data: Bytes): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12) },
    await aesKey(keyBytes),
    data.slice(12),
  );
  return new TextDecoder().decode(pt);
}
