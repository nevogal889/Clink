# Clink: architecture and build plan

Owner: CTO, with the Head of Development and the IT Specialist.
Status: v1 plan. `DECISIONS.md` overrides this file. Product behaviour lives in `PRD.md`, visuals in `DESIGN.md`, words in `COPY.md`. This file says how we build it.

Decisions made here are marked **Decision:** with a one-line reason. Facts we could not confirm while writing (prices, version numbers, quotas) are marked **(verify)**.

---

## 0. Principles

1. **The widget never depends on JavaScript running in the background.** Everything that happens while the app is closed (widget buttons, push handling, widget refresh, notification actions on Android) is native Swift or Kotlin. JS runs only when the app is open. Headless JS on iOS is unreliable and on Android it adds a second code path we'd have to test.
2. **The server is the only writer of shared truth.** Flares, responses, friendships and XP are written by edge functions or `security definer` SQL functions. Clients write directly only to their own private rows (drink logs, usual drinks, settings, groups).
3. **Privacy by table, not by column.** Postgres RLS is per row. Anything a friend must never see (phone hash, notification settings, which group a flare went to) lives in a separate table with owner-only or no client access.
4. **Push is the real-time channel. Widget refresh is best effort.** Both OSes throttle widget reloads. Notifications and the Live Activity are what make a flare feel instant.
5. **No quiet hours anywhere.** No column, no setting, no server check (CEO guideline 5). The prototype's F23 quiet-hours row is removed.

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
| Errors | Sentry (`@sentry/react-native`) | Free tier to start (verify limits). |
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
      src/xp.ts                 XP kinds, values, caps, level thresholds and names
      src/audience.ts           "Automatic" group rule (weekday 08:00-18:00)
      src/widget-state.ts       zod schema of the widget JSON + fixtures
      src/api.ts                request/response schemas for edge functions
      src/db.types.ts           generated by `supabase gen types`
  supabase/
    config.toml
    migrations/                 SQL, one file per change, never edited after merge
    functions/
      _shared/                  auth, push (apns.ts, fcm.ts), rate limit, generated/ (copied from packages/shared)
      send-flare/  respond-flare/  close-flare/  flare-tick/
      share-snap/  react-snap/  snap-cleanup/
      redeem-invite/  match-contacts/  friend-request/
      widget-api/  register-device/  delete-account/  report/
    tests/                      pgTAP tests for every RLS policy
    seed.sql                    local test users and friend graph
  web/                          static site: invite landing page, privacy, terms,
                                support, account-deletion request, .well-known files
  design-assets/drinks/         master drink images from Design (1024 px)
  scripts/                      gen-drink-assets, gen-native-catalog, sync-shared-to-functions
  e2e/maestro/                  Maestro flows
  docs/                         DECISIONS, PRD, ARCHITECTURE, DESIGN, COPY
  .github/workflows/
