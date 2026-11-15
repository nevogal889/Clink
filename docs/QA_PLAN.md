# Clink v1 QA plan

Owner: Senior QA Engineer. Audience: engineering, Product, Design, Copy, Security.
Status: v1 test plan. `DECISIONS.md` wins over this file and over every other doc. Behaviour comes from `PRD.md`, build mechanics from `ARCHITECTURE.md`, visuals from `DESIGN.md`, strings from `COPY.md`. This file does not restate them. It says what we test, where, on what, and when a build may ship.

Spec problems found while writing this plan are listed in section 13 with IDs (`QF-M*` must fix, `QF-S*` should fix). A test that depends on one says "blocked by QF-…". A blocked test is not a pass.

---

## 0. Conventions

**Test IDs.** `AT-<PRD section>-<AC number>` maps one to one to a PRD acceptance criterion: `AT-3.5-3` tests `PRD.md` 3.5 acceptance criterion 3. Other cases use a prefix per area: `W` widget, `G` widget group config, `ST` stale data, `OF` offline, `N` notifications, `LA` Live Activity, `ON` Android ongoing notification, `T` time, `I` invites, `X` XP, `PV` privacy, `AX` accessibility, `CB` copy and brand.

**Method.** `U` unit (Jest, Deno), `DB` pgTAP, `C` widget-state contract fixtures, `E2E` Maestro, `API` scripted privacy sweep against edge functions and PostgREST, `M` manual script on a real device.

**Severity.**
| Level | Meaning | Examples |
|---|---|---|
| P0 | Ship blocker. Privacy leak, wrong audience, data loss, wrong order sent, crash in a core loop, store-rule violation. | A non-member gets a group flare. A friend sees XP. The widget sends a Bring me one without its details. |
| P1 | Core task broken or over its tap budget on a supported device. | +1 Drink needs 3 taps. Widget never shows a friend's flare on Samsung. |
| P2 | Wrong but with a workaround, or a visual/copy defect in a core screen. | Truncated place name on the 2x2 widget. |
| P3 | Cosmetic or rare edge. | Haptic missing on Android 9. |

**Test accounts.** Seeded in `supabase/seed.sql` and mirrored on `clink-dev`:
- A Dana (me), B Maya, C Leo, D Sam, E Noa, F Ari: mutual friends with A.
- G Stranger: no relation to anyone.
- H Blocked: blocked by A.
- I Pending: pending request from A.
- J Ex: was A's friend, removed.
- K Full: has 20 friends.
- Groups owned by A: Work (C, D, F), Home friends (B, E, C), Empty (nobody).

**Time control.** Server tests need to move the clock (24 h snaps, 30-day requests, 7-day XP reversal, 2 h run list, flare expiry). Device tests move the device clock and time zone. The server side is blocked by QF-S30 until a dev-only clock offset exists.

---

## 1. Test strategy by layer

| # | Layer | Tool | Runs | What it must cover | Gate |
|---|---|---|---|---|---|
| L1 | Static checks | `tsc`, ESLint, string-table lint | Every PR | No string literal in UI code outside the generated table (`PRD.md` 3.0). Banned words and patterns from `COPY.md` 1.3 grepped in the string table. No "link" next to invite strings, no URL in any UI string, no "quiet", "do not disturb" or time window strings. No emoji in titles, buttons, notifications or share messages except the allowed set. | PR blocked |
| L2 | Shared logic | Jest on `packages/shared` | Every PR | Audience rule (section 6 table), flare close time, caffeinated flag (catalog + `caf = Decaf`), XP values, caps and level thresholds, plural rules, `{name}` and `{drink_short}` truncation, summary builder ("· +n"). | PR blocked |
| L3 | Catalog | Jest + asset script | Every PR | 10 drinks per flare category, 2 waters, ids match `COPY.md` section 2, every id has hero/icon assets in light and dark, widget names ≤ 15, app names ≤ 20. Category label is exactly "Smoothie & Juice". | PR blocked (blocked by QF-M14 until lists match) |
| L4 | Database | pgTAP via `supabase test db` | Every PR | Allow and deny test per RLS policy with users A to K. Constraints: one live flare per sender, 20-friend cap under concurrency, XP idempotency, close-time check. Cascades on account deletion. | PR blocked |
| L5 | Edge functions | `deno test`, fake push sender | Every PR | Happy path plus each limit, refusal and race per function. Push payloads checked for forbidden fields (group name, counts, XP, phone). | PR blocked |
| L6 | Widget-state contract | Shared JSON fixtures decoded by zod, Swift and Kotlin | Every PR (Swift on EAS) | One fixture per widget state in section 4.1, plus malformed and old-version (`v` mismatch) fixtures. All three decoders agree. | PR blocked (blocked by QF-M12) |
| L7 | Android widget UI | `glance-appwidget-testing` | PRs touching native | Each fixture renders, buttons wire to the right `ActionCallback`, size buckets (2x2, 4x2 short, 4x2). | PR blocked |
| L8 | iOS widget UI | Xcode previews per fixture | Before each release | Each fixture on smallest (148 pt) and largest widget sizes, light, dark, tinted, clear. | Release blocked |
| L9 | App E2E | Maestro | Nightly on `main`, every release | F1 to F31 happy paths and the edge cases marked `E2E` below. | Release blocked |
| L10 | Device manual | Written scripts, "Widget states" debug screen | Every release candidate | Widgets, notifications, Live Activity, deep links, permissions, OEM behaviour: everything Maestro can't drive. | Release blocked |
| L11 | Privacy sweep | Scripted API calls as users A to K | Every release candidate, and on any migration touching RLS | Section 10. Diffs every response against a forbidden-field list. | Release blocked; any hit is P0 |
| L12 | Push and real time | Lab script, 2 devices per platform | M4 onward, every RC | Latency targets (`PRD.md` 3.3 AC8, `ARCHITECTURE.md` M4: notification p90 ≤ 5 s over 50 sends on Wi-Fi and LTE; widget ≤ 60 s in 9 of 10). | Release blocked |
| L13 | Accessibility | VoiceOver, TalkBack, Accessibility Inspector, Accessibility Scanner | Every RC | Section 11. | Release blocked for P0/P1 |
| L14 | Performance | Manual timing, Sentry | Every RC | Cold start < 2 s on a mid-range Android (`ARCHITECTURE.md` M6). Widget action to confirmation < 2 s online. Drink asset budget < 1.5 MB, total < 5 MB. | Release blocked if missed by > 20% |
| L15 | Security | Senior Security Expert review | Before beta and before public | RLS, secrets, rate limits, signed URL lifetimes, widget token scope, Sentry scrubbing. | Release blocked |
| L16 | Store compliance | Checklist | Before each submission | Sign in with Apple present, in-app deletion, report and block, privacy labels and Data safety match `PRD.md` 3.17, Play web deletion page, Apple token revoke. | Submission blocked |
| L17 | Beta telemetry | Server tables, `app_events`, Sentry | Closed beta | `PRD.md` section 6 targets and section 12 exit numbers. | Beta exit |

**Regression rule.** Every P0 or P1 bug gets an automated test at the lowest layer that can catch it before the fix is merged.

**OTA rule.** A JS-only release (EAS Update) runs L1 to L5, L9 and the privacy sweep. It never needs widget runs, because widget code can't change by OTA (`ARCHITECTURE.md` 10). A store build runs everything.

---

## 2. Device and OS matrix

### 2.1 Minimum OS each document assumes

| Document | iOS | Android | Notes |
|---|---|---|---|
| `DECISIONS.md` | not stated | not stated | iOS and Android in v1. |
| `original-prd.md` | iOS 17+ | not stated | Superseded by `ARCHITECTURE.md`. |
| `PRD.md` | defers to `ARCHITECTURE.md` | defers | Stage 1 needs "one older supported device per platform". |
| `ARCHITECTURE.md` | **17.2** | **8.0 (API 26)** | Feature floors inside: iOS 18 limited contacts and tinted/clear widgets, iOS 26 WidgetKit push, Android 12 widget reconfigure and system radii, Android 13 `POST_NOTIFICATIONS`, Android 16 Live Updates (optional). Expo SDK latest stable at build time, minimum 54. |
| `DESIGN.md` | not stated; assumes iOS 17 widgets and iOS 18 tinted modes | 8.0 implied (haptic fallbacks for API 26 to 29, drawable radii below 12) | Widget sizes "155 to 170 pt" exclude iPhone SE 2nd/3rd gen (148 pt). See QF-S26. |
| `COPY.md` | iOS widget steps use iOS 18 wording ("Tap Edit, then Add Widget") | generic | iOS 17.2 to 17.x users get wrong steps. See QF-S25. |

