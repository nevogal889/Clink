// Request schemas for the M1 functions. These belong in packages/shared/src/api (owned by the Shared
// unit) and come back here through scripts/sync-shared-to-functions; they live here until that
// module exists (docs/build-notes/database.md). Limits match PRD.md (display name 1 to 30).
import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const timezone = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/);

export const completeSignupInput = z
  .object({
    birthMonth: z.number().int().min(1).max(12),
    birthYear: z.number().int().min(1900).max(2100),
    displayName: z.string().trim().min(1).max(30),
    timezone,
    installId: uuid,
    appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type CompleteSignupInput = z.infer<typeof completeSignupInput>;

const token = z.string().min(1).max(4096);

export const registerDeviceInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('register'),
      installId: uuid,
      platform: z.enum(['ios', 'android']),
      appVersion: z.string().min(1).max(40),
      pushToken: token.nullish(),
      apnsEnv: z.enum(['sandbox', 'production']).nullish(),
      locale: z.string().max(35).nullish(),
      timezone: timezone.nullish(),
      notifPermission: z.boolean().default(false),
      laPushToStartToken: token.nullish(),
      widgetPushToken: token.nullish(),
    })
    .strict(),
  z.object({ action: z.literal('signout'), installId: uuid }).strict(),
]);
export type RegisterDeviceInput = z.infer<typeof registerDeviceInput>;

export const deleteAccountInput = z
  .object({
    appleAuthorizationCode: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountInput>;
