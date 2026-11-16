# Build notes: Android widget (M2, solo use)

The Android home-screen widget is built: Jetpack Glance, small and medium, idle with today's counts and a ticking last-drink timer, the +1 Drink picker (usual 3 + Water), logging with an offline outbox, midnight reset, signed-out and setup states, and every other fixture state drawn from the shared schema. Written 2026-11-16. Owner: Android.

## Deviation: Android first

M2 says both platforms ship together. There is no Apple Developer account and no Mac here, so the iOS widget (Swift, WidgetKit, App Intents) can't be built or tested. iOS gets a typed no-op module (`app/modules/clink-native/ios/ClinkNativeModule.swift`, `widgetsSupported: false`) so the app still builds and runs; the JS calls are identical on both platforms. The iOS widget waits for the Apple account.

## Where things are

| Path | What |
|---|---|
| `app/modules/clink-native/` | Local Expo module, autolinked from `app/modules`. `index.ts` and `src/` are the JS API; `app.plugin.js` is its config plugin (registered in `app/app.config.ts`). |
| `android/src/main/java/app/clink/widget/` | The widget: `model/` (decoder, view rule, Automatic rule, outbox), `store/` (DataStore, Keystore token), `net/` (widget-api), `work/` (WorkManager), `ui/` (Glance), receivers, `WidgetBridge` |
| `android/src/expo/java/.../ClinkNativeModule.kt` | The Expo bridge, kept apart so the harness builds without React Native |
| `android/clink-widget.gradle` | Dependencies and test setup shared by the module and the harness |
| `android/standalone/` | Standalone Gradle harness: builds and tests the widget without a prebuild |
| `app/assets/native/android/res/` | Generated resources (strings, colours, shapes, drawables, picker previews) |
| `scripts/gen-android-strings.mjs`, `gen-android-colors.mjs`, `gen-drink-assets.mjs` | Generators, each with `--check` |
| `scripts/gen-android.test.mjs` | Generator and config plugin checks (`node --test`) |
| `docs/screens/widget-android/` | 80 rendered PNGs: every state, light and dark, small and medium, largest font |

Libraries (latest stable at build time): Glance 1.2.0, WorkManager 2.11.2, DataStore Preferences 1.2.1; tests: Robolectric 4.16, glance-appwidget-testing 1.2.0, work-testing 2.11.2. Kotlin and the Compose compiler plugin come from the template (Kotlin 2.2.10): the module adds the Compose plugin to its own buildscript the same way `expo-modules-core` does, so no root Gradle edit and no `app/plugins/with-android-glance.ts` were needed (this replaces that line in ARCHITECTURE.md 1.1; flagged to the CTO).

## JS API (the contract for the app)

```ts
import { ClinkNative } from '../modules/clink-native'; // app/modules/clink-native

ClinkNative.widgetsSupported            // true on Android, false on iOS / web / Jest
await ClinkNative.setWidgetState(stateOrJson)  // widget-api/state body; throws ERR_WIDGET_STATE_INVALID if the shared schema would refuse it (last good state kept)
await ClinkNative.setWidgetToken(token | null) // register-device widgetToken (43 base64url chars); null removes it
await ClinkNative.getInstalledWidgets()  // [{ id: appWidgetId, size: 'small' | 'medium' }]
await ClinkNative.requestPinWidget('medium') // true if the launcher showed its add dialog
await ClinkNative.reloadWidgets()
await ClinkNative.getOutbox()            // { pending: OutboxEntry[], dropped: DroppedOp[] }
await ClinkNative.drainOutbox()          // flushes now; returns and clears DroppedOp[] for off.* messages
await ClinkNative.clearAll()             // sign-out: state, outbox, token, cached files; widgets show signed out
```

How the app calls it (Wire unit):
1. After `register-device` on every launch: `setWidgetToken(widgetToken)`. This also starts a flush.
2. On every foreground and after any change to usual drinks, groups, tracker or flares: fetch `widget-api/state` (or build it) and `setWidgetState(json)`. The widget keeps its own outbox and optimistic counts across this call.
3. On foreground: `drainOutbox()`; show `off.flare_dropped` / `off.reply_dropped` for each item (none in M2: only logs, which never drop).
4. `getInstalledWidgets()` on foreground hides the "Add the widget" card (F8, ARCHITECTURE.md 3.5); `requestPinWidget('medium')` backs `onb.widget.and.pin` ("Add it for me").
5. Sign-out: `register-device` signout, then `clearAll()`.

