# Build notes: screens (`app/src`)

Unit: UI/UX and front end. Paths: `app/src/**`, `app/assets/fonts/**`, this file, and the review screenshots in `docs/screens/`. Written 2026-11-16. This run finished the work an earlier run started (theme, sign-in, name step and the data layer were already in place).

## What exists

| Route (`app/src/app`) | Spec | Notes |
|---|---|---|
| `sign-in.tsx` | DESIGN 4.1, PRD 3.1 | Shelf of the five heroes, tagline, Apple (iOS look) or Google (Android look), phone, "Other ways to sign in" sheet, legal line. All go straight to the mock. |
| `onboarding/name.tsx` | 4.3 step 2 | Name (pre-filled from the provider), optional photo through the system picker. |
| `onboarding/usual.tsx` | 4.3 step 3, 4.14 | Presets first, then slots and the catalog with sticky category tabs and the hero header. Continue disabled until one drink, with the reason under it. |
| `onboarding/invite.tsx` | 4.3 step 4, PRD 3.15 | Two-ring meter (clink at 2 of 2), WhatsApp, Messages and More only. No URL, link preview, copy button or "Invite link" label. Contacts row, optional phone row for Apple and Google users. Later / Continue. |
| `onboarding/notifications.tsx` | 4.3 step 5 | Explainer with two platform-style example notifications. The system prompt runs only after Continue. |
| `onboarding/widget.tsx` | 4.3 step 6 | 3-step guide per platform (iOS 17 vs 18+ strings), "I added it" checks, retry state with "Skip for now". |
| `camera.tsx` | 4.4 to 4.6 | Top bar, viewfinder placeholder, shutter row (photo-taken state: Retake / Share snap), flare panel, To: picker, Other picker, live flare bar, widget notice, invite sheet, tracker sheet. |
| `profile.tsx` | 4.16, PRD 3.13, 4.5 | Private level, progress, "Only you can see your level", How XP works, last 20 XP rows, Edit name and photo, My usual 3. No share button. |
| `usual.tsx` | 4.14 | The same editor outside onboarding; changes save as they happen. |
| `settings.tsx` | 4.17 (part) | Profile, My usual 3, Sign out. Only rows that work today. |
| `widget-guide.tsx` | 4.4 "Widget not added" | The step 6 guide from the camera notice. |

Feature code: `features/usual/UsualEditor.tsx` (slots with drag and Move up / Move down actions, presets, catalog), `features/usual/DetailsEditor.tsx` (Make it yours), `features/tracker/TrackerSheet.tsx`, `features/camera/*`, `features/invite/InviteShare.tsx`, `features/onboarding/*`.

Data layer: `lib/api/types.ts` is the contract, `lib/api/mock.ts` the in-memory implementation, `lib/api/index.ts` picks it. Added `shareSnap` and a store `signOut`. Supabase replaces `createDefaultApi()` and nothing in the screens changes.

## Review build

```
npm run export:web -w @clink/app        # writes app/dist (gitignored)
# serve app/dist with an SPA fallback to index.html, then:
#   /                      new user, starts at sign-in
#   /?mock=setup           finished setup with sample data (camera, tracker, profile)
#   any URL + &look=android   Android shapes, gutters and the Google button
```

Screenshots: `docs/screens/NN-name-{light,dark}.png`, 390 x 844 at 2x, 26 states per theme, taken with Playwright against the export. Each was looked at; the revision pass is below.

## Commands and results (2026-11-16)

| Command | Result |
|---|---|
| `npm run typecheck -w @clink/app` | pass |
| `npx eslint app/src` | pass (no-literal-text rule included) |
| `npx prettier --check "app/src/**/*.{ts,tsx,mjs}"` | pass |
| `npx jest` for the app with the one-React mapping below | 10 suites, 58 tests pass |
| `npx jest --selectProjects app` with the current `app/jest.config.js` | 27 of 58 fail: two copies of React (see "For other units", item 1) |
| `npx expo export --platform web` | pass, 17 bundles |

Tests: `app/src/app/onboarding.flow.test.tsx` (the real route files under `renderRouter`: all six steps, skip paths, resume on step 4, notification prompt only after Continue, camera defaults, Who joins? in one tap, Other 5 to 60, To: picker, no-friends and empty-audience states), `features/usual/DetailsEditor.test.tsx`, `features/tracker/TrackerSheet.test.tsx`, `lib/usual.test.ts`, `lib/tracker.test.ts`, `lib/xpHistory.test.ts`, `features/camera/audience.test.ts`, `ui/art/art.test.ts` (generated art is fresh, every drink has both icon sizes).

## Decisions (one line each)

