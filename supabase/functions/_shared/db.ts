// Database access for edge functions (ARCHITECTURE.md 4.4, RISK_REVIEW.md S-01).
// One direct Postgres connection (SUPABASE_DB_URL, provided to every Supabase edge function).
// Reads that return other people's data run as the user, so RLS applies. Writes run as service_role
// through private functions. The caller always comes from the verified JWT, never from the body.
import postgres from 'postgres';
import { HttpError } from './http.ts';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function connect(url: string | undefined = Deno.env.get('SUPABASE_DB_URL')): Sql {
  if (!url) throw new Error('SUPABASE_DB_URL is not set');
  // prepare: false works through the Supavisor transaction pooler as well as a direct connection.
  return postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
}

// Production refuses a moved clock (ARCHITECTURE.md 9).
async function assertClockSafe(tx: Tx): Promise<void> {
  if (Deno.env.get('CLINK_ENV') !== 'prod') return;
  const rows = await tx`select 1 from private.clock_offset limit 1`;
  if (rows.length > 0) throw new HttpError(500, 'clock_offset_in_prod');
}

export function asService<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'service_role', true), set_config('request.jwt.claims', '', true)`;
    await assertClockSafe(tx);
    return await fn(tx);
  }) as Promise<T>;
}

export function asUser<T>(sql: Sql, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`;
    return await fn(tx);
  }) as Promise<T>;
}
