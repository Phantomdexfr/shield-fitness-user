# DATASET_GUIDE — the exercise, machine and muscle data

Delivered by the owner's research session (`MACHINE_DATA_NOTES.md`, `NEW_EXERCISES_NOTES.md`, `DETAILED_MUSCLES_NOTES.md`, `EXERCISE_CATEGORIES_NOTES.md`, `CABLE_AND_VARIATION_GAP_NOTES.md` are kept here unchanged). **Treat these CSVs as read-only source data.** The apps compile them into chunked JSON at build time (User Phase 9). Do not edit by hand; changes are a new dataset version (contract minor bump).

**Counts (verified when this guide was written):** 634 exercises · 55 machines (all with a primary photo; 128 WebP files, about 2.1 MB) · 34 detailed muscles (17 core + 17 proposed) · 2,749 exercise-muscle rows · 312 variation-muscle-shift rows (240 `more`, 72 `less`) · 4,752 variation rows across 6 files (all unique). **Only 592 of the 634 exercises have rows in the muscle map**; the other 42 fall back to their `primary_muscles` / `secondary_muscles` columns (see `contract/engines.md` section 2).

## Files and what joins to what
| File | Key columns | Use |
|---|---|---|
| `machines.csv` | `name` (unique), `image_slug`, `category`, `muscle_groups`, `weight_step_kg` (blank = unknown), `zone` (blank = owner fills), `status` | Machine inventory. `quantity` is 1 unless the file says otherwise. |
| `detailed_muscles/machines_detailed.csv` | same + `detailed_muscle_groups` | Machines with detailed muscle ids |
| `media_manifest.csv` | `machine_slug`, `file`, `variant` thumb/detail, `is_primary`, `alt` | Images are at `public/machines/<machine_slug>/<file>` |
| `exercises.csv` | `name`, `machine_name` -> `machines.name` (blank = no equipment), `primary_muscles`, `secondary_muscles` (core ids), `rep_min`, `rep_max`, `cues` | The first 199 exercises |
| `exercises_extended.csv` | `slug` (STABLE ID), `variations`, `movement_pattern`, `unilateral`, `beginner_friendly`, `injury_cautions`, `track_fit`, `difficulty`, `proposed_muscles` | Extra columns for the first 199 |
| `new_exercises/new_exercises.csv` + `_extended.csv` | same | 393 added exercises |
| `new_exercises/cable_new_exercises*.csv` | same | 30 cable exercises |
| `new_exercises/progression_new_exercises*.csv` | same | 12 progression exercises |
| `exercise_categories/exercise_categories_all.csv` | `slug`, `category`, `sub_category`, `also_warmup`, plus every exercise column | **THE MASTER LIST (634 rows)**, one row per exercise. Prefer this over the other exercise files. |
| `exercise_categories/{compound,isolation,warmup,recovery,other}.csv`, `also_usable_as_warmup.csv` | | Filtered views of the master list |
| `detailed_muscles/muscle_taxonomy_detailed.csv` | `id`, `parent_group`, `status` core/proposed, `map_regions` | The 34 muscle ids; `parent_group` rolls up to a core id |
| `muscle_taxonomy.csv`, `muscle_coverage.csv` | | Core taxonomy + coverage counts |
| `detailed_muscles/exercise_muscle_map.csv` | `slug`, `muscle_id`, `role` primary/secondary/stabiliser/mobility, `emphasis` high/medium/low, `note` | **Drives the heatmap and the tap-a-muscle lists** |
| `detailed_muscles/variation_muscle_shift.csv` | `exercise`, `variation`, `muscle_id`, `shift` more/less | Heatmap shift per logged variation |
| `exercise_variations.csv`, `new_exercises/*variation*.csv`, `new_exercises/variations_gap_fill_all_machines.csv` | `slug`, `variation` | Variation text per exercise (free text) |
| `substitution_groups.csv` | `exercise`, `alternatives` (`;`) | Hand-built alternatives for the first 199 |
| `superset_pairs.csv` | `exercise_a`, `exercise_b`, `pair_type` | Superset suggestions |
| `detailed_muscles/html_unit_to_detailed.csv` | `unit_id` -> `detailed_muscle_id` | Maps the 2D figure's SVG regions to muscle ids (used by the Body Picker) |
| `detailed_muscles/coverage_gaps_and_suggestions.md` | | Thin muscles (quads_lower, serratus_anterior, tibialis_anterior) and exercise ideas NOT yet added |
| `split_templates_draft.md` | | Draft weekly plans per track (trainer approves) |

## Conventions
- Multi-value cells use `;`. Booleans `yes`/`no`. `rep_min`/`rep_max` blank for cardio.
- Exercise IDENTITY = `slug`. Display name = `name`. `variations` is free text; the dedicated variation files hold one variation per row.
- A "machine" can be non-electric kit (kettlebells, TRX, mats). `category` values: `strength_machine | free_weight | cable | cardio | bodyweight | other`.
- **Known gaps (do not paper over):** `zone` and most `weight_step_kg` are blank (owner supplies later); 7 exercises are `recovery`; neck/serratus/tibialis/lower-quads are thin; the 3D model (Holo Atlas) lacks lats, rectus abdominis, internal oblique, transversus abdominis and multifidus; contested-evidence rows are flagged in `note`.
- No YouTube links exist in the data. The apps build a search link from the exercise name; `policy.library.youtube_overrides` and the user's own custom links replace it.


