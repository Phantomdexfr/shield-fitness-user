# DATASET_RUNTIME — how the CSVs become app data (frozen in Phase 7)

Status: **frozen spec, docs only.** Phase 9 builds the compiler to this; Phase 11 builds the loader. If something here is wrong, change it here first (a `[D]` edit), then the code. Source files: `contract/dataset/*` (read-only; see `DATASET_GUIDE.md`). Numbers marked *measured* come from a throwaway script run on the real CSVs in Phase 7 (draft shapes below, gzip level 9, compact JSON); nothing from it is kept in the repo.

## 1. Pipeline
`contract/dataset/**/*.csv` -> `scripts/compile-dataset.mjs` (Phase 9, `npm run dataset`, papaparse, no network) -> `src/dataset/generated/*.json` (committed) -> imported lazily by `src/dataset/loader.ts` (Phase 11). The app never reads a CSV.

## 2. Master list and joins
- **Master list = `exercise_categories/exercise_categories_all.csv`** (634 rows, slug unique, *measured*). The six other exercise files (`exercises.csv`, `exercises_extended.csv`, `new_exercises/*`) are NOT read: the master already carries every column (checked: all 634 slugs have a row in the master; extra columns `original_category`, `original_sub_category`, `reason` are dropped).
- `machine_name` -> `machines.csv` `name` (blank = no equipment: 125 rows). Public machine id = `image_slug` (55 unique, equals `media_manifest.machine_slug`, *measured*).
- Muscle map / shift / variations join on `slug` (shift and substitutions/supersets carry the exercise NAME; the compiler resolves name -> slug through the master; all unresolved counts were 0 when measured; any unresolved name is a compile error).
- Slugs are the only public ids (API_CONTRACTS). Rep ranges are floats in the CSV (`8.0`): compile to integers; blank (76 cardio rows) -> `null`.

## 3. Compiled files (`src/dataset/generated/`)
All files: compact JSON, UTF-8, LF, keys in a fixed order, arrays sorted as stated, no timestamps. Tabular files use `{ "cols": [...], "rows": [[...]] }` so column names are not repeated per row.

| File | Source | Shape | Loaded |
|---|---|---|---|
| `exercises.index.json` | master + machines | `cols`: `slug, name, category, sub_category, kind, machine (slug or ""), primary (core ids, array), difficulty (1-3), unilateral (0/1), beginner (0/1), tracks (bitmask), warmup (0/1), chunk (detail chunk number)`. Rows sorted by `slug`. | precached, loaded on first use of the library, search or any list |
| `exercises.detail.<n>.json` | master + variation files + map notes | Chunks of 60 exercises sorted by `slug` (n = 0..10, 11 chunks). Object `{ slug: Detail }` with `Detail = { cues: string[], repMin: int\|null, repMax: int\|null, variations: string[], hint: string (the master `variations` prose), cautions: string, tracks: string[], pattern: string, notes: { muscleId: string } }` | first view (+ idle warm, see 6) |
| `muscles.json` | `detailed_muscles/muscle_taxonomy_detailed.csv`, `html_unit_to_detailed.csv` | `{ muscles: [{ id, name, parent, group, status: 'core'\|'proposed', regions }], units: [{ unit, muscle }] }` (34 muscles; 124 figure units for the Body Picker). Parent roll-up: `parent` = `parent_group`. | precached |
| `machines.json` | `machines.csv` + `machines_detailed.csv` | `{ cols, rows }`: `slug (image_slug), name, brand, category, zone (null if blank), stepKg (null if blank), quantity, status, cues (setup_cues), muscles (core ids), detailed (detailed ids)`. 55 rows sorted by `slug`. | precached |
| `media.json` | `media_manifest.csv` | `{ [machineSlug]: [{ file, variant: 'thumb'\|'detail', primary: bool, w, h, alt }] }`, ordered by `order`. Files live at `public/machines/<slug>/<file>`. 128 files, 2 primary per machine (one thumb, one detail). | precached |
| `muscle_map.json` | `exercise_muscle_map.csv` + fallback rows | `{ [slug]: [[muscleId, role p\|s\|t\|m, emphasis h\|m\|l, fallback 0\|1]] }`. 592 exercises from the file + 42 fallback exercises = 634 keys. The free-text `note` is NOT here (it goes in the detail chunk `notes`). | precached |
| `variation_shift.json` | `variation_muscle_shift.csv` | `{ [slug]: { [variationText]: [[muscleId, 'm'\|'l']] } }` (312 rows: 240 more, 72 less). The `reason` text is dropped (kept in the CSV). | precached |
| `substitutions.json` | `substitution_groups.csv` | `{ [slug]: slug[] }` (199 rows, hand-built; names resolved to slugs, order kept). `primary_muscle`, `alt_count`, `note` dropped. | precached |
| `supersets.json` | `superset_pairs.csv` | `[{ a: slug, b: slug, type, muscles: string[] }]` (38 rows). | precached |
| `dataset.manifest.json` | the compiler | `{ contract: <contract/VERSION>, version: <hash>, counts: { exercises, machines, muscles, mapped, fallback, variations, shiftRows, ... }, files: { <logical name>: <file name with hash> }, detailChunks: [{ n, count, file }] }` | read first; precached |

