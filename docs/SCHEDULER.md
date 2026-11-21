# SCHEDULER (SC) — splits, days, rest days

Spec: `contract/engines.md` section 16.

## What the user can do
- Pick **any number of training days** (1-7) and any split label; presets (PPL, upper/lower, full body, bro, Arnold, PHUL, push/pull) only pre-fill days and can be edited freely.
- Pick **rest days** four ways: fixed weekdays; a repeating cycle (tiles T = train, A = active recovery, M = mobility, R = rest, length 2-14, e.g. TTR or TTTRTTR); every N days; "let recovery decide" (floating, with a max per week and a minimum rest gap).
- **A/B weeks** (different schedule on alternate weeks) and an optional **deload week** (sets x0.6, loads x0.9 suggested).
- **Missed day:** shift (default) or skip.
- **Rest-day hints** (on by default, Settings -> Schedule): on a training day, if most target muscles are still fatigued the app says so and offers train anyway / swap day / rest. Never blocks.
- Active-recovery and mobility days suggest a stretch/mobility/light-cardio set.

## Screens
Routine Builder step "Schedule" (compact, one question per card); Week/Cycle view on Home and Routine page; missed-day sheet; Settings -> Schedule (hints on/off, default missed-day behaviour, week starts on Monday/Sunday).

## Rules
No schedule is required; with none, the app behaves as "flexible, no fixed days": suggest the best day from recovery. Schedules never prevent starting any workout on any day.


## Phase 29 UX spec (frozen; Phase 32 builds exactly this)
Rules from `contract/engines.md` section 16 stay as written; this section adds screens, exact wording and worked examples. UI rules: `docs/design/UI_RULES.md` (no truncation, no expand cards, 44 px targets, nothing bleeds). Strings via `t('sc.*')`. Items marked [A] are my reading, not owner data. Weeks use Mon=0..Sun=6 in data; "week starts on" only changes display and where A/B weeks flip.