```

**Sharing TS with edge functions.** Supabase's function bundler and Deno resolve imports differently from Metro. **Decision:** `scripts/sync-shared-to-functions` copies the dependency-free files from `packages/shared/src` into `supabase/functions/_shared/generated/`. CI fails if the copy is stale. It's crude, and it never breaks a deploy.

**Sharing the catalog with Swift and Kotlin.** `scripts/gen-native-catalog` writes `catalog.json` into the widget target and the Android module's assets. Widgets look up drink names and images by id (`coffee.cortado`) from that file.

---

## 3. Widget data and refresh model

### 3.1 What the widget shows and where it reads it

Both widgets render from one JSON document, the **widget state**, defined once in `packages/shared/src/widget-state.ts`. Swift and Kotlin decode it. The same fixture files test all three decoders.

```jsonc
{
  "v": 1,
  "updatedAt": "2026-11-15T09:12:00Z",
  "me": { "initial": "D", "friendsCount": 5 },
  "usual": [ { "slot": 1, "drinkId": "coffee.flat_white", "name": "Iced Oat Flat White", "hasDetails": true } ],
  "today": { "localDate": "2026-11-15", "drinks": 3, "water": 4, "caffeinated": 2, "lastDrinkAt": "..." },
  "groups": [ { "id": "…", "name": "Work", "emoji": "🏢", "autoRole": "work" } ],
  "lastPlace": "Kaffa Roastery",
  "myFlare": { "id": "…", "category": "coffee", "drinkName": "Cortado", "meetAt": "…", "expiresAt": "…", "inCount": 2, "bringCount": 1 },
  "incoming": [ { "flareId": "…", "senderName": "Maya", "avatarFile": "a_….jpg", "category": "matcha", "drinkName": "Ceremonial Matcha", "place": "Café Lumi", "meetAt": "…", "expiresAt": "…", "myResponse": null } ],
  "snaps": [ { "id": "…", "senderName": "Leo", "thumbFile": "s_….jpg", "place": "Office kitchen", "expiresAt": "…" } ],
  "outbox": [ { "id": "…", "op": "log", "createdAt": "…" } ]
}
```

| | iOS | Android |
|---|---|---|
| State JSON | App Group `UserDefaults(suiteName:)`, key `widget.state.v1` | Jetpack DataStore (Preferences) in the app process. The widget runs in the app process, so no cross-process store is needed. |
| Images (snap thumbs, avatars) | Files in the App Group container. Widgets can't load remote images while rendering (`AsyncImage` doesn't work in widgets), so files are downloaded before reload. | Files in app cache. Decoded downsampled to a Bitmap for Glance. RemoteViews has a bitmap memory cap, so thumbs stay at 480 px or less. |
| Per-widget config (which group) | `SelectGroupIntent` parameter (`GroupEntity` from App Group data: Automatic, Everyone, each group) | Glance state per `appWidgetId`, set by the configuration activity. `widgetFeatures="reconfigurable|configuration_optional"`. |
| Widget auth token | Shared Keychain access group, `kSecAttrAccessibleAfterFirstUnlock` | Android Keystore-wrapped key. Jetpack Security Crypto is deprecated, so use Keystore directly (or Tink). |

**Widget token. Decision:** at sign-in the app registers the device and gets a random 256-bit **widget token**, stored hashed in `widget_credentials`. It authorises only `widget-api`, for that one user. Sharing the Supabase refresh token with the widget would break, because refresh tokens rotate and two processes refreshing at once log the user out. The token is revoked on sign-out, account deletion and block-of-device.

**What the app writes.** On every foreground, after any change to usual drinks, groups, the tracker or flares, and after any push it handles, the app fetches `widget-api/state`, writes the JSON, downloads missing images, then calls `WidgetCenter.shared.reloadAllTimelines()` (iOS) or `GlanceAppWidget.updateAll()` (Android). Reloads requested while the app is in the foreground don't count against the iOS budget.

### 3.2 Interactive buttons

| Button | iOS | Android |
|---|---|---|
| +1 Drink | `OpenPickerIntent` sets `mode=picker` locally and returns. The system reloads the widget after `perform()`. The timeline adds an idle entry 20 s later, so the picker closes itself. | `ActionCallback` updates Glance state and calls `update()`. The picker has a close button. A 20 s WorkManager job resets it. |
| Pick a drink / water | `LogDrinkIntent(drinkId)`: writes the log to state optimistically (count goes up at once), adds it to `outbox`, then POSTs `widget-api/log` with a device-made UUID. On failure it stays in `outbox`. The next intent or app open flushes it. | Same, through an expedited WorkManager job, because `ActionCallback` must return quickly. |
| Who joins? | `QuickFlareIntent(groupConfig)`: POSTs `widget-api/flare` with `audience: auto | everyone | <groupId>` and the device time zone. The server resolves Automatic (section 4.6) and starts the Live Activity by push-to-start. | Same call. On success, posts the ongoing notification natively. |
| I'm in / Bring me one | `RespondFlareIntent(flareId, kind, slot?)`. For Bring me one the server copies the saved order from `usual_drinks`, so the widget sends it exactly as saved. | Same. |

Rules for widget calls: 8 s timeout. A flare that hasn't been accepted within 2 minutes is dropped and the widget shows the "Couldn't send" state (F25). Logs retry forever, because the device-made UUID makes them idempotent.

Widget reloads that follow an App Intent or Glance action are part of the interaction, so they aren't throttled the way background reloads are.

### 3.3 How incoming flares and snaps reach the widget

**iOS**

1. **Flare notifications carry `mutable-content: 1`.** The Notification Service Extension runs for every one, even if the app was killed. It merges the flare into the App Group state, downloads the sender's avatar thumb, and calls `WidgetCenter.reloadAllTimelines()`. This is the main path, because friend-flare notifications are on by default. (Verify in the M0 spike that `reloadAllTimelines` from the NSE gets honoured within the budget. The plan B is below.)
2. **Silent pushes** (`content-available: 1`, priority 5) for snaps, flare cancellations and replies when alerts are off. Our `ExpoAppDelegateSubscriber` handles them natively. iOS rations these, about a few per hour per app, and drops them entirely if the user force-quit the app. Treat them as a hint.
3. **WidgetKit push updates (iOS 26+).** The server can send an APNs push of type `widgets` to ask the system to reload the widget directly, without waking the app. These are still budgeted. Use them for snaps on iOS 26+. (Verify the exact API and budget at build time.)
4. **Timeline fallback.** Every timeline ends with `.after(now + 15 min)`. When the provider runs and the stored state is older than 10 minutes, it calls `widget-api/state` itself with the widget token.
5. **Time-based changes need no push.** The provider puts entries at each flare's `expiresAt` and at local midnight, so flares vanish and counts reset on time while offline. The countdown and "last drink" times use `Text(timerInterval:)` and `Text(date, style: .relative)`, which tick without reloads.

iOS gives a frequently viewed widget roughly 40 to 70 background reloads a day (Apple doesn't publish an exact figure). Snaps and flares together fit inside that for a normal user. A burst of activity won't, and that is why a flare always also notifies.

**Android**

1. **FCM data messages** (high priority for flares and replies, normal for snaps) arrive at our `FirebaseMessagingService` while the app is in the background or killed, but not after the user force-stops it. The service updates DataStore, downloads thumbs in an expedited worker, calls `updateAll()`, and for flares builds the notification itself (section 7).
2. App-triggered Glance updates have no daily budget. The 30-minute minimum on `updatePeriodMillis` applies only to the system's periodic refresh, and we don't use it.
3. A WorkManager job every 15 minutes (the platform minimum) refreshes state if it's older than 10 minutes. A one-off job runs at local midnight and at each flare's expiry.
4. Android rations high-priority FCM messages that don't show a notification. So high priority is used only for messages that do. Snaps go normal priority.
5. Glance has no ticking text. For the flare countdown and the "last drink" timer we embed a `Chronometer` via `AndroidRemoteViews` (count down for flares, count up for last drink). If that proves fragile across launchers, the fallback is minute-level text refreshed by the 15-minute job and on every update.

### 3.4 Why push and the Live Activity are the real-time channel

Both OSes decide when a widget actually redraws. A notification shows within seconds and the Live Activity updates within seconds through APNs `liveactivity` pushes. So every flare goes out as a notification (unless the recipient turned flare notifications off), and the sender's live flare is a Live Activity on iOS and an ongoing notification on Android. The widget update rides along on the same push wherever possible.

**Live Activity (iOS)**

- From the app: the app starts the activity locally with `pushType: .token` and registers the activity's push token with the server (`live_activity_tokens`).
- From the widget: the server starts it with a **push-to-start** push using the token the app registered at launch (`Activity<FlareActivityAttributes>.pushToStartTokenUpdates`).
- Each reply sends `event: update` with the new content state (in count, bring list). Close, cancel and expiry send `event: end` with a short dismissal date.
- A flare lasts at most 60 minutes, well under the 8-hour Live Activity limit.

**Ongoing notification (Android)**

- Posted natively when the flare is sent. `setOngoing(true)`, `setUsesChronometer(true)`, `setChronometerCountDown(true)`, `setWhen(meetAt)`, on a low-importance channel so it makes no sound.
- Updated in place by the FCM data message on each reply. Cancelled on end.
- Android 16 adds promoted "Live Update" notifications. Evaluate in M4 whether our flare qualifies (verify the rules). It's an enhancement, not a dependency.

### 3.5 Widget installed detection (F8)

The app checks `WidgetCenter.shared.getCurrentConfigurations` (iOS) and `AppWidgetManager.getAppWidgetIds` (Android) on every foreground. It reports `widget_added` to `app_events` once, and hides the "Add the widget" card.

---

## 4. Backend

### 4.1 Projects and region

- Two Supabase projects: `clink-dev` (Free) and `clink-prod` (Pro). **Decision:** no Supabase branching in v1. It costs extra, and local `supabase start` plus `clink-dev` covers testing.
- Region follows the launch countries (CEO question). EU users mean an EU region.

### 4.2 Schema

All tables are in `public`. RLS is enabled on every table. Policies use `(select auth.uid())` so Postgres evaluates it once per query. Text enums are `text` with `check` constraints, which are easier to migrate than Postgres enums.

Category keys: `coffee`, `matcha`, `tea`, `smoothie_juice` (shown as "Smoothie & Juice"), and `water` for logs only.

```sql
-- 0001_extensions.sql
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- helpers ---------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
                 where user_a = least(a, b) and user_b = greatest(a, b));
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- people ----------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 30),
  avatar_path   text,                       -- avatars/{id}/{version}.jpg
  created_at    timestamptz not null default now()
);

