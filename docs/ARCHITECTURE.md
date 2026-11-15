# Clink: architecture and build plan

Owner: CTO, with the Head of Development and the IT Specialist.
Status: v1 plan, revised 2026-11-15 after the Risk review (`RISK_REVIEW.md`) and the QA review (`QA_PLAN.md`). `DECISIONS.md` overrides this file. Product behaviour lives in `PRD.md`, visuals in `DESIGN.md`, words in `COPY.md`. This file says how we build it. Finding ids in brackets (M-02, QF-S4) point to the resolution log in `RISK_REVIEW.md`.

Decisions made here are marked **Decision:** with a one-line reason. Facts we could not confirm while writing (prices, version numbers, quotas) are marked **(verify)**.

---

## 0. Principles

1. **The widget never depends on JavaScript running in the background.** Everything that happens while the app is closed (widget buttons, push handling, widget refresh, notification actions on Android) is native Swift or Kotlin. JS runs only when the app is open. Headless JS on iOS is unreliable and on Android it adds a second code path we'd have to test.
2. **The server is the only writer of shared truth.** Flares, responses, friendships, reports and XP are written by edge functions through `security definer` SQL functions in the `private` schema. Clients write directly only to their own private rows (drink logs, usual drinks, settings, groups).
3. **Nothing internal is reachable from the API.** Postgres grants `EXECUTE` to `PUBLIC` by default and Supabase exposes every function in `public`. So internal functions, server-only tables and moderation views live in `private`, and the first migration revokes function execute in `public` (4.2). Only `flare_view` and `incoming_flares` are exposed.
4. **Reads run as the user.** Edge functions read through RLS (a JWT client, or `set local role authenticated` for widget tokens), so pgTAP tests cover every read path. Only writes use the service role.
5. **Privacy by table, not by column.** Postgres RLS is per row. Anything a friend must never see (phone hash, notification settings, which group a flare went to) lives in a separate table with owner-only or no client access.
6. **Push is the real-time channel. Widget refresh is best effort.** Both OSes throttle widget reloads. Notifications and the Live Activity are what make a flare feel instant.
7. **No quiet hours anywhere.** No column, no setting, no server check (CEO guideline 5). The prototype's F23 quiet-hours row is removed.
8. **The server owns time.** `meet_at`, XP local dates and expiry checks use server time (`private.app_now()`, which a dev-only offset can move for tests). Clients send durations and a tap time, never deadlines.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Expo + React Native, TypeScript strict | Latest stable Expo SDK at build time, minimum SDK 54. New Architecture on. |
| Navigation | Expo Router | Routes in `app/src/app/`. Deep link `/i/[code]` handled by the router. |
| Builds | EAS Build, EAS Submit, EAS Update | iOS builds run on EAS macOS workers, so nobody needs a Mac to ship. |
| iOS widget | Swift, WidgetKit, App Intents, ActivityKit | Interactive buttons (`Button(intent:)`), `AppIntentConfiguration` for group choice, Live Activity + Dynamic Island for your live flare. |
| iOS push helper | Notification Service Extension (Swift) | Updates widget data when a flare notification arrives, even if the app was killed. |
| Android widget | Kotlin, Jetpack Glance | Latest stable Glance at build time, minimum 1.1. Configuration activity in Compose. Ongoing notification for your live flare. |
| Backend | Supabase: Postgres, Auth, Storage, Edge Functions (Deno), Realtime, pg_cron, pg_net | See section 4. |
| Push | Direct APNs (HTTP/2, token auth) and FCM HTTP v1 from edge functions | See section 7. |
| Errors | Sentry (`@sentry/react-native`) | Free tier to start (verify limits). EU region if we launch in the EU, no PII, no user id (8.6). |
| Analytics | None third-party in v1 | KPIs come from server tables plus a small `app_events` table. Keeps privacy labels short. |

**Minimum OS versions**

- **iOS 17.2. Decision:** interactive widgets and widget configuration intents need iOS 17, and push-to-start Live Activities need 17.2. One code path is worth losing a very small share of old devices.
- **Android 8.0 (API 26). Decision:** notification channels exist on every supported device, so there's one notification code path. Target SDK is whatever Google Play requires on the submission date. That number moves every August, so check it before each release.

**Why Supabase.** Postgres with RLS fits a friend graph and gives us real constraints (unique live flare, friend cap, XP idempotency) in the database. Auth covers Apple, Google and phone OTP. It's one vendor for DB, auth, storage, functions and cron. Firebase was the alternative. We rejected it because Firestore security rules for friend-of-friend visibility are harder to test than SQL policies.

### 1.1 How native targets live in an Expo project

We use Continuous Native Generation: `ios/` and `android/` are **not committed**. `npx expo prebuild` generates them from `app.config.ts`, config plugins and our native source folders. EAS runs prebuild on every build.

**iOS widget extension and Notification Service Extension**

- Plugin: `@bacons/apple-targets`, pinned to an exact version. It reads `app/targets/<name>/expo-target.config.js` and adds a real Xcode target during prebuild.
- `app/targets/widget/` holds Swift: the widget bundle, timeline provider, App Intents (`LogDrinkIntent`, `OpenPickerIntent`, `QuickFlareIntent`, `RespondFlareIntent`, `SelectGroupIntent` configuration), Live Activity views, an asset catalog with the drink images, and the shared Swift code (state model, API client).
- `app/targets/notification-service/` holds the Notification Service Extension.
- Entitlements on the app and both extensions: App Group `group.<bundle-id>.shared` and a shared Keychain access group. The plugin writes extension bundle IDs into the EAS config so EAS creates a provisioning profile per target.

**iOS code that runs inside the main app** (start a Live Activity, write App Group data, reload widgets, read push-to-start tokens, check which widgets are installed) lives in a local Expo module, `app/modules/clink-native/ios/`, written with the Expo Modules API in Swift. Autolinking compiles it into the app. An `ExpoAppDelegateSubscriber` in the same module handles silent pushes natively.

**Android widget**

- The Glance widget, its `GlanceAppWidgetReceiver`, the configuration activity, the FCM service and WorkManager workers all live in the same local module, `app/modules/clink-native/android/`.
- The module's own `AndroidManifest.xml` declares the receiver, the configuration activity and the `appwidget-provider` XML. Gradle's manifest merger puts them into the app, so we don't need a plugin to edit the manifest.
- A small config plugin, `app/plugins/with-android-glance.ts`, handles what the module can't: the Compose compiler Gradle plugin on the root build classpath, and the Glance and WorkManager dependency versions.

**Why not a JS-rendered widget library.** `react-native-android-widget` and similar render widgets from JS. The CEO approved native Glance, and we want widget buttons to work without starting JS (principle 1).

**Risks and mitigations**

| Risk | Mitigation |
|---|---|
| `@bacons/apple-targets` is community-maintained and marked experimental. An Expo SDK upgrade can break it. | Pin the exact version. Do SDK upgrades on a branch with a full EAS build of both platforms. Our Swift lives in plain files under `targets/`, so if the plugin dies we can move to a hand-written config plugin without rewriting widget code. At build time, check whether Expo ships a stable first-party widget package, and evaluate it. Don't depend on it. |
| The Live Activity attributes type must exist in both the app (our Expo module) and the widget extension. | Keep one `FlareActivityAttributes.swift` in `targets/widget/Shared/`. A prebuild step copies it into the module's iOS sources. CI fails if the two copies differ. |
| Two `FirebaseMessagingService`s (ours and `expo-notifications`') conflict on Android. | Our service extends the Expo one and calls `super` for anything that isn't ours. Prove this in the M0 spike. |
| APNs needs HTTP/2. Edge functions run on Deno. | Deno's `fetch` negotiates HTTP/2. Prove it against APNs sandbox in M0. Fallback: a tiny Node push worker on a free-tier container host. |
| Kotlin and Compose versions have to match the React Native Gradle setup. | Read the Kotlin version from the RN template. Don't override it. The plugin sets only what Glance needs. |
| EAS build images move Xcode versions. | Pin the EAS image in `eas.json` per profile. Bump on purpose. |
| OTA updates can't touch Swift or Kotlin. | Widget code ships only with store builds. See section 10. |

---

## 2. Repo layout

One GitHub repo, pnpm workspaces. **Decision:** pnpm with `node-linker=hoisted`. React Native native module resolution still trips over isolated `node_modules` in some libraries, and hoisting removes that class of bug.

```
clink/
  app/                          Expo project (bundle root for EAS)
    app.config.ts               bundle IDs, entitlements, plugins, per-env values
    eas.json                    build profiles (section 10)
    src/
      app/                      Expo Router routes (onboarding, camera, sheets, /i/[code])
      features/                 flares, snaps, tracker, friends, groups, xp, settings
      lib/                      supabase client, api calls, native module wrappers
      ui/                       components and design tokens from DESIGN.md
    targets/
      widget/                   Swift: widgets, App Intents, Live Activity, assets, Shared/
      notification-service/     Swift: Notification Service Extension
    modules/
      clink-native/
        ios/                    Swift: App Group store, widget reload, ActivityKit, push handling
        android/                Kotlin: Glance widget, config activity, FCM service, workers,
                                ongoing notification, install referrer, encrypted store
        src/                    TS bindings + web stubs
    plugins/                    our config plugins (glance gradle, attributes copy, etc.)
    assets/drinks/              generated drink images for app screens
  packages/
    shared/
      src/catalog/              drink catalog: ids, names, categories, caffeine flags, OPTS
      src/strings/              string table generated from COPY.md keys
      src/xp.ts                 XP kinds, values, caps, level thresholds and names
      src/audience.ts           "Automatic" group rule (weekday 08:00-18:00)
      src/limits.ts             PRD text limits as zod schemas (shared by app and functions)
      src/events.ts             app_events names and props (PRD 6) as a zod enum
      src/widget-state.ts       zod schema of the widget JSON
      src/api.ts                request/response schemas for edge functions
      src/db.types.ts           generated by `supabase gen types`
      fixtures/                 widget states (W1 to W22), audience cases (T22 to T33), shared by TS, Swift, Kotlin
  supabase/
    config.toml
    migrations/                 SQL, one file per change, never edited after merge
    functions/
      _shared/                  auth, push (apns.ts, fcm.ts), rate limit, generated/ (copied from packages/shared)
      complete-signup/  register-device/  widget-api/  delete-account/
      send-flare/  respond-flare/  close-flare/  flare-tick/
      share-snap/  react-snap/  snap-cleanup/
      redeem-invite/  invite-preview/  match-contacts/  friend-request/  report/
    tests/                      pgTAP tests for every RLS policy and every private function (deny)
    seed.sql                    local test users and friend graph
  web/                          static site: invite landing page, privacy, terms, guidelines,
                                support, account deletion (signs in first), report form, .well-known files
  design-assets/drinks/         master drink images from Design (1024 px)
  scripts/                      gen-drink-assets, gen-native-catalog, gen-strings, sync-shared-to-functions,
                                export-user, seed-review-accounts, send-review-flare
  e2e/maestro/                  Maestro flows
  docs/                         DECISIONS, PRD, ARCHITECTURE, DESIGN, COPY, RISK_REVIEW, QA_PLAN,
                                MODERATION (Legal), legal/ (Legal), runbooks/, spikes/
  .github/workflows/
```

**Sharing TS with edge functions.** Supabase's function bundler and Deno resolve imports differently from Metro. **Decision:** `scripts/sync-shared-to-functions` copies the dependency-free files from `packages/shared/src` into `supabase/functions/_shared/generated/`. CI fails if the copy is stale. It's crude, and it never breaks a deploy.

**Sharing the catalog with Swift and Kotlin.** `scripts/gen-native-catalog` writes `catalog.json` (ids, names, widget names, categories, caffeine flags, option fields from `COPY.md` 2) into the widget target and the Android module's assets. Widgets look up drink names and images by id (`coffee.cortado`) from that file. `scripts/gen-strings` builds the string table for the app and both widget targets from `COPY.md` keys, so no string is typed in Swift, Kotlin or TS.

---

## 3. Widget data and refresh model

### 3.1 What the widget shows and where it reads it

Both widgets render from one JSON document, the **widget state**, defined once in `packages/shared/src/widget-state.ts`. Swift and Kotlin decode it. The same fixture files test all three decoders.

```jsonc
{
  "v": 1,
  "state": "ready",                       // "signed_out" | "setup" (signed in, onboarding unfinished) | "ready"
  "updatedAt": "2026-11-15T09:12:00Z",
  "me": { "initial": "D", "friendsCount": 5 },
  "usual": [ { "slot": 1, "drinkId": "coffee.flat_white", "category": "coffee", "name": "Flat White",
               "drinkShort": "Flat White", "summary": "Iced · Oat milk · Double shot", "hasDetails": true } ],
  "today": { "localDate": "2026-11-15", "drinks": 3, "water": 4, "caffeinated": 2, "lastDrinkAt": "..." },
  "groups": [ { "id": "…", "name": "Work", "emoji": "🏢", "memberCount": 4, "avatarFiles": ["a_….jpg"] } ],
  "auto": { "daytimeGroupId": "…", "otherGroupId": null },
  "lastPlace": "Kaffa Roastery",
  "myFlare": { "id": "…", "category": "coffee", "drinkName": "Cortado", "place": "Kaffa Roastery",
               "meetAt": "…", "expiresAt": "…",
               "replies": [ { "name": "Leo", "kind": "in" },
                            { "name": "Sam", "kind": "bring", "drinkShort": "Cortado", "hasNotes": true } ] },
  "incoming": [ { "flareId": "…", "senderName": "Maya", "avatarFile": "a_….jpg", "category": "matcha",
                  "drinkName": "Ceremonial Matcha", "place": "Café Lumi", "photoFile": "fp_….jpg",
                  "meetAt": "…", "expiresAt": "…", "myResponse": null } ],
  "snaps": [ { "id": "…", "senderName": "Leo", "thumbFile": "s_….jpg", "place": "Office kitchen", "expiresAt": "…" } ],
  "outbox": [ { "id": "…", "op": "log", "createdAt": "…", "dropAt": null } ]
}
```

- `myFlare` is present only while the flare is live. After it closes as done, the sender's widget returns to idle and the run list lives in the app (PRD 3.3).
- `incoming[].photoFile` exists only for recipients of that flare, because `widget-api` builds it from RLS-checked reads (4.4).
- Usual names are base drinks (`COPY.md` 2.1). Details travel in `summary` and `hasDetails`.

| | iOS | Android |
|---|---|---|
| State JSON | App Group `UserDefaults(suiteName:)`, key `widget.state.v1` | Jetpack DataStore (Preferences) in the app process. The widget runs in the app process, so no cross-process store is needed. |
| Images (snap thumbs, avatars, flare photo thumbs) | Files in the App Group container. Widgets can't load remote images while rendering (`AsyncImage` doesn't work in widgets), so files are downloaded before reload. | Files in app cache. Decoded downsampled to a Bitmap for Glance. RemoteViews has a bitmap memory cap, so thumbs stay at 480 px or less. |
| Per-widget config (which group) | `SelectGroupIntent` parameter (`GroupEntity` from App Group data: Automatic, Everyone, each group). An id not in `groups` is treated as Automatic. | Glance state per `appWidgetId`, set by the configuration activity. `widgetFeatures="reconfigurable|configuration_optional"`. Same unknown-id rule. |
| Widget auth token | Shared Keychain access group, `kSecAttrAccessibleAfterFirstUnlock` | Android Keystore-wrapped key. Jetpack Security Crypto is deprecated, so use Keystore directly (or Tink). |

