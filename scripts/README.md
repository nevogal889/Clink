# scripts

Repo scripts: asset, catalog and string generators, shared-code sync, export-user and review-account scripts (`docs/ARCHITECTURE.md` 2). Each unit adds its own here. `run-pgtap.sh` runs the pgTAP suite (see `docs/build-notes/scaffold.md`).

Hosted Supabase (clink-dev), all through the Management API, no database connection. Commands, test numbers and what each one checks: `docs/build-notes/supabase-connect.md`.

| Script | Does |
|---|---|
| `supabase-apply.mjs` | Applies pending migrations, tracked in `supabase_migrations.schema_migrations` |
| `supabase-pgtap.mjs` | Runs `supabase/tests` on the project, each file rolled back |
| `supabase-advisors.mjs` | Security and performance advisors; fails on an ERROR or WARN not in `supabase/advisors-accepted.json` |
| `supabase-auth-dev.mjs` | Applies `supabase/auth.dev.json` (dev only) |
| `supabase-deploy-functions.mjs` | Deploys `supabase/functions` with the pinned CLI and sets `CLINK_ENV` |
| `supabase-smoke.mjs` | Calls the deployed functions as test users, then deletes them (dev only) |
| `supabase/supabase.test.mjs` | Offline unit tests for the above (`node --test`, in CI) |
