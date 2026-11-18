# Clink: words

Owner: Copywriter, with the AI Grammar & De-Slop Specialist. Audience: engineering, design, QA.
Status: v1 string source, revised 2026-11-15 after the Risk and QA reviews (resolution log in `RISK_REVIEW.md`). `DECISIONS.md` overrides this file. Behaviour lives in `PRD.md`, visuals in `DESIGN.md`, build details in `ARCHITECTURE.md`. This file owns every user-facing word: UI strings, notifications, widget text, the drink catalog, level names and invite messages.

How to use it:
- Every string has a key. The string table in `packages/shared` is generated from these keys. No string is typed anywhere else (`PRD.md` 3.0).
- "Max" is the hard limit in characters for the rendered string, with variables at their budget (section 0.2). If a string doesn't fit a layout, tell Copy. Don't cut it in code.
- Examples use the prototype's people: Dana (you), Maya, Leo, Sam, Noa, Ari.

---

## 0. Conventions

### 0.1 Base language

English only in v1, written in **US English** (color, favorite, license, skim milk). Reason: one base locale for both stores; en-GB can be added later as its own locale. Section 8 lists strings that need care when we translate.

### 0.2 Variables and their budgets

| Variable | What it is | Budget | Overflow rule |
|---|---|---|---|
| `{name}` | Friend's first name: the first word of their display name | 12 | Truncate to 11 + "…" in notifications and widgets. In the app it wraps instead. |
| `{me}` | Your own first name | 12 | Same |
| `{drink}` | Catalog app name or custom drink name | 30 | App shows in full. Widgets use `{drink_short}`. |
| `{drink_short}` | Widget name from the catalog (section 2) | 15 | Custom drinks: truncate to 14 + "…" |
| `{cat}` | Category word in a sentence: coffee, matcha, tea, or the Smoothie & Juice drink's `label` (2.5) | 10 | none needed |
| `{wants}` | What follows "wants": coffee, matcha, tea, or the drink's `wants` (2.5) | 10 | none needed |
| `{place}` | Free-text place | 40 | Widgets truncate at 18 + "…" |
| `{group}` | Group name | 20 | Widgets truncate at 14 + "…" |
| `{n}`, `{in}`, `{orders}` | Counts | 2 digits | ICU plural rules, always |
| `{time}` | Clock time in device format (10:45 or 10:45 AM) | 8 | none |
| `{ago}` | Relative time: "just now", "12m", "1h 42m". A line that reads "{ago} ago" has a `_now` key for under a minute | 8 | none |
| `{mins}` | Minutes from now: "now", "in 5 min", "in 45 min" | 9 | none |
| `{url}` | Invite URL. Only ever inside share messages (section 7). | 40 | never shown in the app |
| `{min}` | Minimum age from `app_config` | 2 digits | none |
| `{domain}` | Our web domain, for support@ and privacy@ | 24 | none |
| `{device}` | Device model from the OS ("iPhone", "Pixel 8") | 20 | Truncate to 19 + "…" |
| `{ago_words}`, `{left_words}` | Spoken times for screen readers: "1 hour 42 minutes", "14 minutes" | n/a | never shown |

The app builds `{ago}`, `{mins}`, `{mins_cap}`, `{ago_words}` and `{left_words}` from the keys in 4.27.

Plurals are written with ICU, for example `{n, plural, one {# drink} other {# drinks}}`. Never write "drink(s)".

### 0.3 Mechanics

- **Sentence case** for everything: titles, buttons, labels. "Bring me one", "Show to barista", "My usual 3". Drink names are proper names and keep their catalog capitals ("Flat White").
- **Contractions** are normal: you're, can't, didn't, it's.
- **Periods:** full sentences end with a period. Buttons, labels, chips, toggles and titles don't. A title that is a question keeps its question mark.
- **No exclamation marks.** Anywhere. A friend at the coffee machine doesn't shout.
- **No em dashes, no double hyphens.** Use a period or a comma. An en dash is allowed only inside a number range in tight space (5–60). In sentences, write "to": "8:00 to 18:00".
- **Middle dot (·)** separates short facts on one line: "Café Lumi · in 10 min". Never more than three items per line.
- **Ellipsis (…)** only for something in progress ("Sending…") or a truncation. One character, not three periods.
- **Numbers** are digits: "3 drinks", "2 of 20". Times follow the device's 12/24h setting.
- **Possessives:** add 's to every name, including names ending in s: "Chris's order".
- **"We"** is allowed only when a real team does something (reviewing a report). The app itself doesn't talk about itself as "we". "Clink" is fine when the sentence needs a subject.
- **Emoji are content, never decoration.** Allowed: the five reactions (☕ 🍵 🫖 ❤️ 😂), group emoji the user picks, and the note marker 📝 (which Design may draw as an icon, see `DESIGN.md`). No emoji in titles, buttons, notifications or share messages, except a reaction inside a reaction notification, where it is the news.
- **The word "link" never appears next to an invite** in the app (CEO guideline 6). No "Invite link", no "Copy link", no URL on screen.
- **Quiet hours don't exist.** No string mentions quiet hours, do not disturb windows or time-based muting (CEO guideline 5).

---

## 1. Voice

### 1.1 How Clink talks

Clink sounds like a friend at the coffee machine: short, warm, plain, a little dry. It says what happened and what you can do next, then stops. It doesn't push, cheer or guilt-trip. It assumes you're busy and a bit tired, and that you'd rather be having the drink than reading about it.

Three tests for every string:
1. Would a person say this out loud to a friend? If it sounds like a brochure, rewrite it.
2. Can you cut a word? Cut it.
3. Does it make anyone feel left out, watched or behind? Rewrite it. Nobody declined, nobody missed anything, and nobody is behind.

Dry humor is allowed in small doses: empty states, level descriptions, the occasional sub-line. Never in errors, privacy, report, block or delete screens. Those are plain and exact.

### 1.2 Do and don't

| # | Do | Don't | Why |
|---|---|---|---|
| 1 | Nobody was free this time. | Oops! No one joined your flare 😢 Better luck next time! | States the fact, no pity, no shame. |
| 2 | Leo is in. | Great news! Leo has accepted your invitation to grab a coffee! | Three words carry the whole message. |
| 3 | Couldn't send. Tap to retry. | Something went wrong. We're working on it! Please try again later. | Says what failed and what to do. "Something went wrong" says nothing. |
| 4 | Only you can see your level. | Your level is your personal journey. Share it with nobody but yourself. | Plain fact. No "journey", no poetry. |
| 5 | Snaps stay quiet. | Snaps are designed to be effortless and non-intrusive. | Short, concrete, sounds like a person. |
| 6 | Remove Leo? Leo won't be told. | Are you sure you want to remove this friend? This action will remove them from your network. | Uses the name, answers the real worry (will they know?). |
| 7 | Add how you like it? | Unlock the full Clink experience by personalizing your drinks! | Asks a simple question. No unlocking, no experience. |
| 8 | Herbal tea is a nice switch tonight. | You've exceeded your recommended caffeine intake. Consider switching to decaf for better sleep. | No health claim, no numbers, no scolding (`DECISIONS.md`). |

### 1.3 Banned

These read as machine-written or as marketing. QA rejects any string that contains them. The de-slop pass greps for every item below before each release.

