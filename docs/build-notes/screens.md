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
#   any URL + &text=max       every text style at the largest accessibility size (review only)
node docs/screens/capture.mjs           # all states, light and dark, into docs/screens
node docs/screens/capture.mjs 13 21     # only the states whose names start with these
```

Screenshots: `docs/screens/NN-name-{light,dark}.png`, 390 x 844 at 2x, 28 states per theme, taken by `docs/screens/capture.mjs` (Playwright, its own static server with the SPA fallback, clock started at Monday 07:00 local). Each was looked at; the revision passes are below.

## Commands and results (second pass, 2026-11-16)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npx eslint app/src docs/screens` | pass |
| `npx prettier --check app/src docs/screens docs/COPY.md docs/build-notes/screens.md` | pass |
| `npm run check:gen` | pass (813 strings) |
| `npx jest --selectProjects app` | 13 suites, 73 tests pass (art freshness included, after the regeneration below) |
| `node app/src/ui/art/gen-art.mjs` | regenerated against the Art unit's files at 07:40 (all five heroes and the brand mark redrawn) |
| `npm run export:web` | pass |
| `node docs/screens/capture.mjs` | 56 screenshots (28 states x 2 themes) |
| `npm run ci` | see "CI at hand-off" below |

Tests: `app/src/app/onboarding.flow.test.tsx` (the real route files under `renderRouter`: all six steps, skip paths, resume on step 4, notification prompt only after Continue, camera defaults, Who joins? in one tap, Other 5 to 60, To: picker, no-friends and empty-audience states), `features/usual/DetailsEditor.test.tsx`, `features/tracker/TrackerSheet.test.tsx`, `lib/usual.test.ts`, `lib/tracker.test.ts`, `lib/xpHistory.test.ts`, `features/camera/audience.test.ts`, `ui/art/art.test.ts` (generated art is fresh, every drink has both icon sizes).

## Decisions (one line each)

- **Flare panel hero sits right of the chips and place field**, not of the place and timing rows: five timing pills with 44 pt targets do not fit beside a 112 pt hero on a 390 pt phone.
- **"Make it yours" sits under the drink name** in each slot; on the right it squeezed names onto two lines.
- **The To: line names the group in full** (emoji + name, wrapping at large text) on its own line above a full-width Who joins?. This replaces the earlier call to let group names truncate on a chip beside the button.
- **Snackbars belong to a layer** (the focused route or an open sheet) and leave when it does. They never carry over to another screen or a sheet.
- **Who joins? is pinned** outside the camera's scroll view, so the panel scrolls under it at large text sizes.
- **Top-bar friends pill text caps at 1.35x**, the same as the tracker chip numerals. The full label is still read out.
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

## Second review pass (orchestrator's screenshot review, 2026-11-16)

| # | Problem | Fix | Test |
|---|---|---|---|
| 1 | The preset snackbar "Set to A bit of everything. Undo" stayed up over the details editor (06b) and followed Continue to the invite step (07). | Snackbars now have an owner: the layer on top when they were raised, either the focused route or an open sheet (`ui/Snackbar.tsx`). A host draws only its own layer's snackbar, and the snackbar is dropped as soon as its owner leaves the top: a route change (`SnackbarProvider routeKey={usePathname()}` in `_layout.tsx`), a sheet opening over it, or its sheet closing. It does not come back when the sheet closes. Sheets register through `useSnackbarLayer` in `ui/Sheet.tsx`, in a layout effect, so the tracker's "Something else" picker can close and the Logged snackbar lands on the tracker sheet. The root host still sits above the screen's action area (`useSnackbarInset`), and a sheet's above its footer. | `app/snackbar.flow.test.tsx`, 6 tests: preset then details editor, preset then Continue, tracker log and the picker path, inset, navigation, sheet-owned. 5 of the 6 fail with the old Snackbar. |
| 2 | Camera panel crowded; the To: chip cut "Home frie…". | The send block is now two lines. The To: line is a plain tappable row: "To: 🏠 Home friends", a small outlined Auto marker and a chevron. It wraps and never truncates. **Who joins?** is full width and pinned under the scrolling panel (`WhoJoinsBar`), so it stays on screen at large text (DESIGN 4.4 states, "Who joins? stays pinned"). It is the only filled control in the flare zone. The empty-audience hint sits under the To: line, and the failed-send caption under the button. Chips now grow with text (`minHeight`), and the top-bar friends pill is capped at 1.35x like the tracker chip numerals, so the 52 pt bar keeps all four controls. Tap budgets in DESIGN 4.4 and PRD 3.0 are unchanged: Who joins? 1 tap from the camera, To: 2, Other 2. | `app/camera-profile.test.tsx`: the To: label is emoji + full name with no line limit, the Auto marker shows, and Who joins? sits outside the scrolling panel. The existing composer tests still pass. |
| 3 | Profile "320 XP to Usual Order" next to "380 XP" read as two competing numbers. | Your XP is now the number above the bar ("380 XP", `title`, tabular). The hint under the bar reads "320 more to reach Usual Order". COPY.md 4.16 `profile.to_next` is now `{xp} more to reach {next_level_name}` (max 34: "2000 more to reach Kettle Keeper" is the longest). `profile.total` keeps its text with a new element note. The screen reader label adds the total. | `app/camera-profile.test.tsx` |
| 4 | Usual 3 step: the category tabs sat on an empty, cut-off beige card. | The category header puts the name and "10 drinks" at the top under the rim band, with the hero at the bottom right. Where the fold cuts it, you now see "Coffee" as the start of the menu, not an empty card. | Screenshots 03 and 04 |
| 5 | Move the 8 strings in `lib/pendingCopy.ts` into COPY.md. | Already done by the review unit before this pass (`review.md`, "What I fixed" 4). `pendingCopy.ts` is gone, every caller uses `t()`, and `friends.req.sent` became the existing `contact.requested`. Checked again: no `pt(` calls and no file left. | `npm run check:gen` |
| 6 | Art is being redrawn by the Art unit. | No art file edited. Screens load art through `ui/art/art.generated.ts`, which `ui/art/gen-art.mjs` builds from the masters. It was regenerated at the very end so CI matches the Art unit's files on disk at that moment, and the screenshots were taken after that. | `ui/art/art.test.ts` |