## Added gaps found on 2026-11-18 (drive User Phase 8)
- **Setup options are free text.** About 4,750 variation rows mention grip/width/handle/position words (wide 209, narrow 189, single arm ~223, neutral 162, strap 90, D handle 69, reverse 53, mixed 45, straight bar 42, EZ 29, V handle ~20, MAG 15). They must be tagged onto the six axes (engines.md section 13). New files to author: `setup_rules.csv`, `setup_muscle_shift.csv`, `machine_companions.csv`, `search_aliases.csv`.
- **Machine reach is incomplete.** In `exercise_muscle_map.csv` only 28 distinct muscle ids appear (taxonomy has 34). Flat Bench and Dumbbells reach 24, Barbell 23, Cable Crossover 20. 125 exercises have no machine; 42 exercises have no muscle mapping. A gap list of missing cable/bench exercises per unreached muscle is Phase 8 output.
- **Reverse modes:** Pec Deck Fly / Reverse Pec Deck are separate exercises; link them as machine modes.

- **Movement patterns (to author in User Phase 24):** `movement_patterns.csv` (~30 patterns with start/end joint angles), `pattern_rules.csv` (keyword -> pattern), `exercise_pattern_map.csv` (generated + manual overrides). Equipment categories for equipment mode come from `machines.csv`/exercise `equipment` fields; a preset-to-category table (`equipment_presets.csv`) is also authored in Phase 24.

- **Strength ladders (to author in User Phase 45):** `strength_ladders.csv` (~40 benchmark lifts with anchors), `ladder_rules.csv`, `strength_ladder_map.csv` (exercise -> ladder + factor), `tier_fractions.csv`. Only squat/bench/deadlift anchors are published; all others are derived or estimated and flagged for sport-scientist review.


## Phase 8 files (authored 2026-11-19; flagged for review, see below)
All are CSV, UTF-8, header row, CRLF like the other files. `;` is not used inside cells. Everything here is **authored data**, not research output; every shift row is marked `physio_review=yes`.

| File | Rows | What it is |
|---|---|---|
| `setup_rules.csv` | 322 | keyword -> setup axis/value; the Phase 10 compiler uses it to tag the 4,752 free-text variation rows |
| `setup_muscle_shift.csv` | 157 | setup axis/value + exercise pattern -> muscle `more`/`less` (engines.md 13b) |
| `machine_companions.csv` | 96 | per machine: benches, attachments (companions) and modes (engines.md 15) |
| `search_aliases.csv` | 621 | alias -> canonical phrase (engines.md 14) |
| `REACH_GAPS.md` | | what machines cannot yet reach in our data and which exercises to add (not added) |

### setup_rules.csv — `rule_id,keyword,axis,value,excludes,confidence,note`
- **Normalise** the variation text and every keyword the same way: lower-case, every run of non-letters/digits becomes one space ("Reverse-grip finish" -> "reverse grip finish").
- A rule matches when `keyword` occurs as whole words; a trailing `s` on the last word is ignored ("d handle" matches "D handles").
- If any `excludes` phrase (`|` separated, same matching) is also in the row, the rule is skipped.
- A row may match many rules: every (axis, value) found is tagged ("Supinated, neutral or pronated grip" offers three grips). `confidence=ambiguous` rules still tag; the compiler also lists those rows in its review report.
- Axis values are exactly the engines.md section 13 vocabulary; all 6 axes and every value have at least one rule. Folded on purpose: "semi-neutral" -> neutral; "medium", "hip width", "conventional" -> shoulder width; "sumo" -> wide; width covers stance width as well as grip width; "double overhand" -> pronated.
- Run on the current data: 1,413 of 4,752 rows get at least one tag (2,230 tags). The other rows are tempo, pause, load and similar text and stay as plain variation lines. **Not in the vocabulary, so untagged and a candidate for a future contract change:** hook grip, snatch/clean grip, bent-over position, rear-foot/feet-elevated, deficit, lifting straps (an aid, not a cable handle).
- Known data gap: no cable rope variation row exists (rules for `rope` are ready for when they do).

### setup_muscle_shift.csv — `axis,value,applies_to,muscle_id,shift,physio_review,confidence,reason`
- `shift` is `more` or `less`, applied with the engines.md section 3 multipliers. `confidence` is the author's own rating (high/medium/low), not a literature grade. `reason` is wording the app may show ("tends to emphasise").
- `applies_to` is an exercise pattern. A pattern is picked from the exercise **name**, normalised, whole-word match, first pattern in this order that matches (a `not` word cancels that pattern for the name):