create table public.user_settings (          -- owner only
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  notify_flares     boolean not null default true,
  notify_replies    boolean not null default true,
  notify_snaps      boolean not null default false,
  share_last_drink  boolean not null default false,
  timezone          text not null default 'UTC',
  onboarding_step   text not null default 'profile',
  updated_at        timestamptz not null default now()
);                                            -- no quiet hours, by CEO decision

create table public.user_private (           -- no client access at all
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  phone_hmac  bytea unique                   -- HMAC(pepper, sha256(E.164)); see 8.1
);

create table public.last_drink_shares (      -- row exists only while sharing is on (F26)
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  last_drink_at  timestamptz not null
);

-- friends ---------------------------------------------------------------
create table public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  source      text not null check (source in ('contacts', 'invite')),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  created_at  timestamptz not null default now(),
  check (from_id <> to_id)
);
create unique index friend_requests_one_pending
  on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
create index on public.friend_requests (to_id) where status = 'pending';
-- No 'declined' status. Ignoring leaves it pending; the sender is never told (F6).

create table public.friendships (
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index on public.friendships (user_b);
-- Inserted only by accept_friend_request() / redeem_invite(), which lock both users
-- (pg_advisory_xact_lock) and enforce the 20-friend cap.

create table public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
-- block_user() also deletes the friendship, pending requests and group memberships.

-- groups (private labels) -----------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  org_id      uuid,                         -- future Teams. Always null in v1; FK added with the orgs table.
  name        text not null check (char_length(name) between 1 and 24),
  emoji       text check (char_length(emoji) <= 16),
  auto_role   text check (auto_role in ('work', 'home')),   -- used by the "Automatic" audience
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
  custom_name  text check (char_length(custom_name) between 1 and 40),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice')),
  details      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot),
  check ((drink_id is null) <> (custom_name is null)),
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 2048),
  check (char_length(coalesce(details->>'note', '')) <= 140),
  check (char_length(coalesce(details->>'planB', '')) <= 140)
);
-- details keys follow OPTS in packages/shared (size, temp, milk, sweet, shots|strength|ice, extras[], note, planB).
-- Client validates with zod; the DB enforces shape and size only.

create table public.drink_logs (
  id           uuid primary key,              -- generated on device, makes offline retries idempotent
  user_id      uuid not null references public.profiles(id) on delete cascade,
  drink_id     text,
  drink_name   text not null check (char_length(drink_name) <= 40),
  category     text not null check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  caffeinated  boolean not null,             -- from the catalog; herbal teas and water are false
  logged_at    timestamptz not null,
  local_date   date not null,                -- device-local date; the midnight reset uses this
  source       text not null check (source in ('app', 'widget')),
  created_at   timestamptz not null default now()
);
create index on public.drink_logs (user_id, local_date);
-- Trigger: on non-water insert, upsert last_drink_shares if user_settings.share_last_drink.

-- snaps -----------------------------------------------------------------
create table public.snaps (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  image_path  text not null,                 -- snaps/{sender_id}/{id}.jpg     (1080 px)
  thumb_path  text not null,                 -- snaps/{sender_id}/{id}_t.jpg   (480 px, for widgets)
  category    text check (category in ('coffee', 'matcha', 'tea', 'smoothie_juice', 'water')),
  place       text check (char_length(place) <= 60),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  hidden_at   timestamptz                    -- set by moderation or auto-hide
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
  drink_name  text not null,
  place       text check (char_length(place) <= 60),
  snap_id     uuid references public.snaps(id) on delete set null,
  meet_at     timestamptz not null,
  expires_at  timestamptz not null,
  status      text not null default 'live' check (status in ('live', 'going', 'expired', 'cancelled')),
  source      text not null check (source in ('app', 'widget')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  settled_at  timestamptz,                   -- XP awarded once, here
  check (meet_at between created_at - interval '1 minute' and created_at + interval '60 minutes'),
  check (expires_at = greatest(meet_at, created_at + interval '15 minutes'))
);
create unique index flares_one_live_per_sender on public.flares (sender_id) where status = 'live';
create index flares_live_expiry on public.flares (expires_at) where status = 'live';

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
  one_time_note  text check (char_length(one_time_note) <= 140),   -- app only ("iced today")
  source         text not null check (source in ('app', 'widget', 'notification')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,                -- "Can't make it anymore"; sender just sees one fewer
  primary key (flare_id, user_id),
  check ((kind = 'bring') = (drink is not null))
);

create table public.live_activity_tokens (   -- iOS, per flare per device
  flare_id   uuid not null references public.flares(id) on delete cascade,
  device_id  uuid not null references public.push_devices(id) on delete cascade,
  token      text not null,
  primary key (flare_id, device_id)
);

-- XP (private) ------------------------------------------------------------
create table public.xp_events (              -- append-only ledger
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('invite_accepted', 'flare_joined', 'drink_run_done', 'flare_got_joiner', 'daily_log')),
  amount      int not null check (amount > 0),
  ref_id      uuid,                          -- flare id, invitee id, or null for daily_log
  counterpart uuid,                          -- the other person, for per-pair caps
  local_date  date not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref_id, counterpart, local_date)
);
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
  max_uses    int not null default 50,
  uses        int not null default 0,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index invites_one_active on public.invites (inviter_id) where revoked_at is null;

create table public.invite_redemptions (
  invite_id    uuid not null references public.invites(id) on delete cascade,
  invitee_id   uuid not null references public.profiles(id) on delete cascade,
  redeemed_at  timestamptz not null default now(),
  primary key (invite_id, invitee_id)
);

-- safety ----------------------------------------------------------------
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.profiles(id) on delete set null,
  target_kind    text not null check (target_kind in ('snap', 'user')),
  target_user    uuid not null,              -- no FK: kept after the target deletes their account
  target_snap    uuid,
  evidence_path  text,                       -- moderation/{report_id}.jpg, copied at report time
  reason         text not null check (reason in ('nudity', 'violence', 'harassment', 'spam', 'other')),
  note           text check (char_length(note) <= 500),
  status         text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);

-- devices and push --------------------------------------------------------
create table public.push_devices (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  platform               text not null check (platform in ('ios', 'android')),
  push_token             text unique,        -- raw APNs device token or FCM registration token
  apns_env               text check (apns_env in ('sandbox', 'production')),
  la_push_to_start_token text,               -- iOS Live Activity push-to-start
  widget_push_token      text,               -- iOS 26+ WidgetKit push updates
  app_version            text not null,
  locale                 text,
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now()
);
create index on public.push_devices (user_id);