**Mismatches.** (1) iOS 17 vs 17.2: `ARCHITECTURE.md` wins; store listing and `app.config.ts` deployment target must say 17.2. (2) Widget sizes in `DESIGN.md` don't cover the smallest supported iPhone. (3) Onboarding widget steps in `COPY.md` don't cover iOS 17. (4) The `ARCHITECTURE.md` M6 matrix lists Android 8, 10 and current only; it misses Android 12 and 13, where widget and notification behaviour changes. This plan adds them.

### 2.2 iOS devices

| ID | Device class | OS | Why |
|---|---|---|---|
| i1 | iPhone SE (2nd or 3rd gen) | 17.2 to 17.x, kept un-updated | Minimum OS. Smallest widgets (148 pt). Screen under 700 pt tall. Touch ID. No Dynamic Island. Apple stops signing old builds, so buy this device on 17.x and never update it. |
| i2 | iPhone 11 or XR | latest 17.x or 18.x it runs | Older CPU and LCD. Performance and memory in the NSE (24 MB-ish budget, verify). |
| i3 | iPhone 13 or 14 (non-Pro) | 18.x | Tinted and clear home screens. Limited contacts access. No Dynamic Island. |
| i4 | iPhone 15 Pro or 16 Pro | current iOS at build time | Dynamic Island, WidgetKit push (26+), StandBy rendering (must not break). |
| i5 | Pro Max or Plus | current iOS | Largest widget sizes, longest strings. |

Simulators are for layout only. Widgets, push, Live Activities, NSE, Sign in with Apple and universal links are signed off on real devices.

### 2.3 Android devices

| ID | Device class | OS / API | Why |
|---|---|---|---|
| a1 | Any Android 8.0 or 8.1 phone (for example an old Galaxy) | 26 / 27 | Minimum OS. No runtime notification permission. No widget reconfigure. Drawable radii. No haptic compositions. |
| a2 | Android 10 phone | 29 | `ARCHITECTURE.md` matrix. `EFFECT_DOUBLE_CLICK` fallback. |
| a3 | Android 12 or 12L | 31 / 32 | New widget APIs: reconfigure, `previewLayout`, system radii, `configuration_optional`. |
| a4 | Android 13 | 33 | `POST_NOTIFICATIONS` runtime prompt. |
| a5 | Pixel on current Android | current (verify at build time) | Reference behaviour, Live Updates evaluation, current target SDK. |
| a6 | Samsung Galaxy (One UI) on current One UI | current | One UI Home widget resize and reconfigure, Samsung battery manager. Required by `ARCHITECTURE.md` M6. |
| a7 | Xiaomi or Redmi (HyperOS/MIUI) | recent | Aggressive background killing and autostart rules. Most likely place for FCM and WorkManager delays. |
| a8 | Mid-range phone, 4 GB RAM | recent | Cold start target (< 2 s). |

Launchers on a5 or a6: stock, One UI Home, and Nova (third party, tests the Settings > Widgets fallback).

### 2.4 Settings permutations (run P0 suites on each, on at least one device per platform)

Light and dark. Largest text size and Bold Text. Reduce Motion / Remove animations. Increase Contrast / high-contrast text. Low Power Mode / Battery Saver. Focus or Do Not Disturb on. Notification permission denied. Live Activities off (iOS). Background App Refresh off (iOS). Data Saver (Android). App force-quit (iOS) and force-stopped (Android). 12 h and 24 h time. Regions US, UK and Germany (number and time formats). Time zone change while running.

### 2.5 Networks

Wi-Fi, LTE, throttled 3G profile, airplane mode, captive portal Wi-Fi (connected but no internet), switching Wi-Fi to cellular mid-request.

### 2.6 Coverage rule

- **Core four** (i1, i4, a1, a6): every suite, every release candidate.
- **Full matrix**: before closed beta, before public release, and after any Expo SDK, Xcode image, Glance or Kotlin upgrade.
- OTA updates: core four only, P0 suites.

---

## 3. Acceptance tests mapped to PRD acceptance criteria

Each row tests exactly the PRD criterion with the same number. "Both" means iOS and Android.

### 3.0 Tap budget (`PRD.md` 3.0)

| ID | Task | Max taps | Method | Notes |
|---|---|---|---|---|
| AT-3.0-1 | Log a drink or water from widget | 2 | M | Count from unlocked home screen. |
| AT-3.0-2 | Quick flare | 1 | M | Medium widget only. |
| AT-3.0-3 | Join a friend's flare | 1 | M | Widget, both sizes. |
| AT-3.0-4 | Bring me one from widget | 2 | M | Medium only. |
| AT-3.0-5 | Custom flare with defaults | 2 | E2E + M | App cold and warm start. |
| AT-3.0-6 | Share a snap | 3 | M | Camera button on widget, shutter, Share snap. |
| AT-3.0-7 | Open a friend's order at the counter | 3 | M | App must land on the live flare when one is live or in its 2 h window. |

### 3.1 Sign in

| ID | Check | Platform | Method |
|---|---|---|---|
| AT-3.1-1 | Sign-in options match the spec. Blocked by QF-M4 (PRD says exactly two, ARCHITECTURE and COPY add "Other ways to sign in"). | Both | E2E |
| AT-3.1-2 | New user via Apple, Google, phone reaches onboarding step 2. One run per method per platform. | Both | M |
| AT-3.1-3 | Existing user on a second phone skips onboarding; usual 3 with details, groups, friends, XP total and today's tracker match the first phone. Include iPhone to Android with a linked phone number. | Both | M |
| AT-3.1-4 | Wrong code shows the inline error; 6th attempt inside 15 min is refused with `err.code_locked`. Blocked by QF-S2 (ARCHITECTURE uses 5 per hour). | Both | E2E |
| AT-3.1-5 | Resend disabled for 30 s after each send, countdown visible. | Both | E2E |
| AT-3.1-6 | Phone number absent from friend list, flare, snap viewer, order card, friend request, notification payloads and every API response to another user (section 10). | Both | API + M |
| AT-3.1-7 | Apple "Hide my email" completes with no email prompt. | iOS | M |

### 3.2 Onboarding