**Words and phrases**
- seamless, seamlessly, effortless, frictionless
- elevate, enhance, empower, supercharge, boost, level up (as a verb phrase about the user's life)
- delightful, delight, magical, magic, amazing, awesome, incredible
- unlock, unleash, discover, explore, embark, dive in, let's dive
- journey, experience (as a noun for using the app, or as a verb), adventure
- leverage, robust, curated, crafted, tailored, bespoke, vibrant, tapestry, realm, landscape
- game-changer, next level, take it to the next level, the future of
- hassle-free, at your fingertips, we've got you covered, say goodbye to
- it's worth noting, it's important to note, rest assured, simply, just (as a softener: "just tap")
- in the world of, whether you're X or Y, from X to Y (as a sweeping range)
- Oops, Uh-oh, Whoops, Yay, Woohoo, Hooray
- Success!, Congratulations!, You're all set!, Welcome aboard
- friendly reminder, quick reminder, don't miss out, FOMO
- Ready to...?, Get ready to, Join the fun, Let the fun begin
- Hey there, Hi friend

**Patterns**
- Em dash asides of any kind ("Clink — the app for breaks"). Double hyphens too.
- "Not just X, it's Y", "It's not X, it's Y", "More than just X", "X, but make it Y".
- Triplets for rhythm ("Sip. Share. Connect.", "fast, fun and friendly"). A list of three real things is fine. Three adjectives added for sound get cut.
- Exclamation marks, including in notifications and share messages.
- Emoji as decoration (see 0.3).
- Two questions in a row ("Want a coffee? Need a break?").
- Fake urgency or guilt ("Your friends are waiting", "Don't leave them hanging", "You haven't opened Clink in a while").
- Over-promising ("perfect", "instantly", "always on time").
- Title Case For Buttons.
- Words that admit someone said no: declined, rejected, ignored, missed, seen, left on read.

### 1.4 Words we use

| Use | Meaning | Don't use |
|---|---|---|
| flare | "I want coffee, who joins?" sent to friends | invite, event, meetup, ping |
| snap | Photo of your drink on friends' widgets for 24 hours | post, story, moment |
| I'm in | Reply: I'm coming | Accept, Join, RSVP |
| Bring me one | Reply: get me my drink | Order, Request |
| drink run | The trip the flare sender makes with orders | delivery, errand |
| My usual 3 | Your 3 saved drinks (in Settings, where you speak) | favorites, top 3 |
| your usual 3 | Same, where the app speaks to you | |
| Make it yours | Open the order details editor | customize, personalize |
| Plan B | What to get if they're out | fallback, alternative |
| Note | Free text on a drink | comment, instructions |
| Just this time | One-time note on a Bring me one | override, special request |
| Show to barista | Large-text order screen | barista mode (internal name only) |
| Everyone | All your friends | All, Public |
| Automatic | Audience chosen by time of day | Smart, Auto-magic |
| group | Private label for some friends | circle, crew, squad |
| level, XP | Private progress | score, points, rank |

---

## 2. Drink catalog

CEO guidelines 7 and 8: ten drinks in each flare category, and the fourth category is called **Smoothie & Juice**. This section is the catalog source: `DESIGN.md` 3.4 draws exactly these ids (42 images: 40 drinks plus 2 water, matching `ARCHITECTURE.md` 8.2). Ids follow `ARCHITECTURE.md` (`coffee.cortado`). The category key for Smoothie & Juice is `smoothie_juice`.

### 2.1 Rules

- **Names** are what people say at the counter in most cities. Chain trademarks are not used (no "Frappuccino"). Names are base drinks; iced, oat and the rest come from order details. So an "Iced Oat Flat White" is Flat White + Iced + Oat milk. Cold Brew stays a drink because it's made differently.
- **Description:** 8 words or fewer, shown under the name in the picker. No adjectives for flavor marketing.
- **Caffeine** feeds the tracker and the 4-caffeinated-drinks note (`PRD.md` 3.11). "No" means herbal or caffeine-free. Coffee with Caffeine = Decaf in its details counts as no.
- **Widget name:** 15 characters or fewer. When the full name is too long, drop the category word first (the picture already says it), then shorten.
- **Fields** lists which option fields (2.7) make sense for that drink. The editor shows these fields first and the rest under "More options" (`PRD.md` 3.7 adopted this). Every field stays optional.
- App names are 20 characters or fewer.

### 2.2 Coffee

| Id | App name | Description | Caffeine | Widget name | Fields |
|---|---|---|---|---|---|
| `coffee.espresso` | Espresso | A short, strong shot of coffee | Yes | Espresso | Shots, Caffeine, Sweetness, Extras |
| `coffee.americano` | Americano | Espresso topped up with hot water | Yes | Americano | Size, Temperature, Ice, Shots, Caffeine, Milk, Sweetness, Extras |
| `coffee.filter` | Filter Coffee | Brewed black coffee, also called drip | Yes | Filter Coffee | Size, Temperature, Ice, Caffeine, Milk, Sweetness |
| `coffee.cappuccino` | Cappuccino | Espresso with steamed milk and thick foam | Yes | Cappuccino | Size, Temperature, Shots, Caffeine, Milk, Sweetness, Extras |
| `coffee.latte` | Latte | Espresso with lots of steamed milk | Yes | Latte | All coffee fields |
| `coffee.flat_white` | Flat White | Double espresso with thin, silky milk | Yes | Flat White | All coffee fields |
| `coffee.cortado` | Cortado | Espresso cut with a little warm milk | Yes | Cortado | Temperature, Shots, Caffeine, Milk, Sweetness |
| `coffee.macchiato` | Macchiato | Espresso with a spoonful of milk foam | Yes | Macchiato | Shots, Caffeine, Milk, Sweetness, Extras |
| `coffee.mocha` | Mocha | Espresso, chocolate and steamed milk | Yes | Mocha | All coffee fields |
| `coffee.cold_brew` | Cold Brew | Coffee steeped cold for hours, served iced | Yes | Cold Brew | Size, Ice, Caffeine, Milk, Sweetness, Extras |

Notes:
- Macchiato is described as the espresso version. Someone who wants the layered chain drink picks Latte + Caramel syrup, or adds their own. Reason: the espresso macchiato is the one ordered across Europe, the Middle East and most specialty cafes.
- Cold Brew has no Temperature field; it is always iced.

### 2.3 Matcha

| Id | App name | Description | Caffeine | Widget name | Fields |
|---|---|---|---|---|---|
| `matcha.latte` | Matcha Latte | Whisked matcha with steamed or cold milk | Yes | Matcha Latte | All matcha fields |
| `matcha.ceremonial` | Ceremonial Matcha | Top-grade matcha whisked with water only | Yes | Ceremonial | Size, Temperature, Ice, Strength, Grade, Sweetness |
| `matcha.strawberry` | Strawberry Matcha | Matcha latte over strawberry purée | Yes | Strawberry | All matcha fields |
| `matcha.dirty` | Dirty Matcha | Matcha latte with a shot of espresso | Yes | Dirty Matcha | All matcha fields |
| `matcha.hojicha` | Hojicha Latte | Roasted green tea latte, toasty and mellow | Yes | Hojicha Latte | Size, Temperature, Ice, Milk, Sweetness, Strength, Extras |
| `matcha.coconut` | Coconut Matcha | Matcha shaken with coconut water over ice | Yes | Coconut Matcha | Size, Ice, Sweetness, Strength, Grade |
| `matcha.lemonade` | Matcha Lemonade | Matcha shaken with lemonade over ice | Yes | Matcha Lemonade | Size, Ice, Sweetness, Strength, Grade |
| `matcha.tonic` | Matcha Tonic | Matcha poured over tonic water and ice | Yes | Matcha Tonic | Size, Ice, Sweetness, Strength, Grade |
| `matcha.blended` | Blended Matcha | Matcha, milk and ice blended smooth | Yes | Blended Matcha | Size, Milk, Sweetness, Strength, Extras |
| `matcha.mango` | Mango Matcha | Matcha latte layered over mango purée | Yes | Mango Matcha | All matcha fields |

Notes:
- Hojicha isn't matcha, but people order it at the same counter and think of it as the same kind of drink, so it lives here. It has a little caffeine, so it counts.
- Coconut Matcha, Matcha Lemonade and Matcha Tonic are always iced: no Temperature field.

### 2.4 Tea

| Id | App name | Description | Caffeine | Widget name | Fields |
|---|---|---|---|---|---|
| `tea.english_breakfast` | English Breakfast | Strong black tea, often with milk | Yes | Breakfast Tea | Size, Temperature, Ice, Milk, Sweetness, Strength, Extras |
| `tea.earl_grey` | Earl Grey | Black tea with bergamot | Yes | Earl Grey | Size, Temperature, Ice, Milk, Sweetness, Strength, Extras |
| `tea.green` | Green Tea | Light, grassy green tea | Yes | Green Tea | Size, Temperature, Ice, Sweetness, Strength, Extras |
| `tea.jasmine` | Jasmine Tea | Green tea scented with jasmine flowers | Yes | Jasmine Tea | Size, Temperature, Ice, Sweetness, Strength, Extras |
| `tea.oolong` | Oolong | Half-oxidized tea, between green and black | Yes | Oolong | Size, Temperature, Ice, Sweetness, Strength |
| `tea.chai_latte` | Chai Latte | Spiced black tea with steamed milk | Yes | Chai Latte | Size, Temperature, Ice, Milk, Sweetness, Extras |
| `tea.bubble` | Bubble Tea | Milk tea with chewy tapioca pearls | Yes | Bubble Tea | Size, Ice, Milk, Sweetness, Extras |
| `tea.peppermint` | Peppermint | Herbal peppermint tea, caffeine-free | No | Peppermint | Size, Temperature, Ice, Sweetness, Strength, Extras |
| `tea.chamomile` | Chamomile | Herbal tea from chamomile flowers | No | Chamomile | Size, Temperature, Sweetness, Strength, Extras |
| `tea.ginger_lemon` | Ginger & Lemon | Fresh ginger and lemon in hot water | No | Ginger & Lemon | Size, Temperature, Sweetness, Extras |

Notes:
- Herbal (caffeine no): Peppermint, Chamomile, Ginger & Lemon. These are the drinks the caffeine note points to.
- Bubble Tea is usually iced, so its Temperature field is hidden; "hot" goes in the Note.

### 2.5 Smoothie & Juice

The category is always written **Smoothie & Juice** (CEO guideline 8), with the ampersand, in tabs, pickers and settings. In sentences the drink's own word is used instead, so a flare reads "Noa wants a smoothie" and not "Noa wants Smoothie & Juice". `wants` fills "{name} wants ___"; `label` fills "Your ___ flare".

| Id | App name | Description | Caffeine | Widget name | wants | label | Fields |
|---|---|---|---|---|---|---|---|
| `smoothie_juice.orange` | Fresh Orange Juice | Freshly squeezed oranges | No | Orange Juice | juice | juice | Size, Ice, Extras |
| `smoothie_juice.green_juice` | Green Juice | Pressed greens, apple and lemon | No | Green Juice | juice | juice | Size, Ice, Extras |
| `smoothie_juice.green_smoothie` | Green Smoothie | Spinach, banana and fruit, blended | No | Green Smoothie | a smoothie | smoothie | All Smoothie & Juice fields |
| `smoothie_juice.berry` | Berry Smoothie | Mixed berries blended with yogurt or milk | No | Berry Smoothie | a smoothie | smoothie | All Smoothie & Juice fields |
| `smoothie_juice.strawberry_banana` | Strawberry Banana | Strawberries and banana, blended smooth | No | Berry Banana | a smoothie | smoothie | All Smoothie & Juice fields |
| `smoothie_juice.mango` | Mango Smoothie | Ripe mango blended thick | No | Mango Smoothie | a smoothie | smoothie | All Smoothie & Juice fields |
| `smoothie_juice.acai` | Açaí Smoothie | Açaí berries blended with banana | No | Açaí Smoothie | a smoothie | smoothie | All Smoothie & Juice fields |
| `smoothie_juice.lemonade` | Lemonade | Fresh lemon, water and a little sugar | No | Lemonade | lemonade | lemonade | Size, Ice, Sweetness, Extras |
| `smoothie_juice.watermelon` | Watermelon Juice | Fresh watermelon, nothing else | No | Watermelon | juice | juice | Size, Ice, Extras |
| `smoothie_juice.carrot_ginger` | Carrot Ginger | Fresh carrot, orange and ginger | No | Carrot Ginger | juice | juice | Size, Ice, Extras |

Notes:
- Lemonade + Fresh mint is the lemon-mint people order across the Middle East. No separate drink needed.
- A custom drink in this category uses `wants` = "a drink" and `label` = "drink". Reason: we can't tell a custom smoothie from a custom juice, and the picture already shows the category.
- Search must match "acai" without accents.

### 2.6 Water

Water is tracked only. It's never a flare type and never takes a usual 3 slot (`DECISIONS.md`). No order details.

| Id | App name | Description | Caffeine | Widget name |
|---|---|---|---|---|
| `water.still` | Water | Still water | No | Water |
| `water.sparkling` | Sparkling Water | Water with bubbles | No | Sparkling |

The widget's water button logs `water.still` (`PRD.md` 3.11 rule 8). Sparkling is logged from the app. Hot water with lemon, coconut water and the rest log as Water. Reason: two water images in the asset budget, and nobody needs a breakdown of their water.

### 2.7 Option sets

Single choice unless marked **any**. Every field is optional and can be cleared. Keys are what `usual_drinks.details` stores (`ARCHITECTURE.md` 4.2). Changes from the prototype's `OPTS` are listed after the tables, with reasons.

**Shared lists**

| List | Values |
|---|---|
| `SIZE` | Small, Regular, Large |
| `MILK` | No milk, Whole milk, Skim milk, Oat milk, Almond milk, Soy milk, Coconut milk, Lactose-free milk |
| `ICE` (when Temperature is Iced, or the drink is always iced) | Light ice, Regular ice, Extra ice |

**Coffee**

| Key | Label | Values |
|---|---|---|
| `size` | Size | `SIZE` |
| `temp` | Temperature | Iced, Warm, Hot, Extra hot |
| `ice` | Ice | `ICE` |
| `shots` | Shots | Single shot, Double shot, Triple shot |
| `caf` | Caffeine | Full caffeine, Half-caf, Decaf |
| `milk` | Milk | `MILK` |
| `sweet` | Sweetness | No sugar, ½ sugar, 1 sugar, 2 sugars, Sweetener |
| `extras` | Extras (any) | Extra foam, No foam, Cold foam, Vanilla syrup, Caramel syrup, Hazelnut syrup, Cinnamon, Cocoa on top |

**Matcha**

| Key | Label | Values |
|---|---|---|
| `size` | Size | `SIZE` |
| `temp` | Temperature | Iced, Warm, Hot |
| `ice` | Ice | `ICE` |
| `milk` | Milk | `MILK` |
| `sweet` | Sweetness | Unsweetened, Lightly sweet, Sweet, Honey |
| `strength` | Strength | Light, Regular, Strong |
| `grade` | Grade | Ceremonial grade, Any grade is fine |
| `extras` | Extras (any) | Vanilla syrup, Cold foam, Extra foam |

**Tea**

| Key | Label | Values |
|---|---|---|
| `size` | Size | `SIZE` |
| `temp` | Temperature | Iced, Hot, Extra hot |
| `ice` | Ice | `ICE` |
| `milk` | Milk | No milk, Splash of milk, Whole milk, Oat milk, Almond milk, Soy milk, Lactose-free milk |
| `sweet` | Sweetness | No sugar, Less sweet, 1 sugar, 2 sugars, Honey, Sweetener |
| `strength` | Strength | Light, Regular, Strong, Leave the bag in |
| `extras` | Extras (any) | Lemon slice, Fresh mint, Ginger, Tapioca pearls (Bubble Tea only) |

**Smoothie & Juice**

| Key | Label | Values |
|---|---|---|
| `size` | Size | `SIZE` |
| `base` | Base | Water, Milk, Oat milk, Almond milk, Coconut water, Yogurt, Apple juice |
| `ice` | Ice | No ice, Light ice, Regular ice |
| `sweet` | Sweetness | No added sugar, A little honey, As it comes |
| `extras` | Add-ins (any) | Protein, Ginger shot, Chia seeds, Spinach, Peanut butter, Fresh mint |

**Every category**

| Key | Label | Input | Max (`PRD.md` 3.7) |
|---|---|---|---|
| `note` | Note | Free text | 120 |
| `planB` | Plan B | Free text | 80 |

**Changes from the prototype, and why**
- Coffee **Caffeine** is its own field (Full caffeine, Half-caf, Decaf). The prototype had Decaf inside Shots, so "double decaf" was impossible. The tracker reads `caf = Decaf` as not caffeinated.
- **Triple shot** added. People order it, and it's one chip.
- **Ice** is its own field for coffee, matcha and tea, shown only when Temperature is Iced or the drink is always iced. "Light ice" is one of the most common requests and had nowhere to go.
- **Coconut milk** added to `MILK`. Common in Asia and the Middle East.
- Coffee extras: **Cold foam, Hazelnut syrup, Cocoa on top** added.
- Matcha **Grade** added (Ceremonial grade, Any grade is fine). Pairs with Plan B ("If no ceremonial, get me a hojicha").
- Tea **Milk** is the real milk list plus "Splash of milk". The prototype's "Add" field mixed milk and lemon in one single choice, so "milk and sugar, lemon on the side" was impossible. Lemon moved to Extras.
- Tea **Strength** values say what people say: "Leave the bag in" replaces "Strong, bag left in".
- Tea **Extras** added: Lemon slice, Fresh mint, Ginger, Tapioca pearls. Tapioca pearls shows for Bubble Tea only. If Tech can't filter one value per drink cheaply, show it for all tea; it's harmless.
- Smoothie & Juice **Base** added. Smoothies are ordered by base more than anything else.
- Smoothie & Juice Sweetness "Regular" became **As it comes**, because "Regular" already means a size.
- **No straw** removed from Add-ins. It isn't an add-in, and the Note covers it.
- No tea type or steep-time field. Strength covers steeping in words people use; the tea type is the drink itself.

These sets are adopted in `PRD.md` 3.7 and in the `details` keys in `ARCHITECTURE.md` 4.2. There are no users yet, so nothing migrates.

### 2.8 Presets (onboarding step 3)

| Key | Label (max 22) | Drinks (#1, #2, #3) |
|---|---|---|
| `preset.mix` | A bit of everything | Flat White, Matcha Latte, Jasmine Tea |
| `preset.coffee` | Coffee all day | Latte, Americano, Cold Brew |
| `preset.matcha` | Mostly matcha | Matcha Latte, Ceremonial Matcha, Hojicha Latte |
| `preset.tea` | Tea and chai | English Breakfast, Chai Latte, Chamomile |

### 2.9 First swaps after beta

If beta data or "Add your own" names show demand, these are the first candidates to swap in. Each swap needs a new picture and an app release (images are bundled).
- Coffee: Spanish Latte (big in the Gulf and Asia), Turkish Coffee.
- Tea: Karak, Rooibos, Moroccan Mint.
- Smoothie & Juice: Pomegranate Juice, Peanut Butter Banana.

---

## 3. XP level names

Private. Shown only on your own profile (`PRD.md` 4.5). Thresholds are set by Product (`PRD.md` 4.4: 8 levels). Names are 16 characters or fewer; descriptions 70 or fewer.

| Level | Key | Name | Description (shown only to you) |
|---|---|---|---|
| 1 | `level.1` | First Sip | You're set up. Now find someone to have a coffee with. |
| 2 | `level.2` | Second Cup | A few breaks in. This is how it starts. |
| 3 | `level.3` | Regular | You turn up for breaks, and people turn up for yours. |
| 4 | `level.4` | Usual Order | Your friends could order for you by now. |
| 5 | `level.5` | Run Captain | You've carried a lot of cups back to a lot of desks. |
| 6 | `level.6` | House Blend | Plenty of breaks wouldn't have happened without you. |
| 7 | `level.7` | Kettle Keeper | Most days, you're the reason the kettle goes on. |
| 8 | `level.8` | Full Pot | Top level. There's nothing after this, so enjoy the coffee. |

---

## 4. UI copy deck

Grouped by screen. Inputs list their character limit as "input N" (limits from `PRD.md`; the app, the edge functions and the database checks in `ARCHITECTURE.md` 4.2 all use the same numbers).

### 4.1 Splash and sign in

| Key | Element | Text | Max |
|---|---|---|---|
| `splash.tagline` | Tagline | Drink breaks with your people. | 32 |
| `signin.invited` | Banner when arriving from an invite | {name} invited you | 30 |
| `signin.apple` | Button (iOS, Apple's own button) | Sign in with Apple | system |
| `signin.google` | Button (Android, Google's own button) | Continue with Google | system |
| `signin.phone` | Button | Continue with phone | 22 |
| `signin.other` | Text button | Other ways to sign in | 24 |
| `signin.google_other` | Under Other ways (iOS) | Continue with Google | system |
| `signin.apple_other` | Under Other ways (Android) | Continue with Apple | system |
| `signin.legal` | Footer, "Terms" and "Privacy Policy" are tappable | By continuing, you agree to the Terms. See the Privacy Policy for how we use your data. | 90 |
| `phone.title` | Title | What's your number? | 24 |
| `phone.helper` | Helper | Friends who have your number can find you. Nobody sees it. | 64 |
| `phone.country` | Field label | Country | 12 |
| `phone.field` | Field placeholder | Phone number | 16 |
| `phone.cta` | Button | Send code | 16 |
| `code.title` | Title | Enter the code | 20 |
| `code.sub` | Sub-line | Sent to {phone}. | 30 |
| `code.resend_wait` | Disabled button | Resend in {m:ss} | 18 |
| `code.resend` | Button | Resend code | 16 |
| `code.wrong_number` | Text button | Wrong number? | 16 |
| `code.slow` | Hint after 30 s | No code yet? Check the number, or resend. | 48 |
| `code.field` | Code field label (screen readers; the six boxes show the digits) | 6-digit code | 14 |
| `phone.country.pick` | Country picker sheet title | Pick your country | 20 |
| `signin.returning` | Toast when an account is found | Welcome back, {me}. | 28 |

**Age check** (after sign-in succeeds, before the account exists; `PRD.md` 3.1 rule 10). Neutral: no default, no hint of the cut-off.

| Key | Element | Text | Max |
|---|---|---|---|
| `age.title` | Title | When were you born? | 22 |
| `age.month` | Picker label | Month | 8 |
| `age.year` | Picker label | Year | 6 |
| `age.helper` | Helper. Never names the minimum age (neutral age screen). | A quick check. We don't save the date. | 50 |
| `age.cta` | Button | Continue | 12 |
| `age.too_young.title` | Refused screen title | Clink isn't for you yet | 26 |
| `age.too_young` | Refused screen body | Clink is for people {min} and over. | 40 |
| `age.too_young.close` | Refused screen button, back to the splash screen | Close | 8 |
| `age.m.1` | Month picker option | January | 9 |
| `age.m.2` | Month picker option | February | 9 |
| `age.m.3` | Month picker option | March | 9 |
| `age.m.4` | Month picker option | April | 9 |
| `age.m.5` | Month picker option | May | 9 |
| `age.m.6` | Month picker option | June | 9 |
| `age.m.7` | Month picker option | July | 9 |
| `age.m.8` | Month picker option | August | 9 |
| `age.m.9` | Month picker option | September | 9 |
| `age.m.10` | Month picker option | October | 9 |
| `age.m.11` | Month picker option | November | 9 |
| `age.m.12` | Month picker option | December | 9 |

### 4.2 Invite check (iOS, before sign-in) and invite arrival

| Key | Element | Text | Max |
|---|---|---|---|
| `invite.paste.title` | iOS "Got an invite?" title | Got an invite? | 18 |
| `invite.paste.body` | Body | If a friend sent you Clink, paste their invite and you'll start as friends. | 80 |
| `invite.paste.button` | System paste control | Paste | system |
| `invite.paste.type` | Text button | Type the code instead | 24 |
| `invite.paste.field` | Field placeholder | 8-character code | 20 |
| `invite.paste.skip` | Text button | Skip | 8 |
| `invite.fallback.title` | "Did someone invite you?" title (attribution failed) | Did someone invite you? | 26 |
| `invite.fallback.body` | Body | People in your contacts who are on Clink. | 48 |
| `invite.fallback.add` | Row button | Add | 8 |
| `invite.fallback.skip` | Text button | No, carry on | 14 |
| `invite.welcome` | Banner after a matched invite (new users) | You and {name} are friends now. | 40 |
| `invite.not_known` | Text button on the banner | Not someone you know? | 24 |
| `invite.not_known.done` | Toast after it | Removed and blocked {name}. | 34 |
| `invite.confirm.title` | Confirm card, existing users | Add {name} as a friend? | 30 |
| `invite.confirm.body` | Card body | You'll see each other's snaps and flares. | 44 |
| `invite.confirm.add` | Button | Add | 8 |
| `invite.confirm.no` | Text button | Not now | 10 |

The invite check shows only when the clipboard holds a probable web URL (`PRD.md` 3.2 rule 9). Before sign-in, the arrival banner `signin.invited` shows the inviter's first name and initials, never a photo.

### 4.3 Onboarding

Progress label on steps 2 to 6: `onb.progress` = "{n} of 6" (max 8). Back button is the system back.

**Step 2: name and photo**

| Key | Element | Text | Max |
|---|---|---|---|
| `onb.name.title` | Title | What should friends call you? | 32 |
| `onb.name.field` | Field placeholder (input 30) | Your name | 16 |
| `onb.name.helper` | Helper | First name is fine. | 24 |
| `onb.photo.add` | Button | Add a photo | 16 |
| `onb.photo.change` | Button | Change photo | 16 |
| `onb.photo.helper` | Helper | Optional. Friends see it on their widget. | 44 |
| `onb.photo.take` | Action sheet | Take photo | 16 |
| `onb.photo.library` | Action sheet | Choose from library | 22 |
| `onb.photo.remove` | Action sheet | Remove photo | 16 |
| `onb.cta` | Button (all steps) | Continue | 12 |

**Step 3: usual 3**

| Key | Element | Text | Max |
|---|---|---|---|
| `onb.usual.title` | Title | What do you usually drink? | 30 |
| `onb.usual.sub` | Sub-line | Pick up to 3. Your #1 goes on your widget and starts quick flares. | 72 |
| `cat.coffee` | Tab | Coffee | 8 |
| `cat.matcha` | Tab | Matcha | 8 |
| `cat.tea` | Tab | Tea | 8 |
| `cat.smoothie_juice` | Tab | Smoothie & Juice | 16 |
| `onb.usual.presets` | Section label | Or start with | 16 |
| `usual.slot` | Slot label | #{n} | 3 |
| `usual.slot_empty` | Empty slot | Pick a drink | 14 |
| `usual.make_yours` | Button on each slot | Make it yours | 16 |
| `usual.make_yours_helper` | Helper, first slot only | Milk, size, sugar and a note. Optional. | 44 |
| `usual.replaced` | Toast when a 4th drink is picked | {drink} replaced #3. | 44 |
| `usual.add_own` | Button | Add your own | 16 |
| `custom.title` | Sheet title | Add your own | 16 |
| `custom.field` | Field placeholder (input 30) | Drink name | 16 |
| `custom.cat_label` | Label | Which kind? | 14 |
| `custom.cat_helper` | Helper | This picks the picture and the options. | 44 |
| `custom.cta` | Button | Add | 8 |

**Step 4: invite friends**

| Key | Element | Text | Max |
|---|---|---|---|
| `onb.invite.title` | Title | Who do you take breaks with? | 30 |
| `onb.invite.sub` | Sub-line | Clink gets better when at least 2 friends are on it. | 54 |
| `onb.invite.meter` | Progress meter, 0 to 2 invites | {n} of 2 | 8 |
| `onb.invite.meter_more` | Progress meter after 2 invites; keeps counting with no ceiling (DECISIONS.md) | {n} invited | 12 |
| `share.whatsapp` | Button | WhatsApp | 10 |
| `share.messages` | Button | Messages | 10 |
| `share.more` | Button (system share sheet) | More | 8 |
| `onb.invite.on_clink` | Section label | Already on Clink | 18 |
| `onb.invite.find` | Button (before contacts permission) | Find friends in contacts | 26 |
| `contact.add` | Row button | Add | 8 |
| `contact.added` | Row state | Added | 8 |
| `contact.requested` | Row state | Requested | 10 |
| `onb.invite.contacts_off` | Line when contacts are denied | Contacts are off. You can still send invites above. | 56 |
| `onb.invite.none_found` | Line when no contacts match | None of your contacts are on Clink yet. | 44 |
| `onb.phone.title` | Card (Apple and Google users with no phone) | Add your number so friends can find you | 42 |
| `onb.phone.helper` | Card helper | Optional. Nobody sees it. | 28 |
| `onb.phone.cta` | Card button | Add number | 12 |
| `onb.phone.added` | Line after the number is saved | Number added. Nobody sees it. | 30 |
| `onb.later` | Text button | Later | 8 |

**Step 5: notifications pre-prompt**: see 4.25.

**Step 6: add the widget**

| Key | Element | Text | Max |
|---|---|---|---|
| `onb.widget.title` | Title | Put Clink on your home screen | 32 |
| `onb.widget.sub` | Sub-line | Friends' snaps and flares show up there. Most of Clink happens on it. | 72 |
| `onb.widget.ios.1` | iOS step 1 | Touch and hold an empty spot on your home screen. | 52 |
| `onb.widget.ios.2` | iOS step 2 | Tap Edit, then Add Widget. | 32 |
| `onb.widget.ios.3` | iOS step 3 | Search for Clink, pick Medium, then tap Add Widget. | 56 |
| `onb.widget.and.1` | Android step 1 | Touch and hold an empty spot on your home screen. | 52 |
| `onb.widget.and.2` | Android step 2 | Tap Widgets. | 16 |
| `onb.widget.and.3` | Android step 3 | Find Clink and drag the medium widget onto your screen. | 60 |
| `onb.widget.and.pin` | Android button, if the launcher supports pinning | Add it for me | 16 |
| `onb.widget.done` | Button | I added it | 14 |
| `onb.widget.later` | Text button | Remind me later | 18 |
| `onb.widget.retry.title` | Title when no widget is found | Can't see it yet | 20 |
| `onb.widget.retry.body` | Body | Clink can't find the widget. Try the steps again, or skip for now. | 70 |
| `onb.widget.retry.again` | Button | Try again | 12 |
| `onb.widget.retry.skip` | Text button | Skip for now | 14 |

iOS 17 uses a different flow (the + button). The app picks the set by OS version:

| Key | Element | Text | Max |
|---|---|---|---|
| `onb.widget.ios17.1` | iOS 17 step 1 | Touch and hold an empty spot until the apps jiggle. | 52 |
| `onb.widget.ios17.2` | iOS 17 step 2 | Tap + at the top left. | 32 |
| `onb.widget.ios17.3` | iOS 17 step 3 | Search for Clink, pick Medium, then tap Add Widget. | 56 |

The iOS and Android step wording must be checked against the OS versions current at build time; home-screen editing changes between releases and Android launchers differ.

### 4.4 Camera screen (main screen)

| Key | Element | Text | Max |
|---|---|---|---|
| `top.friends` | Friends pill | {n, plural, one {# friend} other {# friends}} | 12 |
| `top.friends_none` | Friends pill, no friends | Invite friends | 16 |
| `top.today.a11y` | Tracker chip label (the chip itself shows numerals and glyphs only) | {drinks, plural, one {# drink} other {# drinks}} and {water, plural, one {# water} other {# waters}} today | n/a |
| `top.profile.a11y` | Profile button label | Profile | 12 |
| `top.profile.dot.a11y` | Dot label after a level-up | New level | 12 |
| `cam.shutter.a11y` | Shutter label | Take a snap | 14 |
| `cam.flip.a11y` | Label | Switch camera | 14 |
| `cam.flash.on.a11y` / `.off` | Label | Flash on / Flash off | 10 |
| `compose.place` | Place field placeholder (input 40) | Where? (optional) | 18 |
| `compose.meet` | Line under the timing pills | Meet {time} | 14 |
| `compose.to` | To: chip | To: {audience} | 26 |
| `compose.send` | Primary button | Who joins? | 12 |
| `compose.no_friends` | Hint under the button, no friends | Flares go to friends. Invite one first. | 44 |
| `compose.audience_empty` | Hint, chosen group is empty | {group} is empty. Add people or pick Everyone. | 60 |
| `snap.share` | Button after shutter | Share snap | 12 |
| `snap.as_flare` | Button after shutter | Send as flare | 14 |
| `snap.retake` | Text button | Retake | 8 |
| `snap.place` | Place field on preview (input 40) | Add a place | 14 |
| `snap.preview.helper` | Helper on preview | Snaps go to all your friends for 24 hours. | 46 |
| `snap.shared` | Toast | Shared with your friends | 26 |
| `snap.shared_alone` | Toast, no friends yet | Shared. Only you can see it until friends join. | 50 |
| `replace.title` | Dialog title | Replace your live flare? | 26 |
| `replace.body` | Body | Your {cat} flare ends now. People who replied get a quiet heads-up. | 72 |
| `replace.yes` | Button | Replace | 10 |
| `replace.no` | Button | Keep it | 10 |
| `widget_card.title` | Card until a widget is detected | Add the widget | 16 |
| `widget_card.body` | Card body | Friends' snaps and flares show up there. | 42 |
| `widget_card.cta` | Card button | Show me how | 14 |
| `bar.in` | Camera bar, friend's flare | {name} wants {wants} · {mins} | 36 |
| `bar.run` | Camera bar, after your flare closed as done (2 h) | Run list | 10 |
| `off.pill` | Top bar, offline | Offline | 8 |

The camera bar for your own live flare reuses `live.title` and the countdown.

### 4.5 To: picker

| Key | Element | Text | Max |
|---|---|---|---|
| `aud.title` | Sheet title | Who gets this flare? | 22 |
| `aud.auto` | Row | Automatic | 12 |
| `aud.auto.sub` | Row sub-line | Right now: {audience} | 32 |
| `aud.group.sub` | Group row sub-line | {n, plural, one {# person} other {# people}} | 12 |
| `aud.group.empty_sub` | Group row sub-line, no members | Nobody in it yet | 18 |
| `aud.everyone` | Row | Everyone | 10 |
| `aud.everyone.sub` | Row sub-line | All {n} friends | 16 |
| `aud.footer` | Footer, groups set up | Automatic sends to {daytime} on weekdays 8:00 to 18:00, and to {other} the rest of the time. | 120 |
| `aud.footer_nogroups` | Footer, no groups | Automatic sends to Everyone until you set up groups. | 56 |
| `aud.private` | Footer second line | Only you see your groups. Snaps always go to everyone. | 58 |
| `compose.auto_tag` | Tag on the To: chip when Automatic picked the audience | Auto | 6 |

### 4.6 Timing

| Key | Element | Text | Max |
|---|---|---|---|
| `time.now` | Pill | Now | 5 |
| `time.pill` | Pill (5, 15, 30 and a picked Other value) | {n}m | 4 |
| `time.other` | Pill | Other | 6 |
| `time.other.title` | Sheet title | How long until you go? | 24 |
| `time.other.value` | Grid cell (5 to 60, step 5) | {n} min | 7 |
| `time.other.helper` | Helper | Up to an hour. The flare stays open until then, at least 15 minutes. | 72 |

A tap on a grid cell selects it and closes the sheet. There is no Set button (`DESIGN.md` 4.6).

### 4.7 Your live flare (sender)

| Key | Element | Text | Max |
|---|---|---|---|
| `live.title` | Title | Your {cat} flare | 22 |
| `live.meta` | Sub-line | {place} · meet {mins} | 56 |
| `live.meta_noplace` | Sub-line, no place | Meet {mins} | 14 |
| `live.countdown` | Countdown label | Open for {mm:ss} | 16 |
| `live.to` | Audience line | To {audience} | 24 |
| `live.empty` | No replies yet | Your friends have it. Replies show up here. | 46 |
| `live.reply.in` | Reply row | {name} is in | 24 |
| `live.reply.bring` | Reply row | {name}: {drink} | 46 |
| `live.reply.notes` | Note marker label on a row | 📝 Notes | 10 |
| `live.summary` | Count line | {in} in · {orders, plural, one {# drink} other {# drinks}} to bring | 32 |
| `live.going` | Button (shown after the first reply) | We're going | 14 |
| `live.cancel` | Text button | Cancel flare | 14 |
| `cancel.toast` | Snackbar after Cancel flare (5 s, with `snack.undo`) | Flare cancelled | 16 |
| `cancel.toast_replies` | Snackbar second line, when there are replies | People who replied get a quiet heads-up. | 42 |
| `snack.undo` | Snackbar action, everywhere | Undo | 6 |
| `done.title` | After We're going, or closed with replies | You're going | 14 |
| `done.title_timeup` | Closed at meet time with replies | Time to go | 12 |
| `done.sub` | Sub-line | {in} in · {orders, plural, one {# drink} other {# drinks}} to bring. This list stays here for 2 hours. | 80 |
| `expired.title` | Closed with no replies (app only) | Nobody was free this time. | 28 |
| `expired.sub` | Sub-line | Try again another time. | 26 |
| `run.title` | Section title | Drink run | 12 |
| `run.empty` | No Bring me one replies | No drinks to bring this time. | 32 |

### 4.8 Incoming flare (app)

| Key | Element | Text | Max |
|---|---|---|---|
| `in.title` | Headline | {name} wants {wants} | 32 |
| `in.meta` | Sub-line | {place} · {mins} | 52 |
| `in.meta_noplace` | Sub-line, no place | {mins} | 12 |
| `in.countdown` | Countdown label | Open for {mm:ss} | 16 |
| `in.others.n` | Others line, none are your friends | {n, plural, one {1 other is in} other {# others are in}} | 22 |
| `in.others.named` | Others line, some are your friends | {names} {rest, plural, =0 {} one {and 1 other} other {and # others}} {total, plural, one {is in} other {are in}} | 48 |
| `in.btn.in` | Button | I'm in | 8 |
| `in.btn.bring` | Button | Bring me one | 14 |
| `in.state.in` | State after replying | You're in | 12 |
| `in.state.bring` | State after Bring me one | You asked for {drink} | 46 |
| `in.withdraw` | Text button (I'm in) | Can't make it anymore | 24 |
| `in.withdraw_bring` | Text button (Bring me one) | Cancel my drink | 18 |
| `in.withdrawn.toast` | Toast after withdrawing I'm in | Done. {name} just sees one fewer. | 40 |
| `in.switch_to_bring` | Text button | Ask for a drink instead | 26 |
| `in.switch_to_in` | Text button | I'll come instead | 20 |
| `in.ended` | Flare ended | This flare has ended. | 24 |
| `in.cancelled` | Sender cancelled | {name} called this one off. | 36 |
| `in.list.title` | Two or more flares | {n} flares open | 18 |

### 4.9 Bring me one

| Key | Element | Text | Max |
|---|---|---|---|
| `bring.title` | Sheet title | What should {name} bring? | 32 |
| `bring.row.sub` | Drink row sub-line | {summary} | 40 |
| `bring.row.no_details` | Drink row sub-line, no details | No details yet | 16 |
| `bring.once.label` | Field label | Anything different today? | 28 |
| `bring.once.field` | Placeholder (input 80) | Iced today | 14 |
| `bring.once.helper` | Helper | Only {name} sees this, and only this time. | 48 |
| `bring.cta` | Button | Ask {name} | 18 |
| `bring.sent` | Toast | Sent to {name} | 22 |
| `bring.nudge.title` | Dialog, first time with no details | Add how you like it? | 22 |
| `bring.nudge.body` | Body | Milk, size, sugar. Saved for every run after this. | 54 |
| `bring.nudge.add` | Button | Add details | 14 |
| `bring.nudge.skip` | Button | Send as is | 12 |
| `bring.nudge_after.title` | Shown once on next app open, after a widget send with no details | Your {drink} went with no details | 58 |
| `bring.nudge_after.body` | Body | Add how you like it, so the next run gets it right. | 54 |
| `bring.nudge_after.later` | Button | Not now | 10 |
| `bring.no_usual` | Replier has no usual 3 | Pick your usual 3 first, so {name} knows what to bring. | 64 |
| `bring.no_usual.cta` | Button | Pick drinks | 14 |
| `bring.cancel.title` | Dialog | Cancel your {drink}? | 44 |
| `bring.cancel.body` | Body | {name} gets a quiet heads-up so they don't buy it. | 56 |
| `bring.cancel.yes` | Button | Cancel drink | 14 |
| `bring.cancel.no` | Button | Keep it | 10 |

`{summary}` is up to three set values joined by " · " in field order, for example "Oat milk · Extra hot · Double shot". If more are set, end with " · +{n}".

### 4.10 Order card and Show to barista

| Key | Element | Text | Max |
|---|---|---|---|
| `order.title` | Title (run list) | {name}'s order | 24 |
| `order.title_usual` | Title (from Friends) | {name}'s usual | 24 |
| `order.label.size` … `order.label.extras` | Field labels | Size, Temperature, Ice, Shots, Caffeine, Milk, Sweetness, Strength, Grade, Base, Extras, Add-ins | 12 each |
| `order.label.note` | Label | Note | 6 |
| `order.label.once` | Label | Just this time | 16 |
| `order.label.planb` | Label | Plan B | 8 |
| `order.no_details` | No details saved | No details saved. | 20 |
| `order.usual_footer` | Footer (from Friends) | Handy for surprise drinks. | 28 |
| `order.barista` | Button | Show to barista | 18 |
| `barista.today` | Label in front of the one-time note | Today: | 8 |
| `barista.planb` | Label | Plan B: | 8 |
| `barista.for` | Small line | For {name} | 16 |
| `barista.count` | Pager | {i} of {n} | 8 |
| `barista.close.a11y` | Label | Close | 8 |
| `barista.swipe.a11y` | Label | Swipe for the next order | 26 |

Show to barista layout (order set by Copy; type sizes by `DESIGN.md`): drink name, then the one-time note with "Today:", then each set field value on its own line in field order, then the Note, then "Plan B:". Values are shown as plain words ("Oat milk", "Extra hot"), never composed into a sentence. Reason: a barista scans lines, and composed sentences don't survive translation.

### 4.11 Snaps

| Key | Element | Text | Max |
|---|---|---|---|
| `snapv.meta` | Viewer header | {name} · {ago} · {place} | 60 |
| `snapv.meta_noplace` | Viewer header, no place | {name} · {ago} | 24 |
| `snapv.react.a11y` | Reaction labels | React with coffee / matcha / tea / heart / laughing | 22 |
| `snapv.more.a11y` | ⋯ button label | More options | 14 |
| `snapv.report` | Menu | Report snap | 14 |
| `snapv.block` | Menu | Block {name} | 20 |
| `snapv.swipe_hint` | First time only | Swipe for more snaps | 22 |
| `snapv.mine` | Own snap footer | Your snap · gone in {hours}h | 28 |
| `snapv.mine.reacts` | Own snap, reactions | {first} {rest, plural, =0 {reacted} one {and 1 other reacted} other {and # others reacted}} | 36 |
| `snapv.mine.delete` | Menu | Delete snap | 14 |
| `snapv.delete.title` | Dialog | Delete this snap? | 20 |
| `snapv.delete.body` | Body | It comes off your friends' widgets. | 38 |
| `snapv.delete.yes` | Button | Delete | 8 |
| `snapv.delete.no` | Button | Keep it | 10 |
| `snapv.gone` | Snap expired or removed | This snap is gone. | 20 |

### 4.12 Friends

| Key | Element | Text | Max |
|---|---|---|---|
| `friends.title` | Sheet title | Friends | 10 |
| `friends.count` | Count | {n} of 20 | 8 |
| `friends.sec.groups` | Section | Groups | 10 |
| `friends.sec.requests` | Section | Requests | 10 |
| `friends.sec.friends` | Section | Friends | 10 |
| `friends.sec.contacts` | Section | On Clink from your contacts | 30 |
| `friends.share.title` | Share row title | Bring someone in | 18 |
| `friends.last_drink` | Row sub-line (opt-in only) | last drink {ago} ago | 24 |
| `friends.last_drink_now` | Row sub-line, under a minute | last drink just now | 24 |
| `friends.usual.a11y` | 📝 label | See {name}'s usual | 24 |
| `friends.req.row` | Request row | {name} wants to be friends | 36 |
| `friends.req.accept` | Button | Accept | 8 |
| `friends.req.helper` | Under requests | Leave one alone and it quietly expires after 30 days. | 56 |
| `friends.menu.usual` | Row menu | See usual | 12 |
| `friends.menu.group` | Row menu | Add to group | 14 |
| `friends.menu.remove` | Row menu | Remove friend | 16 |
| `friends.menu.block` | Row menu | Block | 8 |
| `friends.menu.report` | Row menu | Report | 8 |
| `remove.toast` | Snackbar after Remove friend (5 s, with `snack.undo`) | Removed {name}. They won't know. | 40 |
| `friends.full` | Caption where the share buttons were, at 20 friends | You're at 20 friends. | 22 |
| `cap.title` | Dialog at 20 friends (accepting, or opening an invite) | You're at 20 friends | 22 |
| `cap.body` | Body | Remove someone to add {name}. | 36 |
| `cap.cta` | Button | See friends | 14 |
| `suggest.title` | One-time card at 6 friends | Split work and home? | 22 |
| `suggest.body` | Body | Make a Work group and a Home friends group, and flares go to the right people by time of day. Only you see groups. | 120 |
| `suggest.yes` | Button | Set them up | 14 |
| `suggest.no` | Text button | No thanks | 10 |
| `suggest.name.work` | Default group name | Work | 20 |
| `suggest.name.home` | Default group name | Home friends | 20 |

### 4.13 Groups

| Key | Element | Text | Max |
|---|---|---|---|
| `group.new` | Button | New group | 12 |
| `group.title_new` | Sheet title | New group | 12 |
| `group.title_edit` | Sheet title | Edit group | 12 |
| `group.name` | Field label | Name | 6 |
| `group.name.field` | Placeholder (input 20) | Work, Climbing, Uni | 22 |
| `group.emoji` | Field label | Emoji | 6 |
| `group.members` | Section | Who's in? | 10 |
| `group.done` | Button | Done | 6 |
| `group.delete` | Text button | Delete group | 14 |
| `group.deleted` | Snackbar after Delete group (5 s, with `snack.undo`) | Deleted {group} | 30 |
| `group.auto.label` | Row label | Automatic uses this for | 26 |
| `group.auto.weekdays` | Option | Weekdays 8:00 to 18:00 | 24 |
| `group.auto.other` | Option | Other times | 12 |
| `group.auto.neither` | Option | Neither | 8 |
| `group.auto.taken` | Option sub-line when another group has that slot | Used by {group} | 30 |
| `group.private` | Footer | Only you see your groups. Nobody knows which ones they're in. | 64 |
| `group.everyone.sub` | Everyone row sub-line | All your friends. This one can't be edited. | 46 |
| `group.cap` | Hint at 10 groups | You can have up to 10 groups. | 32 |

### 4.14 My usual 3 and the details editor

| Key | Element | Text | Max |
|---|---|---|---|
| `usual.title` | Title | My usual 3 | 12 |
| `usual.sub` | Sub-line | #1 is on your widget and starts quick flares. Drag to reorder. | 66 |
| `usual.edit_details` | Slot button, details set | Edit details | 14 |
| `usual.slot1_helper` | Caption on slot 1 | On your widget | 16 |
| `cat.count` | Catalog category header | {n} drinks | 10 |
| `usual.replace` | Slot menu | Change drink | 14 |
| `usual.remove` | Slot menu | Remove | 8 |
| `usual.min` | Hint when removing the last drink | Keep at least one drink. | 26 |
| `det.title` | Editor title | How you like your {drink} | 48 |
| `det.any` | Multi-choice field hint | Pick any | 10 |
| `det.more` | Collapsed fields | More options | 14 |
| `det.note` | Label | Note | 6 |
| `det.note.field` | Placeholder (input 120) | Very hot, extra foam | 22 |
| `det.planb` | Label | Plan B | 8 |
| `det.planb.field` | Placeholder (input 80) | No oat? Almond is fine | 24 |
| `det.helper` | Footer | Friends see this when they bring you one. | 44 |
| `det.save` | Button | Done | 6 |
| `det.clear` | Text button | Clear all | 10 |
| `det.saved` | Toast | Saved | 8 |
| `usual.preset_set` | Undo snackbar after a preset fills the usual 3 | Set to {preset}. | 30 |

Field labels and values come from section 2.7. Closing the editor any way saves; there is no discard dialog (`DESIGN.md` 8 rule 8).

### 4.15 Today (tracker) and the caffeine note

| Key | Element | Text | Max |
|---|---|---|---|
| `today.title` | Sheet title | Today | 6 |
| `today.drinks` | Count | {n, plural, one {# drink} other {# drinks}} | 10 |
| `today.water` | Count | {n, plural, one {# water} other {# waters}} | 10 |
| `today.last` | Line | Last drink {ago} ago | 22 |
| `today.last_now` | Line, under a minute | Last drink just now | 22 |
| `today.row` | Entry row | {time} · {drink} | 42 |
| `today.entries` | Section header | Entries | 10 |
| `today.undo` | Button | Undo last | 10 |
| `today.remove` | Row swipe action | Remove | 8 |
| `today.removed` | Toast | Removed {drink} | 40 |
| `today.logged` | Undo snackbar after a quick log | Logged {drink} | 40 |
| `today.log` | Button | Log a drink | 12 |
| `today.log.water` | Picker row | Water | 10 |
| `today.log.sparkling` | Picker row | Sparkling Water | 16 |
| `today.log.other` | 6th quick-log button; opens the catalog to log any drink | Something else | 16 |
| `today.footer` | Footer | Only you see this. It resets at midnight. | 44 |
| `today.sharing_on` | Footer line when last-drink sharing is on | Friends see when you last had a drink, nothing else. | 54 |
| `caff.day` | Caffeine note, before 17:00 local | Water or a herbal tea next, maybe. | 36 |
| `caff.evening` | Caffeine note, 17:00 and later | Herbal tea is a nice switch tonight. | 38 |
| `caff.widget` | Widget subline version | Herbal tea next? | 18 |

The note shows after the 4th caffeinated drink of the day (`PRD.md` 3.11). No numbers, no health words.

With nothing logged, the sheet shows one line, `empty.today` (4.21), under the quick-log row, and no `today.last` line. The old `today.last_none` key is removed (DECISIONS.md, "CEO answers after placing the Android widget").

### 4.16 Profile and XP

| Key | Element | Text | Max |
|---|---|---|---|
| `profile.edit` | Button | Edit | 6 |
| `profile.level` | Level line | Level {n} · {level_name} | 28 |
| `profile.level_desc` | Description | (from section 3) | 70 |
| `profile.to_next` | Hint under the progress bar | {xp} more to reach {next_level_name} | 34 |
| `profile.top` | Progress line at level 8 | Top level | 10 |
| `profile.level_n` | Level number above the level name | Level {n} | 10 |
| `profile.total` | Your XP, the number above the progress bar | {xp} XP | 10 |
| `profile.private` | Footer | Only you can see your level. | 30 |
| `profile.how` | Text button | How XP works | 14 |
| `profile.history` | Section | Recent | 8 |
| `profile.history_empty` | Empty | Nothing yet. Join a flare or invite a friend to get going. | 60 |
| `profile.levelup` | Banner, shown once on the next open after a level-up | New level: {level_name} | 30 |
| `xp.how.title` | Sheet title | How XP works | 14 |
| `xp.how.1` | Row | A friend joins Clink through you · +50 | 40 |
| `xp.how.2` | Row | A new friend, any other way · +10 | 36 |
| `xp.how.3` | Row | You join a friend's flare · +10 | 34 |
| `xp.how.4` | Row | Someone joins your flare · +15 | 32 |
| `xp.how.5` | Row | You bring a drink back for a friend · +20 | 44 |
| `xp.how.6` | Row | You log a drink, once a day · +5 | 34 |
| `xp.how.footer` | Footer | XP comes from breaks that happen. Sending flares and snaps earns nothing. Daily limits apply. | 96 |

XP history entries (`{xp}` is signed: "+50", "−50"):

| Key | Text | Max |
|---|---|---|
| `xp.e.invite` | {name} joined through you · {xp} | 40 |
| `xp.e.friend` | New friend: {name} · {xp} | 36 |
| `xp.e.joined` | You joined {name}'s flare · {xp} | 40 |
| `xp.e.replied` | People joined your flare · {xp} | 34 |
| `xp.e.run` | Drink run for {name} · {xp} | 36 |
| `xp.e.log` | Logged a drink · {xp} | 24 |
| `xp.e.adjust` | Invite XP adjusted · {xp} | 28 |
| `xp.e.log_undo` | Today's log undone · {xp} | 28 |

`xp.e.adjust` names nobody on purpose. Invite XP is reversed when the invitee deletes their account or the friendship ends (`PRD.md` 4.3 rule 2). Naming the person would tell you they removed you, and removal is silent.

### 4.17 Settings

No quiet hours, no time windows, no do-not-disturb option (`PRD.md` 3.14).

| Key | Element | Text | Max |
|---|---|---|---|
| `set.title` | Title | Settings | 10 |
| `set.sec.profile` | Section | Profile | 10 |
| `set.name` | Row | Name | 6 |
| `set.photo` | Row | Photo | 6 |
| `set.usual` | Row | My usual 3 | 12 |
| `set.sec.groups` | Section | Groups | 10 |
| `set.groups.daytime` | Row | Daytime group | 16 |
| `set.groups.daytime.sub` | Sub-line | Weekdays 8:00 to 18:00 | 28 |
| `set.groups.other` | Row | Other times | 12 |
| `set.groups.other.sub` | Sub-line | Evenings and weekends | 24 |
| `set.groups.none` | Value when unset | None (Everyone) | 16 |
| `set.groups.manage` | Row | Edit groups | 14 |
| `set.sec.widgets` | Section | Widgets | 10 |
| `set.widgets.row` | Row per widget | {size} widget · {audience} | 32 |
| `set.widgets.sub` | Row sub-line | Who joins? goes to {audience} | 36 |
| `set.widgets.size.small` / `.medium` | Size word | Small / Medium | 8 |
| `set.widgets.none` | Empty | No Clink widget on your home screen yet. | 44 |
| `set.widgets.guide` | Row | How to add a widget | 22 |
| `set.widgets.small_note` | Sub-line on a small widget | Small widgets have no Who joins? button. | 42 |
| `set.widgets.ios_hint` | Footer on iOS (the list is read-only) | To change one, hold the widget, then tap Edit Widget. | 56 |
| `set.widgets.row_plain` | Row for a small widget (it has no audience) | {size} widget | 16 |
| `set.widgets.auto_now` | Sub-line on a medium widget set to Automatic | Who joins? goes to {audience} right now | 44 |
| `set.sec.notifs` | Section | Notifications | 14 |
| `set.n.flares` | Toggle | Friend flares | 16 |
| `set.n.flares.sub` | Sub-line | "Maya wants matcha · in 10 min" | 34 |
| `set.n.replies` | Toggle | Replies to my flares | 22 |
| `set.n.replies.sub` | Sub-line | "Leo is in", "Sam wants a drink" | 34 |
| `set.n.snaps` | Toggle | Friend snaps | 14 |
| `set.n.snaps.sub` | Sub-line | Off by default. Snaps show on your widget anyway. | 52 |
| `set.n.reactions` | Toggle | Reactions | 10 |
| `set.n.reactions.sub` | Sub-line | One quiet alert per snap. | 28 |
| `set.n.friends` | Toggle | Friends | 10 |
| `set.n.friends.sub` | Sub-line | Friend requests and people who join through you. | 52 |
| `set.n.off.title` | Card when system notifications are off | Notifications are off | 24 |
| `set.n.off.body` | Card body | You'll only see flares when you open the app. Turn them on in Settings. | 72 |
| `set.n.off.cta` | Card button | Open Settings | 14 |
| `set.sec.privacy` | Section | Privacy | 10 |
| `set.p.last` | Toggle (off by default) | Friends see my last drink | 28 |
| `set.p.last.sub` | Sub-line | They see the time only, like "1h 42m ago". Never what or how many. | 70 |
| `set.p.contacts` | Toggle | Contact matching | 18 |
| `set.p.contacts.sub` | Sub-line | Checks your contacts for friends on Clink, at most once a day. | 64 |
| `set.p.discoverable` | Toggle (on by default) | People with my number can find me | 36 |
| `set.p.discoverable.sub` | Sub-line | Turn this off and nobody finds you through their contacts. | 62 |
| `set.p.usage` | Toggle (on by default) | Share usage stats | 18 |
| `set.p.usage.sub` | Sub-line | Which screens and buttons get used. Never what you write or snap. | 70 |
| `set.p.reset_invites` | Row | Stop my old invites | 20 |
| `set.p.reset_invites.sub` | Sub-line | Invites you already sent stop working. New ones work as normal. | 66 |
| `set.p.reset_invites.done` | Toast | Old invites stopped. | 22 |
| `set.p.see` | Row | What friends can see | 22 |
| `set.p.policy` | Row | Privacy Policy | 16 |
| `set.sec.account` | Section | Account | 10 |
| `set.a.phone` | Row | Phone number | 14 |
| `set.a.phone_add` | Row, none set | Add phone number | 18 |
| `set.a.phone_card.title` | Card (Apple or Google, no phone) | Add your number | 18 |
| `set.a.phone_card.body` | Card body | So friends can find you, and so you can sign in on a new phone. | 66 |
| `set.a.methods` | Row | Ways to sign in | 16 |
| `set.a.signout` | Row | Sign out | 10 |
| `set.a.delete` | Row (destructive) | Delete account | 16 |
| `set.sec.blocked` | Section and screen | Blocked people | 16 |
| `set.blocked.empty` | Empty | Nobody blocked. | 16 |
| `set.blocked.unblock` | Row button | Unblock | 8 |
| `unblock.title` | Dialog | Unblock {name}? | 24 |
| `unblock.body` | Body | They won't be added back as a friend. | 40 |
| `set.sec.help` | Section | Help | 6 |
| `set.h.contact` | Row (opens an email to support@{domain}) | Contact us | 12 |
| `set.h.report` | Row | Report a problem | 18 |
| `set.h.guidelines` | Row | Community Guidelines | 22 |
| `set.h.terms` | Row | Terms | 6 |
| `set.h.policy` | Row | Privacy Policy | 16 |
| `set.h.licenses` | Row | Open-source licenses | 22 |
| `set.h.version` | Row | Version {v} | 20 |

Android widget configuration screen (shown when a medium widget is added):

| Key | Element | Text | Max |
|---|---|---|---|
| `wcfg.title` | Title | Who joins? sends to | 22 |
| `wcfg.auto` | Option | Automatic | 12 |
| `wcfg.auto.sub` | Sub-line | Work hours or not, picked by the clock | 40 |
| `wcfg.everyone` | Option | Everyone | 10 |
| `wcfg.cta` | Button | Add widget | 12 |

iOS uses the same option names in the system Edit Widget screen: parameter title `wcfg.title`, options from `wcfg.*`.

### 4.18 What friends can see (Privacy)

Legal must check this screen against the privacy policy and store forms (`PRD.md` 3.17).

| Key | Element | Text | Max |
|---|---|---|---|
| `see.title` | Title | What friends can see | 22 |
| `see.friends` | Section | Friends can see | 16 |
| `see.f.1` | Row | Your name and photo | 22 |
| `see.f.2` | Row | Your snaps, for 24 hours | 26 |
| `see.f.3` | Row | Flares you send to them | 26 |
| `see.f.4` | Row | Your usual 3 and how you like them | 36 |
| `see.f.5` | Row | When you last had a drink, only if you turn it on | 52 |
| `see.only_you` | Section | Only you can see | 18 |
| `see.o.1` | Row | Your phone number | 20 |
| `see.o.2` | Row | How many drinks and waters you've had | 40 |
| `see.o.3` | Row | Your level and XP | 20 |
| `see.o.4` | Row | Your groups, and who's in them | 32 |
| `see.o.5` | Row | Who you removed or blocked | 28 |
| `see.o.6` | Row | Flares you didn't reply to | 28 |
| `see.others` | Section | Other people can see | 22 |
| `see.x.1` | Row | Your first name, if they have one of your invites | 52 |
| `see.x.2` | Row | Your name and photo, if they have your number and you let them find you | 74 |
| `see.x.3` | Row | Your name and photo, while a friend request between you is open | 66 |
| `see.footer` | Footer | People in the same flare who aren't your friends see a count, never your name. | 82 |
| `see.preview_off` | Live preview value when last-drink sharing is off | Nothing | 8 |

### 4.19 Report and block

| Key | Element | Text | Max |
|---|---|---|---|
| `report.title.snap` | Sheet title | Report this snap | 18 |
| `report.title.photo` | Sheet title | Report this photo | 18 |
| `report.title.person` | Sheet title | Report {name} | 20 |
| `report.r.1` | Reason | Nudity or sexual content | 26 |
| `report.r.2` | Reason | Harassment or bullying | 24 |
| `report.r.3` | Reason | Spam | 6 |
| `report.r.4` | Reason | Something else | 16 |
| `report.r.5` | Reason (handled first) | I'm in it and didn't agree | 28 |
| `report.guidelines` | Link under the reasons | Community Guidelines | 22 |
| `report.more` | Field placeholder (input 200) | Tell us more (optional) | 24 |
| `report.cta` | Button | Send report | 12 |
| `report.done` | Confirmation | Thanks. It's hidden for you, and we review reports within 24 hours. | 70 |
| `report.done_soft` | Confirmation if 24-hour review isn't staffed | Thanks. It's hidden for you, and we'll review it soon. | 56 |
| `report.block_ask` | Follow-up line | Block {name} too? | 20 |
| `report.block_yes` | Button | Block | 8 |
| `report.block_no` | Button | Not now | 10 |
| `block.title` | Dialog | Block {name}? | 20 |
| `block.body` | Body | They're removed from your friends and can't find you on Clink. They won't be told. | 86 |
| `block.yes` | Button | Block | 8 |
| `block.no` | Button | Cancel | 8 |
| `block.done` | Toast | {name} is blocked. | 24 |

Ship `report.done` only once someone is named to review reports within 24 hours (`PRD.md` 8, question 2). Until then ship `report.done_soft`.

Reason ids map to the database values in `packages/shared`: `report.r.1` nudity, `.2` harassment, `.3` spam, `.4` other, `.5` not_consented.

**Moderation notices** (statement of reasons, shown on next app open; `PRD.md` 3.18 rule 6). "We" is right here: a real person reviewed it. Plain and exact, no humor.

| Key | Element | Text | Max |
|---|---|---|---|
| `mod.removed.title` | Sheet title | We took down your {item} | 30 |
| `mod.item.snap` / `.photo` / `.name` / `.text` | `{item}` values | snap / photo / name / text | 6 |
| `mod.removed.body` | Body | It broke the Community Guidelines: {reason}. If we got it wrong, email support@{domain}. | 130 |
| `mod.reason.*` | `{reason}` values | the `report.r.1` to `.5` labels, lower case, plus "a word that isn't allowed" | 28 |
| `mod.ok` | Button | OK | 4 |
| `err.suspended.title` | Full-screen state | Your account is suspended | 28 |
| `err.suspended` | Body | It broke the Community Guidelines: {reason}. If this is a mistake, email support@{domain}. | 130 |

### 4.20 Delete account

| Key | Element | Text | Max |
|---|---|---|---|
| `del.title` | Screen title | Delete your account | 20 |
| `del.1` | Point | You disappear from your friends' Clink right away. | 52 |
| `del.2` | Point | Any live flare is cancelled. | 30 |
| `del.3` | Point | Your photos, snaps, drinks, groups and level are deleted within 30 days. | 76 |
| `del.4` | Point | This can't be undone. Signing in again starts a new, empty account. | 70 |
| `del.cta` | Button (destructive) | Delete account | 16 |
| `del.keep` | Button | Keep my account | 16 |
| `del.confirm.title` | Dialog | Delete for good? | 18 |
| `del.confirm.body` | Body | You can't undo this. | 22 |
| `del.confirm.yes` | Button | Delete | 8 |
| `del.confirm.no` | Button | Cancel | 8 |
| `del.deleting` | Button while deletion runs | Deleting… | 12 |
| `del.done` | Toast on the splash screen | Your account is deleted. | 26 |
| `del.error` | Error | Couldn't delete your account. Check your connection and try again. | 70 |

### 4.21 Empty states

| Key | Where | Text | Max |
|---|---|---|---|
| `empty.friends` | Friends sheet, no friends | No friends here yet. Send someone Clink and they'll show up. | 64 |
| `empty.requests` | Requests section | (section hidden) | n/a |
| `empty.contacts` | On Clink from your contacts | None of your contacts are on Clink yet. | 44 |
| `empty.groups` | Groups section, under 6 friends | Just Everyone for now. Groups help once you have more friends. | 66 |
| `empty.group_members` | Group with nobody in it | Nobody in this group yet. Tick some friends below. | 52 |
| `empty.snaps` | Snap viewer, none in 24 hours | No snaps in the last 24 hours. | 32 |
| `empty.live_replies` | Live flare, no replies | Your friends have it. Replies show up here. | 46 |
| `empty.run` | Run list, no orders | No drinks to bring this time. | 32 |
| `empty.flares` | Incoming list, nothing open | No flares open right now. | 28 |
| `empty.today` | Today, nothing logged | Nothing yet today. Tap Log a drink when you have one. | 56 |
| `empty.usual` | My usual 3, none (returning edge case) | No usual drinks yet. Pick one and the widget can log it. | 58 |
| `empty.xp` | Profile history | Nothing yet. Join a flare or invite a friend to get going. | 60 |
| `empty.blocked` | Blocked people | Nobody blocked. | 16 |
| `empty.widgets` | Settings > Widgets | No Clink widget on your home screen yet. | 44 |
| `expired.title` | Your flare, nobody came | Nobody was free this time. | 28 |

### 4.22 Errors

| Key | Situation | Text | Max |
|---|---|---|---|
| `err.code_wrong` | Wrong SMS code | That code doesn't match. Try again. | 38 |
| `err.code_expired` | Code older than 10 minutes | That code has expired. Tap Resend code. | 42 |
| `err.code_locked` | 5 wrong codes | Too many tries. Try again in {n} minutes. | 44 |
| `err.phone_invalid` | Number won't parse | That number doesn't look right. Check the country too. | 56 |
| `err.phone_taken` | Adding a phone that belongs to another account | That number is on another Clink account. Sign in with it, or use a different number. | 88 |
| `err.signin_failed` | Apple or Google sign-in failed (cancel is silent) | Couldn't sign you in. Try again. | 34 |
| `err.invite_code` | Pasted or typed code doesn't work | That code didn't work. Check it, or skip for now. | 52 |
| `err.flare_ended` | Reply to a closed flare | This flare has ended. | 24 |
| `err.cap_20` | Accepting a 21st friend | You're at 20 friends. Remove someone first. | 46 |
| `err.group_cap` | 11th group | You can have up to 10 groups. | 32 |
| `err.audience_empty` | Group has nobody | {group} is empty. Add people or pick Everyone. | 60 |
| `err.no_friends` | Who joins? with no friends | Flares go to friends. Invite one first. | 44 |
| `err.camera` | Camera won't start | The camera didn't start. Close Clink and open it again. | 58 |
| `err.load` | Server error, cached data shown | Couldn't refresh. Tap to try again. | 38 |
| `err.load_full.title` | Server error, nothing cached | Clink can't connect right now | 32 |
| `err.load_full.body` | Body | Check your connection and try again. | 40 |
| `err.load_full.cta` | Button | Try again | 12 |
| `err.update.title` | App too old for the API | Time to update Clink | 22 |
| `err.update.body` | Body | This version has stopped working. Update to carry on. | 56 |
| `err.update.cta` | Button | Update | 8 |
| `err.generic` | Anything unexpected (last resort) | That didn't work. Try again. | 30 |
| `err.text_blocked` | Text with a blocklisted word, in any field others see | That word isn't allowed on Clink. | 36 |

`err.invite_code` is the only message for every failing code: unknown, expired, used up, blocked or renewed. Reason: different messages would let someone probe codes.

Rate limits (`ARCHITECTURE.md` 8.3, returned as 429):

| Key | Limit | Text | Max |
|---|---|---|---|
| `rl.flare_day` | 12 flares a day | That's 12 flares today, the daily max. More tomorrow. | 56 |
| `rl.snap_day` | 20 snaps a day | That's 20 snaps today, the daily max. More tomorrow. | 56 |
| `rl.reactions` | 60 reaction changes an hour | Slow down a little. Try again in a few minutes. | 50 |
| `rl.requests` | 30 friend requests a day | That's a lot of requests for one day. Try again tomorrow. | 60 |
| `rl.contacts` | 3 contact checks a day | Contacts checked 3 times today. Try again tomorrow. | 52 |
| `rl.invites` | 10 invite redemptions a day | That's enough invites for today. Try again tomorrow. | 54 |
| `rl.reports` | 20 reports a day | That's 20 reports today. Urgent? Email support@{domain}. | 76 |
| `rl.avatar` | 10 photo changes a day | That's a lot of photo changes for one day. Try again tomorrow. | 64 |
| `rl.generic` | Anything else, with `retryAfter` | Too many tries. Try again in {n} min. | 40 |

### 4.23 Offline and sending

| Key | Situation | Text | Max |
|---|---|---|---|
| `off.banner` | No connection, app open | You're offline. Drinks still log. | 36 |
| `off.sending` | Queued item | Sending… | 10 |
| `off.retry` | 30 s without success | Couldn't send. Tap to retry. | 30 |
| `off.flare_dropped` | Flare not sent in 2 minutes | Your flare didn't go out in time, so it was dropped. | 56 |
| `off.flare_dropped.cta` | Button | Send again | 12 |
| `off.snap_dropped` | Snap not sent in 60 minutes | Your snap from {time} couldn't send, so it was dropped. | 58 |
| `off.reply_dropped` | Reply queued past the flare's close | {name}'s flare ended before your reply went through. | 60 |
| `off.back` | Connection back, queue flushed | Back online. Everything's sent. | 34 |

Drink and water logs never fail visibly; they save on the device and sync later (`PRD.md` 3.20).

### 4.24 Permissions: camera and contacts

Pre-prompt first, system dialog only after the positive button.

| Key | Element | Text | Max |
|---|---|---|---|
| `perm.cam.title` | Pre-prompt title | Snap your drink | 18 |
| `perm.cam.body` | Body | Clink needs the camera for drink snaps. They go to your friends only and come off their widgets after 24 hours. | 112 |
| `perm.cam.yes` | Button | Continue | 14 |
| `perm.cam.no` | Text button | Not now | 10 |
| `perm.cam.denied.title` | Denied state | The camera is off for Clink | 30 |
| `perm.cam.denied.body` | Body | Turn it on in Settings to share snaps. Flares work without it. | 66 |
| `perm.cam.denied.cta` | Button | Open Settings | 14 |
| `perm.contacts.title` | Pre-prompt title | Find friends already on Clink | 30 |
| `perm.contacts.body` | Body | Clink sends the numbers in your contacts to our server, encrypted, to check who's on Clink. They're used for that check and not kept. | 136 |
| `perm.contacts.yes` | Button | Check contacts | 16 |
| `perm.contacts.no` | Text button | Not now | 10 |
| `perm.contacts.denied` | Denied line | Contacts are off. You can still send invites above. | 56 |

`perm.contacts.body` describes `ARCHITECTURE.md` 8.1 without overstating it: hashed numbers are still personal data, so the copy says they leave the phone (Google Play prominent disclosure) and doesn't call them scrambled. Legal confirms the wording matches the privacy policy before beta.

Pre-permission buttons never say "Allow" (App Review 5.1.1(iv)). `perm.contacts.yes` names the action and stays.

iOS purpose strings (shown inside the system dialog, `Info.plist`):

| Key | Text | Max |
|---|---|---|
| `NSCameraUsageDescription` | Clink uses the camera for drink snaps you share with friends. | 80 |
| `NSContactsUsageDescription` | Clink checks your contacts to find friends who are already on Clink. Your contacts aren't stored. | 110 |
| `NSPhotoLibraryUsageDescription` | Clink uses your library only when you pick a profile photo. | 80 |

The photo library string is only needed if the profile photo picker asks for library access; the system photo picker on current iOS doesn't. Tech decides.

### 4.25 Permissions: notifications (onboarding step 5)

| Key | Element | Text | Max |
|---|---|---|---|
| `perm.notif.title` | Title | Hear when friends want a break | 32 |
| `perm.notif.body` | Body | A flare only works if people see it in time. You'll hear when a friend wants a drink and when someone joins yours. Snaps stay quiet. | 140 |
| `perm.notif.example1.title` | Example notification | Maya wants matcha | 40 |
| `perm.notif.example1.body` | Example body | Café Lumi · in 10 min | 90 |
| `perm.notif.example2.title` | Example notification | Leo is in | 40 |
| `perm.notif.example2.body` | Example body | Coffee at Kaffa Roastery · 2 in so far | 90 |
| `perm.notif.yes` | Button | Continue | 24 |
| `perm.notif.no` | Text button | Not now | 10 |
| `perm.notif.again.title` | Asked again after the first flare received in the app | Want to hear about the next one? | 34 |
| `perm.notif.again.body` | Body | You just got a flare in the app. With notifications on, you'd hear about it right away. | 92 |

### 4.26 Accessibility labels

Screen readers only; never shown. One key per row of `DESIGN.md` 5.6, which references these keys. Times are spoken at minute precision (`{ago_words}`, `{left_words}`). States ("selected", "on", "3 of 3") come from the platform, not from these strings.

**Widget** (`a11y.w.*`)

| Key | Element | Label |
|---|---|---|
| `a11y.w.tracker` | Tracker block, one element | {drinks, plural, one {# drink} other {# drinks}} and {water, plural, one {# water} other {# waters}} today. Last drink {ago_words} ago. |
| `a11y.w.tracker_none` | Tracker block, nothing yet | No drinks yet today. |
| `a11y.w.tracker_at` | Tracker block, one element (Android widget: the last drink as a time of day, which never goes stale) | {drinks, plural, one {# drink} other {# drinks}} and {water, plural, one {# water} other {# waters}} today. Last drink at {time}. |
| `a11y.w.tracker_water` | Tracker block, water only so far | {water, plural, one {# water} other {# waters}} today. No drinks yet. |
| `a11y.w.plate` | Usual #1 on the idle widget's drink panel (opens the picker) | {drink}, your usual. Log a drink |
| `a11y.w.log` | +1 Drink | Log a drink |
| `a11y.w.pick` | Picker drink button | Log {drink} |
| `a11y.w.pick_water` | Picker water button | Log water |
| `a11y.w.close` | Picker close | Close |
| `a11y.w.camera` | Camera | Take a drink snap |
| `a11y.w.snap` | Snap tile | {name}'s snap, {ago_words} ago. Opens snaps. |
| `a11y.w.flare` | Who joins? | Send a {cat} flare to {audience}, {mins} |
| `a11y.w.invite` | Invite (no friends) | Invite friends |
| `a11y.w.live` | Your live flare | Your {cat} flare at {place}. {left_words} left. {replies} |
| `a11y.w.live_noplace` | Same, no place | Your {cat} flare. {left_words} left. {replies} |
| `a11y.w.reply_in` | One item of `{replies}` | {name} is in |
| `a11y.w.reply_bring` | One item of `{replies}` | {name} asked for {drink} |
| `a11y.w.replies_none` | `{replies}` with none | No replies yet. |
| `a11y.w.incoming` | Friend's flare | {name} wants {wants} at {place}, {mins}. {left_words} left. |
| `a11y.w.incoming_noplace` | Same, no place | {name} wants {wants}, {mins}. {left_words} left. |
| `a11y.w.more` | "+N" badge | {n, plural, one {# more flare} other {# more flares}} |
| `a11y.w.in` | I'm in | Join {name}'s {cat} flare |
| `a11y.w.bring` | Bring me one | Ask {name} to bring you one |
| `a11y.w.bring_pick` | Bring me one drink button, details saved | Ask {name} for your {drink}, with your saved notes |
| `a11y.w.bring_pick_plain` | Same, no details | Ask {name} for your {drink} |
| `a11y.w.replied_in` | Replied status | You're in |
| `a11y.w.replied_bring` | Replied status | You asked for {drink} |
| `a11y.w.confirm` | Confirmation | the visible confirmation text ("Logged {drink}", "Sent to {audience}") |
| `a11y.w.failed` | Failed | Couldn't send. Double-tap to retry. |
| `a11y.w.signin` | Signed out | Open Clink to sign in |
| `a11y.w.setup` | Not set up | Open Clink to finish setup |

`{replies}` joins up to three `a11y.w.reply_*` items with ", ", then "and {n} more".

**App: custom actions** (replace gestures, `DESIGN.md` 7)

| Key | Where | Label |
|---|---|---|
| `a11y.act.move_up` / `.move_down` | Usual 3 slots | Move up / Move down |
| `a11y.act.next_order` / `.prev_order` | Show to barista, order ticket | Next order / Previous order |
| `a11y.act.newer_snap` / `.older_snap` | Snaps viewer | Newer snap / Older snap |

**App: controls without visible text, and composed labels**

| Key | Control | Label |
|---|---|---|
| `a11y.countdown` | Any countdown | {left_words} left |
| `a11y.chip.cat` | Category chip | {cat_name} |
| `a11y.pill.time` | Timing pill | {mins_cap} |
| `a11y.to` | To: chip | Send to {audience} |
| `a11y.to.hint` | To: chip hint | Changes who gets this flare |
| `a11y.snap.photo` | Snap in the viewer | Photo from {name}, {ago_words} ago, {place} |
| `a11y.order.notes` | Note marker on a run-list row | Has notes |
| `a11y.usual.slot` | Usual 3 slot | Number {n}, {drink} |
| `a11y.phone.country` | Country chip on the number screen | Country, {country} |
| `a11y.react` | Reaction button | uses `snapv.react.a11y` |

`{cat_name}` is the tab word (`cat.coffee` … `cat.smoothie_juice`).


### 4.27 Time formats

Used to build the time variables in 0.2 (`app/src/lib/format.ts`).

| Key | Element | Text | Max |
|---|---|---|---|
| `fmt.ago.now` | `{ago}`, under a minute | just now | 8 |
| `fmt.ago.m` | `{ago}`, under an hour | {m}m | 7 |
| `fmt.ago.h` | `{ago}`, whole hours | {h}h | 7 |
| `fmt.ago.hm` | `{ago}`, hours and minutes | {h}h {m}m | 7 |
| `fmt.mins.now` | `{mins}`, starting now | now | 9 |
| `fmt.mins.in` | `{mins}`, later | in {n} min | 9 |
| `fmt.mins_cap.now` | `{mins_cap}`, starting now | Now | 9 |
| `fmt.mins_cap.in` | `{mins_cap}`, later | In {n} min | 9 |
| `fmt.words.m` | `{ago_words}` and `{left_words}`, minutes | {m, plural, one {# minute} other {# minutes}} | n/a |
| `fmt.words.h` | `{ago_words}` and `{left_words}`, whole hours | {h, plural, one {# hour} other {# hours}} | n/a |
| `fmt.words.hm` | `{ago_words}` and `{left_words}`, hours and minutes | {h, plural, one {# hour} other {# hours}} {m, plural, one {# minute} other {# minutes}} | n/a |

---

### 4.28 Developer screens (dev builds only)

Shown only in the `dev` variant (`app.config.ts`), never in a store build. The same voice rules apply. Fixture ids and titles on the "Widget states" list come from `packages/shared/fixtures/widget-states` and are test data, not copy.

| Key | Element | Text | Max |
|---|---|---|---|
| `dev.ws.row` | Settings > Widgets row | Widget states | 16 |
| `dev.ws.title` | Title | Widget states | 16 |
| `dev.ws.sub` | Sub-line | Sends a test state to every Clink widget on this phone. Its times move to now. | 84 |
| `dev.ws.needs_tap` | Row sub-line, fixture with widget-local parts | Part of this state lives on the widget. Tap the widget to see it. | 70 |
| `dev.ws.sent` | Snackbar | {id} is on the widget | 32 |
| `dev.ws.refused` | Snackbar | The widget refused {id} | 32 |
| `dev.ws.none` | Line when no widget is on the home screen | No widget on the home screen yet. Add one first. | 52 |
| `dev.ws.unsupported` | Line where the platform has no widget yet (iOS until the Apple account) | This phone has no Clink widget yet. | 40 |
| `dev.ws.live` | Button | Back to my data | 18 |
| `dev.ws.live_done` | Snackbar | Your own data is back on the widget | 40 |

## 5. Notifications

Limits: **title 40**, **body 90**, **action button 16**, all with variables at budget. Put the important words first; Android shows one line of body when collapsed. The OS adds "Clink" and the app icon, so titles never start with "Clink". No emoji, except the reaction in 5.4.

### 5.1 Sent

| # | Key | When | Title | Body | Actions | Sound |
|---|---|---|---|---|---|---|
| 1 | `n.flare` | A friend's flare reaches you | {name} wants {wants} | {place} · {mins} | I'm in · Bring me one | Yes |
| 1b | `n.flare_noplace` | Same, no place | {name} wants {wants} | {mins_cap}. Who's in? | I'm in · Bring me one | Yes |
| 1c | `n.flare_photo` | Same, with a photo attached | {name} wants {wants} | {place} · {mins} · photo attached | I'm in · Bring me one | Yes |
| 2 | `n.in` | Someone replies I'm in to your flare | {name} is in | {cat_cap} at {place} · {in} in so far | none | Yes |
| 2b | `n.in_noplace` | Same, no place | {name} is in | {in} in so far | none | Yes |
| 3 | `n.bring` | Bring me one, with saved details | {name} wants a drink | {drink} · {summary} | none | Yes |
| 3b | `n.bring_once` | Bring me one with a one-time note | {name} wants a drink | {drink} · Just this time: {once} | none | Yes |
| 3c | `n.bring_plain` | Bring me one, no details | {name} wants a drink | {drink}. No notes. | none | Yes |
| 4 | `n.reaction` | First reaction on your snap (max 1 per snap) | {name} reacted {emoji} | Your snap from {place} | none | No |
| 4b | `n.reaction_noplace` | Same, no place | {name} reacted {emoji} | Your snap from {time} | none | No |
| 5 | `n.request` | Friend request | {name} wants to be friends | Accept to see each other's snaps and flares. | Accept (works without opening the app) | Yes |
| 6 | `n.invite_ok` | Someone joined through your invite | {name} joined Clink | You're friends now. You'll see each other's snaps and flares. | none | Yes |
| 6b | `n.invite_cap` | Same, but you're at 20 friends | {name} joined Clink | You're at 20 friends. Make room to add them. | none | Yes |
| 7b | `n.closed_replier` | The sender of a flare you joined taps We're going | {name}'s heading out | {cat_cap} at {place}. See you there. | none | Yes |
| 7c | `n.closed_replier_noplace` | Same, no place | {name}'s heading out | {cat_cap} now. See you there. | none | Yes |
| 9 | `n.bring_cancelled` | A Bring me one on your flare is cancelled | {name} doesn't need a drink now | Their {drink} is off your list. | none | No |
| 10 | `n.flare_cancelled` | A flare you replied to is cancelled | {name} called off the {cat} | It's off your widget too. | none | No |
| 11 | `n.snap` | A friend's snap (off by default) | {name} shared a snap | {place} | none | No |
| 11b | `n.snap_noplace` | Same, no place | {name} shared a snap | Tap to see it. | none | No |
| 12 | `n.new_signin` | The account signs in on another device | New sign-in on {device} | If this wasn't you, tap Not me to sign out everywhere. | Not me | Yes |
| 13 | `n.flare_public` | Android lock-screen public version of rows 1 to 1c | {name} sent a flare | (none) | none | n/a |

Variable notes:
- `{mins}` is lower case ("in 10 min", "now"). `{mins_cap}` starts with a capital ("Now", "In 10 min"). `{cat_cap}` likewise.
- `{summary}` in 3 is the same three-value summary as 4.9.
- `{once}` in 3b is cut to 40 characters + "…" in the notification. The order card shows all of it. The one-time note wins over saved details in the notification because it's what changed.

Trigger rules (`PRD.md` 3.16 owns the list):
- Product decided on the old rows 7, 7b and 8: only 7b/7c ship, sent once to each standing replier when the sender taps We're going. "Time to go" to the sender and the drink-run reminder are deleted; the sender already has the Live Activity or ongoing notification and the run list.
- Row 6 belongs to the "Friends" toggle with row 5. Rows 7b and 7c go on Friend flares. Row 12 has no toggle (security notice) and uses the Account channel.

### 5.2 Never sent

| Case | Why |
|---|---|
| A flare you ignored | Ignoring is silent (`DECISIONS.md`). |
| A flare that expired with nobody | Sender sees `expired.title` in the app only. |
| Someone withdrew I'm in | Sender just sees one fewer. |
| XP, levels, level-ups | Private, and no push for it (`PRD.md` 4.5). |
| "You haven't opened Clink", streaks, re-engagement | Banned pattern (1.3). |
| A friend removed you, a request expired | Silent by design. |

### 5.3 Live Activity (iOS) and ongoing notification (Android)

| Key | Surface | Text | Max |
|---|---|---|---|
| `la.title` | Lock screen title | Your {cat} flare | 22 |
| `la.place` | Lock screen line | {place} | 40 |
| `la.counts` | Lock screen line | {in} in · {orders, plural, one {# drink} other {# drinks}} | 20 |
| `la.none` | Lock screen line, no replies | No replies yet | 16 |
| `la.countdown` | Countdown label | Open for {mm:ss} | 16 |
| `la.di.minimal` | Dynamic Island, minimal | {in} | 2 |
| `la.done` | Final state before dismissal | You're going · {in} in | 22 |
| `ongoing.title` | Android ongoing notification title | Your {cat} flare | 22 |
| `ongoing.body` | Android body | {in} in · {orders} to bring · {place} | 70 |
| `ongoing.body_none` | Android body, no replies | No replies yet · {place} | 60 |
| `channel.flares` | Android channel name | Friend flares | 20 |
| `channel.replies` | Android channel name | Replies to my flares | 22 |
| `channel.snaps` | Android channel name | Friend snaps | 14 |
| `channel.reactions` | Android channel name | Reactions | 10 |
| `channel.friends` | Android channel name | Friends | 10 |
| `channel.live` | Android channel name | Your live flare | 16 |
| `channel.account` | Android channel name | Account | 10 |

`la.none` states the fact. Copy avoids "Waiting for replies", because waiting sounds like something might not come.

Cancelled and no-reply flares end the Live Activity with immediate dismissal and no final text. The Dynamic Island compact trailing slot is the system countdown and needs no string.

---

## 6. Widget strings

Limits are hard, for fixed text at the default text size, assuming the layouts in `DESIGN.md`. Design may lower a limit, never raise it without telling Copy. Variables use the widget overflow rules in 0.2 (`{drink_short}`, `{name}` 12, `{place}` 18, `{group}` 14). Android resizable widgets use the small strings below the medium breakpoint (`PRD.md` 3.3).

**Slot limits**

| Slot | Small | Medium |
|---|---|---|
| Headline | 14 | 24 |
| Sub-line | 16 | 28 |
| Button | 10 | 14 |
| Chip | n/a | 14 |
| Confirmation | 10 | 12 |

### 6.1 Small widget

| Key | State | Text | Max |
|---|---|---|---|
| `ws.setup` | Not signed in or not set up | Open Clink | 12 |
| `ws.drinks` | Idle, count | {n, plural, one {# drink} other {# drinks}} | 10 |
| `ws.water` | Idle, count. The Android widget shows only its number, in the water badge ("◦ 2", top right of the counts) | {n, plural, one {# water} other {# waters}} | 10 |
| `ws.drinks_today` | Idle, the label under the big drinks number, both sizes (Android). Where "today" has no room the label is the word from `ws.drinks` ("drinks"); it never goes entirely (CEO, 2026-11-18) | {n, plural, one {drink today} other {drinks today}} | 12 |
| `ws.last` | Idle, last drink (iOS; Android uses `ws.last_at`) | Last {ago} | 12 |
| `ws.last_at` | Idle, last drink as a time of day, under "drinks today". The 4x2 writes the full time ("Last 7:30 AM"), the 2x2 drops AM/PM ("Last 7:30"). With no drink today the line is left out: never a "no drinks" line next to a 0 (CEO, 2026-11-17) | Last {time} | 13 |
| `ws.log` | Button | +1 Drink | 9 |
| `ws.pick.water` | Picker cell | Water | 8 |
| `ws.pick.cancel` | Picker close | Cancel | 8 |
| `ws.logged` | Confirmation | Logged | 8 |
| `ws.live` | Your live flare | Your {cat} | 14 |
| `ws.live.counts` | Your live flare, one or more people in | {in} in | 8 |
| `ws.live.none` | Your live flare, no replies yet (never "0 in") | No replies yet | 14 |
| `ws.in.title` | Friend's flare | {name} | 12 |
| `ws.in.sub` | Friend's flare | {cat_cap} · {mins} | 16 |
| `ws.in.left` | Flare countdown in whole minutes, rounded up, redrawn each minute (`{n}` 1 or more). Also the word beside the countdown numeral on your live flare | {n} min left | 11 |
| `ws.in.left_short` | Same, where "left" has no room. Never a bare number | {n} min | 6 |
| `ws.in.left_under` | Countdown under one minute | Under a minute | 14 |
| `ws.in.btn` | Button | I'm in | 8 |
| `ws.in.done` | After replying | You're in | 10 |
| `ws.more` | More flares open | +{n} | 3 |
| `ws.ended` | Ended flare tapped | Ended | 6 |
| `ws.sending` | Queued | Sending… | 10 |
| `ws.failed` | Couldn't send | Tap to retry | 12 |

### 6.2 Medium widget

| Key | State | Text | Max |
|---|---|---|---|
| `wm.setup` | Not set up | Open Clink to finish setup | 28 |
| `wm.signin` | Signed out | Sign in to Clink | 18 |
| `wm.counts` | Idle | {drinks} · {water} (each from the small strings) | 22 |
| `wm.last` | Idle (iOS; Android uses `wm.last_at`) | Last drink {ago} ago | 22 |
| `wm.last_at` | Idle, last drink as a time of day in the device's 12/24 h format (iOS; the Android 4x2 uses `ws.last_at`) | Last drink {time} | 22 |
| `wm.last_now` | Idle, under a minute | Last drink just now | 22 |
| `wm.usual` | Idle, the usual #1's name on the drink panel (Android 4x2) or beside its picture (tall 2x2) | {drink_short} | 15 |
| `wm.usual_none` | Idle drink tile, no usual 3 yet (opens the usual 3 editor) | Pick your usual 3 | 18 |
| `wm.caff` | Idle, in place of the usual #1's name after 4 caffeinated drinks (Android: on the drink panel, with a chamomile) | Herbal tea next? | 18 |
| `wm.snap` | Snap caption | {name} · {ago} | 22 |
| `wm.snap_none` | Empty snap slot | Friends' snaps land here | 26 |
| `wm.group` | Group label, fixed group | {emoji} {group} | 18 |
| `wm.group_auto` | Group label, Automatic | Auto · {group} | 22 |
| `wm.group_everyone` | Group label | Everyone | 10 |
| `wm.log` | Button | +1 Drink | 9 |
| `wm.camera` | Button (icon; label for a11y only) | Snap | 6 |
| `wm.flare` | Button | Who joins? | 12 |
| `wm.invite` | Button, no friends | Invite friends | 14 |
| `wm.nofriends` | Snap slot, no friends | Invite a friend to see their snaps here | 40 |
| `wm.pick.title` | +1 picker (iOS; the Android picker has no header: its cells fill the widget) | Log which one? | 16 |
| `wm.pick.water` | Picker cell | Water | 8 |
| `wm.pick.cancel` | Picker close | Cancel | 8 |
| `wm.logged` | Confirmation | Logged | 8 |
| `wm.sent` | Confirmation | Sent | 6 |
| `wm.sending` | Queued | Sending… | 10 |
| `wm.failed` | Couldn't send (from 30 s; tap retries in place) | Couldn't send. Tap to retry. | 28 |
| `wm.live.title` | Your live flare | {cat_cap}, {mins} | 22 |
| `wm.live.place` | Your live flare | {place} | 18 |
| `wm.live.none` | No replies yet | No replies yet | 16 |
| `wm.live.chip_in` | Reply chip | {name} · In | 14 |
| `wm.live.chip_bring` | Reply chip | {name} · {drink_short} | 14 |
| `wm.live.more` | More replies than chips | +{n} more | 8 |
| `wm.in.title` | Friend's flare (may wrap to 2 lines of 24: name, then "wants …") | {name} wants {wants} | 29 |
| `wm.in.meta` | Friend's flare | {place} · {mins} | 28 |
| `wm.in.left` | Flare countdown in whole minutes, rounded up, redrawn each minute (`{n}` 1 or more). Also the words beside the countdown numeral on your live flare. Where "left" has no room, `ws.in.left_short` | {n} min left | 12 |
| `wm.in.left_under` | Countdown under one minute | Under a minute left | 19 |
| `wm.in.btn_in` | Button | I'm in | 8 |
| `wm.in.btn_bring` | Button | Bring me one | 14 |
| `wm.in.more` | More flares | +{n} | 3 |
| `wm.bring.title` | Bring me one picker | Bring which one? | 18 |
| `wm.bring.cancel` | Picker close | Cancel | 8 |
| `wm.in.done_in` | After replying | You're in | 10 |
| `wm.in.done_bring` | After Bring me one | Asked for {drink_short} | 26 |
| `wm.ended` | Ended flare tapped | This flare has ended. | 22 |
| `wm.audience_empty` | Who joins? to an empty group | {group} is empty. Open Clink. | 30 |

The note marker 📝 on a reply chip is drawn by Design and counts as 2 characters toward the chip limit.

---

## 7. Invite messages

Sent by the user, so they're written in the user's voice. They contain the URL because WhatsApp and SMS need one; the app UI never shows it (CEO guideline 6). No level, XP or counts in any message (`PRD.md` 4.1). No emoji, no exclamation marks.

| Key | Channel | Text | Max |
|---|---|---|---|
| `share.msg.whatsapp` | WhatsApp | Get Clink so we can do coffee breaks. When I'm going, you'll see it on your home screen. {url} | 140 |
| `share.msg.messages` | Messages / SMS | Join me on Clink for coffee breaks: {url} | 80 |
| `share.msg.more` | System share sheet text | I'm on Clink for drink breaks with friends. Join me: {url} | 110 |
| `share.msg.more.subject` | Share sheet subject (email and apps that use one) | Join me on Clink | 20 |

Reasons:
- Messages is the shortest so it stays one SMS segment (160 characters) with a 40-character URL.
- "Coffee breaks" in WhatsApp and Messages is the everyday phrase for a break, whatever the drink. The share sheet version says "drink breaks" because it goes to apps like Slack where people read it more literally.

Web landing page for the URL (`ARCHITECTURE.md` 6). This is the only place the code appears outside a message.

| Key | Element | Text | Max |
|---|---|---|---|
| `web.title` | Headline | {name} invited you to Clink | 40 |
| `web.sub` | Sub-line | Drink breaks with your people. | 32 |
| `web.ios.cta` | iOS button (copies the code, then opens the App Store) | Get Clink | 12 |
| `web.ios.helper` | Under the button | When Clink opens, tap Paste and you'll start as friends with {name}. | 76 |
| `web.desktop` | Desktop | Open this on your phone | 26 |
| `web.qr` | QR caption | Scan with your phone's camera | 32 |
| `web.bad_code` | Any failing code (unknown, expired, used up, renewed) | This invite doesn't work anymore. You can still get Clink. | 60 |

`web.ios.cta` copies the full invite URL, not the bare code, so the iOS invite check can find it (`ARCHITECTURE.md` 6).

Web report form (`web/report`, for people with or without the app; Legal reviews):

| Key | Element | Text | Max |
|---|---|---|---|
| `web.report.title` | Headline | Report something on Clink | 28 |
| `web.report.what` | Field label | What's the problem, and where did you see it? | 48 |
| `web.report.reason` | Field label | Reason | 8 |
| `web.report.email` | Field label | Your email, so we can reply | 30 |
| `web.report.cta` | Button | Send report | 12 |
| `web.report.done` | Confirmation | Thanks. A person will look at it within 24 hours. | 52 |

Web deletion page (`web/delete-account`): sign-in buttons reuse `signin.*`, the explanation and buttons reuse `del.*`.

---

## 8. Translation notes for later

v1 ships English only. When we add languages, these need a translator who knows the product and reads them in context.

| Strings | Why they need care |
|---|---|
| Level names (section 3), "Run Captain", "Kettle Keeper", "Full Pot" | Drink idioms. Each locale needs names that carry the same idea in its own drink culture. |
| "I'm in", "Bring me one", "Who joins?" | Short spoken phrases. Must stay short and casual, and fit the same buttons. |
| `{name} wants {wants}`, "{name} is in", "{name}'s heading out" | Many languages (Arabic, Hebrew, French, Spanish) inflect the verb or adjective for gender. We don't store gender, so the translation needs a neutral form. |
| `{wants}` and `label` nouns in 2.5, `{cat}` | Articles and noun gender change by language; "a smoothie" can't be built from parts. Store full phrases per drink per locale. |
| Plurals (`{n} drinks`, "1 other is in") | Use ICU plural categories; Arabic has six forms, Polish and Russian have several. |
| Possessives (`{name}'s order`) | Word order and possessive marking differ; keep the whole phrase as one string. |
| Drink names | Most stay as-is (Latte, Matcha), but "Filter Coffee", "English Breakfast" and "Skim milk" vary by country (drip, black tea, semi-skimmed). |
| Option values ("½ sugar", "Splash of milk", "Leave the bag in") | Ordering habits differ by country. Check with cafes in each launch market. |
| Show to barista | The barista may not read the app's language. Later we may need a "show in local language" option that renders the order in the cafe's language. Flag for Product before the first non-English market. |
| Widget limits (section 6) | German and Finnish run 30 to 40% longer. Budget shorter phrases or smaller type per locale with Design. |
| Right-to-left (Arabic, Hebrew) | Layouts, the middle-dot lines and countdowns mirror. Design owns the RTL pass. |
| Invite messages (section 7) | Written in the user's voice and very short. Rewrite per locale; don't translate literally. |
| US spelling | en-GB locale later: color/colour, favorite/favourite, license/licence, skim/semi-skimmed. |

---

## 9. Open items for other units

None of these need the CEO.

| For | Item |
|---|---|
| Product / CEO question 2 in `PRD.md` | Which report confirmation ships (`report.done` or `report.done_soft`) depends on who reviews reports. |
| Tech (`ARCHITECTURE.md`) | Generate the string table and `catalog.json` from sections 2 and 4 to 6 (`scripts/gen-strings`, `gen-native-catalog`). Truncate `{name}` to 12 in notification payloads. |
| Design (`DESIGN.md`) | Confirm or lower the widget limits in section 6. Draw the 📝 note marker. Pictures for the 40 drinks and 2 waters in section 2. |
| Design (`DESIGN.md`) | These strings run over their Max when every variable is at its full budget (rendered length / Max): `bar.in` 41/36, `live.meta` 57/56, `snapv.meta` 65/60, `report.block_ask` 23/20, `ws.in.sub` 20/16 (with "Lemonade"), `wm.live.chip_in` 17/14, `wm.live.chip_bring` 30/14, `wm.in.meta` 30/28, `wm.audience_empty` 36/30. With `{ago}` at "just now" (8, PRD F9): `ws.last` 13/12, `wm.snap` 23/22. A shorter wording would drop the name, place or time, so Copy keeps it. Design either raises the Max or confirms that the longest variable truncates with "…" in that slot. `{audience}` has no budget in 0.2 yet; Copy proposes 20, the same as `{group}`. |
| Legal | Check 4.18, `perm.contacts.body`, `signin.legal`, the moderation notices and the iOS purpose strings against the privacy policy, terms and store forms. Write the Community Guidelines with Words. |

Closed on 2026-11-15 (see `RISK_REVIEW.md` resolution log): option sets adopted in `PRD.md` 3.7; notifications 7 and 8 deleted, 7b kept; `xp.e.adjust` confirmed; "Tapioca pearls" filtered per drink; the "Something else" quick-log button kept.