The widget never sees the Supabase session. It calls `widget-api` itself with the widget token.

## How it works

**State.** The app's state JSON is decoded by the Kotlin port of `widgetStateSchema` (`model/WidgetState.kt`), as strict as zod: unknown keys, wrong `v`, zone-less or second-less timestamps, impossible dates and over-budget text are refused, and the last good state stays (QA_PLAN ST8). `model/Resolve.kt` ports `resolveWidgetView()` and `model/Automatic.kt` the Automatic rule.

**Store.** One Preferences DataStore in the app process (`store/WidgetStore.kt`): state JSON under `widget.state.v1`, its receive time, the outbox, per-`appWidgetId` locals (picker mode, open time, confirmation) and configs (size, audience), the reported instances, and the sealed token. Glance sessions collect the store's flow, so every write redraws.

**Token.** AES-256-GCM with a key generated in the Android Keystore (`store/TokenVault.kt`, alias `clink.widget.token.v1`, no user auth so it works while locked after first unlock). Stored as base64(iv + ciphertext). If the key can't open it (restore to a new phone), the token is dropped and the app registers again. Never logged, never returned to JS.

**Logging.** +1 Drink opens the picker (`OpenPickerAction`). A pick (`LogDrinkAction`) writes, in one quick step: an outbox `log` entry with a device UUID, whole-second `loggedAt`, catalog `drinkId` and slot (water is `water.still`, no slot); the widget's confirmation ("Logged", 4 s); and enqueues `clink.sync`. Counts go up at once: `Optimistic.apply` adds pending logs (and acked logs the stored state can't have yet) to today's counts. Caffeine is not guessed (a Decaf usual would count wrong); the next state or log answer brings it.

**Sync** (`work/Sync.kt`, ARCHITECTURE.md 3.2 and `WIDGET_API_ERRORS`). Expedited one-off on Android 12+ (plain one-off before, which avoids a foreground notification), network constraint, exponential backoff from 10 s, `APPEND_OR_REPLACE` so a log queued mid-flush is never skipped. Per log: `POST {functions}/widget-api/log` with `{id, drinkId, slot, category, loggedAt, timeZone}`, headers `Authorization: Bearer <token>` and `x-region`. 200 removes it and applies the answer's `today`; 401 reads the token again and retries once, then waits for the app; 403, 408, 429 and 5xx retry later; any other 4xx drops it. Then `GET widget-api/state?instance=&size=&tz=` when something was sent, the state is older than 10 minutes, or a widget instance hasn't been reported for `widget_added` yet (one per call). 8 s timeout on every call.

**Outbox rules** (`model/Outbox.kt`). `log` retries forever and is never dropped. `flare` and `respond` (M4) drop at their `dropAt` into `dropped` for the app. Failed shows at `createdAt + 30 s` for flares and replies only: the shared resolver says logs never fail visibly (PRD 3.20 "never dropped"), which wins over the "Failed state" wording in the task; a tap on Failed retries the same op in place.

**Timers** (`work/Deadlines.kt`, `work/Workers.kt`). `clink.tick` is a one-off at the next moment the widget looks different with no new data: picker close (30 s), confirmation end (4 s), Failed (30 s), drop times, flare and snap expiry, the next weekday 08:00 or 18:00 (Automatic label, medium only). `clink.midnight` is a one-off at the next local midnight plus 1 s. `clink.refresh` runs every 15 minutes with a network constraint. Nothing depends on when a job ran: every render works out today's date, the picker and confirmation from the clock, so a midnight job delayed by Doze still draws zeros. `ClinkSystemEventsReceiver` redraws and re-plans on boot, time, time zone and locale changes (Chronometer bases use the elapsed-realtime clock, which resets at boot).

**Last drink.** Superseded in the polish pass: the line is the time of day of the last drink ("Last drink 12:54 PM"), with no Chronometer (see the polish pass below). Flare countdowns still count down to `expiresAt` with a `Chronometer`.