create table public.widget_credentials (     -- no client access
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_id     uuid not null references public.push_devices(id) on delete cascade,
  token_hash    bytea not null unique,       -- sha256 of the 256-bit token
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- ops -------------------------------------------------------------------
create table public.rate_counters (          -- no client access
  user_id       uuid not null,
  bucket        text not null,               -- 'flare', 'snap', 'friend_request', 'contacts', ...
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (user_id, bucket, window_start)
);

create table public.app_config (             -- readable by anyone signed in
  key    text primary key,                   -- 'min_ios_build', 'min_android_build'
  value  jsonb not null
);

create table public.app_events (             -- insert-only from clients, for KPIs
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete cascade,
  name        text not null check (name in ('onboarding_step', 'widget_added', 'widget_removed', 'share_tapped', 'invite_landing_paste')),
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) < 1024),
  created_at  timestamptz not null default now()
);
```

Order note: `push_devices` must be created before `live_activity_tokens` and `widget_credentials` in the real migration. The listing above is grouped by topic for reading.

### 4.3 Row-level security

```sql
alter table public.profiles            enable row level security;
-- (same for every table above)

-- profiles: me, my friends, and people with a pending request either way
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.are_friends(id, (select auth.uid()))
  or exists (select 1 from public.friend_requests r
             where r.status = 'pending'
               and ((r.from_id = id and r.to_id = (select auth.uid()))
                 or (r.to_id = id and r.from_id = (select auth.uid()))))
);
create policy profiles_write on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- insert happens in a trigger on auth.users; delete via delete-account only.

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
-- user_private, widget_credentials, rate_counters, invite_redemptions, live_activity_tokens:
-- RLS on, no policies, so only the service role (edge functions) can touch them.

-- last drink (F26): friends read, only rows that exist (sharing on)
create policy friends_read on public.last_drink_shares for select to authenticated
  using (user_id = (select auth.uid()) or public.are_friends(user_id, (select auth.uid())));

-- friendships and requests: read your own; writes go through RPCs
create policy mine on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy mine on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));

-- groups: owner only, and no org groups in v1
create policy own on public.groups for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and org_id is null);
create policy own on public.group_members for all to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
              and public.are_friends(member_id, (select auth.uid())));

-- usual drinks: owner writes, friends read (📝 surprise drinks, F27)
create policy own on public.usual_drinks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy friends_read on public.usual_drinks for select to authenticated
  using (public.are_friends(user_id, (select auth.uid())));

-- snaps: sender, or a friend, while live and not hidden
create policy visible on public.snaps for select to authenticated using (
  sender_id = (select auth.uid())
  or (expires_at > now() and hidden_at is null
      and public.are_friends(sender_id, (select auth.uid()))
      and not exists (select 1 from public.snap_hides h where h.snap_id = id and h.user_id = (select auth.uid())))
);
create policy own on public.snap_hides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy read on public.snap_reactions for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.snaps s where s.id = snap_id and s.sender_id = (select auth.uid()))
);

-- flares: sender or recipient. Recipients get no group info (it's in flare_audience).
create policy visible on public.flares for select to authenticated using (
  sender_id = (select auth.uid())
  or exists (select 1 from public.flare_recipients r where r.flare_id = id and r.recipient_id = (select auth.uid()))
);
create policy sender_only on public.flare_audience for select to authenticated using (
  exists (select 1 from public.flares f where f.id = flare_id and f.sender_id = (select auth.uid()))
);
create policy own on public.flare_recipients for select to authenticated using (recipient_id = (select auth.uid()));
-- Responses: the sender sees all; a responder sees only their own row.
-- Co-responders get names only for people they're friends with, via flare_view(flare_id),
-- a security definer function returning {in: [names of my friends], others_in: n, ...} ("2 others are in").
create policy visible on public.flare_responses for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.flares f where f.id = flare_id and f.sender_id = (select auth.uid()))
);

-- reports: insert only, never readable by clients
create policy insert_own on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));

