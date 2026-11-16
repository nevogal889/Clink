# Build notes: app on Supabase (`app/src/lib`)

The app now runs on the real clink-dev backend: phone sign-in with a code, the age check, name and photo, usual 3 with details, the tracker, the private level, and account deletion. The mock stays for unit tests and the offline review build. Written 2026-11-16. Owner: Head of Development.

## How the data layer is picked

| Build | Data layer |
|---|---|
| Default (`npm run export:web`, `expo start`, EAS builds) | Supabase, when app config has a URL and publishable key |
| `CLINK_API=mock` at build time | Mock |
| Web build with `?mock=new` or `?mock=setup` | Mock (review screenshots, `docs/screens/capture.mjs`) |
| Jest | Mock or the fake client, always injected |

**Public settings (ARCHITECTURE 8.5).** `app.config.ts` reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the environment, else `supabase/projects.json` for the variant (`dev` is clink-dev; `prod` has no project yet, so a prod build falls back to the mock). They go into `extra.supabase` and nothing else does. The config refuses an `sb_secret_` key and a non-https URL. `app/.env.example` lists the variables. No `EXPO_PUBLIC_*` variable carries Supabase values any more.

**Web export clears the Metro cache** (`export:web` now passes `--clear`). Without it, a config change (mock vs Supabase) produced a bundle with the old `extra`.

## Files

| File | What it does |
|---|---|
| `lib/api/types.ts` | Contract, extended: `sendPhoneCode`, `verifyPhoneCode`, `completeSignup`, `deleteAccount`, `onSessionEnd`; `Session.phone` (own number only); `Me.needsSignup` |
| `lib/api/errors.ts` | `ApiError` codes and `errorText()`, which maps each code to its COPY key |
| `lib/api/supabase.ts` | The adapter (below) |
| `lib/api/mock.ts` | Phone flow (code `123456`), age rule, deletion |
| `lib/api/index.ts` | Picks the implementation |
| `lib/supabaseClient.ts` | One client: PKCE, session in the sealed store, token refresh only in the foreground on native |
| `lib/storage.native.ts` | Sealed store: AES-256-GCM, key in Keychain / Keystore (`expo-secure-store`, after first unlock, this device only), ciphertext in AsyncStorage. Plain store for flags |
| `lib/storage.ts`, `lib/kv.ts` | Web and test stores (localStorage, memory) |
| `lib/avatar.ts` | Picked photo to a 512 px JPEG under 1 MB, EXIF dropped (`expo-image-manipulator`) |
| `lib/phone.ts` | `libphonenumber-js`: device region, flags, E.164, display format |
| `lib/store.tsx` | Phone, age and delete actions; last good state cached; load errors; XP re-read after a log |
| Routes | `phone.tsx`, `code.tsx`, `age.tsx`, `delete-account.tsx`; `index.tsx` routes refused age, no account yet and load failure; Settings has Delete account; name step creates the account |
| `features/signin/AuthFrame.tsx` | Frame for the pre-account screens |
| `features/sync/Notices.tsx` | Queued snackbars ("Welcome back", "Your account is deleted."), the stale-data retry line, and a guard that leaves signed-in screens when the session ends on its own |

## What each call does on Supabase

