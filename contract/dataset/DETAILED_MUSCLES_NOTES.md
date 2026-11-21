# Detailed muscles: notes (COMPLETE: batch 1 + batch 2)

## Defaults I applied to the open questions (change any of these and I will redo the affected rows)
1. **Mobility rows without a primary keep role `mobility`.** There are now 10: the 6 from batch 1 plus Foam Roller Quad Roll, Foam Roller Glute Roll, 90-90 Hip Switch and World's Greatest Stretch. They are listed separately in the validation output.
2. **hip_flexors rolls up to abs** (the HTML falls back to quads; unchanged).
3. **quads_lower is kept but its meaning is unconfirmed.** It is used only as a **secondary**, low/medium, "contested" row on deep-knee-flexion or terminal-extension work (18 rows: leg extension, hack squat, wall sit, step-ups and step-downs, pistol/shrimp squats, squat pulses and similar). It has **0 primaries**, so it shows up as a gap.
4. **Cable (30) and progression (12) exercises in seed/new_exercises/ are not mapped** (scope stays 592). The 3,096-row variation gap-fill file is also not used.

## Status
- **Mapped: 592 of 592 exercises, 2,749 rows** (batch 1: 1,107 rows kept byte-for-byte; batch 2: 1,642 new rows for 312 exercises).
- `pending_exercises_batch2.csv` is removed because the batch is fully done.
- Nothing in the original zip was edited. The rebuilt files are in `seed/detailed_muscles/`. The taxonomy and `html_unit_to_detailed.csv` are unchanged; **no new muscle ids were added in batch 2.**
- Content comes from general exercise-science knowledge. **No web search was used and no sources are listed.** No EMG numbers are claimed.

## How the sub-categories were chosen (your HTML, unchanged from batch 1)
Only ids that exist in `muscle_taxonomy_detailed.csv` were used. Splits the map cannot draw (quad heads, upper vs lower rectus, TrA, glute max vs med/min inside `glutes`, individual hamstrings, biceps/triceps heads, forearm flexor/extensor, gastroc vs soleus *drawing*) appear only in row notes. Glute med/min/TFL work maps to `abductors`.
- Four ids are not drawn: `serratus_anterior`, `rotator_cuff`, `soleus`, `tibialis_anterior`. The HTML needs fallbacks: rotator_cuff -> rear_delts, serratus_anterior -> back, soleus and tibialis_anterior -> calves.
- `html_unit_to_detailed.csv` maps every HTML unit id to a detailed id.

## Conventions
- Roll-up: every detailed id has a core `parent_group`. Placeholder roll-ups kept: adductors -> quads, abductors -> glutes, hip_flexors -> abs. neck has parent neck.
- Core ids are used directly where the map draws them (glutes, quads, abs, calves, obliques, hamstrings, ...). Parents with no drawn region (chest, back, shoulders, traps) are never used as `muscle_id`.
- Max 3 primaries per exercise (checked). Compound lifts have 2-3 primaries; isolation work has 1-2.
- Roles: primary / secondary / stabiliser / mobility. Emphasis is relative to the exercise.
- **Batch 2 specifics**
  - *Cardio rows (76)* map only the muscles that do the work, emphasis low or medium (never high), and every cardio exercise has "cardio" in a row note.
  - *Full-body rows (23)* take the 2-3 prime movers as primaries; other contributors are secondary or stabiliser. Conditioning moves (burpee, squat thrust) say "conditioning".
  - *Carries* use `abs` as primary (anti-extension), with `obliques` primary only for one-sided loads (suitcase, single-bell rack). Zercher carry also has `lower_back` primary.
  - *Hip flexors*: leg raises, knee tucks, V-ups, flutter kicks and similar list `hip_flexors` and `abs` as co-primaries; "lower abs" wording is contested and stays in the note.
  - *Glute med/min* work (clamshell, fire hydrant, side-lying raise, band walks, hip abduction machine) is `abductors` primary. Side planks list `abductors` as a primary alongside `obliques`.
  - *Cardio bikes, treadmills, elliptical*: quads + glutes primary; calves added for treadmill and jump rope; hamstrings added for curve treadmill and reverse stride (contested).

## Contested points
72 rows across 71 exercises carry "contested" (batch 1: 28 rows / 28 exercises; batch 2: 44 rows / 43 exercises). Batch 2 groups:
- Lower-quad region / VMO / "teardrop" (leg extension, hack squat, wall sit, step-up/down, pulses, pistol and shrimp squat, narrow-stance squat, backward walking). Kept as secondary only.
- Hip-thrust vs squat glute claims (Barbell Hip Thrust note).
- Upper vs lower abs ("lower abs" in leg raises, flutter kicks, scissor kicks, single-leg lowering, standing knee raise; upper/lower rectus in crunches and cable crunch).
- Oblique "side fat" (dumbbell and cable side bends): the muscle target is fine, the spot-reduction claim is contested.
- Inner-thigh isolation (hip adduction machine, lateral lunge, Cossack squat, curtsy lunge, Smith sumo squat).
- Curve treadmill and elliptical reverse stride "posterior-chain bias": weak evidence.
- Narrow-stance squat biasing the quads: modest.
- Frog pump external-rotation emphasis, pullover crunch lats vs pec.

