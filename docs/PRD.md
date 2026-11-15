# Clink v1 PRD

Owner: Head of Product, with the Business Analyst. Audience: engineering and QA.
Status: v1 build spec. `DECISIONS.md` wins over this file if they ever disagree. If you find a conflict, flag it to the Head of Product and follow `DECISIONS.md` until it is fixed.

Related files (other units own them; this file does not repeat them):
- `docs/ARCHITECTURE.md` (Tech): stack, data model, widget refresh, push, deep links, auth providers, analytics tool.
- `docs/DESIGN.md` (Design): visual system, drink pictures, layouts, motion, accessibility details.
- `docs/COPY.md` (Words): every user-facing string, the drink catalog (top 10 per category), notification text, level names.

Strings quoted in this file show meaning only. The shipped wording comes from `COPY.md`.

---

## 1. Product

Clink is a home-screen widget with a small companion app, on iOS and Android, for drink breaks with close friends. A photo of your drink lands on your friends' widgets for 24 hours. When you want a coffee, matcha, tea or smoothie, you send a flare ("who joins?") to a group or to everyone. Friends reply "I'm in" or "Bring me one", and Bring me one sends their saved order, with every detail, to the person doing the run. A private tracker counts your drinks and water. A private XP level rewards real outcomes: friends who joined through you, breaks people joined, drinks you brought back. Nobody sees declines, counts or levels.

### Product principles

Every spec decision below follows these. When a case is not covered, pick the option that fits them best and write it down.

1. **No shame.** Nobody is ever shown as having declined, ignored or missed anything. Flares that nobody joins disappear quietly. No streaks, no "seen", no public counts.
2. **Widget first.** The core actions (log a drink, send a quick flare, join, bring me one) work from the widget without opening the app. The app is for setup and for things a widget can't do (typing, the camera, the order card).
3. **Private by default.** Counts, water, XP, level and group membership are visible only to the user. Anything shared with friends is opt-in or is the content the user chose to send.
4. **Outcomes over activity.** We reward and measure breaks that happened and drinks that got delivered. Sending things is free and earns nothing.
5. **Under 3 taps for core tasks.** Measured from the home screen. See the tap budget in 3.0.
6. **Human words.** Short, plain, written by a person. All strings come from `COPY.md`. No exclamation-mark hype, no emoji used as decoration.

---

## 2. v1 scope

| Item | v1 | Reason |
|---|---|---|
| iOS app + widget (small, medium) | In | Core platform. |
| Android app + widget (small, medium) | In | CEO guideline 10. |
| Sign in: Apple + phone (iOS), Google + phone (Android) | In | Store rules and contact matching. |
| 6-step onboarding | In | `DECISIONS.md`. |
| Drink snaps to all friends, 24h, reactions | In | Core loop 1. |
| Flares: 4 categories, timing pills, To: picker | In | Core loop 2. |
| I'm in / Bring me one replies, one-time note | In | Core loop 2. |
| Usual 3 with full order details, order card, Show to barista | In | Makes Bring me one useful. |
| Top 10 drinks per category + "Add your own" | In | CEO guideline 7. Catalog in `COPY.md`. |
| Category "Smoothie & Juice" | In | CEO guideline 8. |
| Mutual friends (cap 20), requests, remove, block | In | Close-friends product. |
| Private groups, automatic default, one widget per group | In | `DECISIONS.md`. |
| Drink + water tracker, midnight reset, undo | In | Keeps the widget useful on quiet days. |
| Last-drink time sharing (opt-in) | In | `DECISIONS.md`. |
| Private XP level, no leaderboards | In | CEO guideline 9. |
| Invites via share buttons only (WhatsApp, Messages, More) | In | CEO guideline 6. |
| Deferred deep link invites | In | New users must arrive already friends. |
| Live Activity (iOS) / ongoing notification (Android) | In | Live flare countdown outside the app. |
| Report, block, in-app account deletion, privacy policy | In | Store rules. |
| Quiet hours | Not in v1, and not planned | CEO guideline 5. Removed completely. |
| Visible invite link, "Invite link" label, Copy link button | Not in v1 | CEO guideline 6. |
| Large widget, lock-screen widgets, StandBy layouts | Not in v1 | Two sizes cover the loops; fewer layouts to build and test. |
| Gallery upload for snaps | Not in v1 | Snaps are live drink moments; also lowers moderation load. |
| Captions or comments on snaps | Not in v1 | No threads. Place text and reactions are enough. |
| Leaderboards, XP visible to others, XP rewards or unlocks | Not in v1 | CEO chose private level only. |
| Streaks | Not in v1 | Conflicts with no-shame. |
| Location-based group switching | Not in v1 | Roadmap. Time-of-day default covers most cases. |
| Meet halfway (midpoint cafe) | Not in v1 | Privacy issue to fix first. |
| Clink+, cafe perks, Clink for Teams | Not in v1 | Roadmap. Data model keeps the org hook (see `ARCHITECTURE.md`). |
| Alcohol drink types | Not in v1 | Would raise age rating to 17+. |
| Water goal and reminders | Not in v1 | Roadmap. |
| In-app payment or gifting for drink runs | Not in v1 | Pay back in person. |
| Languages other than English | Not in v1 | One language for beta. Strings live in `COPY.md` keys so we can add more. |
| Tablets, watch, web app | Not in v1 | Phones only. A small web page exists only for invite links opened on a computer. |

---

## 3. Feature specs

### 3.0 Cross-cutting rules

**Tap budget.** QA counts taps from the unlocked home screen with the widget in place and the app already set up.

| Task | Max taps | Path |
|---|---|---|
| Log a drink or water | 2 | +1 Drink, pick |
| Quick flare | 1 | Who joins? |
| Join a friend's flare | 1 | I'm in |
| Bring me one from widget | 2 | Bring me one, pick drink |
| Custom flare with defaults | 2 | Open app, Who joins? |
| Share a snap | 3 | Camera button, shutter, Share |
| Open a friend's order at the counter | 3 | Open app (lands on live flare), tap order, Show to barista |

**Time.** All times show in the device's local time and 12/24h format. Server stores UTC.

**Accessibility.** Every control has a screen-reader label. Text respects system text size in the app (widgets follow platform limits). Exact rules in `DESIGN.md`.

**Copy.** No string is hard-coded outside the string table built from `COPY.md`.

**Analytics.** Event names are listed in section 6. No event ever carries photo data, notes, Plan B, place text, phone numbers or contact data.

---

### 3.1 Sign in

**Purpose.** Get people into an account in under a minute with the fewest steps, and meet store rules.

**Behaviour rules.**
1. iOS shows two options: Sign in with Apple, and Continue with phone.
2. Android shows two options: Sign in with Google, and Continue with phone. Exact SDKs are in `ARCHITECTURE.md`.
3. Phone flow: country picker defaulting to the device region, number entry, 6-digit SMS code. The code auto-fills where the OS supports it.
4. A code is valid for 10 minutes. Resend is available after 30 seconds. After 5 wrong codes, the number is locked for 15 minutes.
5. Phone numbers are used only for contact matching and sign-in. They are never shown to any other user.
6. Apple and Google users are asked to add a phone number during the invite step (3.2 step 4). It is optional. Reason: it lets friends find them and lets them sign in on a phone from the other platform.
7. If an account already exists for the identity, the user is signed into it and skips onboarding (F3).
8. Clink never needs an email. Apple "Hide my email" works with no extra prompt.
9. Sessions stay signed in until the user signs out or deletes the account.

**Edge cases.**
- User switches from iPhone (Apple sign-in only, no phone added) to Android: they cannot reach the old account with Google. Settings shows a card asking Apple and Google users with no phone to add one. If `ARCHITECTURE.md` confirms Apple sign-in on Android, it is offered there as a third, less prominent option.
- Same phone number used on two devices at once: both stay signed in to the same account.
- SMS never arrives: after 30 seconds, show resend and "check the number". No voice call fallback in v1.
- Invite link was opened before sign-in: the invite is kept and applied after sign-in (3.15).

