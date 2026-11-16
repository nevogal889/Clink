# Build notes: Supabase connect (clink-dev)

The schema, policies, cron jobs, Auth settings and M1 edge functions are live on the hosted development project. Everything goes through the Management API (`https://api.supabase.com`), because direct Postgres connections (5432, 6543) are blocked from the build container. Written 2026-11-16. Owner: CTO.

## The project

| | |
|---|---|
| Name | `clink-dev` (development only; real users never use it) |
| Ref | `tppolgvuckjtxsheskat` |
| URL | `https://tppolgvuckjtxsheskat.supabase.co` |
| Region, plan | eu-west-1 (Ireland), Free (`DECISIONS.md`, "Supabase projects") |
| Postgres | 17 on Supabase. Local tests and CI use plain Postgres 16. |
| Publishable key | `supabase/projects.json` `dev.publishableKey` (public by design, `ARCHITECTURE.md` 8.5) |

**Where the public values live.** `supabase/projects.json` holds the project URL and the publishable key and nothing else. `ARCHITECTURE.md` 8.5 puts them in app config. The app does not read them yet: `app/app.config.ts` belongs to the app unit, which should load `supabase/projects.json` into `extra` for the `dev` variant when it swaps the mock API for Supabase. The secret key, JWT secret and database password are not in the repo, the notes or any script. Functions get the service key, `SUPABASE_DB_URL` and the JWKS from the Supabase runtime.

## What is live

| Part | State | Check |
|---|---|---|
| Migrations 0001 to 0018 | applied, tracked in `supabase_migrations.schema_migrations` (version, name, statements) | `supabase-apply.mjs` says "up to date" |
| Tables | 39 in `public` and `private` | `information_schema.tables` |
| Extensions | pg_cron 1.6.4, pg_net 0.20.4, pgcrypto, pgtap 1.3.3 (in `extensions`) | |
| Cron jobs | `clink-flare-expiry` every minute, `clink-daily-retention` 03:00 UTC, `clink-cron-history` 03:30 UTC (keeps 7 days of `cron.job_run_details`) | all runs `succeeded` |
| Storage buckets | `avatars` (1 MB), `snaps` (1.5 MB), `flare-photos` (1.5 MB), `moderation`; all private, JPEG only, from 0015 | 9 storage policies |
| Auth | phone on (test numbers only), email, anonymous, Apple and Google off | `supabase-auth-dev.mjs` reads every value back |
| Edge functions | `complete-signup`, `register-device`, `delete-account`, ACTIVE, `verify_jwt` on | `supabase-smoke.mjs` 20/20 |
| Function config | `CLINK_ENV=dev` (non-secret). No other secret is set. | |

0002 and 0017 ran their real Supabase branch here (pg_cron and pg_net exist), so the jobs are scheduled. No migration failed on Postgres 17 or the Supabase roles. 0018 is new and holds the advisor fixes (below).

## Results (2026-11-16)

| Step | Command | Result |
|---|---|---|
| Apply (re-run) | `node scripts/supabase-apply.mjs` | 18 local, 18 applied, "up to date" |
| pgTAP on clink-dev | `node scripts/supabase-pgtap.mjs` | 12 files, 320/320, nothing left (no `tests` schema after the run) |
| pgTAP local, Postgres 16 | `npm run test:db` | 12 files, 320/320 |
| Deno | `deno lint`, `deno check */index.ts`, `deno test --allow-env --allow-net tests/` | clean, 13/13 |
| Advisors | `node scripts/supabase-advisors.mjs` | no blocking findings |
| Auth config | `node scripts/supabase-auth-dev.mjs` | every value read back equal |
| Deploy | `node scripts/supabase-deploy-functions.mjs` | 3 functions ACTIVE, v5 |
| Smoke | `node scripts/supabase-smoke.mjs` | 20/20, 2 test users created, 0 left |
| Script unit tests | `node --test scripts/supabase/supabase.test.mjs` | 12/12 |
| Repo | `npm run ci` | green |

After the smoke run the project holds no user data: `auth.users` is empty, storage is empty, and the only rows are `private.xp_rules` (6) and `public.app_config` (4).

## Commands

Behind the agent proxy the access token is added to every request to `api.supabase.com`, so the scripts take `SUPABASE_ACCESS_TOKEN=proxy-injected`. Elsewhere, use a personal access token from the CEO's account (never committed, never in CI logs). Every script defaults to clink-dev; `--ref <ref>` names another project. `supabase-auth-dev.mjs` and `supabase-smoke.mjs` refuse any project but clink-dev.

```
export SUPABASE_ACCESS_TOKEN=proxy-injected

node scripts/supabase-apply.mjs --status      # local vs applied, changes nothing
node scripts/supabase-apply.mjs --dry-run     # what would be applied
node scripts/supabase-apply.mjs               # apply pending migrations, each in one transaction

node scripts/supabase-pgtap.mjs               # whole suite, rolled back
node scripts/supabase-pgtap.mjs 05_flares     # one file

node scripts/supabase-advisors.mjs            # --json for the raw findings
node scripts/supabase-auth-dev.mjs            # --dry-run prints what would be sent
node scripts/supabase-deploy-functions.mjs    # all functions; or name some: ... complete-signup
node scripts/supabase-smoke.mjs
```

