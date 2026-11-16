# Build notes: widget backend (M2)

Widget tokens and `widget-api` are live on clink-dev: the widget reads its state and logs drinks with its own token, never a Supabase session. Written 2026-11-16. Owner: CTO.

## Deviation: Android first

M2 says both platforms ship together. There is no Apple Developer account and no Mac here, so the iOS widget (Swift, WidgetKit) can't be built or tested yet; it waits for the Apple account. The backend is platform-neutral: `register-device` already takes `platform: "ios"` and the iOS-only fields, and `widget-api` doesn't look at the platform.

## What is live

| Part | State |
|---|---|
| Migration `0019_widget_api.sql` | applied on clink-dev, tracked like 0001 to 0018 |
| `widget-api` | ACTIVE, `verify_jwt` off (it checks its own token) |
| `register-device`, `complete-signup`, `delete-account` | redeployed, `verify_jwt` on; request schemas now come from `packages/shared/src/api` |
| Data after the runs | 0 auth users, 0 logs, devices, credentials, instances, events, rate counters, install rows, XP rows, files; no `tests` schema |

## Widget tokens (ARCHITECTURE.md 3.1, 4.4)

What 0008 and 0016 already had: `private.widget_credentials` (SHA-256 only, one active credential per device), a fresh 256-bit token on every `register-device` call that revokes the device's previous one, revocation on a push-token move, sign-out and account deletion, and the 30-day purge of revoked rows (0017).

What 0019 adds:

1. **Same install, another account.** A device without a push token (notifications denied) kept the previous account's row and live token. A `BEFORE INSERT` trigger on `push_devices` now deletes any other account's row for the same `install_id`, which cascades to its credentials, widget instances and Live Activity tokens.
2. **Suspension revokes.** A trigger on `private.suspensions` revokes every widget token of the account. Lifting doesn't bring them back; the next app launch registers a new one.
3. **`private.widget_begin(hash)`**: token hash to user, device and platform; refuses a suspended account (`CLSUS`); applies the 120-per-hour device limit (bucket `widget_api:<device id>`, so it goes with the account); writes `last_used_at` at most once a minute.
4. **`private.widget_record_instance`**: `widget_added` once per instance, at most 20 instances per device.
5. **`private.widget_log_drink`**: the idempotent tracker write. New codes: `CLCON conflict` (409), `CLOLD too_old` (422).

All three functions are `service_role` only; `00_security` proves `authenticated` gets `permission denied`.

## Contract

Base: the project URL from `supabase/projects.json` (clink-dev `https://tppolgvuckjtxsheskat.supabase.co`). Schemas: `packages/shared/src/api` (`registerDeviceResponse`, `widgetStateQuery`, `widgetLogInput`, `widgetLogResponse`, `WIDGET_API_ERRORS`) and `packages/shared/src/widget-state` (`widgetStateSchema`).

**register-device** `POST /functions/v1/register-device`, headers `Authorization: Bearer <Supabase access token>`, `apikey: <publishable key>`. Response `200 { status: "registered", deviceId, widgetToken, inviteCode, minIosBuild, minAndroidBuild }`. `widgetToken` is 43 characters of base64url (32 random bytes), new on every call; the previous token of that device stops working at once. The app stores it in the Keystore-wrapped store and never logs it. Sign-out: `{ action: "signout", installId }` gives `200 { status: "signed_out", removed }` and revokes the token.

**widget-api** headers: `Authorization: Bearer <widgetToken>` (nothing else authenticates), `x-region: <projects.json region>` (`eu-west-1` for clink-dev), and `content-type: application/json` on POST. No `apikey`. Never a user id anywhere.

| Call | Request | 200 |
|---|---|---|
| `GET /functions/v1/widget-api/state` | Query, all optional: `instance` (Android `appWidgetId`; 1 to 200 of `A-Za-z0-9._:-`) with `size` (`small`, `medium`), `audience` (`auto`, `group`, `everyone`; medium only, for the event), `tz` (device IANA zone) | The widget state JSON, `v: 1`, `state` `setup` (onboarding unfinished) or `ready`. `outbox` is always `[]`; the server never sends `signed_out` (the device writes that itself). `cache-control: no-store` |
| `POST /functions/v1/widget-api/log` | `{ id: uuid, drinkId: string \| null, slot: 1-3 \| null, category, loggedAt: ISO with zone, timeZone?: IANA }` | `{ status: "logged" \| "duplicate", id, today: { localDate, drinks, water, caffeinated, lastDrinkAt } }` |

