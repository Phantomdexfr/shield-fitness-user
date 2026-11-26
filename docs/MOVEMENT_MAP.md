# MOVEMENT_MAP (MM) — geometric movement diagram per exercise

Spec of record: `contract/engines.md` section 19. Phases 24 (data) and 25 (renderer).

## Idea
Each exercise gets a clean **geometric figure** (capsule limbs and joint dots, gold on dark) showing the **start pose** (faded) and **end pose** (solid), an arc arrow on each main moving joint with its typical angle change ("elbow 90 -> 160 deg"), the line of resistance (bar / cable / dumbbell / machine glyph) and the working muscles as chips. It teaches how the body moves, not just which muscle works.

## Where
Exercise page (hero figure), machine page (Movement tab, one figure per exercise on that machine, swipeable), custom-exercise creator (choose a pattern, the figure updates live), session header (optional mini figure), setups: changing bench angle, position or grip width re-poses the figure.

## How it is built without drawing 634 pictures
About 30 **movement patterns** (press, row, pull, hinge, squat, curl, raise, fly, carry, core ...) each store start/end joint angles. Rules map exercises to patterns (target >= 85%); the rest show the plain muscle map. Figures are drawn from angles by forward kinematics, so adding a pattern is a data row, not artwork.

## Honest wording
"Typical movement". Angles are approximate ranges, not form prescriptions; every pattern is flagged for coach/physio review. Nothing says "correct" or "wrong" form.

## Rules
Tokens-only colours; no purple/violet/magenta/pink; nothing bleeds at 320 px; every figure has a text twin ("Start: elbows bent about 90 degrees. End: arms extended.") for accessibility; reduced-motion = static start/end only (optional gentle animation otherwise).

---

## Frozen in Phase 24 (data and spec; Phase 25 builds the renderer from this)

**Data is in `contract/dataset/`** (`movement_patterns.csv`, `pattern_rules.csv`, `exercise_pattern_map.csv`, `equipment_presets.csv`); formats, joint conventions, params and the unmapped list are in `contract/dataset/MOVEMENT_PATTERN_NOTES.md`. Result: 54 patterns (the spec said "about 30"; see that file), 540 of 634 exercises mapped (85.2%), 94 unmapped with reasons. Every pattern is `coach_review=yes`.

### P24.1 Drawing rules (for Phase 25)
- One figure, 4:3 frame like the machine photos, gold on dark, tokens only. Start pose faded (about 35% opacity), end pose solid. Capsule limbs, joint dots, a floor line, no face.
- **Arc arrows**: on each joint whose angle changes by 25 degrees or more between start and end, at most 3 joints, biggest change first. Angle text "elbow 90 to 160 deg" (strings below). Joints that do not move get no arrow.
- **Resistance line + glyph**: from `path_hint` and the glyph order in `MOVEMENT_PATTERN_NOTES.md`. A pattern with `hold` or an unknown hint draws no arrow.
- **Muscle chips** below the figure: the exercise's primary muscles with the setup-aware weights (engines.md 2 and 13b), at most 4 chips, tap = `/muscle/<id>`.
- **Text twin** under the figure, always in the DOM (visually quiet, not hidden): `twin_start` then `twin_end` from the pattern row. A `grip_width` / `stance_width` param adds a trailing "Wide grip." or "Narrow stance." sentence.
- **Params** change the pose exactly as the `param` table in `MOVEMENT_PATTERN_NOTES.md` says; the Setup picker (Phase 22) bench/width/position choices are translated into those keys.
- **Reduced motion**: static start and end only, shown side by side as faded and solid in one figure (no animation). Otherwise a 1.2 s ease between start and end, looped twice, then rests on the end pose.
- Male/female proportions: two segment-length tables (Phase 25 authors them); the choice is a profile preference, default neutral-male.
- Unmapped exercise: the plain muscle map (Phase 17 figure) plus one quiet line: "No movement diagram for this exercise yet."

