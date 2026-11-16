# Build notes: the app and the widget (M2, Android)

The app now drives the Android widget: register-device hands the widget its token, every foreground and every change to the usual 3 or the tracker pushes a fresh widget state, the widget's logs show in Today once, and sign-out and deletion clear the widget. F8 is built (onboarding step 6 with "Add it for me", the camera notice, the guide), plus Settings > Widgets and a dev-only "Widget states" screen. Written 2026-11-16. Owner: Head of Development.

## Deviation: Android first

M2 says every feature ships on both platforms together. There is no Apple Developer account and no Mac here, so the iOS widget can't be built or tested. The JS calls are the same on both platforms; on iOS `ClinkNative.widgetsSupported` is false, so the app makes no widget call, skips onboarding step 6 (there is nothing to add), and hides the camera notice and Settings > Widgets. When the Swift widget lands, only the native module changes. Recorded here and in `android-widget.md` and `widget-backend.md`; not a CEO question.

## Contracts reconciled

The backend unit's `widget-api` and the Android unit's Kotlin worker agree. Checked by reading both sides and by the live run below, which sends the Kotlin worker's exact requests:

| Point | Backend | Kotlin | Result |
|---|---|---|---|
| Auth | `Authorization: Bearer <widgetToken>`, no `apikey` | same (`HttpWidgetApi.open`) | match |
| Region | `x-region: eu-west-1` | `app.clink.REGION` from `supabase/projects.json` | match; the app now reads the same value (`extra.supabaseRegion`) |
| `GET state` query | `instance` + `size` together, `tz`, unknown keys 400 | `instance=<appWidgetId>&size=&tz=`, instance only until reported | match; the app sends `tz` only |
| `POST log` body | strict `{id, drinkId, slot, category, loggedAt, timeZone}` | `logBody()`: every key, nulls included | match (live: 200 logged, 200 duplicate) |
| Timestamps | `YYYY-MM-DDTHH:MM:SSZ` | `Instant.toString()` of whole seconds | match |
| Errors | `WIDGET_API_ERRORS` | 401 reread token once, 403/408/429/5xx retry, other 4xx drop | match |
| Token | 43 base64url, new on every register-device, old one revoked at once | regex check, Keystore AES-GCM | match |

One integration bug was fixed on the app side: the M1 adapter called `register-device` on its own after the code step and after sign-up. Every call rotates the token, so two callers could leave the widget holding a revoked one. Registration now has one owner (`lib/widget/sync.ts`, called by the store once per launch and account). No change was needed in `supabase/functions/widget-api` or in the Kotlin code.

## How the app calls the widget

`lib/store.tsx` owns it; screens read `state.widgets` and call three actions.

| When | What runs (`lib/widget/sync.ts`) |
|---|---|
| Launch or sign-in, once the account exists | `api.registerDevice()` (register-device, platform `android`), then `ClinkNative.setWidgetToken(token)`. Once per process and account. Fails quietly offline (the widget keeps its token). |
| Any change to `me`, usual 3, Today, audience or last place (600 ms debounce: each fetch counts toward the 120 an hour) | `GET widget-api/state?tz=` with the widget token, then `setWidgetState(json)` and `reloadWidgets()`. Pushes run one at a time. |
| Offline, or no token yet | The last server state with the app's usual 3 and today's counts patched in (`patchWidgetState`), else a state built from app data (`buildWidgetState`, shared builders). So a log made in the app offline still reaches the widget. |
| 401 on the state read | The token was rotated or revoked: forget it, register once more, read again. A second 401 waits for the next launch. |
| Every foreground (`AppState` active) and on first load | `drainOutbox()`, `getInstalledWidgets()`, `getOutbox()`; Today is read again from the server and the widget's unsent logs are merged in by id. |
| Sign-out, account deletion, a session that ended on its own | `clearAll()` after register-device signout or delete-account. The adapter also drops its sealed copy of the token. |