-- app_config / app_events
create policy read_all on public.app_config for select to authenticated using (true);
create policy insert_own on public.app_events for insert to authenticated with check (user_id = (select auth.uid()));
```

Client writes to `flares`, `flare_responses`, `snaps`, `snap_reactions`, `friendships`, `friend_requests`, `blocks` and `xp_*` have no insert or update policy. They go through edge functions (which need to send pushes anyway) or `security definer` RPCs. `revoke insert, update, delete` on those tables from `authenticated` as a second lock.

**Storage buckets** (all private):

| Bucket | Path | Policy |
|---|---|---|
| `avatars` | `{user_id}/{version}.jpg` | Owner writes into their folder. Read: owner, friends, pending-request counterparts (same rule as `profiles`). |
| `snaps` | `{sender_id}/{snap_id}.jpg`, `_t.jpg` | Owner writes. Read: the policy checks the matching `snaps` row is visible to the caller. |
| `moderation` | `{report_id}.jpg` | Service role only. |

Clients read media through `createSignedUrl` with their own JWT, so Storage RLS applies when the URL is minted. Signed URL lifetime: 15 minutes for snaps, 24 hours for avatars. Devices cache the files, so short URLs cost nothing. A signed URL is a bearer link. Short lifetimes limit what a leaked one exposes after a block.

**RLS tests.** `supabase/tests/` has a pgTAP file per table. Four seeded users per test: A (me), B (friend), C (stranger), D (blocked). Each policy is tested for allowed and denied access. CI runs them on every PR. No migration merges without its tests.

### 4.4 Edge functions

All functions validate input with the zod schemas from `packages/shared/src/api.ts`, check the user JWT (or widget token for `widget-api`), apply rate limits, and use the service role for writes.

| Function | Called by | Does |
|---|---|---|
| `register-device` | App, every launch | Upserts `push_devices` (tokens, app version, APNs env), issues or rotates the widget token, returns `app_config` minimums. |
| `widget-api` | Widgets, NSE, app | `GET state` (the widget JSON), `POST log`, `POST flare`, `POST respond`. Widget-token auth. Wraps the same internals as the functions below. |
| `send-flare` | App, `widget-api` | One transaction: cancel my live flare if any (the new one replaces it), insert flare and `flare_audience`, resolve the audience (section 4.6) minus blocks, insert `flare_recipients`. After commit: fan out pushes (at most 20 recipients, so inline with `EdgeRuntime.waitUntil`, no queue), and push-to-start the sender's Live Activity if the flare came from a widget. |
| `respond-flare` | App, `widget-api` | Upserts or withdraws a response. For `bring`, copies the order from `usual_drinks` (plus `one_time_note` from the app). Notifies the sender (if `notify_replies`), updates the Live Activity or Android ongoing notification, refreshes the sender's widget. |
| `close-flare` | App | Sender taps "We're going" (`going`) or cancels (`cancelled`). Ends the Live Activity, clears recipients' widgets, calls `settle_flare()`. |
| `flare-tick` | pg_cron every minute | Marks due flares `expired`, ends Live Activities, sends background clears, calls `settle_flare()`. Widgets already hide the flare at `expiresAt` on their own; this is cleanup. |
| `share-snap` | App | Confirms both objects exist in Storage, inserts `snaps`, sends background updates (and an alert where `notify_snaps`) to all friends. Snaps always go to all friends. |
| `react-snap` | App | Upserts the reaction. Sends one quiet notification to the sender (`interruption-level: passive` on iOS, low-importance channel on Android). `apns-collapse-id` per snap, so several reactions replace each other. |
| `snap-cleanup` | pg_cron hourly | Deletes Storage objects for snaps past `expires_at` through the Storage API (deleting rows in `storage.objects` with SQL leaves files behind), then deletes the rows. Reported snaps were already copied to `moderation`. |
| `match-contacts` | App | Section 8.1. |
| `friend-request` | App | Send, accept, cancel, remove friend, block. Enforces the cap of 20 and block rules. |
| `redeem-invite` | App | Section 6. |
| `report` | App | Inserts the report, copies the snap to `moderation`, hides it for the reporter, auto-hides it for everyone at 3 distinct reports, emails the moderation inbox. |
| `delete-account` | App | Section 4.7. |

**SQL functions (security definer, not exposed to clients unless stated):** `accept_friend_request`, `block_user`, `resolve_audience`, `settle_flare`, `award_xp`, `hit_rate_limit`, `flare_view` (exposed), `incoming_flares` (exposed, no group fields).

**Scheduled jobs (pg_cron, functions invoked through pg_net):**

| Schedule | Job |
|---|---|
| every minute | `flare-tick` |
| hourly | `snap-cleanup` |
| daily 03:00 UTC | prune `rate_counters` older than 2 days, `app_events` older than 13 months, `moderation` evidence older than 90 days once the report is closed (Legal to confirm retention), revoked widget credentials older than 30 days, `push_devices` not seen in 90 days |

**Realtime.** The sender's live-flare screen subscribes to `flare_responses` changes filtered by `flare_id`. Realtime `postgres_changes` applies RLS, so only the sender gets them. The incoming-flare screen uses `flares` changes. Everything else is pull on foreground.

### 4.5 XP: award rules the server guarantees

XP values, caps and level names live in `PRD.md`. The code reads them from `packages/shared/src/xp.ts`, which mirrors the PRD. This section defines the mechanism.

- **Server only.** Only `award_xp()` writes `xp_events` and `xp_totals`, in one transaction. Clients can't insert.
- **Awarded at the outcome, not the action.** Flare XP is awarded in `settle_flare()` when a flare ends as `going` or `expired`. A response withdrawn before then earns nothing. A `cancelled` flare earns nothing.
  - `flare_joined`: each responder with a non-withdrawn `in` or `bring`.
  - `flare_got_joiner`: the sender, if at least one non-withdrawn response exists.
  - `drink_run_done`: the sender, once per non-withdrawn `bring` response.
  - `invite_accepted`: the inviter, when `redeem-invite` creates a friendship with an account that has never redeemed any invite before.
  - `daily_log`: first drink or water log of the local day.
- **Never** for sending flares or snaps (DECISIONS.md).
- **Caps.** Per kind per local day, plus a per-counterpart cap (the same friend counts once per day per kind), so two friends can't farm each other. Enforced by counting `xp_events` for `(user_id, local_date)` inside `award_xp()` under a row lock on `xp_totals`.
- **Idempotent.** The unique key on `(user_id, kind, ref_id, counterpart, local_date)` means a retried settlement awards nothing twice. `settle_flare()` also checks `settled_at`.
- XP is private and buys nothing, so the bar is "no accidental inflation and no reason to spam", not fraud-proofing.

### 4.6 The "Automatic" audience

Resolved on the server, in `resolve_audience(sender, tz, at)`, mirrored by `packages/shared/src/audience.ts` for the composer's "To:" label:

1. Weekday and local time 08:00 to 17:59 in the sender's device time zone, and the sender has a group with `auto_role = 'work'`: that group.
2. Otherwise, a group with `auto_role = 'home'`: that group.
3. Otherwise: Everyone.

Recipients are always intersected with current friends and filtered by blocks. **Decision:** resolve on the server so the rule exists once in TS instead of three times (TS, Swift, Kotlin). The widget sends `auto` plus its time zone.

### 4.7 Account deletion (F24)

`delete-account` runs in this order, and every step is idempotent so a retry finishes the job:

1. Requires a fresh session (signed in within the last 10 minutes, or re-auth in the confirm dialog).
2. **Apple users:** the app gets a fresh `authorizationCode` from Sign in with Apple during the confirm step. The function exchanges it and calls Apple's token revoke endpoint, as App Store rules require for apps that use Sign in with Apple.
3. End any live flare (Live Activity end, widget clears to recipients).
4. Delete Storage objects under `avatars/{id}/` and `snaps/{id}/` through the Storage API.
5. Revoke widget credentials. Delete push devices.
6. `auth.admin.deleteUser(id)`. Every table cascades from `profiles`, which cascades from `auth.users`. Others' groups lose this member through `group_members.member_id` cascade.
7. Kept on purpose: `reports` the user filed (`reporter_id` becomes null) and reports about them (`target_user` has no FK), for the moderation retention period. Legal to confirm.

Google Play also requires a web page where people can request deletion without the app. `web/delete-account` takes a phone number or email and sends a request to the support inbox. We process it by hand within the period Legal sets.

---

## 5. Auth

| Platform | Primary buttons | Behind "Other ways to sign in" |
|---|---|---|
| iOS | Sign in with Apple, Continue with phone | Continue with Google |
| Android | Continue with Google, Continue with phone | Continue with Apple (web flow) |

**Decision:** the CEO's per-platform pair stays as the visible choice (guideline 4: few buttons). The other platform's provider sits one tap away so someone switching phones can still get into their account.

- **Apple:** `expo-apple-authentication` returns an ID token with a nonce. `supabase.auth.signInWithIdToken({ provider: 'apple' })`. "Hide my email" is fine; we never email users.
- **Google on Android:** Credential Manager with Sign in with Google returns an ID token, then `signInWithIdToken({ provider: 'google' })`. Use a maintained Expo-compatible library, or a 50-line function in our native module if no free library covers Credential Manager. Check library licences at build time.
- **Phone OTP:** Supabase Auth phone provider with **Twilio Verify**. **Decision:** Twilio Verify over plain Twilio SMS, because it includes fraud screening against SMS pumping and per-country delivery handling.
  - Rough cost: about $0.05 per successful verification plus the per-country SMS fee, which runs from about $0.01 (US) to $0.10 or more in some countries **(verify pricing at sign-up; it changes often)**.
  - Controls: restrict Twilio geo permissions to launch countries, Supabase Auth SMS rate limits per number and per IP, resend after 30 s (F1), 5 attempts per number per hour.
- **Phone for Apple and Google users:** asked on the invite step (F5) so contacts can match them. Added with `updateUser({ phone })`, which sends an OTP. We verify every number, otherwise anyone could claim someone else's number and get matched as them.
- **Session storage:** the Supabase session is larger than `expo-secure-store`'s comfortable value size on Android, so we keep an AES key in SecureStore and the encrypted session in MMKV.
- **Account linking:** the verified phone number is the bridge between platforms. Supabase manual identity linking lets a signed-in user add Apple or Google later in Settings.

---

## 6. Invites and deferred deep links

Guideline 6: in the app there's no visible link and no "Invite link" label. The invite screen shows WhatsApp, Messages and More buttons only. The message they send contains the URL, because WhatsApp and SMS need one. Message text is in `COPY.md`.

- **WhatsApp:** `whatsapp://send?text=…` (iOS needs `whatsapp` in `LSApplicationQueriesSchemes`). The button is hidden if WhatsApp isn't installed.
- **Messages:** `sms:&body=…` on iOS, `sms:?body=…` on Android.
- **More:** the system share sheet (React Native `Share`), which covers Instagram, Telegram, Slack and the rest.