## Please confirm (decisions and assumptions)
1. **`cardio` and `full_body` are not used as `muscle_id`.** You asked for the muscles that do the work, so the 99 exercises with those old primaries (76 cardio, 23 full_body) have no new primary whose parent equals the old primary. The validation lists this as one explained category. If your app needs a system row, tell me and I will add `cardio` / `full_body` as a low-emphasis row (it would count against the 3-primary cap).
2. **Region meaning still unconfirmed:** `quads_lower`, the "back" region (rhomboids/teres), traps units 3-4. Please confirm what the designer intended.
3. **neck** still has parent neck (no core parent). Decide whether it becomes core.
4. **Setup assumptions not in the data:** Suspension Hip Bridge = heels in the straps (hamstrings primary, medium); Stability Ball Glute Bridge = setup unknown (hamstrings secondary, high, "confirm"); Hack Squat Calf Raise (batch 1) still says "confirm". Machine range of motion and handle angles were not in the data.
5. **Content issue in your variation text:** Glute Bridge has "feet closer for hamstrings". The usual cue is the opposite (feet further from the hips = more hamstrings, closer = more quads). I did not encode it. Please review the string.
6. **Calves counts are inflated by cardio** (primary 8 -> 35, almost all treadmill, jump-rope and jump rows). Filter by exercise kind if you rank strength exercises.
7. **Pre-existing batch 1 shift rows (9, left unchanged):** the muscle is not in that exercise's map (e.g. Barbell Deadlift sumo adductors, Barbell Romanian Deadlift snatch-grip upper_traps). All 188 new shift rows have a matching map row.
8. **Stale text in `muscle_taxonomy_detailed.csv`:** the notes for abs and obliques still say "pending in batch 2", and quads_lower says "Used in batch 2". The file is unchanged as instructed; edit the text if you want it tidy.
9. **Roll-up mismatches (old primary vs parent of new primary), besides the 99 system ids:** only the 3 from batch 1 (Barbell Rack Pull, Barbell Snatch-Grip Deadlift, Scapular Push-Up), all deliberate and unchanged. Batch 2 has none.

## Variation shifts
- `variation_muscle_shift.csv`: 312 rows (batch 1: 124 unchanged; batch 2: 188 new on 167 variation strings). Every variation string matches the variation CSVs verbatim and every muscle id is in the taxonomy.
- **Skipped: 451 of the 618 variation strings** on batch 2 exercises. They are listed with a reason in `variation_shift_skipped.csv`:
  - 404 are load, tempo, pause, range, side, interval or programming variables with no direction-clear shift.
  - 42 are composite strings naming two options (e.g. "Feet low (quad emphasis) or high (glute emphasis)", "Torso upright (quads) vs forward lean (glutes)", "High bar or low bar", "narrow or wide stance"). They cannot be one direction; split the strings to encode them.
  - 5 are unrepresentable or unsupported: quad-head shifts (leg extension toes in/out and toes pointed), upper vs lower rectus (reverse crunch), the Glute Bridge string above, and the lengthened-partials claim.
- Quad-heads, upper/lower rectus, TrA and glute max vs med splits cannot be expressed because there are no ids for them.

## Machines
`machines_detailed.csv` is rebuilt from all 592 mapped exercises: 51 machines complete, 4 with no exercises (Standing Multi Flight, Flat Incline Combo Bench, Cable Attachments, Yoga Mat), none partial or unmapped. `detailed_muscle_groups` lists muscles with a primary or a high/medium secondary, ranked primary = 1 and secondary = 0.5 (ties by first appearance); I verified that this rule reproduces the batch 1 file exactly before applying it to all 592.

## Files
| File | What |
|---|---|
| muscle_taxonomy_detailed.csv | 34 ids, unchanged |
| exercise_muscle_map.csv | 2,749 rows for 592 exercises (batch 1 rows unchanged) |
| variation_muscle_shift.csv | 312 rows (124 + 188) |
| variation_shift_skipped.csv | new: every batch 2 variation string without a shift row, with the reason |
| machines_detailed.csv | rebuilt from all 592 |
| coverage_report.csv | rebuilt: per muscle counts, machine counts, parent roll-up |
| coverage_gaps_and_suggestions.md | rebuilt: muscles with fewer than 3 primaries and suggested additions (not added) |
| html_unit_to_detailed.csv | unchanged |
| validation_output.txt | full validation run on the 592 |