**Acceptance criteria.**
1. On iOS, the sign-in screen shows exactly Apple and phone options. On Android, exactly Google and phone.
2. A new user completes Apple, Google or phone sign-in and reaches onboarding step 2.
3. An existing user signing in on a new device skips onboarding and lands on the camera screen with their usual 3, groups, friends, XP and today's tracker restored.
4. A wrong code shows an inline error. A 6th attempt within 15 minutes is refused with a wait message.
5. Resend is disabled for 30 seconds after each send.
6. No screen visible to another user ever shows the phone number (check friend list, flare, snap viewer, order card, friend request).
7. Sign in with Apple users with "Hide my email" complete sign-in with no email prompt.

---

### 3.2 Onboarding

**Purpose.** Get a new user to a useful state: a usual drink, at least one friend invited, notifications on, widget added. Six steps, in this order.

| Step | Screen | Required? |
|---|---|---|
| 1 | Sign in (3.1) | Yes |
| 2 | Name and photo | Name yes, photo no |
| 3 | Usual 3 | At least 1 drink; details optional |
| 4 | Invite friends | No ("Later") |
| 5 | Notifications pre-prompt | No ("Not now") |
| 6 | Add-widget guide | No ("Remind me later") |

**Behaviour rules.**
1. Step 2: name is 1 to 30 characters. Apple/Google name pre-fills if given. Photo from camera or gallery; initials are the fallback.
2. Step 3: user picks up to 3 drinks from the catalog (`COPY.md`) or a preset, or adds their own. #1 is the widget default and the quick-flare drink. Each slot has a "Make it yours" button for order details (3.7). Continue needs at least 1 drink.
3. Step 4: share buttons (WhatsApp, Messages, More) and a list of contacts already on Clink with an Add button. A progress meter shows "0 of 2". Details in 3.15. Apple and Google users also see an optional phone-number field here.
4. Step 5: our own explainer screen first, then the system permission dialog only if the user taps the positive button. Reason: the system dialog can be shown once.
5. Step 6: a short illustrated guide per platform. "I added it" checks for an installed widget. "Remind me later" moves on.
6. If the user arrived from an invite, step 1 shows who invited them, and they are already friends with the inviter after sign-in.
7. Onboarding state is saved per step. Killing the app resumes at the last unfinished step.
8. Back navigation works on every step after sign-in.

**Edge cases.**
- Notifications denied at system level: onboarding continues. Settings shows a card explaining what they'll miss, with a link to system settings.
- "Not now" on step 5: ask again (our explainer, then system dialog) after the first friend flare they receive in the app.
- Widget not detected after "I added it": show the guide once more with "Skip for now".
- Contacts permission denied in step 4: share buttons still work; the contacts list is replaced by a one-line explainer.
- The user picks a 4th drink in step 3: it replaces #3.

**Acceptance criteria.**
1. A new user sees the 6 steps in the table order and no others.
2. Step 3 Continue is disabled until at least one drink is picked.
3. Steps 4, 5 and 6 can each be skipped, and the user ends on the camera screen.
4. The system notification dialog never appears before the user taps the positive button on our explainer.
5. Killing the app on step 4 and reopening resumes on step 4 with steps 2 and 3 saved.
6. A user who arrived from Maya's invite sees "Maya invited you" on step 1 and has Maya in their friends list at step 4.
7. "I added it" with a widget installed goes to the camera screen; without one, it shows the retry guide.
8. Water is not selectable as a usual 3 drink.

---

### 3.3 Widget

**Purpose.** The product lives here. It shows your day and your friends, and handles the core actions without opening the app.

**Sizes.** Small and medium on both platforms. iOS uses WidgetKit with App Intents; Android uses Jetpack Glance (`ARCHITECTURE.md`). Android widgets are resizable; the layout switches between the small and medium layouts by size. Visual design in `DESIGN.md`.

**Medium states.**

| State | Shows | Actions |
|---|---|---|
| Not signed in / not set up | Prompt to open Clink | Tap opens app |
| Idle | Drinks today, water today, time since last drink, usual #1 (or the caffeine note, 3.11), latest friend snap (or empty slot), group label with up to 3 friend avatars | +1 Drink, Camera, Who joins? |
| Idle, no friends | Same as idle, snap slot replaced by invite prompt | +1 Drink, Camera, Invite (opens app on share buttons) |
| Idle, no usual 3 | Same as idle | +1 Drink opens app on the usual 3 editor |
| +1 picker | Usual 3 + Water | Pick one (logs it), Cancel |
| Your live flare | Category picture, "Coffee, in 15m", place, countdown, reply chips (name + "In" or drink name with note marker) | Tap opens your live flare in app |
| Friend's flare | Friend name and photo, category picture or attached photo, "Maya wants matcha", place, timing, countdown, "+N" if more flares | I'm in, Bring me one, tap elsewhere opens flare in app |
| Bring me one picker | Your usual 3 | Pick one (sends as saved), Cancel |
| Friend's flare, replied | Same card with "You're in" or "Asked for Cortado" | Tap opens app (change or cancel reply there) |

**Small states.**

| State | Shows | Actions |
|---|---|---|
| Idle | Drinks today, water today, time since last drink | +1 Drink |
| +1 picker | Usual 3 + Water in a 2x2 grid | Pick one, Cancel |
| Your live flare | Category, countdown, reply count | Tap opens app |
| Friend's flare | Friend name, category, countdown | I'm in; tap elsewhere opens app (Bring me one is in the app) |

Reason for the small layout: there is no room for snaps or a 3-drink Bring me one picker at that size, so small is the tracker plus one join button.

**Priority when several things are live.** Unreplied friend flare > your live flare > idle. When several friend flares are live, show the newest with "+N". After you reply to or dismiss the friend flare, the widget shows your live flare (if any), then idle.

**Group configuration.**
1. Each medium widget has one setting: which audience its Who joins? targets. Options: Automatic, each of the user's groups, Everyone. Default: Automatic.
2. iOS: set through the system Edit Widget screen. Android: set on a configuration screen when the widget is added, and changeable later.
3. Both platforms: Settings > Widgets lists the user's widgets with their audience and lets the user change it (fallback for launchers without a reconfigure option).
4. The group label on the widget shows the audience the next quick flare will go to, including what Automatic resolves to right now.
5. Users can add more than one widget, each with its own audience.
6. Small widgets have no audience setting, because they have no Who joins? button.

**Behaviour rules.**
1. Widget buttons run without opening the app: +1 Drink, picker choices, Who joins?, I'm in, Bring me one picks.
2. After an action, the widget shows a short confirmation in place ("Logged", "Sent").
3. Pickers close by themselves after 30 seconds of no input.
4. Snaps older than 24 hours never show.
5. Countdowns run on the widget without a network refresh (platform timer text).
6. If data is stale (no refresh for 30+ minutes because of OS limits or no network), the widget still shows the last state; time-based fields (countdown, "last drink") stay correct because they're computed from timestamps.
7. A flare that ended must not keep its action buttons active: tapping I'm in on an ended flare opens the app with "This flare has ended".

**Edge cases.**
- Group used by a widget is deleted: the widget falls back to Automatic.
- Group used by a widget has no members left: Who joins? opens the app with a hint to pick another audience.
- Friend removes you while their flare is on your widget: it disappears on the next refresh; tapping it shows "This flare has ended".
- User signs out: every widget switches to the not-signed-in state.
- Dark mode and tinted/accent home screens: `DESIGN.md`.

**Acceptance criteria.**
1. Both sizes can be added on iOS and Android and render every state in the tables above.
2. +1 Drink, then a drink, logs it without opening the app, and the count updates on the widget within 5 seconds.
3. Who joins? on a medium widget sends a flare to that widget's configured audience without opening the app.
4. Two medium widgets set to Work and Home friends send flares to those groups respectively.
5. Changing the widget audience from Settings > Widgets changes where its next quick flare goes.
6. With a friend's unreplied flare and your own live flare both active, the widget shows the friend's flare; after tapping I'm in, it shows your live flare.
7. With two friend flares live, the widget shows the newer one and "+1".
8. On a test device with good network, a friend's new flare appears on the widget within 60 seconds in at least 9 of 10 tries. If `ARCHITECTURE.md` documents a platform limit that makes this impossible, the CTO sets the target and QA tests that number. The push notification (3.16) is the real-time path either way.
9. I'm in on an ended flare does not register a reply and shows the ended message.
10. The Bring me one widget picker sends the saved order with all saved details and no one-time note.
11. Pickers close after 30 seconds of no input.
12. After sign-out, every widget shows the not-signed-in state.