| ID | Check | Method |
|---|---|---|
| AT-3.2-1 | Exactly the 6 steps in table order. Blocked by QF-M5 (the iOS "Got an invite?" screen isn't in the table). | E2E |
| AT-3.2-2 | Step 3 Continue disabled with 0 drinks, enabled with 1. | E2E |
| AT-3.2-3 | Skip 4, 5 and 6 each; user ends on the camera screen. | E2E |
| AT-3.2-4 | System notification dialog never appears before "Turn on notifications". Android 8 to 12 have no runtime prompt: the button goes straight on. | M |
| AT-3.2-5 | Kill on step 4, reopen: lands on step 4 with name, photo and usual 3 saved. Repeat for every step. | E2E |
| AT-3.2-6 | Arriving from Maya's invite: step 1 shows "Maya invited you"; Maya is a friend by step 4. Both platforms, fresh install. Blocked on iOS by QF-M5. | M |
| AT-3.2-7 | "I added it" with a widget goes to camera; without, shows the retry guide with "Skip for now". Include iOS detection lag (add widget, return within 2 s). | M |
| AT-3.2-8 | Water is not in the step 3 catalog and can't fill a slot. | E2E |

### 3.3 Widget

| ID | Check | Method |
|---|---|---|
| AT-3.3-1 | Both sizes add on both platforms and render every state in section 4.1. Blocked by QF-M12. | M + C |
| AT-3.3-2 | +1 Drink then a drink logs with the app killed; count updates on the widget in ≤ 5 s. | M |
| AT-3.3-3 | Who joins? sends to the widget's configured audience without opening the app. Verify recipients server-side. | M + API |
| AT-3.3-4 | Two medium widgets set to Work and Home friends send to those groups. | M |
| AT-3.3-5 | Changing audience in Settings > Widgets changes the next quick flare. Android: passes. iOS: blocked by QF-M13 (the app can't write a widget's intent configuration). | M |
| AT-3.3-6 | Friend's unreplied flare outranks your live flare; after I'm in, your live flare shows. | M |
| AT-3.3-7 | Two friend flares: newer shows with "+1". | M |
| AT-3.3-8 | Friend's new flare on widget within 60 s in 9 of 10 tries, app killed, notifications allowed. Separate run with notifications off (QF-S8). | L12 |
| AT-3.3-9 | I'm in on an ended flare records nothing and shows the ended message. Check `flare_responses` has no row. | M + API |
| AT-3.3-10 | Widget Bring me one arrives with every saved field, Note and Plan B, and no one-time note. Compare `flare_responses.drink` with `usual_drinks.details` field by field. | M + API |
| AT-3.3-11 | Pickers close after 30 s idle. Blocked by QF-M6 (ARCHITECTURE says 20 s). Measure on both platforms; tolerance +5 s for system reload delay. | M |
| AT-3.3-12 | After sign-out, every widget (all sizes, all instances) shows signed out within one reload. | M |

### 3.4 Camera and snaps

| ID | Check | Method |
|---|---|---|
| AT-3.4-1 | A snap reaches every friend's widget and viewer, including friends in no group. | M + API |
| AT-3.4-2 | Flare photo reaches only the chosen audience. A friend outside the group can't get it from widget, viewer, notification attachment, `snaps` table or Storage URL. **Blocked by QF-M1 (P0 design leak).** | API + M |
| AT-3.4-3 | 24 h after upload the snap is gone from viewers and widgets and its file 404s, including old signed URLs after their 15 min lifetime. | API (time control) |
| AT-3.4-4 | Uploaded image and thumb have no EXIF GPS. Use a fixture photo with GPS tags, read back from Storage. | U + M |
| AT-3.4-5 | Two different reactions from one friend leave one reaction. Three friends reacting produce exactly one notification on the sender's device. Blocked by QF-M11. | M + API |
| AT-3.4-6 | New account has Friend snaps off. | E2E |
| AT-3.4-7 | Camera denied: explainer shows; composer still sends a flare. | M |

### 3.5 Flares

| ID | Check | Method |
|---|---|---|
| AT-3.5-1 | Composer shows Coffee, Matcha, Tea, Smoothie & Juice and nothing else. | E2E |
| AT-3.5-2 | Other shows 5 to 60 in steps of 5, 12 values, nothing above 60. | E2E |
| AT-3.5-3 | Close time: Now → +15, 30m → +30, Other 45 → +45. Full table in section 6.2. | U + DB + M |
| AT-3.5-4 | Flare to Work: only C, D, F get notification, widget change and an API row. B and E get nothing. | API + M |
| AT-3.5-5 | Second flare while one is live shows the replace prompt; confirm leaves one live flare (DB index). | E2E + DB |
| AT-3.5-6 | Cancel with two repliers: each gets exactly one silent notification; others get nothing. Include the DESIGN undo window: cancel then Undo within 5 s sends nothing. Blocked by QF-M16 (COPY has a confirm dialog). | M + API |
| AT-3.5-7 | No-reply expiry: no notification to anyone, "Nobody was free this time." in the sender's app only. Check Live Activity and Android ongoing notification show nothing of it. Blocked by QF-M8. | M |
| AT-3.5-8 | After "We're going", run list reachable for 2 h; gone at 2 h 1 min. | M (time control) |
| AT-3.5-9 | Quick flare uses usual #1's category, last place, Now. Also with no last place (empty). | M |
| AT-3.5-10 | 4th flare in 60 min reaches widgets, notifications play no sound. Blocked by QF-S1 (ARCHITECTURE has no silent guard, and its 2-minute gap changes the setup). | API + M |
| AT-3.5-11 | Live Activity / ongoing notification starts on send (from app and from widget), updates reply count in ≤ 10 s online, ends at close or cancel. | L12 |

### 3.6 Replies

| ID | Check | Method |
|---|---|---|
| AT-3.6-1 | No decline anywhere: grep strings, check UI, check `flare_responses.kind` only allows `in` and `bring`. | L1 + DB + M |
| AT-3.6-2 | Widget Bring me one has all saved details and no one-time note. | API |
| AT-3.6-3 | App Bring me one with a one-time note shows it on the order card under "Just this time" and first on Show to barista. | M |
| AT-3.6-4 | I'm in then Bring me one leaves one row, kind `bring`. And back again. | DB + E2E |
| AT-3.6-5 | Withdraw I'm in: no notification. Withdraw Bring me one: exactly one silent notification to the sender. | M + API |
| AT-3.6-6 | A and G (not friends) both join B's flare: A sees "1 other is in", never G's name or photo, in app, widget, notification or `flare_view` response. | API + M |
| AT-3.6-7 | No-details nudge appears once per drink, never after Add details or Send as is, and once on next open after a widget send. | E2E |

### 3.7 Usual 3 and order details

| ID | Check | Method |
|---|---|---|
| AT-3.7-1 | 10 drinks per category matching `COPY.md`, each with its picture. Blocked by QF-M14. | L3 + M |
| AT-3.7-2 | Water can't fill a slot. | E2E |
| AT-3.7-3 | Every option field can be set, changed, cleared; multi-select takes several. Blocked by QF-M15 (PRD and COPY option sets differ). | E2E |
| AT-3.7-4 | Custom drink uses its chosen category's options and glyph. | E2E |
| AT-3.7-5 | Saving details updates the widget and the next Bring me one at once (app open, and app killed afterwards). | M |
| AT-3.7-6 | Friend's 📝 view shows saved details, Note, Plan B; never a one-time note sent to someone else (API check as user B on A's usual). | API + M |

### 3.8 Order card and Show to barista

| ID | Check | Method |
|---|---|---|
| AT-3.8-1 | Run list in reply order. | E2E |
| AT-3.8-2 | Order card shows every saved field and nothing empty. | E2E |
| AT-3.8-3 | Show to barista keeps the screen on ≥ 5 min with no touch, auto-lock at 30 s. Brightness restored on close if implemented. | M |
| AT-3.8-4 | Three orders: swipe through all, "n of 3"; a single tap on content doesn't close. | M |
| AT-3.8-5 | Barista text sizes and 21:1 contrast per `DESIGN.md` 4.10, including dark system theme. | M |
| AT-3.8-6 | Run list gone 2 h 1 min after close. | M (time control) |

### 3.9 Friends

| ID | Check | Method |
|---|---|---|
| AT-3.9-1 | Accepting a 21st friend blocked with "remove someone first". Concurrency: two accepts at 19 friends at the same moment leave 20, not 21. | DB + M |
| AT-3.9-2 | Pending request older than 30 days gone for both, no notification. Blocked by QF-S29 (no expiry job). | DB (time control) |
| AT-3.9-3 | Remove: no notification, removed from all groups, loses snaps, flares and usual 3 on next refresh (API as J). | API + M |
| AT-3.9-4 | A friend who didn't opt in never shows a last-drink time. | API + M |
| AT-3.9-5 | Mutual requests create one friendship row. | DB |

### 3.10 Groups

| ID | Check | Method |
|---|---|---|
| AT-3.10-1 | No API response to a non-owner contains group names, membership or existence. | API |
| AT-3.10-2 | Tue 09:00 → daytime group; Tue 18:00 and Sat 10:00 → other-times group. | U + DB |
| AT-3.10-3 | No daytime group, Tue 09:00 → Everyone. **Blocked by QF-M2** (ARCHITECTURE falls through to the home group). | U + DB |
| AT-3.10-4 | 6-friend suggestion shows once at 6 friends, never after dismissal, and not again at 7 after dropping to 5. | E2E |
| AT-3.10-5 | Friend in two groups gets one flare (one notification, one widget card). | API + M |
| AT-3.10-6 | Deleting a group leaves friends unchanged; a widget on that group falls back to Automatic. | E2E + M |

### 3.11 Tracker

