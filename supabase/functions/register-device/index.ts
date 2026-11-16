// Entry point deployed to Supabase Edge Functions. The logic is in handler.ts (tested in ../tests).
import { depsFromEnv } from '../_shared/deps.ts';
import { registerDevice } from './handler.ts';

Deno.serve(registerDevice(depsFromEnv()));
