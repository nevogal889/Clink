# CLAUDE.md — Clink: Social Coffee, Matcha & Tea Widget (Complete PRD)

> **Product Type:** iOS/Android Home Screen Widget + Locket-Style Minimalist Companion App  
> **Core Concept:** Zero-friction, ephemeral social coordination (`"I want coffee/matcha/tea, who joins?"`) paired with daily personal cup & caffeine utility.  
> **Design Philosophy:** Widget-first, zero public feeds, 15–20 close friends max, <3-second core interactions.

---

## 1. Product Overview, Problem & Vision

### 1.1 The Core Problem (Why Existing Coffee/Tea Apps Fail)
* **Spreadsheet & Data-Entry Fatigue:** Traditional coffee apps force users to log origins, brew ratios, and tasting notes—leading to abandonment within two weeks.
* **The "Why Post?" Problem:** Taking a photo of a mug and typing a caption feels performative and repetitive. Social engagement only works when broadcasting is either effortless or delivers an immediate real-world payoff.
* **Coordination Friction & Fear of Rejection:** Asking a coworker or friend for a coffee/matcha break requires deciding who to text, wondering if they are busy, and risking awkward silence if they can't join.

### 1.2 Product Description
**Clink** is a home-screen-first social utility widget and companion app for **Coffee, Matcha, and Tea lovers**. Modeled on the effortless intimacy of *Locket*, Clink eliminates traditional social media feeds, follower counts, and navigation tabs.

It lives directly on the user's phone home screen as a live, interactive window serving two daily rituals:
1. **Personal Ritual & Daily Utility:** One-tap logging of daily cups (`+1 Cup`) from the user's **Top 3 Favorite Drinks**, displaying live elapsed time since their last cup (`Last: 1h 42m ago`) and smart sleep/caffeine awareness.
2. **Real-World Social Coordination ("The Drink Flare"):** A one-tap ephemeral broadcast (`"I want coffee/matcha/tea, who joins?"`) sent to a tight circle of close friends or coworkers—complete with optional live mug snaps, editable cafe/tea spot names, 1-tap **"Bring Me One 🥤"** drink runs, and **AI Midpoint Venue matching** between friends' home addresses.

### 1.3 Goals & North Star Metrics
* **Primary Goal:** Turn solo daily drink breaks into effortless real-life micro-meetups without the friction or rejection anxiety of texting individuals.
* **Secondary Goal:** Earn permanent Page-1 Home Screen real estate by providing standalone daily utility (cup counter + elapsed timer + usual order memory) even when friends aren't online.
* **Target KPIs:**
  * **Widget Install Rate:** >85% of activated users add the Medium/Large widget during onboarding.
  * **Onboarding Invite Rate (Viral Loop):** >35% of new signups invite at least 2 close friends/coworkers before completing setup.
  * **Time-to-Flare:** <3 seconds from unlocking phone to broadcasting a break invite.
  * **Flare Join Conversion:** >40% of sent flares receive at least one *"I'm In"* or *"Bring Me One"* response within 15 minutes.
  * **Daily Cup Log Retention:** Users log an average of 2.1+ cups/day directly from the widget without opening the full app.

---

## 2. Target Audience & Personas

Clink intentionally bridges **specialty coffee/matcha enthusiasts** and **everyday social drinkers** by removing intimidating brewing jargon and focusing on shared daily rituals.

| Persona | Profile | Core Pain Point | How Clink Solves It |
| :--- | :--- | :--- | :--- |
| **1. The Office / Hybrid Coworker** | Ages 22–38; works in an office, studio, or coworking space; takes 2–3 breaks/day. | Wants a 10-minute espresso or matcha break but hates interrupting coworkers on Slack or texting 1-by-1. | **Work Crew Circle** broadcasts a 15-minute ephemeral flare (`"Kitchen espresso in 10m?"`) with zero rejection if people are in meetings. |
| **2. The Weekend Neighborhood Explorer** | Ages 24–42; loves specialty cafes, ceremonial matcha bars, and local bakeries. | Wants to meet nearby friends on Saturday mornings without endless *"Where should we go?"* group chat debates. | **Weekend Friends Circle** + **Home Address Midpoint Finder** automatically suggests an equidistant cafe between everyone who joins. |
| **3. The Mindful Sipper (Coffee + Matcha/Tea)** | Ages 20–45; switches from morning coffee to afternoon matcha or evening herbal tea. | Loses track of how many caffeinated cups they've had or when their last cup was, affecting sleep. | **Widget Cup Counter & Elapsed Timer** tracks cups today, time since last cup (`Last: 1h 42m ago`), and suggests herbal tea late in the day. |
| **4. The Desk-Bound Teammate ("Drink Run" Beneficiary)** | Any busy student, designer, developer, or nurse who can't step away. | Misses out on cafe runs because teammates don't know their order or don't want to ask. | Tapping **"Bring Me One 🥤"** on the widget attaches their saved **#1–#3 Usual Drink** automatically. |

