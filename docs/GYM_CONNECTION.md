# GYM_CONNECTION — standalone first, connect when you want

Contract files: `contract/gym-config.md` (connect payload), `contract/policy.md` (what the gym controls), `contract/connected-api.md` (tables/functions). Phases 65 (spec, section "PHASE 65 SPEC" at the bottom), 66 (policy engine + gym config), 67 (link, login, sync), 68 (gym screens), 69 (programs, overrides, history upload), 70 (gate). The older numbers 46-50 in this file were pre-renumbering; the Phase 65 spec below wins.

## Modes
- **Standalone (default):** no login, no server, no gym. Everything works from the compiled dataset + IndexedDB. Tiers/XP and all gym features are off. Backup/restore by file.
- **Connected:** a gym config was added. Features marked `needsConnection` appear; policy locks/defaults apply; training data syncs to the gym's Supabase under the member's own login.
The code path for standalone must never import the Supabase library (`import()` only after connecting).

## Add a gym (Settings -> Gym connection)
1. Choose **Scan QR**, **Paste code**, or open a **link** (`/connect#SFCFG1.…`).
2. The app decodes and validates (see `gym-config.md`), shows **gym name + server host**, and asks "Connect to this gym?" Nothing is sent before confirmation.
3. On confirm: fetch `contract_version` and `policy` (public read of `gym_settings`), check the MAJOR matches, then show **Login** (member code or phone + the password the gym gave you).
4. First login -> forced **change password** (the gym created the first one).
5. One-time question: "Upload your existing history to your gym account?" (default Yes; skippable; resumable; idempotent).
6. Connected: the sync chip appears; gym screens appear in the tab bar under "Gym".

## Without credentials
"Join this gym" (public `request-join`) lets someone ask for an account (name, phone, goal, consent). They keep using the app standalone until the gym approves and issues credentials.

## Disconnect
Settings -> Gym connection -> Disconnect: forget config + sessions + cached gym data; return to standalone; all personal local data stays. The gym keeps what was already synced.

## What the gym can and cannot do (policy.md)
Can: turn features on/off (optionally locked), set defaults, hide exercises, set YouTube links, mark machines in maintenance, publish programs, review proposals, show announcements. **Cannot:** read local-only data (photos, local prefs), change the dataset, force-install anything, run code in the app.

## Locked features
Row shows "Set by your gym"; the screen for a disabled feature shows a one-line explanation and the way back; never a blank screen.