- `drinkId` is a catalog id; the widget's water button sends `water.still` with `slot: null`. `drinkId: null` means the custom drink in `slot`. A catalog drink may also send the slot it was picked from, so a saved Decaf counts as not caffeinated.
- Today's counts use the `tz` (or `timeZone`) the device sends, else the account's saved zone, else UTC (PRD 3.11 rule 2). `lastDrinkAt` is the latest non-water log of that day, as the app computes it.
- Timestamps are `YYYY-MM-DDTHH:MM:SSZ` (no fractional seconds), which every decoder parses.

Errors are `{ "error": code }`, plus `retryAfter` (seconds) and a `Retry-After` header on 429. What the widget does with each is `WIDGET_API_ERRORS`:

| Status | Code | When | Widget |
|---|---|---|---|
| 401 | `unauthorized` | No token, malformed, unknown, rotated, revoked (sign-out, deletion, suspension, another account on the install) | Read the stored token again and retry once; then keep the outbox and wait for the app |
| 403 | `suspended` | Suspended account with a live token (normally revoked first, so 401) | Keep |
| 429 | `rate_limited` | Over 120 calls in the current hour for this device, all routes | Retry after `retryAfter` |
| 400 | `bad_input` | Body or query fails the schema, unknown keys, category doesn't match the drink, water with a slot, `loggedAt` over 5 min in the future, bad JSON | Drop |
| 422 | `unknown_drink` | `drinkId` not in the catalog | Drop |
| 422 | `too_old` | `loggedAt` older than the 90-day history | Drop |
| 409 | `usual_changed` | Custom drink, but that slot is empty or no longer that custom drink | Drop |
| 409 | `conflict` | The log id belongs to another account | Drop |
| 404, 405, 413 | `not_found`, `method_not_allowed`, `too_large` | Wrong path, wrong method, body over 16 KB | Drop |
| 500 | `internal` | Anything else | Retry |

**Latency.** Without `x-region` the function runs near the caller and each database round trip crosses regions: about 2.5 s per call from this container. With it: 200 to 245 ms end to end, network included (smoke run, 2026-11-16). The widget's 8 s timeout is the client's job.

## How a request runs

1. `requireWidgetCaller`: the bearer must be 43 base64url characters that decode to 32 bytes. SHA-256 of it goes to `private.widget_begin` as `service_role`; the returned hash is compared with the computed one in constant time.
2. Reads run as the user (`asUser`: role `authenticated`, claims with `sub`), so RLS applies exactly as for the app (S-01): own usual 3, logs, groups and settings; friends' names and avatar paths through `profiles_read`; flares through `incoming_flares()` and the flares policy; snaps through the snaps policy.
3. Writes run as `service_role` through `widget_record_instance` and `widget_log_drink`.
4. The state is validated with the shared `widgetStateSchema` before it leaves. A failure answers 500 and logs the failing paths only, never values.

Groups, `myFlare`, `incoming` and `snaps` come from the existing tables (empty until M3 to M5 write them). File names follow `widgetFileName`: `a_` + avatar path, `s_` + snap thumb path, `fp_` + flare photo thumb path, with `/` as `_`.

## Shared code

- `packages/shared/src/api/index.ts`: the M1 request schemas (moved from `supabase/functions/_shared/schemas.ts`, unchanged), `registerDeviceResponse`, the widget-api schemas, paths, region header, timeout and error table.
- `packages/shared/src/widget-state/build.ts` (exported from `widget-state`): `usualSlotFromRow`, `widgetFirstName`, `widgetInitial`, `widgetDrinkShort`, `drinkDisplayName`, `logCaffeinated`, `widgetFileName`, `truncateText` (COPY.md 0.2 truncation). Nothing existing was renamed.
- `scripts/supabase/sync-shared.mjs` copies `api`, `widget-state`, `catalog`, `limits` and what they import into `supabase/functions/_shared/shared` (generated, with `.ts` specifiers). `--check` fails on a missing, stale or extra copy; `scripts/supabase/supabase.test.mjs` runs that check, and the deploy script refuses stale copies.