---

### 3.4 Camera and drink snaps

**Purpose.** Locket-style: a photo of your drink appears on all your friends' widgets. Works with one friend at any time of day.

**Behaviour rules.**
1. The camera is the app's main screen. It opens live (front/back toggle, flash).
2. After the shutter: preview, optional place text (max 40 characters), then two choices: Share snap, or Send as flare (3.5 with the photo attached).
3. **Snaps go to all friends, always.** Never to a group.
4. **A photo attached to a flare goes only to that flare's audience** and is not posted as a snap. Reason: the flare has its own audience; posting it to everyone would leak who the flare was for.
5. No notification for new snaps by default (setting in 3.16). Friends' widgets update.
6. A snap lives 24 hours from upload. Then the snap and the photo file are deleted from storage.
7. Viewer: full screen, swipe for newer/older snaps from the last 24 hours, sender name, time, place.
8. Reactions: ☕ 🍵 🫖 ❤️ 😂. One reaction per viewer per snap; tapping another replaces it; tapping the same one removes it.
9. Sender gets at most one notification per snap for reactions, sent silently (no sound). Later reactions update an in-app list only ("Leo and 2 others").
10. Sender can delete their own snap at any time. It disappears from widgets on the next refresh.
11. Photos are compressed before upload and all location metadata is stripped on device.
12. Camera only, no gallery upload in v1.

**Edge cases.**
- Camera permission denied: explainer with a link to system settings. Flares still work without photos.
- Offline: snap is queued with "Sending…". If it hasn't sent within 60 minutes it is dropped and the user is told in the app.
- No friends: Share snap is still allowed (it shows on your own widget), with a nudge to invite.
- Blocked user: their snaps never show; your snaps never reach them.
- Reported snap: hidden for the reporter at once (3.18).

**Acceptance criteria.**
1. Sharing a snap makes it visible on every friend's widget and viewer, regardless of groups.
2. Send as flare with a photo shows the photo only to members of the chosen audience. A friend outside that group never receives the photo (check widget, viewer, API response).
3. A snap is gone from viewers and widgets 24 hours after upload, and its file is no longer retrievable by URL.
4. Uploaded photos contain no GPS metadata.
5. Reacting twice with different emoji leaves one reaction; the sender receives exactly one notification for that snap no matter how many friends react.
6. Snap-shared notifications are off for a new account.
7. Camera denied shows the explainer and the flare composer still works.

---

### 3.5 Flares

**Purpose.** "I want coffee, who joins?" to the right people, with no pressure on anyone.

**Categories.** Coffee, Matcha, Tea, Smoothie & Juice. Water is never a flare type.

**Composer (app).** On the camera screen: category switcher, optional photo, place field, timing pills, To: chip, Who joins? button.

**Behaviour rules.**
1. Defaults: category of usual #1, last place used (empty if none), timing Now, audience from the automatic rule (3.10).
2. Timing pills: Now, 5m, 15m, 30m, Other. Other offers 5 to 60 minutes in 5-minute steps. Nothing beyond 60.
3. Meet time = send time + chosen timing. The flare stays open until the meet time, with a minimum of 15 minutes after sending. So Now and 5m stay open 15 minutes; 30m stays open 30 minutes.
4. Place is free text, max 40 characters, optional.
5. To: chip opens the audience picker: Automatic (shows what it resolves to), each group, Everyone.
6. Only the chosen audience receives the flare (notification, widget, Live Activity count). People outside it have no way to know it existed.
7. **One live flare per sender.** Sending while one is live asks "Replace your live flare?". Replacing cancels the old one (rule 10).
8. Quick flare from widget: usual #1's category, last place, Now, the widget's audience. No confirm.
9. Sender actions on a live flare: "We're going" (marks it done; shown once there is at least one reply) and Cancel.
10. Cancel: flare disappears from all widgets. People who replied get one silent notification that it's off. Nobody else is told.
11. Done ("We're going"): flare disappears from friends' widgets, replies are locked, the drink-run list stays available to the sender in the app for 2 hours.
12. Expiry with replies: at close time, the flare closes as done (same as rule 11).
13. Expiry with no replies: the flare disappears from every widget. The sender sees "Nobody was free this time" in the app only. No notification to anyone.
14. Live Activity (iOS) and an ongoing notification (Android) show the countdown and reply count from send until close.
15. Notification rate guard: if one sender sends more than 3 flares in 60 minutes, later flares in that hour still reach widgets but their notifications are delivered silently. No user-facing message.
16. Sender sees every reply by name (all repliers are their friends).

**Edge cases.**
- Audience resolves to zero friends: Who joins? is disabled with a hint ("Add people to Work or pick Everyone").
- No friends at all: Who joins? opens the invite screen.
- Sender deletes account while flare is live: flare is cancelled silently for everyone, including repliers.
- Clock changes or time zone change during a flare: close time is absolute (UTC); display adapts.
- Friend removed from the group after the flare was sent: they keep the flare they already received.

**Acceptance criteria.**
1. The composer offers exactly the 4 categories; Water is not offered.
2. Other offers 5 to 60 in 5-minute steps and nothing else.
3. A flare sent with Now closes 15 minutes after sending; with 30m, 30 minutes after sending; with Other 45, 45 minutes after.
4. A flare sent to Work reaches only Work members. A non-member's device gets no notification, no widget change and no API record.
5. Sending a second flare while one is live shows the replace prompt; confirming leaves exactly one live flare.
6. Cancelling a flare with two repliers sends those two exactly one notification each and nobody else anything.
7. A flare with no replies that runs out sends no notification to anyone and shows the "nobody was free" state to the sender in the app.
8. After "We're going", the run list is reachable from the app for 2 hours.
9. Quick flare from the widget uses usual #1's category, the last place and Now.
10. The 4th flare from one sender within 60 minutes reaches widgets but its notifications play no sound.
11. The Live Activity / ongoing notification starts on send, updates the reply count within 10 seconds of a reply when online, and ends at close or cancel.

---

### 3.6 Replies

**Purpose.** Two positive answers, nothing else.

**Behaviour rules.**
1. Replies are "I'm in" or "Bring me one". There is no decline. Ignoring is silent.
2. One reply per person per flare. A person can switch between I'm in and Bring me one until close.
3. I'm in: available from the widget, the notification action, and the app.
4. Bring me one from the widget: pick one of your usual 3; the order is sent exactly as saved (details, Note, Plan B). No one-time note.
5. Bring me one from the app: pick one of your usual 3, optionally add a one-time note (max 80 characters, e.g. "iced today"), send.
6. Bring me one from the notification: opens the app on the Bring me one picker. Reason: picking among three drinks in a notification is clumsy.
7. First Bring me one on a drink with no saved details: in the app, ask "Add how you like it?" with Add details / Send as is. From the widget, it sends as is and the app shows the same nudge once on next open. Each drink nudges at most once.
8. Cancel ("Can't make it anymore") is in the app until close.
   - Cancelling I'm in is silent; the sender sees one fewer.
   - Cancelling Bring me one sends the sender one silent notification, because they might otherwise buy the drink.
9. People who reply but are not friends with each other see counts only ("2 others are in"). Names are shown only for repliers who are your friends.
10. Bring me one goes to the flare sender only. They are the one doing the run.

**Edge cases.**
- Flare ended between seeing it and tapping: "This flare has ended", no reply recorded.
- Sender cancelled after you replied: one silent notification; the flare leaves your widget.
- The replier has no usual 3: Bring me one opens the usual 3 editor first.
- Offline reply: queued with "Sending…"; if the flare closes before it sends, it is dropped and the user is told.

**Acceptance criteria.**
1. No UI anywhere offers or records a decline.
2. A widget Bring me one arrives on the sender's run list with all saved details and no one-time note.
3. An app Bring me one with a one-time note shows that note on the sender's order card, marked as "just this time".
4. Switching from I'm in to Bring me one leaves one reply of type Bring me one.
5. Cancelling I'm in sends no notification. Cancelling Bring me one sends exactly one silent notification to the sender.
6. User A and user B, not friends with each other, both join C's flare: A sees "1 other is in" and never B's name or photo.
7. The no-details nudge appears once per drink and never again after Add or Send as is.