- **Flare panel hero sits right of the chips and place field**, not of the place and timing rows: five timing pills with 44 pt targets do not fit beside a 112 pt hero on a 390 pt phone.
- **"Make it yours" sits under the drink name** in each slot; on the right it squeezed names onto two lines.
- **Group names may truncate on the To: chip** with the Auto tag beside them, like place names (DESIGN 2.4 allows ellipsis for user-entered names); the picker shows them in full.
- **Spare height on tall phones goes around the shutter**, so the viewfinder stays full width and no band opens above the panel.
- **The root snackbar sits above the focused screen's action area** (`useSnackbarInset`) and a sheet's snackbar above its footer, so Undo never covers Continue, Done or Who joins?.
- **Quick-log tiles are flat `surface.sunk` enamel** with no outline, so the row doesn't read as a strip of cards.
- **The sign-in shelf is as tall as the heroes standing on it** (about 40% of the width each, overlapping), with shelf and tagline centred in the space above the buttons. DESIGN's "50% of screen height" can't show all five heroes on a phone.
- **Settings shows only rows that work** (Profile, My usual 3, Sign out). The rest arrive with M3 to M5.
- **Sheets are one JS component** (`ui/Sheet.tsx`) standing in for iOS detent sheets and M3 bottom sheets, so the web review works. Native builds should swap it in that one file.
- **The tracker shows "Logged {drink}" with Undo** after a quick log, so a mis-tap is one tap to fix.
- **Tokens live in `app/src/ui/theme/`** (one file per group), not `app/src/ui/tokens.ts` as DESIGN 2 says. Swift and Kotlin still need the JSON export the CTO picks.
- **Web look switch**: `?look=android` selects Android shapes on the web build only; native builds use their own OS.

## Revision pass (from the screenshots)

Fixed after looking: the category hero vanished after a switch (an `Animated` stop in the effect cleanup cut off the fade-in); slot rows squeezed names; the snackbar covered Continue and Done; a 60 pt dead band between the shutter and the panel; Retake sat on the top edge of its row; contact "Add" buttons were top-aligned; the sign-in shelf left an empty half screen; the camera could read its defaults before the data loaded (it now waits).

## Strings Copy needs to add (COPY.md owner)

Kept in `app/src/lib/pendingCopy.ts` under the key we propose, read with `pt()`. Move each to COPY.md, regenerate, switch the caller to `t()`, delete the entry.

| Proposed key | Text | Where |
|---|---|---|
| `fmt.ago.*`, `fmt.mins.*`, `fmt.mins_cap.*`, `fmt.words.*` | "just now", "12m", "1h 42m", "now", "in 5 min", "Now", "In 10 min", "1 hour 42 minutes" | COPY 0.2 describes the formats but gives no keys |
| `compose.auto_tag` | Auto | Tag on the To: chip (DESIGN 4.5) |
| `usual.preset_set` | Set to {preset}. | Undo snackbar after a preset (DESIGN 4.14) |
| `today.logged` | Logged {drink} | Undo snackbar after a quick log |
| `profile.level_n` | Level {n} | Above the level name (DESIGN 4.16); COPY only has "Level {n} · {level_name}", used here as the screen reader label |
| `profile.total` | {xp} XP | Right of the progress line |
| `friends.req.sent` | Request sent | Contact row after Add (step 4) |
| `onb.phone.added` | Number added. Nobody sees it. | Step 4 after the optional number |

Also for Copy: DESIGN 4.15 says the tracker caption is "Only you see this"; the screen uses COPY's `today.footer` ("Only you see this. It resets at midnight."). COPY wins; DESIGN could be updated.

## For other units

1. **Scaffold / CTO, blocking CI for app render tests.** `app/package.json` pins `react` 19.3.0, so npm installs it in `app/node_modules`, while everything else (react-native, expo-router, the test renderer) gets 19.3.1 at the root. Metro already resolves one React, so the web build is fine; Jest loads two and every render test fails with "Cannot read properties of null (reading 'useRef')". Fix one of two ways: add to `app/jest.config.js` `moduleNameMapper`: `'^react$': '<rootDir>/node_modules/react'` and `'^react/(.*)$': '<rootDir>/node_modules/react/$1'`, or align the pin so npm dedupes. The 58 tests pass with the first fix applied through a temporary config.
2. **Native camera.** The viewfinder is a placeholder on every platform and the shutter makes a stand-in still. Wire `expo-camera` (or the native module) in `features/camera/Viewfinder.tsx`; the photo-taken state and Share snap already run through `api.shareSnap`.
3. **Haptics** go through `lib/platform.ts` `playHaptic()`, which does nothing until `clink-native` exists (DESIGN 2.10).
4. **Sign-in buttons** are stand-ins with the providers' colours and words. Device builds use `expo-apple-authentication` and Google's button (brand rules).
5. **Phone parse** in step 4 is a loose shape check (`lib/phone.ts`); libphonenumber and the 4.2 screens are still to build.
6. **Supabase**: implement `ClinkApi` (`lib/api/types.ts`). The server owns time; the client sends `timingMin` and `tappedAt` only.
7. **Fonts**: Archivo static cuts are in `app/assets/fonts` with `OFL.txt`; the licences screen (Settings, Help) must show it. Check `tnum` in the shipped cuts at build time (DESIGN 2.4).

## Not done here, and why

- Screens outside this brief: live flare (4.7), incoming flare (4.8), Bring me one (4.9), order ticket (4.10), snaps viewer, friends sheet, groups, full Settings, privacy, report and block, delete account, invite check (4.1a), age check (4.1b), phone and code (4.2). The camera links only to screens that exist; the friends pill opens the invite sheet for now.
- Offline pill and the "Couldn't send" 30 s / 2 min timers: the mock never goes offline, so only the failed-send caption is wired.
- Large-text, VoiceOver and TalkBack passes need devices. Layouts wrap and scroll (timing pills and option chips wrap, the camera screen scrolls), but nothing was checked at accessibility sizes.
- The add-widget illustrations are still frames; the looping versions need the real widget renders (M2).
- Native detent sheets and Android full-screen editors: `ui/Sheet.tsx` is the single place to swap them in.
