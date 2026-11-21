# MOVEMENT_PATTERN_NOTES (User Phase 24, authored 2026-11-19)

Authored data for engines.md section 19. **Everything here is authored, not research output. Every pattern is flagged `coach_review=yes`**: the angles are typical ranges and have not been seen by a coach or physio. Wording in the app must say "typical movement" (see `docs/MOVEMENT_MAP.md` in the User zip).

## Files
| File | Rows | What it is |
|---|---|---|
| `movement_patterns.csv` | 54 | one row per movement pattern: start and end pose, view, anchor, path, glyph, text twin |
| `pattern_rules.csv` | 88 | keyword rules that picked a pattern for each exercise (88 rows: 76 pattern rules, then 12 modifier rules) |
| `exercise_pattern_map.csv` | 540 | `slug, pattern_id, source, param`: the result, one row per mapped exercise; the app reads only this file |
| `equipment_presets.csv` | 5 | preset -> machines (engines.md section 22); matches the table in `src/shared/equipment.ts` |

All CSV, ASCII, header row, CRLF like the other files. Joint cells use `name:value` pairs joined by `;`. `;` inside a cell only ever separates list items (joints, params, machine names).

### movement_patterns.csv columns
`pattern_id, name, view, anchor, joints_start, joints_end, path_hint, equipment_glyph, arm_world, default_param, twin_start, twin_end, coach_review, notes`
- engines.md 19 named `pattern_id, name, view, joints_start, joints_end, path_hint, equipment_glyph, notes`. Added: `anchor` (what stays fixed, needed for forward kinematics), `arm_world` and `default_param` (how setup params change the pose), `twin_start` / `twin_end` (accessibility text), `coach_review` (always `yes`).
- `joints_start` and `joints_end` always hold all 12 joints in this order: `neck, shoulder_l, shoulder_r, elbow_l, elbow_r, hip_l, hip_r, knee_l, knee_r, ankle_l, ankle_r, torso_lean`. Values are whole degrees.
- `start` is the pose at the beginning of the repetition. For push-up, dip, deadlift and clean that is the top or the floor position, as the twin text says.
- `l` and `r` are the near and far limb in a side view and the left and right limb in a front view. Symmetric patterns have equal values.

### Joint conventions (degrees)
| Joint | Side view | Front view |
|---|---|---|
| `neck` | head versus trunk line: 0 neutral, + chin toward chest, - head back | same |
| `shoulder_l/r` | upper arm versus the line from shoulder to hip: 0 hanging along the trunk, + forward and up (180 overhead), - behind the trunk | abduction from the side: 0 at the side, 90 horizontal, 180 overhead |
| `elbow_l/r` | inside angle: 180 straight, about 30 fully bent | same |
| `hip_l/r` | inside angle between trunk and thigh: 180 standing straight, 90 seated | **sideways spread of the thigh**: 0 legs together, + out (jumping jack, lateral lunge only) |
| `knee_l/r` | inside angle: 180 straight, about 40 fully bent | same |
| `ankle_l/r` | inside angle between shin and foot: 90 neutral, 130 toes pointed, 75 toes pulled up | same |
| `torso_lean` | trunk from vertical: 0 upright, + leaning forward (90 = horizontal, face down), - leaning back (-90 = lying on the back) | **sideways lean**: 0 upright, + toward the figure's right |

Front-view patterns: chest_fly, rear_fly, lateral_raise, y_raise, shrug, rotation, jump_rope, side_bend, jumping_jack, lateral_lunge.

### anchor (what the forward-kinematics chain starts from)
`feet` ankles on the floor line; `seat` hips fixed on a seat; `back` shoulders and hips resting on a bench or the floor; `hands` hands fixed (dip bars, floor); `hands_feet` both hands and feet fixed (push-up, plank); `hang` hands fixed on a bar overhead; `hips_pad` hips fixed on a pad (back extension). Phase 25 owns the maths.

### path_hint (vocabulary, 52 values)
What the resistance line or the movement arrow does. Phase 25 draws these as simple shapes. Groups: `line_up_*` (vertical line from a start point), `arc_*` (arc around a joint), `pull_*` / `push_*` (straight line toward or away from the body), `body_*` (the body moves, not the weight), `cyclic_*` (alternating legs), `hold` (no arrow), and single words for the rest (`shoulders_elevate` draws a short lift arrow at the shoulders because no joint angle changes). Unknown hints draw no arrow.