---

### 3.7 Usual 3 and order details

**Purpose.** Save up to 3 go-to drinks once, with exactly how you like them, so the widget and Bring me one work with no typing.

**Catalog.** 10 drinks in each of Coffee, Matcha, Tea, Smoothie & Juice, plus Water (still, sparkling). The list, names and herbal/caffeine flags are in `COPY.md`. Pictures are in `DESIGN.md`. Presets (for example "Hybrid mix") are also defined in `COPY.md`.

**Behaviour rules.**
1. Up to 3 drinks from any flare category, in order. #1 is the widget default and the quick-flare drink. Reorder by drag.
2. "Add your own": a custom drink name (max 30 characters) plus a category, which decides its option set and picture.
3. Water never takes a slot. It is always on the +1 picker.
4. Details are optional. Every field can stay empty.
5. Details are per drink and synced to the account.
6. Friends can see your usual 3 with details (📝 in the friends list). Reason: surprise drinks and runs. One-time notes are seen only by that flare's sender.

**Option sets per category.** Single-choice unless marked "any".

| Field | Coffee | Matcha | Tea | Smoothie & Juice |
|---|---|---|---|---|
| Size | Small, Regular, Large | Small, Regular, Large | Small, Regular, Large | Small, Regular, Large |
| Temperature | Iced, Warm, Hot, Extra hot | Iced, Warm, Hot | Iced, Hot, Extra hot | (none) |
| Milk / Add | No milk, Whole, Skim, Oat, Almond, Soy, Lactose-free | No milk, Whole, Skim, Oat, Almond, Soy, Lactose-free | Nothing, Splash of milk, Oat milk, Lemon | (none) |
| Sweetness | No sugar, ½ sugar, 1 sugar, 2 sugars, Sweetener | Unsweetened, Lightly sweet, Sweet, Honey | No sugar, 1 sugar, Honey | No added sugar, Regular |
| Shots / Strength | Single shot, Double shot, Decaf | Light, Regular, Strong | Light, Regular, Strong (bag left in) | (none) |
| Ice | (via Temperature) | (via Temperature) | (via Temperature) | No ice, Light ice, Regular ice |
| Extras (any) | Extra foam, No foam, Vanilla syrup, Caramel syrup, Cinnamon | Vanilla, Extra foam, Cold foam | (none) | Ginger shot, Protein, Chia seeds, No straw |
| Note | Free text, max 120 | same | same | same |
| Plan B | Free text, max 80 | same | same | same |

Option labels above are the agreed set from the prototype. Final wording comes from `COPY.md`. Option sets are per category, not per drink. Reason: one simple editor; every field is optional, so a field that doesn't fit a drink is just left empty.

**Edge cases.**
- A usual drink is removed from the catalog in a later release: it stays in the user's usual 3 as a custom drink.
- Coffee with Decaf selected does not count as caffeinated in the tracker.
- Editing details while a Bring me one with that drink is live: the live order keeps the details it was sent with.

**Acceptance criteria.**
1. Each of the 4 categories lists 10 drinks matching `COPY.md`, each with its picture.
2. Water cannot be added to a usual 3 slot.
3. Every field in the option table can be set, changed and cleared; multi-select fields accept several values.
4. A custom drink uses the option set of the category the user picked.
5. Saving details updates the widget and the next Bring me one immediately.
6. A friend opening your 📝 sees all saved details, Note and Plan B; they never see a one-time note you sent to someone else.

---

### 3.8 Order card and Show to barista

**Purpose.** The person doing the run gets every order right without asking.

**Behaviour rules.**
1. The sender's run list shows one row per Bring me one: name, drink, and a note marker when there are details or a one-time note.
2. Tapping a row opens the order card: requester name and photo, drink with picture, every set field, Note, "Just this time" note, Plan B.
3. Show to barista: full screen, drink and options in large high-contrast text, requester first name small (for the cup). The screen stays awake while it is open. Swipe for the next order ("1 of 3"). Tap or swipe down to close.
4. Order cards are also reachable from the friends list (📝 next to a friend), showing their usual 3 without any one-time note.
5. The run list and order cards remain available for 2 hours after the flare closes (3.5 rule 11).

**Acceptance criteria.**
1. The run list shows every Bring me one reply in reply order.
2. The order card shows every field the requester saved and nothing they left empty.
3. Show to barista keeps the screen on for at least 5 minutes without a tap.
4. With 3 orders, swiping in barista mode moves through all three and shows "n of 3".
5. Barista text meets the minimum size and contrast in `DESIGN.md`.
6. 2 hours and 1 minute after close, the run list is no longer shown.

---

### 3.9 Friends

**Purpose.** A small, mutual, close-friends list.

**Behaviour rules.**
1. Friendship is mutual. Both sides must agree (an invite acceptance counts as agreement).
2. Cap: 20 friends. Pending requests don't count toward the cap; the cap is checked when a request is accepted.
3. Ways to add: accepted invite (3.15), Add on a contact already on Clink (contact matching), or accepting an incoming request.
4. Incoming requests: notification plus a list in the friends sheet. Accept or leave it. No decline button; a pending request expires quietly after 30 days. The requester is never told.
5. Remove: silent. The removed person is not notified, is removed from all your groups, and stops seeing your snaps, flares and usual 3.
6. The friends sheet shows: groups first, then friends ("5 of 20"), each with photo, name, 📝 for their usual, and "last drink 1h 42m ago" only if that friend opted in (3.11).
7. Contact matching uses phone numbers only. Raw contact lists are not stored on the server; only matches are kept (method in `ARCHITECTURE.md`).

**Edge cases.**
- At 20 and trying to accept: "Remove someone first" with a link to the list.
- Invitee joins while the inviter is at 20: the account is created; the inviter gets a request instead of an automatic friendship.
- Both send requests to each other: they become friends.
- Re-adding someone you removed: allowed through a new request.

**Acceptance criteria.**
1. Accepting a 21st friend is blocked with the "remove someone first" message.
2. A pending request older than 30 days is gone for both sides and nobody was notified.
3. Removing a friend sends them nothing, removes them from every group, and they lose access to your snaps, flares and usual 3 on next refresh.
4. A friend who has not opted in never shows a last-drink time.
5. Mutual requests create one friendship.

---

### 3.10 Groups

**Purpose.** Send flares to the right people (work vs home) without anyone knowing they were sorted.

**Behaviour rules.**
1. Groups are private labels. Only the owner sees them. Friends never see which groups they are in or that groups exist.
2. A group has a name (max 20 characters), an emoji, and members picked from friends. A friend can be in several groups. Max 10 groups per user.
3. New users have only Everyone. Everyone is always all friends and can't be edited.
4. When a user reaches 6 friends, the friends sheet shows a one-time suggestion to create Work and Home friends. Dismissing it removes it for good.
5. **Automatic rule.** Weekdays (Monday to Friday) 08:00 to 17:59 local time → the user's "daytime group"; otherwise → the "other times group". If that group doesn't exist or has no members → Everyone.
6. The daytime and other-times groups are set in Settings > Groups. The suggestion in rule 4 sets them to Work and Home friends. Reason: matching by group name breaks when people rename groups.
7. Snaps ignore groups (3.4 rule 3).
8. Deleting a group removes nobody as a friend.
9. Data model leaves room for a group to belong to a company later (`ARCHITECTURE.md`). No company features in v1.

**Acceptance criteria.**
1. No API response to a non-owner contains group names, membership or existence.
2. At Tuesday 09:00 with a daytime group set and non-empty, Automatic resolves to it; at Tuesday 18:00 and Saturday 10:00, it resolves to the other-times group.
3. With no daytime group set, Tuesday 09:00 resolves to Everyone.
4. The 6-friend suggestion shows once at 6 friends and never after dismissal.
5. A friend in two groups receives one flare sent to either group.
6. Deleting a group leaves the friend list unchanged.

---

### 3.11 Drink and water tracker