**Link format:** `https://<domain>/i/K7Q2M9XD`. One active code per user, Crockford base32, 8 characters, rotatable, at most 50 redemptions.

### Options compared

| | Our own (recommended) | Vendor (Branch, AppsFlyer OneLink, Adjust) |
|---|---|---|
| App installed | Universal Links / App Links open the app straight to `/i/[code]` | Same |
| Android, not installed | Landing page redirects to Play with `referrer=invite%3D<code>`. First launch reads the **Play Install Referrer API**. Exact match. | Same mechanism underneath |
| iOS, not installed | Landing page "Get Clink" button copies the code to the clipboard (user tap, so allowed), then opens the App Store. First launch shows "Got an invite?" with a system **Paste button** (`UIPasteControl`), which pastes without the iOS permission prompt. Typing the code works too. Re-tapping the original link after install also works. | Probabilistic matching on IP and device signals. Higher capture with zero taps, but it is fingerprinting, which Apple's rules restrict and our privacy labels would have to declare. |
| Cost | $0 | Free tiers exist with limits; paid plans are significant **(verify)** |
| Privacy labels | No third-party SDK | Vendor SDK must be declared |

Firebase Dynamic Links was shut down in 2025, so it's not an option.

**Decision: build our own.** Android is exact. iOS costs the invitee one tap on Paste, which fits onboarding. We measure it in beta: landing-page visits with a code against redemptions on iOS. If iOS capture is below 70%, we bring a vendor quote to the CEO.

**Pieces:**

- `web/` on Cloudflare Pages (free): `/.well-known/apple-app-site-association` (served as JSON, no redirect) with `applinks` for `/i/*`, `/.well-known/assetlinks.json` with the SHA-256 of the **Play App Signing** key and the upload key, and the `/i/[code]` landing page.
- The landing page shows the inviter's first name ("Maya invited you"). It gets it from a public `invite-preview` endpoint that returns the first name only and is rate-limited per IP. On desktop it shows a QR code (F2).
- `redeem-invite`, in one transaction:
  - validate the code and the block rules
  - if the inviter has fewer than 20 friends, create the friendship
  - if not, create a friend request to the inviter (F2 edge case)
  - record the redemption, award `invite_accepted` XP, notify the inviter
- The "0 of 2" meter counts redemptions of my code since signup.

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
- **iOS alert pushes** (flares, replies) set `mutable-content: 1` so the NSE updates the widget. Category `FLARE` carries an "I'm in" action if the M4 spike shows we can handle the action natively without JS. Otherwise tapping the notification opens the flare with "I'm in" one tap away.
- **Android:** flares and replies are data-only, high-priority FCM messages. Our native service builds the notification with action buttons (`PendingIntent` to a receiver, then WorkManager, then `widget-api`) and updates the widget in the same pass.
  - Channels: Flares (high), Replies (high), Snaps (default; only used if the user turns snap notifications on), Reactions (low), Your live flare (low, ongoing).
  - Android 13+ needs the `POST_NOTIFICATIONS` runtime permission, requested after our pre-prompt.
- **APNs environments:** dev builds use sandbox; TestFlight and store builds use production. Stored per device.
- **Failures:** APNs 410 or FCM `UNREGISTERED` deletes the token. Other errors retry once. Every send writes one line to function logs with message kind, platform and result, no content.

---

## 8. Privacy, media and abuse controls

### 8.1 Contact matching

Phone numbers have about 10^10 possible values, so a plain hash can be reversed by brute force. Hashing on the device alone protects nothing.

1. The app reads contacts only after the user taps "Find friends" and grants access. On iOS 18+, limited access (a picked subset) works the same way.
2. The app normalises numbers to E.164 (libphonenumber, the device region as the default country), hashes each with SHA-256, and sends the hashes over TLS to `match-contacts`. Raw numbers never leave the phone.
3. The server computes `HMAC(pepper, hash)` with a secret pepper held only in edge function secrets, compares against `user_private.phone_hmac`, and returns matched profile ids and names.
4. Nothing from the request is stored or logged. Non-matches are not kept. We never upload or store an address book.
5. Limits: 2,000 hashes per call, 3 calls per day per user, blocked users excluded, results exclude people already at 20 friends (they get a request instead).

A user's own `phone_hmac` is written when they verify their number. Phone numbers are never shown to anyone (DECISIONS.md). The raw number stays in `auth.users` for sign-in only.

### 8.2 Images

- The camera capture is resized on device to 1080 px (long edge) and a 480 px thumb, JPEG quality around 0.7, with `expo-image-manipulator`. Re-encoding strips EXIF, including GPS. A unit test on a fixture photo with GPS tags checks the output has none.
- Upload straight to Storage with the user's JWT, then call `share-snap`.
- Drink catalog images (42: 10 per category plus 2 water) are bundled, never downloaded:
  - Design delivers 1024 px masters (style in `DESIGN.md`).
  - `scripts/gen-drink-assets` outputs WebP for app screens, an iOS asset catalog (@2x/@3x) for the widget extension, and Android `drawable-nodpi` WebP.
  - Budget: under 5 MB total in the store download.
  - iOS 18+ tinted and clear home screens recolour widget images. Use `widgetAccentedRenderingMode` per image as `DESIGN.md` specifies.