### equipment_glyph
Pattern default: `barbell, dumbbell, cable, machine, bar, bodyweight, rope, wheel, bike, ball, none`. The renderer picks the glyph for one exercise in this order: (1) words in the exercise name: barbell / ez bar / smith -> barbell, dumbbell -> dumbbell, kettlebell -> kettlebell, plate -> plate, band / resistance -> band, suspension -> suspension, cable -> cable; (2) the machine's category (`strength_machine` -> machine, `cable` -> cable); (3) the pattern default. Kettlebell, plate, band and suspension are glyph names for (1) only.

### arm_world and default_param (setup params)
`arm_world` is `up`, `down` or `none`: for free weights (glyph barbell, dumbbell, kettlebell, plate) the arms keep pointing the same way in the room when the trunk tilts, so **shoulder_l/r (start and end) += new torso_lean - default torso_lean**. Machines, cables and bodyweight keep the relative angles (the handle path moves with the seat). `default_param` is the value the pattern's numbers were authored at.

`exercise_pattern_map.csv` `param` is `key=value` pairs joined by `;`. Allowed keys:
| key | values | effect |
|---|---|---|
| `bench_deg` | -15 to 90 | bench back angle from flat. `torso_lean = bench_deg - 90`; the `arm_world` rule above; 85 or more = standing (hip 175, knee 175); 45 to 85 keeps the pattern's hip and knee (seated) |
| `torso_lean` | -90 to 90 | replaces torso_lean in both poses; the `arm_world` rule above |
| `grip_width` | narrow, wide | side view: label only ("wide grip"); front view: shoulder +/- 10 degrees |
| `stance_width` | narrow, wide | side view: label only; front view: hip spread +/- 10 degrees |
| `seated` | yes | vertical_press: hip 100, knee 100, torso -5. calf_raise: hip 95, knee 95 |
| `kneeling` | yes | hip 175, knee 90, ankle 140 |
No other key is allowed. The app's Setup picker (Phase 22) values map to these keys in Phase 25.

### pattern_rules.csv columns
`rule_id, kind, match_on, keywords, excludes, pattern_id, applies_to, param, confidence, note`
- Normalise the exercise **name** and every keyword the same way as `setup_rules.csv`: lower-case, each run of non-letters/digits becomes one space; match whole words; a trailing `s` on the last word is ignored. `keywords` and `excludes` are `|` lists (any one matches). `match_on` is `name`.
- `kind=pattern`: rules run **in file order, the first match wins** and gives `pattern_id` and its `param`. An exercise that matches no pattern rule is unmapped.
- `kind=modifier` (`pattern_id` blank): run after a pattern is chosen; if the exercise name matches and the chosen pattern is in `applies_to` (`|` list), its `param` is added (a key already set is not replaced).
- `confidence`: high / medium / ambiguous / low = the author's own rating of the match (ambiguous and low rows draw a figure that is only roughly right and are the first to review).
- `source=manual` rows in the map are explicit overrides applied after the rules; 5 exist (they would also be hit by a rule, but carry a param or pin the pattern).
- A custom (user) exercise can be suggested a pattern by running these rules on its name (Phase 27 may use this).
- The coarse `movement_pattern` column in the master list (push, pull, hinge, squat, lunge, core, carry, isolation, cardio) and the Phase 8 `applies_to` words are different things; this file's `pattern_id` is the finer one.

### equipment_presets.csv
`preset_id, label, machine_names, machine_categories, includes_no_machine, note`. `machine_names` is a `;` list of names from `machines.csv` (`*` = all). `includes_no_machine=yes` always: an exercise with no machine is allowed under every preset. `machine_categories` is informational (the categories those machines belong to); the names decide. These rows reproduce the Phase 19 table in `src/shared/equipment.ts` unchanged (that table was the author's guess, A-P19.2, and still awaits the owner's confirmation). Phase 25+ may replace the constant with this file.

