// Entry point deployed to Supabase Edge Functions with verify_jwt off: the gateway does not check
// a Supabase JWT, this function checks its own widget token. The logic is in handler.ts.
import { depsFromEnv } from '../_shared/deps.ts';
import { widgetApi } from './handler.ts';

Deno.serve(widgetApi(depsFromEnv()));
