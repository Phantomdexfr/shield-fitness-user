# MACHINE_LAB (ML) — what each machine can reach

Spec: `contract/engines.md` section 15.

## Screens
- `/machines`: all 55 machines with photo, reach summary ("reaches 20 of 28 mapped muscles"), sort by reach / name / zone, search.
- `/machines/:slug` (Phase 21): photo(s), status, setup cues, exercises on it.
- `/machines/:slug/lab` (Phase 23): body figure (Body Picker, `heat` mode, gold ramp) coloured by reach; filter chips for **companions** (benches, attachments) and position; tap a muscle -> list of exercises on this machine that reach it, strongest first, each with the setup that does it; "modes" strip (e.g. Pec Deck: fly / reverse fly).

## Honest wording
Reach comes from our data, which has known gaps (Cable Crossover shows 20 of 28 muscles though it can physically reach nearly all). The lab says "not reachable with current data" and offers "suggest an exercise for this" (creates a custom exercise prefilled with the machine and muscle). It never says a machine cannot train a muscle.

## Combination example
Cable Crossover + adjustable bench + rope: shows chest (incline cable fly), triceps (overhead extension), rear delts (face pull variants), biceps (incline curl), and so on; each filter chip re-colours the body instantly.

## Data files (Phase 8)
`contract/dataset/machine_companions.csv` (benches, attachments, modes for 24 machines) and `contract/dataset/REACH_GAPS.md` (what is unreached and why, the 6 unmapped taxonomy muscles, suggested exercises). A bench machine (Adjustable, Utility ...) shows a low own reach by data structure; its page should use the companion view. Cable Crossover: 20 of 28 map-only, about 24 once the 30 unmapped cable exercises use the fallback.

## Delivered in Phase 23
`/machines` (sort by reach / name / zone, search, machine finder) and `/machines/:slug/lab` (body heated by reach, bench / attachment / position chips, tap a muscle for its exercises, modes, text twin, "Not reachable with current data"). Not built: the "suggest an exercise for this" button (needs the custom exercise creator, Phase 27). Chips combine one value per axis; the exercise link carries only the first chosen chip (`?setup=` takes one axis).