## Coverage (checked with an independent script)
- 540 of 634 exercises mapped = 85.2% (target >= 85%); 94 unmapped (listed below). 54 patterns, every one used at least once.
- Rules: 535 exercises by rule, 5 manual.
- **Pattern count is 54, not "about 30".** Reaching 85% needed the extra rows (rollout, dead bug, clean, side bend, kickback, lateral lunge, cable crunch, jumping jack, slam and the cardio patterns each cover 2 to 5 exercises). Adding a pattern is a data row; without those nine (27 exercises) mapped coverage would be about 81%. Owner decision.
- Mapping is keyword matching on names, like Phase 10: hand-checked on the largest patterns (squat, lunge, curl, press, push-up, hinge, row, crunch, rotation, deadlift, jump, carry, hip thrust), not on every row.

| pattern_id | Name | View | Anchor | Exercises |
|---|---|---|---|---|
| `horizontal_press` | Horizontal press | side | back | 25 |
| `vertical_press` | Vertical press | side | feet | 19 |
| `push_up` | Push-up | side | hands_feet | 22 |
| `dip` | Dip | side | hands | 3 |
| `chest_fly` | Chest fly | front | back | 10 |
| `rear_fly` | Rear fly | front | feet | 12 |
| `lateral_raise` | Lateral raise | front | feet | 6 |
| `front_raise` | Front raise | side | feet | 4 |
| `y_raise` | Y raise | front | feet | 5 |
| `shrug` | Shrug | front | feet | 6 |
| `upright_row` | Upright row | side | feet | 8 |
| `vertical_pull` | Vertical pull (pulldown) | side | seat | 6 |
| `straight_arm_pulldown` | Straight-arm pulldown / pullover | side | feet | 6 |
| `pull_up` | Pull-up / chin-up | side | hang | 7 |
| `horizontal_row` | Horizontal row | side | seat | 11 |
| `bent_over_row` | Bent-over row | side | feet | 17 |
| `hip_hinge` | Hip hinge (Romanian deadlift, good morning) | side | feet | 20 |
| `deadlift` | Deadlift | side | feet | 15 |
| `squat` | Squat | side | feet | 42 |
| `lunge` | Lunge / split squat | side | feet | 30 |
| `step_up` | Step-up | side | feet | 6 |
| `leg_press` | Leg press | side | seat | 1 |
| `leg_extension` | Leg extension | side | seat | 1 |
| `leg_curl` | Leg curl | side | back | 4 |
| `calf_raise` | Calf raise | side | feet | 11 |
| `biceps_curl` | Biceps curl | side | feet | 32 |
| `triceps_pushdown` | Triceps pushdown | side | feet | 4 |
| `overhead_triceps_extension` | Overhead triceps extension | side | feet | 8 |
| `skull_crusher` | Lying triceps extension | side | back | 9 |
| `crunch` | Crunch / sit-up | side | back | 18 |
| `leg_raise` | Leg raise | side | back | 7 |
| `plank` | Plank (hold) | side | hands_feet | 9 |
| `rotation` | Rotation / chop | front | feet | 15 |
| `pallof_press` | Pallof press | side | feet | 3 |
| `carry` | Carry / walk with weight | side | feet | 10 |
| `hip_thrust` | Hip thrust / glute bridge | side | back | 18 |
| `back_extension` | Back extension | side | hips_pad | 2 |
| `jump` | Jump | side | feet | 10 |
| `mountain_climber` | Mountain climber | side | hands | 5 |
| `jump_rope` | Jump rope | front | feet | 9 |
| `battle_rope` | Battle rope wave | side | feet | 11 |
| `cardio_run` | Walk / run | side | feet | 21 |
| `cardio_bike` | Cycling | side | seat | 14 |
| `cardio_row` | Rowing machine stroke | side | seat | 6 |
| `ski_pull` | Ski erg pull | side | feet | 5 |
| `rollout` | Rollout | side | hands | 4 |
| `dead_bug` | Dead bug | side | back | 4 |
| `triceps_kickback` | Triceps kickback | side | feet | 3 |
| `clean` | Clean | side | feet | 4 |
| `side_bend` | Side bend | front | feet | 3 |
| `cable_crunch` | Kneeling or standing cable crunch | side | feet | 2 |
| `jumping_jack` | Jumping jack | front | feet | 2 |
| `slam` | Slam | side | feet | 2 |
| `lateral_lunge` | Lateral lunge | front | feet | 3 |

## Unmapped exercises (94) and why
They show the plain muscle map with a quiet note (engines.md 19).