**Purpose.** Daily utility that keeps the widget worth its home-screen spot on days with no friends around.

**Behaviour rules.**
1. Two counts: drinks (all flare categories) and water. Logged from the widget +1 picker or the app.
2. Reset at local midnight on the device's current time zone.
3. The app's Today view lists today's entries with times. Undo last is one tap. Any single entry from today can also be removed. Reason: a mis-tap from an hour ago shouldn't need several undos.
4. Counts and water are private, always. They are never sent to friends.
5. Caffeinated: coffee (unless Decaf is in its details), matcha, and tea not flagged herbal in `COPY.md`. Smoothie & Juice and water are not caffeinated.
6. After 4 caffeinated drinks in a day, the widget subline and Today view show a neutral note (wording in `COPY.md`, for example "herbal tea is a nice switch tonight"). No health claims, no caffeine amounts, no maths.
7. Opt-in last-drink sharing (Settings > Privacy, off by default): friends see the time since your last non-water drink. Never counts, never water. Hidden if the last drink was more than 24 hours ago.
8. Water from the widget logs still water. Sparkling is logged from the app.
9. Tracker history syncs to the account. Only today is shown in v1.

**Acceptance criteria.**
1. Logging a drink and a water from the widget shows "1 drink" and "1 water".
2. Entries logged at 23:59 are gone from today's count at 00:00 local time.
3. Undo last removes only the most recent entry.
4. The 4th caffeinated drink shows the note; the 4th drink being a chamomile (herbal) after 3 coffees does not.
5. With sharing off, a friend's API response contains no last-drink time. With it on, it contains the timestamp of the last non-water drink only.
6. No screen or API response to another user contains counts or water.

---

### 3.12 XP

Spec in section 4. Summary for this list: private level and XP, shown only on the user's own profile, earned only from outcomes.

---

### 3.13 Profile

**Purpose.** The user's own page: name, photo, usual 3 shortcut, and their private level.

**Behaviour rules.**
1. Opened from the top bar of the camera screen.
2. Shows name, photo, level name and number, XP progress to the next level, and the last 20 XP entries ("Leo joined through you +50").
3. A friend looking at you (friends list, order card) sees name, photo and usual 3 only. Never level or XP.

---

### 3.14 Settings

Sections, in order:
1. Profile: name, photo.
2. My usual 3 (opens the editor, 3.7).
3. Groups: list, create, edit, delete, daytime and other-times groups.
4. Widgets: installed widgets and their audience; add-widget guide.
5. Notifications (3.16).
6. Privacy: "Friends see my last drink" (off), contact sync on/off, link to privacy policy, what friends can see (3.17).
7. Account: phone number (add/change), sign out, delete account.
8. Blocked people (unblock).
9. Help: report a problem, terms, privacy policy, open-source licences, app version.

**Acceptance criteria.**
1. Settings contains no quiet hours control, no time window setting, and no "Do not disturb" option of our own.
2. Every item above is reachable within 2 taps from the camera screen's settings entry.

---

### 3.15 Invites

**Purpose.** Bring friends in. This is the growth loop.

**Behaviour rules.**
1. **The UI never shows a URL or the words "Invite link".** It shows three share buttons: WhatsApp, Messages, More.
2. WhatsApp opens WhatsApp with a pre-written message (`COPY.md`) that contains the invite URL. Messages opens the platform SMS/iMessage composer (Google Messages or the default SMS app on Android). More opens the system share sheet with the same message.
3. If WhatsApp is not installed, its button is hidden. Messages and More always show.
4. Each user has a personal invite token. The same token works for any number of people.
5. **Deferred deep link.** Tapping the link without the app goes to the store; after install and sign-in, the new user is already friends with the inviter and sees "Maya invited you". With the app installed, the link opens the app directly. Mechanism in `ARCHITECTURE.md`.
6. Fallback when attribution fails after install: after sign-in, show "Did someone invite you?" with contact matches already on Clink.
7. Link opened on a computer: a small web page with a QR code and store badges.
8. **Progress meter.** Onboarding shows "0 of 2". It counts share-button taps and contact Adds in this session, max one per button. Reason: share apps don't reliably report a sent message, so the meter tracks what the user did. It is a nudge, never a gate. In the friends sheet the meter shows real friends ("3 of 20").
9. Share buttons also appear in the friends sheet, on the no-friends widget state's landing screen, and on the "Who joins?" no-friends screen.
10. Existing Clink users who open an invite get a friend request to the inviter accepted automatically on their side (both have now agreed).

**Edge cases.**
- Inviter at 20 friends: account created, inviter gets a request (3.9).
- Inviter deleted their account: invite opens as a plain install; no friendship.
- Inviter blocked the invitee earlier: no friendship, no message to either.
- The same person opens two different invites: friends with both inviters.

**Acceptance criteria.**
1. No screen in either app shows a URL, the word "link" next to an invite, or a Copy link button.
2. On a device with WhatsApp, tapping WhatsApp opens it with the message pre-filled. Without WhatsApp, the button is not shown.
3. More opens the system share sheet with the message and URL.
4. Fresh install from the link, then sign-in: friends with the inviter, with "invited you" shown. Passes in at least 9 of 10 test installs on each platform.
5. When attribution fails, the "Did someone invite you?" screen appears.
6. The onboarding meter reaches "2 of 2" after two different share-button taps or contact Adds.
7. The link opened on a desktop browser shows the QR page.

---

### 3.16 Notifications

**Purpose.** Real-time path for flares. Everything else is quiet or off.

