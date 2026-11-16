# Database and function tests

Everything here runs on a plain Postgres 16 with pgTAP, without a Supabase account or project.

## What's here

| Path | What |
|---|---|
| `setup/00_supabase_shim.sql` | Test-only stand-in for what Supabase provides: roles `anon`, `authenticated`, `service_role` (bypasses RLS), `auth.users`, `auth.identities`, `auth.audit_log_entries`, `auth.uid()`, `auth.role()`, `auth.jwt()`, `storage.buckets`, `storage.objects` (RLS on), `storage.foldername()`, schema `extensions`, and Supabase's default grants in `public`. Never applied to a real project. |
| `setup/01_test_helpers.sql` | Schema `tests`: `create_user`, `seed` (the standard graph, below), `rows_as` / `run` / `affected` (run one statement as a user, `anon` or `service`, then switch back), `q` / `qrun` (the same as SQL text for `throws_ok`), `set_clock` / `set_clock_to` (moves `private.app_now()`), `flare`, `give_usual`, `befriend`. |
| `00_security.test.sql` | RLS on every public table, no anon grants, no client grants in `private`, only the 4 helpers executable by `authenticated`, every other private function fails with `permission denied` when called, `search_path` pinned on every security definer function, no views in `public`, no quiet-hours column, policies use `(select auth.uid())`. |
| `01` to `10_*.test.sql` | Allow and deny cases per table and function (profiles, settings, friends and the 20 cap, groups, usual 3, tracker, last drink, flares and audience T22 to T32, XP caps and reversals, snaps, reports, storage, invites, sign-up, devices, deletion cascade, retention). |
| `12_widget_api.test.sql` | Widget tokens (0019): resolve, rotate, the 120-per-hour device limit, revocation when another account takes the install, on suspension, sign-out and deletion; `widget_added` once per instance (20 per device); the idempotent widget log and its refusals; no client access. |
| `concurrency/races.sh` | Two real sessions racing: the 20-friend cap and one live flare per sender. |
| `../functions/tests/*.test.ts` | Deno tests for `complete-signup`, `register-device`, `delete-account` and `widget-api` against the same database, with fakes for Auth admin, Storage, push and Apple. |

Standard graph from `tests.seed()`: `a` me; `b` friend; `c` stranger; `d` blocked by `a`; `e` friend outside the Work group; `f` suspended friend; `g` sent `a` a request; `h` got a request from `a`; `w` friend in `a`'s Work group; `k` friend in `a`'s Home friends group.

## Run it

pgTAP and `pg_prove`: `apt-get install postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl` (already on this container). `initdb` refuses root, so run the server as `postgres`:

```
mkdir -p /tmp/clink-db && chown postgres /tmp/clink-db
runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D /tmp/clink-db/data -U postgres --auth=trust
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/clink-db/data -o "-p 55440 -k /tmp/clink-db" -l /tmp/clink-db/log start

# 1. pgTAP: fresh database, shim, migrations, every *.test.sql
PGHOST=/tmp/clink-db PGPORT=55440 PGUSER=postgres npm run test:db

# 2. races (uses the database step 1 left behind)
PGHOST=/tmp/clink-db PGPORT=55440 PGUSER=postgres bash supabase/tests/concurrency/races.sh

# 3. edge functions (Deno 2; `npm i deno` in a scratch folder works if it isn't installed)
cd supabase/functions
CLINK_TEST_DB_URL=postgres://postgres@127.0.0.1:55440/clink_pgtap deno test --allow-env --allow-net tests/
deno lint && deno check */index.ts
```

Behind the agent proxy here, Deno also needs `DENO_CERT=/root/.ccr/ca-bundle.crt` to fetch npm and jsr packages. Without `CLINK_TEST_DB_URL` the database-backed Deno tests are skipped and only the unit tests run.

## Writing a test

- One transaction per file: `begin; select plan(n); ... select * from finish(); rollback;`.
- Never leave the role switched between statements. Use `tests.rows_as('b', 'select ...')`, `tests.run('b', 'expr')` or `tests.affected('b', 'update ...')`, so pgTAP itself always runs as the migration role. For an expected error: `select throws_ok(tests.q('b', 'insert ...'), '42501', null, 'why')`.
- Our functions raise SQLSTATE class `CL` with the API code as the message (`CLTXT text_blocked`, `CLCAP friend_cap`, ...; list in `migrations/0003_clock_people.sql`). Test with `throws_ok(sql, 'CLCAP', 'friend_cap', ...)`.
- Every new policy gets an allow and a deny case. Every new `private` function is covered by `00_security` automatically.

## Not covered here

- `supabase db lint` and the Supabase security advisor need the Supabase CLI stack; its images couldn't be pulled in this container (Docker Hub rate limit, ECR blob host blocked). Run them once `supabase start` works.
- pg_cron and pg_net don't exist in plain Postgres, so `0002` and `0017` skip them here; the schedule itself is untested until a Supabase project exists.
- The real Supabase `auth`, `storage` and role setup (non-superuser `postgres`). The shim follows Supabase's published definitions, but the first `supabase db reset` against a real stack is the check.