Notes on columns: `tracks` bitmask bits are fixed: beginner=1, intermediate=2, muscle_gain=4, athlete=8, fat_loss=16, strength=32, cardio=64 (the 7 values that exist, *measured*; an unknown track value is a compile error). `warmup` = `also_warmup == 'yes'` (29 rows). Index `primary` = the master `primary_muscles` core ids. The "injury-safe" library filter is NOT a data column: it is computed from the user's avoid marks and the muscle map (engines.md section 6); `injury_cautions` is non-blank on all 634 rows so it cannot be a flag, it is shown as text on the exercise page.
Compiled in Phase 10 (shapes in `API_CONTRACTS.md`; not in the precache list above, Phase 11 decides): `setup_options.json`, `search.index.json`, `machine_reach.json`. Not compiled in Phase 9: movement patterns (Phase 25); strength ladders (Phase 46). `split_templates_draft.md`, coverage/report CSVs and `exercise_categories/{compound,isolation,warmup,recovery,other,also_usable_as_warmup,exercise_category_lookup}.csv` are views of the master and are not read.

## 4. Chunking and hash-versioned filenames
- Detail chunks: sort the 634 exercises by `slug`, cut every 60 rows -> 11 chunks (10 x 60 + 1 x 34). The index `chunk` column says which chunk holds a slug, so the loader fetches one chunk per exercise page. Adding exercises can move rows between chunks; that is fine because names are hashed.
- File names: `<logical>.<hash8>.json` where `hash8` = first 8 hex of SHA-256 of the file bytes (e.g. `exercises.detail.3.1a2b3c4d.json`). The compiler deletes stale generated files, then writes the new ones and the manifest. `version` in the manifest = first 8 hex of SHA-256 over the sorted `name:hash` lines.
- **Idempotent:** same CSVs -> byte-identical output (no clock, no random, fixed ordering).
- The loader finds files through `import.meta.glob('./generated/*.json')` (lazy) and the manifest, never by a hard-coded hashed name. Vite then emits each JSON as its own hashed JS chunk; Phase 11 names them with `chunkFileNames`: `ds-detail-[hash].js` for `exercises.detail.*`, `ds-core-[hash].js` for everything else, so the service worker can tell them apart.

## 5. Dedupe rules for the six variation files
Files, in this fixed read order: `exercise_variations.csv` (332), `new_exercises/added_variations_for_existing_exercises.csv` (531), `new_exercises/new_exercise_variations.csv` (542), `new_exercises/cable_new_exercise_variations.csv` (179), `new_exercises/progression_variations.csv` (72), `new_exercises/variations_gap_fill_all_machines.csv` (3,096). Sum 4,752 rows, which equals the guide's count; *measured:* 4,752 unique `(slug, variation)` pairs, also 4,752 after normalising, all 634 slugs covered, none unknown, max 19 and mean 7.5 per exercise.
1. Key = `(slug, normalised text)` where normalised = trim, collapse inner whitespace, lower-case (comparison only; the text is NOT altered otherwise).
2. First occurrence in the order above wins and its original text is kept; later duplicates are dropped and counted.
3. Per-exercise order = file order, then row order inside the file.
4. Expected duplicate count today is 0; the compiler prints it, and a slug not in the master is a compile error.
5. Variation identity is the text. A shift row joins to a variation by exact text first, then by normalised text (all 312 shift rows match exactly, *measured*); an unmatched shift row is a compile error. 451 variations are listed in `variation_shift_skipped.csv` as having no clear direction (404 programming variables, 41 composites, 1 mixed): they simply have no shift row and use base weights (engines.md section 3).
6. `variations` in `Detail` is the deduped list; the master's own `variations` column (prose, non-blank on all 634) is kept separately as `hint`.