**No duplicates.** A widget log has one id from its first tap: the outbox entry, the server row and the app's Today entry all carry it. Today merges the widget's unsent logs with the server's rows by id (the server's copy wins), and the state pushed to the widget leaves the unsent ones out, because the widget adds its own pending logs to the counts (`Optimistic.apply`). Tested in `test/flows/widget.flow.test.tsx` and live.

**The app's copy of the token.** `widget-api` takes only the widget token, so the app keeps one to read the state: in memory and in the sealed store (AES-256-GCM, key in the Keystore), per user, dropped on sign-out and deletion. It is never logged, shown or sent anywhere but `widget-api`.

## Files

| File | What |
|---|---|
| `lib/widget/host.ts` | `WidgetHost` (the clink-native bridge type), `defaultWidgetHost()`, and the preview host for the web review build and tests: in memory, decodes states with the shared schema like the Kotlin decoder, records calls (never the token) |
| `lib/widget/state.ts` | `buildWidgetState`, `patchWidgetState`, `widgetPendingLogs`, `mergeToday`, `isoSeconds` |
| `lib/widget/sync.ts` | `createWidgetSync`: register, push, foreground, installed, signedOut |
| `lib/api/types.ts` | `registerDevice()` and `getWidgetState(tz)` added to `ClinkApi`; `isWidgetInstalled()` removed (installed widgets come from the bridge) |
| `lib/api/supabase.ts` | register-device returns and seals the token; `getWidgetState` with an 8 s timeout and the error mapping; no registration from the sign-in calls |
| `lib/api/mock.ts` | Mock `registerDevice` (token-shaped test value) and `getWidgetState` (built from mock data) |
| `lib/store.tsx` | `state.widgets`, the effects above, `checkWidgets`, `pinWidget`, `refreshWidget`; `widgets` and `widgetDebounceMs` props for tests |
| `features/widgets/useAddWidget.ts`, `AddWidgetGuide.tsx` | "I added it", "Add it for me" (pin, then watch for the widget up to 60 s), the "can't see it yet" line, the steps |
| `app/onboarding/widget.tsx`, `app/widget-guide.tsx`, `app/camera.tsx` | F8 |
| `app/settings.tsx` | Settings > Widgets |
| `app/dev/widget-states.tsx`, `features/widgets/fixtures.ts` | Widget states (dev variant only) |
| `app/app.config.ts`, `lib/supabaseClient.ts` | `extra.supabaseRegion` (public) and `publicRegion()` |
| `e2e/widget-api/` | The live run on clink-dev (Jest, Node, the app's own adapter) |
| `e2e/screens/widget-app.mjs` | Screenshots into `docs/screens/widget-app/` |

## F8 and Settings > Widgets

- **Onboarding step 6.** DESIGN.md 4.3 as drawn (primary "I added it", text button "Remind me later", "Can't see it yet" and "Skip for now" when nothing is found). On Android a tonal "Add it for me" (`onb.widget.and.pin`) sits above the steps: `requestPinWidget('medium')`, then the launcher's own dialog; the app checks every second for a minute and moves on by itself once the widget is there. Where the launcher can't pin, the button goes and the written steps stay. Tap budget: 2 (Add it for me, the launcher's Add).
- **Camera notice.** "Add the widget" shows until `getInstalledWidgets()` finds one, read on every foreground and every time the camera gets focus. The close button hides it for this visit only (PRD F8: the card stays until a widget is detected).
- **Settings > Widgets** (PRD 3.3 rule 3, 3.14 item 4). One row per widget: "Medium widget · Automatic" with "Who joins? goes to Work right now" (what Automatic resolves to at this moment), "Small widget" with `set.widgets.small_note`; `set.widgets.none` when there is none; "How to add a widget"; and in dev builds "Widget states". Medium widgets use Automatic until the configuration screen and groups arrive (M3), so the rows don't open an audience picker yet.
- **Widget states (dev).** Lists W1 to W22. A tap sends the fixture's state to every widget with every timestamp moved by the same amount so the fixture's `now` lands on the real clock, and today's date set to the device's; "Back to my data" pushes the account's real state. Rows whose state partly lives on the widget (open picker, confirmation, outbox, a per-widget audience: W8, W14, W17 to W21) say so: the app can't set those parts, a tap on the widget shows them. A store build redirects the route to Settings.

## Decisions (one line each)

- **Registration has one owner** (the store, through `sync.register`), because every register-device rotates the token.
- **The app reads the widget state with the widget token**, as ARCHITECTURE.md 3.1 says, and keeps a sealed per-user copy so a launch whose register-device failed can still refresh the widget.
- **Offline, the app patches the last server state** rather than building from scratch, so friends' parts (groups, later flares and snaps) are not wiped by an offline push.
- **Pushes are debounced (600 ms) and serialised**: the usual 3 editor saves on every change, and each state read counts toward 120 calls an hour per device.
- **iOS skips step 6 and hides the widget UI** while it has no widget, instead of guiding people to add something that doesn't exist.
- **"Add it for me" is a tonal button above the steps**, so DESIGN.md's one primary ("I added it") stays; COPY.md asks for the button only where the launcher supports pinning, and the app learns that from the first `requestPinWidget` answer.
- **`age.helper` reworded** from "Just a quick check. We don't save the date." to "A quick check. We don't save the date.": COPY.md 1.3 bans "just" as a softener, and the banned-word test had turned `npm run ci` red. Same meaning, still soft (DECISIONS.md, first Android build). Words owner please confirm.

## Strings added to COPY.md (Words owner, please review)

`set.widgets.row_plain`, `set.widgets.auto_now` (4.17); new section 4.28 "Developer screens (dev builds only)": `dev.ws.row`, `dev.ws.title`, `dev.ws.sub`, `dev.ws.needs_tap`, `dev.ws.sent`, `dev.ws.refused`, `dev.ws.none`, `dev.ws.unsupported`, `dev.ws.live`, `dev.ws.live_done`. Regenerated with `npm run gen -w @clink/shared`; the Android widget strings are unchanged (`gen-android-strings --check` up to date).

## Results (2026-11-16)

| Check | Command | Result |
|---|---|---|
| Repo | `npm run ci` | green |
| App tests | `npx jest --selectProjects app` | 21 suites, 192 tests. New: `lib/widget/sync.test.ts` (12, every bridge call path with the bridge mocked), `lib/widget/state.test.ts` (9), `test/flows/widget.flow.test.tsx` (17: token, pushes on log and usual change, widget log once before and after it syncs, sign-out and deletion clearing, setup state, no calls on iOS, F8 pin / no pin / I added it / iOS skip, camera notice, Settings > Widgets, Widget states), `lib/region.test.ts` (3), 5 new adapter tests |
| Live, clink-dev | `NODE_USE_ENV_PROXY=1 SUPABASE_ACCESS_TOKEN=proxy-injected CLINK_E2E=1 npx jest -c e2e/widget-api/jest.config.js` | 10/10, twice in a row. About 0.29 s per widget-api call |
| Debug APK | `npx expo prebuild -p android --no-install`, `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` (JDK 17, `~/android-sdk`) | BUILD SUCCESSFUL in 9 min 37 s. `app/android/app/build/outputs/apk/debug/app-debug.apk`, 102,234,268 bytes (98 MB). Manifest: both widget providers, the events receiver, `app.clink.FUNCTIONS_URL` / `REGION` / `SCHEME`; embedded config has `supabaseRegion: eu-west-1`. A debug build loads JS from Metro (dev client) |
| Web on clink-dev (M1 regression) | `npm run export:web`, `node e2e/real-backend/run.mjs` | 20/20; 0 users and 0 files left. Its screenshots in `docs/screens/real-backend/` were restored to the committed ones (not this unit's folder) |
| Screens | `npm run export:web`, `node e2e/screens/widget-app.mjs` | 24 PNGs (12 states, light and dark) in `docs/screens/widget-app/`, looked at |

**What the live run does** (`e2e/widget-api/widget.e2e.test.ts`). It runs the app's own adapter in Node with +1 201 555 0105: phone sign-in, register-device refused before the account exists, complete-signup, usual 3 (Flat White saved as Decaf, a custom "Office brew"), onboarding done. Then register-device for android returns a 43-character token, sealed by the app, one live credential row. The app's state read is ready and passes the shared schema. The Kotlin-shaped `GET state?instance=4242&size=medium&tz=` twice records one instance and one `widget_added`. Kotlin-shaped logs: usual #1 counted as not caffeinated, the same id again answers `duplicate`, water, the custom slot, a replay 10 minutes old keeps its time, and water with a slot is refused (400). Then it checks the rows as postgres (4 rows, `source = widget`, the Decaf flag), and the app's `getToday()` returns each widget log once. A second register-device makes the old token 401 at once. Sign-out makes the token 401 for state and log, removes the device row, and the app forgets its copy. Deletion goes through the app's delete path, and `account_leftovers` is `{}`. Cleanup removes the user, `install_history`, `rate_counters` and this run's `app_events`. Afterwards clink-dev holds none of this run's data. One other account (+1 201 555 0106, created 13:48 UTC, android) belongs to someone else's hand test and was left alone.

**Screens looked at** (light and dark, 390 x 844): onboarding step 6 with "Add it for me", after "I added it" found nothing, after a launcher that can't pin, the iOS-look guide, the camera notice, the guide from the notice, the camera once a widget is found, Settings > Widgets (two widgets, none, largest text), Widget states and its snackbar. Fixed after looking: snackbars on Widget states covered "Back to my data" (now inset above it); the onboarding captures needed `&widgets=none` (the setup mock has widgets, so "I added it" moved straight on, as it should). The web review build drops `?look=` on an in-app push, so the guide is captured by URL; on a phone the look comes from the OS.

## Not done, and why

- **iOS widget**: no Apple account or Mac (above).
- **No run on a device or emulator**: no KVM here. The APK is built; the CEO's emulator test is next. Things only a device shows: the launcher's pin dialog, the 60 s watch after it, foreground timing, Keystore behaviour.
- **The live state JSON was checked with the shared zod schema, not with the Kotlin decoder.** The Kotlin decoder is tested against the same fixtures (`android-widget.md`); running it on a captured live state is a cheap next check for the Android owner.
- **Medium widget audience from Settings (Android) and the configuration screen**: M3 with groups. Rows are read-only until then.
- **Widget flares, replies and their drops** (`off.flare_dropped`, `off.reply_dropped`): M4. `drainOutbox()` runs on every foreground, and its drops are not shown yet; M2 has only logs, which never drop.
- **Snap and flare thumbnails for the widget** (`cacheDir/clink-widget/<file>`): M3 to M5, once widget-api returns signed URLs.
- **Undo of a widget log that hasn't synced**: Undo deletes the server row, which doesn't exist yet, and the widget then sends the log. Same edge as the backend's tombstone note; rare, revisit if QA sees it.
- **Sentry** (listed in ARCHITECTURE.md 13 M2): not set up; it needs a DSN and the M0 Sentry wiring.

## For other owners

- **Shared**: `packages/shared/src/index.ts` should add `export * from './api';` (the backend note checked there are no name clashes). Until then `lib/api/supabase.ts` and the live run import `packages/shared/src/api` by relative path; switch to `@clink/shared` after.
- **Root `package.json`**: the live run is opt-in (`CLINK_E2E=1`); add a `test:e2e:widget` script if wanted. `npm test` doesn't pick it up.
- **CTO, ARCHITECTURE.md 3.1**: record that the app keeps a sealed copy of the widget token to read `widget-api/state`, and the offline rule (patch the last server state with the app's counts). 4.4: register-device is called by the app once per launch per account, not after each sign-in step.
- **Design**: confirm "Add it for me" as a tonal button above the steps (DESIGN.md 4.3 shows only the primary and the text button).
- **QA**: add a manual script for "Add it for me" on a launcher that pins (Pixel) and one that doesn't, and for Settings > Widgets after adding and removing widgets.
