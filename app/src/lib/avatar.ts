// Turns a picked photo into the avatar file Storage accepts: a JPEG 512 px wide, under the
// avatars bucket's 1 MB limit (0015_storage.sql). Re-encoding also drops EXIF, location included
// (ARCHITECTURE.md 8.2).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const AVATAR_SIZE = 512;
export const AVATAR_MAX_BYTES = 1_048_576;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (no data: prefix) to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i] ?? 'A') << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]!) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]!) : 0);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2]) out[o++] = (n >> 8) & 255;
    if (clean[i + 3]) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

export async function prepareAvatar(uri: string): Promise<Uint8Array> {
  for (const compress of [0.8, 0.6, 0.4]) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: AVATAR_SIZE }).renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    const bytes = base64ToBytes(saved.base64 ?? '');
    if (bytes.length > 0 && bytes.length <= AVATAR_MAX_BYTES) return bytes;
  }
  throw new Error('avatar_too_large');
}
