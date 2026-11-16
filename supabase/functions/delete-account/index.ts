// Entry point deployed to Supabase Edge Functions. The logic is in handler.ts (tested in ../tests).
import { depsFromEnv } from '../_shared/deps.ts';
import { deleteAccount } from './handler.ts';

Deno.serve(deleteAccount(depsFromEnv()));
