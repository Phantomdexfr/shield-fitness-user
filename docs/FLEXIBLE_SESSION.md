# FLEXIBLE_SESSION — a workout that never gets stuck

Owner rule: *"The workout should never get stuck on one exercise… do that, then next comes… super flexible."* Built in Phases 34 (session), 35 (skip/swap), 38 (logger), 39 (summary and history). UX frozen in Phase 28 (see the last section).

## The model (contract/engines.md section 1)
A session is a bag of items, each with a status that can move freely: `todo · doing · done · skipped · later`. There is **no "current exercise"** that blocks the others. There is no required order. A session may end with items still `todo`.

## Screen `/session/<id>`
- **All items visible as compact cards** (name fully wrapped, machine thumb, sets done x planned, status dot). Scroll or jump; tap any card to open its logger sheet; closing it returns to the list at the same place.
- **Card actions:** Skip · Later · Swap · Remove. Swipe left = skip, swipe right = later (with undo toast). Long-press to reorder (also up/down in the card menu).
- **Add anything, any time:** search, tap the Body Picker, favourites, "suggested next" (muscle-aware), or a custom exercise.
- **Suggested next** chip: best unfinished item by recovery/priority, but only a suggestion.
- **Later shelf:** items parked for later in this session; one tap returns them.
- **Finish anytime:** a Finish button is always available; unfinished items are listed ("3 not done: skipped, later, todo") and dropped or kept for the next time (user choice, default drop).
- **Resume:** autosave on every set; after an app kill the session reopens exactly as it was.
- **Timer:** rest timer is per item and does not lock the screen; several can be ignored.
- **Supersets:** pair two items; logging alternates but either can be done alone.

## Skip -> smart alternatives (Phase 35; ranking in contract/engines.md section 9)
1. Tap Skip -> sheet "Why?" with chips: **Machine busy · Pain · No time · Too hard · Other**.
2. **Pain** asks "Where?" (Body Picker, one tap) and applies avoid filtering for that session (and offers to save a mark).
3. The sheet shows up to 5 alternatives: other **variations of the same exercise**, then other exercises for the same muscle and movement, then substitution groups, then anything for that muscle; all respecting marks, hidden exercises and machine status.
4. Tap one -> it replaces the skipped item (sets already logged stay with the original); or choose "Just skip" -> the item turns `skipped`.
5. "Mark busy" also hides that machine's other exercises for the rest of this session.
The app never swaps automatically.

## Free session
"Start empty" opens a session with no items and the add menu. "Repeat last" clones the most recent session. "Today's day" starts the suggested routine day, still fully editable.

## Summary (Phase 39)
Duration, total volume, sets, PRs, skipped/later items, and a mini body of muscles hit. Nothing is graded; skipped items are neutral, not failures.

## Simple vs Advanced
Simple: weight, reps, done. Advanced adds RPE, warm-up/drop/superset tags, rest timer tuning. Same data either way.


## Phase 28 UX spec (frozen; Phases 34-39 build exactly this)
UI rules as in `docs/ROUTINE_BUILDER.md` (no truncation, no expand cards, 44 px targets, strings via `t('fs.*')`). **[A-P28.3]** Items marked [A] are my reading.

### Session card states
Each card shows: name (fully wrapped), machine thumb, "sets done x planned", a status dot and label (the dot is never the only signal).
| Status | Dot | Label | Card behaviour | Actions shown |
|---|---|---|---|---|
| todo | hollow gold ring | To do | normal | Skip, Later, Swap, Remove |
| doing | filled gold | In progress | set automatically on the first logged set; pinned nowhere (no lock) | Skip, Later, Swap, Remove |
| done | check | Done | dimmed, sorts below open items but can be tapped and edited | Reopen, Remove |
| skipped | dash | Skipped | dimmed, shows the reason chip | Undo skip, Swap, Remove |
| later | clock | Later | moves to the Later shelf (not in the main list) | Bring back, Skip, Remove |
Any status can move to any other; a card with logged sets can be skipped (sets are kept). **Done is set** when the user taps Mark done, or when sets done >= planned and the last set is saved (a quiet "Mark done?" chip, never automatic). Reopen returns it to `doing` (or `todo` with no sets).