### 8.3 Rate limits (server-side, `hit_rate_limit()`)

| Action | Limit |
|---|---|
| Flares | 1 live at a time (DB index), a new flare at most every 2 min, 12 per day |
| Snaps | 20 per day |
| Reactions | 1 per snap per person (primary key), 60 changes per hour |
| Friend requests | 30 per day |
| Contact matching | 3 calls per day, 2,000 hashes per call |
| Invite redemptions | 10 per day per account; landing preview 60 per hour per IP |
| Widget API | 120 calls per hour per device |
| OTP | Supabase and Twilio limits (section 5) |

Limits return `429` with a `retryAfter`. The app shows the copy from `COPY.md`.

### 8.4 Moderation

- Report on any snap (F14) or person:
  - the snap is hidden for the reporter at once
  - at 3 distinct reports it is hidden for everyone until reviewed
  - the evidence is copied to `moderation` before the 24 h deletion can remove it
- Block: friendship removed, requests cancelled, group memberships removed, snaps hidden both ways, no future requests or invite redemptions between the two.
- Review: v1 uses an email alert to the moderation inbox plus a saved SQL view in Supabase Studio. App Store rules expect reports to be handled within 24 hours, which needs a named person (CEO question).
- Automatic image screening is not in v1. The audience is mutual friends only, capped at 20. If report volume or App Review asks for it, add a paid moderation API (cost: verify).

### 8.5 Secrets and access

- Secrets in Supabase function secrets and EAS secrets, never in the repo:
  - APNs .p8 key
  - FCM service account
  - phone pepper
  - Twilio credentials
  - Apple Sign in key
  - Sentry DSN
- The Supabase service role key exists only in edge functions and CI deploy jobs.
- Every account uses 2FA. The CEO owns each account and grants roles; people never share passwords.

---

## 9. Testing

| Layer | Tool | Runs where |
|---|---|---|
| Types and lint | `tsc --noEmit`, ESLint | Linux container, CI |
| Unit (shared, app logic) | Jest (`jest-expo` preset) | Linux container, CI |
| Components | React Native Testing Library | Linux container, CI |
| Edge functions | `deno test` with a fake push sender | Linux container (install Deno), CI |
| Database and RLS | pgTAP through `supabase test db` | Linux container with Docker (available here), CI |
| Widget state contract | Shared JSON fixtures decoded by zod, Kotlin and Swift | TS and Kotlin on Linux. Swift on EAS or a Mac. |
| Android widget UI | `glance-appwidget-testing` unit tests (JVM) | Linux after `expo prebuild`, CI on native changes |
| iOS widget UI | SwiftUI `#Preview` for every fixture state | Needs a Mac with Xcode. Optional. |
| E2E | Maestro flows in `e2e/maestro/` | Android: EAS Workflows or Maestro Cloud (this container has no KVM, so no emulator). iOS: EAS macOS runners or Maestro Cloud. **(verify plan and cost)** |
| On-device widget QA | Debug-only "Widget states" screen | Real phones from EAS dev builds |

**The "Widget states" screen** is in development and preview builds only. It writes each fixture (idle, picker, my live flare, incoming flare, two flares, snap, no friends, offline, error) into shared storage and reloads. QA checks every state on real phones without a Mac. This is the main widget test before each release.

**Expo web for UI review.** App screens run on Expo web with web stubs for the native module (camera shows a placeholder). Design and Product review screens from the Linux container that way. Widgets and the Live Activity can't render on web; review them on device.

**What needs EAS cloud or a Mac:** every iOS build, iOS Swift compilation, Live Activity and NSE testing, push testing on real devices, Sign in with Apple. Android release builds also go through EAS so signing keys stay in EAS.

**Coverage rules:** every RLS policy has allow and deny tests. Every edge function has a happy-path test and a test for each limit or permission refusal. XP caps and idempotency get dedicated tests. Every flow F1 to F30 (except F23 quiet hours, removed) has a Maestro flow or a written manual script owned by QA.

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

- **On every PR:** install, typecheck, lint, Jest, Deno tests, `supabase db lint`, pgTAP on a local Supabase, the shared-code drift check, and the Live Activity attributes copy check. When native paths change: `expo prebuild` plus the Android Gradle unit tests.
- **On merge to `main`:**
  - apply migrations and deploy functions to `clink-dev`
  - `eas update --channel preview` when only JS changed
  - otherwise `eas build --profile preview` when the native fingerprint changed
- **Release (tag `v*`):** a GitHub Environment with manual approval by the CTO or Head of Development, then:
  - migrations to `clink-prod`
  - deploy functions
  - `eas build --profile production --platform all --auto-submit`
- Migrations must be backwards compatible with the previous two store builds: add columns, never rename in one step.

### OTA update policy

- `runtimeVersion` policy: `fingerprint`. An update only reaches builds with the same native code. Widget, Live Activity, NSE and Glance code can never change by OTA.
- OTA is allowed for JS bug fixes, copy changes and UI tweaks that don't change an API contract or store-reviewed behaviour.
- Every production update goes out with `--rollout-percentage 10`. We watch Sentry for 24 hours, then roll to 100%. Rollback means republishing the previous update.
- `app_config.min_*_build` drives a "Please update" screen for builds the server no longer supports.

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
| Maestro Cloud / EAS Workflows E2E | $0 to $?? | | Decide in M2 after a trial; ask the CEO before any paid plan. |
| **Total (excl. yearly)** | **about $25 to $300** | **about $300 to $1,700** | SMS is most of the range. |

The original PRD's "$0 per month" for 0 to 5k assumed Supabase Free and no SMS. We don't recommend running prod on Free, and phone sign-in has a real per-user cost.

---

## 12. Accounts and setup checklist for the CEO

Create each one in the CEO's (or the company's) name. Turn on 2FA. Then invite the CTO with an admin or developer role. Don't share passwords.

