# PROGRESSIVE_OVERLOAD_RULES — defaults [A] (User Phase 36 freezes; identical in both zips)

If the owner supplies his prototype, **his logic wins** where it differs, and the freezing phase records the differences. Everything here is pure logic in `src/shared/engine/*`.

## Definitions
- **Working set:** tag `normal` or `superset`. `warmup` and `drop` sets never count toward progression, PRs or e1RM.
- **Rep range** `[rep_min, rep_max]` per exercise (defaults from the track, `TIERS_TRACKS_RULES.md`; editable per program item).
- **Step** = `machines.weight_step_kg` of the exercise's machine (default 2.5 kg; free weights 2.5; stacks may be 5 or 1.25). Suggestions are always multiples of the step.
- **Session result** for an exercise = its working sets from one session.

## e1RM
Epley: `e1rm = weight * (1 + reps / 30)`, for `1 <= reps <= 12` (reps = 1 -> weight). Reps > 12 or weight 0 (bodyweight without added load) -> no e1RM. Rounded to 2 dp (`roundKg`), displayed to 0.5.

## PR kinds (per exercise, working sets only)
1. **Weight PR:** heaviest weight lifted for >= 1 rep.
2. **Rep PR:** most reps at a given weight (same weight within 0.01 kg).
3. **e1RM PR:** highest e1RM.
4. **Volume PR:** highest session volume (sum weight x reps) for that exercise.
A set can earn several PRs. The first-ever result for an exercise is a baseline, not a celebration (no PR on first log). XP for PRs is capped per day (`TIERS_TRACKS_RULES.md`).

## Double progression (default for strength/machine work)
Given rep range 8–12, step 2.5:
- All working sets reached `rep_max` (and RPE <= 9 when RPE was logged) -> next session **weight + step**, target reps reset to `rep_min`.
- Otherwise keep the weight; target = last session's reps **+1** on each set that is below `rep_max`.
- If the lowest set fell below `rep_min` twice in a row -> hold weight, target `rep_min`, flag "check form/rest".

## Linear progression (default for low-rep strength track, optional per program item)
- All working sets hit the target reps -> **weight + step** next session.
- Missed on one session -> hold. Missed on 3 consecutive sessions -> **deload** (below).

## Intensity dial (Light / Moderate / Hard / Beast)
Changes how aggressive the suggestion is. Target RPE and weight jump:
| Intensity | Target RPE | Weight jump rule |
|---|---|---|
| Light | 6–7 | Add weight only after **2** consecutive qualifying sessions |
| Moderate | 7–8 | Add weight after 1 qualifying session |
| Hard | 8–9 | As Moderate; if every set beat the target by >= 2 reps at RPE <= 7, add **2 steps** |
| Beast | 9–10 | As Hard, threshold RPE <= 8; deload threshold is 4 failed sessions instead of 3 |

## Plateau and deload
- **Plateau:** over the last 4 sessions of the exercise, the best e1RM did not improve by >= 1% over the earlier best. Shown as a hint, not an error.
- **Deload suggestion:** 3 consecutive no-progress sessions (4 for Beast) -> suggest `weight * 0.90` rounded to the nearest step, same rep target at `rep_min`.
- **Level-up suggestion:** 4 consecutive weeks of hitting the planned sessions and progressing on >= 60% of exercises -> suggest the next track/intensity (admin or trainer approves).

## Safety clamps
- Suggested weight never < 0, never above `last working weight + 2 * step` (or +4 steps for Beast with RPE <= 7) in one jump, never changes by more than 10% in one step unless step itself is larger.
- Unknown history -> no suggestion (the UI shows "log this once to unlock suggestions").
- Machine `out_of_order` -> no suggestion; offer alternatives (same primary muscle, active).

## Worked examples (the freezing phase expands to >= 8 and tests copy them)
1. e1RM: 60 x 8 -> 60 * (1 + 8/30) = **76.00**. 100 x 5 -> **116.67**. 40 x 13 -> no e1RM.
2. Double progression: bench, range 8–12, step 2.5, last session 40 x 12, 12, 12 (RPE 8) -> next **42.5 x 8** target.
3. Double progression hold: 40 x 12, 11, 10 -> hold 40, target 12, 12, 11.
4. Deload: 60 kg, 3 sessions no progress, step 2.5 -> 60 * 0.9 = 54 -> nearest step multiple **55**.
5. Warm-up exclusion: sets 20 x 10 (warmup), 40 x 10, 40 x 10 -> volume counts only the two 40 sets (800).

**Standalone users** choose their own rule per exercise (linear / double progression / off) and an intensity; the weight step comes from the machine (`weight_step_kg`, blank = 2.5 kg) or the user's own setting for custom exercises. Gym tracks only change the defaults.