| applies_to | name contains any of | not |
|---|---|---|
| `reverse_fly` | reverse fly/flye, reverse pec deck, reverse butterfly, rear delt fly/flye/raise, rear fly, bent over fly | |
| `pulldown` | pulldown, pull down, pull up, chin up, lat pull | straight arm, scapular |
| `pushdown` | pushdown, push down, pressdown, press down, triceps extension, skull crusher | leg, back, hip |
| `curl` | curl | leg, hamstring, wrist, nordic, knee, crunch, forearm, roll |
| `raise` | raise | calf, leg, knee, hip, heel, toe, tibialis, rear, hanging, pelvic, y raise, w raise |
| `fly` | fly, flye, crossover, pec deck, butterfly | reverse, rear |
| `row` | row, face pull | upright, rowing |
| `press` | press, push up | leg press, calf, pallof, squeeze, jm press, sled, wall press, press up |
| `any` | (every exercise, whatever its pattern) | |

  On the current 634 exercises this covers 193 (press 72, curl 33, row 31, pushdown 17, pulldown 12, raise 11, fly 10, reverse_fly 7). Squats, deadlifts, lunges, leg and calf work have **no shift rows**; the stance-width and sumo rules tag them but they change no credit until someone authors rows (owner/physio decision).
- `reverse_fly` is an eighth pattern beyond the seven the phase named: engines.md 13b needs "reverse pec deck + neutral -> rear delts more, traps less", which would wrongly hit chest flyes under `fly`.
- `grip=reverse` rows mirror `supinated` (engines.md: reverse = supinated on pulling/pressing machines).
- Per engines.md 13b: an exact row in `variation_muscle_shift.csv` wins for that muscle.
- Not authored where the 34 muscle ids cannot express it (biceps long/short head, triceps heads, outer/lower lats); only the lats id as a whole.

### machine_companions.csv — `machine_name,kind,value,evidence,exercise_slug,label,note`
- `machine_name` joins `machines.csv`. `kind`: `bench` (value = bench vocabulary), `attachment` (value = handle vocabulary), `mode`.
- `evidence`: `data` = the value is named in variation rows of exercises on that machine (found by running `setup_rules.csv`), or the mode points at a real exercise; `inferred` = authored, no row names it.
- `mode` rows: `exercise_slug` set = a separate exercise that is a mode of the machine (Pec Deck Fly / Reverse Pec Deck; `label` is the display text). `exercise_slug` empty and `value` = `axis:value` (e.g. `grip:supinated`) = a setup mode of the same exercise (Lat Pulldown reverse / neutral / wide / MAG).
- 24 machines have rows. Machines with no rows (cardio machines, foam roller, single-action machines) list no companions.

### search_aliases.csv — `alias,canonical,kind`
- Same normalisation as above. The query is scanned for aliases (longest alias first, whole words); each match is replaced by its canonical phrase, then the normal tokenising and scoring from engines.md 14 run. The original words are kept as extra tokens so exact names still win.
- `kind`: abbreviation, muscle, exercise, machine, setup, spelling. Aliases are unique. Canonicals were checked against exercise, machine, muscle names and the setup vocabulary (every canonical word exists there). Adding an alias is a data change only.

## Phase 24 files (authored 2026-11-19; every pattern flagged `coach_review=yes`)
Movement patterns and equipment presets, with full formats, joint conventions, param keys, coverage and the unmapped list in `MOVEMENT_PATTERN_NOTES.md`.

| File | Rows | What it is |
|---|---|---|
| `movement_patterns.csv` | 54 | `pattern_id,name,view,anchor,joints_start,joints_end,path_hint,equipment_glyph,arm_world,default_param,twin_start,twin_end,coach_review,notes` (12 joints each, start and end) |
| `pattern_rules.csv` | 88 | name keyword rules (first match wins) + modifier rules that add params; used to generate the map |
| `exercise_pattern_map.csv` | 540 | `slug,pattern_id,source,param`: 540 of the 634 exercises (85.2%); the other 94 are listed with reasons in `MOVEMENT_PATTERN_NOTES.md` |
| `equipment_presets.csv` | 5 | bodyweight, dumbbells, bands, home, gym -> machine names (same table as `src/shared/equipment.ts`) |
| `MOVEMENT_PATTERN_NOTES.md` | | formats, conventions, coverage, unmapped list, honest limits |

## Phase 45 files (authored 2026-11-20; flagged for sport-scientist review)
CSV, UTF-8, header row, CRLF, `;` only as a list separator. Full spec in `docs/MUSCLE_BADGES.md` (Phase 45 section).
| File | Rows | What it is |
|---|---|---|
| `strength_ladders.csv` | 42 | benchmark lifts with Olympian anchors (x bodyweight) for M/F, reference bodyweights, load mode fraction, muscle rank weights, source published/derived/estimate |
| `tier_fractions.csv` | 9 | tier lower bound as a fraction of the anchor, plus experience-meter thresholds |
| `ladder_rules.csv` | 297 | 277 exact-slug rules (ladder, factor, load mode), 13 low-confidence word rules for future exercises, 7 `none` reasons |
| `strength_ladder_map.csv` | 634 | the result, one row per exercise: 277 mapped (43.7%), 357 `none` (cardio, holds, explosive, mobility, bands, assisted, neck); the app reads only this file |
