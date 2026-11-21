# Exercise categories: notes (v5: warmup added)

All 634 exercises (exercises.csv 199 + new_exercises 393 + cable 30 + progression 12) are now tagged with one `category` and a `sub_category`. Files are in `seed/exercise_categories/`.

| File | Rows | What it is |
|---|---|---|
| exercise_categories_all.csv | 634 | Every exercise: seed columns + extended columns + category, sub_category, reason |
| exercise_category_lookup.csv | 634 | Just name, slug, category, sub_category (join onto any table by slug) |
| compound.csv | 270 | Multi-joint lifts |
| isolation.csv | 159 | Single-joint / single-muscle work |
| recovery.csv | 12 | Foam rolling, mobility, stretching |
| other.csv | 193 | Cardio, core, plyometrics, conditioning, balance |

## Sub-categories
- compound: push 73, pull 46, squat 42, lunge 39, hinge 59, carry 10, full_body 1 (Turkish get-up)
- isolation: sub_category is the target muscle (shoulders 33, biceps 28, triceps 22, forearms 15, calves 11, chest 10, traps 10, ...)
- recovery: foam_rolling 6, mobility 6
- other: core 91, cardio_machine 42, conditioning 39, plyometric 15, balance 1

## How it was decided
Started from the existing `movement_pattern` column, then applied overrides (the `reason` column says why each row landed where it did):
- push / pull / squat / lunge / hinge / carry -> compound; isolation -> isolation; core and cardio -> other.
- Foam roller rolls, Cat-Cow, Child's Pose, 90-90 Hip Switch, World's Greatest Stretch, Deep Squat Hold, Inchworm -> recovery.
- Jumps, bounds, plyo push-up, med ball chest pass / scoop toss -> other / plyometric.
- Burpee, mountain climbers, bear crawl, squat thrust, rope work, jacks, shuffles -> other / conditioning.
- Moved from compound to isolation: Back Extension, hamstring curls on ball / suspension, Face Pull, Band Pull-Apart, Cuban Press, Scapular Pull-Up, static grip holds (pinch, DB hold, deadlift hold).
- Moved from isolation to compound: Wall Handstand Hold.
- Bird Dog Row (tagged isolation in source) -> other / core. Foam Roller Dead Bug stays core (other).

## Judgment calls you may want to flip
- Loaded carries (farmer's, waiter, suitcase, etc.) are compound. Easy to move to other if you prefer.
- Hip thrusts / glute bridges stay compound.
- Olympic lifts (power clean, snatch, high pull) stay compound.
- Wall ball shots, thrusters, man makers stay compound.
- Core is all "other". If you want core as its own category, filter sub_category = core.
- Yoga Mat and Foam Roller have few or no exercises; Foam Roller recovery exercises are kind=bodyweight, reps are seconds.

Nothing in the original files was changed. Re-run is not needed: edit `category` in exercise_categories_all.csv directly if you override any row.

## v5 update: warmup category
Five categories now: compound 270, isolation 141, other 184, warmup 32, recovery 7 (total 634).

| warmup sub_category | Count | Examples |
|---|---|---|
| mobility | 4 | Cat-Cow, 90-90 Hip Switch, World's Greatest Stretch, Deep Squat Hold |
| dynamic | 7 | Inchworm, Jumping Jacks, High Knees, Butt Kicks, Seal/Squat Jacks, Lateral Shuffle |
| glute_hip_activation | 5 | Clamshell, Fire Hydrant, Donkey Kick, Band Lateral Walk, Band Hip Abduction |
| shoulder_scap_activation | 11 | Band Pull-Apart, Band Face Pull, external rotations, Scapular Push-Up/Pull-Up, Prone Y-T-W, Reverse Snow Angel, Plate/KB Halo |
| core_spine_activation | 5 | Bird Dog, Dead Bug, Prone Cobra Hold, Prone Swimmer, Superman |

- These 32 were moved OUT of recovery, isolation and other. `original_category` and `original_sub_category` keep where each one came from, so it is reversible.
- Recovery is now foam rolling (6) plus Child's Pose (cooldown stretch).
- `also_warmup = yes` (29 rows, in also_usable_as_warmup.csv) flags exercises that stay in their main category but work as a warm-up: foam roller rolls, easy steady cardio, light bodyweight squat / hinge / lunge / push-up patterns, planks, Child's Pose.
- New files: warmup.csv, also_usable_as_warmup.csv. All other category files were regenerated.
- Judgment call: Band External Rotation, Halos and Y-T-W are also valid light shoulder work. They live in warmup now; flip `category` if you want them back as isolation.
