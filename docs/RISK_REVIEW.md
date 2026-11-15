# Clink: security and legal risk review

Owner: Risk unit (Senior Security Expert and Senior Legal Counsel).
Audience: engineering, Product, Design, Words, and the CEO for section 9 only.
Status: review of v1 docs as written on 2026-11-15. `DECISIONS.md` wins over this file. Where a fix below changes another unit's file, that unit makes the edit; this file says what and why.

Reviewed: `DECISIONS.md`, `original-prd.md`, `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `COPY.md`, `prototype.html` (behaviour only).

How to read this:
- **MUST FIX** blocks store approval, breaks a law, or exposes user data. Nothing ships to external testers until these are closed.
- **SHOULD FIX** is a real weakness that doesn't meet that bar. Close before public launch unless the owner writes down why not.
- Each finding has an id (M-nn, S-nn), the docs it touches, the issue and the exact fix.
- **Decision:** lines are calls the Risk unit made under its authority, with the reason.
- Facts we could not confirm while writing are marked **(verify)**.

Not legal advice for any one country. Before public launch in a country, the privacy policy and terms get a read by a lawyer qualified there (CEO question 5).

---

## 1. Summary

The architecture is careful in most places: privacy by table, server-only writers, HMAC contact matching, short signed URLs, no third-party analytics, EXIF stripping, pgTAP tests per policy. The problems are concentrated in five areas:

1. **Supabase exposure defaults.** `security definer` functions and views in `public` are reachable by every client unless we revoke them. As written, any user can call `accept_friend_request` or `award_xp` with any arguments (M-01).
2. **Visibility rules that miss a path.** Flare photos are stored as snaps and become visible to all friends (M-02). Flares stay readable after a block or removal, forever (M-03). An existing user who taps any invite link becomes friends with a stranger (M-04).
3. **Store rules for user photos.** No content filter, no way to remove a user, no age gate, a pre-prompt button Apple rejects, and no reviewer access plan (M-05, M-06, M-07, M-15).
4. **GDPR basics that no doc owns yet.** No retention schedule, no access/export process, no vendor DPAs, deletion gaps, and copy that overstates our privacy (M-08 to M-14).
5. **Device hand-over.** Push tokens stay bound to the old account after sign-out (M-16), and snap files can outlive the 24-hour promise (M-17).

17 MUST FIX, 24 SHOULD FIX, 5 CEO questions.

---

## 2. Decisions made by the Risk unit

| # | Decision | Reason |
|---|---|---|
| D1 | Lawful bases are as in section 6. No consent screen beyond the OS permission prompts and the existing opt-ins. | Contract covers the features people sign up for. Consent screens would add taps without adding protection. |
| D2 | The tracker is treated as health-adjacent: kept 90 days, never used for anything but the tracker and the one neutral note, declared as Health in both store forms. No Article 9 consent screen. | We record drink choices, not health status, and draw no health inference. A broad reading of "data concerning health" (CJEU, Lindenapotheke, 2024) is covered by minimising instead of adding a consent gate. Revisit if Product adds caffeine maths, goals or HealthKit. |
| D3 | Existing users must confirm before an invite makes them friends. New users keep the automatic friendship. | `DECISIONS.md` requires it only for new users after install. For existing users, a link tap creating a friendship is a security hole (M-04). |
| D4 | Contact matching runs on legitimate interests for non-users' numbers, documented in a short LIA. Nothing about non-users is stored. | It's the only basis available for people who aren't our users, and it holds because processing is transient and in-memory. |
| D5 | Report evidence: 90 days after the report closes. Report records: 1 year after closing. Apparent child sexual abuse material: preserved and reported as the law of the company's country requires (M-06). | Long enough to handle repeat offenders and appeals; short enough to defend. |
| D6 | Moderation is "remove content and suspend accounts". Suspension is part of v1. | App Store 1.2 reviewers expect the developer to eject users who post objectionable content. PRD 3.18 rule 6 already assumes it. |
| D7 | Minimum age recommendation stays 16+ worldwide, pending the CEO (question 1). The age gate is built either way. | One rule covers every EU Article 8 variant (13 to 16) and keeps us clear of COPPA. |

---

## 3. MUST FIX

### M-01. Internal SQL functions and moderation views are callable by every client
**Docs:** `ARCHITECTURE.md` 4.2, 4.3, 4.4 ("SQL functions ... not exposed to clients unless stated"), 8.4 ("saved SQL view in Supabase Studio").

**Issue.** Postgres grants `EXECUTE` on new functions to `PUBLIC`, and Supabase exposes every function in `public` at `/rest/v1/rpc/<name>` to `anon` and `authenticated`. "Not exposed" is not true unless we revoke it. As written, a signed-in user can call:
- `accept_friend_request(...)` or `redeem_invite(...)` with any two user ids, which creates a friendship and gives them that person's snaps, usual 3, last drink and flares
- `award_xp(...)` and `settle_flare(...)` to set any XP
- `block_user(a, b)` on behalf of others
- `are_friends(a, b)` and `is_blocked(a, b)` as an oracle on anyone's social graph

The same applies to views: a view in `public` runs with its owner's rights and ignores RLS, so a moderation view there would let any user read every report and evidence path.

**Fix.**
1. Create schema `private`. Move `accept_friend_request`, `block_user`, `resolve_audience`, `settle_flare`, `award_xp`, `hit_rate_limit`, `redeem_invite` and every moderation view into it. `private` is not in PostgREST's exposed schemas.
2. Keep `are_friends` and `is_blocked` in `private` too. RLS policies can call `private.are_friends(...)`; grant `usage` on the schema and `execute` on those two to `authenticated` only, and make both return false unless one argument is `auth.uid()`.
3. In the first migration:
   ```sql
   alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
   revoke execute on all functions in schema public from public, anon, authenticated;
   grant execute on function public.flare_view(uuid), public.incoming_flares() to authenticated;
   ```
4. Every exposed `security definer` function takes the caller from `auth.uid()`, never from a parameter, and sets `search_path = ''`.
5. Moderation views live in `private` with `security_invoker = true`. Studio reads them as the service role.
6. CI: run `supabase db lint` and the Supabase security advisor; fail on "security definer view", "function search path mutable" and "RLS disabled". Add a pgTAP test that calls each private function as `authenticated` and expects `permission denied`.

### M-02. Flare photos are stored as snaps, so every friend can read them
**Docs:** `ARCHITECTURE.md` 4.2 (`flares.snap_id references snaps`), 4.3 (snaps policy, `snaps` bucket policy), `PRD.md` 3.4 rule 4 and acceptance 2, 3.18 rule 1, `COPY.md` 4.19 `report.title.photo`.

**Issue.** PRD says a photo sent with a flare goes only to that flare's audience. In the schema, a flare photo is a `snaps` row, and the `snaps` policy and bucket policy allow every friend to read any live snap row. A friend outside the Work group can list `snaps` and fetch the photo of a flare sent to Work. That also leaks that the flare existed, which PRD 3.5 rule 6 forbids. `reports.target_kind` has no value for a flare photo, so the report flow the PRD and Copy specify has nowhere to go.

**Fix.**
1. New table `flare_photos (flare_id uuid primary key references flares on delete cascade, sender_id uuid not null, image_path text not null, thumb_path text not null, created_at timestamptz default now())`. Drop `flares.snap_id`.
2. New bucket `flare-photos`, path `{sender_id}/{flare_id}.jpg` and `_t.jpg`. Read policy: caller is the sender, or has a `flare_recipients` row for that flare and passes the M-03 checks, and `now() < flares.expires_at + interval '2 hours'`.
3. `send-flare` writes the photo row. A flare photo never creates a `snaps` row.
4. Flare photos are deleted by `flare-tick` 2 hours after the flare ends (the run-list window, PRD 3.5 rule 11), through the Storage API.
5. `reports.target_kind` check becomes `('snap', 'flare_photo', 'user')`, with `target_flare uuid`. The `report` function copies the flare photo to `moderation`.
6. pgTAP: friend C, not in the audience, gets zero rows from `flare_photos` and a 400/404 when minting a signed URL.

### M-03. Flares stay visible after block or removal, and forever
**Docs:** `ARCHITECTURE.md` 4.3 flares policy, 4.4 `respond-flare`, 8.4 block; `PRD.md` 3.9 acceptance 3, 3.18 acceptance 3, 3.3 edge case "Friend removes you".

**Issue.** Flare visibility is only "has a `flare_recipients` row". `block_user()` deletes the friendship, requests and group memberships but not recipient rows. So a blocked or removed person keeps reading the blocker's live flare, including the place and meet time, which is location data, and can still reply. The policy has no time bound either, so every recipient can read every flare they ever got, with places and times, for as long as the row exists.

**Fix.**
1. Flares policy, recipient branch:
   ```sql
   exists (select 1 from public.flare_recipients r
           where r.flare_id = flares.id and r.recipient_id = (select auth.uid()))
   and private.are_friends(flares.sender_id, (select auth.uid()))
   and flares.expires_at > now() - interval '2 hours'
   ```
   Blocks delete the friendship, so `are_friends` covers both block and removal. Apply the same rule in `flare_view`, `incoming_flares`, `widget-api` and `respond-flare` (which also checks `status = 'live'`).
2. `block_user()` and friend removal delete `flare_recipients` and `flare_responses` rows linking the two users on live flares, in both directions, and send each side a background "clear" push so widgets drop the flare now.
3. The sender keeps full read access to their own flares while the row exists; retention in M-08 removes them.
4. pgTAP: after A blocks D, D gets zero rows from `flares`, `flare_photos` and `flare_view` for A's live flare, and `respond-flare` returns 404.

PRD 3.5 edge case "Friend removed from the group after the flare was sent: they keep the flare" stays true, because they are still a friend.

### M-04. Any invite link tap makes an existing user friends with a stranger
**Docs:** `PRD.md` 3.15 rules 4 and 10, `ARCHITECTURE.md` 4.2 `invites.max_uses`, 6, `COPY.md` 4.2, 7.

**Issue.** PRD 3.15 rule 10 accepts the friendship automatically when an existing user opens an invite. Display names are free text, so an attacker can name themselves "Mom" or a colleague's name, and the landing page and app will say "Mom invited you". One tap on the link, with the app installed, and the attacker becomes a mutual friend. They then see snaps, usual 3 with notes, last-drink time if shared, and every flare sent to Everyone with its place and time. Codes are reusable 50 times and never expire, and "More" lets people post the message to an Instagram story or a Slack channel, where strangers can redeem it.

**Fix.**
1. Existing users (any account past onboarding): the invite route shows a confirm card with the inviter's name and photo: "Add Maya as a friend?" with Add and Not now. Nothing is written until Add. Words adds `invite.confirm.title`, `invite.confirm.add`, `invite.confirm.no`. Change PRD 3.15 rule 10 to match.
2. New users keep the automatic friendship (`DECISIONS.md`). The arrival banner `invite.welcome` gets a text button "Not someone you know?" that removes and blocks in one tap.
3. `invites.max_uses` default 20 (the friend cap, so a code can't make more friends than anyone can have). Each code expires 30 days after creation. `register-device` rotates an expired code silently. Change PRD 3.15 rule 4 from "any number of people" to "up to 20 people, renewed every 30 days".
4. `redeem-invite` refuses when the redeemer and inviter are blocked either way, and when the invite is expired, revoked or used up; it returns the same `err.invite_code` for each so codes can't be probed.
5. The existing `n.invite_ok` notification to the inviter stays on by default, so an unexpected joiner is visible.

### M-05. No age gate anywhere
**Docs:** `PRD.md` 3.1, 3.2, 8 question 1; `COPY.md` 4.1; `DESIGN.md` 4.1; `ARCHITECTURE.md` 5.

**Issue.** No screen asks age. COPPA forbids collecting personal data from under-13s in the US without verified parental consent. GDPR Article 8 sets 13 to 16 by EU country where consent is the basis, and national contract law limits what minors can agree to. Both stores require an honest age rating and target audience, and Google Play applies its Families rules if the audience includes children. The UK Age Appropriate Design Code applies to under-18s whatever our minimum.

**Fix.**
1. Add a neutral age screen after the sign-in method succeeds and before the account row is created: a birth month and year picker with no default and no hint of the cut-off. Words writes `age.title` ("When were you born?"), `age.cta`, `age.too_young` ("Clink is for people {min} and over.").
2. Under the minimum: don't create the account, delete the just-created `auth.users` row server-side, revoke the Apple token if any, and store a device flag (Keychain / Keystore) that keeps the age screen in the refused state for 24 hours so the picker can't be retried at once.
3. Store only `age_confirmed_at` and `min_age_version` in `user_private`. Never store the birth date.
4. Minimum per CEO question 1. Recommendation 16+ everywhere.
5. Store settings: App Store Connect age rating questionnaire with user-generated content answered yes; pick the rating that matches our minimum (the 2025 Apple rating tiers include 13+ and 16+; check the current questionnaire). Google Play target audience: 16 to 17 and 18+ only (or 13+ if the CEO chooses 13).
6. US state app-store age laws (Texas, Utah, Louisiana) require apps to use the store's age signal in some cases; their status has been in court **(verify before launch)**. If any applies in a launch state, read Apple's Declared Age Range API and Google Play's Age Signals API at sign-up and treat a "minor" signal like an under-age answer.
7. If we learn a user is under the minimum (a report, a support email), suspend and delete the account within 7 days.

### M-06. Store UGC rules: no filter, no way to eject users, no CSAM procedure
**Docs:** `ARCHITECTURE.md` 8.4, 4.2 `profiles`, `reports`; `PRD.md` 3.18 rules 3 and 6; `COPY.md` 4.1 `signin.legal`, 4.17 Help, 4.19.

**Issue.** App Store guideline 1.2 requires, for apps with user content: a method to filter objectionable material, a report mechanism with timely action, blocking, and published contact information. Apple's 1.2 review notes also expect a terms agreement with zero tolerance for objectionable content and that the developer removes the content and ejects the user. Google Play's UGC policy requires terms accepted before posting, in-app reporting and blocking, and ongoing moderation. Today:
- no filter on photos or on text that others see (display name, place, Note, Plan B, one-time note, custom drink name)
- PRD 3.18 rule 6 mentions suspension "by an admin tool", and no doc defines one
- no in-app contact address
- no procedure for child sexual abuse material, which a photo app will eventually receive

**Fix.**
1. **Text filter (free, v1).** A server-side blocklist (slurs, sexual terms, common evasions, in English for v1) checked in every function that writes text shown to another person, and by a trigger on `profiles.display_name` and `usual_drinks.custom_name/details`. Refuse with `err.text_blocked` ("That word isn't allowed on Clink."). The list lives in `private.blocked_terms` so it can change without a release.
2. **Photo filter.** Before public App Store submission, `share-snap` and `send-flare` pass the 480 px thumb to an image moderation API and hold the fan-out until it returns. A high nudity or violence score hides the item (`hidden_at`) and opens a report. Vendor and cost are CEO question 2. The vendor must not run face recognition or keep our images for training (its DPA must say so). For the TestFlight and Play closed beta, a named person reviews reports daily (PRD question 2) and the text filter runs.
3. **Suspension.** Table `private.suspensions (user_id uuid primary key, reason text, created_at, lifted_at)`, not on `profiles`, so users can't clear it through `profiles_write`. While suspended: every edge function and `widget-api` returns 403, RLS policies on `snaps`, `flares`, `profiles` and `usual_drinks` hide the user's content from others (add `and not private.is_suspended(sender_id)`), and push sends stop. A Studio SQL snippet suspends and lifts. Words adds `err.suspended` ("Your account is suspended. Email support@{domain} if you think this is a mistake.").
4. **Contact info.** Settings > Help gets a "Contact us" row that opens `mailto:support@{domain}` (`set.h.contact`). The support URL goes in both store listings.
5. **Terms acceptance.** Keep the sign-in footer but make the terms say: users agree to the Community Guidelines, there is zero tolerance for objectionable content or abusive users, and content and accounts can be removed. See M-13 for the footer wording.
6. **Moderation runbook** (`docs/MODERATION.md`, owned by Legal, written before beta): who reviews, the 24-hour target, what each reason leads to, how to suspend, how to record a statement of reasons (S-17), and the CSAM procedure: don't download, forward or delete the evidence; hide it for everyone; suspend the account; report to NCMEC's CyberTipline if the company is US-based (18 U.S.C. 2258A, with the evidence preserved for 1 year under the 2024 REPORT Act) or to the national hotline and police in the company's country otherwise; keep the report record and evidence on legal hold outside the normal 90-day purge.

### M-07. Pre-permission button says "Allow camera"
**Docs:** `COPY.md` 4.24 `perm.cam.yes`, 4.25 `perm.notif.yes`; `DESIGN.md` 4.3 step 5.

**Issue.** App Review rejects pre-permission screens whose button uses words like "Allow" (guideline 5.1.1(iv), "apps must not ... manipulate ... people to consent"). `perm.cam.yes` is "Allow camera". "Turn on notifications" carries the same risk at lower odds.

**Fix.** `perm.cam.yes` = "Continue". `perm.notif.yes` = "Continue". Keep "Not now" as the second button on both. `perm.contacts.yes` "Check contacts" describes the action and can stay. Design updates the step 5 button label in 4.3.

### M-08. No retention schedule
**Docs:** `ARCHITECTURE.md` 4.4 scheduled jobs, 4.2; `PRD.md` 3.11 rule 9, 3.9 rule 4.

**Issue.** GDPR Articles 5(1)(e) and 13(2)(a) require a stated period for each kind of data. Only snaps, rate counters, app events, moderation evidence, devices and widget credentials have one. Flares (with places and times), flare responses (with full orders and one-time notes), drink logs, friend requests, report records and `auth.audit_log_entries` (IP addresses) are kept forever. The privacy policy can't be written without this.

**Fix.** Add these to the daily 03:00 UTC job, and Legal copies the table into the privacy policy.

| Data | Kept for | How |
|---|---|---|
| Snaps and files | 24 h after upload (file gone within 25 h) | `snap-cleanup` hourly, plus M-17 |
| Flare photos | Until 2 h after the flare ends | `flare-tick` (M-02) |
| `flares.place`, `flare_responses.drink`, `one_time_note` | Set to null 24 h after the flare ends | Daily job |
| `flares`, `flare_recipients`, `flare_audience`, `flare_responses` rows | 90 days after the flare ends | Daily job. `xp_events.ref_id` has no FK, so the ledger survives. KPIs read from `app_events` and aggregates. |
| `drink_logs` | 90 days (D2) | Daily job. Product: only today is shown, so nothing visible changes. |
| `friend_requests` pending | 30 days (PRD 3.9 rule 4) | Daily job (missing today, see S-05) |
| `friend_requests` accepted or cancelled | 30 days after the status change | Daily job |
| `reports` records | 1 year after closing (D5) | Daily job |
| `moderation` evidence | 90 days after closing (D5), except legal holds | Already planned |
| `auth.audit_log_entries` | 90 days | Daily job with the service role |
| `app_events` | 13 months | Already planned |
| `push_devices` unseen | 90 days | Already planned |
| Database backups | Rolling, as the Supabase plan keeps them (7 days on Pro at last check, **verify**) | Stated in the policy |
| Sentry events | 90 days or the plan's default, whichever is shorter **(verify)** | Sentry project setting |
| Account data | Until deletion, then M-09 | |

### M-09. Account deletion misses data
**Docs:** `ARCHITECTURE.md` 4.7, 4.2 `xp_events`; `PRD.md` 3.19 rule 5, 4.3 rule 2; `COPY.md` 4.20.

**Issue.** Cascades from `auth.users` cover the tables, but these survive:
- `auth.audit_log_entries` rows naming the user (no FK)
- Sentry events tagged with the user id
- Twilio Verify records of the phone number
- cached avatar, snap thumbs and name in friends' widget state and App Group files until their next refresh
- `reports.note` text they wrote about others (kept on purpose, but the policy must say so)

Also, the PRD requires reversing invite XP the deleted user gave, and `xp_events.amount > 0` makes a reversal entry impossible.

**Fix.** Add to `delete-account`, in order:
1. Before step 6, send every friend's devices a background push that removes the user from widget state and deletes cached files with their id.
2. After step 6, delete `auth.audit_log_entries` where `payload->>'actor_id'` or `payload->'traits'->>'user_id'` is the user (match the current Supabase payload shape at build time).
3. Call Sentry's API to delete events for that user id, or don't set a Sentry user id at all (S-13 prefers the second).
4. Twilio: no per-user call; the privacy policy names Twilio's retention **(verify their period)**.
5. XP reversal: allow negative amounts with kind `invite_reversed` (S-02), written for the inviter in the same transaction.
6. Privacy policy states what stays: report records and evidence for the D5 periods, backups until they roll off. `del.3` "within 30 days" stays true as long as backups roll off inside 30 days.
7. A pgTAP or integration test creates a user with a row in every table and a file in every bucket, deletes them, and asserts zero rows and zero objects, excluding only the D5 report records.

### M-10. The web deletion page has no identity check and no deadline
**Docs:** `ARCHITECTURE.md` 4.7 (last paragraph), `PRD.md` 3.19 rule 4.

**Issue.** The page takes "a phone number or email" and a person processes it by hand. Anyone who knows a number can get that account deleted. We never collect email, so the email option can't be matched to an account. "Within the period Legal sets" is unset.

**Fix.**
1. The page signs the person in on the web: phone OTP through the same Supabase project, or Sign in with Apple or Google (web flows). Then it shows the same explanation as `del.*` and calls `delete-account` with that session. No manual step, no email field.
2. For Apple users deleting on the web, Apple token revocation needs a token we hold: store the Apple refresh token (encrypted, `private` schema) at sign-in, and revoke with it (S-14).
3. Deadline: done at once; if anything fails, support finishes it within 30 days (GDPR "one month", and matches `del.3`).
4. The page URL goes in the Play Data safety form and the Play listing.

### M-11. No way to exercise access and portability rights
**Docs:** none today. Affects `ARCHITECTURE.md`, the privacy policy.

**Issue.** GDPR Articles 15 and 20 give users a copy of their data in a portable format within one month. CCPA gives a similar right where it applies. No doc has a process.

**Fix.** v1 handles it by email, no UI:
1. `privacy@{domain}` in the privacy policy and Settings > Help.
2. We verify the requester by asking them to send the request from Settings > Help > Contact us while signed in (the email body carries a short signed token with their user id), or by a web OTP sign-in as in M-10.
3. A service-role script `scripts/export-user <uuid>` writes one JSON file (profile, settings, usual 3, drink logs, groups and members, friends list, flares sent, replies, live snaps, XP ledger, reports they filed) plus their live photos, as a zip. Reports filed about them are listed without the reporter's identity.
4. Sent within 30 days through a link that expires in 7 days.

### M-12. No DPAs or transfer terms with vendors
**Docs:** `ARCHITECTURE.md` 1, 7, 8.5, 12.

**Issue.** GDPR Article 28 requires a written processing agreement with every processor, and Chapter V requires a transfer mechanism for data leaving the EU or UK. None is planned.

**Fix.** The CEO accepts or signs each one when creating the account (all are standard, no cost at our size **(verify)**). Legal keeps `docs/legal/vendors.md` with the date, the transfer mechanism and the data each one gets.

| Vendor | Gets | Agreement |
|---|---|---|
| Supabase | Everything server-side | Supabase DPA (requested in the dashboard). Check the hosting region and sub-processors. |
| Twilio | Phone numbers, SMS content | Twilio DPA (part of their terms) |
| Google Firebase (FCM) | Push tokens, notification payloads (names, places) | Firebase / Google Cloud data processing terms, accepted in the console |
| Apple (APNs, Sign in with Apple) | Push payloads, Apple identity | Apple Developer Program terms; Apple acts as its own controller for Sign in with Apple |
| Google (Sign in with Google) | Google identity | Google API terms |
| Sentry | Crash data | Sentry DPA; pick the EU data region if launching in the EU |
| Cloudflare | Landing page requests, invite codes in URLs, IP logs | Cloudflare DPA (self-serve) |
| Expo (EAS Update) | Update requests with device and IP data | Expo DPA |
| Email provider (support@, privacy@, moderation@) | Support emails, report alerts | Provider's DPA (Google Workspace if chosen) |
| Image moderation vendor (M-06) | Snap and flare thumbs | DPA with no training and no face recognition |

For each US vendor, record whether it is certified under the EU-US Data Privacy Framework, and rely on the SCCs in its DPA otherwise **(verify each)**.

### M-13. Copy overstates our privacy
**Docs:** `COPY.md` 4.1 `signin.legal`, 4.2 `invite.fallback.body`, 4.24 `perm.contacts.body`, `perm.cam.body`, `NSContactsUsageDescription`.

**Issue.** Privacy statements that aren't accurate break GDPR transparency (Article 12) and count as deceptive under the FTC Act. The US FTC has said publicly that hashing doesn't make data anonymous.
- `invite.fallback.body` "These people on Clink have your number." describes reverse matching, which needs us to store every user's uploaded contacts. We don't, and must not (`ARCHITECTURE.md` 8.1, D4). PRD 3.15 rule 6 means forward matching.
- `perm.contacts.body` "Numbers are scrambled on your phone first, and nothing is kept." A SHA-256 of a phone number is reversible, so "scrambled" implies a protection we don't give. It also doesn't say the numbers leave the phone, which Google Play's prominent-disclosure rule needs.
- `perm.cam.body` "disappear after 24 hours" without the exception for reported snaps.
- `signin.legal` asks people to "agree to" the Privacy Policy. A privacy policy is a notice, not a contract, and consent isn't our basis.

**Fix.** Words replaces:
- `invite.fallback.body` = "People in your contacts who are on Clink." The screen needs contacts permission; if not granted, it shows `perm.contacts` first.
- `perm.contacts.body` = "Clink sends the numbers in your contacts to our server, encrypted, to check who's on Clink. They're used for that check and not kept." (Fits 136 characters.)
- `perm.cam.body` = "Clink needs the camera for drink snaps. They go to your friends only and come off their widgets after 24 hours."
- `signin.legal` = "By continuing, you agree to the Terms. See the Privacy Policy for how we use your data."
- `NSContactsUsageDescription` can stay.

### M-14. Store privacy declarations are not drafted
**Docs:** `PRD.md` 3.17, 7 stage 2 exit 7; `ARCHITECTURE.md` 1 (analytics), 4.2.

**Issue.** Both stores reject or remove apps with inaccurate privacy labels, and `DECISIONS.md` lists them as required. Nothing says what we declare. The tracker, contact matching and push tokens are the easy ones to get wrong.

**Fix.** Declare exactly this (and update it with any new SDK):

**Apple App Privacy.** Tracking: No. Data linked to the user, purpose App Functionality unless noted:
- Contact Info: Name, Phone Number
- Health & Fitness: Health (drink and water logs, D2)
- User Content: Photos or Videos; Other User Content (place, notes, Plan B, reports)
- Contacts: declared even though matching is transient, so both stores say the same thing
- Identifiers: User ID; Device ID (push tokens and device rows)
- Usage Data: Product Interaction (`app_events`, purpose Analytics)
- Diagnostics: Crash Data, Performance Data (Sentry, purpose App Functionality; not linked if S-13 drops the user id)
- Not collected: Location, Email, Financial, Browsing, Search, Contacts stored

**Google Play Data safety.** Encrypted in transit: yes. Users can request deletion: yes, with the M-10 URL. Shared with third parties: no (processors don't count as sharing under Play's definition). Collected:
- Personal info: Name, Phone number
- Photos and videos: Photos
- Contacts: collected, processed ephemerally, not stored
- Health and fitness: Health info (drink and water logs)
- App activity: App interactions; Other user-generated content
- App info and performance: Crash logs, Diagnostics
- Device or other IDs: push tokens

Also on Play: complete the Health apps declaration in App content if the console shows it, declaring the hydration or nutrition tracking category if one is listed, and nothing medical **(verify the current form)**.

Legal signs off both forms against this table and `PRD.md` 3.17 before stage 2.

### M-15. No plan for App Review access
**Docs:** `PRD.md` 7; `ARCHITECTURE.md` 5, 10.

**Issue.** Apple (guideline 2.1) and Google (App access) need working sign-in for reviewers, and reviewers test report and block on real content. With phone OTP and an empty friend list, review fails or stalls.

**Fix.**
1. One review phone number configured in Supabase Auth test OTPs on `clink-prod` with a random 6-digit code, rotated after each review. No other test numbers in prod.
2. That account is seeded with 3 friend accounts (their own test numbers, not signed in anywhere), a live snap from each with drink-only photos, and a script that sends a fresh flare to the reviewer before submission.
3. The review accounts are friends only with each other. The 20-friend cap and blocks keep them from reaching real users. The test-OTP numbers are on a deny list in `match-contacts` and `redeem-invite`.
4. Review notes in both consoles: the number, the code, where report and block are (snap ⋯ menu, friends row menu), and that Sign in with Apple also works.

### M-16. Push devices stay bound to the old account after sign-out
**Docs:** `ARCHITECTURE.md` 4.2 `push_devices`, 4.4 `register-device`, 3.1 widget token; `PRD.md` 3.3 edge case "User signs out".

**Issue.** Sign-out revokes the widget token but keeps the `push_devices` row. Notifications for user A (friend names, places, orders) keep going to that phone after A signs out, including when someone else signs in or the phone is sold. `push_token` is unique, but the doc doesn't say the upsert moves ownership.

**Fix.**
1. Sign-out calls `register-device` with `action: 'signout'` before clearing the session. The server deletes the `push_devices` row, its `widget_credentials` and `live_activity_tokens`.
2. `register-device` upsert: `on conflict (push_token) do update set user_id = excluded.user_id, ...` and revokes widget credentials of the previous owner for that device.
3. The app clears the App Group / DataStore state, cached images and Keychain widget token on sign-out, then reloads widgets.
4. If the app can't reach the server at sign-out, it still clears local state and retries the server call on next launch; until then the device token is stale but the new user's register replaces it.

### M-17. Snap files can outlive 24 hours, and orphan uploads are never deleted
**Docs:** `ARCHITECTURE.md` 4.3 storage, 4.4 `share-snap`, `snap-cleanup`, 8.2; `PRD.md` 3.4 rule 6, acceptance 3.

**Issue.**
- A 15-minute signed URL minted at 23h55 works until 24h10, and `snap-cleanup` runs hourly, so the file is reachable up to about 25 hours. PRD acceptance 3 says it's gone at 24 hours.
- Clients upload straight to Storage and then call `share-snap`. Files uploaded without a `share-snap` call (offline drop after 60 minutes, crash, a modified client) have no `snaps` row, and cleanup only looks at rows. Those photos stay forever.
- Buckets have no size or type limit, so a client can store anything.

**Fix.**
1. Signed URL lifetime for snaps = `least(15 min, expires_at - now())`. Refuse to mint when under 30 seconds.
2. `snap-cleanup` also lists objects in `snaps/` older than 25 hours and deletes them whether or not a row exists. Same for `flare-photos/` (M-02) and `avatars/` versions that aren't the current `avatar_path`.
3. Bucket settings: `snaps` and `flare-photos` allow `image/jpeg` only, 1.5 MB max; `avatars` `image/jpeg`, 1 MB.
4. `share-snap` checks the path prefix is the caller's id, that the snap id is new, and that both objects exist and are under the size limit.
5. Change PRD acceptance 3.4.3 to "gone from viewers and widgets at 24 hours; the file is deleted within 25 hours and no URL works after 24 hours".

---

## 4. SHOULD FIX

### S-01. Edge functions bypass RLS with the service role
**Docs:** `ARCHITECTURE.md` 4.4, 3.1, 3.3.
**Issue.** `widget-api`, `send-flare`, `match-contacts` and the NSE image path read with the service role, so each re-implements the RLS rules in TypeScript. One missed check (block, expiry, friendship) leaks data, and pgTAP doesn't test those code paths. The NSE's avatar and thumb downloads need signed URLs that the widget token can't mint through Storage RLS.
**Fix.** Writes keep the service role. Reads run as the user: functions with a user JWT use a client built with that JWT; `widget-api` resolves the token to a user id, then queries through a direct Postgres connection inside a transaction that runs `set local role authenticated` and `select set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role', 'authenticated')::text, true)`, so RLS applies. `widget-api` mints image URLs only for paths returned by those RLS-checked queries. Add Deno tests that run the M-03 block case through `widget-api`.