---

## 3. Core UX Architecture (Locket-Style Simplicity)

Clink follows a strict **"No-Feed, 2-Screen Loop"** architecture:

1. **Zero Navigation Tabs:** No bottom tab bar, no Explore page, no public timeline, no comment threads, and no follower counts.
2. **Direct-to-Action Launch:** Tapping the widget opens directly into the **Flare Composer Frame** (equivalent to Locket's camera shutter).
3. **Tight Circles (Cap: 20 Friends):** Users maintain two curated micro-circles that auto-switch based on day/time or geofence:
   * `🏢 Work Crew` (Active Mon–Fri, 8:00 AM – 5:00 PM)
   * `🏡 Weekend Friends` (Active Evenings & Weekends)
4. **Ephemeral Lifespan (15–30 Minutes):** Every flare has a live countdown timer (`14:59`). If nobody joins before expiration, the flare quietly vanishes—eliminating social awkwardness.

---

## 4. Feature Specifications

### 4.1 Home Screen Widget (3 Live Interactive States)

#### State A: Idle State (Personal Utility + Quick Social Trigger)
* **Top Bar (Cup & Time Tracker):**
  * Displays total cups logged today (`2 cups today`), dynamic beverage emoji (`☕`, `🍵`, or `🫖`), and live elapsed time since the last cup (`Last: 1h 42m ago`).
  * Displays user's **#1 Usual Drink** and sleep-readiness indicator (`Safe for sleep` vs. `Try herbal tea for sleep` at 4+ cups).
  * **`+1 Cup` Action Button:** Opens an inline overlay right inside the widget showing the user's **Top 3 Favorite Drinks** for 1-tap logging without launching the app.
* **Middle & Bottom Row (Ambient Circle Status):**
  * Shows active circle (`Work Crew • 3 Open`) with colored availability dots and overlapping friend avatars.
  * **`📸` Quick Camera Shortcut:** Opens the app directly with the live mug camera active.
  * **`👋 Who joins?` Instant Trigger:** Fires a default 10-minute flare to the active circle in 1 tap.

#### State B: Outgoing Live Flare State (Sender View)
* Replaces the idle widget when the user sends a flare.
* Shows live countdown badge (`14:59`), selected drink (`Coffee`, `Matcha`, or `Tea`), target location/spot name, optional mug photo background, and live chips of friends who tapped **Join** or **Bring Me One 🥤**.

#### State C: Incoming Friend Flare State (Receiver View)
* Full-bleed takeover of the widget when a friend broadcasts a flare.
* Displays friend's avatar, name, drink craving (`"Maya wants matcha!"`), spot name, and countdown timer.
* **Visual Modes:**
  * **Clean Card Mode:** Warm espresso/matcha gradient card with friend's **#1 Usual Drink** badge.
  * **Live Mug Snap Mode:** Full-bleed background photo of the friend's mug/cafe with high-contrast scrim overlay.
* **Zero-Typing Widget Actions:**
  * **`I'm In ☕ / 🍵`:** Confirms attendance immediately and notifies the sender.
  * **`Bring Me One 🥤`:** Expands an inline selector of the receiver's **Top 3 Favorite Drinks**; tapping one sends a Drink Run request with the exact drink attached.

---

### 4.2 Companion App (Single-Screen Locket Frame + Bottom Sheets)

1. **Drink Category Switcher (`☕ Coffee` | `🍵 Matcha` | `🫖 Tea`):**
   * Dynamically updates the headline (`"I want coffee/matcha/tea, who joins?"`), mug liquid preview color (Espresso `#8D552E`, Matcha `#5E8C4A`, Tea `#B86B35`), and default venue suggestions.
2. **Optional Mug Snap Camera (`📸 Snap Mug Photo`):**
   * **Optional, never mandatory**—keeping the primary send action at 1 tap while letting users share a visual vibe check of their empty desk mug or cafe patio when desired.
3. **Editable Place / Venue Field (`📍 Type cafe or tea spot...`):**
   * Inline editable text pill inside the frame pre-populated with smart context defaults (*Office Espresso Bar* on workdays, or the *AI Midpoint Cafe* on weekends), allowing users to type any custom cafe, tea house, or office spot name.
4. **Quick Timing Pills (`Now` | `In 10m` | `In 20m`):**
   * Single-tap departure window selector inside the frame.
5. **My Top 3 Favorite Drinks ("My Usual 3" Bottom Sheet):**
   * Users save up to 3 go-to drinks across Coffee, Matcha, and Tea (with 1-tap presets: *Hybrid Mix*, *Matcha & Japanese Tea*, and *Loose Leaf & Chai*).
   * Powers both the **Widget `+1 Cup` logger** and the **`Bring Me One 🥤` Drink Run** feature.
6. **Home Address & AI Midpoint Venue Finder (Bottom Sheet):**
   * Users set their **Home Address** (stored privately as neighborhood/geohash coordinates).
   * When broadcasting in **Weekend Friends** mode and 1+ friends join, Clink computes the **equidistant midpoint specialty cafe or tea house** between the user's Home Address and joining friends' Home Addresses, showing walking times for each person (e.g., `6m walk from Kallio • 7m walk from Maya`).

---

## 5. End-to-End User Flows

### Flow 1: Viral Locket-Style Onboarding (Invite Gate)
```text
[User installs Clink]
       │
       ▼
[Step 1: Set "My Usual 3" Favorite Drinks (Coffee / Matcha / Tea)]
       │
       ▼
[Step 2: Invite 2–3 Go-To Coffee/Tea Buddies (1-Tap iMessage / WhatsApp / Slack Link)]
       │
       ▼
[Step 3: Interactive 5-Second Guide to Add Home Screen Widget]
```

### Flow 2: Logging a Daily Cup (Zero App Launch)
```text
[User finishes or pours a drink] ──► [Taps "+1 Cup" on Home Screen Widget]
       │
       ▼
[Inline overlay shows Top 3 Drinks: #1 Iced Oat Flat White, #2 Ceremonial Matcha, #3 Jasmine Tea]
       │
       ▼
[User taps #2] ──► [Widget updates: "3 cups today • Last: Just now" + Dynamic Island confirmation]
```

### Flow 3: Broadcasting a Break ("I want coffee/matcha/tea, who joins?")
```text
[User wants a break]
       │
       ├──► Fast Path (1 Tap): Taps "👋 Who joins?" directly on Widget ──► Fires immediately
       │
       └──► Custom Path (2–3 Taps): Taps Widget / "📸" button ──► Opens Locket Frame
                   │
                   ├─► Optional: Switch ☕ Coffee / 🍵 Matcha / 🫖 Tea
                   ├─► Optional: Tap "📸 Snap Mug Photo"
                   ├─► Optional: Edit "📍 Place Name" or Timing ("Now" / "In 10m" / "In 20m")
                   │
                   ▼
            [Taps "Send Flare" CTA] ──► [Live Radar Mode (15m countdown) + Midpoint Cafe Match]
```

### Flow 4: Joining or Requesting a Drink Run (Receiver)
```text
[Friend's Home Screen Widget flips to Incoming Flare]
       │
       ├──► Option A: Taps "I'm In ☕" ──► Sender gets instant haptic + badge; Midpoint Cafe shown
       │
       └──► Option B: Taps "Bring Me One 🥤" ──► Receiver picks #1–#3 Drink ──► Attached to Sender's screen
```

---

## 6. Technical Architecture & Maintenance Costs (For Claude Code)

### 6.1 Recommended Stack
* **iOS Native (Recommended):** SwiftUI (iOS 17+) + `WidgetKit` with `AppIntent` interactive buttons (`LogCupIntent`, `JoinFlareIntent`, `TriggerQuickFlareIntent`) + `ActivityKit` (Live Activities & Dynamic Island).
* **Cross-Platform Alternative:** React Native / Expo SDK 52+ with native Swift `WidgetKit` extension and Android `Jetpack Glance` sharing state via `App Groups` (`UserDefaults(suiteName:)`).
* **Backend & Realtime Sync:** Supabase or Firebase Realtime DB + APNs/FCM silent background push (`WidgetCenter.shared.reloadTimelines`).
* **Maps & Midpoint Search:** Native Apple `MapKit` (`MKLocalSearch` + `CLGeocoder`, $0/request on iOS) or Google Places API with neighborhood geohash caching.

### 6.2 Core Data Models

```typescript
interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string;
  top3Drinks: [string, string, string];
  homeLocation?: {
    label: string;        // e.g., "Kallio, Helsinki"
    latitude: number;
    longitude: number;
  };
  workLocation?: {
    label: string;        // e.g., "Kamppi Office"
    latitude: number;
    longitude: number;
  };
  cupsToday: number;
  lastCupTimestamp: string; // ISO-8601
}

interface Circle {
  id: string;
  ownerId: string;
  type: 'work' | 'weekend';
  name: string;             // "Work Crew" | "Weekend Friends"
  memberIds: string[];      // Capped at 20 close friends
}

interface DrinkFlare {
  id: string;
  senderId: string;
  circleId: string;
  drinkType: 'coffee' | 'matcha' | 'tea';
  timingLabel: 'Now' | 'In 10m' | 'In 20m';
  placeName: string;
  mugPhotoUrl?: string;     // Auto-deleted after 24h via storage TTL rule
  createdAt: string;
  expiresAt: string;        // createdAt + 15 minutes
  responses: FlareResponse[];
  midpointVenue?: {
    name: string;
    address: string;
    walkMinutesByUser: Record<string, number>;
  };
}

interface FlareResponse {
  userId: string;
  type: 'joining' | 'drink_run';
  requestedDrink?: string;
  respondedAt: string;
}
```

### 6.3 Privacy & UX Guardrails
1. **Exact Home Coordinates Are Never Exposed:** Friends never see a user's street address or map pin—only the resulting public midpoint cafe/tea house and relative walking time (`6m walk`).
2. **No Read Receipts or "Seen" Shame:** Senders only see positive actions (`Joining` or `Drink Run`). Users who miss a flare are never shown as "declined."
3. **24-Hour Ephemeral Storage TTL:** Mug snap photos auto-delete after 24 hours, keeping storage costs near zero and reinforcing privacy.

### 6.4 Infrastructure & Maintenance Cost Breakdown
Beyond the **Apple Developer Account ($99/year)** and **Google Play Console ($25 one-time)**:
* **0 → 5,000 Users:** **$0/month** (Supabase/Firebase free tiers + APNs/FCM free push + native Apple MapKit + local `UserDefaults` cup storage + 24h photo auto-delete).
* **5,000 → 25,000 Users:** **~$25–$55/month** (Supabase Pro ~$25/mo + ~$5 storage + ~$0–$25 cached place lookups).

---

## 7. Go-To-Market & Marketing Playbook

Because Clink requires 2+ friends to function, growth relies on **dense friend-cluster seeding** rather than expensive cold ads:

1. **Phase 1: Launch & Seeding ($0 – $200 | 0 → 2,500 Users):**
   * **Short-Form POV TikTok / Reels:** 7-second screen recordings showing a phone on an office desk flipping to a friend's mug snap (`"Alex wants matcha in 10m — Who joins?"`) and tapping `Bring Me One 🥤`.
   * **Office & University Cluster Seeding:** Offer $15–$20 coffee/matcha gift cards to student clubs or startup teams when 5+ members install the widget together.
2. **Phase 2: Creator & Cafe Seeding ($500 – $2,000/mo | 2,500 → 25,000 Users):**
   * Partner with micro-creators (10k–50k followers) in *WFH, Matcha/Coffee, Tech, and University* niches.
   * Place minimalist QR table cards at local specialty cafes (`"Meet halfway here via Clink — show your live Flare for 10% off your 2nd drink"`).
3. **Phase 3: Paid Scaling ($3,000+/mo | 25,000+ Users):**
   * TikTok Spark Ads on top-performing organic POV videos + Apple Search Ads (`"coffee tracker"`, `"caffeine widget"`, `"Locket"`).

---

## 8. Monetization Strategy (No Intrusive Ads)

**Core Rule:** Never paywall the basic social flare button and **never use third-party banner/interstitial ads** (Apple/Google forbid ads inside widgets, and pop-up ads break the viral invite loop).

1. **Local Cafe & Matcha Bar Partnerships (Primary B2B Revenue):**
   * Independent specialty cafes and matcha bars pay **€30–€99/month** (or **€1–€2 per group check-in**) to appear as **"Verified Midpoint Spots"** offering a group perk (e.g., *Free oat milk upgrade* or *10% off the 2nd drink* during slow afternoon hours).
2. **"Clink+" Consumer Subscription (€2.99/month or €19.99/year):**
   * Custom aesthetic widget themes (Ceremonial Matcha Green, Retro Espresso, Ceramic) & custom app icons.
   * Advanced caffeine half-life decay curve synced with Apple Health / Oura / Whoop.
   * Unlimited circles (*Study Group*, *Running Club*, *Travel Buddies*) + annual **"Coffee & Tea Wrapped"** recap.
   * Smart Calendar auto-sync (detects free 15-minute gaps between meetings).
3. **In-App Drink Gifting & Specialty Drops:**
   * One-tap €5 coffee/matcha gift cards to thank a coworker who grabbed your drink on a *"Bring Me One 🥤"* run + affiliate partnerships with specialty coffee roasters and ceremonial matcha brands.
4. **"Clink for Teams" (€49–€199/month per office):**
   * Branded company circles for hybrid offices and coworking spaces with Slack integration and weekly coworker coffee-roulette matching.