| Method | Backend |
|---|---|
| `sendPhoneCode`, `verifyPhoneCode` | Auth `signInWithOtp` and `verifyOtp` (sms) |
| `completeSignup` | `complete-signup` with birth month and year, name, time zone, install id. Never a user id |
| `getMe`, `updateMe` | `profiles` (name, `avatar_path`), `user_settings.onboarding_step`; avatar upload to `avatars/{uid}/{ms}.jpg`, signed URL for 1 h, old version removed |
| `getUsual`, `setUsual` | `usual_drinks`, own rows only (friends' rows are visible too). Update or insert per slot, then delete slots past the list. Writes run one at a time |
| `getToday`, `logDrink`, `removeLog`, `restoreLog` | `drink_logs` with a device-made id (`upsert ... ignoreDuplicates`), device-local `local_date`, `caffeinated` computed on device |
| `getXp` | `xp_totals` and `xp_events` (own rows), first names of counterparts through `profiles` RLS |
| `getAudience`, `getLiveFlare`, `getLastPlace`, `getInviteUrl` | `friendships` count, own `groups`, own live flare, own invite code |
| `recordInviteShare` | `app_events` insert (`invite_share_tapped`); RLS refuses it when usage stats are off, which is ignored |
| `deleteAccount` | `delete-account`, then the local session and this user's queue and flags |
| `signOut` | `register-device` `signout` on native, then a local sign-out |
| `register-device` | After sign-in and sign-up on native only (its schema takes ios or android). Best effort |

**Errors.** Data API and Storage errors map by SQLSTATE (`CLTXT` → `text_blocked`, `CLRTL` → `rate_limited` with the wait, and so on); a failed fetch is `network`. Auth errors map by code. Function errors read the `{ error }` body; a function that isn't deployed (gateway `NOT_FOUND`) is `unsupported`.

**Offline (PRD 3.20).** Logs and log deletions made without a connection go to an encrypted queue and replay in order on the next tracker read or log; today's view merges the queue. A refusal that isn't about the connection drops that one item. On launch, a failed load shows the last good state with the `err.load` retry line on the camera; with nothing cached, the full-screen `err.load_full.*` retry.

## Decisions (one line each)

- **The account is created on the name step, not the age screen.** `complete-signup` requires a display name and `profiles.display_name` is not null, so the age answer stays in memory and is sent with the name. An under-age answer is refused when Continue is tapped on the name step; the result is the same (no account, identity deleted, 24 h refused screen). CTO: make `displayName` optional in `complete-signup` if the refusal should come on the age screen itself.
- **The age answer is never stored**, not even on the device. A restart between the age screen and the name step asks again.
- **Ciphertext in AsyncStorage, not MMKV.** ARCHITECTURE 5 says MMKV. MMKV 4 needs `react-native-nitro-modules`, which is not in Expo's bundled list; AsyncStorage is. The key still lives only in the Keychain / Keystore, so the protection is the same. CTO to confirm and update ARCHITECTURE 5.
- **AES-GCM from `@noble/ciphers` 1.3.0** (audited, pure JS), with the storage key name as associated data.
- **Wrong-code lock is also counted on the device** (5 in 15 minutes). Supabase answers `otp_expired` for a wrong and an old code alike, so the app calls it expired only when the code is over 10 minutes old. Twilio Verify enforces the real lock in prod.
- **The level already seen is kept on the device** (no column for it); the top-bar dot is per device.
- **Usual 3 saves never throw.** The editor doesn't wait for them; a failed save re-reads the server's list.
- **Things not built on this backend answer plainly:** Apple and Google sign-in, `sendFlare`, `shareSnap` and `addContact` throw `unsupported`; contacts and notification permission answer `denied` (no OS prompt without their native modules); `isWidgetInstalled` is false, so the camera shows "Add the widget".
- **Country names** come from `Intl.DisplayNames` where the runtime has it, else the ISO code **(verify on Hermes)**. The chip shows flag and dial code only, as DESIGN 4.2 says.
- **Route tests moved** from `app/src/app/` to `app/src/test/flows/`. Expo Router bundles every file in the routes folder, and the test files broke the native export (they import Node's `path`). `screens.md` still names the old paths.
- **COPY wins over DESIGN 4.2:** the number screen title is "What's your number?".

## Strings added to COPY.md (Words owner, please review)

`age.too_young.close`, `age.m.1` to `age.m.12` (month names), `code.field`, `phone.country.pick` (4.1); `del.deleting` (4.20); `a11y.phone.country` (4.26). Regenerated with `npm run gen -w @clink/shared`.

## Results

| Check | Command | Result |
|---|---|---|
| Adapter, errors, config, flows | `npx jest --selectProjects app` | 16 suites, 140 tests. `lib/api/supabase.test.ts` (50) covers every method and the error mapping against `test/fakeSupabase.ts`; `test/flows/account.flow.test.tsx` (11) covers phone, code, age, refusal, returning user, deletion in 3 taps, re-confirm by code, load errors, session end |
| Real backend | `npm run export:web` then `SUPABASE_ACCESS_TOKEN=proxy-injected node e2e/real-backend/run.mjs` | 20/20 on 3 runs in a row after the last fix; clink-dev left with 0 users, 0 files, 0 events |
| Native bundles | `npx expo export --platform ios --platform android --clear` | both bundled (1609 and 1633 modules) |
| Mock review build | `/?mock=new`, `/?mock=setup` | no request reaches Supabase |
| Repo | `npm run ci` | green |

The E2E signs in with +1 201 555 0104 and its fixed code, checks no profile exists before the age answer, finishes onboarding with a name, a photo and usual 3 with details, logs a drink, a water and a drink, undoes the last, opens the profile (5 XP from the daily log rule), reloads (1 drink, 1 water read back), then deletes the account from Settings. After each part it reads the rows as postgres: profile, `user_private` (age confirmed, no birth column anywhere), invite, time zone, avatar object, usual details, logs, XP, onboarding step; after deletion zero rows and zero files. Its `finally` deletes the test user through `delete-account` if the run stopped early, then removes the rows deletion keeps on purpose (`install_history`, the ownerless `account_deleted` event). Screenshots: `docs/screens/real-backend/01` to `15`, 390 x 844, looked at.

Fixed after looking: the profile showed 0 XP (XP is awarded by the server, so it is now re-read after a log); the number and code screens stayed in the back history after sign-in; the "account deleted" snackbar covered the legal line; overlapping usual 3 saves could race into a duplicate slot.

## For the backend (CTO)

1. **Edge functions have no CORS.** The browser's preflight reaches the function, which answers 401 with no `Access-Control-Allow-*` headers. Native apps never preflight, so iOS and Android are fine, but the web review build and the web deletion page (M-10) can't call `complete-signup` or `delete-account`. Fix in `_shared/http.ts`: answer `OPTIONS` before `requireUser`, and add the allow headers to every response (origin list: the web domain and `http://localhost:8081`). Until then, `e2e/real-backend/run.mjs` answers the preflight itself and forwards the real request from Node (2 calls per run).
2. `register-device` returns the widget token; the app does not keep it yet (the App Group write is M2).

## Not done, and why

- **No device run.** Sealed storage, the Keychain key, OTP autofill and the foreground token refresh are untested on a phone (no simulator or emulator here). The JS bundles build for both platforms.
- **Apple and Google sign-in:** no developer accounts, providers off on clink-dev, no native SDKs.
- **Adding a phone for Apple and Google users** starts `updateUser({ phone })`, but the code step for it is M3 work with contact matching.
- **Push and notification permission** (`expo-notifications`), **contacts**, **flares, snaps and invites redemption:** later milestones; the adapter says so with `unsupported` or `denied`.
- **The offline banner (`off.banner`)** is not shown; logs queue silently as COPY 4.23 says, and loads show the retry line.