Large text: the web build now takes `?text=max` (`ui/theme/look.ts reviewTextScale`), which draws each text style at 3.1x, capped by its token's max scale (DESIGN 2.4). Screenshots 13b and 13c show the camera at that size: "Who joins?" stays pinned in full, and "To: 🏠 Home friends" wraps over three lines with Auto and the chevron beside it. The web build can't scale TextInput, so the place field stays at its default size there.

## CI at hand-off (07:47)

`npm run ci` was not green at hand-off, and both failures come from the Art unit's in-progress files, not from `app/src`:
- **`format:check`** flags `app/assets/art/heroes/_source/draw-heroes.mjs`, `_source/lib.mjs`, `scripts/gen-art-gallery-compare.mjs` and `scripts/gen-art-gallery.test.mjs`. Lint also warns about an unused `poly` in `draw-heroes.mjs`.
- **`ui/art/art.test.ts` freshness:** the Art unit rewrote the hero and brand SVGs about once a minute while this ran. `art.generated.ts` was regenerated three times, the last at 07:46, and went stale again within the minute each time.

Everything else passes: typecheck, lint (0 errors), `check:gen`, `check:icons`, and 334 of 335 Jest tests (the one failure is the freshness check above). `test:art` was not reached because the Jest step failed first.

**For the orchestrator, once the Art unit is done:** run `node app/src/ui/art/gen-art.mjs`, `npm run export:web` and `node docs/screens/capture.mjs`, then `npm run ci`. That refreshes the generated art the screens import and re-takes the screenshots with the final art. No screen code needs to change.

## Strings

Nothing pending. All screen strings come from COPY.md keys. This pass changed one key's text (`profile.to_next`) and one element note (`profile.total`), then ran `npm run gen -w @clink/shared`.

Also for Copy: DESIGN 4.15 says the tracker caption is "Only you see this"; the screen uses COPY's `today.footer` ("Only you see this. It resets at midnight."). COPY wins; DESIGN could be updated.

For Design (DESIGN.md owner), update to match what shipped and why:
- **4.4 wireframe, Row 4:** the To: line sits above a full-width Who joins?, not beside a 168 pt button. Side by side, a 20-character group name gets about 150 pt and is cut.
- **4.5:** the To: line shows the group emoji, and the Auto tag is an outlined marker in `ink.secondary`, not a filled badge, so it doesn't compete with Who joins?.
- **4.16:** the total is the main number above the bar, and the hint under it reads "{xp} more to reach {level}". It no longer uses two labels on one line.
- **4.14 category header:** the name sits at the top of the header, not the bottom.

## For other units

1. **Two copies of React in Jest:** fixed by the review unit with root `overrides` (`review.md`). Nothing open.
2. **Native camera.** The viewfinder is a placeholder on every platform and the shutter makes a stand-in still. Wire `expo-camera` (or the native module) in `features/camera/Viewfinder.tsx`; the photo-taken state and Share snap already run through `api.shareSnap`.
3. **Haptics** go through `lib/platform.ts` `playHaptic()`, which does nothing until `clink-native` exists (DESIGN 2.10).
4. **Sign-in buttons** are stand-ins with the providers' colours and words. Device builds use `expo-apple-authentication` and Google's button (brand rules).
5. **Phone parse** in step 4 is a loose shape check (`lib/phone.ts`); libphonenumber and the 4.2 screens are still to build.
6. **Supabase**: implement `ClinkApi` (`lib/api/types.ts`). The server owns time; the client sends `timingMin` and `tappedAt` only.
7. **Fonts**: Archivo static cuts are in `app/assets/fonts` with `OFL.txt`; the licences screen (Settings, Help) must show it. Check `tnum` in the shipped cuts at build time (DESIGN 2.4).

## Not done here, and why

- Screens outside this brief: live flare (4.7), incoming flare (4.8), Bring me one (4.9), order ticket (4.10), snaps viewer, friends sheet, groups, full Settings, privacy, report and block, delete account, invite check (4.1a), age check (4.1b), phone and code (4.2). The camera links only to screens that exist; the friends pill opens the invite sheet for now.
- Offline pill and the "Couldn't send" 30 s / 2 min timers: the mock never goes offline, so only the failed-send caption is wired.
- VoiceOver and TalkBack passes need devices. The large-text check here is the web stand-in (`?text=max`), done for the camera only. Other screens wrap and scroll, but they have not been looked at that size.
- The add-widget illustrations are still frames; the looping versions need the real widget renders (M2).
- Native detent sheets and Android full-screen editors: `ui/Sheet.tsx` is the single place to swap them in.
