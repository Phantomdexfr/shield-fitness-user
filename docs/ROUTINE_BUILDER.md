# ROUTINE_BUILDER — build your own routine, any days, any split (SUPER FLEXIBLE)

Phase 28 `[D]` finalised the UX (last big section); Phases 30-33 build. Shapes in `contract/engines.md` section 1; day builder maths in section 10.

## Principles
- **Any number of days:** 2 to 7 per week, or "flexible" (no fixed weekdays). The user can change days per week later and the app redistributes or just adds/removes days; nothing is lost.
- **Any day on any date.** A routine's days are an ordered menu, not a calendar prison. The app suggests "today's day" but the user can start any day, skip a day, repeat a day, or start a free session.
- **Own exercises welcome:** library exercises, machine-based or not, plus the user's custom exercises, in any day.
- **Several routines**, one active; duplicate, rename, archive, delete.
- **Sources:** `mine`, `template` (a built-in starting point, editable copy), `gym` (from a connected gym; follow, copy to mine, or ignore).
- Everything editable at any time, with undo on destructive actions.

## Flow
1. **Setup** (`/routine/new`): name · days per week (2-7 stepper or "Flexible") · optional weekdays (Mon-Sun chips) · split style: **Push/Pull/Legs, Upper/Lower, Full body, Bro split (one muscle per day), Custom**.
2. **Days:** the app creates N days with suggested labels and target muscles from the split table below; user can rename, retarget (tap muscles on the Body Picker), add/remove/reorder days.
3. **Day editor:** target muscles chips + "Build this day for me" (day builder) + manual add (search, Body Picker, favourites, suggestions panel "good for <muscle>"). Each item: sets, rep range, rest, note, superset group, preferred variation. Reorder by drag and by up/down buttons; swipe to remove.
4. **Week view** (`/routine/<id>`): a compact grid of days (not forced to weekdays), per-day muscle chips and estimated minutes; **rest-day hint** if a muscle is planned in two consecutive days beyond its recovery target; planned weekly volume per muscle as a small bar list.
5. **Start:** any day -> a session (`docs/FLEXIBLE_SESSION.md`).

## Split table (default day -> target muscles)
| Split | Days | Day labels -> muscles |
|---|---|---|
| Push/Pull/Legs | 3 or 6 | Push: chest, front_delts, side_delts, triceps · Pull: lats, back, rear_delts, biceps, traps · Legs: quads, hamstrings, glutes, calves, adductors (+abs optional) |
| Upper/Lower | 2-4 | Upper: chest, back, lats, shoulders, biceps, triceps · Lower: quads, hamstrings, glutes, calves, abs |
| Full body | 2-4 | every day: one compound for each of legs, push, pull, hinge + core |
| Bro split | 5 | Chest · Back · Shoulders · Arms (biceps, triceps, forearms) · Legs |
| Custom | any | blank days the user fills |
For other day counts the app distributes the split cyclically (e.g. PPL with 4 days = Push, Pull, Legs, Push) and says so. **[A]** Owner/trainer may change these tables in data later.

## Suggestions inside the builder
- "Suggested day for today" = the day whose muscles are most **ready** (recovery clock) and least recently trained.
- "Good for <muscle>" panel uses the same ordering as the Muscle Lab list (suggested -> built -> more).
- Warm-ups matched to the day's muscles are offered at the top; a cooldown/recovery item at the bottom (optional, feature `warmup_suggestions`).

## Limits and safety
Max 7 days, 12 items per day (soft limit with a gentle note), routine name <= 40 chars (wraps, never truncated). Avoid-marked muscles show a notice on affected items. No medical advice.

## Data
IndexedDB `routines` store; connected mode syncs to the train shard `routines` table (JSON document).


## Added 2026-11-18: Schedule step
After days are defined, a "Schedule" step (Phase 32, spec `docs/SCHEDULER.md`): weekdays / cycle tiles / every N days / let recovery decide / A-B weeks. Any number of days and any split label is allowed; presets only pre-fill. Exercise pickers use fuzzy search (`docs/SEARCH.md`) and items can carry a `setup` (`docs/SETUP_OPTIONS.md`).


## Phase 28 UX spec (frozen; Phases 30-33 build exactly this)
Binding UI rules apply (`docs/design/UI_RULES.md`): dark + gold, no truncation, no expand cards, compact, settings are sub-pages. Every string goes through `t('rb.*')`. **[A-P28.1]** Anything below marked [A] is my reading, not owner data.

