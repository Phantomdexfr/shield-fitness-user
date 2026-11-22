# PHASES — Shield Fitness USER APP (72 phases, 9 milestones)

**Edit in place.** Never renumber a completed phase. If a phase proves too large, split it, give the new phases the next plain numbers, renumber the later ones everywhere (use a script, then grep), and log it in `PHASE_STATUS.md`. No letter suffixes.
Each phase fits ONE free Claude session. Big topics = a docs-only **[D]** phase freezes the contract, small **[E]** phases build, **[G]** phases check and release.
Format: **Goal · Depends · In scope · Out of scope · Key files · Version · Verify.**
Shorthand: `AI` = `docs/AI_REVIEW_EXPORT.md`, `MM` = `docs/MOVEMENT_MAP.md`, `MB` = `docs/MUSCLE_BADGES.md`, `XT` = `docs/EXTRAS.md`, `PS` = `docs/PLAN_SHARE.md`, `SO` = `docs/SETUP_OPTIONS.md`, `ML` = `docs/MACHINE_LAB.md`, `SR` = `docs/SEARCH.md`, `SC` = `docs/SCHEDULER.md`, `BC` = `docs/BARCODE.md`, `CT` = `contract/`, `DS` = `contract/dataset/`, `EN` = `contract/engines.md`, `UI` = `docs/design/UI_RULES.md`, `DT` = `docs/design/DESIGN_TOKENS.md`, `BP` = `docs/BODY_PICKER.md`, `HM` = `docs/HEATMAP.md`, `RB` = `docs/ROUTINE_BUILDER.md`, `FS` = `docs/FLEXIBLE_SESSION.md`, `EP` = `docs/EXERCISE_PAGE.md`, `HA` = `docs/HOLO_ATLAS.md`, `SM` = `docs/SETTINGS_MAP.md`, `GC` = `docs/GYM_CONNECTION.md`, `OL` = `docs/reference/PROGRESSIVE_OVERLOAD_RULES.md`, `PROTO` = `reference/prototypes/`.
**Honesty rule:** the sandbox has no phone, no Safari, no real gym server. Each phase says what tests prove and what stays a *standing gap for the owner*.
**Versions:** `0.0.x` while building; `0.1.0` = Phase 64 (standalone release); `0.2.0` = Phase 70; `1.0.0` = Phase 71.
**Cross-zip:** Phases 1-64 need NOTHING from the Admin zip. Phases 65-70 need the Admin zip's Phases 9-18 done and deployed by the owner.

---
## MILESTONE 1 — Foundation (1-6)
*Exit: themed, routed, installable, offline empty shell with install gate and a local store. No data features yet.*

## Phase 1 — Scaffold, toolchain, Pages + Vercel configs [E]
**Goal:** Runnable Vite + Preact + TS + Tailwind project, pinned deps, deployable to GitHub Pages and Vercel from the same build.
**In scope:** (a) `npm init`, `.npmrc` `save-exact=true`, install ONLY Phase-1 packages from `DEPENDENCY_VERSIONS.md`; (b) configs per `PROJECT_STRUCTURE.md`; scripts `dev build typecheck test`; (c) `VITE_BASE` env (`/shield-fitness-user/` on Pages, `/` on Vercel); (d) `scripts/postbuild.mjs` copies `dist/index.html` to `dist/404.html`; (e) `.github/workflows/deploy.yml` (tag `v*` + manual only), `vercel.json`; (f) placeholder page; (g) fill the Install-test log.
**Out:** design, router, PWA. **Key files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `vitest.config.ts`, `vercel.json`, `scripts/postbuild.mjs`, `GITHUB_UPDATE_PUSH.md`.
**Version:** 0.0.1. **Verify:** `npm install`; typecheck once; one trivial test; `npm run build` once; `dist/404.html` equals `dist/index.html`. Install failure = blocker: record and stop.

## Phase 2 — Design tokens, fonts, guard tests [E]
**Goal:** The dark + gold language as CSS variables, self-hosted fonts, guard tests. **Read:** `DT`, `UI`.
**In scope:** `src/ui/styles/tokens.css` (surfaces, text, gold ramp, tier colours, semantic, **heat ramp 0-5, recovery colours**, radii, spacing, type, motion), `base.css` (reset, safe-area, focus ring, reduced-motion, `overflow-x: clip`), Tailwind theme from variables, self-hosted woff2 fonts (pick + pin the packages; record in `DEPENDENCY_VERSIONS.md`), `guard.test.ts`: fails on colour literals outside `tokens.css`, hues 250-350 with saturation > 10%, `text-overflow`, `line-clamp`, any `https://` font/CDN URL in `src/` or `index.html`.
**Out:** components. **Version:** none. **Verify:** guard passes; deliberate bad fixtures prove every rule can fail.

## Phase 3 — UI primitives [E]
**Goal:** The component kit: Card, Button, IconButton, Chip, Badge, Segmented, Tabs, Field/Input/Select/Toggle, Stepper, Sheet, Dialog, Toast, Skeleton, EmptyState, ProgressRing/Bar, Avatar, Icon (inlined Phosphor via build script), Pressable, `motion.ts`, `haptics.ts`, **PhotoFrame** (4:3, lazy, placeholder), **SubPageHeader** (back + title, for settings sub-pages).
**Depends:** 2. **Key files:** `src/ui/components/*`. **Version:** none.
**Verify:** typecheck once; smoke tests (render, press fires, long text wraps, no truncation classes); guard still passes.

## Phase 4 — Router, slugs, route registry, feature flags, shell [E]
**Goal:** Slug routes + module registry + `useFeature(key)` + app shell + `/dev/design-preview`.
**In scope:** wouter with base path; `src/app/routes.ts` registry `{id, path, feature, component}`; `src/app/flags.ts` reading `CT/features.catalogue.json` (standalone defaults; policy hook point left for Phase 66); bottom tab bar (Today, Body, Train, Library, Me) + page transitions; 404 page; dev-only design preview.
**Depends:** 3. **Version:** none. **Verify:** registry test (unique ids/paths, every feature key exists in the catalogue), flag default tests, typecheck once.

## Phase 5 — PWA: service worker, manifest, update flow, install gate [E]
**Goal:** Installable, offline shell, nothing runs until installed. **Read:** `docs/PWA_INSTALL_GATE.md`.
**In scope:** `vite-plugin-pwa` (`injectManifest`), `src/sw.ts` (precache shell, navigation fallback so every slug works offline, large assets cached on demand only), manifest, `src/pwa/installGate.ts` (pure `detectInstallState`) + tests, `InstallGate` page (iOS Safari steps, Android prompt, iOS other, in-app browser, desktop "open on your phone" + QR), update toast, `version.json` check.
**Depends:** 4. **Version:** 0.0.2. **Verify:** installGate unit tests for every state; build emits `sw.js` + manifest. STANDING GAP: real install on iOS/Android (Phase 64 checklist).

## Phase 6 — Local store: IndexedDB, migrations, outbox, backup [E]
**Goal:** The offline database. **Read:** `docs/SYNC_SPEC.md` (local section).
**In scope:** `idb`; `src/data/local/db.ts` (versioned migrations; stores: `kv`, `meta`, `sessions`, `routines`, `customExercises`, `favourites`, `prefs`, `marks`, `bodyStats`, `goals`, `intake`, `photos` (device-only), `outbox`); typed repos; `outbox.ts` (used only when connected; harmless otherwise); `exportAll/importAll` (backup file shape in `API_CONTRACTS.md`); `navigator.storage.persist()`; quota helper.
**Depends:** 4. **Version:** none. **Verify:** fake-indexeddb tests: migration keeps data, export/import round-trip, repo queries, photos excluded from outbox.

---
## MILESTONE 2 — Dataset and pure core (7-15)
*Exit: the 634-exercise dataset is compiled, searchable offline, and the suggestion engine exists as tested pure code.*

