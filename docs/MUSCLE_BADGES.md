# MUSCLE_BADGES (MB) — bodyweight-relative strength tiers per muscle

Spec of record: `contract/engines.md` section 26. Phases 45 (data), 46 (engine), 47 (screens). Not the same as the gym's overall **Tiers/Tracks/XP** (Admin-controlled, `TIERS_TRACKS_RULES.md`): this is personal, per muscle, works standalone.

## The ladder
Wood -> Beginner -> Bronze -> Silver -> Gold -> Platinum -> Diamond -> Master -> Olympian. Shown as shield crests with the tier name always written; colours are tokens (`DESIGN_TOKENS.md`), no purple/violet/magenta/pink.

## How a muscle gets its badge (plain words)
1. Pick benchmark lifts that train the muscle (e.g. chest: bench press; lats: pull-up, lat pulldown, row).
2. Turn your best recent set into an estimated 1-rep max (sets of 1-12 reps only, warm-ups ignored).
3. Compare it with the tier thresholds **for your bodyweight and sex**, scaled the way sport science recommends (strength divided by bodyweight to the power 0.67, not a plain ratio).
4. The muscle's badge is the best of its benchmark lifts (secondary lifts count one tier lower). Groups and the overall rank are medians.

## Why "2x bodyweight" is not always Diamond
Each lift has its own ladder. A 2x bodyweight bench is Olympian-level (the 90th percentile of competitive male powerlifters benches about 1.95x), while a 2x bodyweight squat is roughly Platinum. The app shows each tier's target in kg at your weight and as "x bodyweight".

## Examples (male 80 kg, from the spec)
Bench: Silver 1.07x, Gold 1.33x, Diamond 1.75x, Olympian 1.95x. Squat: Silver 1.56x, Gold 1.92x, Diamond 2.55x, Olympian 2.83x. Deadlift: Silver 1.79x, Gold 2.21x, Diamond 2.93x, Olympian 3.25x.

## What the app asks for
Sex (male / female / prefer not to say = estimated) and bodyweight. Without bodyweight the badges stay hidden; nothing is assumed. Age is not used in v1.

## Honest limits (shown on the screen)
Weights are self-logged and not verifiable; machines and cables differ between brands, so machine ladders are looser; anchors come from competitive lifters, so most people will sit between Wood and Gold and Olympian is genuinely elite; only squat, bench and deadlift anchors are published, the others are derived or estimated and under review; this is a motivation guide, not a medical or competitive ranking.

## Extras
- **Peak tier** is kept forever; the current tier uses the last 365 days. **Rusty** tag after 42 days without training (never demotes).
- **Experience meter** (lifetime weighted sets) shows effort separately from strength.
- Exercises with no ladder still count for experience and the heatmap.
- Future idea (not in plan): a gym calibrates thresholds from its own members' data.

---

# Phase 45 data spec (frozen 2026-11-20): files, rules, groups, screens

Data files live in `contract/dataset/` (read-only source; Phase 46 reads them). Built once by a throwaway generator from the 634-row master list `exercise_categories/exercise_categories_all.csv`; they are authored data, not research output.

## Files and counts
| File | Rows | Columns |
|---|---|---|
| `strength_ladders.csv` | 42 ladders (3 published, 6 derived, 33 estimate) | `ladder_id,name,kind,bw_fraction,anchor_m,anchor_f,ref_bw_m,ref_bw_f,muscles,source,notes` |
| `tier_fractions.csv` | 9 tiers | `tier_id,name,position,fraction,experience_sets` (fractions and experience thresholds from engines.md 26.2 / 26.6) |
| `ladder_rules.csv` | 297 rules | `rule_id,priority,match_on,keywords,excludes,ladder_id,factor,load_mode,confidence,note` |
| `strength_ladder_map.csv` | 634 rows (one per exercise): 277 mapped (43.7%), 357 `none` | `slug,ladder_id,factor,load_mode,rule_id` |

