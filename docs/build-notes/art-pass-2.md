# Build notes: art pass 2 (heroes, brand mark, app icon)

Written 2026-11-16 on branch `build/foundations`. Scope: the CEO's first art review (`DECISIONS.md`, "CEO answers after the first art review"). One more pass on all 5 heroes for character, the matcha glaze redrawn, and the notched-ring mark replaced by a cup rim seen from above in every brand file. The wordmark is unchanged.

## What changed

```
app/assets/art/heroes/_source/draw-heroes.mjs   new: generates the 5 heroes (run it, don't hand-edit)
app/assets/art/heroes/_source/lib.mjs           new: contour, gleam, speckle, chip, ellipse helpers
app/assets/art/heroes/*.svg                     regenerated
app/assets/art/brand/_source/draw-brand.mjs     new: generates every brand file that carries the mark
app/assets/art/brand/{mark,mark-small,mark-mono,lockup,app-icon,app-icon-dark,app-icon-mono,
  android-adaptive-foreground,android-notification}.svg   regenerated: the rim
app/assets/art/brand/android-monochrome.svg     new: themed-icon layer (see "For other units")
scripts/gen-art-gallery-compare.mjs             new: before/after page against a git ref
scripts/gen-art-gallery.test.mjs                4 new tests, brand list includes android-monochrome
docs/art/before-after.html, before-after.png    new (png at deviceScaleFactor 2)
docs/art/gallery.html                           regenerated
docs/DESIGN.md                                  1.3 mark and app icon, 3.2 hero rules, 3.3 hero briefs
```

Glyphs and drink icons did not use the notched ring, so they are unchanged.

## Commands

| What | Command |
|---|---|
| Redraw heroes | `node app/assets/art/heroes/_source/draw-heroes.mjs [category ...]` |
| Redraw brand files | `node app/assets/art/brand/_source/draw-brand.mjs` |
| Before/after page and png | `node scripts/gen-art-gallery-compare.mjs --png docs/art/before-after.png` (`--ref <commit>` to compare against something other than HEAD; once this pass is committed, use `--ref a274a21` to regenerate this exact comparison) |
| Gallery | `node scripts/gen-art-gallery.mjs --check` |
| Tests | `npm run test:art` (now also fails if an SVG drifts from its generator) |

## Hero direction (one line each)

Decided direction: lean into enamelware. Same grammar (0.30 ellipses, light top left, one shade, one gleam, 14 px category-ink rim line, ground line 880, 14% steel cast shadow).

- **Line:** the steel contour swells from 8 px on the lit side to about 14 px on the shade side (silhouette drawn twice, nudged 4, 5). Glass gets a second stroke on its right wall and base. This does most of the "not clip-art" work at every size.
- **Enamel:** coffee cup and saucer are now white enamel (were glazed ceramic). Category ink is used as enamelware uses it: saucer edge band, teapot lid band, knob and spout tip, jug lip. Speckle is even and sparse (about 1%): clustered speckle read as dirt in the first try.
- **One chip each** on the coffee cup rim and the water jug rim.
- **Coffee:** crema with a white tulip lying across the cup, bud toward the handle, so its layers keep their shape at the 0.30 ratio (the first pass had brown art on white foam, which is backwards, and a tulip pointing away, which flattened into slivers). Spoon handle runs past the saucer edge. Three beans, the back one turned over.
- **Matcha:** the drip tongues are gone. Dark glaze stops at a soft glaze line two thirds down, with a crisp dark edge, over raw clay; the foot is clay. It reads as a glazed bowl, not dirt or melting. Chasen has a binding thread, an inner tuft and seven tines that curl in. The chashaku has a heap of matcha on its tip.
- **Tea:** teapot is a squat enamel kettle with a steel bail handle and bamboo grip (after Noda Horo). Tag has a folded tea-ink top and hangs on the front of the glass. The leaf is serrated with veins.
- **Smoothie & Juice:** plain orange bendy straw (ribbed elbow above the rim); orange wheel with 9 mango-coloured segments so flesh separates from rind; half orange with pith spokes and pips; raspberries built from drupelets, one standing (hollow up), one on its side; thick glass bottom.
- **Water:** faceted cafe tumbler (smooth top band, vertical facets, heavy bottom), ice as real cubes (front, top and shaded side faces), enamel jug with ink rim, lip and base band and a chip.
- **Not added, on purpose:** steam (DESIGN.md 1.4 bans steam swirls), gradients, filters, faces, sparkles.