**Widget token. Decision:** at sign-in the app registers the device and gets a random 256-bit **widget token**, stored hashed in `private.widget_credentials`. It authorises only `widget-api`, for that one user. Sharing the Supabase refresh token with the widget would break, because refresh tokens rotate and two processes refreshing at once log the user out. The token is revoked on sign-out (3.6), account deletion, suspension, and when another account registers the same device.

**What the app writes.** On every foreground, after any change to usual drinks, groups, the tracker or flares, and after any push it handles, the app fetches `widget-api/state`, writes the JSON, downloads missing images, deletes files no longer referenced, then calls `WidgetCenter.shared.reloadAllTimelines()` (iOS) or `GlanceAppWidget.updateAll()` (Android). Reloads requested while the app is in the foreground don't count against the iOS budget.

**The Automatic label offline.** The widget label shows what Automatic resolves to now (PRD 3.3 group configuration rule 4), and it must flip at 08:00 and 18:00 with no network. Swift and Kotlin each port the 4.6 rule, reading `auto`, `groups[].memberCount` and the device clock. All three ports (TS, Swift, Kotlin) run against `packages/shared/fixtures/audience.json` (QA_PLAN 6.3, T22 to T33). The server still decides the real recipients (4.6).

### 3.2 Interactive buttons

| Button | iOS | Android |
|---|---|---|
| +1 Drink | `OpenPickerIntent` sets `mode=picker` locally and returns. The system reloads the widget after `perform()`. The timeline adds an idle entry at now + 30 s, so the picker closes itself (PRD 3.3 rule 3). | `ActionCallback` updates Glance state and calls `update()`. The picker has a close button. A WorkManager job at 30 s resets it. |
| Pick a drink / water | `LogDrinkIntent(drinkId)`: writes the log to state optimistically (count goes up at once), adds it to `outbox`, then POSTs `widget-api/log` with a device-made UUID. On failure it stays in `outbox`. | Same, through an expedited WorkManager job, because `ActionCallback` must return quickly. |
| Who joins? | `QuickFlareIntent(groupConfig)`: POSTs `widget-api/flare` with `audience: auto | everyone | <groupId>`, `timingMin: 0`, `tappedAt` and the device time zone. The server sets `meet_at`, resolves the audience (4.6) and starts the Live Activity by push-to-start. A `409 live_flare_exists` reply means a flare is already live: the widget fetches state and shows it. Only the app can replace a flare (PRD 3.5 rule 7). | Same call and same 409 rule. On success, posts the ongoing notification natively. |
| I'm in / Bring me one | `RespondFlareIntent(flareId, kind, slot?)`. For Bring me one the server copies the saved order from `usual_drinks`, so the widget sends it exactly as saved. | Same. |

**Outbox.** Widget actions queue the same way as the app (PRD 3.20):

| op | Retries | Dropped at | After the drop |
|---|---|---|---|
| `log` | Forever. The device-made UUID makes it idempotent. | Never | n/a |
| `flare` | Until accepted | `tappedAt` + 2 min | Removed. The widget returns to its priority state and the app shows `off.flare_dropped` on next open. |
| `respond` | Until accepted | The flare's `expiresAt` | Removed. The app shows `off.reply_dropped` on next open. |

- At `createdAt` + 30 s without success, the widget shows the Failed state ("Couldn't send. Tap to retry."). A timeline entry (iOS) or a WorkManager job (Android) at + 30 s draws it. A tap retries the same op in place.
- The outbox flushes on the next intent, on app open, and on a connectivity callback (Android WorkManager network constraint; iOS has no widget connectivity callback, so the next intent or timeline run).
- Every widget call has an 8 s timeout.

Widget reloads that follow an App Intent or Glance action are part of the interaction, so they aren't throttled the way background reloads are.

### 3.3 How incoming flares and snaps reach the widget

**iOS**

1. **Flare notifications carry `mutable-content: 1`.** The Notification Service Extension runs for every one, even if the app was killed. It merges the flare into the App Group state, downloads the sender's avatar thumb (and the flare photo thumb if there is one) with signed URLs that came in the payload, and calls `WidgetCenter.reloadAllTimelines()`. This is the main path, because friend-flare notifications are on by default. (Verify in the M0 spike that `reloadAllTimelines` from the NSE gets honoured within the budget.)
2. **Background pushes** (`content-available: 1`, priority 5) for: flares to recipients whose flare alerts are off (Friend flares toggle off, or notification permission denied as reported by `register-device`), snaps, flare cancellations, replies when alerts are off, and **clear** messages (below). Our `ExpoAppDelegateSubscriber` handles them natively. iOS rations these, about a few per hour per app, and drops them entirely if the user force-quit the app. Treat them as a hint.
3. **WidgetKit push updates (iOS 26+).** The server can send an APNs push of type `widgets` to ask the system to reload the widget directly, without waking the app. These are still budgeted. Use them for snaps and for flares to recipients with alerts off. (Verify the exact API and budget at build time.)
4. **Timeline fallback.** Every timeline ends with `.after(now + 15 min)`. When the provider runs and the stored state is older than 10 minutes, it calls `widget-api/state` itself with the widget token.
5. **Time-based changes need no push.** The provider adds entries at each flare's `expiresAt`, each snap's `expiresAt`, local midnight, the next weekday 08:00 and 18:00 (Automatic label), and the short UI timers (picker close at 30 s, confirmation at 4 s, Failed at 30 s). The countdown and "last drink" times use `Text(timerInterval:)` and `Text(date, style: .relative)`, which tick without reloads.
6. **Locked phone.** Snap thumbnails, friend names and place text are marked `.privacySensitive()`, so StandBy and the locked screen redact them.