## 6. Precache and caching policy
- **Precached** (in the SW manifest, available offline after first load): the manifest, `exercises.index`, `muscles`, `machines`, `media`, `muscle_map`, `variation_shift`, `substitutions`, `supersets`. All are small (see 8).
- **Cached on first view** (runtime, CacheFirst): detail chunks (`ds-detail-*`), machine photos (already done by the Phase 5 route for `machines/`).
- **[A43] Idle warm:** the offline-first rule says everything must work offline after first load, but a user who never opened an exercise would have no chunk cached. After first load, when online and idle, the loader fetches all 11 detail chunks once (about 57 KB gz in total, less than one photo). Photos are NOT warmed (2.1 MB); an unseen photo shows the fixed empty frame offline.
- Work for later phases (not Phase 7): the Phase 5 glob (`**/*.{js,css,html,woff2,webmanifest,png,svg}`) already precaches `ds-core-*.js`; Phase 11 adds `globIgnores: ['**/ds-detail-*.js']`, the detail runtime route and the warm step. Phase 9 only produces files. Dataset data changes ship as a normal app update (new hashes -> update toast).
- Custom (user) exercises live in IndexedDB and merge at query time (Phase 11); they are never in these files.

## 7. Fallback for the 42 exercises with no muscle-map rows
Resolved **at compile time** so the runtime has one path (the result equals engines.md section 2): for each core id in `primary_muscles` emit role `p`, emphasis `m` (weight 0.6); for each core id in `secondary_muscles` emit role `s`, emphasis `l` (0.3); `fallback = 1`. A core id that has detailed children in the taxonomy (chest, back, shoulders, abs, glutes, quads, calves, traps) expands to ALL its children (each with that same weight), and the parent row itself is not emitted. A core id with no children (lats, biceps, triceps, forearms, obliques, hamstrings, lower_back, full_body, cardio, ...) is emitted as itself. If an id is in both lists, primary wins. The compiler prints the 42 slugs; the UI may show "estimated muscles" for `fallback = 1` rows. The Phase 12 `weights.ts` still implements section 2 for inputs without map rows (custom exercises use their own rows), and a test checks both paths agree on the 42.

## 8. Size budgets, with arithmetic
Measured on draft shapes (gzip -9). Real files get a few % larger from the extra index columns; budgets leave a wide margin.
| File | Raw | Gzip | Budget (gz) |
|---|---|---|---|
| exercises.index | 70.2 KB (634 rows x about 110 B) | 11.1 KB (ratio 0.16) | **<= 120 KB** (phase rule) -> used 9% |
| muscles (+ units, est.) | 7.8 KB (+ about 6 KB) | 2.0 KB (+ about 2 KB) | <= 8 KB |
| machines | 17.1 KB | 3.6 KB | <= 10 KB |
| media | 32.5 KB | 3.1 KB | <= 8 KB |
| muscle_map | 73.5 KB (2,749 + fallback rows x about 27 B) | 7.4 KB | <= 20 KB |
| variation_shift | 15.0 KB | 3.4 KB | <= 8 KB |
| substitutions | 38.4 KB (draft kept names; slug arrays similar) | 3.5 KB | <= 8 KB |
| supersets | 4.8 KB | 1.0 KB | <= 3 KB |
| manifest | < 3 KB | < 1 KB | <= 2 KB |
| **Precached dataset total** | | about 38 KB (11.1+4.0+3.6+3.1+7.4+3.4+3.5+1.0+1.0 = 38.1) | **<= 60 KB** |
| detail chunk (each) | max 33.6 KB | max 7.0 KB | **<= 12 KB** each; 11 chunks, total 57.1 KB gz (289 KB raw) estimated; **measured in Phase 9: 79.7 KB gz (380 KB raw), max chunk 8.2 KB gz, precached files 35.5 KB gz** |
Runtime memory: index decoded about 70 KB raw plus a token vocabulary of a few thousand strings; detail chunks are decoded one at a time (one chunk about 34 KB raw). Parse of the index must stay under 20 ms on a mid phone (not measurable here; a standing gap until a device run).
The later search index (Phase 10) has its own budget (<= 250 KB gz); it is not counted here.