### S-02. XP ledger can double-award and can't reverse
**Docs:** `ARCHITECTURE.md` 4.2 `xp_events`, 4.5; `PRD.md` 4.2, 4.3; `COPY.md` 4.16.
**Issue.**
- Postgres treats NULLs as distinct in a unique key, so rows with `ref_id` or `counterpart` null (`daily_log`, possibly `flare_got_joiner`) are never deduplicated.
- `amount > 0` blocks the reversals PRD 4.3 rule 2 and `xp.e.adjust` need.
- The `new_friend` (+10) kind from PRD 4.2 is missing.
- "Once per pair, ever" (PRD 4.3 rule 3) isn't enforced; the key includes `local_date`.
- `daily_log` trusts the client's `local_date`, so backdated logs farm XP.
**Fix.** `unique nulls not distinct (user_id, kind, ref_id, counterpart, local_date)` (Postgres 15+). `amount <> 0` with kinds `invite_reversed` and `log_reversed`. Add `new_friend`. A partial unique index `(user_id, kind, counterpart) where kind in ('invite_accepted', 'new_friend')`. Award `daily_log` only when `local_date` is within one day of `now()` in the user's stored time zone and `logged_at` is within 36 hours of `now()`. Never award XP based on how many drinks someone logs.

### S-03. Contact matching hardening
**Docs:** `ARCHITECTURE.md` 8.1, 8.3; `PRD.md` 3.9 rule 7, 3.14; `COPY.md` 4.17 `set.p.contacts`.
**Issue.** Any account can test 6,000 numbers a day and learn name and existence for each hit. There's no way to opt out of being found. The Settings toggle "Contact matching" has no defined behaviour (one-off or recurring).
**Fix.**
1. `match-contacts` requires the caller to have a verified phone number.
2. Add `user_settings.discoverable boolean default true` and a Settings > Privacy toggle "People with my number can find me" (`set.p.discoverable`). Off excludes the user from matches. Disclose it in the policy.
3. Define the toggle: on = re-check at most once a day on app open, within the 3-call limit; off = never upload.
4. Response: user id, display name, nothing else.
5. A lint rule bans logging the request body in `match-contacts`; verify in Supabase logs that edge function request bodies aren't stored.
6. Alert (email to the CTO) when an account hits the daily cap 3 days in a row.
7. Legal writes the LIA (D4) in `docs/legal/`.