iOS gives a frequently viewed widget roughly 40 to 70 background reloads a day (Apple doesn't publish an exact figure). Snaps and flares together fit inside that for a normal user. A burst of activity won't, and that is why a flare always also notifies.

**Android**

1. **FCM data messages** (high priority for flares and replies, normal for snaps and clears) arrive at our `FirebaseMessagingService` while the app is in the background or killed, but not after the user force-stops it. The service updates DataStore, downloads thumbs in an expedited worker, calls `updateAll()`, and for flares builds the notification itself (section 7). Recipients with flare alerts off still get the data message; the service updates the widget and posts nothing.
2. App-triggered Glance updates have no daily budget. The 30-minute minimum on `updatePeriodMillis` applies only to the system's periodic refresh, and we don't use it.
3. A WorkManager job every 15 minutes (the platform minimum) refreshes state if it's older than 10 minutes. One-off jobs run at local midnight, at each flare's and each snap's `expiresAt`, and at the next weekday 08:00 and 18:00.
4. Android rations high-priority FCM messages that don't show a notification. So high priority is used only for messages that do. Snaps, clears and alerts-off flares go normal priority.
5. Glance has no ticking text. For the flare countdown and the "last drink" timer we embed a `Chronometer` via `AndroidRemoteViews` (count down for flares, count up for last drink). If that proves fragile across launchers, the fallback is minute-level text refreshed by the 15-minute job and on every update.

**Clear messages.** Payload `{type: "clear", userId}`. The device drops that user's flares, replies, snaps and avatar from widget state, deletes their cached files and reloads widgets. Sent to both people on block and on removal, to every friend's devices on account deletion and on suspension (S-09, M-03, M-09 in `RISK_REVIEW.md`).

**Measuring PRD AC 3.3.8** (friend's flare on the widget within 60 s): with notifications allowed and Friend flares on, it rides the NSE or FCM path. With flare alerts off, the target is best effort: a background or WidgetKit push, else the 15-minute timeline.

### 3.4 Why push and the Live Activity are the real-time channel

Both OSes decide when a widget actually redraws. A notification shows within seconds and the Live Activity updates within seconds through APNs `liveactivity` pushes. So every flare goes out as a notification (unless the recipient turned flare notifications off), and the sender's live flare is a Live Activity on iOS and an ongoing notification on Android. The widget update rides along on the same push wherever possible.

**Every countdown counts to `expiresAt`** (close time): the widget, the Live Activity `timerInterval`, the Android chronometer and the in-app header. For Now, 5m and short Other flares the meet time is earlier than close, so counting to `meetAt` would hit zero while the flare is still open.

**Live Activity (iOS)**

- From the app: the app starts the activity locally with `pushType: .token` and registers the activity's push token with the server (`private.live_activity_tokens`).
- From the widget: the server starts it with a **push-to-start** push using the token the app registered at launch (`Activity<FlareActivityAttributes>.pushToStartTokenUpdates`).
- Each reply sends `event: update` with the new content state (in count, reply chips). `staleDate` = `expiresAt`.
- End:
  - Done (We're going, or expiry with replies): `event: end` with the final content "You're going", dismissal at `max(expiresAt, goingAt + 15 min)`.
  - Cancelled, replaced, or expired with no replies: `event: end` with `dismissal-date` now (`.immediate`) and no final text. "Nobody was free" shows only in the app (PRD 3.5 rule 13).
- A flare lasts at most 60 minutes, well under the 8-hour Live Activity limit.

**Ongoing notification (Android)**

- Posted natively when the flare is sent. `setOngoing(true)`, `setUsesChronometer(true)`, `setChronometerCountDown(true)`, `setWhen(expiresAt)`, on the low-importance "Your live flare" channel so it makes no sound.
- Updated in place by the FCM data message on each reply.
- Done: updated to the done text, `setOngoing(false)` and `setTimeoutAfter` to the same dismissal time as iOS. Cancelled, replaced or expired with no replies: cancelled at once.
- Android 16 adds promoted "Live Update" notifications. Evaluate in M4 whether our flare qualifies (verify the rules). It's an enhancement, not a dependency.

### 3.5 Widget installed detection (F8)

- **Server-side, for the metric.** The first `widget-api/state` call from a new widget instance records `widget_added` with its size, once per instance, in `private.widget_instances`. Instance key: iOS widget kind plus family plus configuration hash from the timeline context; Android `appWidgetId`. This counts widgets added while the app stays closed (PRD metric 1).
- **App-side, for the UI.** The app checks `WidgetCenter.shared.getCurrentConfigurations` (iOS) and `AppWidgetManager.getAppWidgetIds` (Android) on every foreground and hides the "Add the widget" card. Settings > Widgets lists these (PRD 3.3). iOS can read a widget's configuration but can't change it, so the iOS list is read-only.

### 3.6 Sign-out (M-16)

1. The app calls `register-device` with `action: "signout"` before it clears the session. The server deletes the `push_devices` row, its `private.widget_credentials` and `private.live_activity_tokens`.
2. The app ends any local Live Activity, clears the App Group / DataStore state, cached images and the Keychain or Keystore widget token, writes `state: "signed_out"`, and reloads widgets.
3. Offline at sign-out: local state is cleared anyway, and the server call is retried on next launch. Until then the old token is stale; the next account's `register-device` upsert on the same push token moves ownership and revokes the previous owner's credentials (4.4).

---

## 4. Backend

### 4.1 Projects and region

- Two Supabase projects: `clink-dev` (Free) and `clink-prod` (Pro). **Decision:** no Supabase branching in v1. It costs extra, and local `supabase start` plus `clink-dev` covers testing.
- Region follows the launch countries (CEO question 1 in `PRD.md` 8). EU users mean an EU region.

### 4.2 Schema

Tables clients read through PostgREST live in `public` with RLS on. Everything clients must never reach (functions, server-only tables, moderation views) lives in **`private`**, which PostgREST doesn't expose. Policies use `(select auth.uid())` so Postgres evaluates it once per query. Text enums are `text` with `check` constraints, which are easier to migrate than Postgres enums. Every `exists` subquery in a policy qualifies its columns with the table alias.

Text limits in `check` constraints equal the `PRD.md` limits. Edge functions validate the same numbers first with the zod schemas in `packages/shared/src/limits.ts`, so the DB check is a backstop.

Category keys: `coffee`, `matcha`, `tea`, `smoothie_juice` (shown as "Smoothie & Juice"), and `water` for logs only.

```sql
-- 0001_security.sql: the first migration, run as the migration role, before any function exists
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;    -- authenticated: only for the 4 helpers below
alter default privileges in schema public  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
-- No table privilege in private is ever granted to anon or authenticated.
-- service_role gets execute on every private function; edge functions call them as the service role.

-- 0002_extensions.sql
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- helpers (private) -------------------------------------------------------
-- are_friends / is_blocked answer only for the caller, so they can't be used as a social-graph oracle.
create function private.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (select 1 from public.friendships f
                 where f.user_a = least(a, b) and f.user_b = greatest(a, b));
$$;

create function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (select 1 from public.blocks bl
                 where (bl.blocker_id = a and bl.blocked_id = b) or (bl.blocker_id = b and bl.blocked_id = a));
$$;

create function private.is_suspended(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.suspensions s where s.user_id = u and s.lifted_at is null);
$$;

-- Test clock (QA_PLAN QF-S30). Dev and local only; see 9.
create table private.clock_offset (id smallint primary key default 1 check (id = 1), seconds int not null);
create function private.app_now()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select now() + coalesce((select c.seconds from private.clock_offset c), 0) * interval '1 second';
$$;

grant execute on function private.are_friends(uuid, uuid), private.is_blocked(uuid, uuid),
                          private.is_suspended(uuid), private.app_now() to authenticated;

-- people ----------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 30),
  avatar_path   text,                       -- avatars/{id}/{version}.jpg
  created_at    timestamptz not null default now(),
  check (avatar_path is null or avatar_path like id::text || '/%')
);
-- Inserted by complete-signup after the age check (4.4), never by a trigger on auth.users.
-- Trigger: display_name passes private.check_text() (blocklist, 8.4).

create table public.user_settings (          -- owner only
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  notify_flares     boolean not null default true,
  notify_replies    boolean not null default true,
  notify_snaps      boolean not null default false,
  notify_reactions  boolean not null default true,
  notify_friends    boolean not null default true,
  share_last_drink  boolean not null default false,
  contact_matching  boolean not null default true,    -- re-check my contacts at most once a day (8.1)
  discoverable      boolean not null default true,    -- "People with my number can find me"
  share_usage       boolean not null default true,    -- "Share usage stats" (app_events)
  timezone          text not null default 'UTC',      -- set by register-device on every launch
  tz_changed_at     timestamptz,                       -- caps use a new zone at most once per 24 h (4.5)
  onboarding_step   text not null default 'profile',
  updated_at        timestamptz not null default now()
);                                            -- no quiet hours, by CEO decision

create table private.user_private (          -- no client access
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  phone_hmac              bytea unique,       -- HMAC(pepper, sha256(E.164)); see 8.1
  age_confirmed_at        timestamptz not null,
  min_age_version         smallint not null,  -- which minimum the user passed (CEO question 1)
  apple_refresh_token_enc bytea,              -- encrypted; lets the web page and admin deletion revoke (5, 4.7)
  install_id              uuid                -- for the invite XP rule (4.5)
);
-- The birth date is never stored.

create table public.last_drink_shares (      -- row exists only while sharing is on (F26)
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_drink_at  timestamptz not null
);
-- private.recompute_last_drink(user) (security definer) runs from triggers on drink_logs insert and delete:
-- it upserts the latest non-water logged_at, or deletes the row when none is left.
-- A trigger on user_settings deletes the row when share_last_drink goes false and computes it when it goes true.

-- friends ---------------------------------------------------------------
create table public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  source      text not null check (source in ('contacts', 'invite')),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create unique index friend_requests_one_pending
  on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
create index on public.friend_requests (to_id) where status = 'pending';
-- No 'declined' status. Ignoring leaves it pending; the daily job sets it to 'expired' after 30 days, silently (F6).

create table public.friendships (
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index on public.friendships (user_b);
-- Inserted only by private.accept_friend_request() / private.redeem_invite(), which lock both users
-- (pg_advisory_xact_lock) and enforce the 20-friend cap.

create table public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
-- private.block_user() also deletes the friendship, pending requests, group memberships, and the
-- flare_recipients / flare_responses rows between the two on live flares, then sends clear messages (3.3).

-- groups (private labels) -----------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  org_id      uuid,                         -- future Teams. Always null in v1; FK added with the orgs table.
  name        text not null check (char_length(name) between 1 and 20),
  emoji       text check (char_length(emoji) <= 16),
  auto_role   text check (auto_role in ('work', 'home')),   -- "Automatic uses this for": weekdays / other times
  created_at  timestamptz not null default now()
);
create unique index groups_one_role_per_owner on public.groups (owner_id, auto_role) where auto_role is not null;

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, member_id)
);
create index on public.group_members (member_id);
-- Trigger on friendships delete removes the ex-friend from each other's groups.

-- drinks ----------------------------------------------------------------
create table public.usual_drinks (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  slot         smallint not null check (slot between 1 and 3),
  drink_id     text,                          -- catalog id, e.g. 'coffee.cortado'
  custom_name  text check (char_length(custom_name) between 1 and 30),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice')),
  details      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),
  check ((drink_id is null) <> (custom_name is null)),
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 2048),
  check (char_length(coalesce(details->>'note', '')) <= 120),
  check (char_length(coalesce(details->>'planB', '')) <= 80)
);
-- details keys (COPY.md 2.7): size, temp, ice, shots, caf, milk, sweet, strength, grade, base, extras[], note, planB.
-- Values are validated by zod against packages/shared/src/catalog. Trigger: custom_name, note and planB pass check_text().

create table public.drink_logs (
  id           uuid primary key,              -- generated on device, makes offline retries idempotent
  user_id      uuid not null references public.profiles(id) on delete cascade,
  drink_id     text,
  drink_name   text not null check (char_length(drink_name) <= 30),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  caffeinated  boolean not null,             -- computed on the device: catalog flag AND details.caf <> 'Decaf'
  logged_at    timestamptz not null,
  local_date   date not null,                -- device-local date, for the Today view only. XP never trusts it (4.5).
  source       text not null check (source in ('app', 'widget')),
  created_at   timestamptz not null default now()
);
create index on public.drink_logs (user_id, local_date);
-- Triggers: recompute_last_drink (above); write drink_logged / drink_log_removed to app_events (6 in PRD).

-- snaps -----------------------------------------------------------------
create table public.snaps (
  id                    uuid primary key default gen_random_uuid(),
  sender_id             uuid not null references public.profiles(id) on delete cascade,
  image_path            text not null,       -- snaps/{sender_id}/{id}.jpg     (1080 px)
  thumb_path            text not null,       -- snaps/{sender_id}/{id}_t.jpg   (480 px, for widgets)
  category              text check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  place                 text check (char_length(place) <= 40),
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '24 hours',
  hidden_at             timestamptz,         -- set by moderation, image screening or auto-hide
  reaction_notified_at  timestamptz          -- the one reaction notification was sent (PRD 3.4 rule 9)
);
create index on public.snaps (sender_id, created_at desc);
create index on public.snaps (expires_at);

create table public.snap_hides (             -- "hide for me" after a report
  user_id  uuid not null references public.profiles(id) on delete cascade,
  snap_id  uuid not null references public.snaps(id) on delete cascade,
  primary key (user_id, snap_id)
);

create table public.snap_reactions (
  snap_id     uuid not null references public.snaps(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('☕', '🍵', '🫖', '❤️', '😂')),
  created_at  timestamptz not null default now(),
  primary key (snap_id, user_id)             -- one reaction per person, can be changed
);

-- flares ----------------------------------------------------------------
create table public.flares (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  category    text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice')),
  drink_id    text,
  drink_name  text not null check (char_length(drink_name) <= 30),
  place       text check (char_length(place) <= 40),     -- set to null 24 h after the flare ends (4.8)
  meet_at     timestamptz not null,          -- set by the server: created_at + timingMin. Clients never send it.
  expires_at  timestamptz not null,
  status      text not null default 'live' check (status in ('live', 'going', 'expired', 'cancelled', 'replaced')),
  source      text not null check (source in ('app', 'widget')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  settled_at  timestamptz,                   -- XP awarded once, here
  check (meet_at between created_at and created_at + interval '60 minutes'),
  check (expires_at = greatest(meet_at, created_at + interval '15 minutes'))
);
create unique index flares_one_live_per_sender on public.flares (sender_id) where status = 'live';
create index flares_live_expiry on public.flares (expires_at) where status = 'live';

create table public.flare_photos (           -- never a snaps row (M-02)
  flare_id    uuid primary key references public.flares(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  image_path  text not null,                 -- flare-photos/{sender_id}/{flare_id}.jpg
  thumb_path  text not null,                 -- flare-photos/{sender_id}/{flare_id}_t.jpg
  hidden_at   timestamptz,
  created_at  timestamptz not null default now()
);
-- Row and files deleted by flare-tick 2 h after the flare ends.

create table public.flare_audience (         -- sender only. Recipients must never learn the group.
  flare_id  uuid primary key references public.flares(id) on delete cascade,
  audience  text not null check (audience in ('group', 'everyone')),
  group_id  uuid references public.groups(id) on delete set null
);

create table public.flare_recipients (       -- snapshot of who got it at send time
  flare_id      uuid not null references public.flares(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (flare_id, recipient_id)
);
create index on public.flare_recipients (recipient_id);
-- Deliberately no seen/opened/delivered columns. Nobody is ever shown as declined or as having seen it.

create table public.flare_responses (
  flare_id       uuid not null references public.flares(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('in', 'bring')),
  drink          jsonb,                      -- 'bring' only: {drinkId, name, category, details} copied at response time
  one_time_note  text check (char_length(one_time_note) <= 80),   -- app only ("iced today")
  source         text not null check (source in ('app', 'widget', 'notification')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,                -- "Can't make it anymore"; sender just sees one fewer
  primary key (flare_id, user_id),
  check (kind <> 'in' or drink is null)      -- drink and note are nulled 24 h after the flare ends (4.8)
);

create table private.live_activity_tokens (  -- iOS, per flare per device
  flare_id   uuid not null references public.flares(id) on delete cascade,
  device_id  uuid not null references public.push_devices(id) on delete cascade,
  token      text not null,
  primary key (flare_id, device_id)
);

-- XP (private) ------------------------------------------------------------
create table public.xp_events (              -- append-only ledger
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('invite_accepted', 'new_friend', 'flare_joined', 'drink_run_done',
                                             'flare_got_joiner', 'daily_log', 'invite_reversed', 'log_reversed')),
  amount       int not null check (amount <> 0),
  ref_id       uuid,                         -- flare id, invitee id, or null for daily_log. No FK, so the ledger outlives flares.
  counterpart  uuid,                         -- the other person, for per-pair caps
  reverses_id  bigint unique references public.xp_events(id),   -- each entry is reversed at most once
  local_date   date not null,                -- computed by the server from server time and user_settings.timezone
  created_at   timestamptz not null default now(),
  check ((kind in ('invite_reversed', 'log_reversed')) = (reverses_id is not null)),
  check ((kind in ('invite_reversed', 'log_reversed')) = (amount < 0)),
  unique nulls not distinct (user_id, kind, ref_id, counterpart, local_date)
);
create unique index xp_pair_once on public.xp_events (user_id, kind, counterpart)
  where kind in ('invite_accepted', 'new_friend');                 -- once per pair, ever (PRD 4.3 rule 3)
create index on public.xp_events (user_id, local_date);

create table public.xp_totals (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  total       int not null default 0,
  updated_at  timestamptz not null default now()
);
-- Level is computed in the app from total + thresholds in packages/shared/src/xp.ts,
-- so renaming or re-tuning levels needs no migration.

-- invites ---------------------------------------------------------------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),  -- Crockford base32, 40 bits
  max_uses    int not null default 20,      -- the friend cap: a code can't make more friends than anyone can have
  uses        int not null default 0,
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked_at  timestamptz,                  -- set by rotation ("Stop my old invites", or expiry)
  created_at  timestamptz not null default now()
);
create unique index invites_one_active on public.invites (inviter_id) where revoked_at is null;

create table private.invite_redemptions (
  invite_id    uuid not null references public.invites(id) on delete cascade,
  invitee_id   uuid not null references public.profiles(id) on delete cascade,
  redeemed_at  timestamptz not null default now(),
  primary key (invite_id, invitee_id)
);

-- safety (all private) ----------------------------------------------------
create table private.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.profiles(id) on delete set null,
  target_kind    text not null check (target_kind in ('snap', 'flare_photo', 'user')),
  target_user    uuid not null,              -- no FK: kept after the target deletes their account
  target_snap    uuid,
  target_flare   uuid,
  evidence_path  text,                       -- moderation/{report_id}.jpg, copied at report time
  reason         text not null check (reason in ('nudity', 'harassment', 'spam', 'other', 'not_consented')),
  note           text check (char_length(note) <= 200),
  priority       boolean not null default false,   -- true for not_consented and image-screening hits
  status         text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  legal_hold     boolean not null default false,   -- CSAM and legal requests: skipped by the retention job
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

create table private.suspensions (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now(),
  lifted_at   timestamptz
);

create table private.blocked_terms (         -- text blocklist (8.4); editable without a release
  term  text primary key,
  kind  text not null check (kind in ('exact', 'substring'))
);

create table private.moderation_log (        -- who did what, when (S-20)
  id          bigint generated always as identity primary key,
  moderator   text not null,
  action      text not null,                 -- hide, restore, suspend, lift, dismiss, legal_hold
  report_id   uuid,
  target_user uuid,
  created_at  timestamptz not null default now()
);

create table public.moderation_notices (     -- statement of reasons shown in the app (S-17)
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('content_removed', 'suspended')),
  target_kind  text check (target_kind in ('snap', 'flare_photo', 'profile', 'text')),
  reason       text not null check (reason in ('nudity', 'harassment', 'spam', 'other', 'not_consented', 'text')),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);

-- devices and push --------------------------------------------------------
create table public.push_devices (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  platform               text not null check (platform in ('ios', 'android')),
  push_token             text unique,        -- raw APNs device token or FCM registration token
  install_id             uuid not null,      -- random per install, kept in Keychain / Keystore
  apns_env               text check (apns_env in ('sandbox', 'production')),
  la_push_to_start_token text,               -- iOS Live Activity push-to-start
  widget_push_token      text,               -- iOS 26+ WidgetKit push updates
  notif_permission       boolean not null default false,   -- system permission as last reported
  app_version            text not null,
  locale                 text,
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now()
);
create index on public.push_devices (user_id);
create index on public.push_devices (install_id);

create table private.widget_credentials (    -- no client access
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_id     uuid not null references public.push_devices(id) on delete cascade,
  token_hash    bytea not null unique,       -- sha256 of the 256-bit token
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create table private.widget_instances (      -- widget_added once per instance (3.5)
  device_id     uuid not null references public.push_devices(id) on delete cascade,
  instance_key  text not null,
  size          text not null check (size in ('small', 'medium')),
  first_seen_at timestamptz not null default now(),
  primary key (device_id, instance_key)
);

-- ops -------------------------------------------------------------------
create table private.rate_counters (
  user_id       uuid not null,
  bucket        text not null,               -- 'flare', 'snap', 'friend_request', 'contacts', 'report', ...
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (user_id, bucket, window_start)
);

create table public.app_config (             -- readable by anyone signed in
  key    text primary key,                   -- 'min_ios_build', 'min_android_build', 'xp_levels'
  value  jsonb not null
);

create table public.app_events (             -- first-party KPIs (PRD 6)
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  name        text not null check (name ~ '^[a-z_]{3,40}$'),   -- the list is the zod enum in packages/shared/src/events.ts
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024),
  created_at  timestamptz not null default now()
);
```

Order note: `push_devices` must be created before `private.live_activity_tokens`, `private.widget_credentials` and `private.widget_instances` in the real migration. The listing above is grouped by topic for reading.

**Events.** `packages/shared/src/events.ts` holds the zod enum of PRD 6 event names and their props (enums, booleans and small integers only, never free text). Clients insert client-sent events directly; edge functions and triggers write the server-written ones. `PRD.md` 6 marks which is which. When `share_usage` is off, neither kind is written for that user.

### 4.3 Row-level security

```sql
alter table public.profiles            enable row level security;
-- (same for every public table above; private tables have no grants at all)

-- profiles: me, my friends, and people with a pending request either way. Suspended users are hidden from others.
create policy profiles_read on public.profiles for select to authenticated using (
  profiles.id = (select auth.uid())
  or (not private.is_suspended(profiles.id)
      and (private.are_friends(profiles.id, (select auth.uid()))
           or exists (select 1 from public.friend_requests r
                      where r.status = 'pending'
                        and ((r.from_id = profiles.id and r.to_id = (select auth.uid()))
                          or (r.to_id = profiles.id and r.from_id = (select auth.uid()))))))
);
create policy profiles_write on public.profiles for update to authenticated
  using (profiles.id = (select auth.uid())) with check (profiles.id = (select auth.uid()));
-- insert happens in complete-signup; delete via delete-account only.

-- owner-only tables
create policy own on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.drink_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_read on public.xp_events for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.xp_totals for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.push_devices for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.invites for select to authenticated using (inviter_id = (select auth.uid()));
create policy own_read on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy own on public.moderation_notices for select to authenticated using (user_id = (select auth.uid()));
create policy own_seen on public.moderation_notices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));   -- column grant: seen_at only

-- last drink (F26): friends read, only while sharing is on and only for 24 h
create policy friends_read on public.last_drink_shares for select to authenticated using (
  last_drink_shares.user_id = (select auth.uid())
  or (private.are_friends(last_drink_shares.user_id, (select auth.uid()))
      and last_drink_shares.last_drink_at > private.app_now() - interval '24 hours'
      and not private.is_suspended(last_drink_shares.user_id))
);

-- friendships and requests: read your own; writes go through functions
create policy mine on public.friendships for select to authenticated
  using ((select auth.uid()) in (friendships.user_a, friendships.user_b));
create policy mine on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (friend_requests.from_id, friend_requests.to_id));

-- groups: owner only, and no org groups in v1
create policy own on public.groups for all to authenticated
  using (groups.owner_id = (select auth.uid()))
  with check (groups.owner_id = (select auth.uid()) and groups.org_id is null);
create policy own on public.group_members for all to authenticated
  using (exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = (select auth.uid()))
              and private.are_friends(group_members.member_id, (select auth.uid())));

-- usual drinks: owner writes, friends read (surprise drinks, F27)
create policy own on public.usual_drinks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy friends_read on public.usual_drinks for select to authenticated
  using (private.are_friends(usual_drinks.user_id, (select auth.uid())) and not private.is_suspended(usual_drinks.user_id));

-- snaps: sender, or a friend, while live and not hidden
create policy visible on public.snaps for select to authenticated using (
  snaps.sender_id = (select auth.uid())
  or (snaps.expires_at > private.app_now() and snaps.hidden_at is null
      and private.are_friends(snaps.sender_id, (select auth.uid()))
      and not private.is_suspended(snaps.sender_id)
      and not exists (select 1 from public.snap_hides h
                      where h.snap_id = snaps.id and h.user_id = (select auth.uid())))
);
create policy own on public.snap_hides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy read on public.snap_reactions for select to authenticated using (
  snap_reactions.user_id = (select auth.uid())
  or exists (select 1 from public.snaps s where s.id = snap_reactions.snap_id and s.sender_id = (select auth.uid()))
);

-- flares: the sender, or a recipient who is still a friend, until 2 h after close (M-03)
create policy visible on public.flares for select to authenticated using (
  flares.sender_id = (select auth.uid())
  or (exists (select 1 from public.flare_recipients r
              where r.flare_id = flares.id and r.recipient_id = (select auth.uid()))
      and private.are_friends(flares.sender_id, (select auth.uid()))
      and not private.is_suspended(flares.sender_id)
      and flares.expires_at > private.app_now() - interval '2 hours')
);
-- flare photos: same rule, through the parent flare (M-02)
create policy visible on public.flare_photos for select to authenticated using (
  flare_photos.sender_id = (select auth.uid())
  or (flare_photos.hidden_at is null
      and exists (select 1 from public.flares f
                  join public.flare_recipients r on r.flare_id = f.id and r.recipient_id = (select auth.uid())
                  where f.id = flare_photos.flare_id
                    and private.are_friends(f.sender_id, (select auth.uid()))
                    and not private.is_suspended(f.sender_id)
                    and f.expires_at > private.app_now() - interval '2 hours'))
);
create policy sender_only on public.flare_audience for select to authenticated using (
  exists (select 1 from public.flares f where f.id = flare_audience.flare_id and f.sender_id = (select auth.uid()))
);
create policy own on public.flare_recipients for select to authenticated
  using (flare_recipients.recipient_id = (select auth.uid()));
-- Responses: the sender sees all; a responder sees only their own row.
-- Co-responders get names only for people they're friends with, via public.flare_view(flare_id),
-- a security definer function that applies the recipient rule above and returns
-- {in: [names of my friends], others_in: n, ...} ("2 others are in").
create policy visible on public.flare_responses for select to authenticated using (
  flare_responses.user_id = (select auth.uid())
  or exists (select 1 from public.flares f where f.id = flare_responses.flare_id and f.sender_id = (select auth.uid()))
);

-- app_config / app_events
create policy read_all on public.app_config for select to authenticated using (true);
create policy insert_own on public.app_events for insert to authenticated with check (
  app_events.user_id = (select auth.uid())
  and exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.share_usage)
);
```

Client writes to `flares`, `flare_photos`, `flare_responses`, `snaps`, `snap_reactions`, `friendships`, `friend_requests`, `blocks`, `profiles` (insert) and `xp_*` have no insert or update policy. They go through edge functions (which need to send pushes anyway). `revoke insert, update, delete` on those tables from `authenticated` as a second lock. There is no client insert path for reports (S-06): only the `report` function writes them.

**Storage buckets** (all private):

| Bucket | Path | Accepts | Policy |
|---|---|---|---|
| `avatars` | `{user_id}/{version}.jpg` | `image/jpeg`, 1 MB | Owner writes into their own folder (`(storage.foldername(name))[1] = auth.uid()::text`). Read: same rule as `profiles`. |
| `snaps` | `{sender_id}/{snap_id}.jpg`, `_t.jpg` | `image/jpeg`, 1.5 MB | Owner writes into their own folder. Read: the matching `snaps` row is visible to the caller. |
| `flare-photos` | `{sender_id}/{flare_id}.jpg`, `_t.jpg` | `image/jpeg`, 1.5 MB | Owner writes into their own folder. Read: the matching `flare_photos` row is visible to the caller. |
| `moderation` | `{report_id}.jpg` | service role | Service role only. |

Clients read media through `createSignedUrl` with their own JWT, so Storage RLS applies when the URL is minted. Lifetimes:
- snaps: `least(15 min, expires_at - now())`; no URL is minted under 30 seconds (M-17)
- flare photos: `least(15 min, flares.expires_at + 2 h - now())`, same 30-second floor
- avatars: 24 hours

Devices cache the files, so short URLs cost nothing. A signed URL is a bearer link; short lifetimes limit what a leaked one exposes after a block.

**RLS tests.** `supabase/tests/` has a pgTAP file per table. Seeded users: A (me), B (friend), C (stranger), D (blocked), E (friend outside the flare's audience), F (suspended). Each policy is tested for allowed and denied access, including: E gets no `flare_photos` row and no signed URL for a Work flare photo; after A blocks D, D gets nothing for A's live flare from `flares`, `flare_photos` or `flare_view`; a request counterpart can read the profile while pending and not after expiry; `last_drink_shares` on, off, after undo, and after 24 h. Every function in `private` is called as `authenticated` and must fail with `permission denied`. CI runs them on every PR. No migration merges without its tests.

### 4.4 Edge functions

Every function:
- validates input with the zod schemas in `packages/shared/src/api.ts` and the PRD limits in `limits.ts`
- checks the user JWT, or the widget token for `widget-api`
- refuses a suspended caller with `403 suspended` (the app shows `err.suspended`)
- runs `private.check_text()` on any text another person will see (display name, place, custom drink name, Note, Plan B, one-time note) and refuses with `422 text_blocked`
- applies rate limits (8.3)
- **reads as the user** (S-01): functions with a user JWT query through a client built with that JWT. `widget-api` resolves the token to a user id, then queries in a transaction that runs `set local role authenticated` and `select set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role', 'authenticated')::text, true)`, so RLS applies. Signed URLs are minted only for paths those queries returned.
- **writes as the service role**, through `private` functions.

| Function | Called by | Does |
|---|---|---|
| `complete-signup` | App, once after sign-in | Takes birth month and year, compares with the minimum (CEO question 1), discards them. Old enough: creates `profiles`, `user_settings`, `private.user_private` (`age_confirmed_at`, `min_age_version`) and the first invite code, exchanges the Apple authorization code and stores the encrypted refresh token. Under the minimum: deletes the auth user (`auth.admin.deleteUser`), revokes the Apple token, returns `under_age`; the app keeps the refused screen for 24 h with a Keychain / Keystore flag (M-05). |
| `register-device` | App, every launch; sign-out | Upserts `push_devices` on `push_token`; if the token belonged to another account, moves it and revokes that account's widget credentials for the device. Updates `timezone` (and `tz_changed_at` when it changed), `notif_permission`, app version, APNs env. Issues or rotates the widget token. Rotates the invite code silently when expired. On a new `install_id` for the account, notifies the account's other devices (`n.new_signin`, 5). `action: "signout"` deletes the device row and its credentials and Live Activity tokens (3.6). Returns `app_config` minimums. |
| `widget-api` | Widgets, NSE, notification actions, app | `GET state` (the widget JSON; records `widget_added` per new instance), `POST log`, `POST flare` (409 `live_flare_exists` if one is live), `POST respond`, `POST accept-request` (Android notification action). Widget-token auth, reads as the user (above). Wraps the same internals as the functions below. |
| `send-flare` | App, `widget-api` | Input: `category`, `place`, `timingMin` (0 to 60), `tappedAt`, `audience`, optional `photo` paths, `replace` (app only). One transaction: if a flare is live, refuse with 409 unless `replace` is true, in which case set it `replaced`; set `meet_at = now() + timingMin`; resolve the audience (4.6) minus blocks and suspended users; insert `flares`, `flare_audience`, `flare_recipients`, and `flare_photos` if a photo came. Image screening (8.4) runs on the photo before fan-out once it's live. After commit, fan out: alert push to recipients with `notify_flares` and permission; background push (plus WidgetKit push on iOS 26+) to the rest. The 4th and later flares from this sender in 60 minutes go out with silent payloads (iOS no sound, `interruption-level: passive`; Android `setSilent(true)`) (PRD 3.5 rule 15). At most 20 recipients, so inline with `EdgeRuntime.waitUntil`, no queue. Push-to-start the sender's Live Activity if the flare came from a widget. |
| `respond-flare` | App, `widget-api` | Requires `status = 'live'`, `expires_at > now()`, a recipient row and `private.are_friends(sender, caller)`; otherwise 404 `flare_ended`. Upserts or withdraws a response. For `bring`, copies the order from `usual_drinks` (plus `one_time_note` from the app). Notifies the sender (if `notify_replies`), updates the Live Activity or Android ongoing notification, refreshes the sender's widget. Withdrawing a Bring me one sends the sender one silent notification. |
| `close-flare` | App | Sender taps "We're going" (`going`) or cancels (`cancelled`). Ends the Live Activity, clears recipients' widgets, calls `settle_flare()`. On `going`, sends `n.closed_replier` to each standing replier (PRD 3.16). On `cancelled`, one silent notification to each replier. |
| `flare-tick` | pg_cron every minute | Marks due flares `expired`, ends Live Activities, sends background clears, calls `settle_flare()`. Deletes `flare_photos` rows and files (Storage API) 2 h after a flare ends. Widgets already hide the flare at `expiresAt` on their own; this is cleanup. |
| `share-snap` | App | Checks the path prefix is the caller's id, the snap id is new, both objects exist and are under the size limit. Image screening (8.4) once live. Inserts `snaps`, sends background updates (and an alert where `notify_snaps`) to all friends. Snaps always go to all friends. |
| `react-snap` | App | Upserts the reaction. If `snaps.reaction_notified_at` is null, sets it and sends one quiet notification to the sender in the same transaction (`interruption-level: passive` on iOS, Reactions channel on Android). Later reactions update the in-app list only. `apns-collapse-id` per snap stays as a second guard. |
| `snap-cleanup` | pg_cron hourly | Deletes Storage objects for snaps past `expires_at` through the Storage API (deleting rows in `storage.objects` with SQL leaves files behind), then the rows. Also lists `snaps/` and `flare-photos/` and deletes every object older than 25 hours whether or not a row exists, and every avatar version that isn't the current `avatar_path`. Reported items were already copied to `moderation`. |
| `match-contacts` | App | Section 8.1. |
| `friend-request` | App | Send, accept, cancel, remove friend, block. Enforces the cap of 20 and block rules. Accept awards `new_friend` XP. Remove and block delete `flare_recipients` and `flare_responses` between the two on live flares, both directions, insert `invite_reversed` entries when an invite award is under 7 days old, and send clear messages to both (3.3). "Not someone you know?" on the invite banner calls `block`. |
| `redeem-invite` | App | Section 6. |
| `invite-preview` | Landing page (public) | Returns the inviter's first name only, or the same "unknown" answer for every bad code. 60 per hour per IP. |
| `report` | App | Derives `target_user` from the snap, flare photo or person (never from the client). Copies the item to `moderation`, hides it for the reporter at once, auto-hides it for everyone at 3 distinct reporters, marks `not_consented` as priority, emails the moderation inbox with the report id, reason and a Studio link only (no image, no signed URL). 20 per day per user. |
| `delete-account` | App, web deletion page | Section 4.7. |

**SQL functions in `private`** (security definer, `search_path = ''`, execute only for `service_role`): `accept_friend_request`, `block_user`, `redeem_invite`, `resolve_audience`, `settle_flare`, `award_xp`, `hit_rate_limit`, `check_text`, `recompute_last_drink`. They take the acting user as an argument because only the service role can call them, and each edge function passes the caller from the verified JWT or widget token.

**Exposed functions** (`public`, execute granted to `authenticated` only): `flare_view(uuid)` and `incoming_flares()`. Both take the caller from `auth.uid()`, never from a parameter, and apply the recipient rule from 4.3 (still a friend, not suspended, until 2 h after close). `incoming_flares()` returns no group fields.

**Scheduled jobs (pg_cron, functions invoked through pg_net):**

| Schedule | Job |
|---|---|
| every minute | `flare-tick` |
| hourly | `snap-cleanup` |
| daily 03:00 UTC | the retention table in 4.8; pending friend requests older than 30 days set to `expired` (no notification); auth users with no `profiles` row older than 24 h deleted (abandoned or under-age sign-ups); `rate_counters` older than 2 days; revoked widget credentials older than 30 days; `push_devices` not seen in 90 days |

**Realtime.** The sender's live-flare screen subscribes to `flare_responses` changes filtered by `flare_id`. Realtime `postgres_changes` applies RLS, so only the sender gets them. The incoming-flare screen uses `flares` changes. Everything else is pull on foreground.

### 4.5 XP: award rules the server guarantees

XP values, caps and level thresholds live in `PRD.md` 4; level names in `COPY.md` 3. The code reads them from `packages/shared/src/xp.ts`, which mirrors both. This section defines the mechanism.

- **Server only.** Only `private.award_xp()` writes `xp_events` and `xp_totals`, in one transaction. Clients can't insert.
- **Awarded at the outcome, not the action.** Flare XP is awarded in `settle_flare()` when a flare ends as `going` or `expired`. A response withdrawn before then earns nothing. A `cancelled` or `replaced` flare earns nothing.
  - `flare_joined`: each responder with a non-withdrawn `in` or `bring`.
  - `flare_got_joiner`: the sender, if at least one non-withdrawn response exists.
  - `drink_run_done`: the sender, once per non-withdrawn `bring` response.
  - `invite_accepted`: the inviter, when `redeem-invite` creates a friendship with a **new** account (created through that invite).
  - `new_friend`: both people, when a friendship is created any other way (contacts request, existing-user invite confirm).
  - `daily_log`: first drink or water log of the user's local day.
- **Never** for sending flares or snaps (`DECISIONS.md`), and never for how many drinks someone logs.
- **Local day.** `local_date` is computed by the server from server time and `user_settings.timezone`. A time-zone change takes effect for caps at most once per 24 hours (`tz_changed_at`). `daily_log` is awarded only for a log whose `logged_at` is within 36 hours of receipt and whose local date is today or yesterday in the user's zone, so backdated offline logs can't farm it.
- **Caps.** Per kind per local day, plus a per-counterpart cap (the same friend counts once per day per kind), so two friends can't farm each other. Enforced by counting `xp_events` for `(user_id, local_date)` inside `award_xp()` under a row lock on `xp_totals`.
- **Once per pair, ever** for `invite_accepted` and `new_friend`: the `xp_pair_once` index. Removing and re-adding earns nothing.
- **Reversals.** Written in the same transaction as the event that causes them, with `reverses_id` pointing at the original (unique, so at most once):
  - `invite_reversed` (−50): the friendship ends, or the invitee deletes their account, within 7 days of the award (PRD 4.3 rule 2). The history shows `xp.e.adjust`, which names nobody.
  - `log_reversed` (−5): the day's last remaining log is undone or removed. A later log that same day earns nothing more (the daily key is used); accepted.
- **Invite XP abuse rule (the whole v1 rule).** No `invite_accepted` when the invitee's `install_id` or push token belonged to another account in the last 30 days, or when the invitee has no verified phone, Apple or Google identity. Nothing else (PRD 4.3 rule 8).
- **Idempotent.** The `unique nulls not distinct (user_id, kind, ref_id, counterpart, local_date)` key means a retried settlement awards nothing twice, including `daily_log` rows where `ref_id` and `counterpart` are null. `settle_flare()` also checks `settled_at`.
- XP is private and buys nothing, so the bar is "no accidental inflation and no reason to spam", not full fraud-proofing.

### 4.6 The "Automatic" audience

The rule (PRD 3.10 rule 5):

1. Monday to Friday, local time 08:00 to 17:59: the group with `auto_role = 'work'` (shown to users as "Weekdays 8 to 18"), if it exists and has at least 1 current, unblocked, unsuspended friend. Otherwise Everyone.
2. Every other time: the group with `auto_role = 'home'` ("Other times"), under the same condition. Otherwise Everyone.

- **Where it runs.** The server decides real recipients in `private.resolve_audience(sender, tz, at)`. The same rule is ported to `packages/shared/src/audience.ts` (composer "To:" label), Swift and Kotlin (widget label, 3.1). All four are tested against `packages/shared/fixtures/audience.json` (QA_PLAN 6.3 T22 to T33). **Decision:** the server stays the authority, and the native ports only draw the label, so a port bug can show a wrong label but can't send a flare to the wrong people.
- **Which instant.** `at` = the client's `tappedAt` when it is within 2 minutes of server time, else `now()`. So a flare tapped at 17:59:55 under the label "Work" goes to Work, and a flare queued offline across 18:00 goes where the label said if it reaches the server within 2 minutes (it's dropped after that anyway, 3.2).
- `auto_role` is set from the group editor row "Automatic uses this for" and from Settings > Groups (PRD 3.10 rule 6). A new group named "Work" defaults to `work`, one named "Home friends" to `home`, when that role is free.
- Recipients are always intersected with current friends and filtered by blocks and suspensions. The widget sends `auto` plus its time zone.

### 4.7 Account deletion (F24)

`delete-account` runs in this order. Every step is idempotent, so a retry finishes the job.

1. Requires a fresh session: signed in within the last 10 minutes, or re-authentication in the confirm step (the system Apple sheet, or a phone OTP). PRD AC 3.19.1 counts this sheet outside the 3-tap budget.
2. **Apple users:** revoke the Apple token. In the app: a fresh `authorizationCode` from Sign in with Apple during the confirm step, exchanged and revoked. From the web page or an admin deletion: the stored encrypted refresh token.
3. End any live flare (Live Activity end, widget clears to recipients).
4. Send every friend's devices a clear message for this user (3.3), so cached avatars, snaps and flares leave their widgets now.
5. Insert `invite_reversed` entries for inviters whose award for this user is under 7 days old (before the cascade removes the friendships).
6. Delete Storage objects under `avatars/{id}/`, `snaps/{id}/` and `flare-photos/{id}/` through the Storage API.
7. Revoke widget credentials. Delete push devices.
8. `auth.admin.deleteUser(id)`. Every table cascades from `profiles`, which cascades from `auth.users`. Others' groups lose this member through the `group_members.member_id` cascade.
9. Delete `auth.audit_log_entries` rows whose payload names the user (actor id or traits user id; match the Supabase payload shape at build time).
10. Kept on purpose, and listed in the privacy policy: `private.reports` the user filed (`reporter_id` becomes null) and reports about them (`target_user` has no FK), with their evidence, for the 4.8 periods; database backups until they roll off.

Nothing to delete at Sentry, because we never set a Sentry user id (8.6). Twilio keeps Verify records under its own retention; the privacy policy names it **(verify the period)**.

**Test.** An integration test seeds a user with a row in every table and a file in every bucket, deletes them, and asserts zero rows and zero objects remain, except the report records above.

**Web deletion page** (`web/delete-account`, Google Play requirement, M-10):
- The person signs in on the web with phone OTP (same Supabase project) or Sign in with Apple or Google (web flows, PKCE). There is no email field; we never collect email.
- The page shows the same explanation as the app (`del.*`), then calls `delete-account` with that session. Apple users are revoked with the stored refresh token.
- Deletion runs at once. If a step fails, support finishes it by hand within 30 days.
- 5 OTP sends per number per hour.
- The URL goes in the Play Data safety form and the Play listing.

### 4.8 Retention (M-08)

The daily 03:00 UTC job enforces this. Legal copies the table into the privacy policy.

| Data | Kept for | How |
|---|---|---|
| Snaps and files | 24 h after upload; file gone within 25 h, no URL works after 24 h | `snap-cleanup` hourly |
| Flare photos | Until 2 h after the flare ends | `flare-tick` |
| `flares.place`, `flare_responses.drink`, `flare_responses.one_time_note` | Set to null 24 h after the flare ends | Daily job |
| `flares`, `flare_recipients`, `flare_audience`, `flare_responses` rows | 90 days after the flare ends | Daily job. `xp_events.ref_id` has no FK, so the ledger survives. |
| `drink_logs` | 90 days | Daily job. Only today is shown, so nothing visible changes. |
| `friend_requests` pending | 30 days, then `expired` | Daily job |
| `friend_requests` accepted, cancelled or expired | 30 days after `updated_at` | Daily job |
| `private.reports` records | 1 year after `closed_at` | Daily job, skipping `legal_hold` |
| `moderation` evidence files | 90 days after `closed_at`, except legal holds | Daily job |
| `auth.audit_log_entries` | 90 days | Daily job with the service role |
| `app_events` | 13 months | Daily job |
| `push_devices` not seen | 90 days | Daily job |
| `moderation_notices` | 1 year | Daily job |
| Database backups | Rolling, as the Supabase plan keeps them (7 days on Pro at last check, **verify**) | Stated in the policy |
| Sentry events | 90 days or the plan default, whichever is shorter **(verify)** | Sentry project setting |
| Account data | Until deletion, then 4.7 | |

### 4.9 Access and export requests (M-11)

v1 handles GDPR Article 15 and 20 (and CCPA right-to-know) requests by email, with no new UI.
1. Requests go to `privacy@{domain}`, listed in the privacy policy and in Settings > Help > Contact us.
2. We verify the requester in one of two ways. Contact us opened while signed in pre-fills the email body with a short signed token carrying the user id (HMAC with a server secret, 7-day expiry). Or the person signs in on the web with OTP, as on the deletion page.
3. `scripts/export-user <uuid>` (service role, run by the CTO) writes one JSON file (profile, settings, usual 3, drink logs, groups and members, friends list, flares sent, replies, live snaps, XP ledger, reports they filed) plus their live photos, as a zip. Reports filed about them are listed without the reporter's identity.
4. Sent within 30 days through a download link that expires after 7 days.

---

## 5. Auth

| Platform | Primary buttons | Behind "Other ways to sign in" |
|---|---|---|
| iOS | Sign in with Apple, Continue with phone | Continue with Google |
| Android | Continue with Google, Continue with phone | Continue with Apple (web flow) |

**Decision:** the CEO's per-platform pair stays as the visible choice (guideline 4: few buttons). The other platform's provider sits one tap away so someone switching phones can still get into their account. `PRD.md` 3.1 matches this.

- **Apple:** `expo-apple-authentication` returns an ID token with a nonce. `supabase.auth.signInWithIdToken({ provider: 'apple' })`. "Hide my email" is fine; we never email users. `complete-signup` exchanges the authorization code and stores the refresh token encrypted, so revocation works from the web page and admin deletion.
- **Apple on Android:** the web flow with PKCE, returning through an https App Link on our domain, never a custom scheme.
- **Google on Android:** Credential Manager with Sign in with Google returns an ID token, then `signInWithIdToken({ provider: 'google' })`. Use a maintained Expo-compatible library, or a 50-line function in our native module if no free library covers Credential Manager. Check library licences at build time.
- **Phone OTP:** Supabase Auth phone provider with **Twilio Verify**. **Decision:** Twilio Verify over plain Twilio SMS, because it includes fraud screening against SMS pumping and per-country delivery handling.
  - Rough cost: about $0.05 per successful verification plus the per-country SMS fee, which runs from about $0.01 (US) to $0.10 or more in some countries **(verify pricing at sign-up; it changes often)**.
  - Controls: Twilio Verify Fraud Guard on; geo permissions limited to launch countries; Supabase Auth SMS rate limits per number and per IP; resend after 30 s (F1); a code is valid 10 minutes; **after 5 wrong codes, verification for that number is refused for 15 minutes** (`err.code_locked`).
- **Age check (M-05).** After any sign-in method succeeds for a new identity, the app shows the age screen and calls `complete-signup` (4.4) before any profile exists. The minimum lives in `app_config` (`min_age`, set per CEO question 1; build and test with 16). Where a US state app-store age law applies in a launch state **(verify their court status before launch)**, the app also reads Apple's Declared Age Range API and Google Play's Age Signals API at sign-up and treats a "minor" signal like an under-age answer.
- **Phone for Apple and Google users:** asked on the invite step (F5) so contacts can match them. Added with `updateUser({ phone })`, which sends an OTP. We verify every number, otherwise anyone could claim someone else's number and get matched as them. Changing the number needs an OTP to the new number and a fresh session.
- **Session storage:** the Supabase session is larger than `expo-secure-store`'s comfortable value size on Android, so we keep an AES key in SecureStore and the encrypted session in MMKV.
- **Account linking:** the verified phone number is the bridge between platforms. Supabase manual identity linking lets a signed-in user add Apple or Google later in Settings.
- **New-device sign-in (S-04).** When `register-device` sees a new `install_id` for an account, it sends the account's other devices `n.new_signin` with a "Not me" action. "Not me" signs out every session (`auth.admin.signOut(user, 'global')`), revokes all widget tokens and opens Settings > Account.

**Supabase Auth settings (S-14):**
- Email and anonymous sign-in off.
- Refresh token rotation on, with reuse detection. Access token lifetime 1 hour.
- Authorized Google client ids: our Android and web clients only.
- OAuth flows use PKCE (`flowType: 'pkce'`).
- Redirect URLs: our https domain only.

**App Review access (M-15).**
1. One review phone number in Supabase Auth test OTPs on `clink-prod`, with a random 6-digit code, rotated after each review. No other test numbers in prod.
2. `scripts/seed-review-accounts` gives it 3 friend accounts (their own test numbers, not signed in anywhere) with a live drink-only snap each. `scripts/send-review-flare` sends a fresh flare to the reviewer right before submission.
3. The review accounts are friends only with each other. Their numbers are on a deny list in `match-contacts` and `redeem-invite`, so they can't reach real users.
4. Review notes in both consoles: the number, the code, where report and block are (snap ⋯ menu, friends row menu), and that Sign in with Apple also works.

**Not in v1 (deferred, S-04 second half):** asking for the linked Apple or Google identity on phone sign-in after 90 days of inactivity. It needs a custom auth hook and a step-up screen. The new-device notification covers the common case. Revisit after beta.

---

## 6. Invites and deferred deep links

Guideline 6: in the app there's no visible link and no "Invite link" label. The invite screen shows WhatsApp, Messages and More buttons only. The message they send contains the URL, because WhatsApp and SMS need one. Message text is in `COPY.md` 7.

- **WhatsApp:** `whatsapp://send?text=…`. iOS needs `whatsapp` in `LSApplicationQueriesSchemes`. Android declares `<queries><package android:name="com.whatsapp"/></queries>` and never requests `QUERY_ALL_PACKAGES`. The button is hidden if WhatsApp isn't installed.
- **Messages:** `sms:&body=…` on iOS, `sms:?body=…` on Android.
- **More:** the system share sheet (React Native `Share`), which covers Instagram, Telegram, Slack and the rest.

**Link format:** `https://<domain>/i/K7Q2M9XD`. One active code per user, Crockford base32, 8 characters. A code works for up to 20 redemptions and expires 30 days after it was made (M-04). `register-device` rotates an expired or used-up code silently. Settings > Privacy > "Stop my old invites" rotates it at once (S-24). Old codes then answer like any bad code.

### Options compared

| | Our own (recommended) | Vendor (Branch, AppsFlyer OneLink, Adjust) |
|---|---|---|
| App installed | Universal Links / App Links (`autoVerify="true"`) open the app straight to `/i/[code]` | Same |
| Android, not installed | Landing page redirects to Play with `referrer=invite%3D<code>`. First launch reads the **Play Install Referrer API**. Exact match. | Same mechanism underneath |
| iOS, not installed | Landing page "Get Clink" button copies the **full invite URL** to the clipboard (user tap, so allowed), then opens the App Store. On first launch the app checks `UIPasteboard.detectPatterns(for: [.probableWebURL])`, which doesn't trigger the paste prompt. Only if it matches does it show "Got an invite?" with the system **Paste button** (`UIPasteControl`). Typing the code works too. Re-tapping the original link after install also works. | Probabilistic matching on IP and device signals. Higher capture with zero taps, but it is fingerprinting, which Apple's rules restrict and our privacy labels would have to declare. |
| Cost | $0 | Free tiers exist with limits; paid plans are significant **(verify)** |
| Privacy labels | No third-party SDK | Vendor SDK must be declared |

Firebase Dynamic Links was shut down in 2025, so it's not an option.

**Decision: build our own.** Android is exact. iOS costs the invitee one tap on Paste, which fits onboarding. We measure it in beta: landing-page visits with a code against redemptions on iOS. If iOS capture is below 70%, we bring a vendor quote to the CEO.

The app never reads the clipboard by code. Only the system Paste control does, after the user taps it.

**Pieces:**

- `web/` on Cloudflare Pages (free): `/.well-known/apple-app-site-association` (served as JSON, no redirect) with `applinks` for `/i/*` and the auth redirect paths, `/.well-known/assetlinks.json` with the SHA-256 of the **Play App Signing** key and the upload key, and the `/i/[code]` landing page.
- **Landing page headers** on `/i/*` (S-11): `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, a strict CSP, no third-party scripts, no cookies, no Cloudflare Web Analytics (so no cookie banner is needed).
- The landing page shows the inviter's first name ("Maya invited you") from `invite-preview`, which returns the first name only. Before sign-in the app shows the name with initials, never the photo (avatars need a friend relationship). On desktop the page shows a QR code (F2).
- **`redeem-invite`**, in one transaction:
  - validate the code: exists, not revoked, not expired, under 20 uses, not blocked either way, and the redeemer isn't a review account. Every failure returns the same `invite_code` error, so codes can't be probed.
  - **New account** (created in this onboarding): create the friendship automatically, as `DECISIONS.md` requires. The arrival banner offers "Not someone you know?", which calls `friend-request` `block` (removes and blocks in one tap).
  - **Existing account:** the app first shows the confirm card ("Add Maya as a friend?", Add / Not now). The app calls `redeem-invite` with `confirm: true` only after Add. Nothing is written before that.
  - inviter at 20 friends: create a friend request to the inviter instead (PRD 3.9 edge case). Invitee at 20: no friendship, nothing sent to the inviter, the app shows `cap.title` / `cap.body` with the inviter's name (PRD 3.15).
  - record the redemption, award `invite_accepted` XP (new accounts only, 4.5), notify the inviter (`n.invite_ok`, on by default, so an unexpected joiner is visible).
- **The onboarding meter is client-side.** It counts share-button taps and contact Adds in this session, at most one per button, capped at 2. The friends sheet shows real friends ("n of 20").

---

## 7. Push

**Decision: direct APNs and FCM from edge functions. No Expo push service.**

| | Expo push | Direct APNs + FCM |
|---|---|---|
| Live Activity updates and push-to-start | Not supported | Supported (`apns-push-type: liveactivity`, topic `<bundle>.push-type.liveactivity`) |
| WidgetKit push (iOS 26+) | Not supported | Supported |
| Android data-only messages to our native service | Possible but passes through another hop | Native |
| Cost | Free | Free |
| Work | Less code | JWT signing for APNs (.p8 key), OAuth token for FCM HTTP v1, about 300 lines in `_shared/push/` |

We need direct APNs for Live Activities regardless. One path for everything means one place to debug.

- On device, `expo-notifications` still handles the permission prompt (after our pre-prompt, F7), `getDevicePushTokenAsync()` (raw APNs/FCM token), notification taps and routing, and foreground display.
- **Notification actions, both platforms** (PRD 3.16 rule 2):
  - `FLARE`: "Bring me one" is a foreground action that opens the app on the Bring me one picker. "I'm in" is a background action handled natively, without starting JS: on iOS a notification action handled in the app delegate subscriber or an App Intent (M4 spike), which calls `widget-api/respond` with the widget token; on Android a `PendingIntent` to a receiver, then WorkManager, then `widget-api`.
  - `REQUEST`: "Accept" is a background action handled the same way, calling `widget-api/accept-request`.
  - `SIGNIN`: "Not me" is a foreground action (5).
  - If the M4 spike shows iOS can't handle a background action without JS, Product amends AC 3.16.3 for iOS before M4 closes, and tapping the notification opens the flare with "I'm in" one tap away. QA tests both outcomes.
- **iOS alert pushes** (flares, replies) set `mutable-content: 1` so the NSE updates the widget.
- **Android:** flares and replies are data-only, high-priority FCM messages. Our native service builds the notification with action buttons and updates the widget in the same pass.
  - **Channels, one per settings toggle plus two** (PRD 3.16 rule 3), names from `COPY.md` `channel.*`:

    | Channel | Importance | Carries |
    |---|---|---|
    | Friend flares | high | friend flares; "flare I joined was cancelled" (silent); "heading out" |
    | Replies to my flares | high | I'm in, Bring me one; Bring me one cancelled (silent) |
    | Friend snaps | default | snaps, only if the user turned them on |
    | Reactions | low | the one reaction notification per snap |
    | Friends | default | friend requests, invite joins |
    | Your live flare | low, ongoing | the sender's ongoing notification |
    | Account | high | new-device sign-in. No in-app toggle; it's a security notice. |

  - Silent rows post on their toggle's channel with `setSilent(true)`, so one channel can hold both sound and silent messages.
  - Lock screen: flare and request notifications use `VISIBILITY_PRIVATE` with a public version (`n.flare_public`, "{name} sent a flare") so the place stays hidden on a secure lock screen (S-15).
  - Android 13+ needs the `POST_NOTIFICATIONS` runtime permission, requested after our pre-prompt.
  - Receivers and services are `exported="false"` unless the system must call them. Every `PendingIntent` uses `FLAG_IMMUTABLE`.
- **APNs environments:** dev builds use sandbox; TestFlight and store builds use production. Stored per device.
- **Payload contents:** names, drink, place and timing only; never phone numbers or notes. Signed image URLs in a payload follow the 4.3 lifetimes.
- **Failures:** APNs 410 or FCM `UNREGISTERED` deletes the token. Other errors retry once. Every send writes one line to function logs with message kind, platform and result, no content.

---

## 8. Privacy, media and abuse controls

### 8.1 Contact matching

Phone numbers have about 10^10 possible values, so a plain hash can be reversed by brute force. Hashing on the device alone protects nothing, and the copy says so (`perm.contacts.body`: the numbers are sent to our server, encrypted, used for the check and not kept).

1. The app reads contacts only after the user taps "Find friends" and grants access. On iOS 18+, limited access (a picked subset) works the same way.
2. The app normalises numbers to E.164 (libphonenumber, the device region as the default country), hashes each with SHA-256, and sends the hashes over TLS to `match-contacts`.
3. The caller must have a verified phone number of their own.
4. The server computes `HMAC(pepper, hash)` with a secret pepper held only in edge function secrets, compares against `private.user_private.phone_hmac`, and returns matched profile ids and display names, nothing else.
5. Excluded from results: users with `discoverable = false`, blocked users either way, suspended users, review accounts, and people already at 20 friends (they get a request instead).
6. Nothing from the request is stored or logged. A lint rule bans logging the request body in `match-contacts`; verify in Supabase logs that request bodies aren't stored. Non-matches are not kept. We never upload or store an address book.
7. The "Contact matching" toggle (`contact_matching`): on = the app re-checks at most once a day on app open, inside the 3-call limit; off = never uploads. "People with my number can find me" (`discoverable`) is the separate opt-out from being found (PRD 3.14).
8. Limits: 2,000 hashes per call, 3 calls per day per user. An account that hits the daily cap 3 days in a row emails the CTO.
9. Legal writes the legitimate-interest assessment for non-users' numbers in `docs/legal/`.

A user's own `phone_hmac` is written when they verify their number. Phone numbers are never shown to anyone (`DECISIONS.md`). The raw number stays in `auth.users` for sign-in only.

### 8.2 Images

- The camera capture is resized on device to 1080 px (long edge) and a 480 px thumb, JPEG quality around 0.7, with `expo-image-manipulator`. Re-encoding strips EXIF, including GPS. A unit test on a fixture photo with GPS tags checks the output has none.
- Upload straight to Storage with the user's JWT, into the caller's own folder, then call `share-snap` or `send-flare`. Buckets accept `image/jpeg` only, 1.5 MB (avatars 1 MB).
- Drink catalog images (42: 10 per category plus 2 water, ids from `COPY.md` 2) are bundled, never downloaded:
  - Design delivers 1024 px masters (style in `DESIGN.md` 3).
  - `scripts/gen-drink-assets` outputs WebP for app screens, an iOS asset catalog (@2x/@3x) for the widget extension, and Android `drawable-nodpi` WebP.
  - Budget: under 5 MB total in the store download.
  - iOS 18+ tinted and clear home screens recolour widget images. Use `widgetAccentedRenderingMode` per image as `DESIGN.md` specifies.

### 8.3 Rate limits (server-side, `private.hit_rate_limit()`)

| Action | Limit |
|---|---|
| Flares | 1 live at a time (DB index), 12 per day. No minimum gap, so "sent by accident: cancel and resend" works (F15). The 4th and later flares in 60 minutes go out silent (4.4). |
| Snaps | 20 per day |
| Reactions | 1 per snap per person (primary key), 60 changes per hour |
| Friend requests | 30 per day |
| Contact matching | 3 calls per day, 2,000 hashes per call |
| Invite redemptions | 10 per day per account; landing preview 60 per hour per IP |
| Reports | 20 per day |
| Avatar uploads | 10 per day |
| `register-device` | 20 per day per user |
| Web deletion OTP | 5 per number per hour |
| Widget API | 120 calls per hour per device |
| OTP | Section 5 |

Limits return `429` with a `retryAfter`. The app shows the copy from `COPY.md` 4.22.

Spend controls: the Supabase spend cap stays on, and Twilio has a monthly spend alert (CEO question 6 in `PRD.md` 8 sets the cap).

### 8.4 Moderation (M-06, S-17, S-18, S-20)

- **Report** on any snap, flare photo or person (F14), through the `report` function only:
  - the item is hidden for the reporter at once
  - at 3 distinct reports it is hidden for everyone until reviewed
  - the evidence is copied to `moderation` before the 24 h deletion can remove it
  - "I'm in it and didn't agree" (`not_consented`) is a priority reason
- **Block:** friendship removed, requests cancelled, group memberships removed, live-flare recipient and response rows removed both ways, clear messages to both, no future requests or invite redemptions between the two.
- **Text filter (v1, free).** `private.check_text()` matches text against `private.blocked_terms` (slurs, sexual terms, common evasions; English in v1). It runs in every function that writes text another person sees, and in triggers on `profiles.display_name` and `usual_drinks.custom_name` / `details`. Refusal: `422 text_blocked`, shown as `err.text_blocked`. The list changes without a release.
- **Image screening.** Before public App Store submission, `share-snap` and `send-flare` pass the 480 px thumb to an image moderation API and hold the fan-out until it returns. A high nudity or violence score sets `hidden_at` and opens a priority report. The vendor must run no face recognition and keep no images for training, and its DPA must say so. Vendor and cost: CEO question 2. During TestFlight and the Play closed beta, a named person reviews reports daily and the text filter runs.
- **Suspension.** A row in `private.suspensions` (not on `profiles`, so users can't clear it). While suspended: every edge function and `widget-api` returns 403 `suspended`; RLS hides the user's profile, snaps, flares, flare photos, usual 3 and last drink from others (`private.is_suspended`); pushes from and to them stop; friends get a clear message. A Studio SQL snippet suspends and lifts, and writes `private.moderation_log`.
- **Statement of reasons.** When moderation hides content or suspends an account, the function writes a `moderation_notices` row. The app shows it on next open: what was removed, which rule, and how to appeal (reply to support@). A suspended user sees `err.suspended` with the same details.
- **Review.** Reports email the moderation inbox with the report id, reason and a Studio link only, never an image or a signed URL. Moderation views live in `private` with `security_invoker = true`, and Studio reads them as the service role. Only named moderators have Studio access, each with 2FA. Every action is logged in `private.moderation_log`. The 24-hour review target needs a named person (CEO question 2).
- **Non-users** report through `web/report` (description, reason, contact email), which writes a report with `reporter_id` null.
- **Process** lives in `docs/MODERATION.md`, owned by Legal and written before beta: who reviews, the 24-hour target, what each reason leads to, how to suspend, how to write the statement of reasons, and the CSAM procedure (don't download, forward or delete the evidence; hide it for everyone; suspend the account; report as the law of the company's country requires, which is NCMEC's CyberTipline with 1-year preservation if the company is US-based, otherwise the national hotline and police; set `legal_hold`).
- **No face recognition anywhere.**

### 8.5 Secrets and access (S-12)

| Secret | Lives in | Never in |
|---|---|---|
| APNs .p8, FCM service account, phone pepper, Twilio, Apple Sign in key, invite-token HMAC secret, moderation API key | Supabase function secrets | EAS, repo, app |
| Supabase service role / secret key | Supabase function secrets | CI, EAS, app |
| Supabase anon / publishable key, Sentry DSN | App config (public by design) | |
| iOS signing, Android keystore | EAS credentials | repo |
| Supabase access token for deploys | GitHub Environment secret; the prod environment needs approval | |

- Anything in `app.config.ts` `extra` or an `EXPO_PUBLIC_*` variable ships inside the app and is public. Only the two public values above go there.
- GitHub secret scanning with push protection, and Dependabot, are on from day one.
- The CEO keeps an offline copy of the pepper in a password manager. Losing it means recomputing every `phone_hmac` from `auth.users`.
- A rotation note per secret lives in `docs/runbooks/`.
- Every account uses 2FA. The CEO owns each account and grants roles; people never share passwords.

### 8.6 Sentry (S-13)

- EU data region if we launch in the EU.
- `sendDefaultPii: false`. "Prevent storing IP addresses" on in project settings.
- No Session Replay, no screenshots, no view-hierarchy capture.
- `beforeSend` and `beforeBreadcrumb` drop request and response bodies, URLs with query strings, text-input values, and any field named `note`, `planB`, `place`, `phone`, `hashes`, `display_name`.
- No Sentry user id. Tags carry ids and enums only (platform, app version, screen).
- Declared in the store forms as crash and performance data (`PRD.md` 7).

### 8.7 Deep links and app components (S-10)

- Invites and auth redirects use the https domain (Universal Links / App Links with `autoVerify="true"`), never the custom URL scheme, which any app can register.
- Android receivers and services are `exported="false"` unless the system must call them; `PendingIntent`s use `FLAG_IMMUTABLE`.
- The app never reads the clipboard by code (6).

### 8.8 Vendors and legal records (M-12, S-23)

- The CEO accepts each vendor's data processing agreement when creating the account (section 12). Legal keeps `docs/legal/vendors.md`: what data each vendor gets, the date accepted, and the transfer basis (EU-US Data Privacy Framework certification, or the SCCs in the DPA; **verify each**). Vendors: Supabase, Twilio, Google Firebase (FCM), Apple, Google Sign-In, Sentry, Cloudflare, Expo, the email provider, and the image moderation vendor.
- Legal also writes before beta, in `docs/legal/`: the record of processing (Art. 30), the contact-matching LIA, a short DPIA, and the breach runbook (72-hour notice to the lead supervisory authority where required; telling users when the risk is high).

---

## 9. Testing

| Layer | Tool | Runs where |
|---|---|---|
| Types and lint | `tsc --noEmit`, ESLint | Linux container, CI |
| Unit (shared, app logic) | Jest (`jest-expo` preset) | Linux container, CI |
| Components | React Native Testing Library | Linux container, CI |
| Edge functions | `deno test` with a fake push sender: happy path, every PRD text limit, every refusal, the block case through `widget-api` | Linux container (install Deno), CI |
| Database and RLS | pgTAP through `supabase test db`, plus `supabase db lint` and the Supabase security advisor | Linux container with Docker (available here), CI |
| Account deletion | Integration test: seed every table and bucket, delete, assert nothing is left (4.7) | Linux container with Docker, CI |
| Widget state contract | Shared JSON fixtures decoded by zod, Kotlin and Swift | TS and Kotlin on Linux. Swift on EAS or a Mac. |
| Android widget UI | `glance-appwidget-testing` unit tests (JVM) | Linux after `expo prebuild`, CI on native changes |
| iOS widget UI | SwiftUI `#Preview` for every fixture state | Needs a Mac with Xcode. Optional. |
| E2E | Maestro flows in `e2e/maestro/` | Android: EAS Workflows or Maestro Cloud (this container has no KVM, so no emulator). iOS: EAS macOS runners or Maestro Cloud. **(verify plan and cost)** |
| On-device widget QA | Debug-only "Widget states" screen | Real phones from EAS dev builds |

**The "Widget states" screen** is in development and preview builds only. It writes each fixture into shared storage and reloads. The fixture list is `QA_PLAN.md` 4.1, W1 to W22: signed out, not set up, idle with snap, idle no snap, no friends, no usual 3, caffeine note, +1 picker, my live flare with and without replies, friend's flare with hero and with photo, "+N", Bring me one picker, replied in, replied bring, confirmation, sending, failed, ended, audience empty, and the sender's widget after a done flare. Each in small and medium. QA checks every state on real phones without a Mac. This is the main widget test before each release.

**Moving the clock.** In local and dev, a row in `private.clock_offset` moves `private.app_now()` and the edge functions' clock (`_shared/clock.ts`), so QA can test 24 h snap deletion, 30-day requests, the 7-day XP reversal, the 2 h run list and `flare-tick` without waiting. Production refuses it twice: the prod deploy job fails if the row exists, and every function refuses to run when `CLINK_ENV=prod` and an offset is set.

**Expo web for UI review.** App screens run on Expo web with web stubs for the native module (camera shows a placeholder). Design and Product review screens from the Linux container that way. Widgets and the Live Activity can't render on web; review them on device.

**What needs EAS cloud or a Mac:** every iOS build, iOS Swift compilation, Live Activity and NSE testing, push testing on real devices, Sign in with Apple. Android release builds also go through EAS so signing keys stay in EAS.

**Coverage rules:** every RLS policy has allow and deny tests. Every function in `private` has a test that calls it as `authenticated` and gets `permission denied`. Every edge function has a happy-path test and a test for each limit or permission refusal. XP caps, reversals and idempotency get dedicated tests (PRD AC 4.6.2, 4.6.3, 4.6.8). The audience fixtures run in TS, Swift and Kotlin. Every flow F1 to F31 has a Maestro flow or a manual script. F23 is the notifications screen; it has no quiet hours.

---

## 10. Environments, CI, builds and OTA

### Environments

| Env | Supabase | App variant | Bundle id |
|---|---|---|---|
| local | `supabase start` (Docker) | dev client | `<bundle>.dev` |
| dev | `clink-dev` | dev client and preview builds | `<bundle>.dev` |
| prod | `clink-prod` | store builds | `<bundle>` |

The dev variant has its own App Group, widget kind and icon badge, so dev and prod can sit on one phone. `<bundle>` is reverse-domain from the domain we buy. Bundle IDs can't change after the first store upload, so we set them in M0 once the domain is chosen.

### EAS build profiles (`eas.json`)

| Profile | Distribution | Channel | Backend |
|---|---|---|---|
| `development` | internal (dev client) | `development` | dev |
| `preview` | internal / TestFlight / Play internal testing | `preview` | dev |
| `production` | store | `production` | prod |

The EAS build image is pinned per profile. Credentials are managed by EAS, including the extension provisioning profiles.

### CI (GitHub Actions)

- **On every PR:** install, typecheck, lint, Jest, Deno tests, `supabase db lint`, the Supabase security advisor (fail on "security definer view", "function search path mutable", "RLS disabled"), pgTAP on a local Supabase, the deletion integration test, the shared-code drift check, the string-table drift check against `COPY.md`, and the Live Activity attributes copy check. When native paths change: `expo prebuild` plus the Android Gradle unit tests.
- GitHub secret scanning with push protection and Dependabot are on for the repo (8.5).
- **On merge to `main`:**
  - apply migrations and deploy functions to `clink-dev`
  - `eas update --channel preview` when only JS changed
  - otherwise `eas build --profile preview` when the native fingerprint changed
- **Release (tag `v*`):** a GitHub Environment with manual approval by the CTO or Head of Development, then:
  - fail if `private.clock_offset` has a row in `clink-prod`
  - migrations to `clink-prod`
  - deploy functions
  - `eas build --profile production --platform all --auto-submit`
- Migrations must be backwards compatible with the previous two store builds: add columns, never rename in one step.

### OTA update policy

- `runtimeVersion` policy: `fingerprint`. An update only reaches builds with the same native code. Widget, Live Activity, NSE and Glance code can never change by OTA.
- OTA is allowed for JS bug fixes, copy changes and UI tweaks that don't change an API contract or store-reviewed behaviour.
- Every production update goes out with `--rollout-percentage 10`. We watch Sentry for 24 hours, then roll to 100%. Rollback means republishing the previous update.
- `app_config.min_*_build` drives a "Please update" screen for builds the server no longer supports.

### Store review builds

Before each submission: rotate the review OTP code, run `scripts/send-review-flare`, and paste the review notes from section 5 into App Store Connect and the Play Console.

---

## 11. Cost estimate

Monthly unless stated. Prices are from our knowledge at writing and **all need checking at sign-up**.

| Item | 0 to 5k users | 5k to 25k users | Notes |
|---|---|---|---|
| Supabase | $0 (dev on Free) → $25 Pro for prod from beta | $25 to $60 | Pro includes about 100k MAU, 8 GB DB, 100 GB storage, 250 GB egress (verify). Above 10k DAU, a bigger compute add-on may be needed (+$15 to $50, verify). Free projects pause when idle and have no backups, so prod is on Pro from the first beta. |
| Storage egress | in plan | $0 to $30 | Widgets fetch 480 px thumbs (about 40 KB), so a snap seen by 10 friends costs about 0.4 MB. Uncertain: depends on snaps per day. |
| Edge function calls | in plan | $0 to $20 | About 2M included (verify). Widget state fetches dominate; capped by the 10-minute staleness rule. |
| SMS (Twilio Verify) | $0 to $250 | $250 to $1,500 | One verification per phone signup or new device, plus retries. Biggest variable cost, and it depends on country mix. Very uncertain. |
| EAS | $0 (Free) → about $19 | about $19 to $99 | Free plan has limited, low-priority builds and a limit on update MAUs (verify both). |
| Apple Developer | $99 / year | same | |
| Google Play | $25 once | | |
| Domain | about $10 to $60 / year | same | Depends on the TLD (verify). |
| Cloudflare Pages + DNS | $0 | $0 | |
| Sentry | $0 | $0 to $26 | Free tier error limits (verify). |
| Email (store contact, support, moderation) | $0 to $7 per mailbox | same | Free forwarding on our domain, or Google Workspace about $7 per user (verify). |
| Maestro Cloud / EAS Workflows E2E | $0 to unknown | | Decide in M2 after a trial; ask the CEO before any paid plan (CEO question 7). |
| Image moderation API | $0 in beta | unknown | Needed before public App Store submission (8.4). Priced per image; vendor and price are CEO question 2 (verify before purchase). |
| Test devices | one-off | | Core set of 5 used or refurbished phones (QA_PLAN 2.2 and 2.3); CEO question 7 (verify prices). |
| **Total (excl. yearly)** | **about $25 to $300** | **about $300 to $1,700** | SMS is most of the range. |

The original PRD's "$0 per month" for 0 to 5k assumed Supabase Free and no SMS. We don't recommend running prod on Free, and phone sign-in has a real per-user cost.

---

## 12. Accounts and setup checklist for the CEO

Create each one in the CEO's (or the company's) name. Turn on 2FA. Then invite the CTO with an admin or developer role. Don't share passwords. When a vendor offers a data processing agreement (DPA), accept it while creating the account and tell Legal the date for `docs/legal/vendors.md` (8.8).

| # | What | When | Cost | Needed for | Notes |
|---|---|---|---|---|---|
| 1 | **Shared work email** (e.g. a new Gmail now, moved to the domain later) | Now | $0 | Signing up for everything below | Use one address for all accounts so nothing is tied to a personal inbox. |
| 2 | **GitHub** organization + private repo `clink` | Now | $0 (Free plan; Actions minutes limited, verify) | M0. Our cloud container is temporary; code must live on GitHub from day one. | Invite the CTO as owner or admin. |
| 3 | **Apple Developer Program** | Now (enrollment can take days, longer for a company) | $99 / year | M0: installing dev builds on a real iPhone, APNs key, Sign in with Apple, App Groups | Company enrollment needs a D-U-N-S number. Add the CTO as Admin in App Store Connect. |
| 4 | **Expo account** (organization) | Now | $0 to start | M0: EAS builds | Upgrade to a paid plan only when build queues slow us down (ask first). |
| 5 | **Supabase** organization | Now | $0 dev; $25 / month Pro for prod from M6 beta | M0 | Region depends on launch countries. Request the DPA in the dashboard. Turn the spend cap on. |
| 6 | **Firebase project** (Google account) | M0 | $0 | Android push (FCM) | Only FCM is used. No Analytics SDK. |
| 7 | **Google Cloud OAuth client** (same Google account) | M1 | $0 | Sign in with Google | Created by the CTO once access is granted. |
| 8 | **Twilio** account with Verify | M1 | Pay as you go, needs a card; about $0.05 per verification + SMS fee (verify) | Phone sign-in | Set a monthly spend alert. Turn on Fraud Guard. |
| 9 | **Google Play Console** developer account | By M3 at the latest | $25 once | Internal testing, then the closed test | New personal accounts must run a closed test with at least 12 testers for 14 days before production access (verify current rule). Organization accounts skip this but need a D-U-N-S number. |
| 10 | **Domain** + **Cloudflare** account (DNS and Pages) | M3 (ideally earlier, it sets the bundle ID) | about $10 to $60 / year; Cloudflare $0 | Invite links, universal/app links, privacy policy, support and deletion pages | The domain shows in every invite message, so it's a brand choice. |
| 11 | **Email on the domain** (support@, privacy@, moderation@) | M5 | $0 forwarding, or about $7 per mailbox | Store listings, privacy policy contact, moderation alerts, access requests | Moderators' mailboxes use 2FA. |
| 12 | **Sentry** organization | M2 | $0 | Crash and error reports | EU data region if launching in the EU. |
| 13 | **Privacy policy, terms and Community Guidelines** text | M5 | Legal's time | Store submission | Owned by Senior Legal Counsel. Hosted in `web/`. |
| 14 | **Image moderation vendor** | Before public App Store submission | Per image (CEO question 2, verify) | Photo filter (8.4) | DPA must exclude training and face recognition. |

---

## 13. Build plan

Each milestone ends with a demo on real phones (one iPhone, one Android) from an EAS build. A milestone isn't done until its tests are in CI.

### M0: Foundations and risk spikes

- **Deliverables**
  - Monorepo on GitHub.
  - Expo app shell with Expo Router and design tokens stubbed.
  - `app.config.ts` with dev and prod variants. EAS profiles.
  - `clink-dev` Supabase project. CI running the empty suites.
  - **Spikes**, each a throwaway branch with a written result in `docs/spikes/`:
    1. iOS widget via `@bacons/apple-targets` showing JSON the app wrote to the App Group.
    2. An App Intent button that changes the widget.
    3. Glance widget showing DataStore data, with a working button.
    4. APNs (alert, background, liveactivity) and FCM sent from a Deno edge function.
    5. NSE updating the widget while the app is killed.
    6. Our FCM service coexisting with `expo-notifications`.
    7. Live Activity started locally and by push-to-start.
- **Done when:** both dev builds install from EAS on real phones, the seven spikes pass or have a written fallback, and CI is green on `main`.

### M1: Accounts, catalog and the private tracker

- **Deliverables**
  - The security migration (`private` schema, revoked function execute) as migration 0001, with the deny tests and the security advisor in CI.
  - Schema migrations for people, settings, drinks and logs, with pgTAP tests.
  - Sign in with Apple, Google and phone OTP (Twilio Verify), with "Other ways to sign in", the Auth settings in section 5, and the age check (`complete-signup`).
  - Name and photo step. Text blocklist on display names.
  - Drink catalog in `packages/shared` (top 10 per category from `COPY.md` section 2, plus water) with the image pipeline, and the string table generated from `COPY.md`.
  - Usual 3 editor with "Make it yours" details (`COPY.md` 2.7 option sets, per-drink fields first, "More options" for the rest, Note, Plan B).
  - Tracker in the app: drinks and water, undo last, local midnight reset, the herbal note after 4 caffeinated drinks.
  - `register-device` with sign-out (3.6) and the new-device notification. Account deletion and the web deletion page (early, so every later table gets cascade tests).
- **Done when:** a new user can sign up on both platforms, set their usual 3 with details, log and undo drinks, sign in on a second phone and see the same data, and delete the account with all rows and files gone (checked by the integration test). An under-age answer leaves no account. RLS tests cover every new table.

### M2: Widgets v1 (solo use)

- **Deliverables**
  - Small and medium widgets on both platforms: idle state with the #1 drink, today's counts, last-drink timer.
  - +1 Drink picker with usual 3 and Water, logging from the widget with the offline outbox.
  - `widget-api` and widget tokens.
  - Midnight reset without network.
  - Widget-installed detection and the add-widget guide (F8).
  - "Widget states" debug screen. Sentry.
- **Done when:** logging from the widget works with the app killed, in airplane mode (synced later, no duplicates), and across midnight. Every fixture state renders correctly on both platforms. Android Glance unit tests are in CI.

### M3: Friends, invites and groups

- **Deliverables**
  - Friendship, request, block and group schema with RLS tests.
  - Contact matching (8.1) with the discoverable opt-out. Friend requests (F6) with the Accept notification action and 30-day expiry. Friends sheet with 📝 usual orders (F22, F27 entry).
  - Invite share buttons (WhatsApp, Messages, More) with the client-side "0 of 2" meter.
  - `web/` landing page with its headers, AASA and assetlinks. Install referrer (Android), the iOS invite check with the Paste button, `redeem-invite` with the existing-user confirm card, "Not someone you know?", code expiry and "Stop my old invites".
  - Groups (F28) and the group suggestion at 6+ friends.
  - Widget configuration per group on both platforms (F30). Play Console internal testing track live.
- **Done when:**
  - A fresh install from an invite tapped in WhatsApp ends with the two users as friends, on both platforms, without typing (Android) or with one Paste tap (iOS).
  - The 20-friend cap and block rules hold under tests.
  - A friend can't see which groups they're in (tested at RLS and API level).

### M4: Flares and drink runs (the core loop)

- **Deliverables**
  - Flare schema. `send-flare`, `respond-flare`, `close-flare`, `flare-tick`.
  - Composer with category, place, timing pills and the "To:" picker (F16, F29). Automatic per 4.6, with the group editor's "Automatic uses this for" row.
  - Quick flare from the widget (F15). Incoming flare on widget, notification and app (F18). Two flares at once (F21).
  - Bring me one from the widget (as saved) and the app (one-time note) (F19).
  - Run list, order card and Show to barista with keep-awake (F27).
  - Live Activity and Dynamic Island. Android ongoing notification.
  - Expiry with nobody (F20). Offline handling and the widget outbox (F25). Notification settings without quiet hours (F23), with the seven Android channels.
  - Flare photos in their own table and bucket (M-02), and the recipient visibility rule (M-03).
- **Done when:**
  - A flare sent from a widget reaches a friend's phone as a notification within 5 seconds (p90, measured over 50 sends on Wi-Fi and LTE).
  - The friend's widget shows it within 60 seconds while the app is killed, on both platforms.
  - "I'm in" from the widget updates the sender's Live Activity or ongoing notification.
  - Withdrawn responses disappear. Nobody is ever shown as declined.
  - The flare vanishes at expiry on every widget without network.

### M5: Snaps, safety, XP and settings

- **Deliverables**
  - Camera and snap sharing (F12) with EXIF stripping.
  - Snaps on friends' widgets for 24 hours (F13). Reactions with a quiet notification.
  - Report and block with moderation copies and email alerts (F14). Suspension, moderation notices, the text filter on every shared text, `web/report`. `snap-cleanup` with orphan deletion.
  - XP ledger with reversals, `settle_flare`, `award_xp`, and the private level screen.
  - Last-drink sharing opt-in (F26) with the server-side 24 h rule. Settings (including discoverable, usage stats, "Stop my old invites", Contact us), sign out (F24).
  - The daily retention job (4.8). `scripts/export-user`. Review accounts and scripts (section 5).
  - Privacy policy, terms, Community Guidelines, support, report and deletion pages live.
- **Done when:**
  - A snap reaches friends' widgets on both platforms and is gone, file included, after 24 hours.
  - Reported snaps survive in moderation.
  - XP caps and idempotency tests pass, and no API returns another user's XP.
  - A full account deletion leaves nothing behind in tables or Storage.

### M6: Hardening, beta and store launch

- **Deliverables**
  - Full QA pass of F1 to F31 on a device matrix:
    - iOS 17.2, the current iOS
    - small and large iPhones
    - Android 8, Android 10, the current Android
    - Pixel and Samsung (One UI launchers behave differently with widgets)
  - Accessibility pass (VoiceOver, TalkBack, Dynamic Type, contrast per `DESIGN.md`).
  - Performance: cold start under 2 s on a mid-range Android.
  - Security review by the Senior Security Expert (RLS, secrets, rate limits, storage).
  - `clink-prod` on Pro with backups. Store listings, screenshots, age rating, privacy labels and the Data safety form exactly as `PRD.md` 7 lists them.
  - TestFlight beta, and the Play closed test (12+ testers, 14 days, if it applies). Every MUST FIX in `RISK_REVIEW.md` closed before external testers.
  - Image screening live before public App Store submission (8.4).
  - Invite capture measured on iOS.
- **Done when:**
  - Crash-free sessions are 99.5% or better over the beta.
  - No open P0 or P1 bugs.
  - The Play production access requirement is met.
  - Both apps pass review and are live in the launch countries.

---

## 14. Questions for the CEO

One merged list lives in `PRD.md` section 8, so the CEO answers each question once. The ones that change this file: launch countries and minimum age (Supabase region, Twilio geo permissions, Sentry region, `min_age`), moderation (image API vendor), company and developer accounts (seller name, D-U-N-S), the domain (bundle id, invite messages), the SMS cap, and the test-device budget.
