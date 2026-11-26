# SYNC_SPEC — User app (local store + connected sync)

The server-side rules (conflict classes, shard assignment, egress budget, final table list) are frozen in the **Admin zip**, Admin Phase 9, and published through `contract/connected-api.md`. This file is the User app's side. **If `contract/connected-api.md` is still `1.0.0-draft`, connection phases (45-50) must not start.**

## Local store (Phase 6) — works with no server
IndexedDB (idb), versioned migrations. Stores: `kv`, `meta` (schema version, cursors), `prefs`, `sessions`, `routines`, `customExercises`, `favourites` (also hidden/notes), `marks` (avoid/sore), `bodyStats`, `goals`, `intake`, `photos` (**device-only, never in the outbox**), `outbox`. `navigator.storage.persist()` requested after install; quota shown in Settings -> Data.
Writes: UI -> repo -> IndexedDB in one transaction; in connected mode the same transaction also appends an `outbox` row. Standalone never writes the outbox.

## Principles
1. The device is the first database. 2. Never lose a set (autosave per set). 3. Idempotent: every synced row has a `client_id`. 4. Cheap: delta pulls, no polling while hidden, no realtime channels. 5. Honest: a quiet chip says idle / syncing / offline (N waiting) / needs attention.

## Outbox push (Phase 67)
Order preserved per table; batches of <= 50; `upsert on conflict (client_id)`. Failure -> `attempts++`, `nextTryAt = now + min(2^attempts * 5 s, 15 min) + jitter`; auth errors pause the queue ("sign in again"); validation/rule errors move the item to `failed` with a plain reason, kept visible, never dropped silently.

## Delta pull
Per-table cursor `(updated_at, id)`, limit 500, tombstones via `deleted_at`. Triggers: app open, return to foreground (debounced 30 s), after a successful push, pull-to-refresh.

## What syncs (connected mode)
| Local store | Server table (train shard unless noted) | Class |
|---|---|---|
| sessions (+ sets, cardio) | `workout_sessions`, `workout_sets`, `cardio_logs` | append-only (corrections = new rows / soft delete) |
| routines | `routines` | member-owned, last-write-wins |
| customExercises | `custom_exercises` | member-owned, last-write-wins |
| marks | `injury_marks` | member-owned, last-write-wins |
| favourites/hidden/notes | `exercise_prefs` | member-owned, last-write-wins |
| bodyStats, goals, intake | `body_stats`, `goals`, `intake_logs` | member-owned / append-only |
| (read only) membership, payments, attendance, announcements, inbox, requests, policy, programs | shard A | server-wins |
| photos | — | never synced |
| prefs | — | local only (gym locks overlay at read time) |

## History upload (Phase 69)
One-time, resumable, idempotent: local rows get stable `client_id`s from the start (generated at creation in standalone mode too), so uploading later cannot duplicate.

## Backup file
`{ app: 'shield-fitness-user', schema: n, exportedAt, tables: {...}, photos?: [...] }` JSON; photos only if the user ticks "include photos". Import merges by `client_id`.

## Sync chip states
`idle (last synced hh:mm)` · `syncing` · `offline (n changes waiting)` · `attention (needs sign-in / n failed)`. Not shown in standalone.

---
# PHASE 74 SPEC — Chunk backup, manifest, triggers, three-way diff, modes (FROZEN for Phases 75-81)
Source of truth for bytes and fixtures: `contract/engines.md` section 27 and `contract/connected-api.md` "Backups and free accounts" (contract 1.1.0). Background: `docs/RECOVERY_PLAN.md`. This section only says how the USER APP uses them. A chunk is an ADDITIONAL copy; the row sync above is unchanged. **Unproven until it runs on a real Supabase.**

## B1. Modes (one backup target at any time)
`meta` key `backup:mode` = `standalone` (default; nothing is ever sent) | `free_backup` | `connected`. The flag flips only after the LAST step of a switch succeeded (connected-api rule 4). A failed attempt leaves the old value. `connected` keeps using the Phase 67 row sync AND adds chunks to the member's train shard; `free_backup` uses chunks only (a free shard has no gym tables). Feature gates: `cloud_backup` (any chunk push/pull), `free_account` (the opt-in screens), `auto_restore` (restore starts by itself after sign-in; off = the Phase 73 button).