### S-04. Phone-number recycling can hand an account to a stranger
**Docs:** `ARCHITECTURE.md` 5; `PRD.md` 3.1.
**Issue.** Carriers reassign numbers. The new owner of a number signs in by OTP and gets the old owner's friends, snaps and orders.
**Fix.** On every new-device sign-in, send the account's other devices a notification "New sign-in on {device}" with an action "Not me" that signs out every session and opens Settings > Account. If the account has a linked Apple or Google identity and hasn't been used for 90 days, phone sign-in also asks for that identity. Words adds the strings.

### S-05. Pending requests never expire, and the profiles policy has a scoping bug
**Docs:** `ARCHITECTURE.md` 4.2 `friend_requests`, 4.3 `profiles_read`; `PRD.md` 3.9 rule 4.
**Issue.** PRD promises 30-day expiry; no job does it. A pending request grants profile and avatar read, so an unwanted requester keeps seeing name and photo indefinitely. In `profiles_read`, the subquery's unqualified `id` binds to `friend_requests.id`, not `profiles.id`, so the pending-request branch never matches (it fails closed, but the feature breaks and a later "fix" may open it wrongly).
**Fix.** Daily job sets pending requests older than 30 days to `cancelled`. In the policy, write `r.from_id = profiles.id` and `r.to_id = profiles.id`. Qualify every column inside `exists` subqueries across all policies. pgTAP covers request-counterpart read.

