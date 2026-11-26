# REACH_GAPS — what each machine cannot yet reach in our data, and what to add

Authored in User Phase 8 (2026-11-19). **Nothing here is added to the dataset.** The exercise CSVs are read-only source; every exercise below is a suggestion for a future dataset version (contract minor bump). Proposed slugs are ideas, not reserved ids.

Machine Lab (`engines.md` section 15) must say **"not reachable with current data"** for these, never "cannot train". Every muscle below can be trained with the right kit; the gap is in our rows.

## 1. How the counts were made
- 28 distinct muscle ids appear in `detailed_muscles/exercise_muscle_map.csv` (the "28 mapped muscles").
- **Map-only** count: muscles with at least one map row of weight >= 0.3 (emphasis x role factor from `engines.md` section 2) among exercises linked to the machine. This matches the 20 in `DATASET_GUIDE.md` for Cable Crossover.
- **With fallback** count: the same, plus the 42 exercises that have no map rows, using the section 2 fallback (primary/medium 0.6, secondary/low 0.3, core ids expanded to their proposed children). I computed this with a throwaway script; Phase 12 owns the real expansion, so treat the "with fallback" numbers as estimates.
- **Cable Crossover has 30 of the 42 unmapped exercises** (cable goblet squat, split squat, deadlift, incline-bench curl, cuban press and others). That is why its map-only reach (20) is low. With the fallback it rises to about 24; the real fix is to map those 30 exercises (a dataset task, not a Phase 8 task).

## 2. The 6 unmapped taxonomy muscles
`muscle_taxonomy_detailed.csv` has 34 ids; 28 appear in the map. The other 6 are **not gaps**:

| Id | Why it has no map rows | What the Machine Lab does |
|---|---|---|
| `chest` | parent of `upper_chest` / `lower_chest`; children carry the rows | shows the max of its children |
| `back` | parent of `rhomboids_teres` / `serratus_anterior` | max of its children |
| `shoulders` | parent of front/side/rear delts and `rotator_cuff` | max of its children |
| `traps` | parent of `upper_traps` / `mid_lower_traps` | max of its children |
| `full_body` | system id, never a `muscle_id` | never coloured; shown as a "whole body" chip if the machine lists it |
| `cardio` | system id | never coloured; cardio machines show a "cardio" chip |

## 3. Cable Crossover first
Reach: **20 of 28 map-only, about 24 with the fallback.** Unreached by the map: abductors, calves, neck, quads, quads_lower, serratus_anterior, soleus, tibialis_anterior. The fallback covers abductors, quads, quads_lower and serratus_anterior only by a rough parent expansion, so they still deserve proper rows. Calves, soleus, tibialis_anterior and neck are unreached either way.

Suggested additions, in priority order (muscle roles are suggestions for the map file):

| # | Exercise (proposed slug) | Setup it needs | Reaches |
|---|---|---|---|
| 1 | Cable Serratus Punch (`cable-serratus-punch`) | D handle, standing or half-kneeling, single arm | serratus_anterior primary high |
| 2 | Cable Hip Abduction (`cable-hip-abduction`) | stirrup / ankle strap, standing | abductors primary high, glutes secondary |
| 3 | Cable Terminal Knee Extension (`cable-terminal-knee-extension`) | strap behind the knee, standing | quads_lower primary medium, quads primary high |
| 4 | Cable Seated Dorsiflexion (`cable-seated-dorsiflexion`) | stirrup on the forefoot, seated on a bench | tibialis_anterior primary high |
| 5 | Cable Standing Calf Raise (`cable-standing-calf-raise`) | D handles or belt, on a step | calves primary high, soleus secondary |
| 6 | Cable Seated Calf Raise (`cable-seated-calf-raise`) | strap over the knees, bench | soleus primary high, calves secondary |
| 7 | Cable Neck Flexion / Extension (`cable-neck-flexion-extension`) | head harness | neck primary. **Owner / physio decision first**: loaded neck work needs a safety review |

Also from the variation side: the data has **no cable rope variation row** (the only 3 rows that say "rope" are about battle rope thickness, out of 4,752 rows). Add rope options to cable pushdown, face pull, overhead extension, hammer curl and row exercises when the next dataset version is cut.

## 4. Other machines with a real gap
Reach is map-only / with fallback. Only muscles that are unreached in both are listed as gaps.