| Notification | Default | Sound | Toggle |
|---|---|---|---|
| A friend's flare (to an audience you're in) | On | Yes | Friend flares |
| Reply to my flare (I'm in / Bring me one) | On | Yes | Replies to my flares |
| Bring me one cancelled on my flare | On | No | Replies to my flares |
| A flare I joined was cancelled | On | No | Friend flares |
| A friend's snap | Off | No | Friend snaps |
| Reactions to my snap (max 1 per snap) | On | No | Reactions |
| Friend request / invite accepted | On | Yes | Friends |

**Behaviour rules.**
1. **No quiet hours.** There is no time-based suppression of any kind in the app or backend. OS-level Focus / Do Not Disturb still applies because the OS does it.
2. Flare notifications have actions: I'm in (works without opening the app) and Bring me one (opens the picker).
3. Android uses one notification channel per row of the table, so users can tune them in system settings.
4. Flare notifications are withdrawn from the notification centre when the flare closes or is cancelled, where the platform allows.
5. No notifications for XP, levels, expired flares, or "you haven't opened Clink".
6. Permission denied: Settings card with link to system settings. Asked again after the first flare received in-app (once).

**Acceptance criteria.**
1. A friend's flare sent at 23:30 is delivered with sound when Friend flares is on.
2. The notifications settings screen lists exactly the toggles above and nothing time-based.
3. I'm in from the notification registers a reply without launching the app UI.
4. Turning off Friend flares stops flare notifications but flares still appear on the widget.
5. No notification is ever sent for XP or levels.

---

### 3.17 Privacy (what others see)

| Data | Who sees it |
|---|---|
| Name, photo | Friends; also people in a shared flare as a count only when not friends |
| Snaps (24h) | All friends |
| Flares and attached photos | Only the chosen audience |
| Replies | The flare sender; other repliers who are your friends |
| Usual 3 with details | Friends |
| One-time note | That flare's sender only |
| Last drink time | Friends, only if opted in |
| Phone number, counts, water, XP, level, groups, who you removed, ignored flares | Nobody but you |

Analytics and logs follow the same rules: no free text, no photos, no phone numbers. Privacy policy, App Store privacy labels and the Play Data safety form must match this table and `ARCHITECTURE.md` (Legal owns the text).

---

### 3.18 Report and block

**Behaviour rules.**
1. Report is available on any snap (viewer ⋯ menu), any flare photo, and any person (friends list). Reasons: nudity or sexual content, harassment or bullying, spam, something else (optional free text, max 200).
2. A reported item is hidden from the reporter at once.
3. Reports go to a review queue. Target: reviewed within 24 hours. Who staffs it is an open CEO question (section 8).
4. Block: removes the friendship, hides all content both ways, removes them from your groups, and prevents them finding you through contacts or your invite. They are not told.
5. Unblock from Settings > Blocked people. Unblocking does not restore the friendship.
6. Content removed by review is deleted for everyone; repeat offenders can be suspended by an admin tool (`ARCHITECTURE.md`).

**Acceptance criteria.**
1. Report is reachable in at most 2 taps from a snap.
2. After reporting, the snap is not visible to the reporter on widget or viewer.
3. After blocking, neither user sees the other's snaps, flares, usual 3 or profile, and the blocked user can't find the blocker through contact matching or invite.
4. The blocked user receives no notification and no visible change except the person being gone.

---

### 3.19 Account deletion

**Behaviour rules.**
1. Settings > Account > Delete account. One explanation screen, then a confirm.
2. On confirm: the user is signed out, disappears from all friends at once, live flares are cancelled silently, and all personal data (profile, photos, snaps, flares, replies, usual 3, tracker, groups, XP) is deleted within 30 days.
3. Sign in with Apple users: the app revokes the Apple token on deletion (Apple requirement; `ARCHITECTURE.md`).
4. Google Play also requires a web page where people can ask for deletion without the app. IT and Legal own it.
5. XP the deleted user gave others through an invite in the last 7 days is reversed (section 4).

**Acceptance criteria.**
1. Deletion is reachable in the app in at most 3 taps from Settings.
2. Right after confirming, friends no longer see the user anywhere on next refresh.
3. Signing in again with the same identity creates a new, empty account.
4. The web deletion page exists and is linked in the Play listing.

---

### 3.20 Offline and error states

| Situation | Behaviour |
|---|---|
| Any send while offline | Queued, "Sending…". After 30 s without success: "Couldn't send. Tap to retry." |
| Flare not sent within 2 minutes | Dropped and the user is told. A stale flare is worse than none. |
| Snap not sent within 60 minutes | Dropped and the user is told. |
| Drink/water log offline | Saved on device, synced later. Never dropped. |
| Reply offline | Queued; dropped if the flare closes first, user told. |
| Widget offline | Shows last state; computed times stay correct. Actions queue the same way as in the app. |
| Flare ended before reply | "This flare has ended." |
| Server error on load | Last cached data plus a small retry line. No full-screen error unless nothing is cached. |
| Camera / contacts / notifications denied | Explainer with link to system settings; rest of the app works. |
| App version too old for the API | Blocking update screen with a store button. |

**Acceptance criteria.**
1. In airplane mode, logging 3 drinks then going online syncs all 3 with their original times.
2. A flare tapped in airplane mode shows "Sending…", then the retry message at 30 s, and is dropped at 2 minutes.
3. Every row of the table can be reproduced and shows the described behaviour.

---

## 4. XP system

**Purpose.** Give people a private sense of progress for the things that make Clink work: bringing friends in, showing up for breaks, and doing drink runs. Nobody competes with anyone.

### 4.1 Rules that never change

1. Only the user sees their own XP and level. Not friends, not groups, not in any share message, not on the widget. No leaderboards and no comparisons.
2. XP is earned for outcomes only. **Sending a flare or a snap earns nothing.** Reactions earn nothing.
3. XP is computed on the server from recorded events. The client only displays it.
4. No streaks, no decay, no "you'll lose XP" messages. XP only goes down through the reversals in 4.3.
5. No XP rewards or unlocks in v1. A level is a level.

### 4.2 Events and values

| Event | XP | When it's awarded | Daily cap |
|---|---|---|---|
| A friend joined Clink through your invite | +50 | When the new account becomes your friend via your invite | 10 people per day |
| New mutual friend (any other way) | +10 | When the friendship is created | 5 per day |
| You joined a friend's flare (I'm in or Bring me one) | +10 | When that flare closes as done, if your reply still stands | 3 per day |
| Your flare got at least one reply | +15 | When your flare closes as done | 2 per day |
| You completed a drink run | +20 per order | When you mark the flare done, or at close time with the order still attached and the flare not cancelled | 3 orders per day |
| You logged a drink or water today | +5 | First log of the local day | 1 per day |

Theoretical max per day without invites: 50 + 30 + 30 + 60 + 5 = 175. Typical engaged week (daily log, 3 joins, 2 replied flares, 1 run): about 115 XP.

### 4.3 Anti-gaming rules

1. **Only accepted invites count.** Shares, taps and opened links earn nothing. The invitee must be a new account created through your invite and verified by phone, Apple or Google.
2. Invite XP is reversed if, within 7 days, the invitee deletes their account or the friendship ends.
3. **Once per pair, ever,** for invite and new-friend XP. Removing and re-adding someone earns nothing.
4. **Pair cap:** between any two users, at most one join-type award per direction per day (one "you joined X's flare", one "X joined your flare", one drink run for X).
5. Cancelled flares award nothing to anyone. Replies cancelled before close award nothing.
6. A drink run counts only when the sender marks the flare done, or at close time with the order still attached. An order cancelled before that earns nothing.
7. Logging XP is once per day however many drinks are logged. Undoing the only log of the day reverses it.
8. Device and account abuse checks (several accounts from one device, disposable numbers) are the CTO's call (`ARCHITECTURE.md`). Accounts flagged by those checks do not trigger invite XP.
9. Every XP change is an append-only ledger entry with an idempotency key, so retries never double-award.
10. Caps reset at local midnight of the user receiving the XP.

### 4.4 Levels

8 levels. **Names below are placeholders.** Final names come from `COPY.md`.

| Level | Placeholder name | XP needed (total) | Rough time for a typical user |
|---|---|---|---|
| 1 | Level 1 name (COPY.md) | 0 | Day 1 |
| 2 | Level 2 name (COPY.md) | 100 | First week with 2 invites |
| 3 | Level 3 name (COPY.md) | 300 | 2 to 3 weeks |
| 4 | Level 4 name (COPY.md) | 700 | 1 to 2 months |
| 5 | Level 5 name (COPY.md) | 1,400 | 3 months |
| 6 | Level 6 name (COPY.md) | 2,500 | 5 months |
| 7 | Level 7 name (COPY.md) | 4,000 | 8 months |
| 8 | Level 8 name (COPY.md) | 6,000 | About a year |

Thresholds are server config so we can retune after beta without an app release.

### 4.5 Where the user sees it

1. Profile only (3.13): level name and number, progress bar, "X XP to next level", last 20 entries.
2. On level-up: a small dot on the profile button in the top bar. Opening the profile shows the new level once. No push, no full-screen celebration, no share prompt.
3. Never on the widget, the friends list, flares, snaps, order cards, or invite messages.

### 4.6 Acceptance criteria

1. Sending 5 flares and 5 snaps with no replies leaves XP unchanged.
2. A new user signing up through A's invite gives A +50 once. Removing and re-adding gives nothing more.
3. If that invitee deletes their account on day 3, A's 50 is reversed and a ledger entry shows it.
4. Joining 4 flares from 4 different friends in one day gives +30, not +40.
5. Joining 2 flares from the same friend on one day gives +10 once.
6. A flare cancelled by the sender gives no XP to the sender or repliers.
7. A Bring me one cancelled before close gives no drink-run XP to the sender.
8. Logging 6 drinks gives +5 once; undoing all of them removes it.
9. An API request for another user's profile returns no XP or level fields.
10. Level-up produces no push notification.
11. Replaying the same event (simulated network retry) awards XP once.

---

## 5. User flows F1 to F30

Updated from the prototype for these decisions: no quiet hours, Smoothie & Juice, share buttons only, Android in v1 (Google sign-in), 6-step onboarding, XP touchpoints. F31 is new.

**F1 First sign in.** Trigger: first launch. Steps: splash → iOS: Apple or phone / Android: Google or phone → (phone) number → 6-digit code → name + optional photo (onboarding step 2) → F4. Edge: wrong code shows inline error, resend after 30 s; Apple "Hide my email" is fine; number with an existing account signs into it (F3).

**F2 Join from a friend's invite.** Trigger: taps the URL inside Maya's WhatsApp or Messages message. Steps: store (or app if installed) → install → sign in → "Maya invited you" → already friends → usual 3 → invite → notifications → widget. XP: Maya gets +50. Edge: invite must survive install (deferred deep link) or fallback "Did someone invite you?"; Maya at 20 friends gets a request instead; link on a computer shows the QR page.

