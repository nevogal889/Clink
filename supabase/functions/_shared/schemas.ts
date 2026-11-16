// Request schemas for the edge functions. They live once in packages/shared/src/api and are copied
// here by scripts/supabase/sync-shared.mjs (_shared/shared, generated).
export {
  type CompleteSignupInput,
  completeSignupInput,
  type DeleteAccountInput,
  deleteAccountInput,
  type RegisterDeviceInput,
  registerDeviceInput,
} from './shared/api/index.ts';