**Instance key** is `appWidgetId`. Two providers (`ClinkSmallWidgetReceiver`, `ClinkMediumWidgetReceiver`) so the picker offers Small and Medium (labels from `set.widgets.size.*`); both are resizable and draw the same `ClinkWidget`. Widget picker previews are rendered PNGs of W4.

## Layout decisions (DESIGN.md 5; the idle, picker and confirmation layouts below are superseded by the polish pass)

Glance `SizeMode.Responsive` with five sizes: 2x2 120 x 120, tall 2x2 120 x 150, 4x2 short 250 x 120, 4x2 250 x 160, wide 4x2 300 x 160. DESIGN.md's three sizes were drawn for the iPhone SE medium (321 pt); 250 dp is narrower, so:
- **Wide medium (300 dp and up)** is the DESIGN.md 5.2 layout as drawn.
- **Medium at about 250 dp**: the water count takes its own line, the usual #1 line (and the caffeine note in it) drops second in the DESIGN.md 5.1 order, the last-drink line uses the small string, and button labels are 13 with tighter padding so "+1 Drink", the camera and "Who joins?" with its category glyph all fit whole.
- **Small**: "3 | drinks ◦4 / Last 7:30" beside the numeral, +1 Drink full width. At font scale 1.3 and up the water count takes the second line and the last-drink line drops.
- **Numerals** are `TextView`s through RemoteViews with font padding off (Glance `Text` can't turn it off; the 2x2 has no room for it).
- **Picker cells** use a fixed 12 dp radius: the system inner radius turned 48 dp cells into circles that clipped their labels. Long one-word names end in "…" in narrow cells instead of breaking mid-word.
- **Rim** is a layer-list: the rim colour fills the rounded shape and the body is inset 4 dp from the top with the same radius, so the band thins out down the corner curves. Container radius is `system_app_widget_background_radius` on 12+, 16 dp before.
- **Text**: system sans (DESIGN.md 2.4), condensed bold for numerals; SemiBold is drawn as Medium because RemoteViews has no 600. Widget text is capped at 1.3x (`ModelBuilder.textScale`), and font scale 1.3+ drops secondary lines (`compactText`).
- Flare states (W9 to W16) render from the shared schema; their buttons open the app until M4 sends flares and replies from the widget. Who joins?, Camera, Invite and the snap tile open the app (`clink-dev:///camera`, `/usual`, `/settings`). Snap and flare photo thumbnails are read from `cacheDir/clink-widget/<file>` if the app put them there; until then the tile shows the camera glyph.

## Results (2026-11-16)

| Step | Command | Result |
|---|---|---|
| Toolchain | JDK 21 (system) + JDK 17 (apt, for the RN Gradle toolchain); SDK cmdline-tools 16111833 in `~/android-sdk`: platform 37.0, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1, licenses accepted | ok |
| Prebuild | `cd app && npx expo prebuild -p android --no-install` | ok; `app/android/` is gitignored (checked with `git check-ignore`); prebuild rewrites `app/package.json` scripts, restored each time |
| App build | `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` | BUILD SUCCESSFUL, 104 MB debug APK; manifest has both providers, the events receiver and the three `app.clink.*` meta-data |
| Module tests in the app | `./gradlew :clink-native:testDebugUnitTest` | 40/40 |
| Harness tests | `app/android/gradlew -p app/modules/clink-native/android/standalone testDebugUnitTest` | 40/40: decoder and view rule (6), outbox and timers (13), sync (10), Glance (9), renders (2) |
| Renders | same, plus `-PclinkScreens=$PWD/docs/screens/widget-android -PclinkPreviews=$PWD/app/assets/native/android/res` | 80 PNGs, looked at and fixed (see layout decisions) |
| Generators | `node scripts/gen-android-{strings,colors}.mjs --check`, `node scripts/gen-drink-assets.mjs --check`, `node --test scripts/gen-android.test.mjs` | up to date; 6/6 |
| JS | `npx tsc -p app/modules/clink-native/tsconfig.json`, eslint, prettier | clean |

What the tests cover: every fixture W1 to W22 decodes and resolves to its expected small and medium view; every invalid fixture is refused; T22 to T33 and A1 to A8 of the Automatic rule; logs retry 500 times and never drop; flares Failed at 30 s and dropped at 2 min; logs never show Failed; counts update at once; acked logs count until a newer state; midnight reset in London, late jobs, logs after midnight; next midnight across New York's DST change and in Tokyo; picker closes at 30 s; confirmation lasts 4 s; deadlines; airplane mode then online syncs 3 logs with their original times and distinct ids; 401 re-reads the token once; 4xx drops; no token sends nothing; stale state refresh reports a new instance; the token is stored sealed; the error table; Glance: labels and actions of idle, picker (each slot and water), close, failed retry, signed out, setup, confirmation, font scale 2.0.

**Robolectric needs no emulator.** Render tests use native graphics mode, so the PNGs are the real RemoteViews inflated and drawn.

## Environment notes

- Maven Central answers bursts with 429 here; Gradle runs were retried in a loop (`-Dorg.gradle.internal.repository.max.retries=10`). Not an issue on GitHub runners.
- Maven Central redirects large files (`react-android` AARs, Robolectric runtimes) to `repo.reactnative.dev` and `gcp.mirrors.maven.org`. Both hosts were added to the personal `clink` environment's allow list (approved in the session) to build here.

## Not done here

- iOS widget (no Apple account, no Mac).
- Root `package.json`: `check:gen` should also run the three Android `--check` scripts and `node --test scripts/gen-android.test.mjs`; `scripts/README.md` should list the new scripts. Both files are outside this unit's paths; CI runs them in the new `android` job meanwhile.
- The Glance configuration activity (Who joins? audience per widget) belongs with groups (M3); medium widgets use Automatic.
- On-device check on the CEO's emulator: the APK is built but this container has no KVM.
- "Widget states" debug screen and the add-widget guide wiring are app (JS) work for the Wire unit, using `setWidgetState` with the fixtures and `requestPinWidget`.

## Questions for owners (not the CEO)

- Copy: keys the widget lacks: `ws.pick.title` (tall 2x2 picker header; the widget shows only the close button), an "and {n} more" item for `{replies}` (a11y.w.live), and `a11y.w.tracker` without the last-drink sentence for a water-only day (the widget uses the first sentence of `a11y.w.tracker`).
- Design: answered in the polish pass (time of day for the last drink; layouts redrawn).
- Design / Copy: DESIGN.md shows "Logged · Flat White"; COPY.md has only `wm.logged` "Logged". The widget shows "Logged" with the drink name beside it in secondary text, and reads "Logged Flat White".

## Polish pass (2026-11-16)

Owner: Lead Product Designer and Android. The Android widget redrawn to the CEO's bar (CLAUDE.md guidelines 1 to 4), plus the Kotlin review fixes. Picks up the "WIP: widget polish pass" commit, which had finished the review fixes (items 6 to 9) and started the redesign. Picture of the result: `docs/screens/widget-android/overview.png`; the M2 renders are kept in `docs/screens/widget-android/before/`.

### What changed, and why

| Problem (orchestrator review) | Now |
|---|---|
| "Last 1:42:00" read like a clock | The last drink is a time of day: "Last drink 12:54 PM" (`wm.last_at`), then "Last 12:54 PM" and "Last 12:54" (`ws.last_at`) as room shrinks, in the device's 12/24 h setting. No Chronometer counts up any more; `Chrono` is countdown-only (flares). Midnight clears it with the counts. Screen readers: `a11y.w.tracker_at`, `a11y.w.tracker_water`, `a11y.w.tracker_none`. |
| The idle widget had no #1 drink | The idle 4x2 is split edge to edge: counts on enamel under the cobalt rim, and a drink panel in the usual #1's tint under its own ink rim, holding the drink's picture and short name over Who joins? (DESIGN.md 5.2, "Android 4x2 idle"). The tall 2x2 shows the picture and name above +1 Drink. No usual 3: a cobalt panel with the rim mark and "Pick your usual 3" (W6). |
| Picker art tiny, names cut | Icon L is cropped to what is drawn (`scripts/gen-drink-assets.mjs`, `cropViewBox`), so a flat white fills its cell like a tall glass; pictures are capped at 1.5x the 64 grid so outlines stay crisp. Names are whole, 13 then 12 then 11, on up to 2 lines, under the picture or beside it in low cells (short 4x2). The 2x2's 50 dp cells can't hold "Ceremonial" whole, so there the pictures carry the cells and the names are spoken only. |
| "Who j..." at font 2.0, clipped snap tile | Every layout measures its text before drawing and takes the first arrangement that fits. Drop orders are in DESIGN.md 5.1: camera first, then label size, Who joins? glyph, padding; flare text: place, avatar, "left", then the countdown on its own line; a flare title never goes (the hero gives way). The render test fails on any ellipsized, clipped or broken text, at font 1.0, 1.3 and 2.0, in every size. |
| Generic Material pill layout | Two rims side by side (brand and drink), the drink art as the anchor, Who joins? in the drink's solid right under the drink it sends, the confirmation as one row across both parts with the logged drink's picture, the signed-out widget in the same split with the rim mark on cobalt. Pills stay (DESIGN.md 2.6: Android buttons are full pills), cards are down to the one panel. |

### Decisions (one line each)

- **Split 4x2 with a full-height drink panel**, not a rounded tile: one object (your drink and its flare button) instead of another card, and the rim rule (1.2) gives the panel its own band.
- **Panel about 45% of the width, never narrower than Who joins? needs**, so the drink reads as the anchor and the button keeps its 15 sp label where it can.
- **Camera button drops first on the 4x2** (250 dp has no room for three buttons at 15): the app opens on the camera, so it stays one tap away.
- **Confirmation, Sending, Failed span both parts** with the panel left in place behind, so nothing jumps for 4 s; the row uses the cobalt tint of +1 Drink, which reads on both enamel and tint (white "raised" vanished on light enamel).
- **Drink pictures cropped in the generator, not at runtime**: one deterministic viewBox per drink, light and dark identical, checked by `--check` and a script test.
- **Pictures capped at 1.5x their 64-grid size**: past that the 3-unit outline looks heavy next to 13 sp text.
- **2x2 padding 10 dp** (12 on the 4x2, 8 around picker grids): the tall 2x2 then fits counts, the usual #1 and the button.
- **Small picker drops names, keeps pictures**: dropping is allowed, cutting is not (DESIGN.md 5.1); each cell keeps "Log Flat White" for screen readers.
- **Caffeine note turns the panel tea-coloured with a chamomile**; Who joins? keeps the usual #1's solid because it still sends that drink.
- **Text heights measured at 1.36 em (+1.2 em per line, +1 dp)**: 1.33 em missed pixel rounding at font 1.3 and the test caught clipped lines.
- **`GlanceRenderTest` runs with native graphics** like the renders, so both measure text the same way and drop the same things.
- **Goldens are half-size PNGs, compared at 0.5% of pixels off by more than 24 per channel**: small enough to commit (512 KB for 20), loose enough for resampling, tight enough to catch a moved button.
- **Widget picker previews regenerated** from the new W4 renders (`drawable-nodpi/clink_widget_preview_*.png`).
- **`clink_bg_plate_*` removed** (replaced by `clink_bg_panel_*`), and the unused `clink_numeral_water` layout deleted.

### Review fixes (items 6 to 9; code from the WIP commit, verified here)

| Item | Where | Tests |
|---|---|---|
| 6. Decoder ignores unknown keys, unknown enum values degrade, strict on types, required fields and budgets (CTO) | `model/WidgetState.kt` | `DecoderAndResolveTest.decoderIgnoresUnknownKeysAndSkipsUnknownValues`, every fixture W1 to W22, every invalid fixture |
| 7. Logs never silently dropped: 400/409/422 retried with backoff when `WIDGET_API_ERRORS` says retryable; malformed moves to `rejected`, read by the app with `getOutbox()` / `takeRejected()` | `model/Outbox.kt`, `net/WidgetApi.kt`, `work/Sync.kt`, `WidgetBridge.kt`, `src/ClinkNative*.ts` | `SyncTest.aMalformedLogMovesToTheRejectedListForTheApp`, `aRetryableRefusalKeepsTheLogAndRetriesWithBackoff`, `OutboxAndTimersTest.rejectedLogsMoveToTheRejectedListAndUnauthorizedStay` |
| 8. Acked logs pruned by the state request's start time; `widget.reported.v1` cleared on sign-out; water-only label `a11y.w.tracker_water`; countdown `wm.in.left` / `ws.in.left`; golden comparison | `store/WidgetStore.kt` (`putStateJson(json, receivedAt, asOf)`), `ui/ModelBuilder.kt`, `WidgetScreenshotTest` | `OutboxAndTimersTest` (acked log after a state request started stays counted), `SyncTest.signOutForgetsReportedWidgets`, goldens in `src/test/resources/goldens` |
| 9. `android:allowBackup="false"` plus data extraction rules that exclude everything, set by `app.plugin.js` (CTO) | `app.plugin.js`, `res/xml/clink_data_extraction_rules.xml` | `gen-android.test.mjs` (plugin), prebuilt manifest checked |

**Play data-safety form:** Auto Backup and device transfer are off, so no app data goes to Google Drive backups or to a new phone; the widget's local store (token, today's counts, friends' first names and places in flares) stays on the device and is cleared at sign-out. Answer "data is not backed up off-device by the app" accordingly; everything user-related lives on our server (PRD 7 store declarations).

### Copy and design docs

- `COPY.md` (widget keys only): `ws.last_at` now also serves the narrow 4x2 with the full time ("Last 7:30 AM"), max 13; `ws.in.left` / `wm.in.left` note the bare countdown fallback; `wm.usual`, `wm.caff`, `a11y.w.plate`, `wm.pick.title` descriptions follow the new layout. No new keys were needed. Regenerated with `npm run gen -w @clink/shared`, and `node scripts/supabase/sync-shared.mjs` for the functions copy of the table (the script test fails otherwise).
- `DESIGN.md` 5.1 (rim table, margins, drop order, time), 5.2 (Android 4x2 idle), 5.3 (small idle, picker, friend's flare), 5.5 (sizes, drink pictures, picker cells).
- For Design (outside my sections): DESIGN.md 3.6 still says Icon S 28 for widget pickers and Icon S 16 for the usual #1 line; Android now draws cropped Icon L there (5.5).

### Results (2026-11-16)

| Step | Command | Result |
|---|---|---|
| Harness tests | `app/android/gradlew -p app/modules/clink-native/android/standalone testDebugUnitTest --rerun-tasks` (JDK 17, `ANDROID_HOME=~/android-sdk`) | 50/50: decoder 8, Glance 9, outbox and timers 16, sync 14, renders 3 (134 renders with nothing cut, 20 goldens matched, art sheet, previews) |
| Renders | same, `--tests '*WidgetScreenshotTest*' -PclinkScreens=$PWD/docs/screens/widget-android -PclinkPreviews=$PWD/app/assets/native/android/res` | 134 PNGs plus `art-sheet-{light,dark}.png`; every one looked at (small, tall small, short, medium, wide; light and dark; font 1.3 and 2.0), several rounds |
| Goldens | same, plus `-PclinkUpdateGoldens` | 20 in `app/modules/clink-native/android/src/test/resources/goldens`, looked at |
| Overview | a PIL script over the renders (scratch, not in the repo) | `docs/screens/widget-android/overview.png` |
| Prebuild | `cd app && npx expo prebuild -p android --no-install`, then `app/package.json` restored | ok; manifest has `allowBackup="false"` and `clink_data_extraction_rules` |
| In-app module tests | `cd app/android && ./gradlew :clink-native:testDebugUnitTest` | 50/50 |
| Generators | `npm run check:gen:android`, `node --test scripts/gen-android.test.mjs` | up to date; 8/8 (new: crop bounds with strokes, arcs and rotation; every Icon L cropped, same viewport light and dark) |
| Repo | `npm run ci` | green |

New render-test switch: `-PclinkDump=<fixture>-<LAYOUT>-<night>-<fontScale>` prints the inflated view tree (sizes, text, typeface) into the test output, for chasing a clipped line.

### Not done, and why

- **iOS widget**: still no Apple account or Mac.
- **On-device look**: no KVM here; the renders are real RemoteViews drawn by Robolectric, but launcher corner radii, the system font and pixel rounding should be checked on the CEO's emulator (Pixel launcher, 2x2 and 4x2, light and dark, largest text).
- **Archivo in the widget**: RemoteViews can't use bundled fonts dependably (DESIGN.md 2.4), so the system sans stays.
- **Snap and flare photos**: the tile keeps the camera glyph until widget-api returns thumbnails (M3 to M5).
