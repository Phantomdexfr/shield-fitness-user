# ENGINES — shared pure-logic spec (implemented once per zip, tested against the same fixtures)

Defaults marked **[A]** are assumptions the owner can change later through data, not code. All functions are pure: no DOM, no network, no clock (time is passed in). Fixtures live in `contract/fixtures/` and are CREATED by the phase named in each section; the other zip copies them verbatim.

## 1. Data shapes (TypeScript-ish; both apps use these exact JSON shapes)
```ts
type Ref = { kind: 'lib'; slug: string } | { kind: 'custom'; id: string };   // exercise reference
type Item = { ref: Ref; sets: number; repMin: number; repMax: number; restSec: number;
              note?: string; tag?: 'normal'|'superset'|'drop'; supersetGroup?: string; variation?: string;
              setup?: Setup };   // chosen grip/handle/position (section 13); absent = exercise default
type Day = { id: string; name: string; targetMuscles: string[]; items: Item[] };       // muscle ids from the taxonomy
type Routine = { id: string; name: string; source: 'mine'|'gym'|'template'; daysPerWeek: number;
                 weekdays: number[];            // 0=Mon..6=Sun, may be empty = "flexible, no fixed weekdays"
                 splitStyle: string;               // free: 'ppl'|'upper_lower'|'full_body'|'bro'|'arnold'|'phul'|'custom'|any label
                 days: Day[]; active: boolean;
                 schedule?: Schedule };          // section 16; absent = legacy weekdays[] behaviour
type SetLog = { weightKg: number|null; reps: number|null; seconds?: number; rpe?: number; tag: 'normal'|'warmup'|'drop'|'superset'; doneAt: string };
type SessionItem = { ref: Ref; variation?: string; setup?: Setup; status: 'todo'|'doing'|'done'|'skipped'|'later';
                     skipReason?: 'busy'|'pain'|'no_time'|'too_hard'|'other'; sets: SetLog[]; order: number };
type Session = { id: string; clientId: string; startedAt: string; endedAt?: string; routineId?: string; dayId?: string; items: SessionItem[] };
type Setup = { grip?: Grip; width?: Width; handle?: Handle; position?: Position; arms?: Arms; bench?: Bench; angleDeg?: number };
// axis value vocabularies: section 13
type CustomExercise = { id: string; name: string; slug: string /* my-<kebab> */; kind: 'strength'|'cardio'|'bodyweight';
  machineSlug?: string|null; muscles: { id: string; role: 'primary'|'secondary'|'stabiliser'; emphasis: 'high'|'medium'|'low' }[];
  repMin: number; repMax: number; youtubeUrl?: string; notes?: string };
```
**Flexibility rule baked into the shapes:** no field forces an order. `status` can change in any direction; a session can end with items still `todo`; items can be added, removed, reordered, skipped and revisited at any time.

## 2. Muscle weight of one exercise row  (`muscleWeight`)
Source: `dataset/detailed_muscles/exercise_muscle_map.csv` (`role`, `emphasis`). `emphasisFactor`: high 1.0, medium 0.6, low 0.3. `role` primary/secondary use the factor as is; **stabiliser x0.5; mobility 0** (not counted in heat). **[A]**
**Fallback (42 exercises have no map rows):** each core id in `primary_muscles` counts as primary/medium (0.6), each in `secondary_muscles` as secondary/low (0.3); core ids expand to the detailed children listed in `muscle_taxonomy_detailed.csv` `parent_group`. **[A]**
For a custom exercise the user's chosen role/emphasis are used the same way.

## 3. Variation shift (`applyVariation`)
Source: `variation_muscle_shift.csv` (`shift` = `more` | `less`). `more` -> that muscle's weight x1.25 (capped at 1.0); `less` -> x0.75; if a `more` muscle is absent from the base map, add it with weight 0.3. **[A]** If the logged variation has no shift row, base weights are used (the file covers a subset; see `variation_shift_skipped.csv`).

## 4. Heat of one muscle over a period (`muscleHeat`)
`raw(m) = sum over working sets in the period of muscleWeight(m, exercise, variation)`. Working set = tag `normal`, `drop` or `superset` (not `warmup`). Cardio/timed rows count as 1 set per 5 minutes. **[A]**
`ref` (what counts as "full"): `max(user's 90th-percentile weekly raw for that muscle over their history, 6)` for a week; x4 for a month; x(days/7) for a custom range; ÷3 for a single day. **[A]**
`heat01 = clamp(raw / ref, 0, 1)`. Band = 0 if raw = 0, else 1..5 by thresholds 0.2/0.4/0.6/0.8. Parent regions on the figure (e.g. chest drawn as one unit) show the MAX of their children; tapping shows each child. **[A]**
Compare mode = two periods, per-muscle delta of `heat01`.
**Fixtures:** `fixtures/heatmap_*.json` — created in User Phase 43 (>= 8 worked examples with exact numbers).

## 5. Recovery clock (`recoveryState`)
Per muscle: `lastTrainedAt` = latest working set whose muscle weight >= 0.6. `target hours` by size: large (quads, glutes, hamstrings, chest, back/lats, lower_back) 72; medium (shoulders, biceps, triceps, traps, abs, obliques) 48; small (forearms, calves, neck, adductors, abductors, rotator_cuff, etc.) 36. **[A]**
`state`: `fatigued` (< 50% of target), `recovering` (50-99%), `ready` (>= 100%), `fresh` (>= 2x target or never trained). **Fixtures:** User Phase 48.