| # | What | When | Cost | Needed for | Notes |
|---|---|---|---|---|---|
| 1 | **Shared work email** (e.g. a new Gmail now, moved to the domain later) | Now | $0 | Signing up for everything below | Use one address for all accounts so nothing is tied to a personal inbox. |
| 2 | **GitHub** organization + private repo `clink` | Now | $0 (Free plan; Actions minutes limited, verify) | M0. Our cloud container is temporary; code must live on GitHub from day one. | Invite the CTO as owner or admin. |
| 3 | **Apple Developer Program** | Now (enrollment can take days, longer for a company) | $99 / year | M0: installing dev builds on a real iPhone, APNs key, Sign in with Apple, App Groups | Company enrollment needs a D-U-N-S number. Add the CTO as Admin in App Store Connect. |
| 4 | **Expo account** (organization) | Now | $0 to start | M0: EAS builds | Upgrade to a paid plan only when build queues slow us down (ask first). |
| 5 | **Supabase** organization | Now | $0 dev; $25 / month Pro for prod from M6 beta | M0 | Region depends on launch countries. |
| 6 | **Firebase project** (Google account) | M0 | $0 | Android push (FCM) | Only FCM is used. No Analytics SDK. |
| 7 | **Google Cloud OAuth client** (same Google account) | M1 | $0 | Sign in with Google | Created by the CTO once access is granted. |
| 8 | **Twilio** account with Verify | M1 | Pay as you go, needs a card; about $0.05 per verification + SMS fee (verify) | Phone sign-in | Set a monthly spend alert. |
| 9 | **Google Play Console** developer account | By M3 at the latest | $25 once | Internal testing, then the closed test | New personal accounts must run a closed test with at least 12 testers for 14 days before production access (verify current rule). Organization accounts skip this but need a D-U-N-S number. |
| 10 | **Domain** + **Cloudflare** account (DNS and Pages) | M3 (ideally earlier, it sets the bundle ID) | about $10 to $60 / year; Cloudflare $0 | Invite links, universal/app links, privacy policy, support and deletion pages | The domain shows in every invite message, so it's a brand choice. |
| 11 | **Email on the domain** (support@, privacy@, moderation@) | M5 | $0 forwarding, or about $7 per mailbox | Store listings, privacy policy contact, moderation alerts | |
| 12 | **Sentry** organization | M2 | $0 | Crash and error reports | |
| 13 | **Privacy policy and terms** text | M5 | Legal's time | Store submission | Owned by Senior Legal Counsel. Hosted in `web/`. |

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
  - Schema migrations for people, settings, drinks and logs, with pgTAP tests.
  - Sign in with Apple, Google and phone OTP (Twilio Verify).
  - Name and photo step.
  - Drink catalog in `packages/shared` (top 10 per category from `PRD.md`, plus water) with the image pipeline.
  - Usual 3 editor with "Make it yours" details (OPTS, note, Plan B).
  - Tracker in the app: drinks and water, undo last, local midnight reset, the herbal note after 4 caffeinated drinks.
  - `register-device`. Account deletion (early, so every later table gets cascade tests).
- **Done when:** a new user can sign up on both platforms, set their usual 3 with details, log and undo drinks, sign in on a second phone and see the same data, and delete the account with all rows and files gone (checked by a test). RLS tests cover every new table.

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
  - Contact matching (8.1). Friend requests (F6). Friends sheet with 📝 usual orders (F22, F27 entry).
  - Invite share buttons (WhatsApp, Messages, More) with the "0 of 2" meter.
  - `web/` landing page, AASA and assetlinks. Install referrer (Android), Paste button (iOS), `redeem-invite`.
  - Groups (F28) and the group suggestion at 6+ friends.
  - Widget configuration per group on both platforms (F30). Play Console internal testing track live.
- **Done when:**
  - A fresh install from an invite tapped in WhatsApp ends with the two users as friends, on both platforms, without typing (Android) or with one Paste tap (iOS).
  - The 20-friend cap and block rules hold under tests.
  - A friend can't see which groups they're in (tested at RLS and API level).

### M4: Flares and drink runs (the core loop)

- **Deliverables**
  - Flare schema. `send-flare`, `respond-flare`, `close-flare`, `flare-tick`.
  - Composer with category, place, timing pills and the "To:" picker (F16, F29).
  - Quick flare from the widget (F15). Incoming flare on widget, notification and app (F18). Two flares at once (F21).
  - Bring me one from the widget (as saved) and the app (one-time note) (F19).
  - Run list, order card and Show to barista with keep-awake (F27).
  - Live Activity and Dynamic Island. Android ongoing notification.
  - Expiry with nobody (F20). Offline handling (F25). Notification settings without quiet hours (F23 minus quiet hours).
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
  - Report and block with moderation copies and email alerts (F14). `snap-cleanup`.
  - XP ledger, `settle_flare`, `award_xp`, and the private level screen.
  - Last-drink sharing opt-in (F26). Settings, sign out (F24).
  - Privacy policy, terms, support and deletion pages live.
- **Done when:**
  - A snap reaches friends' widgets on both platforms and is gone, file included, after 24 hours.
  - Reported snaps survive in moderation.
  - XP caps and idempotency tests pass, and no API returns another user's XP.
  - A full account deletion leaves nothing behind in tables or Storage.

### M6: Hardening, beta and store launch

- **Deliverables**
  - Full QA pass of F1 to F30 (minus quiet hours) on a device matrix:
    - iOS 17.2, the current iOS
    - small and large iPhones
    - Android 8, Android 10, the current Android
    - Pixel and Samsung (One UI launchers behave differently with widgets)
  - Accessibility pass (VoiceOver, TalkBack, Dynamic Type, contrast per `DESIGN.md`).
  - Performance: cold start under 2 s on a mid-range Android.
  - Security review by the Senior Security Expert (RLS, secrets, rate limits, storage).
  - `clink-prod` on Pro with backups. Store listings, screenshots, privacy labels and the Data safety form.
  - TestFlight beta, and the Play closed test (12+ testers, 14 days, if it applies).
  - Invite capture measured on iOS.
- **Done when:**
  - Crash-free sessions are 99.5% or better over the beta.
  - No open P0 or P1 bugs.
  - The Play production access requirement is met.
  - Both apps pass review and are live in the launch countries.

---

## 14. Questions for the CEO

1. **Launch countries.** This sets the Supabase region (GDPR if EU), SMS cost per signup, Twilio geo permissions and store availability.
2. **Enroll Apple and Google as an individual or a company?** A company needs a D-U-N-S number and takes longer, but the seller name on the store is the company, and Google Play skips the 12-tester closed test. As an individual, your personal name shows as the seller.
3. **Domain.** Which domain should we buy? It appears in every invite message and sets the permanent bundle ID. About $10 to $60 per year depending on the TLD (verify).
4. **Who handles reports within 24 hours?** App Store rules expect timely action on reported photos. Someone has to own the moderation inbox, including weekends.
5. **Phone sign-in cost.** Phone OTP is the main variable cost (roughly $250 to $1,500 per month at 5k to 25k users, very uncertain). Keep it on both platforms as planned, or make Apple/Google the default and phone optional?
