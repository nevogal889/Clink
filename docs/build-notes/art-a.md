# Build notes: art unit A (heroes, glyphs, brand, gallery)

Written 2026-11-15. Scope: the 5 hero illustrations, the 5 category glyphs and the brand marks, all hand-written SVG per `DECISIONS.md` ("Drink art and logo") and `DESIGN.md` 1.3 and 3, plus the review gallery. Unit B owns `app/assets/art/icons`.

## What exists

```
app/assets/art/heroes/   coffee, matcha, tea, smoothie_juice, water .svg   (1024 artboard, transparent)
app/assets/art/glyphs/   coffee, matcha, tea, smoothie_juice, water .svg   (24 grid, 1.75 stroke, one colour)
app/assets/art/brand/    mark.svg            64 px and up: faceted chip + 2% steel sliver, cobalt
                         mark-small.svg      under 64 px: clean gap
                         mark-mono.svg       one colour, faceted, no sliver
                         wordmark.svg        steel letters, cobalt ring tittle (light surfaces)
                         wordmark-dark.svg   enamel white letters, #9DB2F2 tittle
                         wordmark-mono.svg   one colour
                         lockup.svg          mark + wordmark per DESIGN.md 1.3 lockup rule
                         app-icon.svg        1024, cobalt field, white mark 2% low, steel sliver
                         app-icon-dark.svg   iOS dark: #9DB2F2 mark on #17202A
                         app-icon-mono.svg   mark only, white on transparent (iOS tinted source, themed icons)
                         android-adaptive-foreground.svg   108 dp canvas, mark 48 dp in the 66 dp safe zone
                         android-notification.svg          24 dp white silhouette, clean gap
scripts/gen-art-gallery.mjs        builds docs/art/gallery.html (+ checks, + optional PNG)
scripts/gen-art-gallery.test.mjs   node:test suite (13 tests)
docs/art/gallery.html              generated; the CEO review page
```

## Commands

| What | Command |
|---|---|
| Rebuild the gallery | `node scripts/gen-art-gallery.mjs` |
| Rebuild and fail on rule breaks | `node scripts/gen-art-gallery.mjs --check` |
| Also screenshot it | `node scripts/gen-art-gallery.mjs --png /tmp/gallery.png` (needs Playwright + chromium) |
| Tests | `node --test scripts/gen-art-gallery.test.mjs` |

