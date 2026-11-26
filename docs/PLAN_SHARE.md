# PLAN_SHARE (PS) — share your plan by QR, link or code

Spec of record: `contract/plan-share.md` (crypto, envelope, relay API). This is the UX guide.

## The promise
Tap **Share plan** -> show QR / link / code -> the other person scans within **3 minutes** -> their phone gets your plan and the relay **deletes it immediately**. Nothing is kept. Not received in 3 minutes -> deleted anyway. The relay only ever holds an encrypted blob; the key lives in the QR/link/code, never on any server.

## Sender
1. Routine page -> **Share plan**. Choose which routine (default: the active one); optional name and short note.
2. The screen shows a big QR, the link and the typed code, plus a 3:00 countdown. "Waiting..." changes to **Delivered** when the relay has handed it over.
3. Cancel any time (deletes it). At 0:00 it says Expired with a **Share again** button (new code every time).
What is sent: the routine (days, exercises, sets/reps, setups, schedule, split label) and only the custom exercises it uses. **Never sent:** history, PRs, body stats, marks, photos, favourites, notes, anything about you.

## Receiver
Scan with the in-app scanner, open the link, or type the code on `/share`. A **preview** appears first: plan name, days, exercises, schedule, sender name and note, and flags ("2 exercises are not in your library", "3 custom exercises will be added", "1 exercise is hidden by your gym"). Then **Add as new routine** (default) or **Add and make active**. It never overwrites a routine you already have.

## Failure screens (plain words)
- "This share was already received or timed out. Ask them to share again."
- "No internet. Sharing needs a connection for a moment."
- "This code doesn't look right." (typo; shows the typed value so it can be corrected)
- "This plan was made with a newer version of the app. Update and try again."
- "Sharing isn't set up on this app yet." (no relay configured; the Share button is hidden)

## Rules
1. Network only on tap; nothing in the background.
2. The secret is never sent to any server (assert in tests).
3. One-time: a second scan always fails.
4. Everything shown from the envelope is text (no HTML), lengths limited.
5. Gym can lock the feature off (`plan_share`).
6. Offline-friendly alternative later: export plan as a file (not in scope now).

## Relay
Connected to a gym: the gym's functions URL. Standalone: the build-time default relay (`VITE_SHARE_RELAY_URL`, `VITE_SHARE_RELAY_ANON`) set by the owner once. Neither -> feature hidden.