The deploy script runs the pinned CLI (`supabase@3.1.0`) as:

```
npx -y supabase@3.1.0 functions deploy <names> --use-api \
  --import-map supabase/functions/deno.json --remote=tppolgvuckjtxsheskat --yes
```

## How each script works

- **Apply.** Creates the CLI's tracking table with the CLI's own DDL (idempotent), then applies each pending file in one request: an advisory lock, a guard that refuses an already applied version, the file, and its tracking row with the whole file as one `statements` element. A failure rolls back the file and its row. An applied file whose text changed locally is an error; so is a pending file older than the newest applied one.
- **pgTAP.** One request per test file, inside `begin ... rollback`. The query endpoint returns only the last result set, so every top-level `select` of the test is rewritten to insert into a temp table, which is read back just before the rollback. `setup/01_test_helpers.sql` is loaded inside the same transaction; the plain-Postgres shim (`setup/00_supabase_shim.sql`) is not, because the project has the real `auth`, `storage` and roles. The only thing a run keeps is the `pgtap` extension.
- **Advisors.** `GET /v1/projects/{ref}/advisors/security` and `/performance`. Exits 1 on any ERROR or WARN not in `supabase/advisors-accepted.json`, where each accepted finding has its reason.
- **Auth.** `PATCH /v1/projects/{ref}/config/auth` with `supabase/auth.dev.json`, then a read-back of every key. Only the keys it sets are printed; the Auth config also holds provider secrets.
- **Deploy.** Finds every `supabase/functions/<name>/index.ts`, deploys, sets `CLINK_ENV` through the secrets endpoint (the only way to set a function env var), and checks each function is ACTIVE with a higher version than before.
- **Smoke.** Signs in with test numbers through `/auth/v1/otp` and `/auth/v1/verify`, calls the deployed functions, and in a `finally` deletes the auth users it made by id, plus the rows account deletion keeps on purpose (`private.install_history` for those ids, and this run's ownerless `account_deleted` event).

## Smoke checks (all pass)

- `complete-signup` without a token: 401. The publishable key as a bearer token: 401.
- `complete-signup` with a `userId` in the body: 400 `bad_input` (the caller only comes from the JWT).
- Adult sign-up: 200 `created` with an invite code; a second call: 200 `exists`.
- Data API: the user reads their own profile; the publishable key alone reads no profiles (401); `/rest/v1/user_private` is 404 (the `private` schema is not exposed).
- `register-device`: 200 `registered` with a widget token; the token rotates on each call; iOS-only fields on Android: 400 `bad_input`; sign-out: 200 `signed_out`, removed.
- Under 16 (age 12): 403 `under_age`, `min` 16, and the auth user is deleted.
- `delete-account` with an unknown field: 400; without a token: 401; happy path: 200 `deleted`, `private.account_leftovers()` is `{}`, the auth user is gone, and the old token gets 404 from `register-device`.

## Test phone numbers (dev only, not secret)

Supabase test OTPs: these numbers sign in with their fixed code and no SMS is sent. 555-0100 to 555-0199 is the NANP block reserved for fiction; the area code makes them full, valid E.164 numbers. Valid until about 2027-05-15 (180 days); re-run `supabase-auth-dev.mjs` to renew.

| Number | Code |
|---|---|
| +1 201 555 0101 | 482910 |
| +1 201 555 0102 | 573021 |
| +1 201 555 0103 | 664132 |
| +1 201 555 0104 | 755243 |
| +1 201 555 0105 | 846354 |
| +1 201 555 0106 | 937465 |

The smoke test uses the first two and deletes any leftover account on the first three before it starts, so use 0104 to 0106 for hand testing. Never copy these to clink-prod, which gets only the one rotated App Review number (`ARCHITECTURE.md` 5, M-15).

## Auth settings on clink-dev

Per `ARCHITECTURE.md` 5 and RISK_REVIEW S-14: email and anonymous sign-in off; Apple and Google off (no developer accounts yet); phone on; access token lifetime 3600 s; refresh token rotation on with a 10 s reuse interval; manual identity linking on (for adding Apple or Google later); OTP valid 600 s, 6 digits, resend after 30 s; TOTP MFA off. Site URL and the redirect allow list are `http://localhost:8081` (the Expo web dev server for the review build). Phone OTP needs no redirect; set the https domain once it is bought.

**Phone without an SMS provider.** Supabase accepts phone sign-in with the provider set to Twilio and no Twilio credentials. Test numbers work; any other number gets `500 unexpected_failure "Unable to get SMS provider"` and no user is created. So the app's real phone flow (send code, enter code, verify) runs unchanged in development, nothing can send an SMS, and nothing costs money. No stub or anonymous sign-in was needed. Twilio Verify is added only for clink-prod, after the CEO answers the SMS cost cap question (PRD 8, item 6).

## Advisor findings

Fixed in `0018_advisor_fixes.sql`:
- `multiple_permissive_policies` on `public.usual_drinks`: the owner policy and the friends policy were both permissive for SELECT. Now one SELECT policy and one policy per write command. Covered by the new `supabase/tests/11_usual_drinks_policies.test.sql` (9 tests).
- `unindexed_foreign_keys`: 10 covering indexes, each on a cascade path from account deletion or a block.
- Not an advisor finding but found here: `cron.job_run_details` grows by 1,440 rows a day from the per-minute flare job; `clink-cron-history` keeps 7 days.

Accepted (reasons in `supabase/advisors-accepted.json`):
- WARN `authenticated_security_definer_function_executable` on `public.flare_view()` and `public.incoming_flares()`: the intended read API (`ARCHITECTURE.md` 4.4), empty search_path, authenticated only, caller from `auth.uid()`.
- WARN `auth_leaked_password_protection`: Clink has no passwords.
- WARN `auth_insufficient_mfa_options`: no in-app second factor in v1 (S-04 step-up is deferred).
- INFO `unused_index` (5 indexes): no traffic yet. Re-check on clink-prod after beta.

The two Auth warnings come and go between advisor runs; they are accepted either way.

## What differs from local Postgres 16

- **Access tokens are ES256**, signed by the project's asymmetric key and checked against `/auth/v1/.well-known/jwks.json`. Local tests sign HS256 with a shared secret. `functions/_shared/auth.ts` now reads the token header and routes HS256 to the shared-secret check only when `SUPABASE_JWT_SECRET` is set, and everything else to the JWKS check, which accepts asymmetric algorithms only. Tested in `functions/tests/unit.test.ts`.
- **Storage refuses direct SQL deletes** unless `storage.allow_delete_query` is set (`storage.protect_delete`); the Storage API sets it for its own deletes. Tests 09 and 10 set it locally inside their transaction. Functions delete files through the Storage API, so they are not affected.
- **pg_cron and pg_net exist**, so 0002 and 0017 schedule the real jobs.
- **The real `auth`, `storage` and roles** replace `supabase/tests/setup/00_supabase_shim.sql`.
- **The CLI's `migration list` and `db push` need a database connection**, which the container can't make (`migration list --remote` hung until killed). The tracking table uses the CLI's own schema, so they will agree from a machine that can connect.
- **Function deploys need `--import-map`**: without a `supabase/config.toml` the CLI does not find `supabase/functions/deno.json`, and bundling fails on the bare `jose` import.
- **The CLI checks the token's shape** (`sbp_` + 40 hex) before sending it, so behind the proxy the deploy script passes a placeholder of that shape; the proxy adds the real token.

## Decisions (one line each)

- **Management API scripts, not `supabase db push`**: direct Postgres is blocked here, and the same scripts work in CI with a token.
- **The CLI's tracking table, the whole file as one statement**: the CLI agrees later, and `supabase migration fetch` gives the file back.
- **Test numbers in 201-555-01xx**, not a bare 555-01xx: Supabase needs a full E.164 number, and 555-01xx stays fictional with any area code.
- **No SMS stub, no anonymous sign-in**: the Twilio provider without credentials already sends nothing and costs nothing.
- **`verify_jwt` stays on** for the three M1 functions: they all need a user. The widget-token functions in M2 will turn it off per function and check their own token.
- **The smoke test also deletes what account deletion keeps on purpose** for its own users, so a dev run leaves nothing.
- **CLI pinned to 3.1.0** in the deploy script.

## Changes outside the scripts

- `.github/workflows/ci.yml`: the js job runs `node --test scripts/supabase/supabase.test.mjs` (offline).
- `scripts/supabase/sql.mjs`: `stripLeadingComments` now handles nested block comments, like `splitStatements` (found by the new unit test).
- `scripts/README.md`: the Supabase scripts table.
- `ARCHITECTURE.md`: unchanged. Nothing it states turned out wrong on hosted Supabase; the differences above are about the dev setup.

## Not done, and why

- **The app does not talk to clink-dev yet.** Wiring `supabase/projects.json` into `app/app.config.ts` `extra` and replacing `createDefaultApi()` is the app unit's work (`app/` is outside this unit).
- **CI does not apply migrations or deploy to clink-dev on merge** (`ARCHITECTURE.md` 10). It needs a GitHub Environment secret with an access token, which the CEO creates. The commands above are what that job runs.
- **No `supabase/config.toml`.** Local `supabase start` is not used yet; adding one is for whoever first runs the local stack.
- **Function secrets** (phone pepper, APNs, FCM, Apple, invite HMAC, moderation) are not set. Without the pepper, `phone_hmac` stays empty; that is the designed fallback until the CEO sets it.
- **Security definer functions in `public`** stay as accepted findings until M4 review.
