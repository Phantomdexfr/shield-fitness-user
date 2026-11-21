# Coverage gaps and suggested exercises (FULL SET: 592 exercises mapped)

Counts come from `coverage_report.csv` (rebuilt from all 2,749 map rows). Suggestions below are **not added** to any file. They are ideas for the exercise library.

## Detailed muscles with fewer than 3 primary exercises
| Muscle | Primary now | Which exercises | Suggested additions (NOT added) |
|---|---|---|---|
| quads_lower | 0 (18 secondary) | none: used only as a "contested" secondary on deep-knee-flexion work (leg extension, hack squat, wall sit, step-down and similar) | First confirm what the map's lower-thigh region means (see notes). If it is kept: Terminal Knee Extension (band), Sissy Squat or Spanish Squat, Reverse Nordic / Slant-Board Knee Extension, Heel-Elevated Goblet Squat. All of these carry the same "contested" caveat (VMO or "teardrop" isolation is not supported). |
| serratus_anterior | 1 | Scapular Push-Up | Push-Up Plus; Standing Cable or Band Serratus Punch; Wall Slide with lift-off; Dumbbell Serratus Press (supine punch) |
| tibialis_anterior | 1 | Tibialis Raise (Wall) | Banded Dorsiflexion (seated); Heel Walk; Tib Bar or loaded dorsiflexion if a bar exists |

## Thin but above the line (3-5 primary): worth watching
- soleus (4): add Single-Leg Seated Calf Raise and a bent-knee Smith or leg-press calf raise. It has 26 secondary rows because cardio and jump rows list it as a secondary, but few exercises make it primary.
- neck (4): all four are one neck region; flexor/extensor/lateral split is not drawn. No gap unless neck regions are added to the map.

## Not gaps by design (0 own primaries)
- Parents with no drawn region: chest, back, shoulders, traps. Their children carry the primaries (rollup column in `coverage_report.csv`).
- System ids: cardio, full_body. They are not used as `muscle_id`; the 99 exercises with those old primaries are mapped to the muscles that do the work.

## Batch 1 pending items, re-checked after batch 2
| Muscle | Primary batch 1 | Primary now | What changed |
|---|---|---|---|
| lower_back | 17 | 18 | +1: Barbell Zercher Carry. Hinge-type batch 2 rows (swings, cleans, sumo pulls) list the erectors as stabilisers, so the id stays mostly stabiliser (96 rows). |
| hamstrings | 27 | 49 | +22: swings (kettlebell, dumbbell, American), cleans and snatches, windmills, cable and band pull-throughs, Jefferson deadlift, Broad Jump, Medicine Ball Scoop Toss, Reverse Plank, Suspension Hip Bridge (heels in straps assumed), Butt Kicks, and the curve-treadmill / reverse-stride cardio rows (contested bias). |
| upper_chest | 39 | 39 | No new primary. Burpees, man makers and hip-bridge presses use lower_chest (the map's mid + lower region). Secondary only: +1. |
| calves | 8 | 35 | +27, almost all cardio rows (treadmill, jump rope, jumping jacks, star jump). Calves counts are inflated by cardio; filter by exercise kind if you rank strength exercises. |

## Other things worth knowing
- Adductors have 10 primaries, but only Hip Adduction Machine and Copenhagen Plank are close to isolation; the rest are lunges, sumo pulls and Cossack squats where adductors work with the quads or glutes (inner-thigh isolation claims are contested).
- Machines: the Hip Adductor / Abductor machine has 2 exercises (abduction, adduction). Adding single-leg variants would not change muscle coverage.
- Hip flexors have 27 primaries (leg raises, tucks, knee drives, V-ups). Many "lower abs" claims are contested and are kept on `hip_flexors` + `abs`, not as an upper/lower rectus split.