### Flow A: Routines list `/routine` (also `/routines`, Phase 30)
Screens: **A1 List**, **A2 Routine menu sheet**, **A3 Delete confirm**.
- A1: one compact card per routine (name wrapped in full, "N days", split label, Active badge, last trained). Controls and states:
  - *New routine* button: always enabled. Opens B1.
  - *Routine card*: tap opens E1. Active routine sorts first.
  - *Set active*: in menu; hidden when already active. Only one active; setting another moves the badge, nothing else changes.
  - *Empty state*: "No routines yet" + New routine + "Start from a template" (the five splits below, as editable copies, `source: 'template'`).
  - *Error state* (store read fails): "Could not read your routines" + Try again; the app stays usable (free session still works).
- A2 menu: Rename, Duplicate, Set active, Archive, Delete. Rename is an inline field (max 40, wraps, empty is refused with "Give it a name"). Duplicate adds "<name> copy" immediately (no confirm). Archive hides it from A1 behind a "Show archived" row; Restore is in the same row.
- A3: Delete needs a dialog ("Delete <name>? Your past sessions stay."). Cancel is the default focus. After delete an **Undo toast (6 s)** restores it whole.

### Flow B: Setup `/routine/new` (Phase 30)
One scrolling page, one question per card, Save at the bottom is always visible. Screens: **B1 Setup**, **B2 Split preview sheet**.
- *Name*: optional; blank becomes "My routine" (then "My routine 2"). 40 char limit, counter shown only past 30.
- *Days per week*: stepper 2-7 plus a **Flexible** chip. Default 3. Stepper at 2 disables minus, at 7 disables plus. Flexible hides the weekday row, creates 3 days, and says "You can add or remove days any time". **[A-P28.2]** A routine of 1 day is allowed through Custom ("Add day"), never through the stepper.
- *Weekdays* (optional): Mon-Sun chips, multi-select, none selected = flexible. If the chosen count differs from the days per week, show the quiet line "3 days chosen, 4 per week. That is fine." and never block. Week starts per Settings (Monday default).
- *Split style*: PPL, Upper/Lower, Full body, Bro, Custom (chips, one selected). Choosing one opens B2 (a read-only list of the day labels and muscles it will create) with **Use this** and **Back**. Custom skips B2.
- *Create*: enabled always. On tap it builds the days and opens E1 (week view). Nothing is saved to the store until Create. Leaving with changes asks "Discard this routine?" (Discard / Keep editing).
- *States*: loading none (all local); error on save = "Could not save. Try again." with the form kept.

### Flow C: Days (inside E1, Phase 30-31)
The created days are an ordered menu. Screens: **C1 Day chips row**, **C2 Add/reorder days sheet**.
- Each day: name (editable), target muscle chips, item count, est. minutes.
- *Add day*: up to 7 (soft: at 7 the button says "7 is the most" and is disabled). *Remove day*: confirm only if it has items; Undo toast 6 s. *Reorder*: up/down buttons plus drag. *Retarget*: tap muscle chips opens the Body Picker (multi-select); picking none is allowed (the day stays blank).
- Changing days per week later: adding days appends blank days; removing asks which day to drop (default the last), never deletes silently.

### Flow D: Day editor `/routine/<id>/day/<dayId>` (Phase 31)
Screens: **D1 Editor**, **D2 Add exercise sheet**, **D3 Item sheet**.
- D1 header: day name, target muscle chips, *Build this day for me* (Phase 33; before then the button is hidden, not disabled), *Add exercise*.
- Item card: name fully wrapped, machine thumb, "3 x 8-12, rest 90 s", superset badge. Actions: up, down, drag handle, swipe left to remove (Undo toast), tap opens D3.
- D2: search (fuzzy), Body Picker tab, My go-tos, "Good for <muscle>" panel (same order as the Muscle Lab: suggested, built, more), custom exercises. Already-added exercises show a "In this day" chip and can still be added again.
- D3: sets (1-10 stepper), rep min/max (whole numbers, min <= max, else "First number must not be bigger"), rest (15-600 s, step 15), note (500), superset (pick another item in the day; unlink), variation, setup. Save closes; Cancel discards the sheet edits.
- Limits: at 12 items a gentle note "That is a long day. Fine if you want it." appears; adding is never blocked. Avoid-marked muscles show a notice chip on the item. Empty day: "Nothing here yet" + Add exercise + Build for me.