### Screens: `/session/<id>` (Phases 34, 38)
- **S1 List**: header (day name or "Free session", elapsed time, Finish button always enabled), "Suggested next" chip, cards, Later shelf row (count; tap shows its items below the list in place, not an expand card: it is a second section), Add button.
- **S2 Logger sheet** (Phase 38): opened by tapping a card; closing returns to the same scroll position. Simple = weight, reps, done; Advanced adds RPE, tags, rest tuning. States: no previous sets (hint "Start with a light set"), last-time line, saving (autosave per set, no spinner), save error ("Could not save this set. Try again." the entered values stay).
- **S3 Add sheet**: search, Body Picker, go-tos, "Suggested next", custom exercises. Adding is never blocked; duplicates allowed (second one gets "2" badge).
- **S4 Skip sheet** (Phase 35), **S5 Finish sheet** (Phase 39), **S6 Resume prompt**, **S7 Summary** (Phase 39).
- Controls and states: *Skip* swipe-left or button (opens S4); *Later* swipe-right or button, applies at once with an Undo toast (6 s); *Swap* opens S4 directly at the alternatives; *Remove* swipe/menu, Undo toast, logged sets ask a confirm ("Remove <name> and its 3 sets?"); *reorder* long-press or up/down in the card menu (disabled at the ends); *Suggested next* hidden when no open items or no recovery data (falls back to the first `todo`).

### Later shelf
Items with status `later`. Shelf row: "Later (2)" hidden at 0. One tap on an item or "Bring back" sets it to `todo` and returns it to its old position (kept in `order`). "Bring all back" appears at 2+ items. The shelf never auto-returns. At finish, `later` items are listed as unfinished (see finish rules).

### Skip sheet (S4)
1. Title "Why skip <name>?" with chips Machine busy · Pain · No time · Too hard · Other. **Choosing a reason is optional**: "Just skip" is always visible and sets `skipped` with no reason.
2. *Pain* asks "Where?" with the Body Picker (one tap, optional; Skip the question = use the exercise's primary muscles). Then offers "Remember this area" (saves an avoid mark; off by default). Avoid filtering applies for the rest of this session.
3. *Machine busy* adds the checkbox "Hide this machine's other exercises for this session" (on by default). It is undone from the session menu ("Machines hidden (1)").
4. Alternatives list (up to 5, ranked per `contract/engines.md` section 9): name, machine thumb, one reason chip each (Same exercise, Same muscle, Easier...). Tap one = replaces the item (`ref` swapped, old logged sets stay on the original, which becomes `skipped` with the reason). Empty state: "No good alternatives right now" + Just skip + Search instead. Error state: alternatives fail to compute -> same empty text, Just skip still works.
5. The app never swaps without a tap. Closing the sheet changes nothing.

### Finish rules (S5)
- Finish is always enabled, even with zero sets logged. With no sets logged at all: "Nothing logged. Discard this session or keep it?" (Discard / Keep). Discard deletes it (confirm).
- With unfinished items: "3 not done: 1 skipped, 1 later, 1 to do" (counts by status). Choice **[A-P28.4]**: *Drop them* (default) or *Keep for next time* (adds them to a "Left over" note on the day; no data is lost). Skipped items are neutral, never a failure.
- Finish sets `endedAt`, locks nothing, and opens S7. A finished session can be edited later from History (Phase 39).
- Auto-finish never happens. If a session has been open more than 6 hours with no set logged, S6 offers "Finish this session?" on next open (Finish / Keep going), never silently.
- Duration = endedAt - startedAt minus nothing (no pause tracking in 0.1.0).

### Resume (S6)
After an app kill the session reopens as it was (autosave per set). If a session is open and the user starts another, the Flow F prompt in `docs/ROUTINE_BUILDER.md` applies. Only one session is `open` at a time **[A-P28.5]**; "Start new anyway" finishes the old one as-is (no summary prompt) and keeps it in History.

### Empty and error states (all screens)
- Free session with no items: "Add your first exercise, or just start." + Add + Suggested next.
- All items done/skipped: "All set. Finish when you are ready." (Finish highlighted, still optional).
- Session not found (`/session/<bad id>`): "We could not find that workout" + Go Home.
- Store error on open: "Could not open this workout. Your data is safe." + Try again.
- Offline: nothing changes (everything is local); no offline banner is needed.

### Microcopy list (`t('fs.*')`)
Free session · Suggested next · To do · In progress · Done · Skipped · Later · Later (2) · Bring back · Bring all back · Skip · Swap · Remove · Reopen · Undo skip · Undo · Mark done? · Add exercise · Finish · Finish workout? · "3 not done: 1 skipped, 1 later, 1 to do" · Drop them · Keep for next time · "Nothing logged. Discard this session or keep it?" · Discard · Keep · Why skip <name>? · Machine busy · Pain · No time · Too hard · Other · Just skip · Where? · Remember this area · "Hide this machine's other exercises for this session" · No good alternatives right now · Search instead · "Remove <name> and its 3 sets?" · Start with a light set · "Could not save this set. Try again." · "You have a workout in progress" · Resume · "We could not find that workout" · "Could not open this workout. Your data is safe." · All set. Finish when you are ready.

### Verify checklist for this spec
S1-S7 each list their controls with enabled/disabled/hidden, empty, error, confirm and undo states; the five card statuses have a table; the Later shelf, skip sheet and finish rules each have numbered steps. Phase numbers in the file header above are the old plan; the build phases are 34 (session), 35 (skip/swap), 38 (logger), 39 (summary, history).
