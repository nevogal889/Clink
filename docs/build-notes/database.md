# Build notes: database (Supabase schema, RLS, M1 functions)

Backend schema from `ARCHITECTURE.md` 4 as ordered migrations, with pgTAP tests and the three M1 edge functions. Written 2026-11-15. No Supabase account or project was created.

## What exists

```
supabase/migrations/
  0001_security.sql          private schema, function execute revoked (global and per schema), anon gets nothing in public
  0002_extensions.sql        pgcrypto in extensions; pg_cron and pg_net only where available
  0003_clock_people.sql      clock_offset + app_now, profiles, user_settings, user_private, suspensions,
                             blocked_terms + check_text, app_config (min_age 16)
  0004_ops.sql               rate_counters + hit_rate_limit / require_rate_limit, app_events + log_event
  0005_friends.sql           friend_requests, friendships, blocks, are_friends / is_blocked / is_suspended, profiles policies
  0006_groups.sql            groups (10 per user), group_members, ex-friend cleanup trigger
  0007_drinks.sql            usual_drinks, drink_logs, last_drink_shares + recompute triggers
  0008_devices.sql           push_devices, install_history, widget_credentials, widget_instances, widget_user()
  0009_xp.sql                xp_events, xp_totals, xp_rules, award_xp, reverse_xp, daily_log triggers, xp_levels
  0010_invites.sql           invites, invite_redemptions, code generator, rotate / ensure / preview
  0011_snaps.sql             snaps, snap_hides, snap_reactions, create_snap, react_snap
  0012_flares.sql            flares, flare_photos, flare_photo_hides, flare_audience, flare_recipients,
                             flare_responses, live_activity_tokens, resolve_audience, create / respond /
                             close / expire / settle, public.flare_view(), public.incoming_flares()
  0013_friend_functions.sql  make_friends (20 cap, locked), send / accept / cancel request, remove, block,
                             unblock, invite XP abuse rule, redeem_invite
  0014_safety.sql            reports, moderation_log, moderation_notices, file_report, suspend / lift,
                             close_report, private.open_reports view
  0015_storage.sql           buckets avatars, snaps, flare-photos, moderation and their Storage policies
  0016_account.sql           complete_signup, register_device, signout_device, prepare_account_deletion,
                             purge_auth_audit, account_leftovers
  0017_retention_jobs.sql    run_daily_retention (4.8), evidence helpers, pg_cron schedule
supabase/tests/
  setup/00_supabase_shim.sql, setup/01_test_helpers.sql, 00 to 10 *.test.sql (311 pgTAP tests),
  concurrency/races.sh, README.md (how to run and how to write tests)
supabase/functions/
  deno.json, deno.lock
  _shared/  http, db (asService / asUser), auth (JWT), age, crypto, apple, push, admin, deps, schemas
  complete-signup/, register-device/, delete-account/   index.ts (Deno.serve) + handler.ts
  tests/    unit.test.ts, functions.test.ts (against the local database), helpers.ts
```

## Commands

See `supabase/tests/README.md`. In short, with a Postgres 16 cluster on port 55440:

| What | Command | Result here |
|---|---|---|
| pgTAP | `PGHOST=/tmp/clink-db PGPORT=55440 PGUSER=postgres npm run test:db` | 11 files, 311 tests, pass |
| Races | `... bash supabase/tests/concurrency/races.sh` | 2 of 2 pass |
| Deno tests | `cd supabase/functions && CLINK_TEST_DB_URL=postgres://postgres@127.0.0.1:55440/clink_pgtap deno test --allow-env --allow-net tests/` | 12 of 12 pass |
| Deno lint and types | `deno lint && deno check */index.ts` | clean |
| Prettier | `npx prettier --check supabase` | clean |

Deno 2.5.6 came from `npm i deno` in a scratch folder (not a repo dependency).

## Decisions (one line each)

