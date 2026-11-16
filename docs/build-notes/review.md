# Build notes: review (QA and security pass)

Written 2026-11-16 on branch `build/foundations`. Scope: run everything, check the CEO guidelines in code and art, spot-check RLS and functions against the `RISK_REVIEW.md` must-fixes that apply to what exists, fix what fails.

## Results (final run)

| What | Command | Result |
|---|---|---|
| Clean install | `npm ci` | pass, one copy of React (19.3.0) |
| Typecheck, both workspaces | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass, 0 errors, 0 warnings |
| Format | `npm run format:check` | pass |
| Catalog and strings in sync with COPY.md | `npm run check:gen` | pass (42 drinks, 813 strings) |
| Drink icons | `npm run check:icons` | pass (84 icons, 151 KB) |
| Jest, shared and app | `npm test` | 20 suites, 326 tests pass |
| Art gallery | `npm run test:art` | 13 of 13 pass |
| All of the above | `npm run ci` | exit 0 |
| Web export | `npm run export:web` | pass |
| pgTAP (Postgres 16 cluster under `/tmp/clink-qa`) | `PGHOST=/tmp/clink-qa PGPORT=55450 PGUSER=postgres npm run test:db` | 11 files, 311 tests pass |
| Races | `bash supabase/tests/concurrency/races.sh` | 2 of 2 pass |
| Edge functions (Deno 2.9.6 from `npm i deno` in a scratch folder) | `deno test --allow-env --allow-net tests/`, `deno lint`, `deno check */index.ts` | 12 of 12 pass, lint and types clean |

## What I fixed

