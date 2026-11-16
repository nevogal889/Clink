# Clink: decisions log (source of truth)

Every decision the CEO has approved so far. When this file and `original-prd.md` disagree, this file wins.

## Who decides
- **CEO:** the founder (the user). Only ask them questions that change scope, cost money, or carry legal or brand risk.
- **Head of Product and CTO have full authority** over everything else. Decide, write down why, and move on.

## The CEO's 10 guidelines (non-negotiable)
1. The app and widget design must be unique and must not look AI-generated. No warm cream with a serif and terracotta, no purple gradients, no emoji used as decoration, no "rounded cards everywhere".
2. When a user picks a drink type (coffee, matcha, tea, smoothie & juice), the picture must be stylish and clear.
3. Every word must read as written by a person, not by AI.
4. UX is the top priority. The widget and app must be very easy to use and navigate.
5. **No quiet hours.** Remove the feature completely.
6. **No visible invite link or "Invite link" label.** Show only share buttons (WhatsApp, Messages, etc.). Product decision: add a "More" button that opens the system share sheet, so Instagram, Slack and Telegram users aren't stuck.
7. Every category offers the **top 10 drinks** in that category.
8. The category formerly called "Juice" is now **"Smoothie & Juice"**.
9. **XP:** private and rewards engagement (invites, joining flares, bringing drinks for friends). The CEO chose a **private level only**: nobody else ever sees your XP or level, and there are no leaderboards.
10. The app must also be on **Android (Google Play)**, not only iOS.

## Product
- **Name:** Clink. **Tagline:** "Drink breaks with your people."
- **Platforms:** iOS and Android in v1.
- **Stack (CEO approved):** Expo / React Native for the app, with native widgets per platform: Swift WidgetKit on iOS (interactive widgets with App Intents, Live Activities) and Kotlin Jetpack Glance on Android. Cloud builds through EAS, so iOS builds don't need a Mac. Backend: the CTO chooses; Supabase is the default recommendation.
- **Accounts:** none exist yet (no GitHub, Apple Developer, Google Play or Supabase). Plan for the CEO to create them, and list exactly what is needed and when.

### Two core loops
1. **Drink snaps (Locket-style):** a photo of your drink shows on all your friends' widgets for 24 hours. No notification by default; the widget just updates. Snaps always go to all friends, never to a group. Friends can react (☕ 🍵 🫖 ❤️ 😂) and the sender gets one quiet notification. Report and block are required.
2. **Flares:** "I want coffee/matcha/tea/smoothie, who joins?" Replies are only "I'm in" or "Bring me one". Nobody is ever shown as having declined. Ignoring a flare is silent. Flares expire quietly.

### Drinks
- Flare categories: **Coffee, Matcha, Tea, Smoothie & Juice.**
- **Water** is tracked but is never a flare type. It is always a one-tap 4th button in the +1 picker and never takes a "usual 3" slot.
- Top 10 drinks in each flare category, plus water variants (still, sparkling).

### My usual 3 (with full details)
- Up to 3 go-to drinks from any flare category. #1 is the widget default and the drink used by a quick flare.
- **Full order details per drink:**
  - structured tap options per category (size, temperature, milk, sweetness, shots or strength, ice, extras)
  - a free-text **Note** ("very hot, extra foam")
  - an optional **Plan B** ("No oat? Almond is fine")
- Setting details is **optional during onboarding** (a "Make it yours" button). The app nudges later, for example the first time you tap Bring me one on a drink with no details.
- **Bring me one:**
  - from the widget, your saved order is sent exactly as saved
  - from the app, you can add a one-time note ("iced today")
- **The friend doing the drink run:** their run list shows "Sam: Cortado 📝 Notes". Tapping it opens the full order card, which has a **Show to barista** mode in large text.
- Friends list: 📝 next to a friend shows their usual order, for surprise drinks.

### Flare timing
- Pills: **Now · 5m · 15m · 30m · Other**. Other offers 5 to 60 minutes in 5-minute steps; nothing beyond 60 minutes.
- A flare stays open until the meet time, with a minimum of 15 minutes.
- One live flare per sender at a time.
- Quick flare from the widget: drink from usual #1, last place, "Now", sent to the widget's group.

### Friends and groups (light version, in v1)
- Mutual friends, capped at 20.
- **Groups are private labels**, like Instagram Close Friends: user-created (Work, Home friends, and so on), with an emoji. Friends never see which groups they are in. One friend can be in several groups.
- The flare composer has a **"To:" picker**:
  - Automatic: weekdays 08:00–18:00 → Work, otherwise → Home friends, else Everyone
  - a specific group
  - Everyone
