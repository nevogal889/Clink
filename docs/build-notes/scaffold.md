# Build notes: scaffold (Head of Development)

Monorepo foundation from `ARCHITECTURE.md` 2 and the CLAUDE.md repo layout. Written 2026-11-15.

## What exists

```
package.json            npm workspaces: app, packages/*. Root scripts below.
package-lock.json       one lockfile for the whole repo
tsconfig.base.json      strict, noUncheckedIndexedAccess, noImplicitOverride, noImplicitReturns
eslint.config.js        flat config: eslint-config-expo + prettier + the no-literal-text rule
.prettierrc.json, .prettierignore, .editorconfig, .nvmrc (22)
jest.config.js          one Jest run, two projects: packages/shared and app
.github/workflows/ci.yml   job "js" and job "pgtap"
app/
  package.json          @clink/app, main expo-router/entry
  app.config.ts         dev and prod variants, bundle id placeholder, min OS, plugins
  app.config.test.ts    variant and store-guard tests
  eas.json              development, preview, production
  babel.config.js, metro.config.js, jest.config.js, tsconfig.json, .env.example
  src/app/_layout.tsx   root Stack, no header
  src/app/index.tsx     placeholder route (renders no text) + index.test.tsx
  src/ui/theme/         colors, categories, typography, spacing, radius, elevation, motion,
                        haptics (empty objects) + index.ts + index.test.ts
  src/features/, src/lib/, assets/art/   empty
  src/global.d.ts       expo/types reference (process.env, asset imports)
packages/shared/
  package.json          @clink/shared, consumed as TS source (no build step), zod ^4 installed
  src/index.ts          entry, re-exports nothing yet
  src/{catalog,strings,xp,audience,limits,events,widget-state,api}/index.ts   empty modules
  fixtures/             README only
  src/index.test.ts     entry loads, every module folder exists
supabase/migrations/, functions/, tests/   empty (.gitkeep)
scripts/README.md, scripts/run-pgtap.sh
```

Resolved versions (npm, 2026-11-15): Expo SDK 58 (`expo` 58.0.25), `expo-router` 58.0.31, React Native 0.88.1, React 19.3.0, TypeScript 6.0.3, Jest 30.5.2, `jest-expo` 58.0.14, `@testing-library/react-native` 14.1.0, ESLint 9.39.5, `eslint-config-expo` 58.0.4, Prettier 3.10.1, zod 4.6.7.

## Commands

All from the repo root.

| What | Command |
|---|---|
| Install | `npm ci` (or `npm install` when you add a dependency) |
| Typecheck every workspace | `npm run typecheck` |
| Lint | `npm run lint` |
| Format check / fix | `npm run format:check` / `npm run format` |
| All Jest tests | `npm test` |
| One project | `npm run test:shared`, `npm run test:app` |
| Web export | `npm run export:web` (writes `app/dist/`, gitignored) |
| Serve the export | `python3 -m http.server 8765 -d app/dist` and open http://127.0.0.1:8765 |
| Dev server | `npm start -w @clink/app` (press `w` for web) |
| Everything CI's js job runs | `npm run ci && npm run export:web` |
| pgTAP | `npm run test:db` (needs a Postgres, see below) |
| Expo config check | `cd app && npx expo config --type public` (add `APP_VARIANT=prod` for prod) |
| Prebuild check (throwaway) | `cd app && npx expo prebuild --platform android --no-install`, then delete `app/android` and undo the `package.json` script edit prebuild makes |

**Adding a dependency to the app:** `cd app && npx expo install <pkg>` so versions match SDK 58. In this container `api.expo.dev` is blocked, so prefix `EXPO_OFFLINE=1` (it then uses the versions bundled with `expo`). Add other packages with `npm install <pkg> -w @clink/shared` or `-w @clink/app`. Several units touch the one `package-lock.json`, so merge it by re-running `npm install`, never by hand.

## pgTAP

`scripts/run-pgtap.sh` creates a fresh database (`$PGTAP_DB`, default `clink_pgtap`), runs `create extension pgtap`, then applies in order:

1. `supabase/tests/setup/*.sql`, sorted, if present. This is where the Database unit puts the shim that plain Postgres lacks and Supabase has (roles `anon`, `authenticated`, `service_role`; schema `auth` with `auth.uid()`). Roles are cluster-wide, so setup files must be idempotent.
2. `supabase/migrations/*.sql`, sorted, each in one transaction, stopping at the first error.
3. `pg_prove` on every `supabase/tests/**/*.test.sql` (Supabase's naming). No test files means exit 0.

Connection comes from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`. `SUPABASE_DIR` points it at another folder.

Local run in this container (pgTAP and `pg_prove` were installed on the host with `apt-get install postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl`; initdb refuses root, so run it as `postgres`):

```
mkdir -p /tmp/clink-pg && chown postgres /tmp/clink-pg
runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D /tmp/clink-pg/data -U postgres --auth=trust
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/clink-pg/data -o "-p 55433 -k /tmp/clink-pg" -l /tmp/clink-pg/log start
PGHOST=/tmp/clink-pg PGPORT=55433 PGUSER=postgres npm run test:db
```

Docker works too, but the daemon isn't running by default: start it with `dockerd &`. A container has no route to the agent proxy, so `apt-get` inside it fails here; copy the host's `/usr/share/postgresql/16/extension/pgtap*` into a `postgres:16` container instead (pgTAP is SQL only).

Verified here: empty suite exits 0; a sample setup + migration + 2 passing tests passes, on both the host cluster and a `postgres:16` container; a failing test exits 1; a broken migration exits 3.

CI job `pgtap` uses a `postgres:16` service, installs `postgresql-16-pgtap` inside it with `docker exec` (PGDG apt repo in the image), installs `psql` and `pg_prove` on the runner, then runs the same script.

## Decisions (one line each)

- **npm workspaces, not pnpm.** The brief asked for npm, and npm hoists by default, which is the reason `ARCHITECTURE.md` 2 chose pnpm with `node-linker=hoisted`. **Conflict to fix in `ARCHITECTURE.md` 2 (CTO):** it still says pnpm.
- **`eas.json` lives in `app/`**, the EAS project root, as `ARCHITECTURE.md` 2 shows.
- **Variants `dev` and `prod` via `APP_VARIANT`.** Default is `dev`, so a local run never uses the store id. `development` and `preview` EAS profiles build `dev`, `production` builds `prod` (`ARCHITECTURE.md` 10 table).
- **Bundle id base `com.example.clink` is a placeholder** (`BUNDLE_ID_BASE` and `BUNDLE_ID_IS_PLACEHOLDER` at the top of `app/app.config.ts`). Dev gets `.dev`. App Group is `group.<bundle-id>.shared` and is exposed in `extra.appGroup` for the native units. A production EAS build throws while the placeholder is set, because bundle ids can't change after the first upload.
- **Config lives in one file.** The Expo config loader does not resolve TS imports from `app.config.ts`, so the variant helpers are exported from it and tested in `app.config.test.ts`.
- **Custom schemes `clink-dev` / `clink`** exist only for the dev client and Expo Router. Invites and auth use https links (`ARCHITECTURE.md` 8.7).
- **Min OS:** `ios.deploymentTarget` 17.2 (built-in config since SDK 56) and `expo-build-properties` `android.minSdkVersion` 26. Prebuild confirmed `android.minSdkVersion=26`.
- **New Architecture:** always on in SDK 58; the config has no switch for it anymore.
- **`runtimeVersion: { policy: 'fingerprint' }`** per `ARCHITECTURE.md` 10. `updates.url` and `extra.eas.projectId` are filled from `EAS_PROJECT_ID` once the Expo account exists.
- **`expo-dev-client` installed**, because the `development` profile builds a dev client.
- **Web output `single`** (one SPA `index.html`). Enough for screen review, no server rendering to maintain.
- **React Compiler on**, as the SDK 58 template ships it.
- **Typed routes off.** They need `.expo/types` generated before `tsc`, which CI doesn't do yet. Turn on when someone adds that step.
- **TypeScript 6.0, not 7.** Expo SDK 58 pins `~6.0.3`.
- **ESLint 9, not 10.** `eslint-plugin-import` and `eslint-plugin-react` (inside `eslint-config-expo`) don't declare ESLint 10 support.
- **No-literal-text lint rule** on `app/src/**/*.tsx` (tests excluded): `react/jsx-no-literals` for text children, and `no-restricted-syntax` for literal `accessibilityLabel`, `accessibilityHint`, `aria-label`, `alt`, `label`, `placeholder`, `title`. `testID` is allowed. Checked with a probe file: all four violations reported.
- **`@/*` path alias** to `app/src/*`: tsconfig, Jest `moduleNameMapper`, and the ESLint import resolver all agree. Metro reads tsconfig paths itself.
- **Shared package is TS source, no build step.** Metro bundles it from the workspace symlink (checked with a temporary import in a web export). Jest uses Babel (`@babel/preset-env` + `@babel/preset-typescript`, Babel 7 to match `babel-jest` 30).
- **Prettier ignores `*.md`, `prototype.html` and migrations**, so it never reformats docs owned by other people.
- **The placeholder route renders no text**, because there's no string table yet and literals are banned.

## For the other units

- **Shared:** fill `packages/shared/src/<module>/index.ts` and re-export each module from `src/index.ts` (empty re-exports fail `import/export` lint, so they're commented out for now). zod 4 is already a dependency. Deno needs explicit `.ts` import extensions; if the sync script copies files with relative imports, decide that convention (`allowImportingTsExtensions` works with `noEmit`).
- **Screens:** tokens go in `app/src/ui/theme/*.ts` (one file per `DESIGN.md` 2 group). Replace `src/app/index.tsx`. Fonts, Reanimated or gesture handler aren't installed; add them with `npx expo install`.
- **Database:** tests are `supabase/tests/**/*.test.sql`; the Supabase shim goes in `supabase/tests/setup/`. If you move to `supabase test db` later, check whether it also runs the setup files.
- **Art:** `app/assets/art/` is empty and waiting.

## Not done here, and why

- **No Expo, Apple, Google or Supabase account:** no EAS project id, no `owner`, no `updates.url`, no credentials, no `supabase/config.toml`. `eas build` can't run yet. `eas.json` was validated with `@expo/eas-json` (all three profiles resolve for iOS and Android).
- **EAS build image not pinned.** `ARCHITECTURE.md` 1.1 wants it pinned per profile. Pin it to the image the first real build uses **(verify)**.
- **CI has not run on GitHub** (no remote run from here). The YAML parses; `actionlint` was not run. The `docker exec ... apt-get install postgresql-16-pgtap` step couldn't be tested here (containers can't reach the proxy); the rest of the pgtap job was tested locally as above.
- **CI doesn't yet run** Deno tests, `supabase db lint`, the security advisor, the deletion test, the shared-code and string-table drift checks, the Live Activity copy check, or prebuild plus Gradle tests (`ARCHITECTURE.md` 10). Each unit adds its job when the code exists.
- **`expo-doctor`:** 18 of 20 checks pass. The two failures are network-only (Expo API and React Native Directory are blocked here).
- **`npm audit`** reports moderate issues in transitive Expo toolchain packages. Not forced; revisit on the next SDK patch.
- Repo settings from `ARCHITECTURE.md` 8.5 (secret scanning with push protection, Dependabot) are GitHub settings, not files, and need the repo owner.