1. **27 app render tests failed: two copies of React.** `app/package.json` pins `react` 19.3.0 (Expo SDK 58's bundled version) but the lockfile had hoisted 19.3.1 to the root. Fixed with root `overrides` (`react`, `react-dom` = 19.3.0) and by re-resolving the two stale lockfile entries. `npm ls react` now shows one version. Chosen over a Jest `moduleNameMapper` because Metro and Jest then both see the one React.
2. **Lint error** in `app/assets/art/icons/_source/draw-icons.mjs`: a duplicate `fill` key, plus two unused variables. The later `fill` was the one that took effect (the spread sets `fill: none`), so I kept it and removed the earlier one. All 84 icons came out byte-identical.
3. **Format check failed** on the icon sources (now formatted) and on `docs/art/icons-sheet.html`, which is generated. `docs/art/*.html` is now in `.prettierignore`.
4. **21 user-facing strings lived outside COPY.md**, in `app/src/lib/pendingCopy.ts` (CLAUDE.md: every string comes from a COPY.md key). Changes:
   - Added the keys to COPY.md: `onb.phone.added` (4.3), `compose.auto_tag` (4.5), `usual.preset_set` (4.14), `today.logged` (4.15), `profile.level_n`, `profile.total` (4.16).
   - Added a new **4.27 Time formats** section with the `fmt.*` keys, plus a pointer from 0.2. They had to go in section 4 because gen-strings reads generic tables only from sections 4 to 6.
   - `friends.req.sent` ("Request sent") is the same row state as the existing `contact.requested` ("Requested"), so the caller uses that key instead. COPY wins over DESIGN 4.3's wording.
   - Every caller now uses `t()`, and `pendingCopy.ts` is deleted.
5. **"Last drink just now ago".** The screens' `{ago}` gave "just now" under a minute, but `today.last`, `friends.last_drink` and `wm.last` all read "{ago} ago". PRD F9 keeps "just now", so I added `today.last_now`, `friends.last_drink_now` and `wm.last_now`, and `lib/format.ts` `agoLine()` picks the right one. A shared test now requires every "{ago} ago" string to have a `_now` key. "just now" is 8 characters, so the `{ago}` budget in 0.2 went from 7 to 8. That pushes `ws.last` to 13/12 and `wm.snap` to 23/22, which I added to the COPY 9 overrun list for Design. "just" here means recency, not the banned softener, so it was added to the reviewed exceptions in `strings.test.ts`.
6. **New tests:** `app/src/lib/format.test.ts` (`{ago}`, `agoLine`, spoken durations, `{mins}`), and the `_now` rule in `strings.test.ts`.
7. **CI gaps that other units' notes had asked for.** Added root scripts `check:gen`, `check:icons` and `test:art`, and folded them into `npm run ci`. `.github/workflows/ci.yml` now runs them in the `js` job. The `pgtap` job now also runs the races, then `deno lint`, `deno check` and `deno test` against the same database through `denoland/setup-deno@v2`. The YAML parses, but **it has not run on GitHub (verify)**.

## CEO guidelines, checked

| # | Check | Result |
|---|---|---|
| 5 | No quiet hours: grep across code, SQL, strings | None. Only a comment and the tests that assert none exist (pgTAP `no quiet-hours column`, string test). |
| 6 | No visible invite link | `InviteShare.tsx` shows only WhatsApp, Messages and More. The URL goes only into the share message (`platform.ts openShare`). No string pairs "link" with an invite (string test). |
| 7 | Top 10 per category | Catalog: coffee 10, matcha 10, tea 10, smoothie_juice 10, plus water 2 (logs only). |
| 8 | "Smoothie & Juice" | `cat.smoothie_juice` = "Smoothie & Juice". |
| 9 | XP private | `xp_events` and `xp_totals` have own-row SELECT only. No `profiles` column, view or function returns XP or level. `flare_view` and `incoming_flares` return no XP or counts. The client API has only `getXp()` for the caller. |
| 3, 1.3 | No banned words, no hard-coded strings | Banned list (79 terms) enforced by test. No-literal lint rule passes. `pendingCopy.ts` removed (above). The only emoji in app code are sample user-picked group emoji in the mock, which COPY 0.3 allows. |
| 1 | No cream, serif or terracotta, no purple gradients | Nothing in `ui/theme`. The only gradient is the photo scrim from DESIGN 3.6. |

## Security spot-check (applies to what exists)

Probed the migrated database directly as well as reading the tests.

- **M-01:** `public` holds only two definer functions (`flare_view`, `incoming_flares`), both `search_path=''` and executable by `authenticated` only. In `private`, `authenticated` can execute only `app_now`, `are_friends`, `is_blocked` and `is_suspended`, and `anon` none. `are_friends` and `is_blocked` answer only when the caller is one of the two ids. The only view is `private.open_reports`. RLS is on for all 26 public tables, and every policy uses `(select auth.uid())`.
- **M-02:** `flare_photos` is a separate table and bucket. Its SELECT needs a recipient row, a friendship, no hide, and the 2 h window.
- **M-03:** flare and photo visibility need friendship, no suspension, and `coalesce(ended_at, expires_at) > now - 2 h`. Blocks remove recipient rows (tested).
- **M-04:** an existing account gets `needs_confirm` and nothing is written (tested).
- **M-05:** `complete-signup` refuses under 16 and leaves no account (Deno test).
- **M-09:** the deletion cascade covers rows, files, push devices, audit log rows and invite XP reversal (pgTAP and Deno).
- **M-16:** `register-device` signout is tested.
- **M-17:** bucket limits are set (`avatars` 1 MB, `snaps` and `flare-photos` 1.5 MB, JPEG only).
- **No-shame rules:** `flare_responses.kind` allows only `in` and `bring`. No decline, seen, viewer or ignored columns exist; the only `seen_at` is on the user's own moderation notices.
- **`flare_view`** names only mutual friends (others are a count) and never returns another person's Bring me one order.
- **Edge functions:** strict zod schemas with no user id in the body, caller from the verified JWT (HS256 pinned, audience checked, anonymous refused). Logs carry only error codes or HTTP status. No secrets in `app.config` `extra` and no `EXPO_PUBLIC_*`.

## What remains, and why

- **No real Supabase stack:** `supabase db lint`, the security advisor and `supabase test db` are not run. Images can't be pulled here (see `database.md`).
- **The CI additions haven't run on GitHub** (no remote run from here).
- **`private.is_suspended(u)` answers for any id**, unlike the other helpers. It's low risk: `private` isn't exposed through PostgREST, and the policies need it for other users' ids. Keep `private` out of the API's exposed schemas **(verify at project setup)**.
- **Web review build:** `openShare` returns true on web without sharing, so `recordInviteShare` fires against the mock. Native is unaffected. Fine for review, but don't ship web sharing this way.
- **Some a11y labels join keyed strings in code** with ", " or ". " (for example `${name}, ${t('contact.requested')}`). This is fine in English. Translation (COPY 8) will need whole-sentence keys.
- **For the Words owner:** please review the wording of the new keys listed above (4.3, 4.5, 4.14 to 4.16, 4.27, the `_now` lines and the `{ago}` budget change).
- **For the screens owner:** `docs/build-notes/screens.md` still lists `pendingCopy.ts` and "Strings Copy needs to add". All of that is done now. I left the file alone because that unit owns it.
- **Not checkable yet:** no Swift or Kotlin code exists, so widget fixture decoding in Swift and Kotlin can't be tested. Device, large-text and screen-reader passes need hardware. Must-fixes for later milestones (M-06 image screening, M-10 web deletion page, M-11 export, M-12 to M-15 legal and store, and the `snap-cleanup` part of M-17) have nothing built to check yet.
- **`npm audit`:** moderate findings in transitive Expo toolchain packages, not forced (as `scaffold.md` says).
- **Carried over from `database.md`:** the avatar 10-a-day limit isn't enforced, and `private.install_history` needs a retention row in ARCHITECTURE 4.8.

## Polish pass review: Android widget and widget backend (2026-11-16)

Independent Design Director and QA pass over the widget polish pass (`android-widget.md` and `widget-backend.md`, both "Polish pass" sections). I didn't write that work. I looked at `overview.png`, the `before/` set, all 134 renders and both art sheets, read the layout code, and checked the spec points below.

### Fixed

- `ARCHITECTURE.md` 3.2: the error bullet said `malformed` and `stale` codes "drop" the op, which contradicted the outbox table ("log: never dropped") and the Kotlin code. It now says a log moves to the widget's `rejected` list for the app to report.

### Spec checks

| Check | Result |
|---|---|
| Logs never dropped, Kotlin | `model/Outbox.kt`: a log retries forever, and a malformed refusal moves it to `rejected`, never deletes it. `SyncTest.theKotlinErrorTableMatchesWidgetApiErrors` parses the shared table, so the two can't drift. |
| Logs never dropped, server | `0020_log_time.sql` clamps `loggedAt` into [now − 90 days, now] in `widget_log_drink` and in the `drink_logs` trigger. No time-based refusal is left. |
| Unknown keys tolerated | `widgetStateReadSchema` in the app; the Kotlin decoder ignores unknown keys (`DecoderAndResolveTest`). The server stays strict. |
| allowBackup | The merged manifest (`./gradlew :app:processDebugMainManifest`) has `allowBackup="false"` and `dataExtractionRules="@xml/clink_data_extraction_rules"`. The rules exclude every domain for cloud backup and device transfer. |
| Sign-out retry | `signout_pending` holds only the install id. A transient failure keeps it, and it's sent before the next `register-device`. |
| CORS | Exact allow-list from `projects.json`, no wildcard, 403 for any other origin, `Vary: Origin`. It applies only to the three app-facing functions. |

### Design verdict

The split 4x2 (counts on enamel, the usual #1 on its own tinted panel with its ink rim, and Who joins? in the drink's solid under the drink it sends) reads as Clink, not as a stock widget. It's a clear step up from `before/`. Nothing is cut at font 1.0, 1.3 or 2.0. All text pairs pass DESIGN.md 7: the lowest is `danger` on the cobalt tint at 5.6:1, and `ink.secondary` on enamel is 7.1:1 (light) and 8.3:1 (dark). "Last drink 7:30 AM" is clear on the 4x2. "Last 7:30" on the 2x2 is clear enough for today's drinks.

### Remaining issues, ranked by what a demanding CEO notices first

1. **The usual 4x2 size probably gets the short layout.** On Android 12+ the platform picks the fitting size closest to the real one, by square distance. A 330 × 155 dp 4x2 is under the 160 dp height of `MEDIUM` and `MEDIUM_WIDE`, so it gets `MEDIUM_SHORT` (250 × 120) stretched. That layout has no "drinks" word ("3 ◦ 4"), no last-drink line and no camera (`w4-idle-medium-short-light.png`). Fix: lower the 4x2 height breakpoints to about 140 dp after measuring the real Pixel launcher size on the CEO's emulator **(verify)**. Owner: Android. `ClinkWidget.kt:50-52`.
2. **Flare countdowns read like clock times**, which is the same complaint the CEO made about "1:42:00". "Coffee, in 14 min" sits over a big "14:00" (`w9-my-flare-*`). The 2x2 shows "Maya 13:00" with no "left" (`w11-incoming-small-*`, `w15-replied-in-small-*`). Fix: minute text ("14 min left") or a label on every countdown. Owner: Design and Copy (DESIGN.md 5.1 Time, `ws.in.left`).
3. **Dark-mode drink art merges.** White enamel with the `#EEF2F5` outline (DESIGN.md 3.6 outline rule) turns the cup and saucer into one pale blob: Flat White on the idle panel (`w4-idle-medium-dark.png`) and the whole coffee row of `art-sheet-dark.png`. Owner: Design (art). A darker enamel or a dark separating line in dark mode would fix it.
4. **The 2x2 picker has pictures only**, and Espresso, Macchiato, Flat White and Cappuccino are nearly the same small cup on a saucer (`art-sheet-light.png`). A usual 3 of three coffees can't be told apart there. Owner: Design (stronger per-drink marks), or keep the names when two usual drinks share a silhouette.
5. **The snap caption fails contrast.** DESIGN.md 3.7 sets the scrim from 0% at 45% of the height to 64% at the bottom, then says text in the bottom 40% sits on "at least 60%". At 60% of the height the scrim is only about 17%. Measured behind "Leo · 38m" in `w3-idle-snap-medium-light.png`: 2.9 to 4.7:1. Over a white photo it can drop to about 1.5:1, against the 4.5:1 rule. This also affects the app's snap tiles. Owner: Design (fix 3.7), then `gen-android-colors.mjs` `clink_bg_scrim`.
6. **No ✕ on the 250 dp 4x2 picker** (`w8-picker-medium-light.png`). Only the wide 4x2 has one. DESIGN.md 5.2 asks for a 44 pt ✕, and only the 2x2 exception is written down (5.3). A user who opened it by mistake waits 30 s or taps a 12 dp margin. Owner: Android and Design. `WidgetContent.kt:850` (`close = model.layout.wide`).
7. **Rejected logs are never read.** Nothing in `app/src` calls `takeRejected()` or reads `getOutbox().rejected`, so a refused log sits in the widget store and the user never hears of it. Owner: Wire unit (`app/src/lib/widget/sync.ts`).
8. **At font 2.0 the 2x2 friend's flare loses what is wanted**: only "Maya 13:00" and I'm in remain, with no "Matcha" (`w11-incoming-small-light-font200.png`). Owner: Android and Design (drop order: the countdown before the drink).
9. **Your live flare on the 2x2 says "0 in"** (`ws.live.counts`), while the 4x2 says "No replies yet". Showing a zero to the sender is close to the no-shame rule. Owner: Copy (add a `ws.live.none`).
10. **After 4 caffeinated drinks the panel turns tea but Who joins? stays coffee brown** (`w7-*`). It's documented, but it looks like a bug. Owner: Design.
11. **Small misalignments.** On the short 4x2 the water count sits about 5 dp below the numeral's baseline (`w4-idle-medium-short-light.png`). In the medium picker, Water is drawn about twice the height of Jasmine Tea, because the crop fills the box by height (`w8-picker-medium-light.png`). Owner: Android.
12. **Offline sign-out leaves the push device row** until the next signed-in launch (ARCHITECTURE.md 3.6 step 3), so friends' flare notifications, with names and places, can still reach a signed-out phone. Owner: CTO and Risk. Our own FCM service could drop messages while signed out.
13. **The snap tile without a thumbnail** (a camera glyph under a scrim) looks like a broken image until thumbnails arrive in M3 to M5.

### Results

| What | Command | Result |
|---|---|---|
| Widget harness | `app/android/gradlew -p app/modules/clink-native/android/standalone testDebugUnitTest --rerun-tasks` (JDK 17) | 50/50, 0 failures |
| Merged manifest | `cd app/android && ./gradlew :app:processDebugMainManifest` | `allowBackup="false"` and the extraction rules are present |
| Repo | `npm run ci` | green (Jest 492/492, script tests 17 and 22) |