## Phase 7 — Dataset compile + runtime spec [D]
**Goal:** Freeze how CSVs become app data. **DOCS ONLY. Read:** `DS/DATASET_GUIDE.md`, `EN` sections 1-3.
**In scope:** the compiled JSON shapes (`exercises.index.json` small: slug, name, category, sub_category, kind, machine slug, primary core muscles, difficulty; `exercises.detail.<n>.json` chunks of ~60 with cues, rep range, variations, cautions, track_fit; `muscles.json`; `machines.json`; `muscle_map.json`; `variation_shift.json`; `substitutions.json`; `supersets.json`; `media.json`); chunking + hash-versioned filenames; precache policy (index + muscles + machines precached; detail chunks and photos cached on first view); search design (normalised tokens, prefix index, diacritics, typo tolerance rule); dedupe rules for the 6 variation files; fallback rule for the 42 exercises with no map rows; size budgets (index <= 120 KB gzip). Write into `API_CONTRACTS.md` and `docs/DATASET_RUNTIME.md`.
**Out:** code. **Verify:** every dataset file in the guide is accounted for; budgets stated with arithmetic.

## Phase 8 — Setup options, search and machine-reach data spec [D]
**Goal:** Freeze the data work behind grips, fuzzy search and the Machine Lab. **DOCS + DATA CSVs ONLY (no app code). Read:** `DS/DATASET_GUIDE.md` (Added gaps), `EN` sections 13-15, `docs/SETUP_OPTIONS.md`, `docs/MACHINE_LAB.md`, `docs/SEARCH.md`.
**In scope:** (1) write `contract/dataset/setup_rules.csv` (keyword -> axis/value; covers the ~1,500 tagged phrases, incl. "reverse grip", "neutral", "MAG", "rope", "half-kneeling"); (2) `setup_muscle_shift.csv` (axis/value/applies_to/muscle/shift) for the main patterns: pulldown, row, press, fly, curl, pushdown, raise; (3) `machine_companions.csv` (bench/attachment per machine) and machine `modes`; (4) `search_aliases.csv` (at least 150 aliases: butterfly, lat pd, rdf, db/bb, ohp, rdl, skullcrusher ...); (5) gap list `contract/dataset/REACH_GAPS.md`: per unreached muscle, which exercises to add per machine (Cable Crossover first), and the 6 unmapped taxonomy muscles; (6) physio-review flag on every shift row. **STOP and tell the owner:** these files live in `contract/` so the Admin zip must receive a copy (see CT/CONTRACT.md), and `contract/CHECKSUMS.txt` must be regenerated.
**Out:** compiler code, UI. **Verify:** every rule file parses; every axis value is in the engines.md vocabulary; counts printed in `PHASE_STATUS.md`.

## Phase 9 — Dataset compiler script [E]
**Depends:** 7. **In scope:** `scripts/compile-dataset.mjs` (papaparse, no network) -> `src/dataset/generated/*.json`; validation (slug uniqueness, every `machine_name` resolves, muscle ids in taxonomy, rep_min <= rep_max, every machine has a primary image in the manifest, counts printed); idempotent; `npm run dataset`.
**Version:** none. **Verify:** run once; counts match `DS/DATASET_GUIDE.md` (634 exercises, 55 machines, 34 muscles, 592 mapped); validator tests with broken fixtures.

## Phase 10 — Compiler: setup options, search index, reach table [E]
**Depends:** 8, 9. **In scope:** extend `scripts/compile-dataset.mjs`: tag variations -> `setup_options.json`; `search.index.json` (normalised tokens + aliases); `machine_reach.json` (per machine, per companion filter, using `EN` 15 at compile time); `review/untagged_variations.csv` report; validator (unknown axis values, alias loops).
**Version:** none. **Verify:** counts printed; >= 90% of the variation rows that contain a grip/handle keyword are tagged; Cable Crossover reach matches the gap list; size budgets (search index <= 250 KB gz) stated with arithmetic.

## Phase 11 — Dataset runtime: loader, search, repos [E]
**Depends:** 6, 9. **In scope:** `src/dataset/{loader,search,query}.ts`: lazy chunk loading, in-memory index, `getExercise(slug)`, `search(q, filters)`, `byMuscle(id)`, `byMachine(slug)`, `variationsOf(slug)`, machine `imageUrls(slug)`; merge of custom exercises at query time; `src/data/repos/exercises.ts`.
**Version:** none. **Verify:** tests on a trimmed fixture dataset (search ranking, filters, chunk lazy-load called once, custom merge, missing slug).

## Phase 12 — Pure basics + muscle weights [E]
**Depends:** 7. **In scope:** `src/shared/{slug,units,dates,validators}.ts`; `src/shared/muscles.ts` (taxonomy, parent roll-up); `src/shared/weights.ts` implementing `EN` sections 2-3 (`muscleWeight`, `applyVariation`, fallback); `src/i18n/en.ts` + `t()`.
**Version:** none. **Verify:** slug tests (diacritics, collisions), IST day edges, weight tests on real rows copied into fixtures (incline press shifts upper chest, etc.).

## Phase 13 — Option-aware muscle weights [E]
**Depends:** 12, 10. **In scope:** `src/shared/weights.ts` gets `applySetup` (`EN` 13b); `Setup` type + zod; heat/recovery callers take an optional setup; creates `contract/fixtures/setup_*.json` (new files; copy to Admin zip later).
**Verify:** worked examples (lat pulldown supinated/wide, reverse pec deck neutral, cable row handles); stacking and cap tests; exact-variation row beats setup shift.

## Phase 14 — Suggestion, routine and session contract [D]
**Goal:** Freeze the shapes and scoring before any UI. **DOCS ONLY. Read:** `EN` sections 1, 6-10, `RB`, `FS`.
**In scope:** finalise `Routine/Day/Item/Session/SessionItem/CustomExercise` JSON in `API_CONTRACTS.md`; scoring constants table; seeded jitter definition; list-order rules (suggested -> built -> more); skip reasons; 8+ worked numeric examples for `scoreExercise`; alternatives pool order with examples; confirm which `EN` [A] values stand. If any `contract/` file must change, STOP and tell the owner (a contract change is a two-zip job).
**Verify:** each rule has a worked example.

## Phase 15 — Suggestion engine (pure) [E]
**Depends:** 12, 14. **In scope:** `src/shared/suggest/{score,rank,list,jitter}.ts`; creates `contract/fixtures/suggest_*.json` (new files only, copy to Admin zip later); no UI.
**Version:** none. **Verify:** worked examples from Phase 14 pass; property tests (hidden/avoided never returned, deterministic per date+slug, stable under reordering input).
**Added scope (2026-11-18):** each suggestion also returns up to 2 **reason codes** (`EN` 25: recovered, neglected, in_routine, built_by_you, same_variation, favourite, progress_ready, balances_week); tests for reason selection.

---
## MILESTONE 3 — Body Picker, library, exercises (16-27)
*Exit: tap a body to explore exercises, browse the library, open exercise and machine pages, add your own exercises.*

## Phase 16 — Body Picker + Muscle Lab spec [D]
**Goal:** Plan the port of the owner's 2D prototype. **DOCS ONLY. Read:** `BP`, `PROTO/muscle_lab_2d.html` (read selectively: `grep -n`, `sed -n`), `DS/detailed_muscles/html_unit_to_detailed.csv`.
**In scope:** how SVG region paths + unit ids are extracted from the prototype into `src/ui/body/figures/*.ts` (male/female x front/back); region -> detailed muscle map; hit-area rules for tiny muscles (44 px + zoom); props of `<BodyPicker>` (mode: `pick-one | pick-many | heat | recovery | marks`, `value`, `onChange`, `heat`, `view`, `sex`); labels/tooltips; the prototype's good ideas to keep (explorer + "muscles worked", search list, sheet panel) and what to drop (cyan palette, Google Fonts); update `BP`.
**Verify:** every figure unit id appears in the map; palette mapping to tokens listed.

## Phase 17 — Body Picker component [E]
**Depends:** 3, 16. **In scope:** extract SVG (MuscleMap MIT credit retained in `credits.json` later), `<BodyPicker>` with the modes above, front/back swipe, sex toggle, a11y (keyboard/ARIA labels), gold theming from tokens, `<MuscleChips>` text twin list; preview in `/dev/design-preview`.
**Version:** none. **Verify:** component tests (pick-one/pick-many/heat bands render classes, keyboard select, every region has a name), overflow audit on the preview at 320 px.