**F3 Returning user or new phone.** Trigger: sign in with an existing account. Steps: sign in → account found → skip onboarding → widget reminder only if none detected → camera screen. Edge: tracker, usual 3, groups, friends and XP all restore from the account; iPhone to Android needs a linked phone number.

**F4 Set your usual 3.** Trigger: onboarding step 3. Steps: preset, or pick up to 3 across Coffee, Matcha, Tea, Smoothie & Juice (10 each) → #1 is the widget default → optional "Make it yours" → Continue (needs 1). Edge: drink not listed → Add your own; a 4th replaces #3; water never takes a slot.

**F5 Invite friends.** Trigger: onboarding step 4. Steps: meter "0 of 2" → WhatsApp / Messages / More, or Add contacts already on Clink → meter fills → Continue, or Later. Edge: contacts denied, share buttons still work; Apple/Google users see the optional phone field; skipped → the widget's no-friends state keeps an Invite button. No URL or "Invite link" text anywhere.

**F6 Accept a friend request.** Trigger: someone added you from contacts. Steps: notification → Accept → you see each other's snaps and flares. XP: +10 to both (once per pair). Edge: ignored requests stay pending and expire after 30 days, never "declined"; at 20, remove someone first.

**F7 Turn on notifications.** Trigger: onboarding step 5. Steps: our explainer with example notifications → Turn on → system dialog → Allow / Don't allow → F8. Edge: denied → app works, Settings card links to system settings; Not now → asked again after the first flare received.

**F8 Add the widget.** Trigger: onboarding step 6. Steps: platform-specific guide (iOS: hold home screen, +, Clink, Medium; Android: hold home screen, Widgets, Clink, Medium) → I added it → camera screen. Edge: Remind me later keeps a card on the camera screen until a widget is detected; small size also offered.

**F9 Log a drink or water from the widget.** Trigger: finished or poured a drink. Steps: +1 Drink → usual 3 + Water → tap one → widget shows new counts and "Last: just now". XP: +5 on the first log of the day. Edge: mis-tap → remove in the app (F10); midnight local reset.

**F10 Today's drinks in the app.** Trigger: taps the counter on the camera screen. Steps: today's drinks and water with times → log another, undo last, or remove an entry. Edge: counts are private (F26 is the only opt-in and shares only a time); after 4 caffeinated drinks, the neutral note shows.

**F11 Edit your usual 3 and order details.** Trigger: Settings > My usual 3. Steps: same editor as onboarding → 📝 on a drink: per-category options, Note, Plan B → widget and Bring me one use it at once. Edge: water has no details; a live order keeps the details it was sent with.