### S-06. Clients can insert reports directly
**Docs:** `ARCHITECTURE.md` 4.3 `reports` policy, 4.4 `report`.
**Issue.** The `insert_own` policy lets a client write any `target_user`, `evidence_path` or `status`, skipping the function that copies evidence and counts distinct reporters.
**Fix.** Drop the policy; reports go only through the `report` function, which derives `target_user` from the snap or flare. Add a rate limit of 20 reports a day per user.

### S-07. Last-drink sharing returns more than promised
**Docs:** `ARCHITECTURE.md` 4.2 trigger, 4.3 `last_drink_shares`; `PRD.md` 3.11 rule 7, acceptance 5.
**Issue.** The 24-hour hide is UI-only, so the API returns older times. The trigger runs on insert only, so after undo or remove friends still see the removed drink's time. The doc doesn't say turning the toggle off deletes the row, and a trigger running as the user can't write a table with no insert policy.
**Fix.** Policy adds `and last_drink_at > now() - interval '24 hours'`. A `security definer` trigger on `drink_logs` insert and delete recomputes the latest non-water `logged_at`. A trigger on `user_settings` deletes the row when `share_last_drink` goes false, in the same transaction.

### S-08. Avatar path and free-text limits aren't enforced server-side
**Docs:** `ARCHITECTURE.md` 4.2; `PRD.md` 3.4, 3.5, 3.6, 3.7, 3.10, 3.18; `COPY.md` 4.
**Issue.** `profiles.avatar_path` can point at another user's avatar (impersonation). DB limits are looser than the PRD (place 60 vs 40, Note 140 vs 120, Plan B 140 vs 80, one-time note 140 vs 80, group 24 vs 20, custom drink 40 vs 30, report note 500 vs 200). Clients can be modified, so only the server limit counts.
**Fix.** `check (avatar_path is null or avatar_path like id::text || '/%')`. Set every DB check to the PRD number.

