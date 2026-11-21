# SEARCH (SR) — fuzzy exercise search

Spec: `contract/engines.md` section 14. Offline, pure, no library.

## Behaviour
Type anything: names, aliases ("butterfly", "lat pd"), machine names, muscles ("rear delt"), setup words ("reverse grip"), typos ("latt pulldwn"). Results update on every keystroke (debounced 60 ms), best first; the top result shows a "with reverse grip" chip when the query named a setup, and tapping it opens the exercise with that setup preselected.
Filters (muscle, machine, category, kind, difficulty, beginner-friendly, injury-safe, track) stack with the query. Empty query = browse. "No results" offers: clear filters, "add a custom exercise" with the query as the name.
Recent searches stay on the device (clearable in Settings -> Privacy).

## Where it is used
Library, routine builder picker, swap sheet, session "add exercise", custom-exercise machine picker, Machine Lab list.

## Authoring
`search_aliases.csv` (Phase 8) is plain data: alias, canonical phrase. Adding an alias needs no code change; recompile.

## Data file (Phase 8)
`contract/dataset/search_aliases.csv`: 621 aliases (abbreviations, muscle slang, exercise and machine names, setup words, common misspellings). Format: `contract/dataset/DATASET_GUIDE.md`.
