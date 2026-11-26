# Owner checklist: recovery release 1.1.0 ("never lose a workout")

Written in Phase 81 (gate). **Nothing here was run by Claude against a real Supabase, a real free shard, a real gym, a phone or iOS Safari.** Every item is yours to tick on a real phone. Stop at the first failure and send me the exact sentence the app shows (never a key or a password). Admin has its own list for the server side: `OWNER_CHECKLIST_1.1.0.md` in the Admin zip. Do the Admin one's section A (setup) first.

## READ FIRST: known limits
1. **Everything below ran only against fakes** (fake network, fake IndexedDB). The chunk columns, the Storage routes, the free function shapes and the real restore have never touched a real server.
2. **Free backup is hidden until the build carries `VITE_FREE_SHARDS`, `VITE_CORE_FUNCTIONS_URL` and `VITE_CORE_ANON_KEY`** (public URLs and anon keys only). Without them sections C to G show nothing. Set them as GitHub repository variables before tagging.
3. **`cloud_backup` ships OFF for gym members** until the gym's policy turns it on in Admin. Section B needs it on.
4. **The two recovery question wordings are placeholders** (`bk.q.p1`, `bk.q.p2` in `src/i18n/en.ts`). Send me the real ones.
5. **A signed-in old phone is not told about a reset requested elsewhere** ([A-P79.2]). It only learns if it holds the ticket code.
6. **A restored workout from table rows loses item-level detail**; the chunk restore is the full one.
7. **The build has never been run.** A red "Deploy" on the `v1.1.0` tag is possible; send me the error lines.
8. The 3D atlas, camera scan and iOS file handling are unchanged since 1.0.0 and still unchecked on a real phone.

## A. Setup
- [ ] A1. Admin zip's section A done (SQL on Shard A and each free shard, secrets, functions deployed).
- [ ] A2. GitHub repository variables set: `VITE_FREE_SHARDS` (JSON list of `{id, url, anonKey}`, ids like `F1`), `VITE_CORE_FUNCTIONS_URL`, `VITE_CORE_ANON_KEY`.
- [ ] A3. **Copy this zip's whole `contract/` folder into the Admin zip** (replace it). In BOTH zips run `sha256sum -c contract/CHECKSUMS.txt`: only OK lines, and the two `CHECKSUMS.txt` files are byte-identical (137 files). Until then the Admin zip has 71 files and 3 shared files (`CONTRACT.md`, `engines.md`, `dataset/DATASET_GUIDE.md`) differ by User-only additions.
- [ ] A4. Tag `v1.1.0`, green "Deploy" run. On the phone, open the app twice: it shows 1.1.0.
- [ ] A5. In Admin, turn `cloud_backup` on for the gym (needed for B and G).

## B. Wipe a phone and restore (gym member)
- [ ] B1. Connected phone, signed in, with a few workouts and a routine. Settings -> Data and backup shows a "Last backed up" time.
- [ ] B2. Clear this site's data in the browser. Open the app, pass the install gate, sign in. Your workouts return, newest months first, with an "n of m" line.
- [ ] B3. Everything is back: routines, history, custom exercises, body stats, goals. Note anything missing (a restored session from rows only has its sets, not its skipped or swapped items).
- [ ] B4. On the phone with no gym, Gym -> Restore my data: works the same.

## C. Finish a session offline, then sync
- [ ] C1. Airplane mode. Log a workout with 3 sets and finish it.
- [ ] C2. Turn the internet back on. The backup line moves from "waiting" to "Last backed up" without you pressing anything.
- [ ] C3. Wipe and restore (B2) and the offline workout is there.

## D. Kill the app in the middle of a restore
- [ ] D1. Start a restore on a wiped phone with a large history. Swipe the app away halfway.
- [ ] D2. Open it again: the restore resumes (or offers "Try again"), no duplicate workouts, nothing lost.
- [ ] D3. A restore must never push an empty phone over a full backup: after D2 check the backup still holds your history (restore once more on a second wiped phone).