| ID | Check | Method |
|---|---|---|
| AT-3.11-1 | One drink and one water from the widget show "1 drink" and "1 water". | M |
| AT-3.11-2 | Entries at 23:59 are gone from today's count at 00:00 local, app closed and widget offline. | M |
| AT-3.11-3 | Undo last removes only the newest. | E2E |
| AT-3.11-4 | 4th caffeinated shows the note; 3 coffees + chamomile doesn't; 3 coffees + decaf latte doesn't (blocked by QF-M15 for the decaf field). | U + E2E |
| AT-3.11-5 | Sharing off: no last-drink field in B's view of A. On: only the last non-water timestamp. Off again: gone at once. Blocked by QF-M17. | API |
| AT-3.11-6 | No counts or water in any other user's response. | API |

### 3.14 Settings

| ID | Check | Method |
|---|---|---|
| AT-3.14-1 | No quiet hours, time window or own Do Not Disturb control. | L1 + M |
| AT-3.14-2 | Every item within 2 taps of the settings button. | M |

### 3.15 Invites

| ID | Check | Method |
|---|---|---|
| AT-3.15-1 | No URL, no "link" next to an invite, no Copy link anywhere in either app. Screenshot every screen in onboarding, friends sheet, empty states, widget no-friends landing. | L1 + M |
| AT-3.15-2 | WhatsApp installed: opens with the message pre-filled. Not installed: button hidden. | M |
| AT-3.15-3 | More opens the share sheet with message and URL. | M |
| AT-3.15-4 | Fresh install from the link, sign-in: friends with inviter, "invited you" shown, 9 of 10 per platform. Detailed matrix in section 7. | M |
| AT-3.15-5 | Attribution fails: "Did someone invite you?" appears. | M |
| AT-3.15-6 | Meter reaches "2 of 2" after two different share-button taps or Adds. Blocked by QF-M3. | E2E |
| AT-3.15-7 | Desktop browser shows the QR page. | M |

### 3.16 Notifications

| ID | Check | Method |
|---|---|---|
| AT-3.16-1 | Friend's flare at 23:30 local arrives with sound (no time-based suppression), and at 03:00. | M |
| AT-3.16-2 | Notification settings list exactly the toggles in `PRD.md` 3.16 and nothing time-based. Blocked by QF-M9 (DB stores 3 of 5). | E2E |
| AT-3.16-3 | I'm in from the notification registers without opening the app UI. iOS depends on the M4 spike (QF-S9). | M |
| AT-3.16-4 | Friend flares off: no flare notifications, flares still on the widget. | M |
| AT-3.16-5 | No notification for XP or levels, ever. | API + M |

### 3.18 Report and block

| ID | Check | Method |
|---|---|---|
| AT-3.18-1 | Report sheet open in ≤ 2 taps from a snap. | M |
| AT-3.18-2 | Reported snap hidden for reporter on widget and viewer at once. | M |
| AT-3.18-3 | After block, neither side sees the other's snaps, flares, usual 3 or profile; blocked user can't match the blocker via contacts or redeem the blocker's invite. | API + M |
| AT-3.18-4 | Blocked user gets no notification and no visible change except the person being gone. | M |

### 3.19 Account deletion

| ID | Check | Method |
|---|---|---|
| AT-3.19-1 | Delete reachable in ≤ 3 taps from Settings. Apple re-auth sheet counted separately (QF-S27). | M |
| AT-3.19-2 | Friends don't see the user anywhere on next refresh, including widgets, flares they'd joined, run lists, other users' group member lists. | API + M |
| AT-3.19-3 | Signing in again with the same identity creates an empty account (no friends, XP 0, no usual 3). | M |
| AT-3.19-4 | Web deletion page works and is linked in the Play listing. | M |

### 3.20 Offline and errors

| ID | Check | Method |
|---|---|---|
| AT-3.20-1 | Airplane mode, log 3 drinks (app and widget), go online: 3 entries with original times, no duplicates after repeated retries. | M |
| AT-3.20-2 | Flare tapped offline: "Sending…", retry message at 30 s, dropped at 2 min with `off.flare_dropped`. | M |
| AT-3.20-3 | Every row of the 3.20 table reproduced. | M |

### 4.6 XP

| ID | Check | Method |
|---|---|---|
| AT-4.6-1 | 5 flares and 5 snaps with no replies: XP unchanged. | DB + U |
| AT-4.6-2 | Signup via A's invite gives A +50 once; remove and re-add gives nothing. Blocked by QF-M10. | DB |
| AT-4.6-3 | Invitee deletes on day 3: A's 50 reversed with a ledger entry shown as "Invite XP adjusted". Blocked by QF-M10. | DB + M |
| AT-4.6-4 | 4 joins from 4 friends in a day: +30. | DB |
| AT-4.6-5 | 2 joins of the same friend's flares in a day: +10 once. | DB |
| AT-4.6-6 | Cancelled flare: nobody gets XP. | DB |
| AT-4.6-7 | Bring me one cancelled before close: no drink-run XP. | DB |
| AT-4.6-8 | 6 logs give +5 once; undoing all removes it. Blocked by QF-M10. | DB |
| AT-4.6-9 | Another user's profile request returns no XP or level fields. | API |
| AT-4.6-10 | Level-up sends no push. | API + M |
| AT-4.6-11 | Replaying the same event awards once. | DB + U |

---

## 4. Widget test cases

### 4.1 States × size × platform

Every row runs on iOS and Android, from a fixture on the "Widget states" screen and from real data. "R" means the state must be reachable with real data, not only by fixture.