## Phase 18 — Muscle Lab page [E]
**Depends:** 11, 15, 17. **In scope:** `/body` (explorer: tap muscle or pick from list -> list order **Suggested for you / Built for you / More**, "Surprise me", filters: equipment, category, kind, difficulty, track, unilateral, beginner-friendly), `/muscle/<id>` slug; "muscles worked" mode (pick an exercise or machine, see primary/secondary on the body with emphasis bands); empty states.
**Version:** none. **Verify:** list-order tests with a fixture user (plan items appear in section 2), filter tests; STANDING GAP: touch feel on devices.
**Added scope (2026-11-18):** render the **why chips** (plain-sentence reasons) on suggested and built exercises (feature `why_chips`); **machine finder**: choose a muscle, see the best machines with photo (uses reach table; feature `machine_finder`).

## Phase 19 — Library: browse, search, filters [E]
**Depends:** 11. **In scope:** `/library` (exercises | machines tabs), search-as-you-type, category and sub-category chips, machine cards with thumbs, filters sheet, result counts, recent searches (local), slugged URLs with query params.
**Version:** none. **Verify:** URL <-> filter state tests, search UX tests with fixtures.
**Added scope (2026-11-18):** **equipment mode** switch (bodyweight / dumbbells / bands / home / gym presets from `equipment_presets.csv`, `EN` 22) filtering library, suggestions, day builder and swaps (feature `equipment_mode`).

## Phase 20 — Fuzzy search [E]
**Depends:** 11, 10. **In scope:** `src/dataset/fuzzy.ts` implementing `EN` 14 (no library); search box component with instant results, "did you mean", recent searches (device), setup chips ("reverse", "neutral", "rope"); used by library, routine builder picker, swap sheet, custom-exercise machine picker; creates `contract/fixtures/search_*.json`.
**Verify:** >= 20 fixture queries (typos, aliases, word order, "lat pulldown reverse grip"); < 50 ms on 700 docs in a test benchmark (state the standing gap: real phones).

## Phase 21 — Exercise page + machine page [E]
**Depends:** 17, 19. **Read:** `EP`. **In scope:** `/exercise/<slug>` (header, category/difficulty/pattern chips, mini body with primary/secondary emphasis, machine card with photo link, variations list where tapping selects the variation for logging, rep range, cues, cautions with "evidence mixed" label, substitutes, history/PR placeholder hooks, **YouTube button** = search URL for `<name> exercise form` opened in a new tab, override from custom/policy), `/machine/<slug>` (photo gallery from manifest, status badge, muscles, exercises on this machine).
**Version:** none. **Verify:** YouTube URL builder tests (encoding, overrides), photo URL resolution tests, a11y tests.
**Added scope (2026-11-18):** **form cue card** (3 cues + 1 common mistake, swipeable, shown before the first set of a new exercise, dismissible forever per exercise; feature `form_cues`).

## Phase 22 — Setup picker (exercise page + logger) [E]
**Depends:** 13, 21. **In scope:** `SetupPicker` (chips per axis, only options the exercise offers, compact, nothing bleeds); on exercise page, in routine items, in the set logger and in swap suggestions; remembers last setup per exercise; heatmap/recovery use the chosen setup; "separate PRs per grip" toggle in Settings; feature `setup_options`.
**Verify:** choosing underhand changes logged muscle weights; item stores `setup`; default when none chosen; overflow audit on 320 px.

## Phase 23 — Machine Lab map [E]
**Depends:** 16, 17, 10, 21. **In scope:** `/machines/:slug/lab` and a Machine Lab tab on the machine page: body figure heated by reach (gold ramp), companion filter chips (bench / attachment / position), list of exercises that reach a tapped muscle, machine `modes`, honest "not reachable with current data" state; `/machines` index sortable by reach (muscles reached); feature `machine_lab`; creates `contract/fixtures/reach_*.json`.
**Verify:** reach numbers equal compile-time table; filters change results; Cable Crossover + adjustable bench + rope test; text twin for accessibility.
**Added scope (2026-11-18):** machine finder entry from the machine list (shared with Phase 18).

## Phase 24 — Movement patterns data + geometry spec [D]
**Goal:** Freeze how a geometric movement map is drawn for each exercise. **DOCS + DATA CSVs ONLY. Read:** `EN` section 19, `docs/MOVEMENT_MAP.md`, `DS/DATASET_GUIDE.md`.
**In scope:** author `contract/dataset/movement_patterns.csv` (about 30 patterns, joint angles start/end, view, path hint, equipment glyph), `pattern_rules.csv` (keyword and category rules), generate `exercise_pattern_map.csv` for the 634 exercises (target >= 85% mapped; list the unmapped ones), `equipment_presets.csv` (bodyweight, dumbbells, bands, home, gym -> equipment categories); screen sketches (exercise page figure, machine page tab, creator preview, session mini-figure); wording ("typical movement", never a prescription); coach/physio review flag on every pattern. **STOP and tell the owner:** new files are in `contract/`, so the Admin zip needs a copy and `CHECKSUMS.txt` must be regenerated.
**Out:** renderer, UI code. **Verify:** CSV parse, every pattern has all 12 joints, mapped counts printed in `PHASE_STATUS.md`.

## Phase 25 — Movement Map renderer + screens [E]
**Depends:** 24, 17. **In scope:** `src/shared/movement.ts` (forward kinematics from joint angles with shared segment proportions, male/female variants, pose parameters from setups such as bench angle/width) and `src/ui/movement/MovementFigure.tsx` (SVG: faded start pose, solid end pose, capsule limbs, joint dots, arc arrows with angle text, resistance line and equipment glyph in gold on dark, muscle chips below, text twin for accessibility); shown on the exercise page, the machine page (movement tab), the custom-exercise creator (pick a pattern, figure updates) and as an optional mini figure in the session header; unmapped exercises show the plain muscle map with a quiet note; feature `movement_map`; creates `contract/fixtures/movement_*.json`.
**Verify:** kinematics tests against fixtures (0.5 px), pose changes with bench angle, 320 px overflow audit, no purple/colour guard hits. Standing gap: coach review of angles.

## Phase 26 — Favourites, hide, notes, easier/harder [E]
**Depends:** 21. **In scope:** favourite / "never show" / personal note per exercise (local), easier/harder buttons (family members by `difficulty`, same pattern/muscle), "my go-tos" list, repos + tests.
**Version:** none. **Verify:** easier/harder selection tests, hidden exercises excluded from search/suggest but readable in history.

## Phase 27 — Custom exercise creator [E]
**Depends:** 17, 26. **In scope:** `/library/new` and `/exercise/my-<slug>`: name, kind, machine (pick from the 55 or "none/other"), **tap primary/secondary muscles on the Body Picker with emphasis**, rep range, YouTube link (validated https), notes; edit/delete; merges into search, suggestions, heatmap; duplicate-name guard.
**Version:** none. **Verify:** validator tests (name, rep range, URL), merge-into-query tests, muscle-weight test for a custom exercise.

---
## MILESTONE 4 — Routines and sessions (28-42)
*Exit: build any routine (any days, any split), start any day or a free session in any order, skip with smart swaps, log sets with overload hints, see history and PRs.*

## Phase 28 — Routine and session UX spec [D]
**DOCS ONLY. Read:** `RB`, `FS`, `EN` 1, 8-10. **In scope:** screens and flows (setup -> days -> editor -> week view -> start), split-style definitions (PPL, upper/lower, full body, bro, custom) with day->muscle maps, flexible rules (weekdays optional, any day any date, rest-day suggestions), session card states, "later" shelf, skip sheet, finish rules, empty and error states, microcopy list; update `RB`, `FS`.
**Verify:** each flow has a screen list and the states for every control.

## Phase 29 — Schedule and rest-day spec [D]
**Goal:** Freeze scheduling UX before building. **DOCS ONLY. Read:** `EN` 16, `RB`, `docs/SCHEDULER.md`.
**In scope:** screens (schedule step in the builder; week/cycle view; missed-day sheet; rest-day hint card; settings page "Schedule"); wording; 8+ worked examples (weekdays, TTR cycle, every 2 days, floating with the recovery clock, A/B weeks, missed-day shift vs skip, deload); stop and tell the owner if any `contract/` change is needed.
**Verify:** each rule has a worked example.