## E. Free sign-up and reinstall (no gym)
- [ ] E1. Settings -> Backup -> create a free account. Read the consent; it names what is kept and for how long. You get a username, a free id (`FR1-XXXXX`) and a password shown once. Save them.
- [ ] E2. Set the two recovery answers (R3). Copy, share or save-as-image of the credentials works on your phone (iOS Safari too).
- [ ] E3. Log workouts; the backup line shows a time.
- [ ] E4. Delete the app (or clear site data), install again, Backup -> Sign in with the free id or username and the password. Your data returns.
- [ ] E5. Try a wrong password a few times: a plain sentence, then a wait message. No technical code.
- [ ] E6. Delete my backup (R5): confirm; the account and its copy are gone and the phone keeps its data.

## F. Forgot password with admin approval
- [ ] F1. Signed out, Backup -> Forgot password: free id or username plus the two answers. You get a **ticket code** and a "ready after" time. Write the code down.
- [ ] F2. A wrong answer gives the same kind of reply (it must not reveal whether the account exists).
- [ ] F3. Admin (owner) -> More -> Reset requests: the ticket shows as cooling off. After the wait it is Ready: Approve.
- [ ] F4. Back in the app, Request status with the code: it says approved. Redeem: a NEW password is made on the phone and shown once. Tick "I saved it" before "Set this password".
- [ ] F5. Sign in with the new password. The old password and any old signed-in phone no longer work.
- [ ] F6. A second request, then Deny in Admin: the app says it was denied.
- [ ] F7. Cancel a request from the app while it is cooling off.
- [ ] F8. A free account that belongs to a gym member: the app says to ask at the gym desk.

## G. Free to gym
- [ ] G1. A phone on free backup with history. Connect a gym (Settings -> Gym -> Add a gym), sign in as a test member, change the password.
- [ ] G2. On the Gym home, read "Move my backup to my gym". Tap it. The move runs; the Gym shows the member code and the old free id is kept on the Backup page.
- [ ] G3. After the first gym backup the **free account is deleted** (Backup page shows no free account). If the delete fails both copies exist and the next sync retries; note what you saw.
- [ ] G4. On a phone whose rows belong to someone else, "Is this your data?" appears. Answer No: nothing is sent, nothing is restamped.
- [ ] G5. Kill the app in the middle of the move: reopen, it resumes or rolls back to free backup, never both lost.
- [ ] G6. Disconnect the gym: the app offers "Switch to free backup" with fresh consent.
- [ ] G7. A new phone with both: it restores from the free copy first.

## H. Two phones
- [ ] H1. Phone 1 and phone 2 signed in to the same account. Log a workout on 1, let it back up. On 2, open the app: after a sync the workout appears (merged, not duplicated).
- [ ] H2. Log different workouts on both while one is offline. Sync both: both workouts exist on both phones.
- [ ] H3. Delete a routine on phone 1, then sync phone 2: note what happens (the rules are in `docs/RECOVERY_PLAN.md`).
- [ ] H4. A third phone, wiped, signs in: it gets the full merged history.

## I. Phone look (once)
- [ ] I1. Backup, Consent, Password, Sign in, Questions, Forgot, Status, Redeem, Delete, Switch and Restore screens: nothing slides sideways, no text cut off, the bottom bar never covers a button, at your phone's width.
- [ ] I2. Words: read the `bk.*` strings. Tell me any you dislike (keys stay).

## What Phase 81 did and did not check
Did: typecheck once (clean); `tests/guard.test.ts` (37 pass); `contract/CHECKSUMS.txt` all OK in each zip; one overflow audit of 15 pages (the 11 backup and restore routes, Gym, Gym connection, Data) at 320, 360 and 390 px with free backup switched on by dummy build values and the network blocked: no sideways scroll, no page error. Version 1.1.0.
Did NOT: full suite, any suite named in the Phase 73 to 80 gaps (`gymSync`, `freeAccount`, `restore`, `backupRestore`, `localStore`), build, Lighthouse, any real server or phone, the signed-in, running, failed and done states of the new screens (the audit saw each route signed out or empty), tap targets (only sideways overflow was measured).