### P24.2 Screen sketches (360 px wide; nothing bleeds, no truncation)
```
EXERCISE PAGE (hero, under the photo/title, above "Muscles")      MACHINE PAGE ("Movement" tab, swipe)
+------------------------------------------+                      +------------------------------------------+
| Typical movement                    (i)  |                      | Photos | Movement | Lab                  |
| +--------------------------------------+ |                      | < Barbell Bench Press            1/6 > |
| |  faded start / solid end figure      | |                      | +--------------------------------------+ |
| |  arc: elbow 80 to 175 deg            | |                      | |  figure (same as exercise page)      | |
| |  gold bar line + glyph               | |                      | +--------------------------------------+ |
| +--------------------------------------+ |                      | [Chest] [Triceps] [Front delts]          |
| [Chest] [Triceps] [Front delts]          |                      | Start: lying back, hands at the chest... |
| Start: lying back, hands at the chest,   |                      | End: arms extended above the chest.      |
| elbows bent about 80 degrees.            |                      | [Open exercise]                          |
| End: arms extended above the chest.      |                      +------------------------------------------+
+------------------------------------------+                      one figure per exercise on the machine,
                                                                   swipe or the < > buttons (44 px targets)
CUSTOM EXERCISE CREATOR (live preview)                             SESSION HEADER (optional mini figure)
+------------------------------------------+                      +------------------------------------------+
| Movement pattern   [ Horizontal press v ]|                      | Barbell Bench Press        [fig]  Set 2/4|
| +--------------------------------------+ |                      | 80 kg x 8                    56 x 56 px  |
| | figure updates when the pattern or   | |                      +------------------------------------------+
| | the bench / width options change     | |                       mini = end pose only, no arcs, no text;
| +--------------------------------------+ |                       tap opens the full figure in a sheet;
| Bench angle  [ - ] 30 [ + ]   (if used)  |                       off by default (Settings > Session)
| "Not sure? Skip it: you get the muscle   |
|  map instead."                           |
+------------------------------------------+
```
- The pattern chooser in the creator is a native `Select` of the 54 pattern names plus "None". Rules in `pattern_rules.csv` pre-select a suggestion from the typed name (shown as a quiet "Suggested").
- The (i) opens a small sheet: "Typical movement. Angles are approximate ranges and differ between people and setups. This is not a form instruction." (No claim of correct or wrong form anywhere.)

### P24.3 Wording (English; Phase 25 adds the keys to `src/i18n/en.ts`)
| Key | Text |
|---|---|
| `mm.title` | Typical movement |
| `mm.start` / `mm.end` | Start / End |
| `mm.info` | Typical movement. Angles are approximate ranges and differ between people and setups. This is not a form instruction. |
| `mm.arc` | {joint} {from} to {to} deg |
| `mm.joint.shoulder` ... | shoulder, elbow, hip, knee, ankle, neck, torso |
| `mm.unmapped` | No movement diagram for this exercise yet. |
| `mm.suggested` | Suggested |
| `mm.none` | None |
| `mm.wide_grip`, `mm.narrow_grip`, `mm.wide_stance`, `mm.narrow_stance` | Wide grip. / Narrow grip. / Wide stance. / Narrow stance. |
| `mm.mini_open` | Show movement |
The twin sentences come from the CSV (`twin_start`, `twin_end`), which is English dataset content like exercise cues. Words banned in this feature: correct, wrong, proper, perfect, should, must (the guard test in Phase 25 checks the keys above and the CSV twins).

### P24.4 Decisions and assumptions
- [A-P24.1] 54 patterns, not about 30, to reach the 85% target (see `MOVEMENT_PATTERN_NOTES.md`). Without the 9 patterns added last (rollout, dead bug, clean, side bend, triceps kickback, lateral lunge, cable crunch, jumping jack, slam: 27 exercises) about 81% would be mapped.
- [A-P24.2] Pose angles, anchors, `arm_world` and the param effects are the author's, flagged for coach/physio review; none of it is from a source.
- [A-P24.3] The unmapped 94 are left unmapped on purpose (frontal-plane moves, wrist work, neck, rolling, stretching, multi-phase lifts, side planks, pikes); the reasons are listed per exercise group.
- [A-P24.4] A custom exercise's pattern is stored as `patternId` plus the same `param` string; its figure is drawn live from the pattern row (no stored picture).