### Flow E: Week view `/routine/<id>` (Phase 31)
Screens: **E1 Week**, **E2 Day sheet**, **E3 Volume list**.
- E1: compact grid of the routine's days (not forced to weekdays). Per day: label, muscle chips, est. minutes, **Start** button. Header: name, Active toggle, menu (A2 items).
- *Rest-day hint*: if one muscle is planned on two consecutive days beyond its recovery target (or its planned weekly sets exceed the soft cap in `docs/reference/PROGRESSIVE_OVERLOAD_RULES.md`), a quiet card says which and offers *Move a day* or *Ignore*. Hint only; hidden when the Settings switch is off or recovery data is absent (Phase 49).
- E3: planned weekly volume per muscle as a small bar list (sets), under the grid, always visible, no expand.
- Empty: a routine with zero exercises shows "Add exercises to your days" and a Start button on each day is still enabled (it opens a free session labelled with that day).
- Schedule row: "Schedule: none" until Phase 32 adds the step; tapping it is hidden until then.

### Flow F: Start (from E1, Home Today card, or `/session/new`)
Screens: **F1 Start sheet**. Choices: **Start <day>** (suggested day first, marked "Suggested"), **Pick another day**, **Free session**, **Repeat last**. A day is never locked: starting any day on any date is allowed; starting a day that was just done shows a quiet "Done 2 hours ago" note and still starts. If a session is already open: "You have a workout in progress" with **Resume** (primary), **Finish it**, **Start new anyway** (the old one stays resumable). Starting copies the day's items into a Session as `todo` (`routineId` + `dayId` set).

### Split style definitions (day -> muscles) **[A, owner/trainer may change in data later]**
Muscle ids are the taxonomy parents; the Body Picker may narrow them. "Cycle" means the app repeats the list to fill the day count and says so ("4 days: Push, Pull, Legs, Push").
| Style | Day count it is offered for | Days (label -> muscles) |
|---|---|---|
| PPL | any 2-7 (best 3 or 6) | Push -> chest, front_delts, side_delts, triceps · Pull -> lats, back, rear_delts, biceps, traps · Legs -> quads, hamstrings, glutes, calves, adductors |
| Upper/Lower | any 2-7 (best 2 or 4) | Upper -> chest, back, lats, shoulders, biceps, triceps · Lower -> quads, hamstrings, glutes, calves, abs |
| Full body | any 2-7 (best 2-4) | Full body A, B, C... each -> quads, hamstrings, chest, back, shoulders, abs; the day builder is told to take one compound each for squat, hinge, push, pull, plus core. Labels are "Full body A/B/C/D" by position. |
| Bro | any 2-7 (best 5) | Chest -> chest · Back -> lats, back, traps · Shoulders -> front_delts, side_delts, rear_delts · Arms -> biceps, triceps, forearms · Legs -> quads, hamstrings, glutes, calves · (6th) Core and cardio -> abs · (7th) Rest-style mobility day -> no muscles. With 2-4 days the first N are used. |
| Custom | any 1-7 | "Day 1..N", blank, no muscles |
Worked: PPL 6 days = Push, Pull, Legs, Push, Pull, Legs. PPL 4 days = Push, Pull, Legs, Push (says so). Upper/Lower 3 days = Upper, Lower, Upper. Bro 3 days = Chest, Back, Shoulders. Full body 4 = A, B, C, D. Arnold/PHUL/push-pull (Phase 29) are label presets that reuse these maps.

### Flexible rules (summary, all binding)
1. Weekdays are optional; none = flexible.
2. Any day can start on any date; routine order is a menu.
3. Days per week can change later; nothing is lost.
4. Rest-day suggestions are hints, never blocks, switchable in Settings -> Schedule.
5. Several routines, one active; the Home Today card follows the active one.
6. Every destructive action has Undo or a confirm; deleting a routine never deletes sessions.

### Microcopy list (`t('rb.*')`; wording is final unless the owner edits)
New routine · Routines · Start from a template · No routines yet · Could not read your routines · Try again · Give it a name · Days per week · Flexible · Weekdays (optional) · "3 days chosen, 4 per week. That is fine." · Split style · Use this · Create routine · Discard this routine? · Discard · Keep editing · Add day · "7 is the most" · Add exercise · Build this day for me · Nothing here yet · "That is a long day. Fine if you want it." · In this day · First number must not be bigger · Suggested · Done 2 hours ago · Resume · Finish it · Start new anyway · Free session · Repeat last · "Delete <name>? Your past sessions stay." · Undo · Set active · Archive · Restore · Show archived · Rest-day hint: "<muscle> is planned two days in a row. Fine, or move one?" · Move a day · Ignore.

### Verify checklist for this spec
Each flow (A-F) lists its screens and a state for every control (enabled/disabled/hidden, empty, error, confirm, undo). Phase 30 must cover A1, A3, B1-B2; Phase 31 D1-D3, E1-E3, C1-C2; Phase 33 the "Build for me" button; Phase 32 the Schedule row.