- **Error convention:** functions raise SQLSTATE class `CL` with the API code as the message (`CLTXT text_blocked` and so on, list in 0003); `_shared/http.ts` maps them to HTTP. `CLBLK` answers like `not_found`, so a block is never revealed.
- **Edge functions talk to Postgres directly** (`SUPABASE_DB_URL`, postgres.js, `prepare: false`), because `private` functions aren't reachable through PostgREST RPC. Each transaction sets `role service_role` (writes) or `role authenticated` plus JWT claims (reads as the user, S-01).
- **Grants as well as RLS:** every public table first revokes all from `anon` and `authenticated`, then grants only what it needs, with column grants where a client may update only some columns (`profiles` name and avatar; `user_settings` toggles but not `timezone`; `moderation_notices.seen_at`).
- **Global `alter default privileges revoke execute on functions from public`** in 0001. A per-schema revoke can't undo Postgres's global PUBLIC execute default, so the 0001 text in `ARCHITECTURE.md` 4.2 alone would have left new private functions callable. `00_security` calls every private function as `authenticated` and expects `permission denied`.
- **Flare visibility window uses `coalesce(ended_at, expires_at)`**, so a cancelled or "We're going" flare disappears 2 h after it actually closed (M-03 says "until 2 h after close"). `ARCHITECTURE.md` 4.3 writes `expires_at`.
- **Write paths exist as SQL now** for M3 to M5 (`create_flare`, `respond_flare`, `close_flare`, `expire_due_flares`, `settle_flare`, `create_snap`, `react_snap`, `send_friend_request`, `accept_friend_request`, `remove_friend`, `block_user`, `redeem_invite`, `file_report`), so the RLS tests use real data and those edge functions become thin wrappers.
- **"Once per pair, ever" spans both `invite_accepted` and `new_friend`**: a friend who came by invite earns nothing again through a later request.
- **A new account for `redeem_invite`** is decided by the server: profile under 24 h old that hasn't claimed an invite. The client's word isn't trusted.
- **Requests to someone who blocked you answer `sent` and write nothing.**
- **Age rule:** old enough from the first day of the birth month (only month and year are asked). Compared in `_shared/age.ts` against `app_config.min_age` (`{"age": 16, "version": 1}`), never stored.
- **Widget token** rotates on every `register-device` call; one active credential per device; only the SHA-256 is stored.
- **Time zone** is written only by `register_device`, at most once per 24 h, and only for a name in `pg_timezone_names`.
- **daily_log XP** is awarded and reversed by triggers on `drink_logs`, because clients insert logs directly. The award's day is the log's day in the user's zone; logs over 36 h old earn nothing. The retention job sets `clink.retention` so 90-day deletes don't reverse XP.
- **`updated_at` triggers use `private.app_now()`**, so the test clock drives the 30-day request cleanup.
- **The text blocklist ships empty.** Committing slurs to the repo isn't useful; Moderation loads `private.blocked_terms` (term, `exact` or `substring`). Tests insert their own terms.
- **Edge function formatting follows the repo Prettier config**, not `deno fmt`, so `npm run format:check` stays the one style gate.

## Additions to the schema in ARCHITECTURE.md 4.2 (CTO, please fold in)

- `user_settings.groups_suggestion_dismissed` (PRD 3.10 rule 4, the one-time 6-friend suggestion).
- `private.user_private.via_invite_id` (marks the invite an account was created through).
- `private.install_history (install_id, user_id, push_token_hash, seen_at)`: needed for the invite XP abuse rule, which looks back 30 days, after device rows are gone. **Needs a retention row in 4.8: 30 days, kept 30 days after account deletion** (no FK on purpose). Legal should list it.
- `public.flare_photo_hides (user_id, flare_id)`: "hidden for the reporter at once" for flare photos, like `snap_hides`.
- `flare_audience.requested` (`auto`, `group`, `everyone`): what the composer said, for the `audience_type` event prop.
- `private.xp_rules (kind, amount, daily_cap, per_counterpart)`: PRD 4.2 values in one table.
- Extra checks: `drink_id` format and category prefix match, `details` key whitelist and `extras` array, snap and flare-photo paths derived from ids, `org_id is null` in v1, `local_date` within a day of `logged_at`.