The gallery shows whatever SVGs exist under `app/assets/art` when it runs (folders starting with `_` or `.` are skipped, so unit B's `icons/_source` stays out). Icons named `<id>.24.svg` / `<id>.64.svg` are paired per drink. The page is self-contained (SVGs inlined as data URIs) and Prettier-formatted, so `npm run format:check` passes on it.

Checks run per file: viewBox per `DESIGN.md` 3.5; no `<image>`, `<text>`, `<filter>`, `<style>`, classes, style attributes, gradients or external hrefs; for drink art, every literal colour is in the 3.2 palette, its derived shade tone (L* minus 12), a category ink or the dark outline (deltaE under 2.5); ellipses not at 0.30 are listed as warnings (petals and seeds are legitimately rounder). Heroes also get a contour-on-tint contrast line. Current run: 106 SVGs, 0 failing, 8 of unit B's icon files with ellipse warnings (chamomile, jasmine, açaí, green juice, watermelon garnish ellipses). They look intentional; unit B should confirm.

## Conventions other units need

- **Contour groups.** In heroes, the 8 px steel silhouette lives in elements whose `id` starts with `contour` (`contour`, `contour-teapot`, `contour-glass`, ...). Opaque objects use an underlay (fill + 16 px stroke drawn under the fills, so 8 px shows outside). Glass objects can't use an underlay (it would show through the 50% glass), so their contour is an 8 px stroke on a path offset 4 px outward, plus a 30 px underlay ring under the 14 px rim line.
- **Dark-mode export rule for heroes (for whoever owns `scripts/gen-drink-assets`).** One master serves both modes only if the dark export (a) swaps `#17202A` to `#EEF2F5` inside `contour*` elements only (cast shadows and speckle keep steel) and (b) drops the gleam from 85% to 70% white. `darkHero()` in the gallery script does exactly this and can be copied. Without (a), steel contours on dark tints are about 1.2:1 and the matcha chawan (dark glaze) disappears on its dark tint. With it every hero's contour is 13.2:1 or better on both tints, which meets acceptance check 4 in 3.3.
- **Shade tones** are computed, not picked: `shadeOf()` in the script (CIE Lab, L* minus 12). Used values: `#CCCECC` (ceramic), `#D2D4D5` (enamel), `#152013` / `#31422A` (chawan glaze / drip), `#AC9F86` (foot), `#A7884C` (bamboo), `#2E1100` (bean), `#944700` (black tea), `#950042` (berry), `#CD7A00` (orange), `#9E0043` (raspberry), `#AEC6CF` (water), `#50611D` (leaf).
- Strokes are live (`stroke-width`, round caps); nothing is scaled with a transform, so stroke weights are true artboard px.

## Decisions taken here (one line each)

- Files live in `app/assets/art/` (this unit's brief), not `design/drinks/` as `DESIGN.md` 3.5 says. Design should update 3.5 to match.
- "Ground line y = 880" is read as the lowest point of each main vessel base; props in front go down to y 900 (subject box bottom).
- Rims, surfaces, bases and cast shadows are `<ellipse>` or elliptical arcs at exactly 0.30; non-rim shapes (beans, citrus hemisphere profile, spoon bowl) are paths.
- Coffee hero adds the cup's own flat cast shadow on the saucer (same 0.30 ellipse, steel 14%). It anchors the cup; the brief doesn't forbid it.
- Tea hero: the teapot's handle is on the left because the brief puts the spout toward the cup; 3.1's "handle always on the right" is for drinking vessels.
- Water hero ice cubes are enamel white `#F4F6F7` rounded squares without outlines; bubbles use the palette's `#0B7391` at 60%.
- Hero rim lines use the light-mode category ink (matcha uses the dark-mode ink, per its brief). On dark tints the tea rim `#6B5306` is low contrast against the tint; the swapped light contour around it carries the edge.
- Wordmark: the 0.42 ellipse ratio applies to the tittle ring's centre line (an outer ratio of 0.42 with a 0.45 x stem stroke leaves no hole). The ring is 2 stems wide and its hole closes at small sizes; it reads as a ring from about 150 px wordmark width. Letters are drawn from scratch after Archivo SemiCondensed ExtraBold proportions (x-height 100, stem 24), not traced from the font file.
- Mark facets: each chip edge is two segments (outer 64° to 67° to inner 63°, and 26° to 23° to 27°), a small bite rather than a straight cut. The steel sliver is a 2%-wide stroke 1 unit inside each faceted edge. The dark app icon drops the sliver (steel on steel).
- App icon is a full-bleed square; iOS and Android apply their own masks. The gallery shows a rounded-mask preview.

## Not done, and why

- **48 pt hallway test** (3.3 acceptance check 1): needs 5 people. The gallery shows each hero at 48 pt on both tints for it.
- **WebP and native exports** (heroes at widget sizes, iOS asset catalog, Android drawables, adaptive icon XML, `expo-*` icon config): `scripts/gen-drink-assets` and the app config are outside this unit's paths.
- **Final brand artwork** waits on the trademark check (PRD 8 question 4), as `DESIGN.md` 1.3 says.
- **CI wiring:** the gallery tests use `node --test` and are not in the root Jest projects. Suggest adding `"test:art": "node --test scripts/gen-art-gallery.test.mjs"` to the root `package.json` and a CI step (owner: scaffold). Optionally add `docs/art/*.html` to `.prettierignore`; the script already formats its output.
- Device checks (iOS tinted and clear home screens with `.widgetAccentedRenderingMode(.desaturated)`, Android themed icons) need hardware and builds.
