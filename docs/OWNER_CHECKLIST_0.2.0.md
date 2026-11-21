# Owner checklist: connected release 0.2.0

Do these on a real phone after the GitHub build is live **and** the Admin app is deployed. Tick each one. Write what went wrong next to any you cannot tick. Nothing in the connected half has ever run against a real Supabase, so the first real run is yours: if a step fails, copy the exact sentence the app shows and send it back.

## 0. Before you start
- [ ] The Admin app is deployed and you can sign in to it.
- [ ] In Admin, make a **test member** (not a real one) with a member code and a first password. Note the code.
- [ ] In Admin, get the gym's connect code (the QR and the pasteable text).
- [ ] 0.1.0 checklist items 1 to 3 are done (install gate, offline workout, tap a muscle). Do at least one workout **before** connecting, so there is history to keep and to upload.

## 1. Connect by QR
- [ ] Me -> Settings -> Gym connection -> Add a gym -> Scan. Point the camera at the gym QR. You see the gym name and the big host name on the confirm screen. Nothing is stored yet.
- [ ] Press Cancel, then do it again with **Paste** and the pasteable text. Same confirm screen.
- [ ] Open the QR link in the phone's browser (not the app icon). Note what happens: the install screen may appear and the code may be lost. That is expected; scan or paste again from inside the installed app.
- [ ] Paste a wrong text (for example a normal sentence): a plain sentence says it is not a gym code. Nothing breaks.
- [ ] Press Connect. The app reaches the gym and goes to Sign in.

## 2. Sign in and forced password change
- [ ] Sign in with the test member code and first password.
- [ ] The app forces **Change password** before anything else. Try a weak password: a plain sentence refuses it. Set a good one.
- [ ] After the change you land on the gym home. Sign out is not needed; close the app fully and open it again: you are still signed in.
- [ ] Wrong password once: one plain sentence, no technical code. Wrong several times: a wait message with a countdown.

## 3. Membership, QR, attendance, inbox, requests
- [ ] Gym home lists the areas the gym has switched on. Membership shows the plan, the end date and days left.
- [ ] Show the member **QR** at the desk. Turn on airplane mode and open the QR again: it still draws. **Ask staff to scan it with the Admin app.** If Admin refuses it, the QR format needs agreeing (PHASE_STATUS, A-P68.2). Write what Admin said.
- [ ] Attendance: the calendar, the streak and the 30-day count look right after the desk has checked you in.
- [ ] In Admin send an announcement and a message to the test member. Pull to Refresh: both appear. Mark the message read.
- [ ] Send a request (for example a locker request). It shows **Waiting to send** if offline and **Sent** once back online. Open Admin and see it arrive.

## 4. Offline, then sync
- [ ] While connected and signed in, turn on airplane mode. Log a workout with three sets and finish it.
- [ ] Settings -> Gym -> Sync: the waiting count is 1 or more. The chip on Today says Offline.
- [ ] Turn the internet back on. Press Sync now (or wait). The count goes to 0 and the chip says Synced.
- [ ] Open Admin: the workout is on the member's record. **If a push is refused** the Sync screen shows "Could not be saved" with a reason: send me that sentence (the server column names are still guesses, see PHASE_STATUS, A-P67.1).
- [ ] Nothing on the phone disappeared when you synced.

## 5. A locked feature shows "Set by your gym"
- [ ] In Admin lock one feature that has a Settings row (for example the intensity dial, the smart rest timer or the heatmap), then press Refresh on the phone.
- [ ] Settings shows that row with the words **Set by your gym** and no control to change it.
- [ ] Note which value the row shows. It may show your own saved value instead of the gym's forced one: that is a known gap, write what you see.
- [ ] Unlock it in Admin, refresh: the control comes back and your own saved value is untouched.
- [ ] Turn a whole feature off in Admin (for example Inbox), refresh: its row disappears from the gym home.

## 6. Hide an exercise from Admin and see it vanish
- [ ] Note one exercise that shows in the Library and in a routine.
- [ ] In Admin hide that exercise. Refresh the phone.
- [ ] It is gone from Library search, from suggestions and from swap lists. Your own `my-` exercises are never hidden by the gym.
- [ ] An old workout that used it still opens in History. (There is no "Hidden by your gym" tag yet: expected.)
- [ ] Un-hide it in Admin, refresh: it is back.
- [ ] In Admin mark a machine **out of order**. The machine page and the Library card show the badge, and suggestions skip exercises that only that machine can do (not checked in the sandbox: write what you see).

## 7. Gym programs
- [ ] In Admin publish a program and assign it to the test member. Refresh: Routines shows **From your gym** with the program.
- [ ] Follow it: it appears as a routine with a note that it is read-only; Today and the week view use it. Start a day from it.
- [ ] Copy to mine: you get an editable routine. Edit it. The followed one stays as it was.
- [ ] Ignore a second program: it leaves the list.
- [ ] Change the program in Admin, refresh: the followed days are replaced. (No "Updated by your gym" note yet: expected.)
- [ ] Unpublish the followed program in Admin: it moves to **Ended by your gym** with Keep a copy.
- [ ] An item whose exercise your gym hid has no "Not available / Swap" tag yet: expected.

## 8. Propose to the gym and upload your history
- [ ] Make your own exercise. Open it and press **Propose to gym**. In Admin, check it arrived as proposed. (Needs the Admin side to agree the row, see PHASE_STATUS, A-P69.2.)
- [ ] Settings -> Gym shows an upload row. Open it (S10) and choose Upload. Progress counts up to the total. Close the app in the middle and press Resume: the count continues and nothing is doubled in Admin.
- [ ] Try Not now: it asks again after about a week, at most 3 times. Try Never on a second test: it stops asking.
- [ ] Progress photos and settings are **not** uploaded (check Admin has no photos).

## 9. Disconnect returns to standalone, data kept
- [ ] With a workout waiting to sync, open Settings -> Gym -> Disconnect. The screen tells you how many changes are still waiting.
- [ ] Confirm. The app says Standalone. Every workout, routine, body reading and photo is still there.
- [ ] A followed gym program is now an ordinary editable routine (the app does not ask first: PHASE_STATUS, A-P69.3).
- [ ] Gym home shows "not connected" with a Connect button. The Library shows every exercise again.
- [ ] Connect again with the same code and sign in: it works, and your history is not asked to upload twice.

## 10. Standalone still works with no gym
- [ ] On a second phone (or after Disconnect), the whole of the 0.1.0 checklist still passes. Nothing asks for a login or a network.

## Known and expected in 0.2.0
- Nothing here has been proven against a real Supabase. All table and column names for the six gym reads, the four program tables, the proposal row and the request row are guesses; a wrong one makes that one screen show its last saved copy and says how old it is.
- The member QR format (`SF1:<CODE>:<CRC>`) was chosen on this side; Admin must read the same rule.
- A new phone does **not** get old data back from the gym (personal tables are pushed, not pulled).
- No payments list, no Join this gym screen, no forgot-password flow (only a request), no unread badge on the Me tab.
- Personal records and XP are not uploaded.
- Reminders still only save your choice.
- Atlas wording is still not reviewed by a physio.