| ID | State | Small | Medium | R | Notes |
|---|---|---|---|---|---|
| W1 | Signed out | yes | yes | yes | After sign-out and after account deletion. |
| W2 | Signed in, onboarding not finished | yes | yes | yes | `wm.setup`. |
| W3 | Idle with a friend snap | yes | yes | yes | Snap tile, scrim label, tap opens viewer. |
| W4 | Idle, no snap in 24 h | yes | yes | yes | Empty tile opens camera. |
| W5 | Idle, no friends | same as idle | yes | yes | Invite tile; Who joins? becomes Invite. |
| W6 | Idle, no usual 3 | yes | yes | yes | +1 Drink opens editor; Who joins? opens camera. |
| W7 | Idle with caffeine note | n/a | yes | yes | After 4th caffeinated; replaces usual #1 line. |
| W8 | +1 picker | 2x2 grid | 4 buttons | yes | Water always 4th, still water. Android 2x2 under 150 dp: no header, no close. |
| W9 | Your live flare, no replies | yes | yes | yes | "Sent to …" / `wm.live.none`. |
| W10 | Your live flare, replies | count | chips, notes marker, "+N" | yes | 1, 2, 3 and 7 replies; mixed in and bring. Blocked by QF-M12 (no reply list in state JSON). |
| W11 | Friend's flare, hero | yes | yes | yes | |
| W12 | Friend's flare with photo | hero only | 72 pt photo tile | yes | Blocked by QF-M1 and QF-M12. |
| W13 | Friend's flare, "+N" | yes | yes | yes | 2 and 5 live flares. |
| W14 | Bring me one picker | n/a | yes | yes | Notes marker on drinks with details. |
| W15 | Replied: You're in | yes | yes | yes | |
| W16 | Replied: Asked for X | n/a | yes | yes | |
| W17 | Confirmation (Logged, Sent, You're in, Asked for) | yes | yes | yes | About 4 s, then priority state. |
| W18 | Sending | yes | yes | yes | Airplane mode. |
| W19 | Failed | yes | yes | yes | Tap retries (blocked by QF-S21 for wording/behaviour). |
| W20 | Ended flare tapped | yes | yes | yes | Opens app with "This flare has ended." |
| W21 | Audience empty | n/a | yes | yes | Group with no members. |
| W22 | Done flare (sender, after We're going) | yes | yes | yes | Undefined in PRD (QF-S32). |

Each state also runs in: light, dark; iOS tinted and clear (18+); Increase Contrast; largest text (iOS clamps at xxLarge, lines drop in `DESIGN.md` 5.1 order); Android font scale 1.3 and 2.0; Android pre-12 radii (a1); Android resize 2x2 → 4x2 short → 4x2 and widths under 230 dp; iPhone SE 148 pt and Pro Max. Pass means: no clipped text, every button ≥ 44 pt / 48 dp, counts and countdowns always visible.

### 4.2 Priority

| ID | Setup | Expected |
|---|---|---|
| WP1 | Own live flare only | W9/W10 |
| WP2 | Friend flare unreplied + own live flare | W11; after I'm in → W10 |
| WP3 | Two friend flares + own live flare | Newest with "+1"; after replying to both → own flare |
| WP4 | Friend flare replied, no own flare | W15 until close, then idle |
| WP5 | Friend flare dismissed in app | Next state by priority |
| WP6 | Picker open when a friend flare arrives | Picker stays until choice or timeout; then friend flare |

### 4.3 Group configuration (medium only)

| ID | Case | Platform | Expected |
|---|---|---|---|
| G1 | Add widget, default | Both | Automatic; label shows what it resolves to now. |
| G2 | iOS Edit Widget lists Automatic, each group with emoji, Everyone | iOS | Matches `COPY.md` `wcfg.*`. |
| G3 | Android config activity on add | Android 8 to current | Shown on add; on 12+ "Reconfigure" reopens it. On 8 to 11 change via Settings > Widgets. |
| G4 | Two widgets, Work and Home friends | Both | Each quick flare to its group (AT-3.3-4). |
| G5 | Settings > Widgets lists each widget with size and audience | Both | iOS write path blocked by QF-M13. |
| G6 | Group renamed | Both | Label updates on next reload; config still points at the same group. |
| G7 | Group deleted | Both | Falls back to Automatic on render and in the intent (iOS stores a dead id). |
| G8 | Group emptied | Both | W21; Who joins? opens app with hint. |
| G9 | Automatic label crosses 18:00 and 08:00 with the widget untouched and offline | Both | Label changes at the boundary. Blocked by QF-M12 (rule isn't in Swift/Kotlin). |
| G10 | Small widget | Both | No audience option; Settings shows "Small widgets have no Who joins? button." |
| G11 | Third-party launcher (Nova) without reconfigure | Android | Settings > Widgets path works. |
| G12 | Widget removed then re-added | Both | Old config gone; Settings list updates on next foreground. |

### 4.4 Stale data

| ID | Case | Expected |
|---|---|---|
| ST1 | No refresh for 30+ min (airplane after loading a friend flare) | Last state shown; countdown keeps ticking from timestamps. |
| ST2 | Flare reaches `expiresAt` offline | Flare disappears at expiry with no network (timeline entry / one-off job). |
| ST3 | Snap reaches 24 h offline | Snap tile empties at expiry. Blocked by QF-S10. |
| ST4 | Midnight offline | Counts reset at 00:00 local. |
| ST5 | "Last drink" offline for 3 h | Relative time correct. |
| ST6 | Friend removes you while their flare shows | Gone on next refresh; tap shows ended. |
| ST7 | Sign out on another device sharing the account | Widget token still valid until revoked; widget keeps working for this device (expected). Document. |
| ST8 | State JSON `v` older or newer than the widget build | Widget shows last good state or W2, never crashes. |
| ST9 | Android Chronometer fallback | Minute text "14 min left" refreshed by the 15-min job. |
| ST10 | iOS reload budget exhausted (burst of 20 flares and snaps) | Notifications still arrive; widget catches up at next allowed reload. Record the time. |

### 4.5 Tap while offline

| ID | Action offline | Expected |
|---|---|---|
| OF1 | +1 Drink, pick | Count up at once, in outbox, syncs later with original time, no duplicate on retries. |
| OF2 | Pick water | Same, still water. |
| OF3 | Who joins? | "Sending…", retry text at 30 s, dropped at 2 min with the failed state. Blocked by QF-S7 (widget outbox only defines logs). |
| OF4 | I'm in | Queued; dropped if the flare closes first, user told on next app open. |
| OF5 | Bring me one pick | Same as OF4; order sent exactly as saved when it does send. |
| OF6 | Snap tile tap | Opens app; cached viewer or retry line. |
| OF7 | Captive portal Wi-Fi | Treated as offline after the 8 s widget timeout. |
| OF8 | Offline, then app force-quit, then online | Outbox flushes on next intent or app open. |
| OF9 | Offline log across midnight | Entry keeps yesterday's `local_date`; today starts at 0. |
| OF10 | Online but server 500 | Same as offline for sends; logs retry forever. |

---

## 5. Notification and Live Activity cases

### 5.1 Notifications

| ID | Case | Expected |
|---|---|---|
| N1 | Each row of `PRD.md` 3.16 table | Default, sound and toggle as specified. Strings from `COPY.md` 5.1. |
| N2 | Flare notification actions | I'm in and Bring me one on both platforms (QF-S9). |
| N3 | I'm in from notification, app killed | Reply recorded, no app UI. Sender notified. |
| N4 | Bring me one from notification | App opens on the picker with #1 preselected. |
| N5 | Flare closes or is cancelled | Notification withdrawn where the platform allows. Android always; iOS best effort, record result. |
| N6 | Rate guard (> 3 flares / 60 min) | 4th and later silent (QF-S1). |
| N7 | Focus / DND on | OS suppresses; no Clink-side suppression. |
| N8 | Flare at 03:00 local | Delivered with sound. Proves no quiet hours. |
| N9 | Reactions from 3 friends | Exactly one notification, silent (QF-M11). |
| N10 | Friend request, invite accepted, invite at cap | Rows 5, 6, 6b. "Accept" action only if PRD adds it (QF-S31). |
| N11 | Rows 7, 7b, 8 in `COPY.md` | Not shipped until PRD adds them (QF-S23). Test absence. |
| N12 | Permission denied | Settings card; re-asked once after the first flare received in app. |
| N13 | Android 13+ prompt | Only after our pre-prompt. |
| N14 | Android channels | Match the decided list (QF-M9). Turning a channel off in system settings stops only that kind. |
| N15 | Payload content | No group name, no counts, no XP, no phone in any push payload (APNs and FCM). |
| N16 | Name over 12 chars | Truncated to 11 + "…". |
| N17 | Flare with photo | Attachment on iOS; BigPicture on Android; only to audience (QF-M1). |
| N18 | Snap notifications toggled on | Snap notifications silent; snaps still update widget when off. |
| N19 | Notification tap routing | Each kind opens the right screen; ended flare opens with "This flare has ended." |
| N20 | Force-stopped Android app | No data messages arrive (OS rule). Document. Widget updates on next open. |
| N21 | Xiaomi/Samsung battery restrictions | Record delivery latency; add an in-app hint only if beta shows it's needed. |
| N22 | Notification for a flare from a blocked or removed user | Never arrives. |
| N23 | Two devices on one account | Both get notifications; replying on one updates the other. |
| N24 | Sign out | No further notifications to that device (token deleted). |
| N25 | Account deleted | Same, plus no notifications about the deleted user to others. |

### 5.2 iOS Live Activity

| ID | Case | Expected |
|---|---|---|
| LA1 | Flare from app | Starts locally at send. |
| LA2 | Flare from widget, app killed | Starts by push-to-start (17.2+). Fails gracefully if no token yet (app never opened since install): flare still sent. |
| LA3 | Live Activities disabled in Settings | Flare works; no error. |
| LA4 | Reply arrives | Count and chips update ≤ 10 s. |
| LA5 | Countdown | Counts to close time, not meet time (QF-M7). Now flare shows 15:00 at send. |
| LA6 | We're going | Final state per `DESIGN.md` 6.1, dismissal time as decided (QF-S28). |
| LA7 | Cancel | Ends and dismisses at once. No "Flare cancelled" lingering (QF-M8). |
| LA8 | Expiry, no replies | Dismisses at once; "Nobody was free" never on lock screen (QF-M8). |
| LA9 | Replace flare | Old activity ends, new one starts. |
| LA10 | Dynamic Island compact, minimal, expanded | Content per `DESIGN.md` 6.1 (QF-S22 for compact text). |
| LA11 | Device without Dynamic Island (i1, i3) | Lock screen and banner only. |
| LA12 | Light, dark, StandBy | Readable; StandBy not designed but must not crash. |
| LA13 | Tap | Opens live flare screen. No buttons. |
| LA14 | Account sign-out during live flare | Activity ends. |
| LA15 | Offline during flare | Countdown keeps going; ends at close locally even if the end push is missed (`staleDate` set to close time). |

### 5.3 Android ongoing notification

| ID | Case | Expected |
|---|---|---|
| ON1 | Send from app and widget | Posted at once, silent, low channel, can't be swiped (ongoing). |
| ON2 | Chronometer | Counts down to close time (QF-M7). |
| ON3 | Reply | Updated in place, no sound. |
| ON4 | Close, cancel, expiry | Removed; nothing left for no-reply flares. |
| ON5 | Notifications denied (13+) | Flare works; no ongoing notification; no crash. |
| ON6 | Android 8 | Channel exists; behaviour same. |
| ON7 | Android 16 Live Update | Only if adopted; Design review before ship. |
| ON8 | App killed during flare | Notification stays and still ends at close (alarm or job at `expiresAt`). |

---

## 6. Time cases

### 6.1 Midnight reset and tracker

| ID | Case | Expected |
|---|---|---|
| T1 | Log at 23:59:30, check at 00:00:05 | Count 0; entry kept in history. |
| T2 | Widget offline over midnight | Resets on time from timeline entry / job. |
| T3 | Fly east across midnight (device TZ changes) | Reset at local midnight of the new zone; no double reset, no negative count. |
| T4 | Fly west (day repeats) | Today's entries don't vanish; reset at next local midnight. |
| T5 | DST forward and back | Reset once per local day. Test in a zone that changes DST near midnight (verify which zones do at build time). |
| T6 | Undo after midnight | Removes only today's newest; yesterday untouched. |
| T7 | Daily log XP across midnight | One +5 per local day of the receiver. |
| T8 | Caffeine note | Resets at midnight; `caff.day` before 17:00, `caff.evening` from 17:00 (COPY). |
| T9 | Last-drink share after 24 h with no drink | Hidden for friends (QF-M17). |

### 6.2 Flare timing

| Timing | Meet | Open until | ID |
|---|---|---|---|
| Now | +0 | +15 min | T10 |
| 5m | +5 | +15 | T11 |
| 15m | +15 | +15 | T12 |
| 30m | +30 | +30 | T13 |
| Other 5, 10 | +5, +10 | +15 | T14 |
| Other 15 | +15 | +15 | T15 |
| Other 20 to 60 | +n | +n | T16 (every value) |
| Other 65 or more | not offered in UI; API rejects | n/a | T17 |
| Device clock 5 min wrong | Close time correct from server time | T18 (blocked by QF-S4) |
| Time zone change mid-flare | Close time unchanged (UTC), display adapts | T19 |
| 12 h vs 24 h | "Meet 10:45" / "Meet 10:45 AM" | T20 |
| Countdown accuracy | Widget, app, Live Activity and ongoing notification within ±2 s of each other | T21 |

### 6.3 Automatic audience

All in the sender's device time zone. Daytime group = Work, other-times group = Home friends, unless stated.

| ID | Local time | Setup | Expected |
|---|---|---|---|
| T22 | Mon 07:59 | both set | Home friends |
| T23 | Mon 08:00 | both set | Work |
| T24 | Fri 17:59 | both set | Work |
| T25 | Fri 18:00 | both set | Home friends |
| T26 | Sat 10:00 | both set | Home friends |
| T27 | Tue 09:00 | no daytime group | Everyone (blocked by QF-M2) |
| T28 | Tue 09:00 | daytime group empty | Everyone (blocked by QF-M2) |
| T29 | Tue 20:00 | no other-times group | Everyone |
| T30 | Composer opened 17:59:50, sent 18:00:05 | both set | Goes where the label said at tap time (QF-S4) |
| T31 | Widget quick flare queued offline at 17:59, sent 18:01 | both set | Same rule as T30 |
| T32 | Sender in a different zone from recipients | both set | Sender's zone decides |
| T33 | Group created manually and named Work, no Settings choice | n/a | Behaviour per QF-S16 decision |

### 6.4 Other timers

| ID | Timer | Expected |
|---|---|---|
| T34 | SMS code | Valid 10 min; expired message at 10:01. |
| T35 | Resend | 30 s. |
| T36 | Lockout | 5 wrong → 15 min (QF-S2). |
| T37 | Send retry text | 30 s. |
| T38 | Flare drop | 2 min. |
| T39 | Snap drop | 60 min. |
| T40 | Picker auto-close | 30 s (QF-M6). |
| T41 | Widget confirmation | About 4 s. |
| T42 | Undo snackbars | 5 s; 10 s with VoiceOver. |
| T43 | Run list | 2 h after close. |
| T44 | Friend request expiry | 30 days (QF-S29). |
| T45 | Invite XP reversal window | 7 days; day 8 deletion keeps XP. |
| T46 | Snap lifetime | 24 h from upload, not from capture (offline queue). |

---

## 7. Invite and deferred deep link cases

Run every "fresh install" case on a device with the app deleted and, on iOS, with clipboard cleared first.

| ID | Case | Platform | Expected |
|---|---|---|---|
| I1 | Share via WhatsApp | Both | Pre-filled `share.msg.whatsapp` with URL. |
| I2 | Share via Messages | Both | iOS iMessage composer; Android default SMS app. |
| I3 | Share via More to Instagram, Telegram, Slack | Both | Message and URL arrive. |
| I4 | WhatsApp not installed | Both | Button hidden; two buttons share the row. |
| I5 | Meter | Both | Counts share taps and Adds, one per button per session (QF-M3). |
| I6 | Tap link, app installed | Both | Opens app on `/i/[code]`; existing user becomes friends (rule 10). |
| I7 | Tap link in WhatsApp, not installed | Android | Play store, install, first launch reads Install Referrer, sign in, friends with inviter, "invited you". |
| I8 | Same in Messages, Telegram, Slack, Instagram in-app browser | Android | Referrer survives each; record failures. |
| I9 | Tap link in WhatsApp, not installed | iOS | Landing page, "Get Clink" copies, App Store, install, first launch shows paste screen, Paste, sign in, friends. Order of screens blocked by QF-M5. |
| I10 | Same from Instagram and Telegram in-app browsers | iOS | Universal links often don't fire there; landing page path works. |
| I11 | iOS user doesn't tap "Get Clink" (goes to App Store some other way) | iOS | No code on clipboard; paste screen hidden or skippable; fallback "Did someone invite you?" after sign-in. |
| I12 | iOS paste prompt | iOS | System Paste control, no "Allow Paste" alert. |
| I13 | Type the code instead | iOS | Works; wrong code shows `err.invite_code`. |
| I14 | Re-tap original link after install | iOS | Opens app and redeems after sign-in. |
| I15 | Link opened before sign-in | Both | Kept and applied after sign-in. |
| I16 | 10 fresh installs per platform | Both | ≥ 9 succeed (AT-3.15-4). Record capture rate on iOS (vendor decision at < 70%, `ARCHITECTURE.md` 6). |
| I17 | Desktop | Web | QR page with inviter first name; QR opens the same URL on a phone. |
| I18 | Inviter at 20 friends | Both | Account created; inviter gets a request and `n.invite_cap`. |
| I19 | Invitee already at 20 (existing user) | Both | Defined behaviour needed (QF-S33). |
| I20 | Inviter deleted | Both | Plain install, no friendship, landing page `web.bad_code`. |
| I21 | Inviter blocked invitee | Both | No friendship, nothing told to either. |
| I22 | Two different invites | Both | Friends with both; +50 only to the first (X5). |
| I23 | Code rotated | Both | Old messages show `web.bad_code`; app keeps working. |
| I24 | Code used 51 times | Both | Must still work per PRD "any number" (QF-S3). |
| I25 | Same invitee opens the same link twice | Both | One friendship, one XP award. |
| I26 | Attribution fails | Both | "Did someone invite you?" with contact matches. |
| I27 | AASA and assetlinks | Both | AASA served as JSON with no redirect; assetlinks lists Play App Signing and upload key SHA-256. Verify with Apple and Google validators. |
| I28 | Dev and prod variants on one phone | Both | Dev links open the dev app only. |
| I29 | Landing preview rate limit | Web | 60/hour/IP then 429; page still offers the store button. |
| I30 | No URL in app | Both | AT-3.15-1. |

---

## 8. XP cap and anti-gaming cases

Values and caps from `PRD.md` 4.2. All checked on the ledger (`xp_events`) and the total.

| ID | Case | Expected |
|---|---|---|
| X1 | Send flares and snaps only | 0 XP. |
| X2 | Reactions | 0 XP. |
| X3 | 11 invitees in one day | +500 (cap 10), 11th earns 0 that day. |
| X4 | Invitee signs up through A, A removes them, re-adds | +50 once, then nothing, ever (QF-M10). |
| X5 | Invitee already had an account | No +50; +10 new-friend at most (QF-M10). |
| X6 | New friends via contacts, 6 in a day | +50 (cap 5). |
| X7 | Join 4 flares from 4 friends | +30. |
| X8 | Join 2 flares from one friend in a day | +10 once (pair cap). |
| X9 | Two friends trade flares all day | Each direction once per day. |
| X10 | Join then withdraw before close | 0. |
| X11 | Join, flare cancelled | 0 for everyone. |
| X12 | Flare replaced | Old flare counts as cancelled: 0. |
| X13 | Flare with 1 reply expires | Sender +15, joiner +10. |
| X14 | 3 flares with replies in a day | Sender +30 (cap 2). |
| X15 | 4 drink-run orders in a day | +60 (cap 3). |
| X16 | 2 orders from the same friend in a day | +20 once (pair cap). |
| X17 | Bring me one cancelled before close | 0 run XP. |
| X18 | Log 6 drinks | +5 once. |
| X19 | Undo the only log | −5 reversal entry (QF-M10). |
| X20 | Undo one of several logs | No change. |
| X21 | Invitee deletes on day 3 | −50 entry, `xp.e.adjust`, names nobody. |
| X22 | Friendship ends on day 5 | −50 entry. |
| X23 | Day 8 deletion | XP kept. |
| X24 | Retry the same settlement | One award (idempotency key). |
| X25 | Concurrent settlements (flare-tick and close-flare at the same moment) | One award (`settled_at` + unique key). |
| X26 | Cap reset | At the receiver's local midnight. |
| X27 | Change device time zone back and forth to reset caps | No extra XP (QF-S14). |
| X28 | Backdated offline log for a past day | No XP for days already passed beyond the allowed window (QF-S14). |
| X29 | Several accounts from one device | Invite XP blocked per the CTO rule (QF-S15). |
| X30 | Level thresholds changed in server config | New level shows without an app release; no push. |
| X31 | Level-up | Dot on profile button; one cross-fade; no push, no share prompt. |
| X32 | XP anywhere but own profile | Absent from widget, friends list, flares, snaps, order card, share messages, notifications (L1 grep + PV cases). |

---

## 9. Store and platform rule checks

| ID | Check |
|---|---|
| SR1 | Sign in with Apple on iOS whenever Google or phone is offered. |
| SR2 | In-app account deletion; Apple token revoked (check Apple's revoke response in logs). |
| SR3 | Report and block on every user photo surface: snap viewer, flare photo, person. |
| SR4 | Play web deletion page linked in listing. |
| SR5 | Privacy labels and Data safety match `PRD.md` 3.17 and what Sentry and push providers receive. |
| SR6 | Notification permission asked only after explainer (both stores' guidance). |
| SR7 | Contacts: limited access on iOS 18 works; purpose strings from `COPY.md`. |
| SR8 | Age rating stays below 17+ (no alcohol drink types in catalog or Add your own suggestions). |
| SR9 | Target SDK meets Play's requirement on submission day (verify). |

---

## 10. Privacy cases

The privacy sweep (L11) runs every endpoint and table as each test user and fails on any forbidden field. Forbidden for anyone but the owner: phone number or hash, drink counts, water, tracker entries, XP, level, group names, group membership, group existence, `flare_audience`, who was removed, which flares were ignored, one-time notes (except the flare sender), last-drink time when not opted in.

| ID | Actor | Target | Expected |
|---|---|---|---|
| PV1 | G (stranger) | A's profile, avatar, usual 3, snaps, flares, last drink | Nothing. Avatar Storage read denied. |
| PV2 | G with A's invite code | invite-preview | First name only (document in PRD 3.17, QF-S12). |
| PV3 | G with A's number in contacts | match-contacts | Name only, and only if A is discoverable (QF-S12). |
| PV4 | I (pending) | A's profile | Name and photo only. No usual 3, snaps or flares. |
| PV5 | J (ex-friend) | Everything of A | Nothing after next refresh. Old signed URLs expire in ≤ 15 min (snaps). |
| PV6 | H (blocked) | Everything of A, contact match, invite | Nothing; can't match or redeem. |
| PV7 | B (friend) | A's XP, level, counts, water, groups, phone | Absent from every response, including `widget-api/state` of B. |
| PV8 | B, not in Work | A's flare to Work | No row in `flares`, `flare_recipients`, Realtime, push or widget state. |
| PV9 | C (in Work) | A's flare to Work | Flare visible; no group name, id or existence in payload, Realtime or `incoming_flares`. |
| PV10 | C | A's flare photo | Visible. B (not in audience) gets nothing (QF-M1). |
| PV11 | C and G co-join A's flare | Each other | Count only. |
| PV12 | B | A's Bring me one one-time note on C's flare | Absent. |
| PV13 | B | A's last drink, sharing off | Absent. On: timestamp only, non-water only. Off again: gone at once (QF-M17). |
| PV14 | B | A's last drink, last drink > 24 h ago | Absent (QF-M17). |
| PV15 | Any | `flare_recipients` of others | Only own row. |
| PV16 | Any | `snap_reactions` on someone else's snap | Only own reaction. |
| PV17 | Any | `reports` | No read access. |
| PV18 | Any | `user_private`, `widget_credentials`, `rate_counters`, `live_activity_tokens`, `invite_redemptions` | No access. |
| PV19 | Widget token | Any endpoint except `widget-api`, or another user's data | Refused. |
| PV20 | Push payloads | All kinds | No group, counts, XP, phone. Notes only in the sender's Bring me one notification. |
| PV21 | Analytics `app_events` | All events | No free text, place, notes, names, phone, contact data. |
| PV22 | Sentry | Crashes and breadcrumbs from screens with notes, place, names | Scrubbed (QF-S13). |
| PV23 | Function logs | All functions | Kind, platform, result only. |
| PV24 | Photos | EXIF GPS | None. |
| PV25 | Contact upload | Network capture | Only SHA-256 hashes; nothing stored server-side after the call. |
| PV26 | Account deleted | Tables and Storage | Nothing left after the job except the documented report retention. |
| PV27 | Group suggestion, group editor, To: picker | Screenshots | "Only you see" text present; nothing implies friends are told. |
| PV28 | Removing a friend | The removed friend | No notification; XP adjustment entry on the other side names nobody. |
| PV29 | Widget on a shared or lock-screen-visible phone | n/a | Shows only own counts and friends' content the user already sees; no XP (expected). |
| PV30 | `flare_view` | As non-sender | Friend names plus "others" count; never non-friend ids. |

---

## 11. Accessibility cases

Target per `DESIGN.md` 7: WCAG 2.2 AA plus platform rules.

| ID | Case | Expected |
|---|---|---|
| AX1 | VoiceOver and TalkBack through onboarding | Every control labelled; order follows `DESIGN.md` 4.x. |
| AX2 | Camera screen reading order | Top bar, viewfinder controls, shutter, chips, place, timing, To:, Who joins?. |
| AX3 | Widget labels | Every element in `DESIGN.md` 5.6 reads its required content. Blocked by QF-M18 (COPY lacks most keys). |
| AX4 | Countdowns | Read at minute precision, never per second. |
| AX5 | Replies arriving on live flare | Announced politely. |
| AX6 | Snackbar Undo | Reachable before timeout; 10 s with VoiceOver. |
| AX7 | Custom actions | Reorder usual 3 (Move up/down), barista next/previous, snaps newer/older. |
| AX8 | Heroes and icons next to names | Hidden from screen readers. |
| AX9 | Largest accessibility text size | No clipping or overlap in any app screen; layout switches per `DESIGN.md` 2.4. |
| AX10 | Widgets at large text | Lines drop in the specified order; buttons and counts stay. |
| AX11 | Bold Text / font weight adjustment | Weights step up; nothing truncates. |
| AX12 | Contrast | All text ≥ 4.5:1 on base, tints, solids, scrims; non-text ≥ 3:1. Spot check with Accessibility Inspector and a contrast tool on each category in both modes. |
| AX13 | Increase Contrast | Token swaps per `DESIGN.md` 7. |
| AX14 | Colour-blind filters | Categories, selection, errors, water distinguishable by glyph or text. |
| AX15 | Tinted and clear widgets | Category still identified by glyph and name. |
| AX16 | Reduced motion | Pour, clink, count roll and sheets per `DESIGN.md` 2.9. |
| AX17 | Reduce Transparency | Camera control discs solid. |
| AX18 | Touch targets | 44 pt / 48 dp everywhere, including widgets and the Android 2x2 picker. |
| AX19 | Switch Control / external keyboard | Visible focus ring; no focus on hidden items. |
| AX20 | Show to barista | Sizes never shrink; scales to 1.5×; scrolls; 21:1. |
| AX21 | Haptics | Never the only signal. |
| AX22 | Other picker | Grid cells readable and selectable with a screen reader (no spinner). |
| AX23 | Notifications | Titles and bodies make sense read aloud; no emoji except reaction notifications. |
| AX24 | Live Activity | Reads the same sentence as the widget's live flare label. |
| AX25 | Accessibility Scanner (Android) and Xcode audit | No unlabeled controls, no small targets. |

---

## 12. Copy and brand checks (CEO guidelines)

| ID | Guideline | Check |
|---|---|---|
| CB1 | 1 Unique look | Design QA checklist in `DESIGN.md` 1.4 on every screen and widget state. Prototype visuals gone (`PRD.md` 7 stage 1 exit 5). |
| CB2 | 2 Drink pictures | Contact sheet of all icons and heroes, light and dark, reviewed by Design; 48 pt hallway test passes for heroes. |
| CB3 | 3 Human words | De-slop grep on the full string table; manual read-through of every screen by Copy. |
| CB4 | 4 UX | Tap budget (3.0) and beta exit 4. |
| CB5 | 5 No quiet hours | L1 grep, Settings check, DB schema check (no column), server check (no time-based suppression). |
| CB6 | 6 No visible link | AT-3.15-1, screenshots of every invite surface; "More" opens the share sheet. |
| CB7 | 7 Top 10 | L3 count per category. |
| CB8 | 8 Smoothie & Juice | Exact label everywhere the category name shows; sentence forms use `wants`/`label`. Grep for "Juice" as a lone category label. |
| CB9 | 9 XP private | X32 and PV7. |
| CB10 | 10 Android | Every suite runs on Android. |
| CB11 | Emoji | Only reactions, user group emoji and the notes marker. |
| CB12 | Exclamation marks and em dashes | Zero in the string table. |

---

## 13. Release exit criteria

These add QA gates to `PRD.md` section 7. They don't replace its business exit numbers.

### 13.1 Internal build → closed beta

1. Every `MUST FIX` item in section 14 closed in the docs, and its tests unblocked.
2. All `AT-*` rows pass on the core four devices, or have a triaged bug that isn't P0/P1.
3. Zero open P0. Zero open P1 in: privacy, audience, order details, XP privacy, sign-in, deletion.
4. Privacy sweep (L11) clean on `clink-dev` with the beta build. Security review signed.
5. Widget states W1 to W22 signed off on the full matrix (section 2).
6. Push latency (L12) meets targets on i1, i4, a1, a6, a7 on Wi-Fi and LTE.
7. Deferred deep link ≥ 9 of 10 on each platform (I16).
8. Accessibility: no P0/P1 open from section 11.
9. De-slop grep clean; Copy signed off every screen.
10. Store compliance checklist (section 9) passed for TestFlight external review and Play closed testing.
11. Crash-free sessions ≥ 99.5% across internal use for the last 7 days, with at least 200 sessions per platform.

### 13.2 Closed beta → public release

1. `PRD.md` 7 stage 2 exit criteria met.
2. Full matrix regression on the release candidate build, including OEM (a6, a7) widget and push behaviour.
3. Privacy sweep clean on `clink-prod` with production RLS, run after the final migration.
4. No P0 or P1 open, and no P0 found in the last 7 days of beta.
5. Every beta bug tagged privacy, audience or order details has a regression test.
6. iOS invite capture rate measured; vendor decision made if under 70% (`ARCHITECTURE.md` 6).
7. XP thresholds checked against beta data (`PRD.md` 7 stage 2 exit 6); cap tests rerun after any change.
8. Report queue answered in under 24 hours for the whole beta; the right report confirmation string ships (`COPY.md` 4.19).
9. Rollback rehearsed: an EAS Update rollback and a server migration rollback on `clink-dev`.
10. Store listings, privacy labels and Data safety form re-checked against the shipped build's real traffic (push providers, Sentry).

### 13.3 After launch (staged rollout)

1. Each rollout step (Android 10% → 50% → 100%, iOS phased) waits 24 h with crash-free ≥ 99.5% and no new P0.
2. Privacy sweep reruns on every migration and every OTA that touches data access.

---

## 14. Spec issues found while writing this plan

Full detail with exact fixes is in the QA findings returned to the Head of Product. Short list for test references:

**Must fix**
- QF-M1 Flare photos stored as snaps rows are readable by all friends.
- QF-M2 Automatic audience fallback differs between PRD and ARCHITECTURE.
- QF-M3 Invite meter counts redemptions in ARCHITECTURE, taps in PRD/DESIGN.
- QF-M4 Sign-in options: PRD and DESIGN say two, ARCHITECTURE and COPY add a third.
- QF-M5 iOS "Got an invite?" screen has no place in the onboarding spec or DESIGN.
- QF-M6 Picker timeout 30 s vs 20 s.
- QF-M7 Android countdown targets meet time instead of close time.
- QF-M8 COPY puts "Nobody was free" and "Flare cancelled" on the Live Activity.
- QF-M9 Two notification toggles have no storage; Android channel list doesn't match.
- QF-M10 XP ledger can't record new-friend XP, reversals or once-per-pair-ever.
- QF-M11 Reaction notifications can fire more than once per snap.
- QF-M12 Widget state JSON and fixtures can't render several PRD/DESIGN states.
- QF-M13 iOS app can't change a widget's audience from Settings.
- QF-M14 DESIGN and COPY drink lists and ids differ.
- QF-M15 Option sets differ between PRD, COPY, DESIGN and ARCHITECTURE.
- QF-M16 DESIGN says undo, COPY says confirm, for five actions.
- QF-M17 Last-drink sharing: no 24 h hide, no removal when turned off.
- QF-M18 COPY lacks most accessibility label strings DESIGN requires.
- QF-M19 Other picker: wheel with Set button in COPY, grid in DESIGN.
- QF-M20 PRD analytics events can't be recorded under the ARCHITECTURE `app_events` check.

**Should fix**
- QF-S1 Flare rate limits and the silent guard.
- QF-S2 OTP lockout rule.
- QF-S3 Invite code use cap.
- QF-S4 Server-computed meet time and tap-time audience.
- QF-S5 Quick flare from a stale widget while a flare is live.
- QF-S6 Server-side enforcement of PRD length limits.
- QF-S7 Widget outbox for flares and replies.
- QF-S8 iOS widget updates when flare alerts are off.
- QF-S9 Notification actions on iOS.
- QF-S10 Snap expiry on widgets.
- QF-S11 Widget-added detection.
- QF-S12 Privacy table gaps (contact match, invite preview, pending requests).
- QF-S13 Sentry scrubbing.
- QF-S14 XP time-zone and backdating abuse.
- QF-S15 Account abuse checks undefined.
- QF-S16 Manually created Work group isn't used by Automatic.
- QF-S17 Weekday definition for Automatic.
- QF-S18 Preset count.
- QF-S19 Onboarding progress label.
- QF-S20 Tracker chip copy.
- QF-S21 Widget failed state text and behaviour.
- QF-S22 Dynamic Island compact text.
- QF-S23 Notifications 7, 7b, 8 not in PRD.
- QF-S24 DESIGN elements with no COPY string, and COPY strings with no DESIGN element.
- QF-S25 iOS 17 widget steps.
- QF-S26 iPhone SE widget sizes.
- QF-S27 Deletion re-auth taps.
- QF-S28 Live Activity dismissal times.
- QF-S29 Friend request expiry job.
- QF-S30 Dev-only server clock for tests.
- QF-S31 Friend request notification action.
- QF-S32 Sender's widget after "We're going".
- QF-S33 Existing user at 20 friends opens an invite.
- QF-S34 Tracker "Something else" row.
- QF-S35 ARCHITECTURE test coverage excludes F23 and F31.
- QF-S36 Report reasons and targets in the database.
