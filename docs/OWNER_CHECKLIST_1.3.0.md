# Owner checklist: Premium UI release 1.3.0

Written in Phase 111 (gate). **Nothing here was run by Claude on a phone or on iOS Safari.** Every item is yours to tick on a real iPhone AND a real Android phone. Stop at the first failure and send me the screen name, the phone, and what you saw.

## READ FIRST: known limits
1. Every screen was seen only in headless Chromium (dev server). No phone, no iPhone Safari. No build was run in the sandbox; the build happens on GitHub, so a red "Deploy" is still possible (send me the error lines).
2. Plan sharing, gym connection and cloud backup were not re-tested in Milestone 12 (the older checklists `OWNER_CHECKLIST_1.1.0.md` and `1.2.0.md` are still pending where you have not ticked them).
3. Premium is the default for everyone. Classic (the 1.2.0 look) is still in the app and is chosen in Settings -> Appearance -> Interface style.

## A. Ship
- [ ] A1. Push, tag `v1.3.0`, green "Deploy" run (see `GITHUB_UPDATE_PUSH.md`).
- [ ] A2. Open the app twice (the first open installs the update). Settings -> About shows 1.3.0.

## B. Upgrade from 1.2.0 lands on Premium
- [ ] B1. On a phone that already has 1.2.0 with your data, update. Today opens in the Premium look (gold hero card, frosted tab bar), with all your routines, history and settings still there.
- [ ] B2. Settings -> Appearance -> Interface style says **Premium**.

## C. Switch Premium / Classic live
- [ ] C1. Settings -> Appearance -> Interface style -> **Classic**. Go back to Today, Me, Library, Train: each looks like 1.2.0. Nothing is missing.
- [ ] C2. Switch back to **Premium**. Switch one single switch off (for example Wheels): the master shows **Custom** and only that part changes.
- [ ] C3. There is NO "View" button on any page any more; the switches are only in Settings.

## D. The things only a real phone can show
- [ ] D1. **Wheels under a thumb:** log a set in a workout. Weight and reps are two wheels. Flick them: do they feel smooth, snap to a value, and is the number easy to land on? Switch Wheels off in Settings: you get steppers.
- [ ] D2. **Frosted blur speed:** scroll Library and a long Progress page fast. The tab bar and the large title bar are frosted. Any stutter or lag? (Tell me the phone model if yes: low-end Android is the risk.)
- [ ] D3. **Vibration:** log a set, finish a rest timer, hit a PR. Settings -> Appearance -> Haptics on: you feel a tick. Off: nothing. (iPhone Safari gives no vibration; that is expected.)
- [ ] D4. **Swipe-back:** open an exercise from Library, swipe from the left edge. The page follows your finger and goes back. In a workout, swipe a logged set sideways: Undo appears.
- [ ] D5. **Install splash:** delete the app from the home screen and install again. While it loads you see the logo on the dark page, then the app. The status bar is dark, not white.
- [ ] D6. **Sheets:** open a sheet (Swap day, a filter). Drag it down: it follows the finger, bounces, closes. The calendar picker still works as before.
- [ ] D7. **Reduced motion:** Settings -> Appearance -> Motion -> Reduced: page slides, count-ups and the Start button sheen stop.

## E. Today
- [ ] E1. With a routine: date line, hero card, ring (0 of N), **Start workout** button, Swap day and Rest today, week strip, Next up (3 rows with a small body figure, "+N more"), Quick tiles.
- [ ] E2. **Is the Start workout button shiny enough?** (gold, liquid look, slow sheen moving across). Tell me "more", "less" or "good". Check it in daylight and at night, and whether it warms the phone (battery).
- [ ] E3. Log one set: the ring moves. Finish the workout: full ring with a tick, "Workout for today completed", no Next up.
- [ ] E4. Tap a Next up row: the exercise page opens.
- [ ] E5. With no routine (new profile or after deleting): a gold figure, one line, one **Make a routine** button, a small **Just start** link.

## F. Look at every main screen once, in Premium
- [ ] F1. Today, Body (figure first, tap a muscle: half-height sheet), Train, Library, Me, Settings: nothing is cut off at the right edge, no text hidden behind a "..." and no overlapping.
- [ ] F2. Exercise page, Progress, Records: the new layouts read well; photos of machines still show.
- [ ] F3. Rotate the phone to landscape on Today and a workout: nothing breaks (or tell me it does).

## G. What was checked in the sandbox (for your information only)
See `PHASE_STATUS.md` Phase 111 row: overflow audit in both styles at 320, 360, 390, 414 and 430 px wide, tap-target and button-name scan, guard tests, version 1.3.0. All on the dev server in headless Chromium.

## Known and expected
- iPhone Safari has no web vibration.
- The Start workout sheen and the frosted blur are not judged yet (D2, E2).
- Body "Figure first / List first" has no switch any more (it stays on Figure first).
- Pound step for a weight wheel is still waiting for you (see `PHASE_STATUS.md` Awaiting from owner, Phase 101).