## For other units

- **Shared:** move `supabase/functions/_shared/schemas.ts` (M1 request schemas) into `packages/shared/src/api`, and keep `packages/shared/src/xp` equal to `private.xp_rules` and `app_config.xp_levels`. Then `scripts/sync-shared-to-functions` copies them back to `_shared/generated/`.
- **CI (owner of `.github/workflows/ci.yml`):** after `run-pgtap.sh`, also run `supabase/tests/concurrency/races.sh` and the Deno job (`denoland/setup-deno`, `deno lint`, `deno check`, `deno test --allow-env --allow-net` with `CLINK_TEST_DB_URL` pointing at the service database `clink_pgtap`).
- **Words:** the API codes clients will see from these functions: `under_age` (with `min`), `text_blocked`, `suspended`, `rate_limited` (with `retryAfter`), `reauth_required`, `bad_input`, `not_found`, `friend_cap`, `group_cap`, `live_flare_exists`, `flare_ended`, `invite_code`. `group_cap` (an 11th group) may need a `COPY.md` key.
- **App:** `register-device` returns `widgetToken` (base64url) on every call; store it for the widget and replace the old one. Pushes carry only `{ type: 'new_signin' }` or `{ type: 'clear_user', userId }`; the device renders the words.
- **Moderation / Legal:** load the blocklist; confirm the retention of `install_history`.

## Not done, and why

- **No real Supabase check yet.** The shim mirrors Supabase's `auth`, `storage` and roles, but the migrations haven't run on a Supabase stack: Docker Hub rate-limited the `supabase/postgres` pull and the ECR blob host is blocked here. So `supabase db lint`, the security advisor and `supabase test db` are not run. **(verify)** on the first `supabase start`: `postgres` may `set role service_role` and `authenticated`; `postgres` may create policies on `storage.objects`, insert into `storage.buckets`, and delete from `auth.users` and `auth.audit_log_entries`; the `audit_log_entries` payload keys (`actor_id`, `traits.user_id`).
- **pg_cron schedule untested.** 0017 schedules the daily retention and a per-minute SQL flare expiry only when pg_cron exists. M4 replaces the expiry job with a pg_net call to the `flare-tick` function (which also ends Live Activities). `snap-cleanup` and evidence-file deletion need their edge functions (M5).
- **Push is not sent.** `_shared/push.ts` has the interface and a sender that delivers nothing; real APNs and FCM senders are M0 spike 4. The new-sign-in notice and the deletion clear messages are produced and tested with a fake sender.
- **Apple calls are written, not run.** Code exchange, revoke and token sealing are in `_shared/apple.ts`; tests use a fake. Real calls need the Apple Developer account and `APPLE_*` secrets. Without them sign-up and deletion skip the Apple step.
- **JWT verification:** tested with HS256 (`SUPABASE_JWT_SECRET`); the JWKS path for asymmetric project keys is untested until a project exists.
- **Auth admin and Storage REST calls** (`_shared/admin.ts`) are tested through fakes only.
- **"Not me" global sign-out** (`private.revoke_all_widget_credentials` exists) needs its endpoint; it isn't one of the three M1 functions.
- **Avatar upload limit (10 per day)** isn't enforced: uploads go straight to Storage, and a trigger on `storage.objects` isn't allowed on hosted Supabase. Needs an upload function or a Storage hook.
- **T33** (a group named Work defaults to weekdays): the server honours `auto_role` as stored; the default is set by the group editor when it saves (PRD 3.10 rule 6). No server trigger, because it can't tell "Neither" from "not set".
- **Other edge functions** (`widget-api`, `send-flare`, `respond-flare`, `close-flare`, `flare-tick`, `share-snap`, `react-snap`, `snap-cleanup`, `match-contacts`, `friend-request`, `redeem-invite`, `invite-preview`, `report`) are later milestones. Their SQL halves are in place and tested.