## Brand mark (one line each)

- The rim: outer edge ratio 0.53 (an ellipse, never an O), band 12.5% of the width, opening raised so the near lip is heaviest. Inside, the back wall shows as a crescent in `#9DB2F2` with one white gleam; the rest of the opening shows the background, read as the drink.
- App icon: white rim on cobalt, 68% of the width, centre 2% low. Dark: `#9DB2F2` rim on steel, cobalt wall. Tinted source: greyscale.
- One-colour uses (notification, Android monochrome, `mark-mono`) draw rim and wall as one silhouette with a gap, so the wall survives a flat tint. The notification gap is 1 dp.
- Lockup mark is 1.5 x the x-height wide, centred on the x-height band, one stem from the c.
- Checked on mocks (in `before-after.png`): iOS home screen at 60 pt, dark and tinted icons, 29 pt settings rows, Android adaptive circle and rounded masks, themed icons in both palettes, notification at 24 and 18 dp tinted cobalt, white and grey. It reads as a cup rim at each size; at 29 pt the back-wall crescent is what stops it reading as an O.

## Review of `before-after.png` and the one revision pass

First render, judged honestly:
- Matcha, tea and coffee were clearly more specific than before. Smoothie and water were only marginally different: still the stock "glass with a straw" and "jug and glass".
- Coffee: the tulip pointed away from the viewer, so at 0.30 its layers flattened into slivers that read like a wifi symbol.
- Clustered speckle on the coffee cup read as dirt, the same complaint as the old matcha glaze.
- Chips were symmetric (pale ring round a dark centre) and read as holes.
- Icon: at 29 pt the back-wall crescent was too thin to stop the band reading as an oval O.

Revised: tulip turned to lie across the cup (bud toward the handle) and scaled down; speckle even and sparse; chips redrawn as off-centre flakes; smoothie got a bendy straw; water got the faceted cafe tumbler and a jug base band; the mark's drink surface was lowered and narrowed so the back wall is bigger. After that pass every hero reads at 48 pt on both tints, and the icon reads as a rim at 60 and 29 pt.

Still the weakest: the smoothie hero is the closest to a generic composition (a tall glass is a tall glass). If the CEO wants more, the next lever is the fruit, not the glass.

## For other units

- **`app/src/ui/art/art.generated.ts` (screens/app owner):** generated from these SVGs by `app/src/ui/art/gen-art.mjs`; `art.test.ts` fails when it is stale. I reran the generator so `npm run ci` stays green (no hand edits; output only). If you own that file and also regenerated it, the result is identical for the same inputs.
- **App config (scaffold owner):** if `app.config.ts` wires icons later, Android's adaptive icon should use `android-adaptive-foreground.svg` for the foreground and `android-monochrome.svg` for the monochrome layer (the foreground's back wall would merge into the rim if Android read the foreground's alpha). The notification icon is `android-notification.svg`. PNG exports still belong to `scripts/gen-drink-assets` (not built yet, see `art-a.md`).
- **Dark-mode export rule is unchanged:** swap `#17202A` to `#EEF2F5` inside `contour*` elements, gleam 0.85 to 0.7. Heroes still use `fill-opacity`/`stroke-opacity` 0.85 for the gleam only.

## Not done, and why

- **Screen captures** in `docs/screens/` (screens unit) were taken with whatever art was on disk at the time; recapture them to show the new heroes and icon.

- **48 pt hallway test** (DESIGN.md 3.3 check 1) needs 5 people. `before-after.png` and the gallery show every hero at 48 pt on both tints.
- **Device checks** of the icon (real iOS tinted and clear modes, Android themed icons, notification tint) need builds and hardware.
- **Trademark** still gates final brand artwork (PRD 8, question 4).
