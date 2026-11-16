# scripts

Repo scripts: asset, catalog and string generators, shared-code sync, and the hosted Supabase tools (`docs/ARCHITECTURE.md` 2). Every script is listed here; a unit that adds one adds its row. Generators take `--check` (exit 1 when the committed output is stale) and `npm run check:gen` runs every check. Offline script tests run in `npm run test:scripts`, which `npm run ci` includes.

## Generators

| Script | Does | Check |
|---|---|---|
| `gen-catalog.mjs` | Drink catalog from `docs/COPY.md` 2 into `packages/shared/src/catalog/catalog.generated.ts` | `npm run check:gen` |
| `gen-strings.mjs` | String table from `docs/COPY.md` (2.8, 3 to 7, banned list 1.3) into `packages/shared/src/strings/table.generated.ts` | `npm run check:gen` |
| `gen-android-strings.mjs` | Widget strings for Android (`app/assets/native/android/res/values/clink_strings.xml`) from the string table | `npm run check:gen` (`check:gen:android`) |
| `gen-android-colors.mjs` | Widget colours for Android, light and night, from the app's design tokens | `npm run check:gen` (`check:gen:android`) |
| `gen-drink-assets.mjs` | Android vector drawables from the SVG masters in `app/assets/art` | `npm run check:gen` (`check:gen:android`) |
| `gen-android.test.mjs` | Offline tests of the three Android generators and the clink-native config plugin (`node --test`) | `npm run test:scripts` |
| `gen-art-gallery.mjs` | `docs/art/gallery.html`: every SVG on light and dark, with the DESIGN.md 3.3 and 3.5 checks | |
| `gen-art-gallery-compare.mjs` | `docs/art/before-after.html`: art at a git ref next to the working tree, for art reviews | |
| `gen-art-gallery.test.mjs` | Tests of the gallery and the art it checks (`node --test`) | `npm run test:art` |

## Database and edge functions

| Script | Does |
|---|---|
| `run-pgtap.sh` | Runs `supabase/tests` on a local Postgres 16 with pgTAP: fresh database, shim, migrations, every `*.test.sql` (`npm run test:db`; see `supabase/tests/README.md`) |
| `supabase/sync-shared.mjs` | Copies the shared rules the functions need from `packages/shared/src` into `supabase/functions/_shared/shared`; `--check` fails on a stale copy |
| `supabase/lib.mjs`, `supabase/sql.mjs` | Helpers for the hosted scripts below: Management API calls, the project ref guard, SQL splitting, pgTAP parsing |
| `supabase/supabase.test.mjs` | Offline tests of the hosted scripts, the CORS allow-list and the shared copy (`node --test`, in `npm run test:scripts`) |

## Hosted Supabase (clink-dev)

All through the Management API (`https://api.supabase.com`), no database connection. Behind the agent proxy the token is `SUPABASE_ACCESS_TOKEN=proxy-injected`. Commands, test numbers and what each one checks: `docs/build-notes/supabase-connect.md`. The test phone numbers are in `supabase/auth.dev.json`; automated runs use +1 201 555 0101 to 0105 only.

| Script | Does |
|---|---|
| `supabase-apply.mjs` | Applies pending migrations, tracked in `supabase_migrations.schema_migrations` |
| `supabase-pgtap.mjs` | Runs `supabase/tests` on the project, each file rolled back |
| `supabase-advisors.mjs` | Security and performance advisors; fails on an ERROR or WARN not in `supabase/advisors-accepted.json` |
| `supabase-auth-dev.mjs` | Applies `supabase/auth.dev.json` (dev only) |
| `supabase-deploy-functions.mjs` | Deploys `supabase/functions` with the pinned CLI, sets `CLINK_ENV` and `CLINK_CORS_ORIGINS` (from `supabase/projects.json` `corsOrigins`) |
| `supabase-smoke.mjs` | Calls the deployed functions as test users (0101 to 0103), including a real CORS preflight and the log-time clamp, then deletes them (dev only) |

The live widget run is `npm run test:e2e:widget` (`e2e/widget-api/widget.e2e.test.ts`, test number 0105; needs `SUPABASE_ACCESS_TOKEN=proxy-injected`; the script sets `NODE_USE_ENV_PROXY=1` itself, so Node's `fetch` goes through the agent proxy, and it is a no-op without one).
