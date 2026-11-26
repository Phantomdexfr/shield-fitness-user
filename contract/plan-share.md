# PLAN-SHARE — share a plan by QR / link / code (ephemeral relay)  — FROZEN at contract 1.0.0 (Admin Phase 9)

Owner: backend = **Admin zip** (SQL + Edge Functions, Admin Phases 11, 15). Client = **User zip** (User Phases 41, 42). Admin templates (Admin Phases 38, 39) reuse the same mechanic.

## 1. What it does
A user taps **Share plan**. The app packs the chosen routine (default: the active one) into an envelope, **encrypts it on the device**, uploads the ciphertext to a relay, and shows a QR, a link and a typed code. The other person scans/opens/types it within **3 minutes**. The relay returns the ciphertext and **deletes it in the same step**. Unclaimed rows are purged at 3 minutes. The relay never sees the key or the plan.

## 2. Secret, id and key
- `secret`: 80 random bits, shown as 16 Crockford-base32 characters grouped `XXXX-XXXX-XXXX-XXXX` (typable; ambiguous letters mapped I,L->1, O->0, case-insensitive).
- `id = hex( SHA-256( "sfplan/id/v1" || secret_bytes ) )[0..32]`  (what the relay sees; cannot be inverted to the secret).
- `key = HKDF-SHA256( ikm = secret_bytes, salt = "sfplan/salt/v1", info = "sfplan/aes/v1" ) -> 256 bit`, cipher AES-256-GCM, 12-byte random IV, stored as `iv || ciphertext+tag`.
- Link: `https://<app-base>/share#<secret>` (the secret is in the URL **fragment**, never sent to any server). QR = that link. Typed code = the same secret.

## 3. Envelope `SFPLAN1` (plaintext, before encryption)
```ts
type PlanEnvelope = {
  schema: 'SFPLAN1'; contractMajor: number; createdAt: string;      // ISO
  from?: string;                    // optional display name, <= 30 chars
  note?: string;                    // optional, <= 200 chars
  routine: { name: string; splitStyle: string; daysPerWeek: number; weekdays: number[];
             days: Day[]; schedule?: Schedule };                    // engines.md shapes; ids are regenerated on import
  customExercises: CustomExercise[];                                // only those referenced by the routine; ids regenerated on import
};
```
**Never included:** history, session logs, marks, body stats, goals, photos, favourites, notes on exercises, account data. Plaintext cap 64 KB; gzip (CompressionStream) before encrypting when available; envelope field `gz: true` is carried as the first byte (0x01 gzip / 0x00 raw) of the plaintext stream.

## 4. Relay API (Edge Functions, anonymous, `verify_jwt = false`, CORS open for the apps' origins)
| Function | Request | Response | Rules |
|---|---|---|---|
| `share_create` | `{ id, ct }` (`ct` base64, <= 48 KB decoded) | `{ expiresAt }` | server sets `expires_at = now() + 180 s` (client cannot choose); rejects duplicate id; rate limit; row cap |
| `share_status` | `{ id }` | `{ state: 'waiting', secondsLeft }` or `{ state: 'gone' }` | no ciphertext returned |
| `share_claim` | `{ id }` | `{ ct }` or 404 | **atomic**: `delete from plan_shares where id=$1 and expires_at > now() returning ct`; single use; never returns an expired row |
| `share_cancel` | `{ id }` | `{ ok: true }` | deletes the row if it exists |
Errors: `{ code, message }` (own shape, not the `SFE###` envelope; success bodies are the plain objects above, not wrapped in `{ok,data}`) with codes and HTTP status: `bad_request` 400 (malformed id/ct, duplicate id), `not_found` 404 (`share_claim` only), `too_large` 413, `rate_limited` 429 (+ `Retry-After` seconds), `relay_full` 503. `share_status` of an unknown or expired id is `200 {state:'gone'}`, never 404. `share_cancel` always answers `{ok:true}` (even if no row existed). Clients show their own plain words per code; the `message` is for logs only.
**Wire format (frozen):** `POST <relay>/<function>`, JSON body, headers `Content-Type: application/json`, `apikey: <anon>`, `Authorization: Bearer <anon>`. Function names keep underscores (`share_create`...), unlike the hyphenated `SFE` functions. `id` = 32 lowercase hex chars. `ct` = standard base64 with padding, decoded size <= 48 KB. `expiresAt` = ISO 8601 UTC string from the server clock; `secondsLeft` is an integer >= 1. `verify_jwt = false`; CORS allows the origins in the relay's `ALLOWED_ORIGINS` secret (same secret name as the other functions).