**F12 Share a drink snap.** Trigger: Camera on the widget, or opens the app. Steps: camera live → shutter → preview + optional place → Share snap (all friends' widgets for 24 h) or Send as flare (F16, photo goes only to the flare audience). XP: none. Edge: camera denied → explainer, flares still work; offline → queued up to 60 min.

**F13 See a friend's snap.** Trigger: a friend shares a snap. Steps: widget updates silently → tap → full-screen viewer → react ☕ 🍵 🫖 ❤️ 😂 → sender gets one silent notification per snap. Edge: several snaps → swipe; after 24 h the snap and file are deleted.

**F14 Report or block.** Trigger: something inappropriate. Steps: ⋯ on the snap → Report (reason, hidden for you at once, reviewed within 24 h) or Block (hidden and unfriended at once). Edge: required by store rules for apps with user photos; the other person is never told.

**F15 Quick flare from the widget.** Trigger: Who joins? on a medium widget. Steps: sent at once to the widget's audience with usual #1's category, last place, Now → widget shows your live flare → Live Activity (iOS) / ongoing notification (Android). XP: none for sending. Edge: sent by accident → Cancel in the app, it vanishes from friends' widgets; no friends → invite screen; audience empty → app hint.

**F16 Custom flare from the app.** Trigger: opens the app. Steps: Coffee / Matcha / Tea / Smoothie & Juice → optional photo → place → To: (Automatic, group, Everyone) → Now · 5m · 15m · 30m · Other (5 to 60) → Who joins? → F17. Edge: a live flare exists → "Replace your live flare?"; water is never a flare type; nothing beyond 60 minutes.

**F17 Your live flare.** Trigger: any flare you send. Steps: countdown to close (at least 15 min) → replies arrive (notification, haptic, Live Activity count) → "Leo is in", "Sam: Cortado 📝" → We're going, Cancel, or let it run out → summary with the run list (available 2 h). XP: +15 if it closes as done with a reply; +20 per completed drink run order. Edge: only positive replies shown, no "seen", no "declined"; cancelled flares award nothing.

**F18 Get a friend's flare and join.** Trigger: Maya sends a flare to an audience you're in. Steps: notification "Maya wants matcha · Café Lumi · in 10m" → widget shows it → I'm in from widget, notification or app → Maya is told. XP: +10 when the flare closes as done. Edge: Can't make it anymore → Maya sees one fewer, no notification; doing nothing tells Maya nothing; non-friend joiners appear as a count.

**F19 Bring me one.** Trigger: you can't leave your desk. Steps: Bring me one → pick one of your usual 3 → widget: sent as saved / app: optional one-time note → Maya's run list shows "Dana: Iced Oat Flat White 📝". XP: +10 to you when it closes as done; +20 to Maya for the run. Edge: no details saved → sends plain name and nudges once; one-time notes are app only; cancelling sends Maya one silent notification; paying back is in person.

**F20 Flare ends with nobody.** Trigger: close time with no replies. Steps: countdown ends → gone from every widget → sender sees "Nobody was free this time" in the app only. Edge: no notification, no count of who saw it, no XP.

**F21 Two flares at once.** Trigger: Maya and Noa both send flares. Steps: widget shows the newest + "+1" → app shows both → join either or both. Edge: your own live flare shows on the widget again once you've replied to both.

**F22 Manage friends.** Trigger: friends pill on the camera screen. Steps: groups at top, then friends "5 of 20" → share buttons (WhatsApp, Messages, More), pending requests, remove someone (silent), 📝 usual order, last drink if opted in. Edge: at 20, accepting is blocked; removing someone removes them from all groups.

**F23 Notifications.** Trigger: Settings > Notifications. Steps: Friend flares (on), Replies to my flares (on), Friend snaps (off), Reactions (on), Friends (on). Edge: no quiet hours and nothing time-based; OS Focus modes still apply; Android also exposes each as a channel.

**F24 Sign out or delete account.** Trigger: Settings > Account. Steps: Sign out → splash, widgets show signed-out state; or Delete account → explain → confirm → signed out, gone from friends at once, data deleted within 30 days. Edge: in-app deletion is required by store rules; Apple token revoked; Play web deletion page exists; recent invite XP the user gave is reversed.

**F25 Offline or send failed.** Trigger: no signal. Steps: action queued, "Sending…" → after 30 s "Couldn't send. Tap to retry." Edge: flares dropped after 2 min, snaps after 60 min, logs never dropped.

**F26 Share when I last had a drink.** Trigger: Settings > Privacy (off by default). Steps: turn on "Friends see my last drink" → friends see "Dana · last drink 1h 42m ago" in their friends list. Edge: never counts, never water; hidden after 24 h with no drink.

**F27 Read a friend's order at the counter.** Trigger: you're on a drink run. Steps: your flare → run list → tap 📝 → order card (all fields, "just this time", Plan B) → Show to barista (large text, screen stays on, swipe between orders). Edge: also from Friends (📝 shows their usual for surprise drinks); run list kept 2 h after close.

**F28 Create and edit groups.** Trigger: Friends > New group, or tap a group. Steps: name + emoji → tick who's in → Done. Edge: private labels nobody else sees; a friend can be in several; new users start with Everyone only; suggestion at 6+ friends; deleting a group unfriends nobody; set daytime / other-times groups in Settings > Groups.

**F29 Choose who gets a flare.** Trigger: To: chip in the composer. Steps: Automatic (daytime group weekdays 08:00 to 17:59, other-times group otherwise, else Everyone), a specific group, or Everyone → Who joins? → only that audience is notified. Edge: no location used; non-friend joiners see "2 others are in"; snaps still go to everyone.

**F30 One widget per group.** Trigger: edit the widget (iOS Edit Widget; Android configuration screen) or Settings > Widgets. Steps: pick Automatic, a group, or Everyone → that widget's Who joins? goes there. Edge: two widgets, two groups (Work on page 1, Home friends on page 2); deleted group → widget falls back to Automatic.

**F31 See your level (new).** Trigger: taps the profile button (dot shows after a level-up). Steps: profile → level name and number, progress bar, XP to next level, last 20 entries. Edge: nobody else can see any of it; no push for level-ups; no leaderboard.

Moved out of "After v1": Android (prototype L5) is now in v1. The other "after v1" items stay in the roadmap per `DECISIONS.md`.

---

## 6. Metrics

**North star: weekly completed breaks.** Flares that close as done with at least one reply standing, per week. It counts real-world outcomes (a break someone joined or a drink someone brought), which is the product's job. Measured from `flare_closed` where `outcome = done` and `replies >= 1`.

### v1 targets (closed beta → first 90 days public)

| # | Metric | Target | How it's measured |
|---|---|---|---|
| 1 | Widget added within 24 h of sign-up | ≥ 65% of new accounts | `widget_added` within 24 h of `auth_signed_up` |
| 2 | Activated: 2+ mutual friends within 72 h | ≥ 40% of new accounts | `friend_added` count per user |
| 3 | Invite yield: accepted invites per new account by day 14 | ≥ 0.6 | `invite_accepted` attributed to inviter ÷ new accounts |
| 4 | Flare reply rate: flares with ≥ 1 reply | ≥ 35% | `flare_closed.replies >= 1` ÷ `flare_sent` |
| 5 | Drink runs completed: Bring me one orders not cancelled | ≥ 80% | `drink_run_completed` ÷ `flare_reply{type=bring}` |
| 6 | Tracker habit: weekly active users who log on 3+ days | ≥ 40% | `drink_logged` distinct days per WAU |
| 7 | D30 retention (any app or widget action) | ≥ 20% | Any of `drink_logged`, `flare_sent`, `flare_reply`, `snap_shared`, `app_opened` on day 28 to 30 |
| Guard | Crash-free sessions | ≥ 99.5% per platform | Crash reporter (`ARCHITECTURE.md`) |

Targets are first guesses for a new product. We revisit them after closed beta with real numbers.

### Event list

All events carry: pseudonymous `user_id`, `platform`, `app_version`, `ts`. None carry free text, photos, phone numbers, contact data or place names.

| Event | Properties |
|---|---|
| `auth_signed_up` / `auth_signed_in` | `method` (apple, google, phone) |
| `onboarding_step_viewed` / `onboarding_step_completed` / `onboarding_step_skipped` | `step` (1 to 6) |
| `invite_share_tapped` | `channel` (whatsapp, messages, more), `surface` |
| `invite_opened` | `installed` (bool) |
| `invite_accepted` | `attribution` (deeplink, fallback) |
| `friend_added` / `friend_removed` | `source` (invite, contacts, request) |
| `widget_added` / `widget_removed` | `size`, `audience_type` |
| `flare_sent` | `source` (widget, app), `category`, `timing_min`, `audience_type` (auto, group, everyone), `has_photo` |
| `flare_reply` / `flare_reply_cancelled` | `type` (in, bring), `source` (widget, notification, app), `has_oneoff_note` |
| `flare_closed` | `outcome` (done, expired, cancelled, replaced), `replies`, `orders` |
| `drink_run_completed` | `orders` |
| `order_card_opened` / `barista_mode_opened` | `source` (run_list, friends) |
| `snap_shared` / `snap_viewed` / `snap_reacted` | `reaction` (for reacted) |
| `drink_logged` / `drink_log_removed` | `kind` (drink, water), `category`, `source` (widget, app) |
| `usual_details_saved` | `category`, `fields_set` (count) |
| `level_reached` | `level` |
| `report_submitted` / `user_blocked` | `target` (snap, flare_photo, person) |
| `notification_permission` | `result` (granted, denied, not_now) |
| `account_deleted` | none |
| `app_opened` | `entry` (icon, widget, notification, link) |

---

## 7. Release plan

### Stage 1: Internal build

Who: the team, on at least 2 iOS and 2 Android phones, plus one older supported device per platform (minimums in `ARCHITECTURE.md`).
Builds: EAS internal distribution.

Exit criteria:
1. Every acceptance criterion in sections 3 and 4 passes or has a logged, triaged bug.
2. No open P0/P1 bugs (crash, data loss, privacy leak, wrong audience, wrong order sent).
3. Privacy checks pass: groups, XP, counts, phone numbers and non-mutual names never appear in another user's API responses (QA + Security sign-off).
4. Deferred deep link passes 9 of 10 fresh installs on each platform.
5. All strings come from `COPY.md` and the drink pictures from `DESIGN.md`; no placeholder visuals from the prototype remain.
6. Account deletion and the Play web deletion page work end to end.

### Stage 2: Closed beta

Channels: TestFlight external testing (needs Apple's beta review) and Google Play closed testing.
Seed: 2 to 3 real friend groups of 6 to 10 people each (for example one office team, one group of home friends), plus the team. Mixed iOS and Android in each group. Google currently requires new personal developer accounts to run a closed test with a minimum number of testers for 14 days before production access (12 testers at last check; verify when the account is created). The seed groups must cover that number on Android alone.
Length: at least 3 weeks, and at least 14 days on Android closed testing.
Feedback: in-app "Report a problem", one short interview per group per week, analytics from section 6.

Exit criteria:
1. Crash-free sessions ≥ 99.5% on both platforms over the last 7 days.
2. Each seed group completed at least 5 breaks per week (north star) in weeks 2 and 3.
3. Flare reply rate ≥ 30%, widget-added ≥ 60% of beta accounts.
4. Every tester can do the tap-budget tasks (3.0) without help, observed in at least 5 sessions.
5. No privacy incident. Any report reviewed within 24 hours throughout the beta.
6. XP thresholds checked against real data and retuned in server config if needed.
7. Store listings, privacy labels, Data safety form, privacy policy and terms approved by Legal.

### Stage 3: Public release

Both stores, same day where review timing allows. Android uses a staged rollout (for example 10% → 50% → 100% over a week). iOS uses phased release.

Exit criteria for "done with v1 launch":
1. 100% rollout on both platforms with crash-free ≥ 99.5%.
2. No P0/P1 open for 7 days.
3. Report queue under 24 h response for 14 days.
4. First 30-day read on the section 6 targets written up by the Business Analyst, with a keep/change call on each.

---

## 8. Open questions for the CEO

Only items that change scope, cost money, or carry legal or brand risk. Each has a recommendation so a yes is enough.

1. **Minimum age and launch countries (legal).** The app has user photos and contact matching. Recommendation: 16+ worldwide at launch, English-speaking countries first. Legal confirms per country. Do you agree, or do you want 13+?
2. **Who reviews reports within 24 hours (cost / legal).** Store rules need a working report flow. Options: you or a named person check the queue daily during beta and early launch (no cost), or we add a paid automated image-moderation service before public launch (cost, verify price before purchase). Recommendation: a named person for beta, decide on the service before public release.
3. **Developer accounts: personal or company (legal / brand / cost).** A personal Apple or Google account shows your own name as the seller in the stores. A company account shows the company name but needs a registered company and a D-U-N-S number, and on Google it avoids the personal-account closed-testing requirement. Recommendation: company accounts if a company exists or can be set up before beta. Fees per `ARCHITECTURE.md`; verify before purchase.
4. **SMS sign-in cost (cost).** Every phone sign-in sends a paid SMS. Recommendation: approve a monthly cap set by the CTO (provider and price in `ARCHITECTURE.md`; verify before purchase), with abuse limits from 3.1.
5. **Name and domain (brand / legal / cost).** Invite messages need a short web domain, and "Clink" may already be used by other apps or trademarks. Recommendation: a trademark and store-name search by Legal before beta, and buy the domain the CTO proposes once that's clear.