## Phase 30 — Routine Builder I: setup [E]
**Depends:** 6, 27, 28. **In scope:** `/routines`, `/routine/new`: pick days per week (2-7) and optional weekdays, split style or custom, name; creates empty/auto-labelled days; `src/shared/routine.ts` (create/validate/clone) + tests.
**Version:** none. **Verify:** validation tests (days 2-7 or flexible, unique day ids), clone tests.

## Phase 31 — Routine Builder II: day editor, week view [E]
**Depends:** 30, 18. **In scope:** `/routine/<id>` week grid (rest days, suggested rest day if one muscle is overloaded by planned volume), `/routine/<id>/day/<dayId>` editor: name, target muscles via Body Picker, add/remove/reorder exercises (drag + up/down buttons), sets/rep range/rest/notes/superset group, suggestions panel per day; save, duplicate, rename, delete, set active; several routines.
**Version:** none. **Verify:** reorder/superset tests, planned-volume overload detector test.

## Phase 32 — Scheduler engine + UI [E]
**Depends:** 29, 31. **In scope:** `src/shared/schedule.ts` (`nextDayFor`, cycle/every_n/floating/ab_weeks, missed-day shift/skip, deload scaling); schedule step in the Routine Builder (weekday picker, cycle editor with T/A/M/R tiles, "every N days", "let recovery decide"); Home "Today" uses the schedule; "let recovery decide" and the rest-day hint card are built here as UI + engine hooks that take a `recoveryStates` input (empty until Phase 48/49 wire the real clock; Phase 49 connects them); feature `rest_suggestions` (default on, switch in Settings); any split style label allowed, any number of days; creates `contract/fixtures/schedule_*.json`; feature `rest_scheduler`.
**Verify:** all worked examples as tests; hints never block; hint hidden when recovery data is absent; floating mode falls back to maxPerWeek only until Phase 49.
**Added scope (2026-11-18):** **Today card** on Home: today's planned day (or best recovered day), est. time, exercise count and one big Start button (feature `today_card`).

## Phase 33 — Day builder [E]
**Depends:** 15, 31. **Read:** `EN` 10. **In scope:** `src/shared/dayBuilder.ts` (+ fixtures `daybuilder_*`), UI "Build this day for me": muscles or split label, time box 30/45/60/custom, track/level, avoid marks; slots warm-up / compound / isolation / finisher / cooldown; output is a normal editable Day; "shuffle one" per slot.
**Version:** none. **Verify:** time-box arithmetic tests, slot rules, no duplicate exercises, avoid marks respected.
**Added scope (2026-11-18):** **Workout in a pinch** (`EN` 21: 15/20/30/45/60 min + muscles or full body, respects equipment mode and marks; feature `quick_workout`) and **superset swipe** (swipe through suggested partners from the pairs data; feature `superset_swipe`).