## 9. Search design (data side; scoring is engines.md section 14, built in Phase 20)
- **Phase 11 builds search from `exercises.index.json` alone** (Phase 10's `search.index.json` does not exist yet): at load it makes a vocabulary from tokens of name, machine name, category/sub-category, and primary muscle names (from `muscles.json`). Aliases and setup words arrive when Phase 10/20 add `search.index.json`; the loader must accept it as optional.
- **Normalise:** Unicode NFKD, strip combining marks (diacritics), lower-case, replace every non-alphanumeric run with one space, trim. The same function is used at compile time and runtime (`src/shared`, pure).
- **Tokens:** split on spaces; drop tokens of length 1 except digits; keep numbers.
- **Prefix index:** the sorted vocabulary array; a prefix query is a binary search for the first match and a scan while the prefix holds. Each vocabulary entry maps to a list of exercise rows (indices into the index rows).
- **Typo tolerance (rule from engines.md section 14):** a query token matches a vocabulary token by exact, prefix, or edit distance <= 1 when its length is 4-6 and <= 2 when >= 7 (a transposition counts as one edit; tokens shorter than 4 are exact or prefix only). Edit distance runs only over the vocabulary (a few thousand entries), never over exercise rows.
- Every query token must match; ties by shorter name, then slug; deterministic.
- Budget (engines): < 50 ms for 700 documents on a mid phone (unmeasured until a device run).

## 10. Compile-time validation list (for Phase 9)
Slug unique and lower-kebab; every non-blank `machine_name` resolves; every muscle id used anywhere is in the 34-id taxonomy; `rep_min <= rep_max` when both present; every machine has a primary thumb and detail in the manifest and the files exist under `public/machines/`; every shift row resolves (section 5); every substitution/superset name resolves; every track value is one of the 7; the printed counts equal `DATASET_GUIDE.md` (634 exercises, 55 machines, 34 muscles, 592 mapped + 42 fallback, 2,749 map rows, 4,752 variations, 312 shift rows, 128 media files, 199 substitution rows, 38 superset rows). Any failure exits non-zero and writes nothing.

## 11. File-by-file accounting (every dataset file in the guide)
- **Read by the compiler (Phase 9):** `exercise_categories/exercise_categories_all.csv`, `machines.csv`, `detailed_muscles/machines_detailed.csv`, `media_manifest.csv`, `detailed_muscles/muscle_taxonomy_detailed.csv`, `detailed_muscles/html_unit_to_detailed.csv`, `detailed_muscles/exercise_muscle_map.csv`, `detailed_muscles/variation_muscle_shift.csv`, the six variation files (section 5), `substitution_groups.csv`, `superset_pairs.csv`.
- **Read by later compiler phases:** Phase 10 reads `setup_rules.csv`, `setup_muscle_shift.csv`, `machine_companions.csv`, `search_aliases.csv` (authored in Phase 8) plus the variation files again; Phase 25 reads `movement_patterns.csv`, `pattern_rules.csv`, `exercise_pattern_map.csv`; Phase 46 reads the strength-ladder CSVs.
- **Not read (superseded by the master or informational):** `exercises.csv`, `exercises_extended.csv`, `new_exercises/{new_exercises,new_exercises_extended,cable_new_exercises,cable_new_exercises_extended,progression_new_exercises,progression_new_exercises_extended}.csv` (all folded into the master), `exercise_categories/{compound,isolation,warmup,recovery,other,also_usable_as_warmup,exercise_category_lookup}.csv` (views), `CATEGORY_NOTES.md`, `muscle_taxonomy.csv`, `muscle_coverage.csv`, `detailed_muscles/{coverage_report.csv,variation_shift_skipped.csv,coverage_gaps_and_suggestions.md,validation_output.txt}` (reports; `variation_shift_skipped.csv` is used only as the cross-check in section 5.5), `split_templates_draft.md` (trainer approval pending), and the `*_NOTES.md` files.
