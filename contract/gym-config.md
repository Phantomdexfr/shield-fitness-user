# GYM CONFIG — how a User app connects to a gym (no code change, ever)

A gym is described by one small PUBLIC document, `SFCFG1`. The Admin app generates it (Admin Phase 35) as a QR code, a link and a copyable text. The User app consumes it (User Phase 63).

```jsonc
{
  "v": 1,
  "name": "Shield Fitness",
  "contract": "1.0",                  // major.minor the gym speaks
  "core":  { "url": "https://<project>.supabase.co", "anon": "<public anon key>" },
  "train": [ { "id": "B", "url": "https://<project>.supabase.co", "anon": "<public anon key>" } ],
  "functions": "https://<project>.supabase.co/functions/v1",
  "issued": "2026-11-17"
}
```
Encoded as `SFCFG1.` + base64url(JSON). Delivered as: QR text, a link `https://<user-app-origin>/connect#SFCFG1.<payload>` (fragment, so it never hits a server), or pasted text. **Only public values are ever in it** (URLs and anon keys). Service keys never.

## Connect flow (User app)
1. User opens Settings -> Gym connection -> Scan QR / paste code (or opens the link).
2. App validates: version `v:1`, hosts end in `.supabase.co`, contract major matches.
3. App shows a confirm screen: gym name + the project host. Nothing is sent yet.
4. On confirm: store config, fetch `gym_settings.contract_version` + `policy`, switch to connected mode, show Login (credentials are issued by the gym's admin).
5. Existing standalone data stays on the device; after first login the user is asked once whether to upload their history to the gym account (default: yes, can say no).

## Disconnect
Settings -> Gym connection -> Disconnect: forget config + session, return to standalone, keep all local data. Gym-only data (membership, announcements) is removed from the screen, not from the gym.

## Safety rules
- A scanned config is untrusted: show the host, require confirmation, never auto-connect, never follow any URL in it except the three listed endpoints.
- Optional build-time allow-list `ALLOWED_GYM_HOSTS` in the User app (empty = allow any `.supabase.co`). The owner may fill it to pin to his own projects.
- A locked-out or paused project shows plain words ("Your gym's server is asleep, try later") and the app keeps working locally.
