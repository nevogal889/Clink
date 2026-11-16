# Build notes: shared rules (`packages/shared`)

The rules that live once (CLAUDE.md): catalog, strings, XP, the Automatic rule, limits, events, widget-state schema and fixtures. Written 2026-11-15.

## What exists

```
scripts/gen-catalog.mjs              COPY.md 2.2 to 2.8 -> src/catalog/catalog.generated.ts + generated/catalog.json
scripts/gen-strings.mjs              COPY.md 0.2, 1.3, 2.8, 3 to 7 -> src/strings/table.generated.ts + generated/strings.json
packages/shared/tools/copy-md.mjs    markdown section/table reader both generators use (plain Node, no deps)
packages/shared/src/
  catalog/     types and rules over the generated data: editor field split, Tapioca filter, details zod
               schema, Ice visibility, caffeine, {summary}, {wants}/{cat}, accent-free search
  strings/     t(key, vars), a small ICU parser/formatter (icu.ts), truncation to COPY.md budgets
  xp/          values, caps, pair rules, thresholds, levelForTotal(), decideAward(), reversal checks
  audience/    resolveAutomatic(), resolveAutomaticAt(), defaultAutoRole(), nextBoundaryMinutes()
  limits/      text limits (code points, like char_length), caps, rate limits, timers, flare timing,
               flareTimes()/flareExpiresAt(), decisionInstant()
  events/      every PRD 6 event with strict zod props, who writes it, clientEventSchema
  widget-state/ zod schemas for the state JSON, widget-local state and widget config; resolveWidgetView()
  generated.test.ts   runs both generators with --check, and feeds them broken COPY.md copies
packages/shared/fixtures/
  automatic-rule.json                 T22 to T33 plus A1 to A8
  widget-states/W01-…json … W22-…json one per QA_PLAN 4.1 state, with the expected view per size
  widget-states/invalid/*.json        9 documents every decoder must reject
packages/shared/generated/            catalog.json and strings.json for the Swift and Kotlin units
```

## Commands

| What | Command |
|---|---|
| Regenerate after a COPY.md change | `npm run gen -w @clink/shared` |
| Drift check | `npm run gen:check -w @clink/shared` (also runs inside `npm test` through `generated.test.ts`, so CI already fails on drift) |
| Tests | `npm run test:shared` |
| Typecheck | `npm run typecheck -w @clink/shared` |

Generated files are formatted with the repo's Prettier config, so `format:check` passes on them.

## How gen-strings reads COPY.md

- A table row whose first column holds a backticked key defines it. Text from the "Text" or "Label" column, `max` from "Max" (`system`, `n/a` become null; `12 each` is 12). Context from Element/Where/Situation/etc.
- `` `a.b.c` / `.d` `` with text "X / Y": the suffix replaces the last segment, or the one before a trailing `.a11y`. So `cam.flash.on.a11y` / `.off` gives `cam.flash.off.a11y`.
- `` `order.label.size` … `order.label.extras` ``: one key per listed label, named by the 2.7 details key (`order.label.temp`, `order.label.caf` …). "Add-ins" has no key of its own in 2.7 (it is stored as `extras`), so it is `order.label.addins`.
- One key with "Prefix a / b / c" text gives `key.a`, `key.b`: `snapv.react.a11y.coffee` … `.laughing`.
- `mod.reason.*` becomes `mod.reason.<database value>` (`nudity`, `harassment`, `spam`, `other`, `not_consented`, plus `text` for "a word that isn't allowed", the `moderation_notices.reason` value in ARCHITECTURE 4.2). Labels are lower-cased except "I'm".
- Prose `` `onb.progress` = "{n} of 6" (max 8) `` defines a key.
- Level names: `level.N` (name, max 16) and `level.N.desc` (max 70).
- Notifications 5.1: `n.<x>.title`, `n.<x>.body` (none for "(none)"), shared `n.action.im_in`, `n.action.bring_me_one`, `n.action.accept`, `n.action.not_me`. `NOTIFICATIONS` keeps sound and actions per row. Limits 40/90/16 from the section 5 prose.
- Rows that only point elsewhere are kept as `STRING_REFERENCES`, not strings: `profile.level_desc`, `empty.requests`, `a11y.w.confirm`, `a11y.react`.
- One editorial note is stripped: " (each from the small strings)" in `wm.counts`.
- A key defined twice is fine only with identical text (`expired.title` is in 4.7 and 4.21); different text stops the build.
- Placeholders are kept as written, including `{m:ss}` and `{mm:ss}`, so `t('live.countdown', { 'mm:ss': '14:32' })`. Plural arguments are typed `number`.