## Results (2026-11-16)

| Check | Command | Result |
|---|---|---|
| pgTAP local, Postgres 16 | `npm run test:db` | 13 files, 365/365 (new `12_widget_api`: 45) |
| pgTAP on clink-dev | `node scripts/supabase-pgtap.mjs` | 13 files, 365/365, rolled back |
| Deno | `deno lint`, `deno check */index.ts`, `deno test --allow-env --allow-net tests/` with `CLINK_TEST_DB_URL` | clean, 19/19 (new `widget-api.test.ts`: 6) |
| Apply | `node scripts/supabase-apply.mjs` | 0019 applied |
| Deploy | `node scripts/supabase-deploy-functions.mjs` | 4 ACTIVE; `widget-api` `verify_jwt=false`, the rest `true` |
| Smoke | `node scripts/supabase-smoke.mjs` | 38/38, 3 test users created, 0 left |
| Advisors | `node scripts/supabase-advisors.mjs` | no new finding; no blocking findings |
| Script tests | `node --test scripts/supabase/supabase.test.mjs` | 13/13 |
| Repo | `npm run ci` | green |

The Deno tests cover: no token, malformed, wrong token, a Supabase JWT, a user id parameter, the rotated token, another account on the install, sign-out, suspension and lift; setup and ready states, usual 3 with a custom drink, today's counts and last drink, `widget_added` once per instance; another user's data (their water never shows, a non-friend's flare never arrives, note text never reaches the widget) and the M-03 block case (flare, snap, reply and group member gone); logging a catalog drink, Decaf from the saved order, water, a custom slot, the device zone; duplicate id, another user's id, unknown drink, category mismatch, water with a slot, empty custom slot, unknown keys, bad id, future, too old, 413, bad JSON; 120 calls then 429 with `Retry-After`, per device.

The smoke run does the same end to end on clink-dev with the test number +1 201 555 0101 (and 0103 for the second account), with the app's own Data API calls for onboarding and usual #1.

## Decisions (one line each)

- **`Authorization: Bearer` for the widget token**, with `verify_jwt` off for `widget-api` only: the gateway can't check our token, and no other function accepts it (smoke: 401 from `register-device`).
- **Look up by SHA-256, then a constant-time compare** of the stored hash: the lookup needs the index, and a 256-bit secret makes the lookup's timing useless to an attacker.
- **One 401 for every bad token**, so a caller can't tell unknown from revoked.
- **Suspension revokes tokens**, so a suspended user's widget gets 401, not 403; the app shows `err.suspended` when `register-device` answers 403 on its next launch.
- **The rate limit is per device and counts every route**, as 8.3 says; the bucket carries the device id and the row carries the user id, so deletion removes it.
- **Any catalog drink can be logged**, not only the current usual 3: an offline log of yesterday's usual must still land. Only a custom drink needs its slot, because its name lives there.
- **Permanent refusals are dropped by the widget**: logs "never drop" (PRD 3.20) except when the server says the log can never be valid.
- **The local date of a widget log uses the zone the device sends**, like app logs (device-local `local_date`); XP keeps its own server rule (4.5).
- **The response to a log carries `today`**, so the widget doesn't need a second call (and a second hit on the rate limit).
- **`x-region` on every widget call**: ten times faster here, and the header value is public project config.
- **Shared schemas reach Deno by a copy script, not a path import**: the function bundle must stay inside `supabase/functions`, and Deno needs `.ts` specifiers.

## Not done, and why

- **iOS widget, App Group and Keychain storage**: no Apple account or Mac (deviation above).
- **Image URLs for widget files** (avatars, snap thumbs, flare photo thumbs): `widget-api` returns file names only. A signed-URL route for RLS-returned paths comes with snaps and friends (M3, M5).
- **`POST flare`, `POST respond`, `POST accept-request`**: M4.
- **A log undone in the app, then retried by the widget**: if the widget never got the first answer and retries after the undo, the log comes back. Rare (the retry is normally seconds later); a tombstone table would fix it if QA sees it.
- **401s are not rate limited by IP**: tokens are 256-bit, so guessing is not a risk; revisit with the M6 security review.
- **CORS on edge functions** (`app-supabase.md`, item 1) is still open; widgets are native and don't need it.
