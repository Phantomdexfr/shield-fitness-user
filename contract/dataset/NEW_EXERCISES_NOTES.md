# New exercises: notes

Your message was cut off after "NO EQUIPMENT: add bodyweight and floor exercises (push-up, squat, lunge, core,". I treated Part 2 as the rest of the usual list: glutes, hinge, plyometrics, mobility, bodyweight cardio. Tell me if you wanted something else.

## What is in the files
All new rows use the same columns as your seed files, so they append directly. Nothing in `new_*` repeats an existing exercise name or slug (checked by script).

| File | Rows | Maps to |
|---|---|---|
| new_exercises.csv | 393 | exercises.csv |
| new_exercises_extended.csv | 393 (1:1 by name) | exercises_extended.csv |
| new_exercise_variations.csv | 542 | exercise_variations.csv (variations of the new exercises) |
| added_variations_for_existing_exercises.csv | 531 | exercise_variations.csv (new options on exercises you already have, de-duplicated against your file) |

Split: about 293 rows use equipment from machines.csv (Part 1), about 100 are bodyweight/floor (Part 2; a few still name a bench or box).
Kinds: 204 strength, 140 bodyweight, 49 cardio.

## Part 1 coverage (by equipment)
Dumbbells 37, barbell/plates 30 plus 8 lifting platform, 4 power cage, 4 flat bench, 3 EZ bar, kettlebells 24, cables 22 plus pulldown/row/preacher rows, Smith machine 14, resistance tubes 20, stability ball 16, suspension trainer 16, medicine and wall balls 13, plyo box 10, battle rope 7, jump rope 6, half ball 6, ab wheel 3, foam roller 7, and cardio machines (treadmill, curve, elliptical, rower, ski erg, three bikes).
Requested families covered: sumo, deficit, single-leg, Jefferson and snatch-grip deadlifts; lunge, split squat and step-up types; curl, press and row types; carries (waiter, rack, goblet, suitcase, Zercher, plate hug, bottoms-up); plate work; neck/grip/forearm (static holds, reverse and behind-back wrist curls, radial deviation, forearm rotation).
Grip, stance, angle, tempo, range and unilateral options are mostly added as variation rows (the 531 file), following your anti-bloat rule. Separate exercise rows exist only where the emphasis or movement pattern changes.

## Things I did NOT write (blocked by your own notes)
- Rope or ankle-strap cable moves (no rope or ankle strap photographed): triceps rope pushdown, rope face pull, cable kickback, cable hip abduction.
- Pull-ups, hanging leg raises and cage bench work (no pull-up bar or bench-in-cage confirmed).
- Standing Multi Flight (function unknown).
- Landmine moves (no landmine sleeve listed).
- Decline bench moves (decline not confirmed on either adjustable bench).
- Nordic curls and Spanish squats (need a fixed anchor).

## Owner checks
- Suspension Trainer rows say "Confirm the anchor first" until the anchor point is confirmed.
- Resistance band rows that anchor (lat pulldown, chest fly, Pallof, woodchop) also need a safe door/anchor point. Lateral walk and hip abduction need a loop band, not handle tubes.
- Medicine ball side slam is flagged "slam-rated ball only". Wall ball throws need a wall-rated ball.
- Olympic lifts (power clean, hang clean, high pull, push jerk, snatches) are difficulty 3 and say to learn with a coach. Bumper plates are not confirmed.
- Foam roller rows are recovery work, so they are kind=bodyweight and reps are seconds.

## Conventions and review items
- Muscle ids: main CSV uses core ids only. Adductors, abductors, hip flexors and delt/chest heads are in `proposed_muscles`. Where the primary would be one of those, I used the same placeholder as your notes (adductors goes to quads, abductors to glutes, hip flexors to abs).
- Holds and carries: reps are seconds, and the cue says so.
- `track_fit` and `difficulty` come from a simple rule (difficulty, beginner_friendly, pattern, kind), not from TIERS_TRACKS_RULES.md, which was not read. Please review. Rep ranges are generic.
- Cardio rows have blank reps, like your existing cardio.
- Content is from general training knowledge. No web search, no sources.
- Not covered: dumbbell weight range, plate sizes and bench decline are unknown, so no load advice was written.
