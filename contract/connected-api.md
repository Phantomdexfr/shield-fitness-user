# CONNECTED API — what the User app touches in connected mode (FROZEN at 1.0.0)

Owner of the definitions: **Admin zip** (`docs/DATA_MODEL.md`, `supabase/*`). This file lists only the User app's view. Status: **FROZEN at contract 1.0.0** (Admin Phase 9). Changes follow `CONTRACT.md` rule 1 (semver, both zips).

## Identity
- Login = Supabase Auth email+password in Shard A. The email is synthetic: `<member_code>@members.shieldfit.app` (e.g. `sf-0042@members.shieldfit.app`); the User app lets people type member code or phone and resolves it through the Edge Function `lookup-login` (rate limited, returns only the synthetic email; always returns one, even for unknown input).
- Passwords are created and reset only by admins (Edge Functions). First login forces `change-password`.
- The User app also signs in to the member's train shard (same credentials) for workout data.

## Tables (RLS: a member sees only their own rows)
| Table (shard) | User app does | Notes |
|---|---|---|
| `members` (A) | read own | profile, status, track, tier, xp, trainer |
| `memberships`, `membership_plans` (A) | read own / read plans | membership view |
| `payments` (A) | read own | receipts list |
| `attendance` (A) | read own | check-in is recorded by staff scanning the member QR |
| `announcements`, `inbox` (A) | read; update `inbox.read_at` | |
| `requests` (A) | insert own, read own | freeze, locker, complaint, equipment, forgot password |
| `gym_settings` (A) | read keys `policy` and `contract_version` only | one row each; RLS hides every other key |
| `programs`, `program_days`, `program_items`, `member_programs` (A) | read assigned / published | shown as a routine source. RLS exposes `status='approved'`; the narrower `policy.programs_published` filter is applied by the User app |
| `custom_exercises_shared` (A) | insert own, read own | proposal to the gym library |
| `workout_sessions`, `workout_sets`, `cardio_logs`, `body_stats`, `goals`, `intake_logs`, `personal_records`, `xp_events`, `routines`, `custom_exercises` (train) | insert own; update own only where the class allows (see Sync rules); idempotent by `client_id` | the member's training data. Exercise columns are `exercise_ref` (dataset slug or `my-...`/`gym-...`), never `exercise_id` |
| `injury_marks`, `exercise_prefs` (train) | insert/update own | **natural-key upsert** on `(member_id, muscle_id)` / `(member_id, slug)`, NOT `client_id` |
| `custom_exercises_approved` (A) | read (any member) | gym-approved exercises; slugs `gym-...`/`my-...`; listed in `policy.library.extra_exercise_slugs` |
| `member_stats` (A) | write via `sync-summary` only | admin list summary |

## Edge Functions (frozen)
Base URL = `functions` in `SFCFG1` (`https://<core-ref>.supabase.co/functions/v1/<name>`). `POST` only, JSON body (max 64 KB; `request-join` 2 KB). Headers: `Content-Type: application/json`, `apikey: <core anon key>`, `Authorization: Bearer <access token>` (the anon key for the two public functions). CORS is limited to the gym's allowed origins (else `SFE006`).
Response: success `{"ok":true,"data":{...}}`; failure `{"ok":false,"error":{"code":"SFE###","message":"plain words","retry_after":30?,"fields":[{"field":"..","problem":".."}]?,"ref":"..."?}}`. **Client rule:** show `error.message` as text; unknown code -> show `message` if present, else "Something went wrong on our side and nothing was changed." The User app never branches on anything but `code` and `retry_after`.

| Function | Who | In | Out (`data`) | Codes the app handles |
|---|---|---|---|---|
| `lookup-login` | anyone | `{identifier}` member code (`SF-0042`, `sf0042`, `42`) or phone (last 10 digits compared) | `{email}` (always; unknown input gives `unknown-<8hex>@members.shieldfit.app`) | `SFE101` bad input, `SFE004` (+`retry_after`), `SFE006` |
| `change-password` | signed-in | `{current_password, new_password}` | `{changed:true}` | `SFE102` wrong current, `SFE103` too weak (10-72 chars, a letter and a digit), `SFE104` same/contains code or phone, `SFE105` locked, `SFE402` undone (old still works), `SFE004`, `SFE002` |
| `sync-summary` | the member | `{}` | `{updated:true, workouts_30d, streak_days, xp_total, tier_id?}` or `{updated:false}` inside the 60 s window (not an error) | `SFE201`, `SFE401`, `SFE003`, `SFE002` |
| `request-join` | anyone | `{name 2-80, phone, note? <=300, consent:true, website:""}` (`website` is a honeypot, always send it empty) | `{received:true}` | `SFE001` (+`fields`), `SFE501` consent missing, `SFE004`, `SFE006`, `SFE007` |
| `push-subscribe` | - | **not in 1.0.0**; name reserved; a call answers `SFE601` | - | `SFE601` |

