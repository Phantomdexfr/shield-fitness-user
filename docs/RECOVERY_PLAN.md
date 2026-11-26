# RECOVERY_PLAN — never lose a workout: chunk backup, new-device restore, free accounts, forgot password, ultimate admin view

**Status:** PLAN, docs only (written 2026-11-21 from an owner chat; nothing built, nothing run, nothing tested).
**This file is IDENTICAL in the User zip and the Admin zip** (`docs/RECOVERY_PLAN.md`). It is NOT a contract: Admin Phase 49 promotes the parts both apps must share into `contract/` 1.1.0. If you change this file, change both zips.
**Phase map:** section 15. **Owner questions:** section 13. **Assumptions:** section 14.

---

## 1. Goal and non-goals
**Goal:** a member (gym or free) who loses their phone, clears the browser, or has the OS evict IndexedDB gets their training history back on a new device, automatically where possible, with no data lost to a bad sync.
**Non-goals:** photos (never uploaded, owner rule 8); local-only settings; replacing the row-level sync (it stays: the admin's server-computed stats depend on it); a native wrapper (parked, section 12); end-to-end encryption (see Q-ENC in section 13).

## 2. Decisions taken in the planning chat (2026-11-21)
1. **Add, do not replace.** Row-level sync (outbox, delta pull) stays for live data and admin stats. Chunks are the recovery copy and the way to shrink server rows later.
2. **Chunk = shrunk, gzipped, per-period file.** Sessions go up per month (sets and cardio nested inside); body stats and intake per month; one small chunk for routines, custom exercises, goals, marks, favourites. Past months never change again, so they upload once.
3. **Trigger = a FINISHED session** (saved, edited or deleted), not per set. Set-by-set autosave stays local. Small chunk: when the member saves one of those items. Plus one check per day on app open.
4. **"Worker" = a routine, not a background job.** iPhone Safari has no reliable background sync; it runs after a finished session (10-30 s delay so save-then-edit is one push), on app open, on return to foreground, and once a day for a full check.
5. **Three-way diff** (local, base, server) decides push, pull, merge or restore (section 4.4).
6. **Free accounts exist** for people with no gym: opt-in, generated id, username and password, own Supabase shards (several accounts). Standalone stays complete without them.
7. **Forgot password for free accounts** = a ticket an owner-level admin approves after personal-question evidence and a cooling-off period. Answers are evidence for a human, never an automatic reset.
8. **Ultimate admin view** (owner role only): everyone, gym and free, with progress; free users show training summary only.
9. **Free to gym** is a clean, ordered transition (section 9).
10. **A native wrapper is not part of this plan** (section 12).

## 3. Modes
`standalone` (default, nothing on any server) -> `free_backup` (opt-in; chunks go to a free shard) -> `connected` (gym; chunks go to the member's train shard). The mode flips ONLY after every step of the switch succeeded. Exactly one backup target at any time.

## 4. Chunk backup design
### 4.1 Chunks
| Chunk key | Holds | Changes |
|---|---|---|
| `sessions:YYYY-MM` | sessions of that IST month with their sets and cardio rows, tombstones included | current month only |
| `body:YYYY-MM` | body stats and intake logs | current month only |
| `small` | routines, custom exercises, goals, marks, favourites/hidden/notes | when the member edits them |
Never in a chunk: photos, prefs (local settings, reminders, followed-program links), the outbox, kv/meta. Header of every chunk: `app`, `schema`, `key`, `rows`, `made_at`. Body: compact arrays (no uuid per set where it can be derived), gzip via `CompressionStream` with the raw fallback `planShare` already uses, `sha256` of the bytes.
### 4.2 Where it lives
Gym member: the train shard (member's own prefix). Free account: the free shard. Chunk bytes in a **private Storage bucket** (separate from the 500 MB database; 1 GB free per project, see `SUPABASE_SHARDS.md`); a small **manifest row per chunk** (`key`, `rev`, `sha256`, `bytes`, `schema`, `updated_at`) in the database. Keep the last 2 revisions per chunk. Chunk objects are named by content hash, so re-sending the same bytes is harmless.
### 4.3 Triggers
Finished session saved/edited/deleted -> mark that month's chunk **dirty in the local store** (`meta`, survives a kill) -> push after 10-30 s. `small` edits -> dirty -> push. App open / foreground / `online` event / after a successful row sync -> push anything dirty. Once a day on open -> full three-way check. No polling while hidden, no Realtime (existing rules).
### 4.4 Three-way diff (per chunk): `L` local fingerprint, `B` base (what this device last synced), `S` server
| L vs B | S vs B | Action |
|---|---|---|
| changed | same | PUSH |
| same | changed | PULL and merge |
| changed | changed | MERGE by `client_id`, then PUSH |
| empty or missing | server has data | RESTORE |
| has data | server empty or missing | PUSH everything |
| no base (never synced) and both have data | | MERGE, never overwrite |
### 4.5 Safety rules (binding)
- **S1** Never push an empty or sharply shrunken local over a good server copy. Local rows below a threshold of base (assumed: lost more than 30% of rows, or all of them) -> stop, offer Restore.
- **S2** Upload the chunk first, write the manifest LAST. The manifest is the commit; a half upload is invisible.
- **S3** The manifest write is a compare-and-swap on `rev`; a lost race re-reads and re-merges.
- **S4** Verify `sha256` and gunzip on every download; on failure fall back to the previous revision. A login page or HTML body is a network error, never data.
- **S5** Pulls only add or merge; they never delete local data. A final state (ended, done, deleted) is never reverted by a merge (existing rule).
- **S6** While a restore runs, ALL pushes are blocked. A chunk is recorded as synced only after it was applied locally.
- **S7** A chunk with a newer `schema` than the app is refused ("update the app"); an older one is migrated.
### 4.6 Size and traffic (Phase 73 MEASURED on seeded made-up data; the older guesses below it are kept for comparison)
**Measured 2026-11-21** by `node scripts/measure-chunks.mjs` (User zip; seeded 1,000 sessions of 6 exercises x 4 sets over 2.68 years, about one session a day, real UUID entropy; routines, 120 body stats, 900 intake rows; nothing real, not a phone, not a real member):
- Whole `exportAll` shape: raw JSON 2,896 KB; gzip 242 KB (12x); compact packing + gzip 126 KB (23x). Sessions only: raw 2,733 KB; gzip 219 KB; compact + gzip 102 KB.
- Largest IST-month session chunk (about 30 sessions): gzip 7.5 KB; compact + gzip 3.8 KB. About 240 B (gzip) or 121 B (compact + gzip) per session.
- Per member per YEAR at a session a day (a heavy trainer): gzip 90 KB; compact + gzip 47 KB. A member who trains 3 days a week would be about a third of that.
- So: plain gzip gets 12x (better than the 3-5x guessed, because the repeated field names compress well; the UUIDs are what is left). Compact packing halves it again. Chunks stay far under the [A-R1] 200 KB target. One finished session re-pushes its month chunk: about 8 KB gzip (4 KB compact), then the manifest write. Restore of a whole history about 126-242 KB once.
- NOT measured: the manifest, `sha256`, HTTP overhead, free-shard storage rows, real members (real data varies: more custom exercises, notes, cardio rows), a phone's CPU time to pack and gzip.
**Older guess (before measuring):**
UUIDs compress poorly, so plain gzip is likely only 3-5x; compact packing should help more. Guess: 30-80 KB per member per year; one finished session pushes about 5-10 KB plus a manifest write; about 10 KB per active member per day. 400 active members about 4 MB/day (about 120 MB/month) of mostly uploads. Restore about 30-80 KB per member once. **Sizing warning:** `SYNC_SPEC.md` (Admin) assumes about 100 active members a day; if 400 are active daily, row storage is about 4x (about 460 MB/year on a train shard, the 350 MB close line in about 9 months). Chunks plus deleting compacted rows is what keeps that in check.

## 5. Network and offline rules (in order)
1. Offline when a session finishes: session saves locally, month chunk marked dirty, chip says a backup is waiting, no error.
2. Retries only on open, foreground, `online`, after a row sync. Back-off reuses `min(2^attempts x 5 s, 15 min) + jitter`, next-try time stored locally.
3. Request timeout about 20-30 s; chunks are small.
4. Half-finished upload: nothing visible until the manifest is written (S2).
5. Ambiguous failure (timeout after the server saved): on retry read the manifest first; if the server hash equals mine, mark done and do not re-send.
6. "Online" with no real internet (captive Wi-Fi): judge by the response shape, not `navigator.onLine`.
7. 429/5xx: back off and honour `retry_after`; jitter matters because many phones fail together.
8. 401: refresh once, then pause and show "sign in again". Size, rule or permission errors are not network errors: mark failed with a plain reason, visible.
9. Offline for days: dirty months pile up; on reconnect run the three-way diff first (another device may have changed things), push the current month first.
10. Restore with a bad link: resumable, one chunk at a time, newest month first, each applied in one local transaction; the next open continues; pushes blocked (S6).
11. UI: reuse the sync chip states; Settings -> Data shows "Last backed up", amber only if online and older than about 7 days.
12. Tests: a fake remote with fault injection (drop, timeout-after-save, duplicate response, 200 with HTML, 401 midway, kill and resume during restore), like Phase 67.

## 6. New-device restore for a gym member (edge cases in order)
Flow: install -> connect -> sign in -> forced password change -> app sees local empty and a manifest -> restores automatically with progress ("3 of 8"), newest month first, then the normal delta pull catches up.
1. Password change comes first: restore waits for it (reuse the `ready` rule of the history upload).
2. Different member on the same phone: the local store carries an **owner stamp**; a different member gets "export, then start fresh", never a merge.
3. Local not empty (they logged before connecting): merge, never overwrite.
4. Killed or partial restore: resumable, pushes blocked.
5. Expired or frozen member: allowed to restore their own data; gym features stay locked by policy [A-R4].
6. Admin reset the password: no effect; data is keyed by member id, not password.
7. Wrong or moved shard: read `members.train_shard`; plain error if the shard is closed.
8. Photos and local settings are not restored; the done screen says so.
9. More than 500 rows: show the existing Wi-Fi line.
10. iPhone install gate: restore starts only once installed; the gate screen adds one line that data returns after sign-in.
11. Chunk from a newer app version: "update the app".
12. Rows gone but pull cursors survived: a plain delta pull would fetch nothing, so the empty check **resets the cursors**.
13. Native origin / CORS: not applicable (no wrapper).

## 7. Free accounts (edge cases in order)
Opt-in screen "Back up my data". The phone generates `free_id` (e.g. `FR1-7K2Q9`; the digit is the free shard), `username` (e.g. `lifter-7k2q`) and a 16-character password, shows the password ONCE with copy, share and save-as-image and an "I saved it" tick, and never stores it. A rate-limited function (honeypot like `request-join`) creates the login. Consent says plainly: where the copy lives, that the shard's account holder can read it, how long it is kept.
1. Id/username collision: the server rejects; the app regenerates before showing anything. Uniqueness is enforced in the core directory table, not per shard.
2. Signup spam: per-IP limit, per-account cap [A-R7], stop-signups switch at 80% full (like `close-shard`).
3. Password lost, phone alive: offer a new backup account and re-upload; the old copy is purged when inactive.
4. Password lost AND phone lost: unrecoverable by design; said on the show-once screen; the recovery questions (section 8) are the only way back.
5. Session expired: refresh token; if evicted, ask for the password; backups wait.
6. Reinstall: first launch asks "Already have an account? Sign in" before creating a new one.
7. Inactive accounts: purged after about 18 months [A-R6], stated at consent.
8. "Delete my backup": removes login, chunks and stats row.
9. Standalone promise kept: nothing is sent before the opt-in; the app stays complete without it.
10. Law: personal data needs consent and a deletion path (India DPDP Act); the owner confirms the wording (Q-LAW).

## 8. Forgot password for free accounts (edge cases in order)
Flow: request (free id or username + answers) -> server compares answers, the admin sees only "matched 2 of 3" -> cooling-off (24-48 h) -> owner-level admin approves -> the phone redeems and generates a NEW password itself, shown once; the admin never sees or types a password.
1. Weak questions: answers only count as **evidence for a human**; nothing resets automatically. Prefer questions the server can check against facts it already holds (month of last workout, month of first workout, rough session count band) over guessable ones; a short fixed list, no government ids, no phone numbers.
2. Storage: normalise (lowercase, trim, strip accents and spaces), then a salted slow hash plus a server-side pepper; nothing on the phone; a database leak shows no plaintext.
3. Typos and scripts (Kannada, Hindi, English): normalise; short answers; 2 of 3 is enough.
4. Guessing: attempt limits per account and per IP, 24 h lock after 5 failures, identical answers whether or not the account exists (like `lookup-login`).
5. No questions set: no recovery. Setting them is a required step at opt-in, with a plain warning.
6. Spam: one open ticket per account; tickets expire after 7 days.
7. No contact channel: the screen shows a ticket code plus the id; status needs both.
8. Wrong person approved: the admin sees the match result and the data check; every approval is audited; per-admin daily cap.
9. Real owner still holds the phone: a still-signed-in device shows "A reset was requested, cancel?" during cooling-off.
10. Redeem window: 24 h after approval, single use; redeeming signs out other sessions and kills the old password (like `change-password`).
11. A reset changes credentials only; chunks and history stay.
12. Admin workload: a filtered queue; auto-approve (answers match, nobody cancelled, cooling-off passed) only if the owner decides so (Q-AUTO); default OFF.
13. Mechanics: the ticket lives in core shard A; a core function holding the free shard's service key changes the credential. New function names are `free-reset-*` (the existing `reset-password` is for gym members and is untouched).
14. The approver role is owner-only with its own audit trail.
15. Linked to a gym member: free reset is disabled; send them to the gym desk.
16. Lost phone and failed answers: nothing recovers it; said at signup; purged after inactivity.
17. Privacy: questions are personal data; keep the list short, say what is stored, delete with the account.
18. Optional later: a **recovery code** shown at signup (much stronger, no admin needed); questions + admin become the fallback (Q-CODE).

## 9. Free to gym transition (edge cases in order)
Order of the switch: connect, sign in, forced password change, first manifest write to the train shard; ONLY THEN `mode = connected`. A failed attempt leaves the previous mode untouched.
1. New phone with both accounts: restore from the free account first, then connect.
2. Existing local history: reuse the Phase 69 prompt (Upload, Not now, Never); plain line: what is not uploaded cannot be restored from the gym.
3. Two server copies: after the first successful gym backup the phone deletes its free account; the free directory row gets `linked_member_id`; a sweep purges leftovers after 30 days [A-R6]; the free password becomes useless.
4. Never push to both: the mode flag allows one target.
5. Shared phone (A's data, member B connects): ask "Is this your data?" with a start-fresh option (owner stamp, section 6.2).
6. Duplicates: `client_id`s are stable from creation, so merge by id is safe.
7. Connect fails midway (offline, CORS, wrong code): nothing flips.
8. Leaves the gym: local data stays; offer "Switch to free backup" with fresh consent.
9. UI identity changes from `FR1-...` to `SF-0042`; the old id stays in Settings.
10. Consent line: data on the gym's Supabase is readable by the gym owner.
11. Phone dies mid-transition: both copies exist; restore from free first, then connect again.

## 10. Ultimate admin view (edge cases in order)
Owner role only. One list with a Gym / Free filter, search by id or username, last active, streak, 30-day workouts, tier; detail reuses `member360` and the chart kit. It reads **core shard A only** (no cross-project queries): free stats are mirrored into A by `ingest`.
1. Mechanics: the phone uploads the chunk, then calls `ingest` with the path (avoids the 64 KB function body limit); `ingest` validates, unpacks, runs the xp/streak/tier engine and writes `free_stats` in A.
2. Malformed or oversized chunk: schema check, size and row caps, plain-reason reject.
3. Fake progress: free stats are labelled "self-reported" and stay out of leaderboards and rewards.
4. Edits and deletions: recompute from the latest snapshot, so ingest is idempotent.
5. Stale stats: show last-seen; default filter = active in 30 days.
6. Orphans and duplicates: count active accounts only; a linked account counts once.
7. Privacy scope: training summary only; body stats and intake are never shown for free users; free users show id and username, never a name or phone; every detail view is written to the audit log.
8. Big list: cursor paging plus `VirtualList`.
9. Gym staff and trainers do not see free users.
10. `ingest` down: the chunk is still saved; stats catch up later.
11. Token check: Edge Functions live in core shard A, free logins live in a free shard, so `ingest` verifies the bearer token by asking that free shard's Auth (`/auth/v1/user`) [A-R2].

## 11. Free shards (edge cases in order)
New shard role `free` (F1, F2, ...) in the registry (public URL + anon key only; service keys in core function secrets like `SHARD_B_SERVICE_KEY`). Standalone phones have no gym config, so the free-shard list is **baked into the app build**; adding a shard is an app release. Assignment: lowest-load free shard at signup, fixed afterwards.
1. Shard full: signups skip it at 80%; the owner closes it; existing accounts keep working.
2. Shard paused after a week idle: add every free shard to `keepalive.yml`; the app pings its shard on open.
3. Account holder closes or loses the Supabase account: users lose the server copy, not their phones; the diff routine finds server empty and local full and pushes everything.
4. Wiped shard means the login is gone too: "invalid login" on a free account offers "Re-create backup account" (new id and password, re-upload), said plainly.
5. Adding a shard later: old phones need not know it; each phone needs only its own shard.
6. Same username on two shards: impossible (core directory is unique).
7. Free to gym across shards: section 9.3.
8. `ingest` cannot reach a shard: chunk stays safe; stats catch up later.
9. Admin totals count each person once.
10. Moving accounts between shards: not built (same as gym shards).
11. Capacity: about 1 GB storage per free project; at about 50 KB per account (unmeasured) roughly 20,000 accounts per shard; ingest calls count against core's 500,000 monthly invocations.
12. **Terms and custody (owner must read):** the Supabase terms were NOT checked for spreading one product across several accounts; the 2-active-projects rule counts every organisation where you are Owner or Admin (`SUPABASE_SHARDS.md`); the account holder can read, export or delete everything in a project. Gym member data (names, phones, health answers) stays on accounts the owner controls. Free shards hold only id, username and training chunks.

## 12. Parked / decided against
- **Native wrapper (Capacitor + SQLite) for Android and iOS: parked.** Reasons: a wrapper alone does not fix storage loss (SQLite plugin does); iOS needs a paid Apple account (99 USD/year) which breaks the zero-cost rule; store review, privacy forms and closed testing for new personal Play accounts; the install gate, service worker, base path, backup download and the gym's CORS origin list would all change (a two-zip change); the web layer could be live-updated but native changes need a store release. Revisit only if PWA storage loss is still real after the chunk backup is live. A free Android route (APK on GitHub Releases) exists if ever wanted.
- Blob-only backup (replacing row sync): rejected; breaks server-computed admin stats (the client sends no numbers).
- Client-side end-to-end encryption of chunks: not planned; an admin password reset would make the data unrecoverable (Q-ENC).

## 13. Open owner decisions (carry to `PHASE_STATUS.md` -> Awaiting from owner)
- **Q-SHARD:** which Supabase accounts host the free shards (only the owner's, or other people's)? Read the Supabase terms first.
- **Q-N:** is "400" total members or 400 ACTIVE every day? (decides the overflow shard plan and how soon chunk compaction is needed)
- **Q-AUTO:** reset approval always manual, or auto-approve after cooling-off with matching answers and no cancel?
- **Q-EXP:** may expired or frozen gym members restore their own data? (assumed yes, A-R4)
- **Q-CODE:** add the optional recovery code at free signup?
- **Q-LAW:** consent and privacy wording, retention periods (A-R6); a check against the DPDP Act by someone qualified.
- **Q-ENC:** accept "no end-to-end encryption" because of admin resets?

## 14. Assumptions [A-R#] (change only on the owner's word)
- [A-R1] Chunk target size under about 200 KB gzipped; sizes in 4.6 are guesses until Phase 73 measures them.
- [A-R2] An Edge Function in shard A can verify a free-shard login by calling that shard's `/auth/v1/user` with the bearer token. Not tried.
- [A-R3] Free id carries the shard digit; the core directory table makes usernames globally unique; reset accepts free id or username.
- [A-R4] Expired or frozen members may restore their own data.
- [A-R5] Reset evidence questions are matched against server-held facts (month of last/first workout, session-count band) computed by `ingest`.
- [A-R6] Retention: inactive free accounts purged after 18 months; the free copy of a linked member purged 30 days after the first gym backup; reset cooling-off 24-48 h; ticket expiry 7 days; redeem window 24 h.
- [A-R7] Per-free-account storage cap 3 MB; stop-signups at 80% of a shard.
- [A-R8] Scheduled purge and keep-alive run from GitHub Actions cron (like `keepalive.yml`), not `pg_cron` (availability on the free plan unchecked).
- [A-R9] Shrink threshold for S1: more than 30% of base rows lost.
- [A-R10] Supabase free limits used here come from `SUPABASE_SHARDS.md` (re-checked 2026-11-21 by Admin Phase 16); Nano compute is 60 direct connections and 200 pooler clients; the app uses REST so direct connections are not the limit. A real load test is a standing gap.

## 15. Phase map
| Zip | Phase | Type | What |
|---|---|---|---|
| User | 73 | E | Restore safety net: empty/shrunk detector, owner stamp, cursor reset, Restore screen on the existing delta pull, size measurement |
| Admin | 49 | D | Contract 1.1.0: chunk format, manifest, buckets, free tables, functions, error codes, feature keys, fixtures |
| User | 74 | D | Receive contract 1.1.0 + recovery UX spec (screens, strings) |
| Admin | 50 | E | Free shards, SQL, keep-alive, close-shard for free |
| Admin | 51 | E | `free-signup`, `ingest`, `free-purge` |
| User | 75 | E | Chunk engine (pure) |
| User | 76 | E | Backup runtime |
| User | 77 | E | New-device auto restore (gym member) |
| User | 78 | E | Free account + backup |
| Admin | 52 | E | Recovery answers + `free-reset-*` functions |
| User | 79 | E | Recovery questions + forgot-password flow |
| User | 80 | E | Free to gym transition |
| Admin | 53 | E | Ultimate admin view `/admin/everyone` |
| Admin | 54 | E | Reset queue `/admin/resets` |
| User | 81 | G | Gate: recovery release 1.1.0 |
| Admin | 55 | G | Gate: 1.1.0 |
Order of work across the two zips is the order of the rows. **Everything server-side is unproven until it runs on a real Supabase** (standing gap for every phase here).