## Gym programs as a routine source
A published program appears under Routines -> "From your gym" with **Follow** (live, read-only link to the gym's version), **Copy to mine** (editable copy), **Ignore**. A followed program's days appear in the week view and start sessions like any routine.

## Errors in plain words
"Your gym's server is asleep — try again later" (paused project) · "This gym needs a newer version of the app" (major mismatch) · "That code doesn't look right" (invalid config) · "Your login didn't work — ask the gym desk" (credentials) · "You're offline — we'll sync when you're back".

## Offline
Connected apps keep working offline from the local store and cached policy; the outbox waits; a quiet chip says "N changes waiting".


---
# PHASE 65 SPEC — Connection UX and policy consumption (FROZEN for Phases 66-70)
Status: docs only. Written 2026-11-21 against contract 1.0.0. Where this section and the text above differ, this section wins. Code names (`resolveFeature`, `applyLibraryOverrides`, `parseGymConfig`) are the ones Phase 66 builds.

## 1. Screens (all sub-pages of Settings -> Gym connection, route `/settings/gym`, plus one entry route)
Every screen: dark and gold, one primary button, a Back arrow, plain words, no truncation, works at 360 px. A screen never blocks the rest of the app.

| # | Screen | Route | When | What it shows | Buttons |
|---|---|---|---|---|---|
| S1 | Gym connection home | `/settings/gym` | always | Standalone: "You are using Shield Fitness on your own. Everything works without a gym." Connected: gym name, server host, policy version, "last synced hh:mm", sync state, Disconnect | Standalone: **Add a gym**. Connected: **Sign in** (if signed out), **Refresh gym settings**, **Disconnect** |
| S2 | Add a gym | `/settings/gym/add` | tap Add a gym | three choices: **Scan QR**, **Paste code**, **Open from a link** (explains the link opens this app) | the three choices |
| S3 | Scan QR | `/settings/gym/add/scan` | choice 1 | camera view (reuses the existing `jsqr` scanner component from the barcode feature; camera stays on device, nothing is stored) | Cancel, "Type it instead" |
| S4 | Paste code | `/settings/gym/add/paste` | choice 2 | one multi-line box ("Paste the code your gym gave you"), Paste button using the clipboard when allowed | **Check code** |
| S5 | Link entry | `/connect` (feature `gym_connect`, see 7) | someone opens `https://<app>/connect#SFCFG1.<payload>` | reads the fragment, **immediately removes it from the address bar** (`history.replaceState`), then goes to S6. No fragment -> redirects to S2. | - |
| S6 | Confirm gym | `/settings/gym/confirm` | config decoded and valid | gym name, **server host in large text** (e.g. `abcd1234.supabase.co`), "Issued 2026-11-17", "Nothing has been sent yet." plus one line: "Only connect to a gym you trust." | **Connect to this gym**, Cancel |
| S7 | Connecting | inline on S6 | after Connect | step list with ticks: "Reaching your gym", "Reading the gym's settings", "Checking the app version" | Cancel until done |
| S8 | Sign in | `/settings/gym/signin` | after S7, or from S1 when signed out | member code or phone box, password box (show/hide), "Don't have an account? Ask to join" link | **Sign in**, Skip for now |
| S9 | Change password | `/settings/gym/password` | `profiles.must_change_password` is true | the ONLY screen shown in the gym area until done; rules in words: 10-72 characters, a letter and a number, not your member code or phone; current + new + repeat | **Change password** |
| S10 | Upload my history? | `/settings/gym/history` | once, after the first successful sign-in (and password change) | counts: "142 workouts, 18 body entries, 6 routines, 3 own exercises". Says progress photos and local settings are never uploaded | **Upload my history** (default), **Not now**, **Never** |
| S11 | Upload progress | inline on S10 then on S1 | during upload | progress bar "48 of 142 workouts", "You can leave this screen, it continues" | Pause / Resume |
| S12 | Disconnect | `/settings/gym/disconnect` | tap Disconnect | what happens (section 4), a count of anything not yet synced ("5 changes have not reached your gym") | **Disconnect**, Keep connected |
| S13 | Join this gym | `/settings/gym/join` | link on S8, or S1 when connected and signed out | name (2-80), phone, optional note (300), the consent tick with its sentence; honeypot field `website` is sent empty and never shown | **Send request** |
| S14 | Gym "needs attention" | `/settings/gym` (banner on S1 and the sync chip) | auth paused, failed items, version mismatch | one sentence + the one action | action button |

Rules for the flow:
- A scanned or pasted config is untrusted data. The app shows only: name, host, issued date. It never opens, fetches or follows any URL inside the config other than `core.url`, the `train[].url` entries and `functions`; none are contacted before the user taps **Connect**.
- Only one gym at a time. If already connected, S2 is replaced by "Disconnect first to connect to another gym."
- The user can leave at any step with the system back button; nothing is stored until **Connect to this gym** succeeds through S7 (then the config is stored, sign-in is still optional).
- Sign-in is never forced. After S7 succeeded but sign-in was skipped, the app is "connected, signed out": policy and library overrides apply (they are public), training sync, membership and inbox wait for sign-in and the Gym tab shows one "Sign in" card.
- Passwords are never stored. The Supabase session (refresh token) is stored by the Supabase client and cleared on Disconnect.
- **Install gate:** if the link is opened in a normal browser tab, the install screen shows first (rule 9). The fragment is NOT kept (iOS Safari and the installed app have separate storage). The install screen gets one extra line when a `/connect` fragment was present: "After installing, open Settings -> Gym connection -> Add a gym and scan or paste the code again." [A-P65.1]

## 2. Validation and the words the user sees
Validation order in `parseGymConfig` (Phase 66), first failure wins, each has a stable code and a fixed sentence:

| Code | Check | Sentence |
|---|---|---|
| `GCF_PREFIX` | text, after trimming spaces and line breaks, starts with `SFCFG1.` (a full `/connect#SFCFG1.` link is also accepted and the payload cut out) | "That code doesn't look right. Ask your gym for a new one." |
| `GCF_DECODE` | base64url decodes and JSON parses, size <= 4 KB | "That code doesn't look right. Ask your gym for a new one." |
| `GCF_SCHEMA` | zod: `v` is 1, `name` 1-60 chars, `contract` "major.minor", `core.url`, `core.anon`, `train[]` (1-8 entries with `id`), `functions`, `issued` date | "That code is from a different kind of app." |
| `GCF_VERSION` | `v` is 1 | "This code needs a newer version of the app." |
| `GCF_HOST` | every URL is `https`, host ends in `.supabase.co`, no user-info, no port, no path other than `/functions/v1` for `functions`; `functions` host equals `core.url` host; if `ALLOWED_GYM_HOSTS` is non-empty every host must be in it | "This code points to a server we don't trust." (allow-list miss: "This app is set up for a specific gym and this code is for another one.") |
| `GCF_MAJOR` | major of `config.contract` equals the app's contract major | "This gym needs a newer version of the app." |
| `GCF_SECRET` | the anon value decodes as a JWT whose `role` is `anon`; a `service_role` role (or any key that is not `anon`) is rejected and **never stored or logged** | "That code contains something it should not. Do not use it. Tell your gym." |

Connect-time and runtime messages (S7 onwards), words fixed here so Phase 66-68 only wire them:

| Situation | Sentence | Behaviour |
|---|---|---|
| paused or unreachable project (HTTP 5xx / DNS / timeout while online) | "Your gym's server is asleep. Try again later." | stay standalone at S6 with **Try again**; if already connected, keep working locally |
| offline at Connect | "You're offline. Connect once you have internet." | nothing stored |
| `gym_settings.contract_version` major differs | "This gym needs a newer version of the app." | do not switch to connected; if already connected, behave as standalone (policy ignored, nothing synced) and show S14 |
| policy missing or invalid | "Your gym hasn't finished setting up." | first connect: stay at S6 with Try again (never half-connected); if it turns invalid later, keep the last good cached policy (policy.md) |
| sign-in wrong password or unknown code | "Your login didn't work. Ask the gym desk." (always this one sentence, never says which part was wrong) | stay on S8 |
| `SFE004` rate limit | "Too many tries. Wait {retry_after} seconds." | button disabled while counting |
| `SFE006` origin not allowed | "This gym hasn't allowed this app yet. Tell your gym." | stay on S8 |
| account locked / paused by gym | "Your account is paused. Ask the gym desk." plus `branding.support_phone_display` as a tap-to-call link when present | |
| `SFE102` | "That isn't your current password." | S9 |
| `SFE103` | "Use 10 to 72 characters with a letter and a number." | S9 |
| `SFE104` | "Don't use your member code or phone number." | S9 |
| `SFE105` | "Your account is locked. Ask the gym desk." | S9 |
| `SFE402` | "Your password was not changed. Your old one still works." | S9 |
| `SFE001` (+fields) | "Check: {field}." per problem | S13 |
| `SFE501` | "Please tick the box so the gym may contact you." | S13 |
| `SFE007` / `SFE004` on join | "Too many requests. Try again later." | S13 |
| any other `SFE###` | the server's `message`; if absent: "Something went wrong on our side and nothing was changed." | |
| offline (generic) | "You're offline. We'll sync when you're back." | chip |
The app branches only on `code` and `retry_after`, never on message text.

## 3. Offline behaviour
- Config, policy, last good policy version and cached gym data live on the device. Opening the app offline never asks for sign-in again if a refresh token exists; the Supabase session is restored from storage (Phase 67). If the token is expired and the device is offline, the app stays usable in "connected, signed out" form and says nothing until online.
- Policy refresh: on app open and when returning to the foreground (30 s debounce), one cheap read (`version` first, full body only when it changed). Failure is silent; the cached policy stays. **No policy is ever dropped because of being old.** Age shows only on S1 ("Gym settings updated 3 days ago").
- Writes always go to the device first (rule 1 of Sync rules). Outbox waits offline. The chip reads "N changes waiting".
- Credential screens (S8, S9, S13, history upload start, Connect) need the internet; offline they show the offline sentence and a disabled primary button. Nothing is queued for them.
- Standalone behaviour after Disconnect or after a major mismatch is identical to never having connected.

## 4. Disconnect (S12) — exact effects
Removed: stored config (URLs, anon keys), Supabase sessions, cached policy, all cached gym tables (membership, payments, attendance, announcements, inbox, requests, programs, `custom_exercises_approved`), gym branding, the sync cursors, library overrides, feature locks. Followed gym programs: the **link** goes; a **Copy to mine** routine stays untouched; followed-only routines are asked about once ("Keep a copy of 'Fat burn 8 weeks'?" Yes keeps an editable copy, No removes it).
Kept: every personal row (sessions, sets, routines, custom exercises, body stats, goals, intake, marks, prefs, progress photos). The `client_id`s stay, so reconnecting to the same gym later does not duplicate anything. The unsynced outbox: if rows are waiting, S12 says how many and offers "Try to sync first" (online) or "Disconnect anyway"; on Disconnect the outbox is emptied and each personal row is flagged `unsynced` so a later upload (S10) sends them. The gym keeps what it already received. Nothing on the gym side is deleted by this app.
Connecting to a **different** gym later: the history question (S10) is asked again for that gym; uploaded flags are kept per gym id (`core` host).

## 5. Policy consumption — every field has a UI effect
`resolveFeature(key, ctx)` (Phase 66) applies policy.md's four rules. Locked wins; else the user's pref; else for a new connection the admin `enabled` is the starting default (applied once at S7, written into the user's pref only if the user has not set it).

| Policy field | UI effect |
|---|---|
| `contract` | compared to the app's major at connect and on every policy fetch; mismatch -> S14, standalone behaviour (section 2). Shown on S1 as "Gym settings format 1.0.0". |
| `version` | cache key: fetch full policy only when higher than the cached one; shown on S1 as "Policy v12". A lower number than cached is ignored (stale). |
| `published_at` | S1 line "Updated {date}". Not used for logic. |
| `gym.name` | S1 title, S6, the Gym tab heading, About line "Connected to {name}". |
| `gym.slug` | identifies the gym for per-gym flags (history uploaded, dismissed notices); never shown. |
| `gym.timezone` | **informational only** [A-P65.2]. The app keeps showing Asia/Kolkata (build rule 7). Shown on S1 as "Gym time zone". |
| `features[k].enabled` + `locked:true` | the feature is forced on or off. The feature's route redirects to the explain screen (section 6) when forced off; tab or menu entries for a forced-off feature are hidden but the Settings row stays visible and disabled with "Set by your gym" and the forced state. Forced on: row shows the switch on and disabled. |
| `features[k].enabled` + `locked:false` | starting default for a new connection only; the user's switch works as normal. |
| `features[k]` for a key not in the catalogue | ignored (forward compatible); a catalogue key missing from the policy uses the catalogue default. |
| `features[k]` for `adminLockable:false` keys (`flexible_session`, `progress_charts`, `membership`, `attendance_qr`, `inbox`, `requests`, `gym_programs`) | `locked` and `enabled` are ignored for locking (`flexible_session` and `progress_charts` can never be turned off). For `needsConnection` gym keys the default stays on when connected and signed in. |
| `defaults.units` | starting default of the units pref at connect (kg only today; lb ignored until the app supports it). Not applied if the user has set it. |
| `defaults.rest_seconds` | starting default of rest timer pref at connect, only if unset by the user. |
| `defaults.intensity` | starting default of the intensity pref (`light|moderate|hard`; unknown value ignored). |
| `defaults.simple_mode` | starting default of Simple/Advanced (true = Simple), applied once. |
| `library.hidden_exercise_slugs` | see 8. |
| `library.youtube_overrides` | see 8. |
| `library.machine_status` | see 8. |
| `library.extra_exercise_slugs` | see 8 (adds gym-approved exercises to the library). |
| `library.hidden_setup_values` | see 8 (setup options). |
| `programs_published` | see 9. |
| `branding.short_name` | tab label for the gym area ("Shield") and sync chip text; falls back to `gym.name`. |
| `branding.support_phone_display` | shown as a tap-to-call row on S1 and in the locked-out and paused-account sentences; `null` -> the sentence says "Ask the gym desk." with no number. |
Validation (zod, Phase 66): invalid policy -> ignored, last good cached policy stays, S1 shows "Your gym's latest settings could not be read; using the previous ones." Unknown top-level keys are ignored.

## 6. What each feature does when locked or off (the explain screen)
A feature forced off by the gym, or `needsConnection` while standalone, never shows a blank page or a broken button.
- Deep link or old bookmark to its route -> a small page: icon, title of the feature, **one line**, one button. Lines: forced off: "Your gym has turned this off." (button **Back**); standalone and `needsConnection`: "This is part of your gym's app. Add a gym to use it." (button **Add a gym**); connected but signed out and the feature needs sign-in: "Sign in to your gym to use this." (button **Sign in**).
- Menus, tab bar, cards and search hide the entry; the Settings row stays (disabled, "Set by your gym").
- Data produced while the feature was on stays and stays readable in history and backups. Turning a feature off never deletes data. Examples of effect: `custom_exercises` off hides "Create exercise" and the My exercises tab but existing custom exercises still appear in logged history; `progress_photos` off hides the photo entry points, files stay on the device; `rpe_logging` off removes the RPE field from sets and keeps stored RPE values; `suggestions` off removes suggestion cards and swap chips (manual search and the skip button stay); `youtube_links` off removes the video link; `machine_photos` off swaps photos for a plain icon frame of the same size; `tiers` off hides XP and tier UI.
- Policy changes while the app is open apply on the next render (the feature hook subscribes); a session in progress is never interrupted: a feature turned off mid-session disappears from the next screen, the current set is kept.

## 7. Feature keys this phase needs [A-P65.3]
The entry route `/connect` and the screens S2-S14 are the gym connection area of Settings, so they use the existing settings flag and need no new key. **No new key is added to `contract/features.catalogue.json`** (contract untouched). The `/connect` entry route is registered with `feature: null` so it works in standalone (it is how standalone becomes connected). Gym tab content is gated by the existing keys `membership`, `attendance_qr`, `inbox`, `requests`, `gym_programs`.

## 8. Library overrides (applied by `applyLibraryOverrides(exercises, machines, library)` in Phase 66, called at query time, never writing to the dataset)
- `hidden_exercise_slugs`: removed from search results, tap-a-muscle lists, suggestions, swaps, the day builder picker, the machine page's "exercises on this machine" list and the random quick workout. **Still readable**: history, logged sessions, saved routines (a hidden exercise in an existing routine shows with a small "Hidden by your gym" tag and a **Swap** button; it is never silently removed), and the `/exercise/<slug>` page opened from history (shows "Hidden by your gym" and no Add buttons). The gym cannot hide a user's own `my-...` exercises.
- `youtube_overrides[slug]`: replaces the YouTube search link on that exercise's page. Only `https://www.youtube.com/` and `https://youtu.be/` URLs are accepted (anything else ignored). Opens in a new tab with the existing external-link confirm; nothing is embedded. When `youtube_links` is off, no link at all.
- `machine_status[slug] = {status, note}`: `active` (default, no badge), `maintenance` (amber badge "Maintenance" + note), `out_of_order` (red-toned badge "Out of order" + note). Badge appears on the machine thumb in lists, the machine page, the exercise page "Machines" row, and the muscle badges where a machine is named. Suggestions and swaps **skip exercises whose only machines are unavailable**, preferring same-muscle alternatives (a free-weight or active-machine variant). The user can still add such an exercise manually (never blocked, rule 4) and sees the badge on the set screen. Unknown status value -> treated as `active`.
- `extra_exercise_slugs`: slugs `gym-...` or `my-...` defined by `custom_exercises_approved`; after the first pull they merge into the library like custom exercises but are tagged "From your gym" and cannot be edited or deleted by the member. Slug with no downloaded definition yet -> ignored until the pull brings it. Removing a slug from the list removes it from search but keeps history readable.
- `hidden_setup_values[exerciseSlug] = ["axis:value", ...]`: removes those values from that exercise's setup pickers (`engines.md` section 13). Unknown axis or value ignored. A value already used in a logged set stays visible in that set's history.
- Overrides never delete data, never edit the bundled dataset, and are dropped on Disconnect.

## 9. Gym programs as a routine source
- Source: tables `programs`, `program_days`, `program_items`, `member_programs` (shard A, read). RLS exposes `status='approved'`; the app additionally shows only slugs in `policy.programs_published` **plus** programs in `member_programs` (assigned to this member by a trainer, shown even if not in the published list, with "Assigned to you").
- Where: Routines page -> new section **From your gym** (hidden when `gym_programs` is off or the member is signed out; signed out shows one "Sign in to see your gym's programs" card). Each program card: name, days per week, weeks, goal line, badge "Assigned to you" or "Published".
- Actions on a card: **Follow** (live read-only link; the program's days appear in the Today card and week view and start a session like any routine; when the gym updates it, the next pull replaces the days and a quiet "Updated by your gym" note shows; sessions already logged keep their data), **Copy to mine** (an editable normal routine with `source: 'gym:<slug>'`, a snapshot that never changes again), **Ignore** (hides the card; undo from Routines -> From your gym -> "Ignored (n)").
- A followed program is read-only in the builder (all edit controls disabled with "Followed from your gym. Copy to mine to edit."). Skip, swap and reorder **inside a session** still work (rule 4); swaps in a session do not edit the program.
- A program item whose exercise is hidden by policy or unknown to the app (`exercise_ref` not in dataset): shown with "Not available" and a **Swap** button; never crashes the day.
- If a followed program is unpublished or deleted by the gym: it moves to "Ended by your gym" and offers **Keep a copy**; it is not silently removed.
- Programs are not uploaded to the gym; only what the member logs (sessions referencing the `exercise_ref`).

## 10. Upload-history rules (S10, Phase 69)
- Asked **once per gym per device**, after the first successful sign-in and password change. Answers: **Upload** (default), **Not now** (asked again after 7 days, maximum 3 times, then only from S1 -> "Upload my history"), **Never** (never asked; S1 keeps a quiet "Upload my history" row).
- What goes: sessions (+ sets, cardio), routines (user-made only, not followed programs), custom exercises, body stats, goals, intake logs, injury marks, exercise prefs, personal records. What never goes: progress photos, local preferences, reminders, backup files, followed-program links.
- Window: all history on the device (the 12-month rule is for pulling, not uploading); rows older than 24 months upload last.
- Uses the normal outbox path: each local row already has its `client_id` (SYNC_SPEC), the same push order and batches of <= 50, `resolution` classes of connected-api. **Idempotent and resumable**: kill the app at any point, reopen, press Resume; no duplicates; a row the server already has is skipped by `client_id`.
- Rows created while connected go through the live outbox as usual; the upload only queues rows created before connecting (flag `uploaded_to:<gymId>` not set).
- Failures: a row the server rejects (RLS/validation) is marked failed with its plain reason, listed under S1 -> "n items need attention", and does not stop the rest. Auth failure pauses with "Sign in again to continue."
- Cancel at any time; whatever was uploaded stays at the gym. Nothing is deleted on either side.
- After a successful upload the app asks the server for a stats refresh (`sync-summary`, no numbers sent) so the gym's member list updates.
- Size and cost: batches only while online and foreground; pause on a metered connection is NOT detected (web app limit), so the screen shows the counts and a "Continue on Wi-Fi?" line before starting when more than 500 rows. [A-P65.4]

## 11. Sync chip and notices (consumption side)
Chip (from SYNC_SPEC) sits in the top bar on Today and the Gym tab only when connected: `Synced hh:mm` · `Syncing...` · `Offline, N changes waiting` · `Needs attention`. Tap -> S1 section "Sync" listing failed items with their reasons and **Retry**. Never shown standalone. Announcements/inbox badge counts come from `inbox` and `announcements` (Phase 68).

## 12. Hand-off to later phases
- **66 builds:** `src/shared/policy.ts`, `src/shared/gymConfig.ts` (codes in section 2), `useFeature` wiring, library overrides in search/suggestions/machine badges, S1-S7 up to the confirm screen with no network; fixtures `policy_*`, `gymconfig_*`. Fixtures must cover: every row of section 2's validation table, locked on/off, unlocked default, unknown key, non-lockable key with `locked:true`, hidden slug, `youtube_overrides` bad host, `machine_status` unknown value, maintenance, `hidden_setup_values` unknown axis, invalid policy keeps previous.
- **67 builds:** S7 network checks, S8, S9, S13, sync chip, Disconnect (S12).
- **68 builds:** Gym tab (membership, QR, attendance, inbox, requests).
- **69 builds:** section 9 and S10-S11.
- **Owner data needed later (never invented):** `ALLOWED_GYM_HOSTS` value (optional), the gym's `SFCFG1` code, the gym's support phone (comes from policy). None is needed for 66.

## 13. Assumptions [A]
- [A-P65.1] An install-gate hit on a `/connect` link does not keep the code (separate storage on iOS); one extra line tells the user to scan or paste again.
- [A-P65.2] `gym.timezone` is informational; the app stays on Asia/Kolkata (build rule 7).
- [A-P65.3] No new feature key; contract untouched.
- [A-P65.4] No metered-connection detection; a confirm line for large uploads instead.
- [A-P65.5] A major mismatch or unreadable first policy keeps the user in standalone behaviour (never half-connected).
- [A-P65.6] Programs assigned through `member_programs` show even when not in `programs_published`.

---
# PHASE 74 SPEC — Backup and recovery screens (FROZEN for Phases 76-81)
Source: contract 1.1.0 (`connected-api.md` "Backups and free accounts", `engines.md` 27), `docs/RECOVERY_PLAN.md` sections 6-9, `docs/SYNC_SPEC.md` PHASE 74 SPEC. Same look rules as section 1: dark and gold, one primary button, Back arrow, plain words, no truncation, no expand cards, 360 px, a screen never blocks the rest of the app. All screens live under **Settings -> Data and backup -> Back up my data**, route prefix `/settings/backup`. The Phase 73 route `/gym/restore` stays and is later served by the same component as R6 (Phase 77). Every string below is a `t()` key to add to `src/i18n/en.ts` by the phase that builds the screen (prefix `bk.`); none exists yet. Wording marked DRAFT-LAW waits for the owner's Q-LAW answer; wording marked AWAIT-ADMIN is copied from the Admin zip in Phase 79.

## P74-1. Screens
| # | Screen | Route | Feature key | Built in | When | What it shows | Buttons |
|---|---|---|---|---|---|---|---|
| R1 | Back up my data (home) | `/settings/backup` | `cloud_backup` | 76 | always, from Data and backup | Standalone: "Your data lives only on this phone." Free: free id, "last backup hh:mm", state line. Connected: "Backed up to your gym", "last backup hh:mm". | Standalone: **Back up my data** (free_account on) / **Sign in to my backup**. Free: **Back up now**, **Restore my data**, **Delete my backup**. Connected: **Back up now**, **Restore my data**. |
| R2 | Consent | `/settings/backup/consent` | `free_account` | 78 | after R1 Back up my data | Where the copy lives (a free server run for this app), that the person who runs that server account can read it, what is sent (workouts, body entries, routines, own exercises, goals; never photos or phone settings), how long it is kept (18 months without use, [A-R6]), that it can be deleted any time, that without the password AND the recovery answers a lost phone cannot be recovered. One tick box. | **I agree and continue** (disabled until ticked), Cancel |
| R3 | Recovery questions | `/settings/backup/questions` | `free_account` | 79 (screen shell in 78 with Skip disabled) | after R4, because `free-recovery-set` needs the new account's token; REQUIRED, no skip | Plain warning, two fixed prompts `p1` `p2`, answers typed on the phone and sent once to `free-recovery-set`; never stored on the device | **Save answers** |
| R4 | Your password (show once) | `/settings/backup/password` | `free_account` | 78 | after the account was created | The free id and username, the 16-character password in large text, copy, share, save as image; "Shown only once. Nothing can show it again."; tick "I saved it" | **Done** (disabled until ticked) |
| R5 | Already have an account | `/settings/backup/signin` | `free_account` | 78 | R1 link, and first launch after a reinstall | one box (free id or username), password box (show/hide); calls `free-lookup`, then signs in to the returned shard | **Sign in**, Forgot password? |
| R6 | Restore progress | `/settings/backup/restore` | `cloud_backup` (+`auto_restore` for the automatic start) | 77 | after sign-in when this phone has no data and a manifest exists; or by button | "Restoring 3 of 8", newest month first; "Keep this screen open. If it stops, open it again and it carries on."; done line; not-restored line | Start, Try again, Back |
| R7 | Forgot password | `/settings/backup/forgot` | `free_account` | 79 | R5 link | free id or username; "First month you trained" and "Last month you trained" (month pickers), "About how many workouts" (five bands), the two answers | **Send request** |
| R8 | Reset status | `/settings/backup/forgot/status` | `free_account` | 79 | after R7, or by id plus ticket code | the ticket code in large text, status line per `free-reset-status` value, "Ready after {date}" | Check again, Cancel request (needs a signed-in old device) |
| R9 | New password | `/settings/backup/forgot/redeem` | `free_account` | 79 | status `approved` | the phone generates a NEW password, shows it once (as R4), calls `free-reset-redeem` | **Set this password**, then R4's "I saved it" |
| R10 | Switch to free backup | `/settings/backup/switch` | `free_account` | 80 | after leaving a gym, from R1 | fresh consent (R2 text), explains the gym copy is not touched | **Switch**, Not now |
| R11 | Delete my backup | `/settings/backup/delete` | `cloud_backup` | 78 | R1 (free mode) | what is removed (login, backup, recovery answers) and what stays (everything on this phone) | **Delete my backup**, Keep it |
| R12 | Move to my gym | inline on S10 (Phase 69 upload screen) | `cloud_backup` | 80 | connecting to a gym while mode is `free_backup` | "Your backup will move to your gym. Your free backup is deleted afterwards. What is not uploaded to the gym cannot be restored from it." | existing S10 buttons |
| R13 | Backup status line | inline on R1 and Settings row | `cloud_backup` | 76 | always | one line, see P74-3 | - |
Install gate screen (Phase 1) gets one extra line in Phase 77: "Your workouts come back after you sign in."

## P74-2. Flows (order is binding)
1. **Free opt-in:** R1 -> R2 -> phone generates `username` (`a-z0-9-`, 4-24, like `lifter-7k2q`) and a 16-character password -> `free-signup` (`{username, password, consent:true, consent_version, website:""}`; `website` always empty) -> on `SFE701` regenerate and retry BEFORE showing anything -> R4 -> R3 -> first chunk push -> `backup:mode = free_backup`. If R3 or the first push fails, the account exists but the mode is still `standalone` and R1 offers "Finish setting up".
2. **Reinstall:** first launch after install asks "Already have a backup? Sign in" before offering a new one -> R5 -> sign-in -> R6.
3. **Gym member on a new phone:** connect -> sign in -> forced password change (S9) -> R6 starts by itself if `auto_restore` is on, else the Phase 73 button.
4. **Free to gym:** connect, sign in, forced password change, first manifest write to the train shard, ONLY THEN `mode = connected`, then `free-delete`; any earlier failure leaves `free_backup`.
5. **Forgot password:** R7 -> R8 (cooling off 24-48 h, [A-R6]) -> approved by the owner in the Admin app -> R9 -> R4. A reset changes credentials only; the backup stays.
6. **Linked to a gym member:** the server answers R7 like an unknown account; the screen shows "If this account belongs to a gym member, ask at the gym desk." Same sentence for unknown ids (never reveal which).

## P74-3. Strings (key -> English)
Status line R13 (`bk.state.*`):
| Key | Text |
|---|---|
| `bk.h` | Back up my data |
| `bk.state.off` | Your data lives only on this phone. |
| `bk.state.ok` | Backed up {time}. |
| `bk.state.wait` | Waiting for internet. Your data is safe on this phone. |
| `bk.state.saving` | Backing up... |
| `bk.state.blocked` | Backup paused. This phone has much less data than the backup. |
| `bk.state.update` | Update the app to keep backing up. |
| `bk.state.attn` | Backup needs attention. Open Back up my data. |
R1 and shared:
| Key | Text |
|---|---|
| `bk.go` | Back up my data |
| `bk.now` | Back up now |
| `bk.restore` | Restore my data |
| `bk.signin` | Sign in to my backup |
| `bk.finish` | Finish setting up |
| `bk.gym.line` | Backed up to your gym. |
| `bk.free.id` | Your backup id: {id} |
| `bk.what` | We back up workouts, body entries, routines, your own exercises and goals. Progress photos and phone settings stay on this phone. |
| `bk.row` | Back up my data |
| `bk.row.hint` | Keep a copy so a lost phone does not lose your workouts. |
R2 consent (DRAFT-LAW):
| Key | Text |
|---|---|
| `bk.consent.h` | Before we back up |
| `bk.consent.where` | A copy of your data is kept on a free online server used by this app. |
| `bk.consent.who` | The person who runs that server account can read it. |
| `bk.consent.sent` | We send workouts, body entries, routines, your own exercises and goals. We never send photos or phone settings. |
| `bk.consent.keep` | It is kept until you delete it, or removed after 18 months without use. |
| `bk.consent.del` | You can delete it any time from this screen. |
| `bk.consent.lost` | If you lose this phone, you need your password or your recovery answers to get your data back. |
| `bk.consent.tick` | I understand and agree. |
| `bk.consent.go` | I agree and continue |
R3 recovery questions:
| Key | Text |
|---|---|
| `bk.q.h` | Recovery answers |
| `bk.q.warn` | If you forget your password and lose this phone, these answers are the only way back. They are checked by a person, and never stored on this phone. |
| `bk.q.p1` | AWAIT-ADMIN (prompt `p1`, Admin DATA_MODEL F9.4) |
| `bk.q.p2` | AWAIT-ADMIN (prompt `p2`, Admin DATA_MODEL F9.4) |
| `bk.q.save` | Save answers |
| `bk.q.short` | Write at least {n} characters. |
R4 show-once password:
| Key | Text |
|---|---|
| `bk.pw.h` | Your backup password |
| `bk.pw.once` | This is shown only once. Nothing can show it again. |
| `bk.pw.id` | Backup id: {id} |
| `bk.pw.user` | Username: {username} |
| `bk.pw.copy` | Copy |
| `bk.pw.share` | Share |
| `bk.pw.image` | Save as image |
| `bk.pw.copied` | Copied. |
| `bk.pw.tick` | I saved it. |
| `bk.pw.done` | Done |
| `bk.pw.warn` | Keep it somewhere safe. If you lose the password and this phone, only your recovery answers can help. |
R5 sign in:
| Key | Text |
|---|---|
| `bk.si.h` | Sign in to my backup |
| `bk.si.id` | Backup id or username |
| `bk.si.pw` | Password |
| `bk.si.go` | Sign in |
| `bk.si.forgot` | Forgot password? |
| `bk.si.first` | Already have a backup? Sign in |
| `bk.si.new` | No, start a new backup |
R6 restore:
| Key | Text |
|---|---|
| `bk.rs.h` | Restoring your data |
| `bk.rs.offer` | This phone has no workouts, but a backup exists. |
| `bk.rs.go` | Restore my data |
| `bk.rs.run` | Restoring {n} of {m} |
| `bk.rs.keep` | Keep this screen open. If it stops, open it again and it carries on. |
| `bk.rs.done` | Done. Your data is back on this phone. |
| `bk.rs.notback` | Progress photos and phone settings are not restored. |
| `bk.rs.wifi` | This is a big restore. Wi-Fi is better. |
| `bk.rs.other` | This phone holds another person's data. Save a backup file first, then start fresh. |
| `bk.rs.skip` | Skip this part |
| `bk.rs.partial` | {n} parts could not be read. Everything else is back. |
R7-R9 forgot password:
| Key | Text |
|---|---|
| `bk.fp.h` | Forgot password |
| `bk.fp.intro` | Tell us what you remember. A person at the gym checks it. This takes 1 to 2 days. |
| `bk.fp.id` | Backup id or username |
| `bk.fp.first` | Month you first trained |
| `bk.fp.last` | Month you last trained |
| `bk.fp.band` | About how many workouts |
| `bk.fp.band.0` | Fewer than 10 |
| `bk.fp.band.1` | 10 to 29 |
| `bk.fp.band.2` | 30 to 99 |
| `bk.fp.band.3` | 100 to 299 |
| `bk.fp.band.4` | 300 or more |
| `bk.fp.send` | Send request |
| `bk.fp.ticket` | Your request code: {code} |
| `bk.fp.keep` | Write this code down. You need it with your id to check the status. |
| `bk.fp.linked` | If this account belongs to a gym member, ask at the gym desk. |
| `bk.fp.st.cooling` | Waiting period. Ready after {date}. |
| `bk.fp.st.waiting` | Waiting for approval. |
| `bk.fp.st.approved` | Approved. Set your new password before {date}. |
| `bk.fp.st.denied` | Not approved. Ask at the gym desk. |
| `bk.fp.st.cancelled` | This request was cancelled. |
| `bk.fp.st.expired` | This request ran out. Start a new one. |
| `bk.fp.st.redeemed` | Done. Sign in with your new password. |
| `bk.fp.check` | Check again |
| `bk.fp.cancel` | Cancel request |
| `bk.fp.cancelq` | Someone asked to reset this password. Was it you? |
| `bk.fp.new.h` | Your new password |
| `bk.fp.new.go` | Set this password |
R10-R12 switching and deleting:
| Key | Text |
|---|---|
| `bk.sw.h` | Switch to free backup |
| `bk.sw.line` | You left your gym. Your data stays on this phone. A free backup keeps it safe. Your gym's copy is not touched. |
| `bk.sw.go` | Switch |
| `bk.sw.later` | Not now |
| `bk.mv.line` | Your backup will move to your gym. Your free backup is deleted afterwards. |
| `bk.mv.warn` | What you do not upload to the gym cannot be restored from it. |
| `bk.mv.consent` | Data on your gym's server can be read by the gym owner. |
| `bk.del.h` | Delete my backup |
| `bk.del.what` | This removes your login, your backup and your recovery answers from the server. Everything on this phone stays. |
| `bk.del.go` | Delete my backup |
| `bk.del.keep` | Keep it |
| `bk.del.done` | Your backup was deleted. |
Common buttons and offline:
| Key | Text |
|---|---|
| `bk.back` | Back |
| `bk.retry` | Try again |
| `bk.cancel` | Cancel |
| `bk.offline` | You are offline. Nothing was lost. Try again with internet. |

## P74-4. Error table for the new codes (the app branches on `code` and `retry_after`, never on message text)
| Code | Where | Words the user sees (key) | Behaviour |
|---|---|---|---|
| `SFE701` | R2 signup | none: the app regenerates the username and retries before showing anything; after 3 failed tries: "Something went wrong. Try again." (`bk.err.generic`) | silent retry |
| `SFE703` | any push | "Your backup is too big for this account." (`bk.err.big`) | stop, chunk stays dirty, line on R1 |
| `SFE704` | any push | "Your backup has too many parts. Ask at the gym desk." (`bk.err.keys`) | stop, same |
| `SFE705` | R2 signup | "New backups are paused. Try again later." (`bk.err.paused`) | stay on R2, nothing created |
| `SFE706` | push or `ingest` | "The backup was not saved because its file was not valid." (`bk.err.invalid`) | do not retry the same bytes; rebuild once; if it repeats show R13 `bk.state.attn` |
| `SFE707` | push, `ingest` or restore | "This backup was made by a newer app. Update the app." (`bk.err.newer`) | stop; R13 `bk.state.update` |
| `SFE708` | R7 | "Too many wrong answers. Try again in 24 hours." (`bk.err.locked`) | button disabled |
| `SFE709` | R8 cancel | "There is no open request." (`bk.err.noticket`) | back to R7 |
| `SFE710` | R9 | "This reset is not ready, has run out, or was already used." (`bk.err.notready`) | back to R8 |
| `SFE001` | R2, R3, R7, R9 | "Check the highlighted boxes." (`bk.err.fields`) | mark fields from `fields` |
| `SFE004` | all | existing: "Too many tries. Wait {retry_after} seconds." | button disabled |
| `SFE006` | all free functions | "This app is not allowed to use the backup yet." (`bk.err.origin`) | stay |
| `SFE101` | R5, R7, R8 | "That id or password is not right." (`bk.err.id`) | identical for unknown and known (no hint) |
| `SFE103` | R9 | existing: "Use 10 to 72 characters with a letter and a number." (a generated password always passes; shown only if the server changes the rule) | - |
| `SFE201` | signed-in calls | "Your backup sign-in ended. Sign in again." (`bk.err.auth`) | route to R5; backups wait |
| `SFE501` | R2 | "Please tick the box to agree." (`bk.err.consent`) | stay |
| `SFE002` | any | "You are not allowed to do that." (`bk.err.denied`) | stay |
| any other `SFE###` | any | the server's `message`; if absent: `bk.err.generic` "Something went wrong and nothing was changed." | - |
| offline | any | `bk.offline` | queue nothing for credential screens; pushes wait |
`SFE702` is reserved. `SFE601` keeps its Admin meaning and never appears here.

## P74-5. Feature keys (contract 1.1.0 added three; they are in `contract/features.catalogue.json`, nothing is added to it here)
| Key | Default | Needs connection | Admin lockable | Gates |
|---|---|---|---|---|
| `cloud_backup` | off | no | yes | R1, R6, R11, R12, every chunk push and pull. Off = no chunk code runs and R1 shows only the standalone line. (Gym can turn it on or lock it through policy once connected; standalone default off until Phase 78 decides to enable it for opt-in, see [A-P74.1].) |
| `free_account` | off | no | no | R2-R5, R7-R10. Never locked by a gym (a free account is not the gym's). |
| `auto_restore` | on | yes | yes | R6 starts by itself after sign-in; off = the Phase 73 button. |
Routes are registered with these keys (table P74-1). The Phase 73 route `/gym/restore` keeps `feature: null` [A-P73.6].

## P74-6. Needs from the owner (never invented; placeholders until supplied)
Free shard list (id, URL, anon key) for the app build and the core `functions` URL (Q-SHARD); consent wording check (Q-LAW); the two recovery prompts (copied from Admin `DATA_MODEL.md` F9.4 in Phase 79); retention days (A-R6). Build-time names are [A-P74.2].

## P74-7. Assumptions [A]
- [A-P74.1] `cloud_backup` and `free_account` ship `default:false` in the catalogue. The app turns them on in the standalone build when Phase 78 lands (a build default, not a catalogue change). Until then R1 is not reachable.
- [A-P74.2] The free shard list and the core functions URL come from build-time variables `VITE_FREE_SHARDS` (JSON array of `{id,url,anonKey}`) and `VITE_CORE_FUNCTIONS_URL`. Not in the contract; empty = free backup hidden.
- [A-P74.3] Routes live under `/settings/backup`; `/gym/restore` is kept for compatibility.
- [A-P74.4] Recovery questions are two fixed prompts (`p1`, `p2`), as the contract's `free-recovery-set` shape says; the facts for a reset (`first_month`, `last_month`, `sessions_band`) are typed from memory on R7.
- [A-P74.5] `consent_version` is the integer 1 until the owner changes the wording; the constant lives with the consent screen.
- [A-P74.6] String text above is draft English; the owner may reword any of it without changing a key.