## B2. What is stored where on the phone (all in `meta`, never exported, never synced, never in a chunk)
| `meta` key | Value | Written by |
|---|---|---|
| `backup:mode` | see B1 | switch flows |
| `backup:free` | `{free_id, username, shard:{id,url,anonKey}, consent_version, created_at}` (**no password, no answers, ever**) | Phase 78 |
| `backup:base:<key>` | `{content_sha256, rev, rows, at}` = `B`, written only after a chunk was applied or accepted (S6) | Phases 76-77 |
| `backup:dirty` | sorted list of chunk keys changed since their last push | every finished-session write, `small` edit |
| `backup:attempts:<key>` | `{n, nextTryAt}` back-off state | Phase 76 |
| `backup:last` | `{ok_at, error_code?}` for the status line | Phase 76 |
| `backup:restore` | `{status, done_keys, total_keys}` so a killed restore resumes | Phase 77 |
The owner stamp and `restoreBase` of Phase 73 stay as they are. The free account's session tokens live in the Supabase client storage only (Phase 78 decides the exact store, no password).

## B3. Chunks (contract 27.1-27.4; this app does not redefine them)
Keys `sessions:YYYY-MM` (IST month of `started_at`), `body:YYYY-MM` (IST month of `measured_on` / `logged_at`), `small`. Canonical JSON, compact arrays, stored object = marker byte (`0x01` gzip / `0x00` raw) + payload, `sha256` over the stored bytes, `content_sha256` over the canonical JSON; the **fingerprint** for `L`, `B`, `S` is always `content_sha256`. Never in a chunk: photos, prefs, outbox, kv/meta, cursors, derived `personal_records` and `xp_events` (recomputed after a restore by the existing engines).

## B4. Triggers (contract 27.9)
1. A FINISHED session saved, edited or deleted, or a body/intake row changed -> add that month's key to `backup:dirty`, push after 10-30 s (random). 2. A `small` item edited -> `small` dirty. 3. App open, foreground, `online` event, after a successful row sync -> push anything dirty. 4. Once a day on open -> three-way check of every key (B5). 5. No polling while hidden, no Realtime. 6. Back-off `min(2^attempts x 5 s, 15 min) + jitter`; offline = wait, no error shown beyond the chip. 7. Standalone: none of this runs, no request leaves the phone.

## B5. Three-way decision (contract 27.7; Phase 75 implements `planSync`)
Order: NOOP when `L == S` -> RESTORE when `L` empty/missing and `S` exists -> PUSH_ALL when `S` missing and `L` has rows -> MERGE_NEVER_OVERWRITE when no base and both differ -> matrix (`L != B, S == B` PUSH; `L == B, S != B` PULL_MERGE; both changed MERGE_THEN_PUSH). `L` empty, `S` missing, `B` had data = NOOP and the line "both copies gone". **S1 is applied last to every outcome that ends in a push** (rows < 70% of base = BLOCK, offer Restore; exactly 70% allowed). The Phase 73 `emptyCheck` stays the row-sync guard; S1 here is per chunk. Rules S1-S7 are binding exactly as in contract 27.8.

## B6. Push of one chunk (contract 27.11)
Build bytes -> hash -> read manifest (if its `content_sha256` equals mine, done) -> upload object `backups/<owner_uid>/<key with : as _>/<sha256>.bin` (409/duplicate = success) -> write manifest LAST (first time `POST` with `ignore-duplicates`; later `PATCH ...&rev=eq.<old>` with `rev = old+1`, `prev_sha256`, `prev_bytes`; empty answer = lost race -> re-read, re-merge, retry, at most 5 times then back off) -> record `B` -> call `ingest` best effort (a failed `ingest` never fails the push). Prune objects older than `prev`. `SFE703` (too big), `SFE704` (too many keys), `SFE706`, `SFE707`: no retry loop; plain message (GYM_CONNECTION section P74-4), chunk stays dirty.

## B7. Download / restore of one chunk
Read manifest -> download object -> verify `sha256` against the manifest, gunzip, header check (S4); on failure use `prev_*`, then report and change nothing. A login page or HTML body is a network error, never data. Apply in ONE local transaction (merge by `client_id`; natural key for marks and prefs; final states never reverted, S5), then record `B` (S6). While a restore runs ALL pushes are blocked. Newest month first, then `small`, then older months; after the last chunk the normal delta pull catches up. After a restore the derived records (PRs, XP) are recomputed locally.

## B8. Compatibility and absence
A gym whose `contract_version` is `1.0.x` has no `backup_manifest` / `backups`: treat both as absent, hide gym backup, free backup still works. A newer `schema` than the app: refuse, "update the app" (S7). Unknown manifest columns are ignored.

## B9. Hand-off
**75** pure `src/shared/chunks.ts` (+ local build/apply helpers), fixtures `chunks_01..03`. **76** runtime: dirty set, triggers, B6, back-off, status line, gym member push. **77** B7 for a gym member, Restore screen R6 with `auto_restore`. **78** free signup, consent, show-once password, Already have an account, free push. **79** recovery questions and forgot password. **80** free to gym switch. **81** gate.