- `muscles` = `muscle_id:rank_weight;...` using ids from `detailed_muscles/muscle_taxonomy_detailed.csv`. Weight >= 0.6 ranks the muscle; 0.3 to 0.6 ranks it one tier lower (engines.md 26.5). Every ladder has at least one muscle at >= 0.6.
- `source`: `published` (squat, bench, deadlift: 90th percentile, ages 18-35), `derived` (a fixed ratio of a published lift, written in `notes`: overhead press 0.65 x bench, barbell row 0.85 x bench, close-grip bench 0.90 x bench, Romanian deadlift 0.85 x deadlift, good morning 0.40 x deadlift, hip thrust 0.92 x deadlift; female anchor = the same ratio x the female published anchor) or `estimate` (the author's judgement from general strength-standards knowledge; no citation).
- `ref_bw_m` 80 and `ref_bw_f` 60 on every row (changing one ladder's reference is allowed; the formula uses the row's own value).
- `bw_fraction` is used for `kind=bodyweight`: pull-up 1.0, chin-up 1.0, dip 0.95, push-up 0.65, back extension 0.6. e1RM load = `bw_fraction x BW + added weight`; the anchor is compared with that total load.
- Anchors for loaded ladders are the ratio of the total load (both hands for dumbbell ladders).

## How a rule picks a ladder (for Phase 46)
Normalise the slug: lower-case, every run of non-letters/digits becomes one space. Rules are tried in `priority` order; the first match wins.
- `match_on=slug`: `keywords` is one exact slug (every mapped exercise has its own exact row, so each factor is a reviewed number).
- `match_on=words`: `keywords` are `|`-separated phrases; a phrase matches when its words appear whole and in order in the normalised slug (a trailing `s` is ignored). `excludes` (`|`) skip the rule. 13 "safety net" rows map future barbell/dumbbell variants at a low-confidence factor; today none of them fires (all current matches come from exact rows). Then `ladder_id=none` rows give a reason (cardio, static holds, explosive lifts, mobility, assisted, bands/suspension/balls, neck). Anything left over is also `none`.
- `factor` = the load you can typically lift in this exercise divided by the load you can lift in the ladder lift. `benchmarkE1RM = Epley(load, reps) / factor`. Harder variants have a factor below 1 and earn more credit (incline press 0.85, decline push-up 0.90); easier ones above 1 (incline push-up 1.25, rack pull 1.15 credits less per kg).
- `load_mode`: `total` = the logged weight is the whole load (barbell, machine, cable stack, or ONE dumbbell/kettlebell held in one or both hands); `per_hand` = the logged weight is per dumbbell and the engine uses 2 x; `bodyweight` = `bw_fraction x BW + logged added weight` (the logged weight is extra load, 0 if none).
- Unilateral lifts with one dumbbell use `total` with a low factor (one-arm row 0.45, single-arm dumbbell bench 0.38); the same lift with two dumbbells uses `per_hand`.
- `none` = no ladder: the exercise still counts for the experience meter and the heatmap.

## Decisions taken
- **Assisted lifts are not mapped in v1** (assisted pull-up, chin-up, dip): the assistance weight is not defined in the contract. Open item for Phase 46 / a later contract change.
- **Not mapped on purpose:** cardio, carries, plank and other holds, plyometrics and Olympic-style lifts, kettlebell swings and snatches, mobility/foam-roller work, bands, suspension trainers, medicine and stability balls, neck work (no group among the 11), loaded Pallof variants kept light (mapped, factor 0.50 to 0.60).
- **Groups for the group tier** come from `muscle_taxonomy_detailed.csv` `parent_group`: Chest = chest, upper_chest, lower_chest; Back = back, lats, rhomboids_teres, serratus_anterior, traps, upper_traps, mid_lower_traps; Shoulders = shoulders, front/side/rear_delts, rotator_cuff; Biceps; Triceps; Forearms; Core = abs, obliques, lower_back, hip_flexors; Glutes = glutes, abductors; Quads = quads, quads_lower, adductors; Hamstrings; Calves = calves, soleus, tibialis_anterior. `neck`, `full_body`, `cardio` belong to no group. A "ranking ladder" for a group has a muscle of that group at weight >= 0.6.
- Ranking ladders per group (verified): Back 8, Biceps 4, Calves 2, Chest 5, Core 7, Forearms 3, Glutes 8, Hamstrings 5, Quads 5, Shoulders 6, Triceps 6 (minimum 2). Calves is the thinnest: standing and seated raise only.
- The family fan-out is largest for back squat (38 exercises), barbell curl (24), overhead press (17), barbell row (17), deadlift (13). Every ladder has at least one mapped exercise.

## Screen sketches (text; Phase 47 builds them)
**Badge wall** (`/profile/muscles`), 360 px wide, one column:
```
Muscle badges                      [Settings]
Overall: Silver   (provisional until 5 groups are ranked)
Estimated  (shown only when sex is "prefer not to say")
[Body figure coloured by tier]   [Text list]
Chest   Gold      ##########--  2 of 5 lifts ranked
Back    Silver    ######------
...
Strongest: Quads (Gold)    Weakest: Calves (Wood) -> open weak-spot finder
Experience  Bronze   (lifetime weighted sets; separate from strength)
Honest-limits note (below)
```
**Per-muscle sheet:** crest + tier name written, "Chest: Gold", progress bar "62% to Platinum", "Platinum at your 82 kg = 1.56x bodyweight (128 kg bench)", best lift and date, "Peak: Diamond" when current is lower, Experience meter, "Rusty - not trained for 52 days" tag, "Lifts that rank this muscle" (2-3 ladders with your best e1RM each), Unranked muscles show "Log bench press, dumbbell press or push-ups to rank this muscle".
**First-run prompt:** "To rank your strength we need two things. Sex: Male / Female / Prefer not to say (badges marked Estimated). Bodyweight: ___ kg. [Skip: badges stay hidden]". Never assumed.

## Honest-limits wording (final text; goes into `en.ts` in Phase 47)
"Badges compare your logged lifts with strength standards for your bodyweight and sex. The weights are typed in by you and cannot be checked, and machines and cables differ between brands, so those ladders are looser. The published targets come from competitive powerlifters, so most people will sit between Wood and Gold, and Olympian is genuinely elite. Only the squat, bench press and deadlift targets are published; the other lifts use our own estimates, which are still being reviewed. This is a motivation guide, not a medical or competitive ranking."

## Check against the primary paper (2026-11-20)
The published anchors were re-checked against the abstract record of van den Hoek DJ, Beaumont PL, van den Hoek AK, Owen PJ, Garrett JM, Buhmann R, Latella C. *Normative data for the squat, bench press and deadlift exercises in powerlifting: Data from 809,986 competition entries.* J Sci Med Sport 2024;27(10):734-742 (PubMed 39060209; ECU repository record). 90th percentile, ages 18-35, x bodyweight: squat 2.83 M / 2.26 F, bench 1.95 / 1.35, deadlift 3.25 / 2.66 - **match the spec**. Data are drug-tested, unequipped competitions, 10th to 90th percentile, by sex, age group and weight class. **Still open:** the full-text tables were not read (so whether 2.83 etc. are the all-weight-class value or a specific class is unverified), and the paper has no figure for the other lifts.

## Assumptions for sport-scientist review (all flagged [A9])
1. The 9 tier fractions (0.25 ... 1.00) and the experience thresholds.
2. Reference bodyweights 80 kg (M) and 60 kg (F), and exponent 0.67.
3. Using the 90th percentile of competitive lifters as the Olympian anchor for all lifts.
4. All 6 derived ratios and all 33 estimated anchors (`strength_ladders.csv`, source column).
5. Bodyweight fractions: pull-up 1.0, chin-up 1.0, dip 0.95, push-up 0.65, back extension 0.6.
6. All 277 exercise factors (`ladder_rules.csv`, confidence column: low ones first).
7. The rank-weight split at 0.6 / 0.3 and the "one tier lower" rule for secondary lifts.
8. Group membership (parent_group) and calves having only two ladders.
9. Machine and cable ladders are treated like free-weight ladders despite brand differences.
10. Reps 1-12 for e1RM, the 4.0 x BW plausibility cap.

---

# Calibration v2 (Phase 112): tiers that mean something

**Why.** A single 100 kg x 1 kneeling cable crunch made Abs Olympian, with Experience still at Wood. Three causes:
1. The estimated ladders' Olympian anchors were guesses, often a third to a half of a real elite lift (cable crunch Olympian was 1.3 x BW; public elite gym standards are about 1.6 to 2.2 x BW).
2. One set in the last year could crown a muscle: no repeat, no training history.
3. Epley doubles the load at 30 reps, so high-rep core sets read as huge maxes.

**What changed** (code: `src/shared/badges/calibration.ts`; contract files untouched):
- **Anchors.** 33 ladders re-anchored so Olympian is about the Elite row of public gym standards (Strength Level, FitnessVolt), where the published squat/bench/deadlift anchors already sit. Squat, bench, deadlift and their derived ladders are unchanged, as are pull-up, chin-up, dip, push-up, back extension, leg press, lat pulldown, seated row and the curls (they already matched). Applied through `withCore`, idempotent.
- **Repeat rule (strict).** From Gold up, the benchmark must be reached in two different workouts. One workout is capped just under Gold.
- **Estimate cap (strict).** Ladders whose source is `estimate` stop at Diamond. Only published or derived lifts reach Master or Olympian.
- **Experience lead (strict).** A muscle's strength tier is at most 3 tiers above its experience tier (Wood experience: Silver; Platinum needs 40 weighted sets, Diamond 120, Master 300, Olympian 650).
- **Soft high reps (strict).** Reps above 12 count a third each in the e1RM (30 reps = 18 effective).
- **Peaks reset once.** `BADGE_CALIBRATION = 2`; the stored profile's peaks are dropped and rebuilt when its calibration is older.
- **UI.** The muscle sheet says when a tier is held (`badge.held.*`); "1 more set" is singular; the limits note is rewritten.
- `BadgeInput.strict` switches the new rules on; the app always passes `strict: true`. Pure contract tests keep it off.

**Olympian kg, before -> after** (male 80 kg / female 60 kg):

| Ladder | Male before | Male after | Female before | Female after |
|---|---|---|---|---|
| Kneeling cable crunch | 104 | 152 | 54 | 96 |
| Cable woodchop | 64 | 92 | 33 | 48 |
| Hack squat | 192 | 240 | 114 | 144 |
| Leg extension | 128 | 184 | 72 | 114 |
| Leg curl | 80 | 128 | 45 | 75 |
| Hip abduction | 144 | 208 | 96 | 132 |
| Hip adduction | 144 | 192 | 90 | 120 |
| Cable pull-through | 104 | 140 | 66 | 84 |
| Standing calf raise | 192 | 256 | 102 | 138 |
| Seated calf raise | 112 | 224 | 60 | 126 |
| Barbell shrug | 208 | 264 | 114 | 144 |
| Face pull | 72 | 96 | 36 | 54 |
| Machine shoulder press | 96 | 112 | 51 | 60 |
| Lateral raise (both hands) | 52 | 68 | 27 | 36 |
| Rear-delt fly | 72 | 92 | 36 | 48 |
| Machine chest press | 128 | 152 | 66 | 81 |
| Pec deck / cable fly | 80 | 112 | 42 | 60 |
| Triceps pushdown | 104 | 116 | 54 | 60 |
| Skull crusher | 76 | 84 | 36 | 42 |
| Wrist curl | 80 | 120 | 39 | 66 |
| Reverse curl | 64 | 72 | 30 | 36 |
| Reverse wrist curl | 36 | 48 | 18 | 24 |
| Core ladders (crunch, sit-up, leg raise, ab wheel, plank, side plank) | new in Phase 94 | 100 to 136 | | 63 to 84 |

**Honest limits.** Public tables are self-logged and noisy (cable stacks, wrist work), so those anchors take the cautious end; every re-anchored ladder is still an estimate and is capped at Diamond. Women's anchors keep the contract's lower ratio of the men's. Cable stack weight is not corrected for pulley ratio. The tier fractions (25, 40, 55, 68, 80, 90, 95, 100 percent of the anchor) are unchanged.