## 5. Storage and cleanup
Table `plan_shares(id text primary key, ct bytea not null, created_at timestamptz default now(), expires_at timestamptz not null)`; RLS enabled with **no policies** (only service-role Edge Functions touch it). Purge: every call first runs `delete from plan_shares where expires_at < now()`; plus the scheduled keep-alive function purges too. `share_rate(ip_hash, bucket, n)` for limits, purged hourly. Live-row cap 300.
**Limits (revised and frozen in Admin Phase 9):** per IP per 10 min: `share_create` **30**, `share_claim` **60**, `share_status` **400**, `share_cancel` 60; ip_hash = SHA-256(ip || daily salt); live-row cap 300; sender polls `share_status` every 3 s, at most 60 times per share. *Why the draft numbers changed:* one share polls 60 times (180 s / 3 s), which alone used the whole draft allowance of 60 status calls, so a second share inside 10 minutes (kiosk mode, Admin Phase 39) would have been refused; and a gym's members share one Wi-Fi IP, so 10 creates per 10 min would throttle the gym. 400 status calls = about 6 shares per 10 min per IP; 30 creates = 30 members per 10 min. **These numbers are server-side configuration, not wire contract:** the owner may tune them in the relay without a contract bump; clients must only honour `rate_limited` + `Retry-After`.
Egress note: a share is at most 48 KB up + 48 KB down + 60 status calls x 0.5 KB = about 130 KB; 300 live rows x 48 KB = 14.4 MB worst case in the database, purged within 3 minutes.

## 6. Where the relay lives
- **Connected to a gym:** the gym's functions URL (from `SFCFG1`).
- **Standalone:** a default relay set in the app build (`VITE_SHARE_RELAY_URL`, `VITE_SHARE_RELAY_ANON`, public values) pointing at the owner's chosen Supabase project (shard A is fine). If none is configured the Share feature is hidden, with a plain "sharing is not set up" note in Settings. The owner sets this once (Admin `docs/OWNER_SETUP.md`).
- A gym may lock the feature off with feature key `plan_share`.

## 7. Receive flow (client)
1. Link/QR/typed code -> derive id -> `share_claim` -> decrypt -> parse with zod (`PlanEnvelope`) -> **preview screen** (name, days, exercise count, setups, schedule, note, sender name) with flags: "n exercises not in your library", "n hidden by your gym", "n custom exercises will be added".
2. Choices: **Add as a new routine** (default, inactive) / **Add and make active**. Never overwrites an existing routine. Ids regenerated; custom exercises imported with new ids and slugs `my-<kebab>` (collision-safe); unknown library slugs kept as "unavailable" items with a swap prompt.
3. Failures: expired/used ("this share was already received or timed out, ask them to share again"), offline, corrupt (decrypt/validate failed), too new (`contractMajor` higher).
Since the claim deletes the row, a second scan of the same QR fails by design.

## 8. Sender screen
QR + link + code, big countdown from `expiresAt`, "Waiting for the other person..." -> when `share_status` says `gone` before expiry and the user did not cancel: **Delivered**. Buttons: Cancel (calls `share_cancel`), Copy link, Share via system sheet. At 0:00 the screen says Expired and offers "Share again" (new secret).

## 9. Admin templates (same mechanic)
Admin templates are plan envelopes stored **locally** (IndexedDB, file import/export `.sfplan.json`); **Deploy** creates a fresh single-use share each time (new secret, 3 minutes). "Kiosk mode" auto-creates the next share when the current one is claimed or expires. Nothing about templates is stored on the relay.

## 10. Fixtures (frozen expectations)
Folder `contract/fixtures/plan-share/` is created by **User Phase 41** (first implementer) and copied to the Admin zip as a contract **patch** release (`1.0.x`, both zips, new `CHECKSUMS.txt`). Contents the test in each zip will run identically:
1. `vectors.json`: for 3 fixed secrets (given as the 16-char typed form AND the 10 raw bytes in hex): the expected `id` (32 hex), the HKDF `key` (hex), and for one fixed IV and one fixed envelope: the exact `iv||ciphertext+tag` (hex). Proves SHA-256 id, HKDF, AES-GCM and the gz first-byte rule agree across both implementations.
2. `typed-codes.json`: input strings (lowercase, with `I`/`L`/`O`, with or without dashes, with spaces) -> normalised secret or "invalid".
3. `envelope.valid.json` and 4 `envelope.bad-*.json` (wrong schema tag, too new `contractMajor`, field too long, extra forbidden field such as history) with the expected accept/reject.
Until that patch lands, both apps implement from sections 2-3 and may keep their own temporary vectors.