## 6. Avoid / sore marks (`avoidFilter`)
User marks muscles as `avoid` (hide) or `sore` (demote). An exercise is excluded under `avoid` when any marked muscle is a primary muscle of it at medium/high emphasis, or a secondary at high. `sore` subtracts 2 from its score instead of excluding. `injury_cautions` free text is shown as a notice, never parsed. **[A]**

## 7. Suggestion score (`scoreExercise`)
`score = 3*primaryEmphasis(target) + 1*secondaryEmphasis(target) + compoundBonus + trackFit + beginnerBonus + favourite + recency + skipPenalty + sorePenalty + jitter`
- primaryEmphasis/secondaryEmphasis: emphasisFactor of the target muscle in the map (0 if absent).
- compoundBonus: +2 if category `compound` and the slot is a main slot, +1 if `isolation` in an isolation slot, else 0.
- trackFit +1 if the user's track is in `track_fit`. beginnerBonus +1 if level is beginner and `beginner_friendly=yes`, or -1 if difficulty 3.
- favourite +2; hidden or avoided -> excluded; machine `maintenance`/`out_of_order` -> excluded (or shown last with a badge when the user asked for "show all").
- recency: -1.5 if done in the user's previous session (variety).
- skipPenalty: -1.5 if skipped >= 3 of the last 5 times it appeared (local stats).
- jitter: deterministic pseudo-random in [-0.5, 0.5] seeded by (date, slug), so lists are stable within a day and fresh the next. **[A]**

## 8. Tap-a-muscle list order (`muscleExerciseList`)  **[A, owner may reorder]**
1. **Suggested for you** — top 6 by score.
2. **Built for you (priority)** — exercises already in the active routine/this week's days, gym programs, favourites and the user's custom exercises for this muscle, by score.
3. **More** — everything else for the muscle, shuffled with the day-seeded jitter. "Surprise me" picks one at random from 1-3 respecting filters.
Filters (all optional): equipment/machine, category, kind, difficulty, track, unilateral, beginner-friendly, injury-safe.