### S-09. Block and removal don't clear cached content on devices
**Docs:** `ARCHITECTURE.md` 3.3, 8.4.
**Issue.** RLS stops new reads, but the other person's widget keeps the snap thumb, avatar and flare until its next refresh, which can be hours on iOS.
**Fix.** `block_user()` and removal send a background push to both users' devices that drops the other's items from widget state and deletes their cached files, then reloads widgets. Same push on account deletion (M-09) and suspension (M-06).

### S-10. Deep links and Android components
**Docs:** `ARCHITECTURE.md` 1, 5, 6, 7.
**Issue.** Expo's custom URL scheme can be registered by any other app. The Android Apple sign-in web flow returns through a redirect. Notification action receivers and the widget configuration activity are new entry points. Checking whether WhatsApp is installed needs package visibility on Android 11+.
**Fix.** Invite and auth redirects use the https domain (Universal Links / App Links with `autoVerify="true"`), never the custom scheme. Supabase OAuth uses PKCE (`flowType: 'pkce'`). Android receivers and services are `exported="false"` unless the system must call them; `PendingIntent`s use `FLAG_IMMUTABLE`. Declare `<queries><package android:name="com.whatsapp"/></queries>`; never request `QUERY_ALL_PACKAGES` (Play restricts it). The app never reads the clipboard by code; only the system Paste control does.

