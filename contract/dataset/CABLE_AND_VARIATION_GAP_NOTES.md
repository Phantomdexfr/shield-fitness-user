# Variation and cable gap fill: notes

## What you asked
The Cable Crossover can train the whole body through grips, attachments and benches, so the data must reflect that, and the same check must be done for every other machine.

## What I found
- Cable Crossover had 40 exercises but most carried only 1-3 variations (median 2). Attachments (V handle, curved lat bar, straight bar, EZ bar, strap, D, square and MAG handles) and benches (flat, adjustable incline, utility, preacher, stability ball) were barely used.
- Across all machines, 453 of 592 exercises had fewer than 3 variations.
- Missing cable movement families: lying and standing pullovers, bench-supported cable work (incline curl, spider curl, concentration curl, chest-supported rows, incline rear delt fly), cable presses (seated, standing, cuban), cable squats and deadlifts, cable core variants, single-arm high row, archer row.

## New files (all in seed/new_exercises/, same columns as your seed files, append directly)
| File | Rows | Maps to |
|---|---|---|
| cable_new_exercises.csv | 30 | exercises.csv |
| cable_new_exercises_extended.csv | 30 (1:1 by name) | exercises_extended.csv |
| cable_new_exercise_variations.csv | 179 | exercise_variations.csv |
| variations_gap_fill_all_machines.csv | 3096 | exercise_variations.csv (new options on existing exercises, de-duplicated) |

Cable Crossover now has 70 exercises (was 40). Total exercises 622 (was 592), total variations 4680 (was 1405).

## Coverage per machine (after merging everything)
| Machine | Exercises | Variations before | Added | After |
|---|---|---|---|---|
| (no machine / floor) | 124 | 252 | +632 | 884 |
| Cable Crossover | 70 | 99 | +479 | 578 |
| Dumbbells and Rack | 57 | 186 | +299 | 485 |
| Olympic Barbell | 40 | 111 | +224 | 335 |
| Kettlebells | 31 | 63 | +157 | 220 |
| Resistance Tubes | 29 | 46 | +150 | 196 |
| Smith Machine | 23 | 57 | +127 | 184 |
| Suspension Trainer | 21 | 37 | +108 | 145 |
| Stability Ball | 20 | 35 | +114 | 149 |
| Flat Bench | 17 | 49 | +78 | 127 |
| Adjustable Bench | 13 | 59 | +67 | 126 |
| Medicine Ball | 13 | 26 | +42 | 68 |
| Soft Plyo Box | 12 | 25 | +57 | 82 |
| Battle Rope | 11 | 15 | +55 | 70 |
| Half Stability Ball | 8 | 10 | +30 | 40 |
| Lifting Platform | 8 | 23 | +47 | 70 |
| Jump Rope | 8 | 9 | +32 | 41 |
| Utility Bench | 8 | 26 | +44 | 70 |
| Power Cage | 8 | 31 | +41 | 72 |
| Foam Roller | 7 | 7 | +30 | 37 |
| Treadmill | 7 | 12 | +21 | 33 |
| Spin Bike | 7 | 9 | +35 | 44 |
| Olympic EZ Bar | 6 | 19 | +33 | 52 |
| Olympic Flat Bench | 6 | 16 | +32 | 48 |
| Rowing Machine | 6 | 10 | +36 | 46 |
| Ski Erg | 5 | 5 | +30 | 35 |
| Curve Treadmill | 5 | 7 | +15 | 22 |
| Elliptical Cross Trainer | 5 | 7 | +20 | 27 |
| Wall Ball | 4 | 7 | +15 | 22 |
| Ab Wheel | 4 | 8 | +24 | 32 |
| Upright Bike | 4 | 4 | +20 | 24 |
| Assisted Pull-Up / Dip Machine | 3 | 8 | +10 | 18 |
| Seated Cable Row | 3 | 12 | +16 | 28 |
| Recumbent Bike | 3 | 3 | +15 | 18 |
| Preacher Curl Bench | 3 | 10 | +20 | 30 |
| 45 Degree Leg Press | 2 | 12 | +8 | 20 |
| Pec Fly / Rear Delt Machine | 2 | 7 | +11 | 18 |
| Back Extension | 2 | 9 | +10 | 19 |
| Hip Adductor / Abductor | 2 | 5 | +12 | 17 |
| Lat Pulldown | 2 | 12 | +13 | 25 |
| Hack Squat | 2 | 8 | +8 | 16 |
| Front Lat Pulldown (Plate Loaded) | 1 | 2 | +5 | 7 |
| Biceps Curl Machine | 1 | 4 | +5 | 9 |
| Decline Chest Press (Plate Loaded) | 1 | 1 | +6 | 7 |
| Hip Thrust Machine | 1 | 2 | +5 | 7 |
| Olympic Incline Bench | 1 | 6 | +5 | 11 |
| Incline Chest Press (Plate Loaded) | 1 | 5 | +6 | 11 |
| Leg Extension | 1 | 7 | +5 | 12 |
| Prone Leg Curl | 1 | 7 | +4 | 11 |
| Seated Calf Raise | 1 | 5 | +5 | 10 |
| Shoulder Press Machine (Plate Loaded) | 1 | 5 | +6 | 11 |
| Vertical Chest Press | 1 | 5 | +6 | 11 |

## Rules I followed
- Same anti-bloat rule: grip, attachment, bench angle, stance, tempo and unilateral options are variation rows. Separate exercises only where the movement or muscle emphasis changes.
- Nothing needing gear you did not photograph: no rope, ankle strap, pull-up bar, landmine, decline bench or Nordic anchor.
- Bench angles named are 30/45/60 degrees on the Adjustable Bench; decline is not used.
- Checked by script: no duplicates against your three existing variation files, no banned gear words, valid muscle ids, primaries are core ids, slugs unique, rep_min <= rep_max.

## Owner checks and limits
- Cable heights, stack weights and the Standing Multi Flight remain unconfirmed; nothing was written for the Standing Multi Flight.
- Variations for non-cable machines (about 2,900 rows) come from pattern rules by exercise family, then reviewed in aggregate, not one by one. Spot check a few per machine before shipping.
- Intentionally skipped (no extra variations): neck work, stretches and yoga holds, Turkish get-up, man maker, devil press, rack pull, balance-trainer drills, wall handstand, tibialis raise.
- `track_fit` and `difficulty` on the new rows use the same simple rule as before, not TIERS_TRACKS_RULES.md.
- Content is from general training knowledge; no web search was used.

## Progression ladders (added after review)
If a machine offers an assisted version, the unassisted and harder versions belong in the data too. Added in `progression_new_exercises.csv` (+ `_extended` and `progression_variations.csv`): Pull-Up, Chin-Up, Neutral-Grip Pull-Up, Wide-Grip Pull-Up, Negative Pull-Up, Scapular Pull-Up and Parallel-Bar Dip on the Assisted Pull-Up / Dip Machine, plus Pistol Squat, Single-Leg Hip Thrust, Dumbbell Step-Up, Dumbbell Forward Lunge and Dumbbell Bulgarian Split Squat. Assisted versions also got "lower the assistance each week" variations.
Owner check: confirm the Assisted Pull-Up / Dip Machine allows zero assistance (pad out of the way) and has handles you can hang from. If not, the pull-up rows should be moved or removed. Weighted pull-ups/dips need a dip belt, not confirmed, so only mentioned as a variation. Total exercises: 634.
