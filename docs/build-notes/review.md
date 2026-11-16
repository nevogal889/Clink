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