- **Forced change:** after sign-in the app reads its own `profiles` row; while `must_change_password` is true it shows only the change-password screen. `change-password` signs out the member's other sessions.
- **Locked-out members** have no public reset endpoint: the app shows the gym's desk phone from the cached `policy.branding` and tells them to ask the desk.
- **Server-computed stats:** the client sends no numbers to `sync-summary`; it can only ask for a refresh.
- Credential functions are online-only; they are never queued in the outbox and no password is ever stored on the device.

## Sync rules the User app must follow (frozen; full text in the Admin zip `docs/SYNC_SPEC.md`)
1. **Local first.** Every write goes to IndexedDB and an outbox in one transaction; the network is optional (standalone behaviour is unchanged).
2. **Idempotency.** Each synced row gets a uuid `client_id` at creation, never changed. Push = `POST /rest/v1/<table>?on_conflict=client_id` with `Prefer: return=minimal` and:
   - `resolution=ignore-duplicates` for append-only tables (`workout_sets`, `cardio_logs`, `intake_logs`, `personal_records`, `xp_events`, `custom_exercises_shared`, `requests` insert): members have **no UPDATE right** on their data columns, so a correction is a new row plus a soft delete (`PATCH ... {deleted_at}` by `client_id`);
   - `resolution=merge-duplicates` for member-owned rows that may change (`workout_sessions`, `body_stats`, `goals`, `routines`, `custom_exercises`);
   - `on_conflict=member_id,muscle_id` (`injury_marks`) and `on_conflict=member_id,slug` (`exercise_prefs`) with merge.
   - `inbox`: only `PATCH {read_at}`; `requests`: insert with `status='open'` only; the member never writes staff fields.
3. **Batches** of up to 50 rows per request, order kept per table; push parents before children: `workout_sessions` -> `workout_sets` -> `cardio_logs` -> `personal_records` -> `xp_events` -> `body_stats` -> `goals` -> `intake_logs` -> `routines` -> `custom_exercises` -> `injury_marks` -> `exercise_prefs`. A foreign-key failure (`23503`) is retried, not failed.
4. **Errors:** network/5xx/429 -> retry with back-off `min(2^attempts x 5 s, 15 min)` + jitter; 401 -> refresh once, then pause and ask to sign in; RLS/validation/unique -> mark the item failed with a plain reason and keep it visible; never drop silently.
5. **Pull** per table with cursor `(updated_at, tie)`: `?select=<columns>&or=(updated_at.gt.U,and(updated_at.eq.U,id.gt.T))&order=updated_at.asc,id.asc&limit=500`, repeated until fewer than 500 rows. `tie` is `id` except `member_stats` -> `member_id`, `custom_exercises_approved` -> `slug`, `gym_settings` -> `key`. **Keep `updated_at` as the server's string**; advance the cursor only after the rows are stored. Never `select=*`. A row with `deleted_at` is removed locally.
6. **`updated_at` is the server's** (trigger); a device value is ignored. Arrival order wins; a final value (`ended_at`, `status:'done'`, `deleted_at`) is never reverted by a merge.
7. **Triggers:** app open, foreground (debounced 30 s), after a push, manual refresh. **No polling while hidden, no Realtime.** At most one push loop per device (`navigator.locks`).
8. **Windows (member):** own workouts last 12 months in the local cache; everything else small. Egress target per active member per day: <= 150 KB pulled, <= 50 KB pushed.
9. **Shard:** the member's train shard is `members.train_shard`; its URL and anon key come from `train[]` in `SFCFG1`.
10. **Error codes** are `SFE###` with plain-word messages from the server; the User app needs only the ones in the table above.

## Never stored on a server
Progress photos; passwords; the User app's local-only settings.

## Compatibility
`gym_settings.contract_version` must share the User app's MAJOR. The User app shows "This gym needs a newer app" on mismatch and stays in standalone behaviour.


## Plan sharing (anonymous relay, see `plan-share.md`)
Functions: `share_create`, `share_status`, `share_claim`, `share_cancel` (no login needed; callable standalone when a relay URL is configured). Table `plan_shares` is never read by clients directly. Status: **FROZEN at 1.0.0**; the relay uses its own small error shape `{code,message}`, not `SFE###` (see `plan-share.md` section 4).


---
# Backups and free accounts (ADDED in contract 1.1.0; additive, nothing above changed)