Result: 793 strings, 21 notifications, 79 banned terms from 1.3.

## Decisions (one line each)

- **Generators are `.mjs` with no dependencies besides Prettier**, so they run in CI before anything is built. The parsing lib lives in `packages/shared/tools/` because both scripts need it.
- **Catalog words stay in the catalog, not the string table.** Drink names, descriptions, widget names, option labels and values are generated from COPY.md 2 into `DRINKS` / `OPTION_SETS`, and into `generated/catalog.json` for native. Option values are stored as their English words, as `usual_drinks.details` does (`caf <> 'Decaf'`).
- **`onlyFor` per option value** carries "Tapioca pearls (Bubble Tea only)". `alwaysIced` is derived: the drink's own Fields include Ice but not Temperature (Cold Brew, Coconut Matcha, Matcha Lemonade, Matcha Tonic, Bubble Tea).
- **Custom drinks are caffeinated** in coffee, matcha and tea, not in Smoothie & Juice (PRD 3.11 rule 5: "any tea not flagged herbal").
- **t() collapses double spaces** left by an empty ICU branch (`in.others.named` with `rest = 0`). Apostrophes are literal; ICU quoting isn't supported because COPY.md never quotes braces.
- **Banned-word test**: whole-word, case-insensitive match of every 1.3 term and the "admit someone said no" words, plus no `!`, em dash, `--` or `...`. Terms with a context qualifier in 1.3 can be allowed per key in a reviewed list in `strings.test.ts`; today that is five uses of "just" meaning "only" or the 1.4 term "Just this time". The list fails if an entry goes stale.
- **Once per pair for invite and new-friend XP is across both kinds** (PRD 4.3 rule 3 and QA X4: "+50 once, then nothing, ever"). See "For other units".
- **flare_got_joiner and the pair cap**: the award takes the standing joiners; its counterpart is the first one not already counted for that kind today. So two of my flares joined only by Leo on one day earn +15 once (PRD 4.3 rule 4, "one 'X joined your flare'").
- **Caps count ledger rows of that kind on that local day**, reversed or not, like ARCHITECTURE 4.5's count inside `award_xp()`. A day whose log XP was reversed earns no more log XP.
- **Level thresholds are a parameter** with the PRD 4.4 defaults, because they are server config.
- **Automatic returns a group id or `"everyone"`.** Weekday is ISO (1 = Monday). A group needs `memberCount >= 1`; a deleted id falls back to Everyone.
- **Fixture name `fixtures/automatic-rule.json`** as the Shared brief asked. ARCHITECTURE 3.1 and 4.6 say `fixtures/audience.json`.
- **Widget state additions to the ARCHITECTURE 3.1 example**, each needed to render a QA state offline: `incoming[].sentAt` ("newest" in the priority rule), `incoming[].wants` and `.label` (the `{wants}` / `{cat}` words, which a custom drink can't derive), `myFlare.label`, `myFlare.audience` ("Sent to Work"), `myFlare.createdAt`, `snaps[].createdAt` ("Leo · 38m"), `usual[].drinkId` nullable for custom drinks, and typed `outbox[].payload` per op. Friend names in the state are already cut to 12.
- **Widget-local state is a separate schema** (`widgetLocalSchema`: picker mode, confirmation, dismissed flares), never sent by the server. Per-widget config is `widgetConfigSchema`.
- **resolveWidgetView()** encodes PRD 3.3 and QA 4.2: signed out / setup > open picker (30 s) > newest unreplied friend flare (+N counts other live unreplied ones) > your live flare > newest replied friend flare > idle. Confirmation, Sending and Failed are an overlay on that view; queued logs never show Sending or Failed (PRD 3.20). Counts read 0 when `today.localDate` isn't today in the device zone.
- **Events**: `invite_share_tapped.surface` is an enum (`onboarding`, `friends`, `widget`, `camera`), because PRD 6 names the prop but no values and free text is banned. `snap_reacted.reaction` uses names (`coffee`, `matcha`, `tea`, `heart`, `laughing`), not emoji. `widget_*.audience_type` is nullable for small widgets.
- **Text limits count code points**, like Postgres `char_length`, so an emoji is one character in the app and in the database.
- **Imports inside `src` are extensionless** (Metro, Jest and `tsc` with bundler resolution all accept them). The Deno copy needs `.ts` added; see below.

## For other units

- **CTO / ARCHITECTURE.md 3.1**: update the widget-state example with the fields listed above, and the fixture name in 3.1 and 4.6 (`automatic-rule.json`, or tell Shared to rename it). PRD 6 and ARCHITECTURE 2 name single files (`src/events.ts`, `src/xp.ts` …); the scaffold made folders (`src/events/index.ts`).
- **Database unit**: ARCHITECTURE 4.2's `xp_pair_once` index is per `(user_id, kind, counterpart)`, which lets someone get +50 for an invite and later +10 new-friend for the same person. PRD 4.3 rule 3 wants once per pair across both kinds: index `(user_id, counterpart) where kind in ('invite_accepted', 'new_friend')`. Also: `flare_got_joiner` needs a counterpart for the pair cap (see Decisions).
- **sync-shared-to-functions** (not written; not in this unit's paths): the copied files import `zod` and use extensionless relative imports. The script should rewrite `./x` to `./x.ts` (or `./x/index.ts`) and the functions' import map should pin `zod` (`npm:zod@4`).
- **Swift and Kotlin units**: decode every `fixtures/widget-states/*.json` (and reject every file in `invalid/`), port `resolveWidgetView()` and `resolveAutomatic()`, and run `automatic-rule.json`. `generated/catalog.json` and `generated/strings.json` are ready to copy into the targets (ARCHITECTURE 2 `gen-native-catalog`).
- **Root `package.json`** (scaffold): optionally add `"gen": "npm run gen -w @clink/shared"`. CI already catches drift through `npm test`.
- **Copy (COPY.md owner)**, found while building fixtures:
  - No key for the widget "Sent to {audience}" line (DESIGN 5.2 live flare with no replies, `a11y.w.confirm`) or "Logged · {drink}". `wm.sent` and `wm.logged` are single words.
  - DESIGN 5.2 words that differ from COPY 6: "No snaps yet" vs `wm.snap_none`, "Log a drink" vs `wm.pick.title`, "Ask Maya for" vs `wm.bring.title`, "Invite" vs `wm.invite`, "Pick your usual 3" (no widget key). COPY wins on words; Design should update 5.2 or Copy should add keys.
  - `{audience}` still has no budget in 0.2 (COPY 9 proposes 20).
  - "React with laughing" (`snapv.react.a11y.laughing`) may read better as "React with a laugh".
- **App unit (verify)**: `localTimeAt()` and `localDateAt()` use `Intl.DateTimeFormat` with `timeZone` and `formatToParts`. Check Hermes on both platforms supports both at build time.

## Not done here, and why

- **`src/api` (edge-function request and response schemas)** is still empty. It wasn't in this brief; the functions unit should add it with the limits and catalog schemas from here.
- **Swift and Kotlin ports and their fixture tests** are other units' paths, and Swift can't compile here.
- **`scripts/sync-shared-to-functions`** and **`gen-native-catalog`** copies into native targets are outside this unit's paths. The JSON they need is in `packages/shared/generated/`.
- The XP functions decide awards from a ledger the caller passes in; the transaction, row lock and idempotency key live in `private.award_xp()` (Database unit).