## 9. Skip -> alternatives (`alternativesFor`)
Input: the skipped item, the reason, avoid marks, machine statuses, the policy. Candidate pools in order:
1. **Same exercise family:** its other variations (`exercise_variations` + new variation files, deduplicated).
2. **Same primary muscle + same movement pattern + same category** (any machine).
3. **`substitution_groups.csv`** alternatives where present.
4. **Same primary muscle, any pattern.**
Reason handling: `busy` -> drop candidates that need the same machine; `pain` -> apply `avoidFilter` to the area the user picks (or the exercise's primary muscles) and prefer lower difficulty; `no_time` -> prefer fewer-set or single-joint options; `too_hard` -> only difficulty <= the item's difficulty, prefer easier family members. Return up to 5, ranked by `scoreExercise`. Never auto-replace: the user always taps to choose.

## 10. Day builder (`buildDay`)
Inputs: target muscles (or a split day label that maps to muscles), time box minutes, track, level, avoid marks, favourites. Slots: 1-2 warm-up (category `warmup` or `also_usable_as_warmup`, matching target muscles) + a ramp-up set note for the first heavy lift; 1-3 main compounds; 2-4 isolation; optional finisher (conditioning/cardio); 1 cooldown/recovery (category `recovery`). Time per exercise = sets x (45 s work + restSec). Fill slots in order until the time box is full. Output is a normal `Day`, fully editable.
Split-label -> muscles map: push = chest, front_delts, side_delts, triceps; pull = lats, back, rear_delts, biceps, traps; legs = quads, hamstrings, glutes, calves, adductors; upper/lower/full body/bro per `docs/ROUTINE_BUILDER.md` (User zip). **[A]**

## 11. Overload, 1RM, PR, XP, tiers
See `docs/reference/PROGRESSIVE_OVERLOAD_RULES.md` and `docs/reference/TIERS_TRACKS_RULES.md` (identical in both zips). Worked examples become fixtures in User Phase 36 (overload) and Admin Phase 41 (XP/tiers).

## 13. Setup options (grips, handles, positions, benches)  — NEW
Every exercise can offer **setup options** on six axes. A `Setup` is a choice per axis; omitted axis = the exercise's default.
| Axis | Values |
|---|---|
| `grip` | `pronated` `supinated` `neutral` `mixed` `hammer` `reverse` (reverse = supinated on a pulling/pressing machine, or the reverse-direction mode, see below) |
| `width` | `wide` `shoulder` `narrow` |
| `handle` | `straight_bar` `ez_bar` `curved_lat_bar` `rope` `v_handle` `d_handle` `mag_handle` `strap` `stirrup` `bare_handles` |
| `position` | `seated` `standing` `kneeling` `half_kneeling` `lying` `incline` `decline` `leaning` `chest_supported` |
| `arms` | `both` `single` `alternating` |
| `bench` | `none` `flat` `incline` `decline` `utility` `preacher` `stability_ball` |
`angleDeg` (0-90) is optional free input for incline/decline.
**Compiled from data:** `exercise_variations.csv` + `new_exercises/*variation*.csv` (about 4,750 free-text rows). The compiler (User Phase 10) tags each row with the axes it mentions using a keyword rule table (`dataset/setup_rules.csv`, created in Phase 8) and writes `setup_options.json` (per exercise: the list of options actually offered). Rows it cannot tag stay as plain text variations. A review report lists untagged and ambiguous rows for the owner.
**Reverse modes:** machines whose opposite action is a separate exercise (e.g. Pec Deck Fly vs Reverse Pec Deck) stay separate exercises AND are linked as `modes` of the machine (section 15).
**Search:** setup words are indexed (section 14) so "lat pulldown reverse grip" finds the exercise with that setup preselected.

## 13b. Option-aware muscle weight (`applySetup`)
Order: base weights (section 2) -> variation shift (section 3) -> setup shift. Setup shift source = `dataset/setup_muscle_shift.csv` (axis, value, applies_to pattern, muscle_id, shift more|less, authored in Phase 8; **[A]** flagged for physio review). Same multipliers as section 3 (more x1.25 cap 1.0, less x0.75, absent+more adds 0.3). Multiple axes stack multiplicatively, then cap at 1.0. If the exact (exercise, variation) row exists in `variation_muscle_shift.csv` it wins and the setup shift is skipped for that muscle (no double counting).
Examples (rules, to become fixtures `setup_*` in Phase 13): lat pulldown + supinated -> biceps more, lower lats more; + wide pronated -> outer lats more, biceps less; reverse pec deck + neutral -> rear delts more, traps less.

## 14. Fuzzy search (`fuzzySearch`)  — NEW
Offline, pure. Input: query string + filters; index built at compile time (`search.index.json`). Documents = exercises (name, aliases, machine name, primary/secondary muscle names, category, setup words) and machines (name, aliases, brand).
1. Normalise: lower-case, strip diacritics/punctuation, expand abbreviations/aliases from `dataset/search_aliases.csv` (e.g. butterfly -> pec deck fly, lat pd -> lat pulldown, rdf -> rear delt fly, db -> dumbbell, bb -> barbell, ohp -> overhead press).
2. Tokenise; every query token must match some token by exact, prefix, or edit distance <= 1 (length 4-6) / <= 2 (length >= 7); transpositions count as one edit.
3. Score per token: exact 1.0, prefix 0.85, fuzzy 0.6; field weights: name 1.0, alias 0.9, machine 0.6, muscle 0.5, setup 0.5, category 0.3; document score = sum over tokens of best field score, plus 0.3 if tokens appear in query order in the name, minus 0.05 per unmatched name token.
4. Tokens that name a setup value (reverse, neutral, wide, rope ...) additionally return `suggestedSetup` for the top hit.
5. Ties: shorter name first, then slug. Deterministic, no randomness. Budget: < 50 ms for 700 documents on a mid phone.
**Fixtures:** `fixtures/search_*.json` created in User Phase 20 (>= 20 queries incl. typos and aliases).

## 15. Machine reach map (`machineReach`)  — NEW
For a machine M and an optional filter `{handle?, bench?, position?}`:
`reach[muscle] = max over exercises E on M (matching the filter) of weightOfPrimary(E) + 0.5 * mean secondary(E)`, capped at 1.0, using section 2 weights with `applySetup` for each option the filter allows. Also returns `count[muscle]` (number of exercises/setups reaching it >= 0.3) and `notReachable` (muscles with reach 0). Bands for display = heat bands (section 4) on reach (0-1 scaled to 0-5 by 0.2 steps).
**Companions:** a machine lists its `companions` (benches and attachments that unlock more options, from `dataset/machine_companions.csv`, authored in Phase 8). Filtering by a companion restricts to exercises that use it.
**Modes:** machine pages list `modes` (e.g. Pec Deck: fly / reverse fly; Lat Pulldown: wide / reverse / neutral).
**Known data gaps (see `dataset/DATASET_GUIDE.md`):** Cable Crossover reaches 20 of 28 mapped muscles in the current data even though physically it can reach nearly all; the Phase 8 gap list names the missing exercises. The map must show "not reachable with current data" wording, never claim a machine cannot train a muscle.
**Fixtures:** `fixtures/reach_*.json`, created in User Phase 23.

## 16. Schedule and rest days (`Schedule`, `nextTrainingDay`)  — NEW
```ts
type Schedule =
 | { mode: 'weekdays'; weekdays: number[] }                                 // 0=Mon..6=Sun; others are rest days
 | { mode: 'cycle'; pattern: ('T'|'R'|'A'|'M')[]; startDate: string }       // any length 2-14, e.g. TTR, TTTRTTR; T=train A=active recovery M=mobility R=rest
 | { mode: 'every_n'; n: number }                                           // train every n days
 | { mode: 'floating'; maxPerWeek: number; minRestDays?: number }           // decided by the recovery clock, no fixed days
 | { mode: 'ab_weeks'; weekA: Schedule; weekB: Schedule };
```
- Days of the routine are used in order; `nextDayFor(date)` returns the Day whose turn it is (rotating, not tied to weekday unless mode=weekdays).
- **Missed day:** user chooses `shift` (the missed Day becomes today's) or `skip` (rotation moves on). Default shift. **[A]**
- **Rest-day suggestions (hint only, default ON, can be turned off in Settings):** on a planned training day, if >= 60% of that Day's target muscles are `fatigued` (section 5), show "these muscles are still recovering: train anyway / swap to another day / rest". Never blocks.
- **Active recovery / mobility days** suggest a mobility/cooldown set from the dataset (stretch, mobility, light cardio categories).
- **Deload week:** optional flag per week; scales sets x0.6 and loads x0.9 in suggestions. **[A]**
- Presets are templates only: ppl, upper_lower, full_body, bro, arnold, phul, push_pull, custom. No preset restricts the number of days.
**Fixtures:** `fixtures/schedule_*.json`, created in User Phase 32.

## 17. Personal records (three metrics)  — NEW
Per exercise (and per setup if the user opts "separate PRs per grip", default off **[A]**): `bestWeight` (heaviest set with reps >= 1), `bestReps` (most reps in a set, at any weight), `bestVolume` (max weight x reps in one set), plus `bestE1RM` (Epley). A session beats a metric independently; ties do not count; the first logged value is a PR only when the exercise has history elsewhere or the user logs a second session **[A]** (avoids "PR" spam on first use). Bodyweight sets (weight null) count only `bestReps`.
**Fixtures:** `fixtures/pr_*.json`, created in User Phase 37.

## 18. AI review export (`aiReviewText`)  — NEW
Pure function `aiReviewText(scope, history, opts) -> string`. `scope` = `{kind:'session', id}` | `{kind:'range', from, to}` | `{kind:'exercise', slug, lastN}`. Plain text only (no markdown tables, no emoji, no HTML), `\n` line breaks, deterministic.
**Session layout:**
```
[intro prompt, optional, user-editable]
CONTEXT: goal=<goal|unknown>; experience=<level|unknown>; units=<kg|lb>[; bodyweight=<x> only if opted in]
SESSION: <Weekday D Mon YYYY> | <routine/day name> | <duration> min | <n> exercises | <n> sets | volume <v> <unit>
1) <Exercise name> [<setup words, e.g. grip: supinated, handle: rope>] [machine: <name>]
   Set 1: <w> <unit> x <reps> (RPE <r>)   | Set 2: ...
   Note: <text>
   Skipped/swapped: <from> -> <to> (reason)
...
PRS: <exercise: metric new (old)>; ...
MUSCLES (share of weighted volume): chest 38%, triceps 22%, ...
```
**Range layout:** header (from-to, sessions count, total sets, total volume), per-week table in plain lines (sessions, sets, volume), per-muscle weighted sets for the range, then compact per-session lines (`date | name | exercise: top set, sets`), then exercise trends for the 5 most-logged exercises (first, best, latest e1RM). More than 30 sessions -> per-session lines are dropped, weekly summaries kept, with the line `NOTE: detail trimmed to fit`.
**Exercise layout:** last N sessions (default 8) of one exercise: date, sets, top set, e1RM, setup; plus first/best/latest summary.
**Rules:** never include name, photos, body stats, gym or account data unless the user ticks that option; units from settings; hard cap 12,000 characters (trim from the oldest detail, always say so); missing values written as `-`; RPE only when logged. The optional intro prompt defaults to: "Review my training below. Tell me what is going well, what to change, and what to try next. Keep advice practical." and is editable in Settings.
**Fixtures:** `fixtures/aireview_*.json` (User Phase 40).

## 19. Movement patterns and geometry (`movementFigure`)  — NEW
A **movement pattern** describes how the body moves in an exercise class (about 30 patterns: horizontal press, incline press, vertical press, vertical pull, horizontal row, hip hinge, squat, lunge, leg press, leg extension, leg curl, calf raise, biceps curl, triceps extension, lateral raise, front raise, rear fly, chest fly, face pull, crunch, plank, rotation, carry, step-up, hip thrust, shrug, pull-up, dip, back extension, cardio cyclic ...).
- `contract/dataset/movement_patterns.csv`: `pattern_id, name, view (side|front), joints_start, joints_end, path_hint, equipment_glyph, notes`. Joint angles are degrees for 12 joints: `neck, shoulder_l/r, elbow_l/r, hip_l/r, knee_l/r, ankle_l/r, torso_lean`.
- `contract/dataset/exercise_pattern_map.csv`: `slug, pattern_id, source (rule|manual), param` where `param` can override bench angle, torso lean or grip width.
- `contract/dataset/pattern_rules.csv`: keyword rules used to map the 634 exercises; unmatched exercises stay unmapped (no figure, generic muscle map shown instead).
**Rendering:** forward kinematics from fixed segment lengths (shared proportions, male/female variants) draws a faded **start pose** and a solid **end pose** as capsule limbs with joint dots, an arc arrow per primary moving joint with its angle text ("elbow 90 -> 160 deg"), the resistance line (bar/cable/dumbbell/machine glyph), and the working muscles as chips below (weights from section 2). Setup options that change geometry (bench angle, position, width) change the pose parameters.
**Honesty:** angles are typical ranges, not prescriptions; wording says "typical movement". Flagged for coach/physio review (**[A]**). Coverage target >= 85% of exercises mapped, the rest show the plain muscle map.
**Fixtures:** `fixtures/movement_*.json` (User Phase 25): joint sets -> expected 2D points (tolerance 0.5 px).
**Authored data (User Phase 24):** the three files above exist, plus `equipment_presets.csv`; the columns, joint conventions, anchors, param keys and the rule order are frozen in `contract/dataset/MOVEMENT_PATTERN_NOTES.md` (the CSVs carry a few columns beyond the list above: `anchor`, `arm_world`, `default_param`, `twin_start`, `twin_end`, `coach_review`).

## 20. Pocket tools  — NEW
- **Plate calculator** `platesFor(target, bar, inventory, unit)`: greedy from the largest plate, per side, returns plates per side + exact total + remainder (nearest achievable shown if not exact). Defaults **[A]**, editable in Settings: bar 20 kg (15 kg women's, 10 kg EZ), plates 25, 20, 15, 10, 5, 2.5, 1.25 kg (and lb: bar 45, plates 45, 35, 25, 10, 5, 2.5). The gym's real plate sizes are owner data to confirm.
- **Warm-up ramp** `warmupSets(workingWeight, exerciseClass, step)`: only for compound exercises with working weight >= 40 kg (or 90 lb); default ramp 50% x 8, 70% x 5, 85% x 3 (then working sets), rounded to the weight step; bodyweight/isolation/machine-light = no ramp. Ramp sets are tagged `warmup` and excluded from volume and PRs.
- **Smart rest timer** `restSeconds(exerciseClass, lastRepsTarget, history)`: defaults isolation 60 s, compound 90 s, heavy compound (reps <= 5 or >= 85% e1RM) 180 s, cardio/mobility 0; after >= 3 logged rests for that exercise, the median of the last 5 actual rests clamped to 50%-150% of the default.
- **Big-number mode:** a display setting (larger type scale, max contrast, keep screen awake via Wake Lock when supported).
**Fixtures:** `fixtures/pocket_*.json` (User Phase 38).

## 21. Quick workout (`quickWorkout`)  — NEW
Input `{minutes: 15|20|30|45|60, muscles?: string[] | 'full', equipmentMode?, avoid[]}`. Uses the day builder (section 9) with: 15 min = 2-3 exercises, no warm-up ramp, supersets preferred; 30 min = 4-5; time per set = reps x 3 s + rest + 20 s transition; compounds first; respects marks and equipment mode; output total time <= requested time. **Fixtures:** extends `daybuilder_*` (User Phase 33).

## 22. Equipment mode (hotel / home / minimal)  — NEW
Presets map to equipment categories from the dataset: `bodyweight`, `dumbbells`, `bands`, `home` (bodyweight + dumbbells + bands + bench), `gym` (all). Filtering applies to library, suggestions, day builder and swaps. A preset never deletes data; it only filters.

## 23. Weak-spot finder (`weakSpots`)  — NEW
Over the last 28 days: weighted sets per muscle group = sum(sets x muscleWeight). Baseline = median of groups the user trains. A group is **weak** when its value < 40% of the baseline (and the group is not marked avoid/sore). Output the 3 weakest with up to 3 suggested exercises each (suggestion engine, section 6). Needs >= 6 sessions in the period, else says "not enough training yet". **Fixtures:** `fixtures/weakspots_*.json` (User Phase 44).

## 24. Streaks and consistency (`consistency`)  — NEW
Weekly target = scheduled training days in the active routine's schedule (or the user's own target, default 3). A week is **kept** when sessions >= target; planned rest days never count against the user; streak = consecutive kept weeks; one **grace** week per 8 weeks keeps a streak alive **[A]**. Ring fill = sessions / target (cap 100%).
## 25. Why chips (`reasons`)  — NEW
The suggestion engine returns up to 2 reason codes per item: `recovered`, `neglected`, `in_routine`, `built_by_you`, `same_variation`, `favourite`, `progress_ready`, `balances_week`. Each maps to one plain sentence template (text in `docs/EXTRAS.md`), e.g. "Your lats have rested 4 days and got little work this week". Never medical language.

## 26. Muscle strength tiers (bodyweight-relative badges)  — NEW
Per-muscle badges **Wood, Beginner, Bronze, Silver, Gold, Platinum, Diamond, Master, Olympian**, computed from the user's logged lifts relative to bodyweight. Two things are shown per muscle: the **strength tier** (the badge) and an **experience meter** (lifetime weighted sets; section 26.6).

### 26.1 Benchmark ladders
A **ladder** is a benchmark lift with an anchor ratio. `contract/dataset/strength_ladders.csv`: `ladder_id, name, kind (barbell|dumbbell|machine|cable|bodyweight), bw_fraction (bodyweight share counted as load, 0 for loaded lifts), anchor_m, anchor_f, ref_bw_m, ref_bw_f, muscles (muscle_id:rank_weight;...), source (published|derived|estimate), notes`.
- `anchor_*` = the ratio (e1RM / bodyweight) of an **Olympian** at the reference bodyweight.
- Published anchors (age 18-35, 90th percentile of competitive powerlifters, van den Hoek et al. 2024 via BodySpec's summary): squat 2.83 (M) / 2.26 (F), bench 1.95 / 1.35, deadlift 3.25 / 2.66. **All other ladders are `derived` (scaled from these by documented ratios) or `estimate` and are flagged for sport-scientist review [A].**
- About 40 ladders cover the benchmark lifts (squat, bench, deadlift, overhead press, barbell row, pull-up, dip, hip thrust, leg press, lat pulldown, seated row, curl, pushdown, lateral raise, leg curl, leg extension, calf raise, etc.).
- `contract/dataset/strength_ladder_map.csv` (generated by `ladder_rules.csv`, Phase 45): `slug, ladder_id, factor, load_mode (total|per_hand|bodyweight)` mapping each exercise to a ladder with a conversion factor (e.g. incline barbell press 0.85 of bench; dumbbell press uses 2 x per-hand weight with factor 0.80). Exercises with no ladder contribute to the experience meter only.

### 26.2 Tier fractions and thresholds
Tier lower bound = fraction of the anchor: Wood 0, Beginner 0.25, Bronze 0.40, Silver 0.55, Gold 0.68, Platinum 0.80, Diamond 0.90, Master 0.95, Olympian 1.00 **[A]** (`dataset/tier_fractions.csv`). Example, male 80 kg: bench Beginner 0.49x, Bronze 0.78x, Silver 1.07x, Gold 1.33x, Platinum 1.56x, Diamond 1.75x, Master 1.85x, Olympian 1.95x bodyweight; squat 0.71 / 1.13 / 1.56 / 1.92 / 2.26 / 2.55 / 2.69 / 2.83; deadlift 0.81 / 1.30 / 1.79 / 2.21 / 2.60 / 2.93 / 3.09 / 3.25. Female 60 kg uses `anchor_f` (bench 0.34 ... 1.35). So "2x bodyweight" is Olympian-level on bench but only about Platinum on squat: ladders differ per lift on purpose.

### 26.3 Allometric scaling (not plain ratio)
Heavier people have lower strength-to-weight ratios (NSCA recommends dividing by body mass^0.67 instead of body mass). Threshold in kg for tier t at bodyweight BW:
`thresholdKg(t) = anchor * fraction(t) * refBW * (BW / refBW)^0.67`, with refBW = 80 kg (M) / 60 kg (F) **[A]** and exponent 0.67 (configurable constant). At BW = refBW this equals the plain ratio; at 100 kg the male bench Olympian ratio drops from 1.95x to 1.81x, at 60 kg it rises to 2.14x. The UI shows both kg and "x bodyweight at your weight".

### 26.4 Per-set strength value
Count only sets that are not warm-ups with reps 1-12 (Epley e1RM is unreliable above that; reps > 12 are ignored for strength). `load = total load for load_mode` (dumbbells: 2 x per-hand; bodyweight lifts: bw_fraction x BW + added weight, with pull-up 1.0, dip 0.95, push-up 0.65 **[A]**). `benchmarkE1RM = Epley(load, reps) / factor`. A set whose benchmarkE1RM would exceed 4.0 x BW triggers a confirm prompt ("is this right?") and is excluded until confirmed. Weights come from the user's own logging and cannot be verified; the UI says so.

### 26.5 Muscle tier, group tier, overall rank
- For each muscle m: candidates are ladders whose `muscles` list has rank_weight >= 0.3 for m, using the best `benchmarkE1RM` per ladder within the last 365 days. Tier fractional index = ladder tier position of that e1RM against `thresholdKg`; if rank_weight >= 0.6 use it as is; if 0.3-0.6 use it minus one tier (floor Wood). Muscle strength tier = floor of the best candidate; progress = fraction toward the next tier. No candidates -> **Unranked** (show the 2-3 lifts that would rank it).
- **Peak tier** per muscle is stored (`badgePeaks`) and never lost; the current tier reflects the last 365 days; a lower current tier shows "Peak: Diamond".
- **Group tier** (Chest, Back, Shoulders, Biceps, Triceps, Forearms, Core, Glutes, Quads, Hamstrings, Calves) = median of its ranked muscles (>= 1 ranked). **Overall rank** = median of ranked group tiers, shown only when >= 5 groups are ranked, otherwise "provisional".
- Promotion events (`promotions[]`) are produced when a session raises a muscle or group tier.

### 26.6 Inputs, experience meter, rust
- Inputs: sex (M / F / unspecified), bodyweight (latest body stat at or before the session date; **if missing, badges stay hidden and the app asks once; nothing is assumed**), optional age (not used in v1). Unspecified sex uses the average of anchor_m and anchor_f and is labelled **Estimated**.
- **Experience meter:** `mp[muscle] = sum over non-warm-up sets with reps >= 3 of muscleWeight(...)`, capped at 12 weighted sets per muscle per session; thresholds Wood 0, Beginner 10, Bronze 40, Silver 120, Gold 300, Platinum 650, Diamond 1,300, Master 2,500, Olympian 4,500 **[A]**. It is shown beside the badge as "Experience" and never changes the strength tier.
- **Rust:** a muscle untrained for more than 42 days shows "rusty" (display only; tiers are never removed for resting).

### 26.7 Honest limits (shown in the app)
Self-logged weights and self-reported bodyweight; machines and cables are not calibrated across brands, so machine ladders are looser; anchors come from competitive lifters, so most gym-goers will sit in Wood-Gold and Olympian is genuinely elite; this is a motivation and relative-strength guide, not a medical or competitive ranking.
**Fixtures:** `fixtures/badges_*.json` (User Phase 46): allometric thresholds at 60/80/100 kg, e1RM edge cases (reps 1, 12, 13), per-hand dumbbell, bodyweight pull-up with added weight, implausible-set guard, muscle with only secondary ladders, peak tier, group median, unspecified sex.

## 27. Chunk backup (recovery copy of a member's training data)  — NEW in 1.1.0
Shared by the User app (writes and reads chunks), the Admin `ingest` function (reads them) and the tests of both. Plain-language background: `docs/RECOVERY_PLAN.md` (identical in both zips; NOT part of the contract). Row-level sync (`connected-api.md`, sync rules) is unchanged; a chunk is an ADDITIONAL copy. The server never invents training data from a chunk except through `ingest` (27.10).

### 27.1 Chunk keys and what each holds
| Key | Tables inside | Chunk of a row is chosen by |
|---|---|---|
| `sessions:YYYY-MM` | `workout_sessions`, `workout_sets`, `cardio_logs` | month of the session's `started_at` in IST; a set goes with its session; a cardio row with no session uses the month of `done_at` |
| `body:YYYY-MM` | `body_stats`, `intake_logs` | month of `measured_on` (a date, already IST) / of `logged_at` in IST |
| `small` | `routines`, `custom_exercises`, `goals`, `injury_marks`, `exercise_prefs` | always |
Month = IST calendar month (`Asia/Kolkata`); `2026-11-01 00:00 IST` is the first instant of `2026-11`. **Not in any chunk:** `personal_records` and `xp_events` (derived; recomputed after a restore by the existing engines), progress photos, prefs/settings kept only on the device, the outbox, kv/meta, pull cursors. A past month changes only when the member edits or deletes a session in it; then that month is dirty again.

### 27.2 Logical content (schema 1)
```
{ "app":"shield-fitness", "schema":1, "key":"sessions:2026-11", "rows":<int>, "made_at":<epoch s>,
  "t": { "<table>": { "c":[<column names>], "r":[ [<values in column order>], ... ] }, ... } }
```
- `rows` = total rows over all tables, **tombstones included**.
- Column names are the real column names in `docs/DATA_MODEL.md` F2 (Admin zip) / `connected-api.md`. Columns NEVER included: `id`, `member_id`, `created_at`, `updated_at` (server-owned). Added for merging: `u` = device last-change time in epoch ms. `deleted_at` is always included (null for live rows). Row order inside a table: ascending `client_id`, so equal content gives equal bytes. Natural-key tables (`injury_marks` key `muscle_id`, `exercise_prefs` key `slug`) have no `client_id` column and sort by the key.
- A table with no rows is omitted. A chunk with no rows is never uploaded (27.9 S1).

### 27.3 Compact encoding (fixed; both apps must produce identical bytes)
- uuid -> 22 characters, base64url of the 16 bytes, no padding. Foreign ids (`session_id`, `program_id`, `day_id`, `routine_id`) use the same form.
- `timestamptz` -> integer epoch seconds UTC. `deleted_at` likewise. `date` stays `YYYY-MM-DD`. `numeric` stays a JSON number (no trailing zeros, no exponent). `bool` -> 0 or 1. jsonb values stay JSON.
- **Canonical JSON:** UTF-8, no whitespace (`separators (',',':')`), object keys in the order shown in 27.2 (`app, schema, key, rows, made_at, t`; inside a table `c` then `r`), table order alphabetical. Strings are not escaped beyond what JSON requires (non-ASCII stays as UTF-8).
- Decoding is the exact reverse. A uuid in a chunk is the SAME `client_id` the row has in the local store and on the server (never regenerated), so merging with row-level sync never duplicates.

### 27.4 Stored bytes, gzip and hash
Stored object = **one marker byte + payload**: `0x01` + gzip(canonical JSON) when `CompressionStream` exists, else `0x00` + canonical JSON (same rule as `plan-share.md`: `0x01` gzip / `0x00` raw). Any other first byte is refused. Two hashes, both lowercase hex SHA-256: `sha256` over the stored bytes **including the marker byte** (integrity, names the object, S4) and `content_sha256` over the canonical JSON bytes (UTF-8, without the marker). gzip output differs between implementations, so the **fingerprint** used for `L`, `B` and `S` (27.7) is always `content_sha256`: two devices with the same content never look "changed". Size: target <= 200 KB stored; the Storage bucket refuses > 512 KB (`SFE703`). A month that would exceed 512 KB is a contract change (27.12).

### 27.5 Header checks on read (S4, S7)
After gunzip: `app` must be `shield-fitness`; `key` must equal the requested key; `schema` > the app's known schema -> refuse with "update the app"; `schema` < known -> migrate in memory; `rows` must equal the counted rows; tables/columns unknown to the app are ignored on read and kept when the app re-writes that chunk only if it was migrated losslessly (otherwise refuse to overwrite and say "update the app"). A body starting with `<` or not parsing as the above is a network error, never data.

### 27.6 Merge rule (per table, by `client_id`; by the natural key for `injury_marks` / `exercise_prefs`)
Result = union of both sides' rows. For a key present on both sides pick ONE whole row (never mix columns):
1. a row with `deleted_at` set beats a row without (a deletion is final);
2. else a row in a **final state** beats one not final: `workout_sessions.status = 'done'` (with `ended_at`), `goals.status in ('done','dropped')`;
3. else the larger `u` wins;
4. else (equal `u`) the row whose canonical JSON string is larger (byte-wise) wins, so every device reaches the same result.
Merging never removes a key. A merge that changes nothing relative to one side is not a new revision.

### 27.7 Three-way decision (per chunk)
Inputs: `L` local fingerprint = `content_sha256` of the chunk as this device would write it now (or EMPTY = zero rows, MISSING = never written), `B` base (fingerprint recorded when this device last synced the chunk, or absent), `S` server fingerprint = the manifest's `content_sha256` (or MISSING). **Order:**
1. `L == S` and both exist -> NOOP (record `B = S`).
2. `L` is EMPTY or MISSING and `S` exists -> RESTORE (27.9 S6).
3. `S` is MISSING and `L` has rows -> PUSH_ALL.
4. `B` absent, both have data, different -> MERGE_NEVER_OVERWRITE (merge, then push).
5. otherwise by the matrix: `L != B` and `S == B` -> PUSH; `L == B` and `S != B` -> PULL_MERGE (apply, no push); both changed -> MERGE_THEN_PUSH.
`L` empty and `S` missing but `B` had data -> NOOP and report "both copies gone".
**S1 applies last to every outcome that ends in a push.** Fixtures: `fixtures/chunks_01_diff_table.json`.

### 27.8 Safety rules (binding in both apps)
- **S1** Never push a chunk whose row count (tombstones included) is **less than 70 % of the base row count** (strictly: `rows < 0.7 x rowsB`; exactly 70 % is allowed), and never push an empty chunk over a server copy. Stop and offer Restore. Deleting rows is not shrinking, because a deletion becomes a tombstone row.
- **S2** Upload the object first, write the manifest LAST. The manifest row is the commit; an object without a manifest row is invisible.
- **S3** The manifest write is a compare-and-swap on `rev` (27.11). A lost race re-reads the manifest, re-merges, retries (at most 5 times, then back-off).
- **S4** Verify the stored-bytes `sha256` against the manifest and gunzip + header-check (27.5) on every download; on failure use the previous revision (`prev_*`), and if that fails too, report it and change nothing.
- **S5** A pull only adds or merges; it never deletes local data. Final states are never reverted (27.6).
- **S6** While a restore runs ALL pushes are blocked. A chunk is recorded as synced (`B` updated) only after it was applied locally in one transaction.
- **S7** `schema` newer than the app -> refuse ("update the app"); older -> migrate.

### 27.9 Triggers (what the app does; not testable by fixtures)
A FINISHED session saved, edited or deleted marks that month's chunk dirty (kept in the local `meta`, survives a kill) and pushes after a 10-30 s delay; an edit of a `small` item marks `small` dirty. App open, return to foreground, the `online` event and a successful row sync push anything dirty. Once a day on open: full three-way check of every chunk. No polling while hidden, no Realtime. Retry back-off `min(2^attempts x 5 s, 15 min) + jitter`.

### 27.10 What `ingest` computes from chunks (server side; Admin Phase 51)
From the verified `sessions:*` chunks only: `last_workout_on`, `first_workout_month`, `last_workout_month`, `sessions_total`, `workouts_30d`, `streak_days`, `xp_total`, `tier_id`, using the SAME xp / tiers / streak specs as section 11 and 24 (Admin `src/shared/engine/*`). Free users: summary numbers only, never body stats, intake, names or phones. The result is idempotent: it is recomputed from the latest manifest set, never added up.

### 27.11 Manifest and objects (what a chunk push does)
1. Build canonical bytes; compute `sha256`. 2. Read the manifest row (`owner_uid`, `key`); if its `content_sha256` equals mine -> done (covers a timeout after the server saved). 3. Upload the object to `backups/<owner_uid>/<key with ':' -> '_'>/<sha256>.bin` (a name by content hash; re-sending identical bytes is harmless). 4. Write the manifest: first time `POST` with `Prefer: resolution=ignore-duplicates,return=representation` (empty answer = someone else wrote first: go to the merge path); later `PATCH ...?owner_uid=eq.<uid>&key=eq.<key>&rev=eq.<old rev>` with `{rev: old+1, sha256, content_sha256, bytes, rows, schema, prev_sha256: old sha256, prev_bytes: old bytes}` and `Prefer: return=representation`; an empty answer = lost the race (S3). 5. After the commit delete objects of this key that are neither the new nor the previous revision.
Manifest columns and rules: `connected-api.md` section "Backups and free accounts".

### 27.12 Limits and growth
Chunk <= 512 KB stored (hard), <= 200 KB target (soft, [A-R1]); at most **64 keys** per owner (a manifest insert beyond that is refused, `SFE704`; 64 covers 30 months of `sessions` and `body` plus `small`); total stored bytes per free account <= 3 MB, per gym member <= 10 MB ([A-R7]). Larger needs a contract change.
**Fixtures:** `fixtures/chunks_01_diff_table.json`, `chunks_02_merge.json`, `chunks_03_encoding.json` (hand-worked, Admin Phase 49; each file says so). The User app (Phase 75) and the Admin `ingest` (Phase 51) each run them.

## 12. Fixture index (created by)
`heatmap_*` (User 43) · `recovery_*` (User 48) · `suggest_*` (User 15) · `alternatives_*` (User 35) · `daybuilder_*` (User 33) · `overload_*` (User 36) · `pr_*` (User 37) · `aireview_*` (User 40) · `movement_*` (User 25) · `pocket_*` (User 38) · `weakspots_*` (User 44) · `badges_*` (User 46) · `setup_*` (User 13) · `search_*` (User 20) · `reach_*` (User 23) · `schedule_*` (User 32) · `policy_*` and `gymconfig_*` (User 66 / Admin 35) · `xp_*` (Admin 41) · heatmap fixtures are consumed by Admin 43. · `chunks_*` (Admin 49; consumed by User 75 and Admin 51).