Owner of the definitions: **Admin zip** (`docs/DATA_MODEL.md` F9, `supabase/*`, Phases 50-52). Chunk format: `engines.md` section 27. Background and edge cases: `docs/RECOVERY_PLAN.md` (identical in both zips, not part of the contract). **Everything here is unproven until it runs on a real Supabase.** The User app must keep working with none of it (standalone stays complete; nothing is sent before the member opts in).

## Modes
`standalone` (default) -> `free_backup` (opt-in; chunks go to a FREE shard) -> `connected` (gym; chunks go to the member's TRAIN shard). Exactly one backup target at any time. The mode flips only after every step of the switch succeeded.

## Shards
| Role | Id examples | Who signs in | Holds |
|---|---|---|---|
| `core` | A | gym members, staff | identity, operations, Edge Functions, free directory and stats |
| `train` | B, C, D | gym members (same credentials) | training rows, `backup_manifest`, bucket `backups` |
| `free` (NEW) | F1, F2, F3 | free accounts only | Auth logins, `backup_manifest`, bucket `backups` |
Free shards are listed in the **app build** (public URL + anon key only), because a standalone phone has no gym config. A free shard has no gym data.

## Table `backup_manifest` (train shards and free shards; identical)
One row per owner and chunk key; the commit record of a chunk (`engines.md` 27.11).
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `owner_uid` | uuid nn | the signed-in auth uid in THIS shard; RLS `owner_uid = auth.uid()` |
| `member_id` | uuid? | train shards: the Shard A member id; free shards: null |
| `key` | text nn | `sessions:YYYY-MM`, `body:YYYY-MM` or `small`; check by pattern |
| `rev` | int nn >= 1 | compare-and-swap counter |
| `sha256`, `content_sha256` | text(64) nn | stored-bytes hash / canonical-JSON hash |
| `bytes` | int nn | 1..524288 |
| `rows` | int nn >= 1 | |
| `schema` | int nn >= 1 | chunk schema number |
| `prev_sha256`, `prev_bytes` | text?, int? | the previous revision (kept for fallback, S4) |
| `updated_at` | timestamptz | server trigger |
Unique `(owner_uid, key)`. Member rights: select own; insert own (`ignore-duplicates`); update own ONLY with `rev = old rev + 1` (CAS in the policy `with check` plus the client's `rev=eq.<old>` filter); no delete. At most 64 keys per owner (`SFE704`); total `bytes` per owner <= 3 MB on a free shard, <= 10 MB on a train shard (`SFE703`). Pull cursor class: none (read by key, never delta-pulled).

## Storage bucket `backups` (train shards and free shards; private)
Object path `<owner_uid>/<key with ':' replaced by '_'>/<sha256>.bin`. `file_size_limit` 524288 bytes; allowed mime `application/octet-stream`. Policies: a member may `select`, `insert` and `delete` objects whose first path folder equals `auth.uid()::text`; no `update`; no public access. Objects are content-addressed, so re-uploading the same bytes is harmless (`409`/duplicate = success). Deleting is only for pruning revisions older than `prev` (engines 27.11 step 5).

## Tables in core shard A (never touched by clients; service-role functions and staff reads only)
`free_accounts`, `free_stats`, `free_reset_tickets`, `recovery_answers`, plus a failed-attempt counter. Columns and RLS: `docs/DATA_MODEL.md` F9. The User app never reads them.

## Identity of a free account
`free_id` = `FR<shard digit>-<5 chars of 23456789ABCDEFGHJKMNPQRSTUVWXYZ>` (e.g. `FR1-7K2Q9`), assigned by the server. `username` = lowercase `a-z0-9-`, 4-24 chars, chosen by the app (e.g. `lifter-7k2q`), globally unique. Login email in the free shard's Auth = `<free_id lowercase>@free.shieldfit.app` (e.g. `fr1-7k2q9@free.shieldfit.app`). Password: 16 characters generated ON THE PHONE, shown once, never stored; the server passes it to Auth and forgets it.

## Edge Functions (NEW; base URL = the CORE project's `functions` URL, which a standalone app also has in its build)
Same wire format and envelope as the frozen functions above (POST, JSON, `{"ok":true,"data":...}` / `{"ok":false,"error":{"code","message","retry_after"?,...}}`; 64 KB body limit). **Anonymous** (no login) = anon key as bearer. **Free token** = the access token of a free account (a function verifies it by asking that shard's Auth `/auth/v1/user` [A-R2]). CORS: for free-account functions the allowed origins are the User app's origin list from the function configuration, not a gym's.
| Function | Who | In | Out (`data`) | Codes |
|---|---|---|---|---|
| `free-signup` | anonymous | `{username, password (16-72), consent:true, consent_version:int, website:""}` (`website` honeypot, always empty) | `{free_id, username, shard:{id,url,anonKey}}` | `SFE701` username taken, `SFE001` (+`fields`), `SFE501` consent missing, `SFE705` signups paused, `SFE004`, `SFE006`, `SFE007` |
| `free-lookup` | anonymous | `{identifier}` free id or username | `{shard:{id,url,anonKey}, email}` (ALWAYS an answer: unknown input gets a decoy that fails at sign-in, like `lookup-login`) | `SFE101`, `SFE004`, `SFE006` |
| `ingest` | member token OR free token | `{shard:"B"\|"F1"..., key, sha256}` (the chunk was already uploaded and its manifest row written; the function derives the object path from the verified uid) | `{accepted:true, stats?:{workouts_30d, streak_days, xp_total, tier_id?}}` (stats only for a free token; gym members keep `sync-summary`) | `SFE706` chunk invalid (hash, header, schema, caps; plain reason), `SFE707` newer schema than the server knows, `SFE201`, `SFE004`, `SFE002` |
| `free-delete` | free token | `{confirm:true}` | `{deleted:true}` removes login, objects, manifest rows, stats, recovery answers; keeps a minimal directory tombstone (id + date) | `SFE201`, `SFE002` |
| `free-recovery-set` | free token | `{answers:{p1:string, p2:string}}` (fixed prompts `p1` and `p2`, list in `docs/DATA_MODEL.md` F9.4) | `{set:true}` | `SFE001` (+`fields`), `SFE004` |
| `free-reset-request` | anonymous | `{identifier, facts:{first_month:"YYYY-MM", last_month:"YYYY-MM", sessions_band:"0-9"\|"10-29"\|"30-99"\|"100-299"\|"300+"}, answers:{p1, p2}, website:""}` | `{ticket_code, ready_after}` (**identical shape for known and unknown accounts**) | `SFE101`, `SFE004` (+`retry_after`), `SFE708` locked 24 h after 5 failures, `SFE006` |
| `free-reset-status` | anonymous | `{identifier, ticket_code}` | `{status:"cooling"\|"waiting"\|"approved"\|"denied"\|"cancelled"\|"expired"\|"redeemed", ready_after?, redeem_until?}` | `SFE101`, `SFE004` |
| `free-reset-cancel` | free token | `{ticket_code}` | `{cancelled:true}` | `SFE201`, `SFE709` no such open ticket |
| `free-reset-redeem` | anonymous | `{identifier, ticket_code, new_password (16-72)}` | `{redeemed:true}` (credentials changed, other sessions signed out; chunks and history untouched) | `SFE710` not approved yet, expired or already used, `SFE103`, `SFE004` |
`free-reset-approve` (owner role only, signed-in staff, Admin app) and `free-purge` (scheduled, secret header) are **not** User-app functions; their shapes are Admin-only (`API_CONTRACTS.md`, Phases 51-52). A free account linked to a gym member is refused by `free-reset-request` with the same neutral answer as an unknown account; the app tells linked members to see the gym desk.

## New error codes (1.1.0; message in plain words, the app shows `message`)
| Code | HTTP | Meaning |
|---|---|---|
| `SFE701` | 409 | That username is taken. (The app picks another before showing anything.) |
| `SFE702` | 409 | Reserved. |
| `SFE703` | 413 | The backup is too big for this account. |
| `SFE704` | 409 | Too many backup parts for this account. |
| `SFE705` | 503 | New free accounts are paused. Try again later. |
| `SFE706` | 422 | The backup file is not valid, so nothing was saved. |
| `SFE707` | 422 | The backup was made by a newer app. Update the app. |
| `SFE708` | 429 | Too many wrong answers. Try again in 24 hours. |
| `SFE709` | 404 | There is no open reset request. |
| `SFE710` | 409 | This reset is not ready, has expired or was already used. |
Unknown code rule unchanged (show `message`, else the generic line). `SFE601` keeps its Admin meaning "published by someone else".

## Rules the User app follows (new)
1. **Chunks** (`engines.md` 27) go to ONE target for the current mode; never both. 2. Upload object first, manifest last; then, for free and gym-connected backups, call `ingest` (best effort; a failed `ingest` never fails the backup: stats catch up later). 3. A free account is created only after the member ticked consent and the "I saved it" screen is done; on `SFE701` the app regenerates and retries before showing anything. 4. Switching free -> gym: connect, sign in, forced password change, first manifest write to the train shard, and ONLY THEN `mode = connected`; then the app calls `free-delete` for its free account; a failure at any earlier step leaves the old mode. 5. Free-account recovery answers are required at opt-in with a plain warning; the answers are never stored on the device.
6. Compatibility: the User app with contract 1.1.0 connecting to a gym whose `contract_version` is `1.0.x` must treat `backup_manifest`/`backups` as absent (no gym backup; free backup still works). The MAJOR rule is unchanged.