- **One widget per group:** the widget's configuration sets which group its "Who joins?" button targets. Users can add two widgets.
- New users start with "Everyone" only. Clink suggests groups once a user has 6 or more friends.
- People who join a flare but aren't friends with each other see "2 others are in", not names.
- The data model must let a group later belong to a company (future Teams). No company features in v1.

### Drink and water tracker
- Counts drinks and water separately. Resets at local midnight. Undo last.
- **Counts are always private.**
- After 4 caffeinated drinks, show a neutral note ("herbal tea is a nice switch tonight"). No health claims and no caffeine maths.
- **Opt-in:** friends can see the time of your last drink only ("Dana · last drink 1h 42m ago"). Never counts, never water. Off by default.

### XP (private level only)
- Reward outcomes, not activity:
  - a friend who accepted your invite
  - joining a flare
  - completing a drink run for a friend
  - a flare of yours that at least one person joined
  - optionally small daily logging XP
- Never XP for just sending flares or snaps, because that rewards spam.
- Daily caps and anti-gaming rules.
- Named levels.
- Only the user sees their own level and XP.

### Invites and onboarding
- Onboarding:
  1. sign in
  2. name and photo (photo optional)
  3. usual 3 (details optional)
  4. invite friends (share buttons only; progress meter "0 of 2"; "Later" allowed)
  5. notifications pre-prompt
  6. add-widget guide
- An invite must survive the app install (deferred deep link), so the new user arrives already friends with the inviter.
- Sign in:
  - iOS: Sign in with Apple, or phone number with an SMS code
  - Android: Sign in with Google, or phone number (CTO confirms the exact provider choices)
  - Phone numbers are used for contact matching only and are never shown to others.

### Notifications
- Friend flares: on.
- Replies to my flare: on.
- Friend snaps: off by default.
- **No quiet hours** (CEO guideline 5).
- Live Activity / Dynamic Island on iOS for your live flare. Android equivalent: an ongoing notification.

### Required by store rules
- Report and block for photos.
- In-app account deletion.
- Privacy policy.
- Accurate privacy labels and data safety forms.
- Sign in with Apple whenever any third-party login is offered on iOS.

### Not in v1 (roadmap)
- Groups that switch automatically by location.
- Meet halfway (midpoint cafe). Has a privacy issue to fix first.
- Clink+ subscription.
- Cafe partner perks.
- Clink for Teams and logo-photo challenges (companies first, then drink brands; validate with a manual pilot first).
- Alcohol / drinks after work (would raise the age rating to 17+).
- Water goal and reminders.

## References
- `original-prd.md`: the founder's first PRD. Its intent still holds where this log doesn't override it.
- `../prototype.html`: a clickable prototype of the agreed flows (F1–F30) with their behaviour. **Its visuals are placeholders, not the final design.** Read its `GROUPS` flows data and `OPTS` drink-detail options for the agreed behaviour.

## CEO answers after phase 1 review (PRD section 8)
- **Age and markets:** minimum age 16+. Launch in English-speaking countries first (US, UK, Canada, Australia, Ireland, New Zealand). English UI only in v1.
- **Company and developer accounts:** there is no company yet. The CEO will create the Apple Developer and Google Play accounts later. Until then, build and test without store accounts. Whether to enroll as a person or a company is still open; ask again before beta.
- **Trademark:** check "Clink" before beta. The team prepares the free searches (RISK_REVIEW.md 8); the CEO pays an attorney for a clearance opinion. Buy the domain only after that.
- **Drink art and logo:** the team draws the full set in code as SVG, following DESIGN.md (5 heroes, 42 icons in two sizes, 5 glyphs, logo, wordmark, app icon). No freelance illustrator. This overrides DESIGN.md 9 and PRD 8 item 8.
- **Still open, ask before beta:** moderation staffing and a paid image filter (PRD 8 item 2), a lawyer's review of the privacy policy and terms (item 5), an SMS cost cap (item 6), test devices and an E2E cloud plan (item 7).

## CEO answers after the first art review
- **App icon:** the notched ring is dropped (it reads as a loading spinner). The icon is a cup rim seen from above, a thick ellipse with a gleam on cobalt, the same idea as the dot on the "i" in the wordmark.
- **Drink art:** one more pass on all 5 heroes before beta for more character (texture, bolder shapes), keeping the DESIGN.md shape grammar. Redraw the matcha bowl: its glaze streaks read as dirt.
- **App icon, final touch:** the rim seen from above gets a short handle on the right so it reads as a cup, not a donut or swim ring. The rim stays category-neutral (no drink surface inside).
- **Next milestone while the Apple account is pending:** connect Supabase (real database and sign-in behind the screens) on the CEO's free Supabase account.
- **Android testing before store accounts:** the CEO tests on the Android Studio emulator on their Mac. Builds are installed directly (EAS internal distribution or a local APK); Play Console only before external testers.
