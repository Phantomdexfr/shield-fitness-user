# SETUP_OPTIONS (SO) — grips, handles, positions, benches

Spec: `contract/engines.md` sections 13-13b. This file is the UX + data guide.

## What the owner asked
Machines have lots of grips and modes (pec deck fly vs reverse butterfly, lat pulldown wide / reverse / neutral / MAG handle ...). All of them must exist in the app, selectable, and they must change what muscles get credit.

## Axes (UI order)
Grip · Width · Handle/attachment · Position · Arms · Bench (+ optional angle). Only axes the exercise actually offers are shown. Compact chip rows, wrap onto new lines, never scroll sideways, never truncate labels.

## Where it appears
Exercise page (default setup + "other setups" list with a one-line effect, e.g. "more biceps, lower lats"), routine item editor, set logger header (last used setup preselected, one tap to change), swap sheet ("same exercise, different grip" is the FIRST alternative offered), search results (setup chips), machine pages (modes and attachments).

## Data
- Source: free-text variation rows in the dataset, tagged by the Phase 10 compiler with `setup_rules.csv` (authored in Phase 8).
- Untagged text stays visible as a plain variation line; nothing is dropped.
- Muscle effect: `setup_muscle_shift.csv` (authored, flagged for physio review). Wording for effects is "tends to emphasise", never a promise.
- Reverse modes that are separate exercises (Reverse Pec Deck) are linked as machine modes and show in each other's "related" list.

## Rules
1. A setup never blocks logging; skipping the picker uses the default.
2. History keeps the setup per set item; PR boards can optionally separate by setup (Settings, default off).
3. Custom exercises can offer setup options too (pick axes while creating).
4. Gym policy can hide an exercise or a handle (library overrides); unknown values are ignored.

## Data files (Phase 8)
`contract/dataset/setup_rules.csv` (322 keyword rules) and `setup_muscle_shift.csv` (157 shift rows, all flagged for physio review). Formats and the exercise-pattern table: `contract/dataset/DATASET_GUIDE.md`. Not in the six-axis vocabulary, so left as plain text for now: hook, snatch and clean grips, bent-over, feet or rear foot elevated, deficit, lifting straps.
