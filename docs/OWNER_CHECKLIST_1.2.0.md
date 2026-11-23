# Owner checklist: native feel and calmer UI release 1.2.0

Written in Phase 88 (gate). **Nothing here was run by Claude on a phone, on iOS Safari, or against a real server.** Every item is yours to tick on a real phone. Stop at the first failure and send me the screen name and a screenshot (never a key or a password). No Admin zip step is needed: `contract/` did not change in Milestone 11.

## READ FIRST: known limits
1. The look of every screen was seen only in headless Chromium at 390x844 and 360x800. No phone, no iOS Safari.
2. `npm run build` was run in the sandbox in Phase 90 and passed. A red "Deploy" on GitHub is still possible; send me the error lines.
3. Share and Receive (plan sharing) use `share_*` functions that nobody has ever called for real. Section C needs two phones.
4. The 1.1.0 checklist (`OWNER_CHECKLIST_1.1.0.md`) is still pending; this list does not replace it.

## A. Ship
- [ ] A1. Push, tag `v1.2.0`, green "Deploy" run.
- [ ] A2. Open the app on the phone twice. Settings -> About shows 1.2.0.

## B. Zoom lock and first screen
- [ ] B1. Pinch with two fingers on Today, a routine and the Library: the page does not zoom (iPhone and Android).
- [ ] B2. Tap a text box (Settings -> Account name): the page does not jump or zoom in.
- [ ] B3. Pull down at the top of any page: no rubber-band bounce.

## C. Plan sharing (two phones)
- [ ] C1. A routine card and the routine page both show Share. Today and Train show Receive or Scan.
- [ ] C2. Phone 1 shares a routine; phone 2 receives it and it appears in Routines. Send me the exact words if it fails.

## D. Buttons and controls
- [ ] D1. Every screen has at most ONE solid gold button. No bare-text buttons: Cancel and Skip look like outlined buttons.
- [ ] D2. A setting with 4 or more options is a row with a chevron that opens a list. 2 options is a small toggle, on/off is a switch with a gold track.
- [ ] D3. Number rows (height, weight, rest seconds) open a stepper sheet; the value only changes when you tap Done.

## E. Calendar picker
- [ ] E1. Settings -> Account -> Date of birth opens a sheet with Month and Year dropdowns, Monday first. Pick a day, tap Set: the row shows it. Cancel changes nothing.
- [ ] E2. A goal deadline, the schedule start and the heatmap range use the same picker. No phone keyboard or native date wheel appears anywhere.
- [ ] E3. Pick 31 Jan, then change month to Feb: the day becomes 28 or 29.

## F. Welcome flow (new install or Settings -> re-run)
- [ ] F1. Fresh install: name, date of birth, about you (figure changes when you pick Female), training level, backup choice. Each step has Skip for now.
- [ ] F2. Close the app on step 3, reopen: it resumes on step 3. After finishing it does not show again.
- [ ] F3. Settings can re-run it. Height, birth date and sex are still there afterwards.
- [ ] F4. Gym member: scan the gym code in the last step; the flow ends and you are connected.

## G. Calmer screens
- [ ] G1. Today: header, one workout card, week strip, Quick grid, nothing else. Only one notice at a time.
- [ ] G2. A live workout: the current exercise and the set logger are open; notes, history and setup are closed bars. Log a set, check it saves.
- [ ] G3. Exercise page, Machine page, Body, Heatmap, Progress, Goals, Gym, Settings: the first block is open, the rest are closed bars with a short summary and a chevron. Tapping opens and closes with no jump.
- [ ] G4. Close a bar, leave the page and come back: it stays closed (remembered). On a page with 4+ bars a "Collapse all" link appears.
- [ ] G5. Nothing is cut off with "..." and nothing runs off the right edge on a small phone.

## H. Body figure follows the profile
- [ ] H1. Profile sex Female: Heatmap, Marks, Recovery, Muscle lab and the body pickers all show the female figure.
- [ ] H2. "Switch figure" on a page changes only that page; the profile is unchanged.

## I. Screen reader (once, optional)
- [ ] I1. TalkBack or VoiceOver: icon-only buttons read a name (back, close, plus, minus). Bars read "expanded" or "collapsed". Sheets read as dialogs.

## J. Install button and About (Phase 89)
- [ ] J1. Android Chrome, site not installed: gold Install app button opens Android's install dialog; after Install, open Shields from the home screen.
- [ ] J2. Android Samsung Internet or Firefox: the button shows the menu steps (three dots, Install app).
- [ ] J3. Settings -> About: name, version, Made by with Ankit Shukla in bold, email opens your mail app, nothing cut off.

## What Phase 88 did and did not check
Did: typecheck once (clean); `tests/guard/release120.test.ts` (version, viewport lock, no native date, no ghost, figure from profile, collapsible sections, icon-button labels, sheet dialog role) and `tests/guard.test.ts`.
Did NOT: full suite, build, Lighthouse, any phone, iOS Safari, any real server, a fresh browser overflow audit (the 360 px checks of Phases 83-87 stand; nothing visual changed in this phase).

## Phase 91: Anatomy View
- [ ] Body > Muscle Lab > Anatomy View loads (first time about 9 MB) and tapping a part opens its Info.
- [ ] Holo Lab (/atlas): tapping a muscle keeps the info sheet open.