### S-11. Invite landing page leaks and design conflict
**Docs:** `ARCHITECTURE.md` 6; `COPY.md` 7; `DESIGN.md` 4.1 invited state.
**Issue.** The landing page holds the code in its URL; outbound links to the stores send it as a referrer. Search engines can index codes. `DESIGN.md` 4.1 shows the inviter's avatar before sign-in, but `invite-preview` returns a first name only and avatars need a friend relationship.
**Fix.** Headers on `/i/*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, a strict CSP, no third-party scripts, no cookies, no Cloudflare Web Analytics (so no cookie banner is needed). Before sign-in the invited state shows initials, not the photo; Design updates 4.1.

### S-12. Secrets placement
**Docs:** `ARCHITECTURE.md` 8.5, 10.
**Issue.** "Supabase function secrets and EAS secrets" doesn't say which secret goes where. Anything in `app.config.ts` `extra` or an `EXPO_PUBLIC_*` variable ships inside the app and is public. CI deploy jobs don't need the service role key.
**Fix.**
| Secret | Lives in | Never in |
|---|---|---|
| APNs .p8, FCM service account, phone pepper, Twilio, Apple Sign in key, moderation API key | Supabase function secrets | EAS, repo, app |
| Supabase service role / secret key | Supabase function secrets | CI, EAS, app |
| Supabase anon / publishable key, Sentry DSN | App config (public by design) | |
| iOS signing, Android keystore | EAS credentials | repo |
| Supabase access token for deploys | GitHub Environment secret, prod environment needs approval | |
Turn on GitHub secret scanning with push protection and Dependabot. The CEO keeps an offline copy of the pepper in a password manager; losing it means recomputing every `phone_hmac` from `auth.users`. Write a key-rotation note per secret in `docs/runbooks/`.

### S-13. Sentry configuration
**Docs:** `ARCHITECTURE.md` 1.
**Fix.** EU data region if we launch in the EU. `sendDefaultPii: false`. "Prevent storing IP addresses" on in project settings. No Session Replay. `beforeSend` and `beforeBreadcrumb` drop request and response bodies, URLs with query strings, and any field named `note`, `planB`, `place`, `phone`, `hashes`. No Sentry user id (use none; crash grouping doesn't need it).

### S-14. Supabase Auth settings
**Docs:** `ARCHITECTURE.md` 5.
**Fix.** Email and anonymous sign-in off. Refresh token rotation on with reuse detection. Access token lifetime 1 hour. Authorized Google client ids set to our Android and web clients only. Twilio Verify Fraud Guard on and geo permissions limited to launch countries. Apple: exchange the authorization code at sign-in and store the refresh token encrypted in `private`, so revocation works from the web page and admin deletion (M-10). Phone change requires an OTP to the new number and a fresh session.

### S-15. Widgets on a locked phone
**Docs:** `DESIGN.md` 5.4; `ARCHITECTURE.md` 3.
**Issue.** iOS StandBy shows home-screen widgets while the phone is locked and charging, so friends' snap photos, names and places show on a locked phone.
**Fix.** In the iOS widget, mark the snap thumbnail, friend names and place text `.privacySensitive()` so the system redacts them when locked. Android flare and request notifications use `VISIBILITY_PRIVATE` with a public version "{name} sent a flare" so the place stays hidden on a secure lock screen.

### S-16. Health-adjacent tracker
**Docs:** `PRD.md` 3.11; `COPY.md` 4.15; `original-prd.md` 4.1.
**Issue and fix (D2).** Keep the 4-drink note exactly as neutral as `COPY.md` 4.15 has it. Never ship "Safe for sleep" or any sleep or health wording from `original-prd.md`. No health claims in store listings, screenshots or keywords ("caffeine tracker" is fine, "sleep better" isn't). Analytics props for `drink_logged` stay `kind`, `category`, `source` only. Drink logs never go to any vendor except Supabase.

### S-17. EU Digital Services Act basics
**Docs:** none today; affects `web/`, the terms and `docs/MODERATION.md`.
**Issue.** If we offer Clink in the EU we are a hosting service. Even as a small company we must: let anyone (including non-users) report illegal content (Art. 16), give the uploader a statement of reasons when we remove or restrict content (Art. 17), name points of contact (Art. 11, 12), and describe moderation in the terms (Art. 14). A non-EU company also needs an EU legal representative (Art. 13, CEO question 3).
**Fix.** `web/report` form (target description, reason, contact email). When moderation hides content or suspends an account, an in-app notice states what, why, and how to appeal (reply to support@). Terms include a content moderation section. Points of contact: privacy@ and support@ in the terms.

### S-18. Photos of other people
**Docs:** `PRD.md` 3.18; `COPY.md` 4.19.
**Issue.** Snaps will catch friends and strangers in cafes. A person in a photo may not be a Clink user, or not the reporter's friend.
**Fix.** Add a report reason "I'm in it and didn't agree" (`report.r.5`), handled as a priority removal. Non-users use `web/report` (S-17). The Community Guidelines say: don't post photos of people who haven't agreed. No face recognition anywhere, including the moderation vendor.

### S-19. First-party analytics
**Docs:** `PRD.md` 6; `ARCHITECTURE.md` 4.2 `app_events`.
**Issue.** The PRD event list is much longer than the five names `app_events` allows, and in-app analytics sits on legitimate interests only if it stays first-party, minimal and with a way to object (the approach EU regulators such as the CNIL accept for audience measurement).
**Fix.** Tech reconciles the event list with Product. Keep 13-month retention, no free text, no cross-app identifiers. Add Settings > Privacy toggle "Share usage stats" (default on), off = the app stops sending `app_events`. Disclose in the policy.

### S-20. Moderation inbox handling
**Docs:** `ARCHITECTURE.md` 4.4 `report`, 8.4.
**Fix.** The alert email has the report id, reason and a Studio link, no image and no signed URL. Only named moderators have Studio access, with 2FA. Moderation actions are logged in `private.moderation_log` (who, what, when).

### S-21. Rate-limit gaps
**Docs:** `ARCHITECTURE.md` 8.3.
**Fix.** Add: reports 20 per day, avatar uploads 10 per day, `register-device` 20 per day per user, web OTP on the deletion page 5 per number per hour. Turn on the Supabase spend cap and a Twilio monthly spend alert.

### S-22. Rights in the drink art and logo
**Docs:** `DESIGN.md` 3.3, 9.
**Fix.** The illustrator contract assigns copyright in all deliverables (drinks, mark, wordmark, icon) to the company, with a waiver of moral rights where the law allows, before work starts. Generated images stay reference only, as Design already says. Archivo's OFL text goes in the licences screen (already planned).

### S-23. Internal compliance records
**Docs:** none today.
**Fix.** Legal writes, before beta: a record of processing (GDPR Art. 30), the contact-matching LIA (D4), a short DPIA (non-users' numbers, photos of people, teen users if the minimum is 13), and a breach runbook (contain, assess, notify the lead supervisory authority within 72 hours where required, tell affected users when the risk is high). All in `docs/legal/`.

### S-24. Invite reset without a visible link
**Docs:** `PRD.md` 3.15, 3.14; `COPY.md` 4.17.
**Issue.** A code posted somewhere public can't be revoked by the user before its 30-day expiry (M-04).
**Fix.** Settings > Privacy row "Stop my old invites" (`set.p.reset_invites`) that rotates the code. It shows no URL and no "Invite link" label, so it fits guideline 6.

---

## 5. Things checked and fine

- Sign in with Apple is offered on iOS wherever Google is (guideline 4.8). Apple token revocation on deletion is planned.
- In-app account deletion exists and is reachable in 3 taps (5.1.1(v)).
- No third-party analytics or ad SDKs; Tracking is "No" on iOS.
- EXIF and GPS are stripped on device with a fixture test.
- Phone matching uses an HMAC with a server-side pepper; raw numbers never leave the phone.
- Groups, XP, counts and water are in owner-only tables.
- Widgets show app content only, no ads (guideline 2.5.16, Play widget rules).
- Push is not required to use the app and carries no marketing (4.5.4).
- No location is collected; place is free text.
- Drink names avoid chain trademarks (`COPY.md` 2.1).
- The caffeine note makes no health claim and XP never rewards drink counts.

---

## 6. Lawful basis map (for the privacy policy)

| Processing | Basis (GDPR Art. 6) | Notes |
|---|---|---|
| Account, sign-in, phone number | Contract | Phone for sign-in and matching only |
| Snaps, flares, replies, usual 3, groups, friends | Contract | Features the user asks for |
| Tracker | Contract | D2 minimisation |
| Last-drink sharing | Consent | Off by default, toggle withdraws |
| Reading contacts on the device | Strictly necessary for a feature the user asked for (ePrivacy) | OS permission plus pre-prompt |
| Non-users' numbers in matching | Legitimate interests | D4, transient, LIA |
| Push notifications | Contract; OS permission | |
| Moderation, abuse prevention, rate limits, suspension | Legitimate interests; legal obligation for CSAM reporting where it applies | |
| Crash reports | Legitimate interests | S-13 settings |
| `app_events` | Legitimate interests with opt-out | S-19 |
| Age check | Legal obligation | Only the result is stored |

CCPA: at launch we are very likely under its thresholds (revenue over about $25M adjusted yearly, or 100,000+ California consumers' data) **(verify current figures)**. The policy still includes a short California section: categories collected, no sale or sharing for cross-context advertising, how to request access and deletion. COPPA: we don't knowingly collect from under-13s (M-05).

---

## 7. Required documents

| Document | Where | Owner | Must contain |
|---|---|---|---|
| Privacy Policy | `web/privacy`, Settings, both store listings | Legal | Who we are and contact (privacy@); data table matching `PRD.md` 3.17; lawful bases (section 6); contact matching and non-users; vendors (M-12) and transfers; retention (M-08); rights and how to use them (M-10, M-11); age; California section; how we notify changes |
| Terms of Service | `web/terms`, sign-in footer, Settings | Legal | Minimum age; Community Guidelines incorporated; zero tolerance for objectionable content and abusive users; our right to remove content and suspend accounts; limited licence for us to host and show content to the chosen friends only; drink runs are between friends, paid in person, and we're not a party; no medical advice; DSA moderation section and contact points; governing law. App Store uses Apple's standard EULA plus these terms. |
| Community Guidelines | `web/guidelines`, linked from Terms and the report sheet | Legal with Words | Plain list: no nudity or sexual content, no harassment or hate, no violence or threats, no illegal drugs, nothing sexual involving minors, no photos of people who didn't agree, no spam or impersonation; what happens when you break them |
| Support page | `web/support` | IT | support@ address, how to report, how to delete |
| Account deletion page | `web/delete-account` | IT and Legal | M-10 |
| Report form | `web/report` | IT and Legal | S-17 |
| Internal: moderation runbook, ROPA, LIA, DPIA, breach runbook, vendor register | `docs/MODERATION.md`, `docs/legal/` | Legal | M-06, S-23, M-12 |

Words writes the plain-English versions with Legal; Legal signs off. No document copies text from another app's policy.

---

## 8. Trademark: what the CEO must check for "Clink"

We can't search registries from here. "Clink" is a short common word with a strong drinks association, so a conflict is plausible. Before the logo is final, the domain is bought and the bundle id is fixed (`ARCHITECTURE.md` 10, it can't change after the first upload):

1. **USPTO** Trademark Search (tmsearch.uspto.gov): "CLINK" and sound-alikes (KLINK, CLINQ, KLINQ, CLINC), live and pending, in classes **9** (downloadable software), **42** (software as a service), **45** (online social networking) and **38** (messaging). Also note class 35 and 43 marks for the future cafe perks.
2. **EUIPO** eSearch plus for EU trade marks, and **TMview** (tmdn.org) for EU national offices, the UK and many others in one search.
3. **WIPO Global Brand Database** for international registrations that cover the launch countries.
4. **App Store and Google Play**: search "Clink". An app with the same or a close name in Social Networking, Lifestyle or Food & Drink is a practical conflict and an App Review IP risk (guideline 5.2). App Store names must be unique; create the app record early to hold the name **(verify how long Apple holds an unused name)**.
5. **Company registers** in launch countries, a web search for unregistered use, and the social handles we'd want.
6. Beverage brands (classes 32 and 33) use "clink" widely. They don't block software classes by themselves, but a well-known drinks mark can still object, and alcohol associations invite age-rating questions. Keep marketing free of alcohol imagery.

Then: a clearance opinion from a trademark attorney, and filings in classes 9, 42 and 45 in the launch markets if clear (CEO question 4). If it isn't clear, rename before beta. A suffix in the store name ("Clink: Drink Breaks") doesn't cure a conflict.

---

## 9. Questions for the CEO

Each has a recommendation, so a yes is enough.

1. **Minimum age and launch countries (legal).** Recommendation: 16+ everywhere (same as `PRD.md` question 1), launching in English-speaking countries first. 13+ is possible but brings teen-specific duties in the EU and UK and per-country Article 8 checks. Launch countries also decide which US state age laws apply (M-05).
2. **Paid image moderation before the public App Store release (cost).** Apple's 1.2 rule asks for a filter on user photos. Recommendation: a named person reviews reports daily during beta (`PRD.md` question 2), and an automated image check goes live before public submission. Cost depends on vendor and volume; verify before purchase.
3. **Where is the company established (legal, cost).** If outside the EU or UK and we launch there, GDPR and UK GDPR need a local representative, and the EU DSA needs a legal representative. These are paid services (verify price). The answer also decides whether US child-safety reporting (NCMEC) applies and which law governs the terms.
4. **Trademark clearance and filing (brand, legal, cost).** Recommendation: do the checks in section 8 now, then pay for an attorney's clearance opinion and filings in classes 9, 42 and 45 in the launch markets before beta. Verify fees before purchase.
5. **Local legal review of the policy and terms (cost).** Recommendation: one review by a lawyer in the largest launch market before public release. Verify the quote first.

---

## 10. Resolution log

Written by the Head of Product and CTO on 2026-11-15. Covers every finding in this file and in `QA_PLAN.md` section 14 (QF-*). "Fixed" means the change is in the named spec; code follows it. "Legal" means the spec now requires the document and gates beta on it, and Legal writes it. Where we chose between two proposed fixes, the reason is given.

### Risk MUST FIX

| Id | Finding | Status | What we did |
|---|---|---|---|
| M-01 | Internal functions and views callable by any client | Fixed | ARCH 0 principles 3 and 4, 4.2 (migration 0001 revokes execute, `private` schema, helpers answer only for the caller), 4.4 (only `flare_view` and `incoming_flares` exposed, caller from `auth.uid()`), 8.4 (moderation views in `private`, `security_invoker`), 9 and 10 (deny tests, db lint, security advisor in CI). |
| M-02 | Flare photos readable by every friend | Fixed | ARCH 4.2 new `flare_photos` table, `flares.snap_id` dropped; 4.3 policy and `flare-photos` bucket; 4.4 `flare-tick` deletes photos 2 h after close; reports get `flare_photo` and `target_flare`; pgTAP test for user E. PRD 3.4 rule 4. Chosen over QF-M1's `snaps.kind` column: a separate table keeps "privacy by table" and can't be broken by a missed `kind` filter. |
| M-03 | Flares visible after block or removal, and forever | Fixed | ARCH 4.3 recipient branch requires friendship, not suspended, and `expires_at > app_now() - 2 h`; same rule in `flare_view`, `incoming_flares`, `widget-api`, `respond-flare` (which also needs `status = live`); `block_user` and removal delete recipient and response rows and send clear messages. PRD 3.5 rule 18 and edge case. |
| M-04 | Invite tap makes an existing user friends with a stranger | Fixed | PRD 3.15 rules 4, 10, 11, 12 and ACs 8 to 10 (confirm card for existing users, "Not someone you know?" for new users, 20 uses, 30-day expiry, one error for every failure). ARCH 4.2 `invites`, 6. COPY 4.2 `invite.confirm.*`, `invite.not_known*`, 4.22 note. DESIGN 4.21. |
| M-05 | No age gate | Fixed, minimum pending CEO | PRD 3.1 rule 10 and ACs 8, 9; ARCH 4.4 `complete-signup`, 5 (US state laws, age signal APIs), 4.2 `user_private` stores only `age_confirmed_at`; DESIGN 4.1b; COPY `age.*`; PRD 7 age rating and Play target audience. Built with 16 until CEO question 1 is answered. |
| M-06 | No content filter, suspension, contact or CSAM procedure | Fixed in specs; Legal writes `docs/MODERATION.md` | ARCH 8.4 (text blocklist, image screening before public App Store submission, `private.suspensions`, statement of reasons, CSAM steps), 4.2 tables, 4.4 refusals. PRD 3.0, 3.18 rules 6 to 9, 3.14 Contact us, 7 stage 2 entry criteria. COPY `err.text_blocked`, `err.suspended`, `mod.*`, `set.h.contact`. Image API cost is CEO question 2. |
| M-07 | "Allow camera" pre-prompt button | Fixed | COPY `perm.cam.yes` and `perm.notif.yes` = "Continue". DESIGN 4.3 step 5 and 4.4 camera state. PRD 3.2 rule 4. |
| M-08 | No retention schedule | Fixed | ARCH 4.8 (the table above, adopted as is) and the daily job in 4.4. PRD 3.17 retention paragraph, 3.11 rule 9. |
| M-09 | Deletion misses data; XP can't reverse | Fixed | ARCH 4.7 steps 4, 5 and 9 (clear push to friends, invite reversal, audit log rows), 8.6 (no Sentry user id), Twilio retention disclosed, 4.2 `invite_reversed`, integration test in 9. PRD 3.19. |
| M-10 | Web deletion page has no identity check | Fixed | ARCH 4.7 web page (sign in first, no email field, at once with a 30-day support fallback, rate limit, Play listing), 5 (stored Apple refresh token). PRD 3.19 rule 4 and AC 4. |
| M-11 | No access and export process | Fixed | ARCH 4.9 (privacy@, signed token or web OTP, `scripts/export-user`, 30 days, 7-day link). PRD 3.17. |
| M-12 | No DPAs or transfer mechanisms | Fixed in specs; Legal keeps the register | ARCH 8.8 and 12 (CEO accepts each DPA at account creation, `docs/legal/vendors.md`), 8.6 (Sentry EU region). PRD 7 stage 2 entry. |
| M-13 | Copy overstates privacy | Fixed | COPY `invite.fallback.body`, `perm.contacts.body`, `perm.cam.body`, `signin.legal` set to the exact wording above. PRD 3.9 rule 7 and 3.15 rule 6 match. |
| M-14 | Store declarations not drafted | Fixed | PRD 7 "Store declarations" lists exactly the Apple and Play items above, the Health apps declaration and the age rating. Legal signs off before stage 2. |
| M-15 | No App Review access plan | Fixed | ARCH 5 "App Review access" and 10 "Store review builds"; review numbers deny-listed in `match-contacts` and `redeem-invite`. PRD 7 stage 2 entry. |
| M-16 | Push devices stay bound after sign-out | Fixed | ARCH 3.6 and 4.4 `register-device` (signout action, ownership move on upsert, local clearing, retry offline). PRD 3.3 AC 12. |
| M-17 | Snap files outlive 24 h; orphans; no bucket limits | Fixed | ARCH 4.3 URL lifetimes and bucket limits, 4.4 `share-snap` checks and `snap-cleanup` orphan deletion. PRD 3.4 rule 6 and AC 3 amended. |

### Risk SHOULD FIX

| Id | Finding | Status | What we did |
|---|---|---|---|
| S-01 | Functions bypass RLS | Fixed | ARCH 0 principle 4 and 4.4: reads run as the user (JWT client, or `set local role authenticated` with claims in `widget-api`); signed URLs only for RLS-returned paths; Deno block-case tests. |
| S-02 | XP ledger dedupe and reversal | Fixed | ARCH 4.2 `xp_events` (`nulls not distinct`, `amount <> 0`, `new_friend`, reversal kinds, `reverses_id`, `xp_pair_once`), 4.5 server-side local date, 36 h rule. Merged with QF-M10. |
| S-03 | Contact matching hardening | Fixed | ARCH 8.1 (verified phone, `discoverable`, toggle defined, id and name only, no body logging, cap alert, LIA). PRD 3.9 rules 7 to 9, 3.14. COPY `set.p.discoverable*`. |
| S-04 | Phone-number recycling | Partly fixed | New-device notification with "Not me" (ARCH 5, PRD 3.1 rule 11, COPY `n.new_signin`). Deferred: requiring the linked Apple/Google identity after 90 days idle. It needs a custom auth hook and a step-up screen; the notification covers the common case. Revisit after beta. |
| S-05 | Pending requests never expire; policy scoping bug | Fixed | ARCH 4.2 `expired` status, 4.4 daily job, 4.3 qualified columns and pgTAP. |
| S-06 | Clients can insert reports | Fixed | ARCH 4.3 (no client insert path; reports moved to `private`), 4.4 `report` derives the target, 20 a day. |
| S-07 | Last-drink sharing returns more than promised | Fixed | ARCH 4.2 triggers, 4.3 policy with the 24 h rule. PRD 3.11 rule 7, AC 5. Merged with QF-M17. |
| S-08 | Avatar path and loose DB limits | Fixed | ARCH 4.2 avatar check and every limit set to the PRD number; `limits.ts` validates first. Merged with QF-S6. |
| S-09 | Cached content survives block, removal, deletion | Fixed | ARCH 3.3 clear messages, sent from block, removal, deletion and suspension. PRD 3.9 rule 10. |
| S-10 | Deep links and Android components | Fixed | ARCH 8.7, 5 (PKCE, https redirects), 6 (`<queries>`, no clipboard reads), 7 (`exported=false`, `FLAG_IMMUTABLE`). |
| S-11 | Landing page leaks; avatar before sign-in | Fixed | ARCH 6 headers; DESIGN 4.1 shows initials; PRD 3.15 edge case. |
| S-12 | Secrets placement | Fixed | ARCH 8.5 placement table, secret scanning, Dependabot, offline pepper, `docs/runbooks/`. |
| S-13 | Sentry defaults | Fixed | ARCH 8.6. Merged with QF-S13. |
| S-14 | Supabase Auth settings | Fixed | ARCH 5 settings list. |
| S-15 | Widgets on a locked phone | Fixed | ARCH 3.3 iOS item 6, 7 Android `VISIBILITY_PRIVATE`; DESIGN 5.4, 6.3; COPY `n.flare_public`; PRD 3.3 rule 9, 3.16 rule 7. |
| S-16 | Health-adjacent tracker | Fixed | PRD 3.11 rule 10. `drink_logged` props stay minimal (PRD 6). |
| S-17 | EU DSA basics | Fixed in specs; terms by Legal | ARCH 8.4 (`web/report`, statement of reasons, `moderation_notices`). COPY `web.report.*`, `mod.*`. PRD 3.18 rule 6. |
| S-18 | Photos of people who didn't agree | Fixed | COPY `report.r.5`; ARCH `not_consented` priority; PRD 3.18 rules 1 and 8; no face recognition. |
| S-19 | First-party analytics basis | Fixed | PRD 6 reconciled event list with "Sent by"; ARCH 4.2 `events.ts`, `share_usage`; COPY `set.p.usage*`. Merged with QF-M20. |
| S-20 | Moderation inbox handling | Fixed | ARCH 8.4 (id, reason and Studio link only; named moderators with 2FA; `private.moderation_log`). |
| S-21 | Rate-limit gaps, spend caps | Fixed | ARCH 8.3 table and spend controls; COPY `rl.reports`, `rl.avatar`. |
| S-22 | Rights in drink art and logo | Fixed | DESIGN 9 "Rights". |
| S-23 | ROPA, LIA, DPIA, breach runbook | Legal | ARCH 8.8; PRD 7 stage 2 entry criterion 4. |
| S-24 | Can't revoke a leaked invite | Fixed | PRD 3.14, 3.15 rule 4; ARCH 6; COPY `set.p.reset_invites*`; DESIGN 4.18. |

### QA MUST FIX

| Id | Finding | Status | What we did |
|---|---|---|---|
| QF-M1 | Flare photos readable by all friends | Fixed via M-02 | Separate `flare_photos` table and bucket instead of `snaps.kind` (reason under M-02). Report target `flare_photo` added. |
| QF-M2 | Automatic fallback differs | Fixed | PRD 3.10 rule 5; ARCH 4.6; shared fixtures T22 to T33 run in TS, Swift and Kotlin. |
| QF-M3 | Meter counts redemptions | Fixed | ARCH 6 last bullet: client-side, taps and Adds, capped at 2. |
| QF-M4 | Two vs three sign-in options | Fixed | Kept the CTO design. PRD 3.1 rules 1, 2, AC 1, edge case; DESIGN 4.1 text button and sheet. |
| QF-M5 | iOS "Got an invite?" has no place | Fixed | PRD 3.2 rule 9 and AC 1; ARCH 6 (`detectPatterns`, full URL copied); DESIGN 4.1a; COPY 4.2 retitled. |
| QF-M6 | Picker timeout 20 s vs 30 s | Fixed | ARCH 3.2: 30 s on both platforms. |
| QF-M7 | Android countdown to meet time | Fixed | ARCH 3.4 `setWhen(expiresAt)`; every countdown counts to close (PRD 3.5 rule 3). |
| QF-M8 | "Nobody was free" on the Live Activity | Fixed | COPY `la.expired`, `la.cancelled` deleted; ARCH 3.4 immediate dismissal; PRD 3.5 rule 13. |
| QF-M9 | Two toggles unstored; channel list | Fixed | ARCH 4.2 `notify_reactions`, `notify_friends`; 7 channel table (one per toggle, plus Your live flare and Account); PRD 3.16 rule 3. |
| QF-M10 | XP ledger can't implement PRD 4 | Fixed | Merged with S-02. Kinds `invite_reversed` and `log_reversed` (S-02 names) plus `reverses_id` (QF-M10). |
| QF-M11 | Reaction notifications can repeat | Fixed | ARCH 4.2 `reaction_notified_at`, 4.4 `react-snap`. |
| QF-M12 | Widget JSON can't render several states | Fixed | ARCH 3.1 schema (`state`, `replies`, `photoFile`, `category`, `drinkShort`, `auto`, `memberCount`), native label ports, 08:00/18:00 entries; 9 fixture list W1 to W22. |
| QF-M13 | iOS can't change widget audience | Fixed | PRD 3.3 rule 3, ACs 5 and 5b; ARCH 3.1 unknown id = Automatic, 3.5; DESIGN 4.17, 5.4; COPY `set.widgets.ios_hint`. |
| QF-M14 | Drink lists and ids differ | Fixed | DESIGN 3.4 now uses COPY's 40 ids with new vessels and markers; `matcha.hojicha`; ARCH M1 reads the catalog from `COPY.md` 2. |
| QF-M15 | Option sets differ in four docs | Fixed | Adopted COPY 2.7: PRD 3.7 table and fold rule, Decaf edge case; DESIGN 4.14 "More options"; ARCH `details` keys, caffeinated rule. |
| QF-M16 | Undo vs confirm conflict | Fixed | Followed DESIGN. COPY deleted `cancel.*` dialogs, `remove.*`, `group.delete.*`, `signout.*`, `det.discard.*`; added `cancel.toast*`, `remove.toast`, `group.deleted`, `snack.undo`; `det.save` = "Done". Confirms stay for block, replace flare, delete account. |
| QF-M17 | Last-drink sharing leaks after opt-out | Fixed | Merged with S-07; pgTAP cases in ARCH 4.3. |
| QF-M18 | Missing a11y strings | Fixed | COPY 4.26 rewritten with every DESIGN 5.6 row, custom actions and chip labels; DESIGN 5.6 points to `a11y.w.*`. |
| QF-M19 | Other picker wheel vs grid | Fixed | COPY 4.6 grid cell, `time.other.cta` deleted. |
| QF-M20 | `app_events` can't hold PRD events | Fixed | Merged with S-19. Name check replaced by the zod enum; PRD 6 marks each event client or server. |

### QA SHOULD FIX

| Id | Finding | Status | What we did |
|---|---|---|---|
| QF-S1 | Flare rate limits and silent guard | Fixed | 2-minute gap dropped, 12 a day kept (PRD 3.5 rule 17, ARCH 8.3), silent payloads from the 4th flare in 60 min (ARCH 4.4); `rl.flare_gap` deleted. |
| QF-S2 | OTP lockout rule | Fixed | ARCH 5: 5 wrong codes lock 15 minutes. |
| QF-S3 | `max_uses` should be unlimited | Not adopted | M-04 wins: 20 uses and 30-day expiry stop a posted code from adding strangers. PRD 3.15 rule 4 changed instead. |
| QF-S4 | Who computes `meet_at`; Automatic at 18:00 | Fixed | ARCH 4.4 `send-flare` (server sets `meet_at`), 4.6 `tappedAt` within 2 min; principle 8. |
| QF-S5 | Widget silently replaces a live flare | Fixed | ARCH 3.2 409 `live_flare_exists`; PRD 3.3 rule 8, AC 13. |
| QF-S6 | Server limits looser than PRD | Fixed | Merged with S-08. |
| QF-S7 | Widget outbox for flares and replies | Fixed | ARCH 3.2 outbox table and +30 s Failed entry. |
| QF-S8 | Flares to recipients with alerts off | Fixed | ARCH 3.3 background and WidgetKit pushes; PRD 3.3 AC 8 split into a measured and a best-effort target. |
| QF-S9 | iOS notification actions undefined | Fixed | ARCH 7 actions on both platforms, with the spike fallback; PRD 3.16 rule 2. |
| QF-S10 | Snap expiry on offline widgets | Fixed | ARCH 3.3 entries and jobs at each snap's `expiresAt`. |
| QF-S11 | `widget_added` undercounted | Fixed | ARCH 3.5 server-side per instance; PRD 6. |
| QF-S12 | Non-friends who see a name | Fixed | PRD 3.17 three new rows; ARCH `user_settings.discoverable` (owner-editable, so not in `user_private`). Kept as a separate toggle from Contact matching: "check my contacts" and "let others find me" are different choices. COPY 4.18 `see.x.*`. |
| QF-S13 | Sentry scrubbing | Fixed | Merged with S-13. |
| QF-S14 | Time zone and backdated logs | Fixed | ARCH 4.4 `register-device` updates timezone, 4.5 server-side local date, 24 h zone rule, 36 h rule; PRD 4.3 rules 10, 11. |
| QF-S15 | Invite XP abuse rule undefined | Fixed | ARCH 4.5 and PRD 4.3 rule 8: the whole v1 rule. |
| QF-S16 | Hand-made "Work" group ignored | Fixed | PRD 3.10 rule 6; DESIGN 4.13 row; COPY `group.auto.*`. |
| QF-S17 | Weekdays per locale | Fixed | PRD 3.10 rule 5 line; tied to CEO question 1. |
| QF-S18 | Three vs four presets | Fixed | DESIGN 4.14: four chips, scrolling row. |
| QF-S19 | 5-segment bar vs "of 6" | Fixed | DESIGN 4.3: 6 segments. |
| QF-S20 | `top.today` vs two counts | Fixed | COPY `top.today.a11y`; DESIGN 4.4. |
| QF-S21 | Widget failed wording | Fixed | COPY `wm.failed`, `ws.failed`; DESIGN 5.2. |
| QF-S22 | `la.di.compact` | Fixed | Deleted; system countdown. |
| QF-S23 | Notifications 7, 7b, 8 undecided | Fixed | Product decision: ship 7b/7c on We're going only; delete 7 and 8 (the sender already has the Live Activity and the run list). PRD 3.16 table, rule 8, AC 7; COPY 5.1. |
| QF-S24 | Design elements without strings | Fixed | COPY added `compose.meet`, `bar.in`, `bar.run`, `usual.slot1_helper`, `cat.count`, `today.entries`, `friends.full`, `see.preview_off`, `off.pill`; deleted `compose.head.*` (the panel is dense enough). |
| QF-S25 | iOS 17 widget steps | Fixed | COPY `onb.widget.ios17.*`; DESIGN 4.3. |
| QF-S26 | iPhone SE widget sizes | Fixed | DESIGN 5.1. |
| QF-S27 | Re-auth adds a sheet to deletion | Fixed | PRD AC 3.19.1; DESIGN 4.20; ARCH 4.7 step 1. |
| QF-S28 | Live Activity dismissal timing | Fixed | ARCH 3.4; DESIGN 6.1. |
| QF-S29 | Pending request expiry job | Fixed | Merged with S-05. |
| QF-S30 | No test clock | Fixed | ARCH 4.2 `private.app_now()` and `clock_offset`, 9, 10 (prod refuses it). |
| QF-S31 | Accept action on requests | Fixed | Added: PRD 3.16 rule 2 and AC 6; ARCH 7 and `widget-api/accept-request`; COPY 5.1 row 5; DESIGN 6.3. |
| QF-S32 | Sender's widget after done | Fixed | PRD 3.3; DESIGN 5.2; fixture W22. |
| QF-S33 | Existing invitee at 20 | Fixed | PRD 3.15 and 3.9 edge cases; ARCH 6. |
| QF-S34 | "Something else" with no behaviour | Fixed | Kept: 6th quick-log button opens the catalog. PRD 3.11 rule 3; DESIGN 4.15; COPY. |
| QF-S35 | Coverage rule F1 to F30 | Fixed | ARCH 9: F1 to F31, F23 has no quiet hours. |
| QF-S36 | `violence` reason not offered | Fixed | Check is now `nudity`, `harassment`, `spam`, `other`, `not_consented` (S-18), mapped in `packages/shared`. |

### Questions sent to the CEO

The questions in section 9, in `QA_PLAN.md`, in `DESIGN.md` 9 and in the old `ARCHITECTURE.md` 14 are merged into one list in `PRD.md` section 8 (8 questions). Nothing else here needs the CEO.