**Side-to-side (frontal-plane) moves: the figure has no sideways step or hip spread for these** (13)
`hip-abduction-machine`, `hip-adduction-machine`, `resistance-band-lateral-walk`, `resistance-band-hip-abduction`, `soft-box-lateral-jump`, `skater-hop`, `lateral-bound`, `donkey-kick`, `fire-hydrant`, `clamshell`, `skater-jump`, `crab-walk`, `lateral-shuffle`

**Wrist and forearm work: the wrist is not one of the 12 joints** (10)
`dumbbell-wrist-curl`, `plate-pinch-hold`, `barbell-wrist-curl`, `dumbbell-reverse-wrist-curl`, `dumbbell-hammer-raise-radial-deviation`, `dumbbell-forearm-rotation-pronation-supination`, `dumbbell-static-hold`, `barbell-behind-the-back-wrist-curl`, `ez-bar-wrist-curl`, `cable-wrist-curl`

**Neck work: only 4 exercises, head moves a few degrees** (4)
`plate-neck-flexion-lying`, `plate-neck-extension-lying-face-down`, `dumbbell-neck-side-flexion-lying-on-side`, `neck-isometric-hold-hand-resistance`

**Rolling, stretching and mobility: positions, not joint-angle movements** (11)
`foam-roller-thoracic-extension`, `foam-roller-quad-roll`, `foam-roller-lat-roll`, `foam-roller-glute-roll`, `foam-roller-calf-roll`, `foam-roller-hamstring-roll`, `cat-cow`, `childs-pose`, `90-90-hip-switch`, `worlds-greatest-stretch`, `inchworm`

**Shoulder-blade and rotator-cuff drills: the movement is a rotation or a scapular glide, not an angle change** (12)
`superman`, `plate-halo`, `kettlebell-halo`, `reverse-snow-angel`, `dumbbell-side-lying-external-rotation`, `cable-external-rotation`, `cable-internal-rotation`, `resistance-band-external-rotation`, `scapular-push-up`, `prone-cobra-hold`, `prone-swimmer`, `scapular-pull-up`

**Multi-phase or whole-body lifts and drills (more than one pose pair)** (21)
`kettlebell-turkish-get-up`, `medicine-ball-chest-pass`, `burpee`, `kettlebell-windmill`, `bear-crawl`, `dumbbell-cuban-press`, `dumbbell-snatch`, `dumbbell-windmill`, `dumbbell-man-maker`, `dumbbell-devil-press`, `dumbbell-hammer-curl-to-press`, `kettlebell-snatch`, `kettlebell-figure-eight`, `kettlebell-around-the-world`, `medicine-ball-scoop-toss`, `medicine-ball-plank-roll`, `stability-ball-pass-hands-to-feet`, `wall-handstand-hold`, `squat-thrust`, `shadow-boxing`, `cable-cuban-press`

**Side planks and sideways core work (front-on view with a lateral lean the figure cannot hold still)** (9)
`side-plank`, `stability-ball-side-crunch`, `plank-up-down`, `plank-jack`, `side-plank-hip-dip`, `side-plank-thread-the-needle`, `copenhagen-plank`, `side-crunch`, `cable-oblique-crunch`

**Pikes, body saw, walk-outs and similar (hips and arms both travel)** (11)
`bird-dog`, `stability-ball-pike`, `stability-ball-prone-walkout`, `balance-trainer-single-leg-balance`, `suspension-pike`, `suspension-body-saw`, `ab-wheel-side-rollout`, `ab-wheel-pike-roll`, `boat-hold`, `crab-reach`, `crab-toe-touch`

**Tibialis raise: one ankle movement against a wall, no pattern yet** (1)
`tibialis-raise-wall`

**Other: no clean pattern yet (standing bicycle crunch twists while standing; squat jacks add a sideways jump)** (2)
`standing-bicycle-crunch`, `squat-jacks`

## Honest limits
- Angles are approximate typical ranges written by the author, not measured and not from a source. Coach/physio review is flagged on every pattern and is a standing gap.
- Twelve joints cannot express trunk rotation, wrist movement, shoulder-blade glide, a sideways step or a head-turn; those exercises are drawn as the nearest pose or left unmapped (see the list above). `rotation` uses the sideways lean as a stand-in.
- Single-leg and alternating exercises are drawn with both legs doing the same thing, except where the pattern says otherwise (lunge, step_up, mountain_climber, cardio_run, cardio_bike, dead_bug, carry).
- Unilateral exercises (one-arm row, single-arm press) draw both arms the same. A later phase can mark one side.