## Phase 34 — Flexible session I [E]
**Depends:** 31. **Read:** `FS`. **In scope:** `/train` (today's suggested day, any other day, free session, repeat last), `/session/<id>`: all items as compact cards on one screen, tap any in any order, add on the fly (search/Body Picker), reorder, "do later" shelf, skip, finish anytime, resume after app kill; `src/shared/session.ts` state machine (any status transition allowed) + tests; items may be untouched at finish.
**Version:** none. **Verify:** state tests (no forced order, add/remove during session, finish with todo items), crash-resume test.

## Phase 35 — Skip and busy-machine swaps [E]
**Depends:** 15, 34. **Read:** `EN` 9. **In scope:** `src/shared/alternatives.ts` (+ fixtures `alternatives_*`), skip sheet (reasons: busy, pain, no time, too hard, other; pain asks which area), ranked alternatives (variation family -> same muscle/pattern -> substitution groups -> same muscle), one-tap swap that keeps sets already done on the original, "mark machine busy for this session" (local).
**Version:** none. **Verify:** reason-handling tests (busy drops same machine; pain applies avoid filter; too hard only easier), fixtures pass.

## Phase 36 — Overload, 1RM, PR engine (pure) [E]
**Depends:** 12. **Read:** `OL`. **In scope:** `src/shared/engine/{oneRm,pr,overload,plateau,sessionStats}.ts` + fixtures `overload_*` from the worked examples (>= 8, exact numbers); per-exercise rule (linear / double progression / off) + intensity; step from machine or user.
**Version:** none. **Verify:** all examples pass; property tests (never negative, capped jump, warm-ups ignored).

## Phase 37 — Three-metric PRs [E]
**Depends:** 36. **In scope:** `src/shared/pr.ts` per `EN` 17 (best weight, best reps, best volume, e1RM; optional per-setup PRs); PR toast in the logger and session summary; PR board page (`/progress/records`) with per-exercise cards; feature `pr_board`; creates `contract/fixtures/pr_*.json`.
**Verify:** independent-metric tests, ties, bodyweight, first-log rule.

## Phase 38 — Set logger UI [E]
**Depends:** 34, 36. **In scope:** inside a session card: set rows (weight, reps, optional RPE via Simple/Advanced), one-handed Steppers, auto-fill from last time, overload suggestion chip, warm-up/drop/superset tags (Advanced), rest timer (wake lock where available, vibrate on Android), autosave every set, cardio rows (time, distance, incline, calories), swipe to delete/duplicate set.
**Version:** none. **Verify:** logger reducer tests, timer tests with a fake clock; STANDING GAP: wake lock/vibration on devices.
**Added scope (2026-11-18):** **pocket tools** per `EN` 20: plate calculator sheet (editable bar and plate inventory), warm-up ramp button on heavy compounds (ramp sets tagged `warmup`, excluded from volume/PRs), smart rest timer, **big-number gym mode**, and **last-time inline** ("Last: 60 kg x 10, 10, 9" with a small up/hold arrow from the overload engine); features `plate_calculator`, `warmup_ramp`, `smart_rest_timer`, `big_number_mode`; fixtures `pocket_*`.

## Phase 39 — Session summary, history, PR board [E]
**Depends:** 38. **In scope:** finish flow -> summary (duration, volume, sets, PRs, muscles hit as a mini body), `/history` calendar + list (IST), session detail, "repeat this session", `/records` PR board per exercise.
**Version:** none. **Verify:** calendar grouping tests, repeat-session cloning, PR integration tests.
**Added scope (2026-11-18):** **PR celebration** (short gold burst showing new vs old record, respects reduced-motion) and a **PR wall** of all records (feature `pr_celebration`).

---
## Phase 40 — Copy for AI review [E]
**Depends:** 39. **In scope:** `src/shared/aiReview.ts` per `EN` section 18 (`aiReviewText` for a session, a date range and a single exercise); buttons: **Copy for AI review** on the session summary and on every history entry; a **range picker** (last 7 / 30 days, this month, custom) and an **exercise trend** button on the exercise page; preview sheet showing the exact text (editable before copying); include options (name off by default, body stats off, bodyweight off, notes on, RPE on), editable intro prompt, units; copy via the Clipboard API with a fallback "select all" text area; optional system share sheet; a short privacy note ("This text goes only where you paste it"); feature `ai_review_export` (a gym can lock it off).
**Out:** sending to any AI automatically, any API key, any server. **Verify:** fixtures `aireview_*` (session, range, exercise, trimming at 12,000 chars, missing values, units kg/lb, setups text, no personal data by default), property test: output never contains the name or body stats unless opted in; copy fallback path tested.

## Phase 41 — Plan envelope + encryption (pure) [E]
**Depends:** 32, 12. **In scope:** `src/shared/planShare/{envelope,crypto,secret}.ts` per `contract/plan-share.md` sections 2-3: build an envelope from a routine (strips ids, history and personal data; collects only referenced custom exercises), zod `PlanEnvelope`, secret generation (80-bit Crockford base32 with typo mapping), `id`/`key` derivation (WebCrypto SHA-256 + HKDF + AES-GCM), gzip via `CompressionStream` with raw fallback, import mapping (ids regenerated, slug collisions, unknown/hidden exercises flagged). Creates `contract/fixtures/planshare_*.json` (fixed secret + plaintext -> exact id, ciphertext decrypts, tampering fails, size cap).
**Out:** network, UI. **Verify:** round-trip, wrong secret fails, tampered tag fails, 64 KB cap, typo-mapped typed codes decrypt, no personal field ever present (property test).

## Phase 42 — Share and receive UI [E]
**Depends:** 41, 34. **In scope:** `src/data/relay/client.ts` (the four relay calls, relay URL from gym config when connected else `VITE_SHARE_RELAY_URL/ANON`, hidden feature when none); **Share plan** on the routine page (choose routine; default active; optional sender name + note): QR (qrcode-generator), link, typed code, 3-minute countdown, polling `share_status` every 3 s (max 60), Delivered / Expired / Cancel; **Receive**: `/share` route reading the link fragment (works from the browser link or the in-app scanner via jsqr camera scan, plus a typed-code field), claim, decrypt, preview screen with flags, "Add as new routine" (default) or "Add and make active"; all failure states in `docs/PLAN_SHARE.md`; feature `plan_share` (default on, gym can lock off); Settings -> Privacy explains what is shared.
**Verify:** tests against a mock relay (create, status, claim-once, expiry, cancel, rate-limited, relay missing -> feature hidden); second claim of the same code fails; no network call before the user taps Share/Receive; the secret never appears in any request (assert on the mock). Standing gap: live relay needs Admin Phases 11 + 15 deployed and the owner to set `VITE_SHARE_RELAY_*`.

## MILESTONE 5 — Heatmap, recovery, progress (43-57)
*Exit: see what you trained on the body over any period, know what's recovered, track progress with great graphs.*

## Phase 43 — Heat engine (pure) [E]
**Depends:** 12, 39. **Read:** `EN` 4, `HM`. **In scope:** `src/shared/heat/{rawHeat,reference,bands,compare,periods}.ts`; periods day/week/month/custom/all-time; compare mode; parent roll-up; creates `contract/fixtures/heatmap_*.json` (>= 8 worked examples).
**Version:** none. **Verify:** fixtures pass; custom range scaling, empty history, single set, variation shift, custom exercise.

## Phase 44 — Heatmap page [E]
**Depends:** 17, 43. **In scope:** `/heatmap`: period chips (Day/Week/Month/Custom/All) + date range sheet, front/back/sex, gold band legend, tap a muscle -> sheet with sets, exercises that hit it and "train this" shortcut, compare two periods (gold gain / steel loss), "neglected muscles" strip, text list twin.
**Version:** none. **Verify:** render tests for bands; period selection tests; overflow audit on the page.
**Added scope (2026-11-18):** **weak-spot finder** card (`EN` 23; "add to my routine" one-tap; feature `weak_spots`); fixtures `weakspots_*`.

## Phase 45 — Muscle badges: strength ladders + tiers data spec [D]
**Goal:** Freeze the bodyweight-relative badge system before any code. **DOCS + DATA CSVs ONLY. Read:** `EN` section 26, `docs/MUSCLE_BADGES.md`, `DS/DATASET_GUIDE.md`.
**In scope:** author `contract/dataset/strength_ladders.csv` (about 40 benchmark lifts: anchors for M/F, reference bodyweights, load mode, bodyweight fraction, muscle rank weights, source = published/derived/estimate), `ladder_rules.csv` and generated `strength_ladder_map.csv` (each of the 634 exercises -> ladder + factor, or none; print coverage and the unmapped list), `tier_fractions.csv`; badge/profile screen sketches; wording of the honest-limits note; list of assumptions for sport-scientist review. Re-check the published anchors against the primary paper (van den Hoek et al. 2024) if a network is available and record the result; otherwise log it as an open item. **STOP and tell the owner:** new files are in `contract/`; copy `contract/` into the Admin zip and regenerate `CHECKSUMS.txt`.
**Out:** engine and UI code. **Verify:** CSVs parse; every ladder has anchors and at least one muscle with rank >= 0.6; all 11 groups have at least 2 ranking ladders; counts in `PHASE_STATUS.md`.

## Phase 46 — Muscle strength engine (pure) [E]
**Depends:** 45, 12, 34. **In scope:** `src/shared/badges/{ladders,thresholds,tiers,experience}.ts` per `EN` 26: allometric `thresholdKg`, per-set benchmark e1RM (reps 1-12, warm-ups ignored, per-hand and bodyweight load modes, implausible-set guard), muscle tier + progress + peak, group tier, overall rank, experience meter, rust, `promotions[]`; unspecified-sex averaging with the Estimated flag; missing bodyweight -> returns `needsBodyweight`; creates `contract/fixtures/badges_*.json`.
**Verify:** all fixtures in `EN` 26.7; thresholds at 60/80/100 kg match the spec table; 365-day window; peak tier persistence; no randomness; benchmark speed (1,000 sessions) stated.

## Phase 47 — Muscle badges and profile screens [E]
**Depends:** 46, 17, 44. **In scope:** `/profile/muscles`: body figure coloured by tier (tier colour tokens), badge wall (shield crests with the tier name written), per-muscle sheet (current tier, progress bar to next tier with the kg needed at your bodyweight, best lift, peak tier, experience meter, rusty tag, "lifts that rank this muscle"), group list, overall rank card, strongest/weakest summary linked to the weak-spot finder, promotion celebration (reuses PR celebration, reduced-motion safe), first-run prompt for sex and bodyweight (never assumed; skip allowed = badges hidden), "Estimated" and honest-limits notes, Settings page; feature `muscle_badges`.
**Verify:** screens at 320 px with the overflow audit, text twin for the body figure, unranked/rusty/estimated states, no purple/violet/magenta/pink in tier colours (guard test).

## Phase 48 — Recovery clock + avoid marks (pure) [E]
**Depends:** 43. **Read:** `EN` 5-6. **In scope:** `src/shared/recovery.ts`, `src/shared/avoid.ts` (+ fixtures `recovery_*`), balance metrics (push/pull, upper/lower, front/back), neglected-muscle detection; repos for marks.
**Version:** none. **Verify:** fixtures pass; mark semantics tests (avoid excludes, sore demotes).

## Phase 49 — Recovery and marks UI [E]
**Depends:** 17, 48. **In scope:** Body Picker modes `recovery` and `marks`; `/body/recovery` (freshness per muscle, "ready today" list feeding "Suggested day"); `/body/marks` (tap areas: avoid / sore / clear); marks respected by Muscle Lab, day builder and swaps; balance card; **connects the real recovery states to the scheduler** (rest-day hint card and "let recovery decide" from Phase 32).
**Version:** none. **Verify:** state colour mapping tests; marks flow tests; scheduler hint appears when >= 60% of a day's target muscles are fatigued.

## Phase 50 — Chart kit spec [D]
**DOCS ONLY. Read:** `UI`, `DT`. **In scope:** `docs/design/CHART_KIT.md`: LineChart, AreaChart, BarChart, StackedBar, Ring, Sparkline, HeatGrid (consistency), StatTile (count-up), data shapes, nice-scale rules, IST dates, touch scrub tooltip + haptic tick, gold series ramp (no purple), empty/loading, reduced motion, text summary per chart, <= 400 points (downsample), where each chart is used.
**Verify:** every chart named in `docs/FEATURES.md` has a spec.

## Phase 51 — Chart kit I: line, area, bar, sparkline [E]
**Depends:** 3, 50. **In scope:** `src/ui/charts/*`, `src/shared/chartMath.ts` (`niceScale`, `downsample`) + tests, scrub via pointer events, preview section.
**Verify:** chartMath tests; render tests (role, text summary, no NaN for empty/1-point/flat).

## Phase 52 — Chart kit II: ring, heat grid, stat tile, stacked bar [E]
**Depends:** 51. **In scope:** `Ring`, `Gauge`, `HeatGrid`, `StatTile`, `StackedBar`; preview; fallbacks. **Verify:** zero/overflow value tests, no NaN.

## Phase 53 — Progress pages [E]
**Depends:** 39, 52. **In scope:** `/progress` hub, `/progress/exercise/<slug>` (weight, reps, e1RM over time, scrub), weekly volume bars, consistency HeatGrid, plateau hints; `src/shared/progressSeries.ts` + tests.
**Verify:** series tests with gaps, single session, large history (downsample).
**Added scope (2026-11-18):** **streaks and consistency ring** (`EN` 24; weekly target, grace week; feature `streaks`).

## Phase 54 — Body stats and goals [E]
**Depends:** 52. **In scope:** `/progress/body` (weight, body fat %, measurements, BMI, trend charts), `/goals` (weight/body-fat/lift/attendance/event, deadline, milestones, progress, achievement moment); math in `src/shared/goals.ts` + tests.
**Verify:** goal progress math tests.

## Phase 55 — Protein, water, device-only photos [E]
**Depends:** 52. **In scope:** `/intake` (protein target from weight x factor, quick-add +10/+25/+50 g, undo; water by glass/250 ml; rings; 7/30-day charts) via generic typed `intake` log; `/progress/photos` (IndexedDB only, side-by-side compare, UI warns they never leave the device and are not in server sync); features `intake`, `progress_photos`.
**Verify:** target maths, IST roll-over tests, photos never enter the outbox.

---
## Phase 56 — Barcode scanner + nutrition card [E]
**Depends:** 55. **In scope:** `/intake/scan`: camera scan (native `BarcodeDetector` when present, else the `barcode-detector` WASM ponyfill, lazy chunk) + manual barcode entry; formats EAN-13/8, UPC-A/E, Code-128; lookup against Open Food Facts (public API, no key) **only when the user taps Scan/Look up** (never in the background); result card with name, brand, serving, calories, protein, carbs, fat, sugar, salt per 100 g and per serving, with the "Data from Open Food Facts (ODbL)" credit; offline = clear message, no fake data; cache last 50 looked-up products on the device; camera permission handling (denied, unsupported, iOS standalone); feature `barcode_scan` (default on; **a gym can lock it off**).
**Out:** food log, photo recognition (the old VIT/AI idea is dropped), calorie goals, saved meals.
**Verify:** barcode parsing tests, manual-entry normalisation, lookup mocked (found, not found, offline, malformed JSON), cache eviction, CSP allows only `https://world.openfoodfacts.org` for this call, no request fires without a tap. Standing gap: real camera on real phones.

## Phase 57 — Scan result -> protein counter [E]
**Depends:** 56. **In scope:** one button on the nutrition card: "Add protein to today" (serving selector 0.5/1/2 or grams) writing a generic typed `intake` entry (protein only); undo; no other nutrient is stored; the card itself is never logged.
**Verify:** maths for per-100 g vs serving; entry is protein-only; undo; protein ring updates.

## MILESTONE 6 — Body Holo Lab and recaps (58-61)
*Exit: a 3D atlas showing what each muscle does in everyday life.*

## Phase 58 — Atlas content spec [D]
**DOCS ONLY. Read:** `HA`, `PROTO/holo_body_3d.html` (selectively), `DS/detailed_muscles/*`. **In scope:** content schema `atlas.json` `{ muscleId, name, group, inDailyLife[], whenWeak[], quickFacts[], seeAlso[] }`; muscle list = the meshes in the 3D model (list them) mapped to taxonomy ids; the 5 muscles that are FITTED approximations in the 3D model, not BodyParts3D data (lats, rectus abdominis, internal oblique, transversus abdominis, multifidus; the file lists them in `FITGRP`, their meshes are in `META2`), with the "approximate shape" label they carry; tone rules (plain English, educational, no medical claims, no exercises here by default); length limits; `youtube`-free; update `HA`.
**Verify:** every 3D mesh name and every taxonomy id has an owner row.

## Phase 59 — Atlas content authoring [E]
**Depends:** 58. **In scope:** write `src/atlas/atlas.json` for every muscle in scope (from standard anatomy knowledge; mark `reviewed: false`), validator script + tests (schema, length limits, no banned phrases like "cure", "treat", "diagnose").
**Verify:** validator passes; counts printed. STANDING GAP: owner/physio review of wording.

## Phase 60 — Atlas 3D page [E]
**Depends:** 5, 59. **In scope:** vendor `three@0.147.0` + `OrbitControls` (no CDN), the model asset from the prototype (about 3.5 MB file; measure the extracted asset) stored as a file (not base64 in JS), `/atlas` page lazy-loaded; gold-ified hologram shader per `DT`; tap/select muscle, list + search, front/back/side views, daily-life panel, WebGL fallback to the 2D figure, low-power mode (no auto-rotate, pixel ratio 1), reduced-motion respect, model cached on first open only (not at install), male only note, "approximate shape, not anatomical data" notice for the 5 fitted muscles (they ARE in the 3D model now), credits link.
**Version:** none. **Verify:** fallback logic tests, lazy-load test (not in the main chunk), bundle budget check; STANDING GAP: real-device 3D performance.

---
## Phase 61 — Recap cards: year-in-review, muscle of the week, routine image [E]
**Depends:** 60, 39. **In scope:** swipeable **year-in-review** (and any date range) cards from history (total sessions, sets, volume, heaviest lift, most-trained and least-trained muscle, longest streak, favourite exercise, biggest PR), **muscle of the week** (deterministic by ISO week from the atlas content, one daily-life fact), **routine as an image**: draws the routine to a 1080x1350 canvas (gold on dark, day lists, no photos or personal data), saved/shared via the share sheet or download, generated on the phone only; features `year_review`, `muscle_of_week`, `routine_image`.
**Verify:** card maths tests on fixtures, week-seed determinism test, image is generated with no network, canvas output size and text-overflow tests (long names wrap, nothing bleeds).

## MILESTONE 7 — Settings, About, Credits (62-64)
## Phase 62 — Settings I: groups and sub-pages [E]
**Depends:** 4. **Read:** `SM`. **In scope:** `/settings` = a list of groups only; sub-pages: Account, Training (units, rest timer, overload mode default, intensity), Workout flow (flexible options, suggestions on/off, warm-up suggestions), Body and goals, Appearance (theme, motion, haptics, density), Simple/Advanced; each row shows "Set by your gym" when locked (policy hook, inert until Phase 66); prefs repo + `usePref`.
**Verify:** every sub-page registered; pref persistence tests; overflow audit.

## Phase 63 — Settings II: data, privacy, About, Credits [E]
**Depends:** 62. **In scope:** sub-pages Data and backup (export/import file, wipe with confirm), Privacy (what is stored, photos stay on device), Reminders (local workout reminders), Gym connection (shows Standalone + disabled "Add a gym" until Phase 66), **About** and **Credits** pages driven by `src/content/about.json` and `credits.json` (owner fills later; **pre-filled required licences**: BodyParts3D CC BY 4.0, human-atlas MIT, MuscleMap MIT, three.js MIT, hologram shader idea MIT, Phosphor MIT, fonts) with a visible "owner to fill" placeholder state that never looks broken.
**Verify:** content schema tests; credits cannot render empty; licence list matches `reference/prototypes` headers.

## Phase 64 — GATE: standalone release 0.1.0 [G]
**In scope:** run checks once; **overflow audit** (Playwright from the sandbox's pre-installed copy) over all registered routes at 320/360/390/414/430 px; bundle/first-load budget report (`UI`); offline scenario test (log a session offline, reload, history intact); write `docs/OWNER_CHECKLIST_0.1.0.md` (install gate iOS/Android, offline workout, tap-a-muscle, routine builder with 3/5/6 days, skip with swap, heatmap, atlas on a mid-range phone, photos, backup/restore, settings sub-pages); bump 0.1.0; changed-files zip.
**Version:** 0.1.0. **Verify:** audit output + budgets pasted into `PHASE_STATUS.md`; checklist exists.

---
## MILESTONE 8 — Connect to a gym (65-70)
*Needs the Admin zip's Phases 9-18 built and deployed by the owner. Everything here is additive: standalone keeps working with no gym.*

## Phase 65 — Connection UX + policy consumption spec [D]
**DOCS ONLY. Read:** `CT/gym-config.md`, `CT/policy.md`, `CT/connected-api.md`, `GC`. **In scope:** screens (add gym by QR/paste/link, confirm host, login, first-run "upload my history?", disconnect), error words, offline behaviour, what each feature does when locked, merging gym programs as a routine source, how library overrides apply, upload-history rules; update `GC`.
**Verify:** every `CT/policy.md` field has a UI effect listed.

## Phase 66 — Policy engine + gym config [E]
**Depends:** 65. **In scope:** `src/shared/policy.ts` (zod schema, `resolveFeature`, `applyLibraryOverrides`) + `src/shared/gymConfig.ts` (`SFCFG1` parse/validate, host allow-list) + fixtures `policy_*`, `gymconfig_*` (same names the Admin zip will use); wire into `useFeature`, search, suggestions, machine badges; "Add a gym" flow up to the confirm screen (no network yet); QR scan reuses `jsqr`.
**Verify:** fixtures pass (locks, defaults, hidden slugs, youtube overrides, maintenance); bad configs rejected.

## Phase 67 — Gym link: clients, login, sync [E]
**Depends:** 6, 66, Admin 9-18 deployed. **In scope:** `src/data/gym/*` (lazy `@supabase/supabase-js`, client per shard, session persistence, `lookup-login`, `change-password` forced flow, offline session restore), sync engine (outbox push idempotent by `client_id`, delta pull, per `docs/SYNC_SPEC.md`), sync chip, Pending screen.
**Verify:** engine tests with a fake remote (offline queue, replay idempotent, backoff); STANDING GAP: real login/sync against the owner's Supabase.

## Phase 68 — Gym data: membership, QR, attendance, inbox, requests [E]
**Depends:** 67. **In scope:** `/gym` area (features `membership`, `attendance_qr`, `inbox`, `requests`): membership card + days left, offline member QR (`SF1:<code>:<crc>`), attendance calendar/streak, announcements + inbox, requests (freeze, locker, complaint, equipment, forgot password).
**Verify:** days-left/expiry tests, QR encode/crc tests, request state tests.

## Phase 69 — Gym programs, overrides, proposals, history upload [E]
**Depends:** 67. **In scope:** gym programs appear as a routine source (follow / copy to mine / ignore), library overrides applied live, machine status badges, "propose to gym" on a custom exercise, one-time upload of standalone history (resumable, idempotent).
**Verify:** merge tests (gym program -> routine), upload resume test.

## Phase 70 — GATE: connected release 0.2.0 [G]
**In scope:** checks once; overflow audit again; write `docs/OWNER_CHECKLIST_0.2.0.md` (connect by QR, forced password change, offline then sync, locked feature shows "Set by your gym", hide an exercise from admin and see it vanish, disconnect returns standalone with data kept); bump 0.2.0.
**Version:** 0.2.0. **Verify:** checklist exists; standing gaps listed.

---
## MILESTONE 9 — Release and fixes (71-72)
## Phase 71 — GATE: 1.0.0 [G]
**Depends:** owner returns the filled checklists. **In scope:** close "must" issues, docs sweep, Vercel-switch re-verified, `contract/CHECKSUMS.txt` compared with the Admin zip's, bump 1.0.0. **Version:** 1.0.0.

## Phase 72 — Fix pack (reserved, repeatable) [E]
One session of fixes from the owner's device reports (no keys/passwords). Only listed fixes; one patch bump; log in `PHASE_STATUS.md`. Further packs 52-b, 52-c.

---
## MILESTONE 10 — Never lose a workout: restore, chunk backup, free accounts (73-81)
> **Plan first:** `docs/RECOVERY_PLAN.md` (decisions, binding safety rules, every edge case in order, owner questions). The server side is built in the Admin zip, Phases 49-55; the order of work across both zips is the table in section 15 of that file. **Only Phase 73 needs no contract change.** `contract/` 1.1.0 comes from Admin Phase 49 and must be copied into this zip (Phase 74) before Phase 75. All of it is unproven until it runs on a real Supabase (the same gap as Phases 67-69: advise the owner to run `docs/OWNER_CHECKLIST_0.2.0.md` first).

## Phase 73 — Restore safety net (Tier 0) [E]
**Depends:** 6, 67, 71. **Read:** `docs/RECOVERY_PLAN.md` sections 4.5, 6. **In scope:** pure `src/shared/emptyCheck.ts` (local empty, rows below the shrink threshold of base, owner mismatch -> `ok | restore_offer | block_push | different_owner`); an owner stamp (member id or free id) in `meta`; reset of the pull cursors when local rows are empty; a Restore screen for a connected member that refills from the EXISTING delta pull (no new tables, no contract change); `scripts/measure-chunks.mjs` reporting raw vs gzip vs compact-packed size of `exportAll` on the seeded 1,000-session fixture (replaces the guesses in `RECOVERY_PLAN.md` 4.6; write the numbers into that file and `PHASE_STATUS.md`).
**Verify:** fixtures `restore_*` (empty phone + server data; rows gone but cursor kept; shrunk by more than the threshold; different member; merge-not-overwrite); measurement printed. STANDING GAP: real Supabase, real wipe.

## Phase 74 — Receive contract 1.1.0 + recovery UX spec [D]
**Depends:** Admin 49 done and its `contract/` copied into this zip. **In scope (docs only):** verify `contract/CHECKSUMS.txt` against the Admin zip; extend `docs/SYNC_SPEC.md` (chunks, manifest, triggers, three-way diff, modes) and `docs/GYM_CONNECTION.md` (new screens: Back up my data, consent, show-once password, Already have an account, Restore progress, Forgot password, Switch to free backup; every string with a `t()` key name; error table for the new `SFE7xx` codes); `API_CONTRACTS.md` extended first; register the new feature keys the contract added. **Verify:** none (docs phase); a list of screens and strings the later phases must match.

## Phase 75 — Chunk engine (pure) [E]
**Depends:** 74. **Read:** contract `engines.md` chunk section + `fixtures/chunks_*`. **In scope:** `src/shared/chunks.ts` (chunk keys by IST month, grouping, compact encoding, gzip with raw fallback, `sha256`, schema check and migrate, merge by `client_id` with the final-state rule, `planSync(local, base, server)` returning push / pull / merge / restore / block per chunk, rules S1-S7); `src/data/local` helpers to build and apply a chunk in one transaction. No network.
**Verify:** the contract fixtures pass; matrix cases (every row of the diff table); never-push-empty; tombstones; tie on `updated_at`; newer schema refused; HTML or truncated gzip rejected; 1,000-session speed test.

## Phase 76 — Backup runtime [E]
> **Phase 76 DONE (2026-11-21).** 76-b2 finished it (resumable restore, chip, Data status line, boot wiring). Earlier note: **SPLIT 76-a / 76-b1 / 76-b2 (2026-11-21, owner request).** 76-b1 DONE (real adapter, trigger scheduler, repo change listener). 76-a DONE: pure planner, `BackupRemote` interface, meta helpers, push executor + fault tests (see `PHASE_STATUS.md` Log "Phase 76 PARTIAL"). 76-b TODO: real adapter, trigger wiring, resumable restore, chip + Settings line, remaining tests. Still ONE phase number (76); do not start 77.
**Depends:** 75, Admin 50 (SQL applied) for the real remote. **In scope:** dirty flags in `meta`; trigger on session finished/edited/deleted (10-30 s delay) and on `small` edits; check on open, foreground, `online`, after a row sync; a daily full check; executor (chunk first, manifest last, compare-and-swap, keep 2 revisions, ambiguous-failure re-read); retry/back-off reuse; a RESUMABLE restore that blocks pushes until done; sync chip states; Settings -> Data "Last backed up" (amber past about 7 days online); remote adapter added under `src/data/gym/` only.
**Verify:** engine tests with a fake remote and fault injection (drop, timeout-after-save, duplicate response, 200 with HTML, 401 midway, kill and resume during restore, two devices). STANDING GAP: real network, real Storage.

## Phase 77 — New-device auto restore (gym member) [E]
**Depends:** 73, 76. **In scope:** after sign-in and the forced password change, local empty + a manifest -> automatic restore with progress "n of m" (newest month first), then the delta pull; owner stamp mismatch -> export-or-fresh choice; merge-not-overwrite when local has data; expired/frozen policy [A-R4]; closed or moved shard message; Wi-Fi line above 500 rows; install-gate line "your data returns after you sign in"; "update the app" for a newer schema.
**Verify:** flow tests on a fake remote (all edge cases of `RECOVERY_PLAN.md` section 6); STANDING GAP: real new phone, iOS Safari.

## Phase 78 — Free account + backup [E]
**Depends:** 76, Admin 51 deployed for the real call. **In scope:** modes (`standalone`, `free_backup`, `connected`) stored locally; generate `free_id`, username, 16-character password on the phone; consent screen; show-once password with copy / share / save-as-image and the "I saved it" tick; sign-in on reinstall ("Already have an account?"); `free-signup` client; backup to the free shard through the Phase 76 runtime; "Delete my backup"; signups-closed and quota messages; nothing is sent before the opt-in (standalone stays complete).
**Verify:** state and flow tests (collision regenerates, signup closed, reinstall sign-in, delete); STANDING GAP: real free shard.

## Phase 79 — Recovery questions + forgot password (member side) [E]
**Depends:** 78, Admin 52. **In scope:** required recovery-questions step at opt-in (short fixed list, no government ids or phone numbers); Forgot password screen (free id or username + answers) -> ticket code and status; on a still-signed-in device, the "A reset was requested, cancel?" prompt during cooling-off; redeem screen that generates the new password on the phone and shows it once; stale or used ticket messages; linked-to-gym accounts told to see the desk.
**Verify:** state tests (one open ticket, expiry, cancel, single-use redeem, attempt-limit message); STANDING GAP: real functions.

## Phase 80 — Free to gym transition [E]
**Depends:** 77, 78. **In scope:** the ordered switch (connect, sign in, password change, first manifest write, then `mode = connected`; any failure leaves the old mode); Phase 69 history prompt reused with the plain "not uploaded = not restorable from the gym" line; delete the free account after the first successful gym backup; "Is this your data?" on a shared phone; leaving a gym offers "Switch to free backup" with fresh consent; identity shown as the member code with the old free id kept in Settings; restore-from-free-first on a new phone that has both.
**Verify:** transition tests on a fake remote (failure at each step, two copies, shared phone, phone dies mid-transition); STANDING GAP: real gym + real free shard.

## Phase 81 — GATE: recovery release 1.1.0 [G]
**Depends:** 73-80, Admin 55. **In scope:** checks once; overflow audit of the new routes; guard test; compare `contract/CHECKSUMS.txt` with the Admin zip; write `docs/OWNER_CHECKLIST_1.1.0.md` (wipe a phone and restore; finish a session offline then sync; kill the app mid-restore; free signup; reinstall and sign in; forgot password with admin approval; free to gym; two phones); bump 1.1.0. **Version:** 1.1.0. **Verify:** checklist exists; standing gaps listed honestly.

---
## MILESTONE 11 — Native feel and a calmer UI (82-88)
**Full plan, design spec, onboarding flow and every decision: `docs/UX_REDESIGN_PLAN.md` (identical copy in the Admin zip, whose Phases 56-59 are the admin side). Read it before any of these phases.** Docs only so far, nothing started (2026-11-22).
**Versions:** 1.2.0 at Phase 88. **Cross-zip:** none of 82-88 needs the Admin zip; `contract/` stays untouched unless Phase 85 proves the gym must see height or date of birth (then stop and say so).

## Phase 82 — Safe first pack [E]
**Goal:** pinch-zoom off, Share visible for everyone, body figure follows the profile. **Depends:** 81. **In scope:** viewport `maximum-scale=1, user-scalable=no`; `touch-action: pan-x pan-y` and `overscroll-behavior: none` on html/body; iOS `gesturestart` block; inputs 16px+; `relayConfig()` falls back to the free-backup core functions URL and anon key; visible Share on routine cards and routine page, Receive/Scan on Train and Today; `useFigureSex()` hook used by Heatmap, Marks, Recovery, Muscle lab and every BodyPicker; the in-page Male/Female control becomes a "Switch figure" link. **Out of scope:** new relay, Edge Function or SQL changes. **Key files:** `index.html`, `src/ui/styles/base.css`, `src/main.tsx`, `src/data/relay/client.ts`, `src/pages/routines/*`, `src/pages/heatmap/HeatmapPage.tsx`, `src/pages/body/MarksPage.tsx`, `src/ui/body/BodyPicker.tsx`. **Version:** none. **Verify:** hook and fallback tests; viewport guard test; STANDING GAP: two real phones for share (the `share_*` functions were never called), iPhone for zoom.

## Phase 83 — Button and control kit [E]
**Depends:** 82. **In scope:** `docs/UX_REDESIGN_PLAN.md` section 2: four button kinds, one card style, `Row`/`RowGroup`/`ChoiceRow`/`Switch`/`NumberRow`, and the shared `Collapsible` section (aria-expanded, remembered per page, Collapse all link); remove the visible ghost style and convert its 67 call sites and the plain-link rows; guard test. **Out of scope:** screen layouts (86-87). **Verify:** component tests, guard test that no naked-text button remains.

## Phase 84 — Calendar picker [E]
**Depends:** 83. **In scope:** shared picker (section 2), pure helpers in `src/shared/`, replace the 6 native date inputs (AI review range, schedule edit, recap, heatmap) and the birth-year text; guard test against `type="date"`. **Verify:** unit tests (month lengths, leap years, min/max, Mon-first grid); one 360 px check.

## Phase 85 — Onboarding [E]
**Depends:** 83, 84. **In scope:** section 3: `/welcome` flow (name, date of birth, sex + figure preview, height, weight, units, level, backup choice with the plain risk text, optional gym QR), skippable steps, resumable, runs once, re-runnable from Settings; new profile fields saved locally and in backup/restore. **Out of scope:** changing `contract/` (stop and say so if needed). **Verify:** state tests for each step, skip, resume, gym-member shortcuts, backup round-trip of the new fields; STANDING GAP: real free signup on a phone.

## Phase 86 — Declutter I: Today, Train, Routines, Routine week and day, Quick workout, Session, Session summary, History [E]
**Depends:** 83. **In scope:** section 2 screen targets; `Collapsible` sections for everything below the first block (live workout: current exercise and set logger stay open, notes/history/setup closed); before/after screenshots at 390x844 in `review/ux/`. **Verify:** screenshots, overflow audit at 360 px.

## Phase 87 — Declutter II: Library, Exercise page, Machine pages, Muscle page, Me, Settings, Body, Heatmap, Progress, Records, Goals, Gym, Backup and every remaining long page [E]
**Depends:** 83, 86. **In scope:** `Collapsible` sections on the Exercise page and Machine pages (index, page, Lab) first, then every page that scrolls past one screen; guard test: no page renders more than 3 always-open top-level sections; fewer settings pages, dropdown rows for 4+ options, one primary action per screen; before/after screenshots. **Verify:** same as 86.

## Phase 88 — GATE: release 1.2.0 [G]
**Depends:** 82-87. **In scope:** overflow audit, a11y labels, guard tests (viewport lock, no native date, no ghost, figure from profile, collapsible sections), write `docs/OWNER_CHECKLIST_1.2.0.md`, bump 1.2.0. **Version:** 1.2.0.

## Phase 89 — Android install button and About page [E]
**Depends:** 88. **In scope:** the install screen shows one primary "Install app" button for every Android state (direct browser install dialog when the browser offered it; otherwise a toast that names the menu steps); About page restructured: app name and release, "Made by" with the maker's name in bold and email link, the story, links; `author` added to `about.json` schema (optional). **Out:** iOS flow, new install states, contract/, any other page. **Verify:** typecheck once; `tests/pages/about89.test.ts`, `tests/pages/settings63.test.ts`.

---
## LATER (flag exists, nothing built)
Classes/PT booking, store, leaderboards, food log + calories, Kannada/Hindi, extra muscle detail (neck split, serratus on the map), exercise video hosting, share cards, wearables. **Parked:** native wrapper (Capacitor + SQLite) for Android and iOS, see `docs/RECOVERY_PLAN.md` section 12.