| Machine | Reach | Unreached | Suggested additions (proposed slug) |
|---|---|---|---|
| Dumbbells and Rack | 24 / 25 | neck, serratus_anterior, tibialis_anterior | Dumbbell Serratus Press, supine punch (`dumbbell-serratus-press`); Seated Dumbbell Dorsiflexion (`seated-dumbbell-dorsiflexion`). Neck: none recommended. |
| Flat Bench | 24 / 25 | serratus_anterior, soleus, tibialis_anterior | Bench Dumbbell Serratus Press (`bench-dumbbell-serratus-press`); Bench Seated Dumbbell Calf Raise, weights on the knees (`bench-seated-dumbbell-calf-raise`). |
| Olympic Barbell | 23 / 23 | neck, quads_lower, rotator_cuff, serratus_anterior, tibialis_anterior | Barbell Cuban Press, light (`barbell-cuban-press`); Barbell Heel-Elevated Squat (`barbell-heel-elevated-squat`); Landmine Press (`barbell-landmine-press`, serratus). |
| Smith Machine | 21 / 21 | abductors, hip_flexors, neck, obliques, rotator_cuff, serratus_anterior, tibialis_anterior | Smith Machine Push-Up Plus, hands on the bar (`smith-machine-push-up-plus`, serratus). The rest have **no natural Smith exercise**; leave them unreached. |
| Power Cage | 17 / 17 | abductors, calves, hip_flexors, lower_chest, neck, obliques, rear_delts, rotator_cuff, serratus_anterior, soleus, tibialis_anterior | Cage Band Pull-Apart (`cage-band-pull-apart`, rear_delts); Cage Band Face Pull (`cage-band-face-pull`); Cage Dip, bars set (`cage-dip`, lower_chest); Cage Hanging Leg Raise (`cage-hanging-leg-raise`, hip_flexors); Cage Hanging Oblique Knee Raise (`cage-hanging-oblique-knee-raise`); Cage Barbell Calf Raise (`cage-barbell-calf-raise`); Cage Band External Rotation (`cage-band-external-rotation`, rotator_cuff). |
| Kettlebells | 23 / 23 | calves, neck, serratus_anterior, soleus, tibialis_anterior | Kettlebell Calf Raise on a step (`kettlebell-calf-raise`); Kettlebell Seated Calf Raise (`kettlebell-seated-calf-raise`). |
| Resistance Tubes | 21 / 21 | calves, hip_flexors, neck, quads_lower, serratus_anterior, soleus, tibialis_anterior | Banded Calf Raise; Banded Knee Drive; Banded Terminal Knee Extension; Banded Serratus Punch; Banded Dorsiflexion (already suggested in `detailed_muscles/coverage_gaps_and_suggestions.md`). |
| Suspension Trainer | 22 / 22 | lower_back, neck, quads_lower, serratus_anterior, soleus, tibialis_anterior | Suspension Hip Hinge / Good Morning (`suspension-good-morning`, lower_back); Suspension Push-Up Plus (`suspension-push-up-plus`, serratus). |
| Stability Ball | 19 / 19 | biceps, forearms, neck, quads_lower, serratus_anterior, side_delts, soleus, tibialis_anterior, upper_traps | **Low priority**: the ball is mostly a bench substitute. Ball Seated Dumbbell Curl, Lateral Raise and Shrug cover biceps, side_delts and upper_traps (`stability-ball-seated-dumbbell-curl`, `-lateral-raise`, `-shrug`). |

## 5. Machines that are not gaps
- **Benches as machines** (Adjustable, Utility, Flat Incline Combo, Flat, Olympic Flat/Incline, Preacher): they show a low reach (Adjustable 14, Utility 9) because the data links pressing and curling exercises to the dumbbell, barbell or cable they use, not to the bench. In the Machine Lab a bench page must show its **companion** view (the union of exercises that use it, via `machine_companions.csv`), not its own linked exercises.
- **Single-action machines** (Hip Adductor / Abductor, Leg Extension, Prone Leg Curl, Seated Calf Raise, Biceps Curl Machine, Hip Thrust Machine, Back Extension, Foam Roller): reach is narrow by design. `coverage_gaps_and_suggestions.md` already notes that single-leg variants would not change muscle coverage.
- **Cardio machines**: reach is `cardio` (system id) plus legs; nothing to add.
- **Cable Attachments** and **Standing Multi Flight** have no exercises linked (0). Cable Attachments is the attachment kit (see `machine_companions.csv`). Standing Multi Flight has no data at all; owner to say what it is or retire it.

## 6. Thin muscles that stay thin
quads_lower (0 primaries), serratus_anterior (1), tibialis_anterior (1), soleus (4), neck (4). The additions above raise serratus, tibialis and quads_lower. Whether to keep the quads_lower region at all is an open question in `DETAILED_MUSCLES_NOTES.md`.