### Engine reading used by the examples (what Phase 32 implements)
1. **Which dates train.** The schedule only says which dates are *planned* (T), active recovery (A), mobility (M) or rest (R). Weekdays: chosen weekdays are T, others R. Cycle: `pattern[daysBetween(startDate, date) mod length]`. Every N: a date is T when it is N or more days after the last finished session (no session yet: today is T). Floating: decided by recovery (see ex. 6). A/B: the week containing `anchorDate` uses `weekA`, the next week `weekB`, and so on. No schedule: nothing is planned, the app suggests.
2. **Which Day.** The routine's days are a rotation with a pointer. `pointer` = (index of the last finished or skipped-by-choice Day) + 1, wrapping. A T date offers `days[pointer]`. Weekdays do not pick the Day; they only pick the date. **[A-P29.1]** This makes 4 days on 3 weekdays rotate across weeks (ex. 2).
3. **Missed day:** a planned T date earlier than today with no session and not yet decided. **Shift** (default): the pointer does not move, so the missed Day is offered at the next T date (or today, from the sheet) and the rest follow. **Skip:** the pointer moves past the missed Day. Nothing is ever deleted.
4. **Nothing blocks.** Any Day can be started on any date; "planned" only decides what the Today card shows first.
5. **Where extra data lives.** `Schedule` has no field for the A/B anchor or deload weeks. **[A-P29.2]** They are stored on the local routine document as `scheduleMeta: { anchorDate?: string; deloadWeeks: string[] }` (ISO date of each deload week's start) and ignored by anything that does not know them. **No `contract/` change is needed now.** If the owner wants these synced to the gym app, that is a later contract change (Phase 32 already creates the schedule fixtures; say so then).
6. **Dates** are IST gym days (`src/shared/dates.ts`); the engine takes `today` as a parameter, never reads a clock.

### Worked examples
Dates: Mon 2026-11-16, Tue 17, Wed 18, Thu 19, Fri 20, Sat 21, Sun 22, Mon 23. Days in a routine are `d0, d1, ...` in order.

**Ex. 1 Weekdays.** PPL (d0 Push, d1 Pull, d2 Legs), schedule `weekdays [0,2,4]`, nothing trained yet, pointer 0. Mon 16 Push, Wed 18 Pull, Fri 20 Legs; Thu 19 is R: Today card says "Rest day. Next: Legs on Fri." Mon 23 is Push again (pointer wrapped).

**Ex. 2 Weekdays, more days than weekdays.** 4 days (A, B, C, D), `weekdays [0,2,4]`. Week 1: Mon A, Wed B, Fri C. Week 2: Mon D, Wed A, Fri B. Rule: rotation, not tied to the weekday (section 16). The Week view shows the next 7 dates with their Day names so this is visible.

**Ex. 3 Cycle TTR.** PPL, `cycle ['T','T','R']`, `startDate 2026-11-16`. 16 T Push, 17 T Pull, 18 R, 19 T Legs, 20 T Push, 21 R, 22 T Pull. Asked on Thu 19: Legs. The cycle view shows the tiles `T T R T T R T` with today marked.

**Ex. 4 Cycle TTTRTTR (length 7) with 4 days.** `startDate 2026-11-16`, days A-D. 16 A, 17 B, 18 C, 19 R, 20 D, 21 A, 22 R, 23 B. (Length 7 does not make it a calendar week.) Length must be 2-14; at least one T is required, else "Add at least one training day" and Save is disabled.

**Ex. 5 Every 2 days.** `every_n n=2`, PPL. Last finished session: Pull on Tue 17. Wed 18: 1 day since, not due: "Rest day. Next: Legs on Thu." Thu 19: due, Today = Legs. If Legs is done Thu, the next due date is Sat 21 (Push). If Thu is missed, Fri 20 is still due (N or more days), no missed sheet is needed because "every N" has no fixed dates; the card simply keeps saying "Legs is due".

**Ex. 6 Let recovery decide (floating), `maxPerWeek 4, minRestDays 1`.**
 - *Before Phase 49 (`recoveryStates` empty):* fall back to rotation. Train if this week has fewer than 4 sessions AND at least 1 full day passed since the last one; the Day is `days[pointer]`. No readiness line and no rest-day hint is shown (hidden, not "unknown").
 - *With recovery data:* score each Day by the mean of its target muscles' state: fresh 3, ready 2, recovering 1, fatigued 0. Mon-Wed Push (chest ready, triceps ready) = 2.0, Pull (lats fatigued, biceps recovering) = 0.5, Legs (fresh) = 3.0 -> offer **Legs**, with the line "Your legs are the most recovered." Ties go to rotation order. If every Day scores below 1.0: "Everything is still recovering. A rest day is fine." plus the best Day as a choice. It never blocks.
 - *Week cap:* at 4 sessions this week: "That is 4 this week, your plan. Another is optional." Start stays enabled.

**Ex. 7 A/B weeks.** `weekA weekdays [0,2,4]`, `weekB weekdays [1,3]`, `anchorDate` Mon 16 Nov (week of 16 is A), PPL. Week of 16: Mon Push, Wed Pull, Fri Legs. Week of 23 (B): Tue 24 Push (pointer wrapped), Thu 26 Pull. Week of 30 (A) again. With week start Sunday, the A week of 16 begins Sun 15 and the flip is Sun 22. If `anchorDate` is missing the engine uses the date the schedule was saved.

**Ex. 8 Missed day: shift vs skip.** `weekdays [0,2,4]`, PPL, Mon 16 Push planned but no session. Tue 17 the user opens the app.
 - *Shift (default):* the missed-day sheet says "You missed Push on Mon." Do it today -> Today = Push (pointer unmoved until it is finished), then Wed Pull, Fri Legs. If the user ignores it, Wed shows Push (pointer still 0) and Fri Pull. Nothing lost.
 - *Skip:* "Skip it" moves the pointer: Wed Pull, Fri Legs. Push is still startable any time from the Week view; it is only no longer "planned".
 - *Dismissed sheet* = the Settings default applies silently.
 - *More than 3 planned days missed in a row* (a break): no stack of sheets; one "Welcome back" card: "Pick up where you left off: Push." (shift behaviour; the pointer is untouched).

**Ex. 9 Deload week.** Mark the week of Mon 23 Nov as deload (Week view menu). Suggestions that week use sets x0.6 (round, minimum 1) and loads x0.9 (`roundKg`, 2 dp): 4 sets -> 2, 3 -> 2, 5 -> 3, 2 -> 1, 1 -> 1; 100 kg -> 90, 82.5 kg -> 74.25. These are **suggestions only**: the logger pre-fills them and the user edits freely; the plan itself (sets in the routine) is not changed. A banner on Today and the logger says "Deload week: lighter on purpose." Unmark at any time; past deload weeks stay as a label in History.

**Ex. 10 Rest-day hint, thresholds.** Today = Push, target muscles chest, front_delts, side_delts, triceps (4). States: chest fatigued, triceps fatigued, front_delts recovering, side_delts ready -> 2 of 4 = 50% < 60%: **no hint**. Make front_delts fatigued too -> 3 of 4 = 75%: **hint**. A Day with 5 targets and 3 fatigued = 60%: **hint** (the rule is >= 60%). Fatigued here means `fatigued` in section 5 (< 50% of the recovery target). Day with no target muscles: never a hint. Recovery data absent: hint hidden.

**Ex. 11 Hint actions.** On the hint card: *Train anyway* hides the hint for today and starts the Day if tapped from Start; *Swap day* lists the other Days ranked by readiness (same scoring as ex. 6), tap one to make it today's (the pointer moves to it after it is finished; the original stays next); *Rest* marks today as a chosen rest day: it counts as **shift** for the pointer (nothing moves) and raises **no** missed-day sheet. The hint shows once per day; it never reappears after Train anyway.

**Ex. 12 Active recovery and mobility.** `cycle ['T','T','A','T','M','R']`. An A date offers "Active recovery": 2 to 3 light items from the dataset categories for stretch, mobility and light cardio (Phase 32 picks the exact category ids from the dataset; it does not invent them). An M date offers "Mobility": stretch/mobility items only. Neither advances the pointer; both are optional (Start is enabled, Skip is a quiet text button). Doing one logs a normal short session with no Day.

**Ex. 13 No schedule.** Routine with no `schedule`, but `weekdays [0,2,4]` (older shape): behaves as ex. 1. No weekdays and no schedule: "flexible". Today = the Day with the best readiness if recovery data exists, else `days[pointer]`; line "No plan today. Here is a good one." Home never shows a missed-day sheet in this mode (nothing was planned).

### Screens, controls and states
**SC1 Schedule step** (Routine Builder, after the days; also reachable from the Week view "Schedule" row). One question per card, Save always visible.
 - Card 1 "How do you want to plan it?" chips: *Fixed weekdays* · *Repeating cycle* · *Every N days* · *Let recovery decide* · *Alternate weeks (A/B)* · *No schedule*. Exactly one selected; default *No schedule*. Selecting another keeps the others' entries until Save (so a mis-tap loses nothing).
 - *Fixed weekdays*: Mon-Sun chips, multi-select, order per week-start setting. 0 selected is allowed and means no schedule. Quiet line when count differs from the days: "4 days on 3 weekdays. They take turns." (ex. 2).
 - *Repeating cycle*: length stepper 2-14 (default 3); one tile per position, tap cycles T -> A -> M -> R -> T (label and icon, not colour only); presets as chips: TTR, TTTRTTR, TR, TTRTR (fill tiles only, editable); start date field (default today). Save disabled with no T: "Add at least one training day". Wrapping tiles onto several rows is fine.
 - *Every N days*: stepper 1-14 (default 2). N=1 shows "Every day. Remember rest." as a quiet line.
 - *Let recovery decide*: "Most sessions per week" stepper 1-7 (default 4), "At least this many rest days between" stepper 0-3 (default 1). Below the card, until Phase 49 data exists: "Uses a simple rotation until your recovery data builds up." (not a warning).
 - *Alternate weeks*: two sub-cards "Week A" and "Week B", each offers Fixed weekdays or Repeating cycle only (no nesting); a start-date field for which week is A (default this week).
 - *Deload* row: "Deload weeks" list (empty: "None. Mark one from the week view."), Add button picks a week start date. Not required.
 - *Save*: enabled always except the cycle no-T case; saves `Schedule` (+ `scheduleMeta`). Leaving with changes: "Discard schedule changes?" Discard / Keep editing. Save error: "Could not save. Try again." fields kept.

**SC2 Week/Cycle view** (on `/routine/<id>` under the day grid, and a compact version on Home).
 - Shows the next 7 dates (weekdays/every N/floating/A-B) or the cycle tiles (cycle), each with the Day name or Rest / Active recovery / Mobility, today marked, planned-but-missed marked with a small dash.
 - Tap a date: opens that Day's sheet with **Start** (any Day, any date) and *Move here / Mark rest* (shift the plan for that date only, stored as a local override, ex. 11). Deload week shows a "Deload" chip; menu has *Mark this week as deload* / *Unmark*.
 - States: no schedule -> "No plan. The app suggests a day each time." + *Plan it* button (opens SC1); floating without data -> dates shown as "Open" with a "Rotation for now" note; empty routine (no Days) -> view hidden.

**SC3 Missed-day sheet** (opens at app start on Home, once per missed planned day, max one sheet shown per open).
 - Text "You missed <Day> on <weekday>." Buttons: **Do it today** (primary), **Skip it**, **Decide later**. The default from Settings is the primary one (Skip is primary if the Settings default is skip). Close or Decide later = the Settings default applies silently, and the sheet does not return for that day.
 - Not shown: no schedule, floating or every-N modes, rest hint off does not matter (separate), a day with any session at all, or after a "Welcome back" card (ex. 8).
 - Error: store write fails -> "Could not save your choice" + Try again; the sheet stays.

**SC4 Rest-day hint card** (Today card on Home and the Start sheet in `docs/ROUTINE_BUILDER.md` flow F).
 - Text: "These are still recovering: chest, triceps, front delts. Train anyway, swap the day, or rest?" (names wrap; at most 3 named, then "and 2 more"). Buttons: *Train anyway* · *Swap day* · *Rest*.
 - Hidden when: setting off, feature `rest_suggestions` locked off by the gym, no recovery data, the Day has no targets, below 60% fatigued, or the user already chose today. Never blocks Start. Active recovery/mobility days never show it.
 - *Swap day* opens a list (name, readiness line, Start). Empty (only one Day): "This is your only day" + Rest.

**SC5 Settings -> Schedule** (sub-page, `/settings/schedule`, feature `rest_scheduler`; hint switch is feature `rest_suggestions`).
 - *Rest-day hints* toggle (default on). Off hides SC4 only.
 - *When I miss a day*: Segmented *Do it later (shift)* / *Skip it*, default Shift.
 - *Week starts on*: Segmented Monday / Sunday, default Monday (display and A/B flip only).
 - *Deload scaling*: "Sets" stepper 40-100% step 5 (default 60), "Loads" stepper 70-100% step 5 (default 90); *Reset to defaults* text button (disabled when at defaults). **[A-P29.3]** Making these editable is my choice; the spec gave only the defaults.
 - Each control saves at once (no Save button); a toast "Saved" appears; errors "Could not save. Try again." and the control reverts.
 - When connected and a gym locks `rest_suggestions`, the toggle shows "Set by your gym" and is disabled; everything else stays editable.

**Today card (`today_card`, Phase 32) reading this spec:** planned Day, est. minutes, exercise count, one big Start. States: T date (Day + Start), A/M date ("Active recovery"/"Mobility" + Start + quiet Skip), R date ("Rest day. Next: <Day> on <weekday>." + Start another day), no schedule (best Day, "No plan today. Here is a good one."), no routine ("Make a routine, or just start" + both buttons), session in progress (Resume), deload week banner, rest hint SC4 above the Start button.

### Wording (`t('sc.*')`, final unless the owner edits)
Schedule · How do you want to plan it? · Fixed weekdays · Repeating cycle · Every N days · Let recovery decide · Alternate weeks (A/B) · No schedule · Week A · Week B · Train · Active recovery · Mobility · Rest · Add at least one training day · "4 days on 3 weekdays. They take turns." · Every day. Remember rest. · "Uses a simple rotation until your recovery data builds up." · Most sessions per week · At least this many rest days between · Deload weeks · "None. Mark one from the week view." · Mark this week as deload · Unmark · "Deload week: lighter on purpose." · No plan. The app suggests a day each time. · Plan it · Open · Rotation for now · "You missed <Day> on <weekday>." · Do it today · Skip it · Decide later · "Pick up where you left off: <Day>." · "These are still recovering: <muscles>. Train anyway, swap the day, or rest?" · Train anyway · Swap day · Rest · This is your only day · "Your legs are the most recovered." · "Everything is still recovering. A rest day is fine." · "That is 4 this week, your plan. Another is optional." · "Rest day. Next: <Day> on <weekday>." · "<Day> is due" · No plan today. Here is a good one. · Rest-day hints · When I miss a day · Do it later (shift) · Skip it · Week starts on · Monday · Sunday · Deload scaling · Sets · Loads · Reset to defaults · Set by your gym · Discard schedule changes? · "Could not save. Try again." · "Could not save your choice".

### Verify checklist for this spec
Each rule has a worked example: weekdays (1, 2), cycle (3, 4), every N (5), floating with and without recovery data (6), A/B (7), missed-day shift/skip/welcome back (8), deload (9), hint threshold and actions (10, 11), active recovery/mobility (12), no schedule (13). Each screen SC1-SC5 and the Today card lists its controls with states. Phase 32 turns ex. 1-13 into `contract/fixtures/schedule_*.json` and tests; a mismatch means the doc or the code is wrong.
