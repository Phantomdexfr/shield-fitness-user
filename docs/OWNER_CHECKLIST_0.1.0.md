# Owner checklist: standalone release 0.1.0

Do these on a real phone after the GitHub build is live. Tick each one. Write what went wrong next to any you cannot tick.

## 1. Install gate
- [ ] iPhone (Safari): open the link, see only the install screen, follow "Add to Home Screen", open from the home icon: the app opens.
- [ ] Android (Chrome): open the link, see only the install screen, install, open from the home icon: the app opens.
- [ ] Opening the link in the browser again (not the icon) still shows only the install screen.

## 2. Offline workout
- [ ] Open the app once with internet, then turn on airplane mode.
- [ ] Start a free workout, add two exercises, log three sets. Close the app fully, open it again: the sets are still there.
- [ ] Finish the workout offline. Open History: the session is listed with its sets.
- [ ] Turn the internet back on: nothing changes or disappears.

## 3. Tap a muscle
- [ ] Body tab: tap a muscle on the body. You see exercises for it. Tap front/back and a second muscle.
- [ ] Muscle page opens (`/muscle/...`) and Back works.

## 4. Routine builder
- [ ] Make a routine with 3 days. Open each day, add exercises, reorder, remove one.
- [ ] Make a routine with 5 days. Make one with 6 days. All days show, nothing is cut off.
- [ ] Start a day from a routine, then add an exercise that is not in the day: it is allowed.

## 5. Skip with swap
- [ ] During a workout skip an exercise and pick a swap. The swap is logged, the skipped one stays in the record as skipped.
- [ ] Skip with the "why" question on, then turn it off in Settings -> Workout flow and skip again.

## 6. Heatmap
- [ ] After two or three workouts open Heatmap: trained muscles are coloured. Switch Week / Month / All time.

## 7. Atlas on a mid-range phone
- [ ] Open Atlas (3D). It loads, turns smoothly enough, a muscle can be picked, the panel shows its daily-life facts.
- [ ] If it is slow or hot, say which phone. The 2D fallback should still work.

## 8. Photos
- [ ] Machine photos show in the library and on a machine page, in a fixed frame, nothing stretched.
- [ ] Progress photos: add one. Then check Settings -> Privacy says photos stay on the phone.

## 9. Backup and restore
- [ ] Settings -> Data and backup -> Save backup file. On iPhone check where the file went (Files app or a share sheet).
- [ ] Choose backup file with that same file: it says what was added / already here.
- [ ] (Optional, on a spare phone or after saving the backup) Wipe all data, type DELETE: the app restarts empty. Restore the backup: your workouts are back.

## 10. Settings sub-pages
- [ ] Settings lists 12 groups. Open every one and press Back each time.
- [ ] Change units, rest time, Motion, Density: they stay after closing the app.
- [ ] About shows your text and email. Credits shows your name and the licence list.
- [ ] Gym connection says Standalone and "Add a gym" is greyed out.
- [ ] Reminders: you can pick days and time. (They do not pop up yet: expected.)

## 11. Update
- [ ] After a later build is live, open the app: it offers "Update ready" and reloads to the new version.

## Known and expected in 0.1.0
- Reminders only save your choice; no notification appears.
- Gym connection is a placeholder until 0.2.0.
- Atlas wording is not yet reviewed by a physio (see PHASE_STATUS, Awaiting from owner).
