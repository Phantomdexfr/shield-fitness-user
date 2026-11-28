# PROJECT_STRUCTURE — User app (planned layout; phases create it)

```
shield-fitness-user/
  CLAUDE_MUST_READ.md  PHASES.md  PHASE_STATUS.md  MASTERPLAN.md  API_CONTRACTS.md
  PROJECT_STRUCTURE.md  DEPENDENCY_VERSIONS.md  GITHUB_UPDATE_PUSH.md  README.md
  contract/                 IDENTICAL in the Admin zip. Never edit here (see contract/CONTRACT.md)
    dataset/                source CSVs (634 exercises, 55 machines, 34 muscles, maps)
  docs/                     feature + design + reference docs
  reference/prototypes/     the two owner prototypes (never shipped)
  public/
    machines/               128 WebP machine photos (static, in the repo)
    atlas/                  binary 3D model + atlas assets (Phase 60)
    icons/  manifest assets
  scripts/
    compile-dataset.mjs     contract/dataset -> src/dataset/generated: exercises, setup_options, search.index, machine_reach (Phases 9, 10)
    overflow-audit.mjs      uses the sandbox Playwright, not a dependency (Phase 64)
  src/
    pages/                  one folder per route (slug routes)
    ui/                     primitives, body picker, charts, install gate screens
    shared/                 PURE domain: weights (+setup), suggest, alternatives, daybuilder, schedule, planShare (envelope/crypto/secret), overload, pr, heat, recovery, reach, policy resolve
    dataset/                runtime loader, fuzzy search (fuzzy.ts), repos (+ generated chunks)
    data/local/             IndexedDB (idb), repos, outbox, backup
    data/relay/             plan-share relay client (4 calls; relay URL from gym config or VITE_SHARE_RELAY_*) (Phase 42)
    data/gym/               ONLY place importing @supabase/supabase-js; lazy chunk (Phase 66-69)
    pwa/                    service worker (injectManifest), installGate, update flow
    i18n/                   strings
    routes.ts               route registry
  tests/                    Vitest; fixtures come from contract/fixtures
  index.html  vite.config.ts  tailwind.config.ts  tsconfig.json  vercel.json  404.html fallback
```

## Files that exist now (Phase 1)
- `package.json`, `package-lock.json`, `.npmrc` (save-exact, legacy-peer-deps): pinned toolchain and scripts `dev build typecheck test`
- `vite.config.ts` (Preact preset, `VITE_BASE`), `vitest.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`: configs
- `index.html`, `src/main.tsx`, `src/vite-env.d.ts`: placeholder page (replaced in Phase 4)
- `scripts/postbuild.mjs`: copies `dist/index.html` to `dist/404.html` (optional dist dir arg)
- `tests/smoke.test.ts`: postbuild test
- `.github/workflows/deploy.yml`: Pages deploy on tag `v*` or manual
- `vercel.json`: Vercel config (build, rewrites, headers, git deploys off)

## Added in Phase 2
- `src/ui/styles/tokens.css`: all design tokens as CSS variables (the only file allowed colour literals)
- `src/ui/styles/fonts.css`: `@font-face` for Inter Variable and Barlow Condensed (self-hosted, latin)
- `src/ui/styles/base.css`: reset, safe-area vars, focus ring, `overflow-x: clip`, reduced-motion
- `src/ui/styles/index.css`: imports the three above + `@tailwind utilities` (imported by `src/main.tsx`)
- `src/ui/fonts/*.woff2` + `LICENSE-*-OFL.txt`: vendored latin font files
- `tests/guard/rules.ts`: pure guard rules; `tests/guard.test.ts`: scans `src/`, `index.html`, `tailwind.config.js` + bad/good fixtures

## Added in Phase 3
- `src/ui/components/`: `Icon`, `Pressable` (base for all tappables), `Button` (+ `IconButton`), `Card`, `Chip` (+ `Badge`), `Choice` (`Segmented`, `Tabs`), `Form` (`Field`, `Input`, `Select`, `Toggle`, `Stepper`), `Overlay` (`Sheet`, `Dialog`), `Toast` (store + `ToastHost`), `Feedback` (`Skeleton`, `SkeletonText`, `EmptyState`, `ProgressRing`, `ProgressBar`), `Avatar`, `PhotoFrame`, `SubPageHeader`, `motion.ts`, `haptics.ts`, `labels.ts`, `util.ts`, `index.ts` (barrel)
- `src/ui/styles/components.css`: styles for the above (tokens only)
- `src/ui/icons/generated.ts`: GENERATED inlined Phosphor icons; `scripts/build-icons.mjs` regenerates it
- `tests/ui/primitives.test.tsx`: happy-dom smoke tests

## Added in Phase 4
- `src/app/routes.ts`: route registry `{id, path, feature, component, tab, devOnly}` + `TABS` + `activeRoutes(isDev)`
- `src/app/flags.ts`: reads `contract/features.catalogue.json`; `resolveFeature`, `useFeature(key|null)`, `setPolicyResolver` (Phase 66 hook point)
- `src/app/Shell.tsx`: wouter `Router` with base path, page host + transition, bottom tab bar, `ToastHost`; `normaliseBase`
- `src/app/lazyPage.tsx`: dynamic-import page wrapper (dev preview)
- `src/pages/Placeholder.tsx`, `NotFound.tsx`, `dev/DesignPreview.tsx` (dev builds only)
- `src/i18n/en.ts`, `src/i18n/index.ts`: strings and `t(key)`
- `src/ui/styles/shell.css`: shell, tab bar, page transition (imported by `index.css`)
- `tests/app/routes.test.ts`, `tests/app/flags.test.ts`
- `src/main.tsx` now renders `<Shell/>`; `scripts/build-icons.mjs` has 4 more icons (house, person-simple, books, user-circle)
- Note: the planned layout above says `src/routes.ts`; the registry actually lives at `src/app/routes.ts`.

## Added in Phase 5
- `src/pwa/installGate.ts`: pure `detectInstallState(env)` (states: installed, android-promptable, android-other, ios-safari, ios-other, in-app-browser, desktop, unsupported)
- `src/pwa/prompt.ts`: captures `beforeinstallprompt`, `promptInstall()`, `readInstallEnv()` (the only DOM reads)
- `src/pwa/InstallGate.tsx`: the one screen shown until installed (steps per state, copy-link, offline QR)
- `src/pwa/update.ts`: Workbox registration (production only), waiting-worker store, `version.json` check; `src/pwa/UpdateToast.tsx`: "Reload" toast (mounted in the shell)
- `src/sw.ts`: service worker (precache, navigation fallback to `index.html`, cache-on-demand for `machines/` and `atlas/`, SKIP_WAITING message)
- `src/ui/styles/pwa.css`: gate and update toast styles
- `public/icons/`: PLACEHOLDER icons (192, 512, 512 maskable, apple-touch 180), a gold "S" ring; owner replaces with the real logo
- `vite.config.ts`: now has `vite-plugin-pwa` (injectManifest), the manifest, a `version.json` emitter and `__APP_BUILD__`
- `tests/pwa/installGate.test.ts`, `tests/pwa/bypass.test.ts` (skipped until `dist/` exists)
- `src/data/local/types.ts`: store names, row/outbox/backup types, `NEVER_SYNCED`
- `src/data/local/db.ts`: idb open + versioned migrations (v1), shared `getDb()`
- `src/data/local/repos.ts`: `createRepo` (list/get/put/remove, soft delete) + one repo per store, injectable clock
- `src/data/local/outbox.ts`: connected-only queue, enqueue in the same transaction, back-off helpers
- `src/data/local/backup.ts`: `exportAll` / `importAll` (merge by client_id, validated)
- `src/data/local/storage.ts`: `requestPersist()`, `getQuota()`
- `src/data/local/index.ts`: barrel
- `tests/data/localStore.test.ts`: fake-indexeddb tests
- `scripts/compile-dataset.mjs`: Phase 9 dataset compiler (`npm run dataset`, papaparse); `compile()` is pure, `writeGenerated()` replaces the output folder
- `src/dataset/generated/*.json`: COMMITTED compiler output (hash-named, see `docs/DATASET_RUNTIME.md`); never edit by hand, re-run `npm run dataset`
- `tests/dataset/compile.test.ts`: compiler tests on in-test fixture CSVs (Phases 9, 10)
- `src/dataset/loader.ts`: Phase 11 lazy, cached dataset loader (injectable source; manifest, files, detail chunks, `imageUrls`)
- `src/dataset/search.ts`: Phase 11 pure search (normalise, vocabulary index, prefix + typo match, ranking, filters)
- `src/dataset/query.ts`: Phase 11 `getExercise`, `search`, `byMuscle`, `byMachine`, `variationsOf`, `musclesOf`, `getMachine`, `imageUrls`; merges custom exercises passed in
- `src/data/repos/exercises.ts`: Phase 11 `exercisesRepo`, the only entry UI uses for exercises (adds the user's custom exercises)
- `tests/dataset/runtime.test.ts`: Phase 11 tests (fixture dataset, fake-indexeddb, one real-data smoke check)
- `src/shared/slug.ts`: Phase 12 `slugify`, `isSlug`, `customSlug` (`my-<kebab>`, collision-safe)
- `src/shared/units.ts`: Phase 12 `roundKg`, `kgToLb`, `lbToKg`, `formatPaise`
- `src/shared/dates.ts`: Phase 12 IST day keys, day/week starts, `addDays`, `formatIst`, `parseIso` (time is always a parameter)
- `src/shared/validators.ts`: Phase 12 input validators returning a value or an error code
- `src/shared/muscles.ts`: Phase 12 taxonomy helpers (`buildTaxonomy`, `rollUpMax`)
- `src/shared/weights.ts`: Phase 12 `muscleWeight`, `fallbackRows`, `applyVariation`, `exerciseWeights` (engines.md 2-3), Phase 13 `applySetup` (13b)
- `src/shared/suggest/{jitter,score,rank,list,index}.ts`: Phase 15 suggestion engine (seeded jitter, `scoreExercise`, ranking + reason codes, tap-a-muscle list)
- `contract/fixtures/suggest_{score,list,jitter,reasons}.json`: Phase 15 fixtures (copy to the Admin zip)
- `tests/shared/suggest.test.ts`: Phase 15 tests (fixtures, property tests, reasons)
- `src/shared/setup.ts`: Phase 13 `Setup` type + zod `SetupSchema`, `parseSetup`
- `contract/fixtures/setup_examples.json`, `setup_stacking.json`, `setup_variation_wins.json`: Phase 13 worked examples for `applySetup` (copy to the Admin zip)
- `tests/shared/setup.test.ts`: Phase 13 tests (fixtures, stack/cap/absent, variation wins, schema, fixtures-not-stale check)
- `tests/shared/basics.test.ts`, `tests/shared/weights.test.ts`: Phase 12 tests
- `review/untagged_variations.csv`: Phase 10 owner report (grip/handle-word rows with no tag, rows tagged by `ambiguous` rules, out-of-vocabulary grips/straps); GENERATED by `npm run dataset`, not read by the app
- `docs/DATASET_RUNTIME.md`: frozen spec of the compiled dataset files, chunking, precache, search data, budgets (Phase 7)
- `src/main.tsx`: gate first, then the shell is imported only when installed

## Added in Phase 8 (data and docs only; all under `contract/`, identical in the Admin zip)
- `contract/dataset/setup_rules.csv`: keyword -> setup axis/value rules for tagging variation rows
- `contract/dataset/setup_muscle_shift.csv`: setup -> muscle more/less, by exercise pattern (physio review flagged)
- `contract/dataset/machine_companions.csv`: benches, attachments and modes per machine
- `contract/dataset/search_aliases.csv`: search aliases and abbreviations
- `contract/dataset/REACH_GAPS.md`: machine reach gaps and suggested exercises (not added)
- `contract/dataset/DATASET_GUIDE.md`, `contract/CONTRACT.md`, `contract/CHECKSUMS.txt`: extended / regenerated

## Added in Phase 24 (data and docs only; all under `contract/`, identical in the Admin zip once copied)
- `contract/dataset/movement_patterns.csv`: 54 movement patterns, 12 joints start/end, view, anchor, path hint, glyph, text twin (coach/physio review flagged)
- `contract/dataset/pattern_rules.csv`: name keyword rules and modifier rules that produced the map (first match wins)
- `contract/dataset/exercise_pattern_map.csv`: exercise slug -> pattern + params (540 of 634 mapped)
- `contract/dataset/equipment_presets.csv`: equipment presets -> machine names (same table as `src/shared/equipment.ts`)
- `contract/dataset/MOVEMENT_PATTERN_NOTES.md`: formats, joint conventions, params, coverage, unmapped list
- `contract/dataset/DATASET_GUIDE.md`, `contract/engines.md` (one line in section 19), `contract/CONTRACT.md`, `contract/CHECKSUMS.txt`: extended / regenerated
- `docs/atlas/{atlas_units,atlas_mesh_map,atlas_taxonomy_map}.csv`: the 39 atlas units, every 3D mesh key -> unit, every taxonomy id -> units; read by Phase 59 (Phase 58)
- `docs/HOLO_ATLAS.md` (extended): frozen `atlas.json` schema, limits, tone rules, 2D coverage (Phase 58)
- `docs/RECOVERY_PLAN.md`: PLAN (identical in the Admin zip) for restore, chunk backup, free accounts, forgot password, free-to-gym transition; edge cases in order, owner questions, phase map (planning chat 2026-11-21; Milestone 10, Phases 73-81)
- `src/atlas/atlas.json`: the 39 atlas texts (daily life, when weak, quick facts, see also), all `reviewed: false`; read by the Phase 60 page (Phase 59)
- `scripts/validate-atlas.mjs`: validator for `atlas.json` against the spec and the three `docs/atlas/*.csv` (`node scripts/validate-atlas.mjs` prints counts; `validateAtlas()` is pure) (Phase 59)
- `src/atlas/logic.ts`: pure atlas decisions (region chips, search, 2D fallback mapping, renderer choice, low power, scene settings); `src/atlas/env.ts`: reads WebGL, memory, battery, motion (no three.js); `src/atlas/scene.ts`: the only file importing `three` (gold hologram, orbit, pick, dispose), loaded by `import()`; `src/atlas/credits.ts`: licence text (Phase 60)
- `src/pages/atlas/AtlasPage.tsx`: `/atlas` page (lazy route `atlas`, feature `holo_atlas`); `src/ui/styles/atlas.css` (Phase 60)
- `src/shared/recap.ts`: pure year-in-review numbers for any range, card list, ISO-week muscle of the week (Phase 61)
- `src/shared/routineImage.ts`: pure 1080x1350 routine-image layout (wrapping, fit, "+N more") (Phase 61)
- `src/data/repos/recap.ts`: reads sessions and muscle maps for the recap (Phase 61)
- `src/pages/recap/RecapPage.tsx`: `/progress/recap` swipeable cards (lazy route `recap`, feature `year_review`); `src/pages/recap/MuscleOfWeekCard.tsx`: Body-tab card (`muscle_of_week`); `src/ui/styles/recap.css` (Phase 61)
- `src/pages/routines/routineImageCanvas.ts`: draws the layout on a canvas, share-or-download; `src/pages/routines/RoutineImageSheet.tsx`: the routine menu's "Save as image" sheet (`routine_image`) (Phase 61)
- `tests/shared/recap.test.ts`, `tests/pages/routineImage.test.ts` (Phase 61)
- `public/atlas/{body.bin,fit.bin,meta.json}`: the 3D model as files (2.6 MB, never precached); `scripts/extract-atlas-model.mjs` rebuilds them from the prototype (Phase 60)
- `tests/atlas/atlasPage.test.ts`: fallback logic, low power, 2D mapping, model asset facts, lazy-load source checks (Phase 60)
- `tests/atlas/atlas.test.ts`: the real file passes, counts match, broken-file cases are caught (banned words, limits, schema, ids, mesh and taxonomy ownership) (Phase 59)
- `docs/MOVEMENT_MAP.md` (extended): drawing rules, 4 screen sketches, wording, decisions (P24.1 to P24.4)

## Import boundaries (tested in Phase 4+)
- `src/shared/*` imports nothing outside `src/shared`, no DOM/network/clock.
- `src/pages` and `src/ui` never import `src/data/gym`; they use hooks from `src/data/*` facades.
- `@supabase/supabase-js` only under `src/data/gym/`, dynamic import, only when a gym is connected.
- Colours only via tokens; no hex in components (guard test).
- No CDN URLs in `src/`, `index.html` or built output (guard test).

## Added in Phase 17
- `scripts/extract-body-figures.mjs`: one-off extractor (prototype -> figures + `regions.ts`); not run in CI
- `src/ui/body/figures/{maleFront,maleBack,femaleFront,femaleBack}.ts`: GENERATED region paths (31 units each, lazy chunk per file); `types.ts` (Unit, Figure); `index.ts` (`loadFigure`, `peekFigure`)
- `src/ui/body/regions.ts`: GENERATED tier and views per drawn muscle
- `src/ui/body/taxonomy.ts`: static 34-muscle taxonomy, `expand`, `parentOf`, `tierOf`, `viewsOf`, `lookup`, `FALLBACK`
- `src/ui/body/BodyPicker.tsx`, `MuscleChips.tsx`, `index.ts`: the figure and its text twin
- `src/ui/components/Rows.tsx` (Phase 83): `Row` (button, link or plain), `RowGroup`, `Switch`, `ChoiceRow` (4+ options, opens a sheet), `NumberRow` (stepper sheet); `src/ui/components/Collapsible.tsx`: `Collapsible` (aria-expanded section, remembered per page), `CollapseAll`; `src/data/repos/uiSections.ts`: reads and writes the remembered open/closed map (prefs row `ui:sections`); `tests/ui/buttonKit.test.tsx`: kit tests and the no-ghost guard
- Phase 87 (no new source files): `Collapsible` sections added in the Exercise, Machine, Machine index, Machine Lab, Library, Body (`LabPanel`), Recovery, Marks, Heatmap, Progress hub, Body stats, Photos, Goals, Settings group and Backup home pages; `tests/ui/declutter2.test.ts`; `review/ux/before-87|after-87`.
- Phase 86 (no new source files): `WeekView` got `strip` and `bare` props; `Collapsible` got `remember`; `src/ui/styles/routine.css` gained `.sf-wk__*`, `.sf-qgrid`, `.sf-sec__label`, `.sf-today__head`; `tests/ui/declutter1.test.ts`; `review/ux/before|after` (390x844 screenshots).
- `src/shared/onboarding.ts` (Phase 85, pure): the five onboarding steps, `advance`/`back`/`finish`, `resumeStep`, `visibleSteps` (gym-member shortcuts, re-run), `firstRunDecision`, `redirectExempt`, height and feet/inches helpers, `birthStartDay`
- `src/data/repos/onboarding.ts` (Phase 85): saved flow state (`prefs` row `onboarding:state`), `readAbout`/`readKnown`, step savers, `decideOnboarding` (first-run decision; older installs are marked done)
- `src/pages/welcome/WelcomePage.tsx` (Phase 85): route `/welcome` (`?again=1` = re-run from Settings), no tab bar; `src/ui/styles/onboarding.css`; `tests/shared/onboarding.test.ts`, `tests/data/onboarding.test.ts`
- `src/shared/calendar.ts` (Phase 84, pure): month lengths and leap years, `monthGrid` (42 cells, Monday first), `inRange`/`clampDay`/`fitToMonth`/`yearOptions`/`startDay`, `dayLabel`/`monthLabel`, `yearOfDay`; `src/ui/components/DatePicker.tsx`: `DatePicker` (a field that opens a sheet with Month and Year dropdowns and the day grid; `mode="month"` for month-only), `.sf-cal*` CSS in `components.css`; `tests/shared/calendar.test.ts`, `tests/ui/datePicker.test.tsx` (also the no-native-date guard)
- `src/ui/body/useFigureSex.ts` (Phase 82): `useFigureSex()` = the profile's figure until "Switch figure" is tapped on a page; pure `figureFromProfile`, `otherFigure`
- `src/ui/styles/body.css`: body picker + chips styles (imported by `index.css`)
- `tests/ui/figureSex.test.tsx` (Phase 82): figure follows the profile, Switch figure link; `tests/data/relayFallback.test.ts` (Phase 82): relay falls back to the core values; `tests/app/viewportLock.test.ts` (Phase 82): zoom lock guard
- `tests/ui/body.test.tsx`: 17 tests (data coverage, modes, keyboard, swipe, long press, mini, chips)
- `src/pages/body/labData.ts`: Muscle Lab pure helpers (Candidate adapter, `labList`, filters, `countByMuscle`, `workedRows`, `machineFinder`)
- `src/pages/body/LabPanel.tsx`: one muscle's list (note, filters, Surprise me, three sections, why chips, machine finder) + `useLabData`
- `src/pages/body/WorkedPanel.tsx`: "Muscles worked" mode (exercise or machine on the body)
- `src/pages/body/MuscleLab.tsx`: `/body` explorer; `src/pages/body/MusclePage.tsx`: `/muscle/<id>`
- `src/data/repos/lab.ts`: loads dataset + local store into one `LabData` for the lab screens
- `tests/pages/lab.test.ts`: 17 tests (list order with a fixture user, filters, counts, worked rows, machine finder)
- `src/shared/equipment.ts`: Phase 19 equipment presets (gym, bodyweight, dumbbells, bands, home) and `allowsMachine` (pure filter, engines.md 22)
- `src/pages/library/libraryState.ts`: Library pure helpers (URL <-> state, refine hits, chip counts, machine list, recent searches)
- `src/pages/library/LibraryPage.tsx`: `/library` (exercises | machines, search, chips, filters sheet, equipment mode, recents)
- `src/data/repos/library.ts`: machines list + device-only prefs (equipment preset, recent searches) in the local `prefs` store
- `tests/pages/library.test.ts`: 15 tests (URL round trip, search UX with fixtures, filters, equipment, machines, recents)
- `src/dataset/fuzzy.ts`: Phase 20 fuzzy search (engines.md 14, pure): `buildFuzzyIndex`, `expandQuery` (aliases), `fuzzySearch` (ranking, setup chip, did-you-mean)
- `src/ui/search/SearchBox.tsx`: shared search box (input, did-you-mean, setup chip, recents); used by the Library, reusable by later pickers
- `src/dataset/query.ts`: `fuzzyExercises` added (Phase 20); `src/data/repos/exercises.ts`: `exercisesRepo.fuzzy`
- `contract/fixtures/search_queries.json`, `search_budget.json`: Phase 20 fuzzy-search fixtures (29 queries) and the speed budget
- `tests/dataset/fuzzy.test.ts`: 47 tests (fixture queries, rules, query layer, benchmark)

## Added in Phase 21
- `src/pages/exercise/exerciseModel.ts`: pure model (YouTube url builder + overrides, gallery/card photo, muscle groups + mini-body emphasis, difficulty dots, easier/harder, variation adds, form cue card slides, rep range, `nice`)
- `src/pages/exercise/muscleLabel.ts`: UI name of a muscle id (shared by both pages)
- `src/pages/exercise/ExercisePage.tsx`: `/exercise/<slug>` (custom exercises too)
- `src/pages/exercise/MachinePage.tsx`: `/machine/<slug>` (gallery, status, muscles, exercises)
- `src/pages/exercise/FormCueCard.tsx`: swipeable form cue card (feature `form_cues`); the Phase 22+ logger mounts the same component
- `src/data/repos/exercisePage.ts`: `loadExercisePage`, `loadMachinePage`, chosen variation + dismissed cue (device prefs), YouTube policy hook
- `src/ui/styles/exercise.css`: styles for both pages (imported by `index.css`)
- `tests/pages/exercise.test.tsx`: Phase 21 tests

## Added in Phase 22
- `src/pages/exercise/setupModel.ts`: pure setup model (`parseSetupData`, `offeredAxes`, `cleanSetup`, `chooseOnAxis`, `setupFromSearch`, `setupWeights`, `setupEffect`, `addedBySetup`, `itemFields`, `prKey`)
- `src/ui/setup/SetupPicker.tsx`: compact chip rows per offered axis (reused by routine items, the set logger and swap suggestions in their phases)
- `src/data/repos/exercisePage.ts` (extended): `getChosenSetup` / `setChosenSetup`, `getSeparatePrPerGrip` / `setSeparatePrPerGrip`
- `src/ui/styles/exercise.css` (extended): setup picker styles
- `tests/pages/setup.test.tsx`: Phase 22 tests

## Added in Phase 23
- `src/pages/machines/machineLabModel.ts`: pure Machine Lab model (reach table types, `rowsFor`, runtime `computeRows` for two or more chips, `chipGroups`, `toggleChip`, `bandOf`/`heatFor`, `notReachable`, `textTwin`, `exercisesReaching`, `/machines` index rows and sort)
- `src/pages/machines/MachineLabPage.tsx`: `/machines/<slug>/lab` (`MachineLabView` is the presentational part, used by tests)
- `src/pages/machines/MachineIndexPage.tsx`: `/machines` (sort by reach / name / zone, search, machine finder)
- `src/data/repos/machineLab.ts`: `loadMachineIndex`, `loadMachineLab` (reach table, setup data, map rows, names)
- `src/ui/styles/body.css` (extended): `.sf-ml*` styles
- `tests/pages/machineLab.test.tsx`: 12 tests (table equality for all 55 machines, fixtures, filters, rope, index, text twin, screen)
- `contract/fixtures/reach_table.json`, `reach_combo.json`: reach worked examples (identical in the Admin zip once copied)
- Edited: `src/app/routes.ts` (`/machines`, `/machines/:slug/lab`, feature `machine_lab`), `MachinePage.tsx` (Machine Lab link), `LibraryPage.tsx` (machines-tab link to `/machines`), `src/i18n/en.ts` (`ml.*`, `mi.*`, `mc.lab`)

## Added in Phase 25
- `src/shared/movement.ts`: pure movement maths: types, `parseParams`, `applyParams` (arm_world rule), `paramsFromSetup`, side and front forward kinematics (`skeleton`, `placePair`), `arcsFor`, `pathArrow`, `glyphFor`, `fitFrame`, `buildFigure`, two proportion tables (male, female), `parseMovementData`
- `src/ui/movement/MovementFigure.tsx`: SVG figure (faded start, solid end, capsule limbs, dots, arcs, resistance arrow, glyph, angle legend, text twin; 2 loops of 1.2 s then rest, static under reduced motion; `mini` = end pose only)
- `src/ui/movement/MovementSection.tsx`: `MovementSection` (title, (i) sheet, figure, muscle chips), `MiniMovement` (56 px button + sheet, for the session header), `PatternPreview` (creator preview; Phase 27 mounts it)
- `src/ui/movement/movementModel.ts`: `chipMuscles` (top 4 by setup-aware weight), `benchOf`
- `src/shared/personal.ts`: pure personal state per exercise: `Personal`, `cleanNote` (500 chars), `parsePersonal`, `applyPersonal` (favourite and hidden never both on), `goTos`, `favouriteSlugs`, `hiddenSlugs`, `withoutHidden` (Phase 26)
- `src/shared/customExercise.ts`: pure custom exercise rules: `validateCustom`, `validateYoutubeUrl`, duplicate-name guard (`nameKey`, `isDuplicateName`), muscle list helpers (`toggleMuscle`, `applyPicked`, `setMuscle`, `pickerEmphasis`), `draftFromStored` (Phase 27)
- `src/data/repos/customExercises.ts`: `saveCustom` (create or edit), `getCustom`, `listCustom`, `deleteCustom` (soft) over the `customExercises` store (Phase 27)
- `src/pages/library/NewExercisePage.tsx`: the creator/editor at `/library/new` and `/exercise/:slug/edit` (Phase 27)
- `tests/pages/customExercise.test.ts`: validators, muscle list, merge into the library queries, muscle weights, duplicate guard, edit/delete (Phase 27)
- `src/shared/routine.ts`: pure routine rules: `createRoutine`, `validateRoutine`, `cloneRoutine`, `splitDays` + `SPLIT_TABLE` (PPL, upper/lower, full body, bro, custom), name and weekday validators (Phase 30)
- `src/data/repos/routines.ts`: `listRoutines`, `getRoutine`, `putRoutine`, `createAndSave`, `duplicateRoutine`, `setActiveRoutine`, `deleteRoutine` (soft) + `restoreRoutine` over the `routines` store (Phase 30)
- `src/pages/routines/RoutinesPage.tsx`: `/routines` list (new, set active, duplicate, delete with Undo) (Phase 30)
- `src/pages/routines/RoutineSetupPage.tsx`: `/routine/new` setup (name, days 2-7 or Flexible, weekdays, split preview sheet) (Phase 30)
- `src/ui/styles/routine.css`: `.sf-rt*` rules for the two pages (Phase 30)
- `tests/shared/routine.test.ts`: validation, day ids, split tables, clone (Phase 30)
- `src/shared/routineEdit.ts`: pure editing rules: add/remove/insert/move items, superset link/unlink/labels, item sheet checks, add/remove/move days, rename, planned volume (`dayVolume`, `weeklyVolume`), rest-day hints (`overloadHints`), `estimateMinutes` (Phase 31)
- `src/data/repos/routineEdit.ts`: exercise names/machines/muscle maps for a routine's items, add-sheet search and "Good for <muscle>" picks, machine thumb (Phase 31)
- `src/pages/routines/useRoutine.ts`: loads one routine + item info, autosaves each change (Phase 31)
- `src/pages/routines/RoutineWeekPage.tsx`: `/routine/<id>` week grid, hints, planned volume, rename / active / duplicate / delete, days sheet (Phase 31)
- `src/pages/routines/RoutineDayPage.tsx`: `/routine/<id>/day/<dayId>` day editor: name, muscles via Body Picker, add/remove/reorder (buttons + drag), item sheet, supersets (Phase 31)
- `tests/shared/routineEdit.test.ts`: reorder, superset, item checks, days, rename, volume, overload detector, estimate (Phase 31)
- `src/data/repos/personal.ts`: `loadPersonal`, `getPersonal`, `setFavourite`, `setHidden`, `setNote`; one row per exercise in the `favourites` store, client_id `ex:<slug>` (Phase 26)
- `tests/pages/personal.test.ts`: Phase 26 tests (easier/harder, personal rules, repo, hidden exclusion)
- `src/ui/styles/movement.css`: `.sf-mm*` styles (tokens only)
- `src/data/repos/movement.ts`: `loadMovementData`, `movementFor(data, slug)`, `loadMovementFor(slug)`, `patternList`
- `scripts/compile-dataset.mjs` (extended): emits `movement.<hash>.json` (54 patterns with poses as 12-number arrays + 540 map rows); `src/dataset/generated/` regenerated (other files unchanged)
- `src/dataset/loader.ts`: `getMovement()`; `src/i18n/en.ts`: `mm.*` strings
- Edited in place: `ExercisePage.tsx` (figure under the cue card, quiet note when unmapped), `MachinePage.tsx` (Movement block with < > over the machine's mapped exercises)
- `tests/shared/movement.test.ts`: 29 tests (fixtures, kinematics by hand, params, arcs, frame audit for every pattern, wording)
- `contract/fixtures/movement_poses.json` (new; copy `contract/` to the Admin zip)

## Phase 32 (scheduler)
- `src/shared/schedule.ts`: pure engine: `Schedule` types, `scheduleProblem`, `parseSchedule`, `effectiveSchedule`, `weekCells`, `nextTraining`, `todayPlan`, `missedDays`, `pointerAfter`, `rankDays`, `restHint`, deload helpers, `parseSettings`, `recoveryPicks`
- `src/data/repos/schedule.ts`: settings and per-routine plan state (device-only prefs rows), finished-session dates, `readRecoveryStates` (empty until Phase 48/49), `saveSchedule`, `activeRoutine`
- `src/pages/routines/scheduleDraft.ts`: draft state of the schedule editor
- `src/pages/routines/ScheduleEditPage.tsx`: `/routine/<id>/schedule` (SC1)
- `src/pages/routines/WeekView.tsx`: week / cycle view (SC2), used on the routine page and on Home
- `src/pages/routines/usePlan.ts`: loads settings, state, sessions, recovery for one routine
- `src/pages/today/TodayPage.tsx`: Home: Today card, rest-day hint (SC4), missed-day sheet (SC3), Welcome back, week view
- `src/pages/settings/ScheduleSettingsPage.tsx`: `/settings/schedule` (SC5)
- `tests/shared/schedule.test.ts`: replays the five fixtures plus validation, parsing, settings, picks

## Phase 33 (day builder, Workout in a pinch, superset swipe)
- `src/shared/dayBuilder.ts`: pure engine: `buildDay`, `quickWorkout`, `shuffleEntry`, `supersetPartners`, time models (`itemSeconds`, `totalSeconds`), `dayPlan`/`quickPlan`, `musclesForLabel`, `equipmentPool`, `entriesToItems`
- `src/data/repos/dayBuilder.ts`: candidate pool (index facts + custom), marks, equipment preset, superset pairs, score context, item refs, `loadPartners`
- `src/pages/routines/BuiltList.tsx`: the built exercises by slot with Shuffle (shared by the sheet and the quick page)
- `src/pages/routines/DayBuilderSheet.tsx`: "Build this day for me" sheet on the day editor (time box, level, goal, replace / add to the end)
- `src/pages/routines/PartnerSheet.tsx`: superset swipe (one partner at a time, swipe or buttons), opened from the item sheet
- `src/pages/routines/QuickWorkoutPage.tsx`: `/quick` Workout in a pinch (15/20/30/45/60 min, full body or muscles, keep as a day)
- `contract/fixtures/daybuilder_time.json`, `daybuilder_cases.json`: time arithmetic and build cases
- `tests/shared/dayBuilder.test.ts`: replays both fixtures plus slot, mark, equipment, shuffle, superset and clamp rules

## Phase 34 (flexible session I)
- `src/shared/session.ts`: pure state machine: start from a day / free / repeat, any status to any status, add / remove / insert / move items, later shelf, `logSet`, counts, `suggestedNext`, `isStale`, `openSession`, `doneHoursAgo`, `finish`
- `src/data/repos/sessions.ts`: sessions store (autosave per change), `beginDay` / `beginFree` / `beginRepeat`, `finishSession` (moves the rotation pointer, stores leftovers), `endAsIs`
- `src/pages/session/TrainPage.tsx`: `/train` (resume, suggested day, other days, free session, repeat last)
- `src/pages/session/SessionPage.tsx`: `/session/<id>` and `/session/new?routine=&day=` (cards, shelf, add sheet, finish sheet, resume prompt)
- `tests/shared/session.test.ts`: state rules and crash-resume (fake-indexeddb)
- `contract/fixtures/schedule_plan.json`, `schedule_today.json`, `schedule_missed.json`, `schedule_deload.json`, `schedule_hint.json` (new; copy `contract/` to the Admin zip)
- Edited in place: `src/app/routes.ts` (Home, `/routine/:id/schedule`, `/settings/schedule`), `RoutineWeekPage.tsx` (week view), `src/shared/routine.ts` (`scheduleMeta?`), `src/ui/styles/routine.css` (`.sf-sc*`), `src/i18n/en.ts` (`sc.*`)

## Phase 35 (skip and busy-machine swaps)
- `src/shared/alternatives.ts`: pure `alternativesFor` (4 pools, reason handling for busy / pain / no time / too hard / other, max 5), `reasonAdjustment`, `primaryIds`, types `AltCandidate`, `Alternative`
- `src/data/repos/alternatives.ts`: `loadAlternatives` (builds the pool, patterns, variations, substitutes and marks for one skipped item), `machineOf`
- `src/shared/session.ts` (extended): `swapItem`, `markMachineBusy`, `clearMachineBusy`, local field `Session.busyMachines`
- `src/pages/session/SessionPage.tsx` (extended): the skip sheet (reasons, pain area, alternatives, Just skip, Search instead, Mark machine busy) and a Swap button on open cards
- `tests/shared/alternatives.test.ts`: 25 tests (5 fixture cases, reason handling, pools, swap, busy machines)
- `contract/fixtures/alternatives_cases.json`: five worked cases on the real data (the Phase 14 examples)
- `src/shared/engine/oneRm.ts`: `e1rm` (Epley, reps 1-12, 2 dp), `e1rmDisplay` (nearest 0.5) (Phase 36)
- `src/shared/engine/sessionStats.ts`: working-set rules (`isWorking`, `workingSets`), `sessionVolume`, `topWeight`, `totalReps`, `bestE1rm`, `sessionStats` (Phase 36)
- `src/shared/engine/pr.ts`: `detectPR(history, current)` -> weight / reps / e1rm / volume hits, first log = baseline (Phase 36)
- `src/shared/engine/plateau.ts`: `isPlateau`, `noProgressStreak`, `workingSessions` (Phase 36)
- `src/shared/engine/overload.ts`: `overload(history, options)` linear / double / off, `INTENSITY` dial, step, deload, clamps (Phase 36)
- `src/shared/engine/index.ts`: barrel for the five files above (Phase 36)
- `tests/shared/overload.test.ts`: 59 tests (fixtures + seeded property tests) (Phase 36)
- `contract/fixtures/overload_cases.json`: e1RM, 22 overload cases, plateau and session-stat cases (Phase 36)
- `contract/fixtures/overload_pr.json`: 9 `detectPR` cases (Phase 36)
- `src/shared/pr.ts`: three-metric PRs per exercise or grip: `recordsOf`, `detectPRs`, `buildBoard`, `sessionPRs`, `recordKey` (Phase 37)
- `src/data/repos/records.ts`: `loadBoard()` (cards with names) and `prsForSession(session)` (Phase 37)
- `src/pages/progress/RecordsPage.tsx`: `/progress/records` board, one card per exercise (Phase 37)
- `src/pages/progress/prText.ts`: `recordText`, `prToastText` (Phase 37)
- `src/pages/progress/ProgressHub.tsx`: `/progress` hub: week ring + streak, target chips, weekly volume, training grid, plateau hints, exercise list (Phase 53)
- `src/pages/progress/ExerciseProgress.tsx`: `/progress/exercise/<slug>` e1RM / weight / reps over time (Phase 53)
- `src/pages/progress/BodyPage.tsx`: `/progress/body` log, BMI, trend charts (Phase 54)
- `src/pages/progress/GoalsPage.tsx`: `/goals` list, new-goal sheet, milestones, achievement burst (Phase 54)
- `src/shared/goals.ts`: pure body-entry parsing, BMI, goal progress, status, milestones (Phase 54)
- `src/data/repos/body.ts`: body entries, height, goals read/write (Phase 54)
- `tests/shared/goals.test.ts`: goal progress, milestones, validation, body entry tests (Phase 54)
- `src/shared/intake.ts`: pure protein target (weight x factor), water glass, IST day totals, 7/30 day series, undo pick (Phase 55)
- `src/data/repos/intake.ts`: typed `intake` log read/add/remove, protein factor pref, latest weight (Phase 55)
- `src/data/repos/photos.ts`: device-only progress photos (never queued to the outbox) (Phase 55)
- `src/pages/intake/IntakePage.tsx`: `/intake` rings, quick-add, undo, 7/30 day charts (Phase 55)
- `src/pages/progress/PhotosPage.tsx`: `/progress/photos` add, grid, side-by-side compare, delete (Phase 55)
- `src/pages/progress/photoResize.ts`: shrinks a picked image to a JPEG data URL, long side 1280 px (Phase 55)
- `tests/shared/intake.test.ts`: target maths, IST roll-over, series, undo (Phase 55)
- `tests/data/intakePhotos.test.ts`: photos never enter the outbox, intake add / undo over IST midnight (Phase 55)
- `src/shared/barcode.ts`: pure barcode normalisation (EAN-13 / EAN-8 / UPC-A / UPC-E, check digit), Open Food Facts answer parser, per-serving maths, last-50 cache helpers (Phase 56)
- `src/data/repos/barcode.ts`: `lookupBarcode` (the only network call, tap-driven, Open Food Facts host only) and the device cache in one `prefs` row (Phase 56)
- `src/pages/intake/ScanPage.tsx`: `/intake/scan` camera scan, manual entry, nutrition card (Phase 56), "Add protein to today" on the card (Phase 57)
- `src/pages/intake/detector.ts`: native `BarcodeDetector` or the lazy `barcode-detector` WASM ponyfill with a locally bundled `.wasm` (Phase 56)
- `tests/data/proteinAdd.test.ts`: Add protein from a scanned card: serving maths, protein-only entry, total and Undo, bad amounts, no network call (Phase 57)
- `tests/shared/barcode.test.ts`: parsing, normalisation, answer parser, per-serving maths, cache eviction (Phase 56)
- `tests/data/barcodeLookup.test.ts`: mocked lookup (found, not found, offline, malformed, server), cache of 50, no request without a call, host and CSP (Phase 56)
- `src/shared/progressSeries.ts`: pure series: exercise points, summary, plateau, weekly volume, grid cells, targets, streak and consistency (Phase 53)
- `src/data/repos/progress.ts`: `loadHub`, `loadExercise`, own weekly target pref (Phase 53)
- `src/ui/styles/progress.css`: progress page layout (Phase 53)
- `tests/shared/progressSeries.test.ts`: series, weekly volume, grid, target and streak tests (Phase 53)
- `src/ui/styles/records.css`: `.sf-pr*` rules (Phase 37)
- `tests/shared/pr.test.ts`: 27 tests (fixtures, board, session PRs, key match, text, seeded properties) (Phase 37)
- `contract/fixtures/pr_cases.json`: 12 `detectPRs` cases + 3 `recordsOf` cases (Phase 37)
- `contract/fixtures/pr_board.json`: 3 board cases + 4 session-PR cases (Phase 37)

## Phase 38 notes: set logger (contract: three new fixture files)
- `src/shared/pocket.ts`: `platesFor`, `warmupSets`, `restSeconds`, `defaultRest`, `classOf`, rest timer maths (`startRest`, `remainingRest`, `adjustRest`, `actualRest`, `clockText`) (Phase 38)
- `src/shared/logger.ts`: `setFromDraft`, `cardioFromDraft`, `initialDraft`, `lastTime`, `resultsFor`, `restHistory`, set reducers (`addSet`, `editSet`, `deleteSet`, `restoreSet`, `duplicateSet`, `addRamp`), `swipeAction`, `sanitizePrefs` (Phase 38)
- `src/data/repos/logger.ts`: `loadLoggerInfo`, `loadHistory`, `getLoggerPrefs` / `putLoggerPrefs`, `getOverloadSettings` (Phase 38)
- `src/pages/session/SetLogger.tsx`, `PlateSheet.tsx`, `device.ts` (wake lock, vibrate) (Phase 38)
- `tests/shared/pocket.test.ts` (46), `tests/shared/logger.test.ts` (27) (Phase 38)
- `contract/fixtures/pocket_plates.json`, `pocket_warmup.json`, `pocket_rest.json` (Phase 38)

## Phase 39 notes: summary, history, PR wall (no contract change)
- `src/shared/history.ts`: `summaryOf`, `volumeText`, `musclesHit`, `finishedSessions`, `groupByDay`, `countByDay`, `monthGrid`, `shiftMonth`, `prWall` (Phase 39)
- `src/data/repos/history.ts`: `loadFinished()`, `loadSessionView(id)` (names, PRs, muscles); `beginRepeatOf(id)` in `src/data/repos/sessions.ts` (Phase 39)
- `src/pages/history/HistoryPage.tsx` (`/history`), `SessionViewPage.tsx` (`/session/:id/summary` and `/history/:id`), `dayText.ts` (Phase 39)
- `src/ui/styles/history.css`; `tests/shared/history.test.ts` (20 tests) (Phase 39)

## Phase 40 notes: copy for AI review (contract: five new fixture files)
- `src/shared/aiReview.ts`: `aiReviewText(scope, history, opts)` for a session, a day range and one exercise; `rangeFor` (last 7 / 30 days, this month, custom); `weightText`; the 12,000-character trim; defaults (`DEFAULT_INTRO`, `DEFAULT_INCLUDE`, `DEFAULT_OPTIONS`) (Phase 40)
- `src/data/repos/aiReview.ts`: `loadAiHistory(labelOf)` (finished sessions, names, machine names, muscle weights, own notes) and `getAiPrefs` / `setAiPrefs` / `parsePrefs` (Phase 40)
- `src/pages/aiReview/AiReviewSheet.tsx` (preview sheet: editable text, include options, units, intro, Copy, Share), `RangeSheet.tsx` (period picker), `copyText.ts` (Clipboard API, select-all fallback, share check) (Phase 40)
- Buttons added in place: `SessionViewPage.tsx` (Copy for AI review: summary and every history entry), `HistoryPage.tsx` (Review a period), `ExercisePage.tsx` (Copy this lift's progress); all gated by `ai_review_export` (Phase 40)
- `tests/shared/aiReview.test.ts` (38 tests) (Phase 40)
- `contract/fixtures/aireview_session.json`, `aireview_range.json`, `aireview_exercise.json`, `aireview_trim.json`, `aireview_privacy.json` (Phase 40)

## Phase 41 notes: plan envelope + encryption (pure; contract: two new fixture files)
- `src/shared/planShare/secret.ts`: 80-bit secret <-> `XXXX-XXXX-XXXX-XXXX` Crockford code (typo mapping), `secretFromLink` (reads only the `#` fragment), `shareLink`
- `src/shared/planShare/crypto.ts`: `deriveId`, `deriveKey` (HKDF), `encryptEnvelope` / `decryptEnvelope` (AES-256-GCM, gzip flag byte, 64 KB / 48 KB caps), base64 and hex helpers
- `src/shared/planShare/envelope.ts`: zod `PlanEnvelope` (`parseEnvelope`), `buildEnvelope` (whitelist copy, no ids, no personal fields), `importPlan` (fresh ids, slug and name collisions, unavailable / hidden flags)
- `tests/shared/planShare.test.ts` (32 tests) (Phase 41)
- `contract/fixtures/planshare_vectors.json`, `planshare_import.json` (Phase 41)

## Phase 42 notes: share and receive UI (no contract change)
- `src/data/relay/client.ts` (the four relay calls, `relayConfig` / `relayAvailable` / `setGymRelay`, `RelayError`), `src/data/relay/shareFlow.ts` (`startShare`, `pollShare`, `cancelShare`, `receivePlan`)
- `src/data/repos/planShare.ts` (`envelopeFor`, `prepareImport`, `savePlan`, `CONTRACT_MAJOR`)
- `src/pages/share/{SharePlanSheet,ReceivePage,Scanner,qr,useCountdown}.tsx|ts` (sender sheet, `/share` page, jsqr camera scan, QR svg, countdown)
- `src/pages/settings/PrivacyPage.tsx` (`/settings/privacy`); routes `share` (feature `plan_share`) and `settings-privacy` added in place; buttons added in place to `RoutineWeekPage.tsx` (menu: Share plan) and `RoutinesPage.tsx` (Receive a plan); strings `ps.*` in `src/i18n/en.ts`; CSS appended to `routine.css`
- `tests/data/shareFlow.test.ts` (mock relay) (Phase 42); new dependency `jsqr@1.4.0`

## Phase 43 notes: heat engine (pure; contract: four new fixture files)
- `src/shared/heat/periods.ts` (`periodFor`, `customPeriod`, `lastDays`, `allPeriod`, `shiftPeriod`, `inPeriod`)
- `src/shared/heat/rawHeat.ts` (`HeatEntry`, `setUnits`, `entryFromSets`, `rawHeat`, `totalSets`)
- `src/shared/heat/reference.ts` (`percentile90`, `weeklyRaw`, `weeklyBase`, `periodRef`, `REF_FLOOR`)
- `src/shared/heat/bands.ts` (`heat01`, `bandOf`, `BAND_EDGES`); `compare.ts` (`compareHeat`); `index.ts` (`heatMap`, re-exports)
- `tests/shared/heat.test.ts` (57 tests) (Phase 43)
- `contract/fixtures/heatmap_{cases,compare,periods,units}.json` (Phase 43)

## Phase 44 notes: heatmap page (contract: two new fixture files)
- `src/shared/weakSpots.ts` (pure: `weakSpots`, `groupValues`, `median`, `pickDay`; engines.md section 23)
- `src/pages/heatmap/heatmapModel.ts` (pure page rules: `choosePeriod`, `stepPeriod`, `comparePeriod`, `heatBands`, `compareBands`, `heatRows`, `neglected`, `muscleDetail`, `trainableIds`, `weakGroups`)
- `src/pages/heatmap/HeatmapPage.tsx` (`/heatmap`: period chips, range sheet, figure, legend, text list, compare, neglected strip, weak spots, tap sheet)
- `src/data/repos/heatmap.ts` (`loadHeatData`, `loadWeakSpots`, `addToRoutine`)
- `BodyPicker` got an optional `loss` prop (steel ramp, compare mode); `.sf-body__u--loss-1..5` and the `.sf-hm*` rules in `src/ui/styles/body.css`; route `heatmap` in `src/app/routes.ts`; 62 `hm.*` strings
- `tests/shared/weakSpots.test.ts` (19), `tests/pages/heatmap.test.tsx` (11)
- `contract/fixtures/weakspots_cases.json`, `weakspots_routine.json` (Phase 44)

## Added in Phase 45 (data and docs only; all under `contract/`, identical in the Admin zip)
- `contract/dataset/strength_ladders.csv`: 42 benchmark lifts with M/F anchors, load mode fraction and muscle rank weights (MB, engines.md 26.1)
- `contract/dataset/tier_fractions.csv`: 9 tier fractions and experience thresholds
- `contract/dataset/ladder_rules.csv`: exact-slug and word rules giving ladder, factor and load mode
- `contract/dataset/strength_ladder_map.csv`: 634 rows, exercise -> ladder + factor + load mode, or `none` (Phase 46 reads this, not the rules)

## Phase 46 notes: muscle strength engine (pure; contract: three new fixture files)
- `src/shared/badges/ladders.ts` (types `Ladder`, `LadderMapRow`, `TierDef`, `BadgeData`; `ladderFromRecord`, `mapRowFromRecord`, `tierFromRecord`, `parseMuscleList`, `buildLadderIndex`, `anchorFor`, `groupsOf`, `BADGE_GROUPS`)
- `src/shared/badges/thresholds.ts` (`thresholdKg`, `ladderThresholds`, `tierIndex`, `loadFor`, `benchmarkE1RM`, `isImplausible`, `ALLOMETRIC_EXPONENT`)
- `src/shared/badges/tiers.ts` (`muscleBadge`, `groupBadge`, `overallBadge`, `medianTier`, `effectiveIndex`)
- `src/shared/badges/experience.ts` (`experienceMp`, `experienceOf`, `medianExperienceTier`, `lastTrained`, `rustOf`)
- `src/shared/badges/index.ts` (`computeBadges`, `promotionsBetween`, `sessionPromotions`, `thresholdsAt`, `WINDOW_DAYS`; re-exports the four files)
- `tests/shared/badges.test.ts` (62 tests) (Phase 46)
- `contract/fixtures/badges_{thresholds,sets,muscles}.json` (Phase 46)

## Phase 47-a notes: muscle badges screens (no contract change; tests not yet run)
- `src/data/repos/badges.ts` (`loadBadgeState`, `loadSessionPromotions`, `getProfile` / `saveProfile`, `saveBodyweight`, `parseBodyweight`, `confirmSets`; folds taxonomy parents into the 11 badge groups)
- `src/pages/badges/BadgesPage.tsx` (`/profile/muscles`: overall card, body figure by tier, legend, text list, groups, strongest/weakest, experience, confirm, honest limits, per-muscle sheet, first-run prompt, hidden state)
- `src/pages/badges/BadgesSettingsPage.tsx` (`/settings/badges`), `ProfileForm.tsx` (sex + bodyweight), `PromotionBanner.tsx` (tier-up box on the session summary), `Crest.tsx` (shield), `badgesModel.ts` (pure page helpers)
- `src/shared/badges/ladders.ts` gained `parseBadgeData`; `src/dataset/loader.ts` gained `getBadges`; `scripts/compile-dataset.mjs` emits `badges` (ladders, map, tiers) when `strength_ladders.csv` exists; `src/dataset/generated/badges.*.json` (generated)
- `src/ui/body/BodyPicker.tsx`: optional `tier` prop (`sf-body__u--tier-N`); `src/ui/styles/body.css`: `.sf-bd*` rules

## Phase 47-b notes (tests and fixes)
- `tests/pages/badges.test.ts` (13 tests: `badgesModel`, `parseProfile`, `parseBodyweight`, `parseBadgeData` on the real compiled file)
- `tests/papaparse.d.ts` (a typed `declare module 'papaparse'`, so `tests/shared/badges.test.ts` type-checks without `@types/papaparse`)
- `src/i18n/en.ts`: added `muscle.core`; `PromotionBanner.tsx` drops a muscle line that repeats a group line of the same tier

## Phase 48 notes: recovery clock, avoid marks, balance (pure; contract: four new fixture files)
- `src/shared/recovery.ts` (`recoveryState`, `sizeOf`, `TARGET_HOURS`, `lastTrained`, `recoveryMap`, `recoveryStates`, `readyMuscles`, `balance`, `AXES`, `neglectedMuscles`, `trackedMuscles`)
- `src/shared/avoid.ts` (`avoidFilter`, `withoutAvoided`, `setMark`, `parseMarks`, `marksToSets`, `markOf`, `markClientId`; the test itself is `meetsMark` in `suggest/score.ts`)
- `src/data/repos/marks.ts` (`loadMarks`, `setMuscleMark`: one row per muscle in the `marks` store)
- `src/data/repos/recovery.ts` (Phase 49: `loadRecovery` = clock + 28-day balance + marks; `readRecoveryNow` = the scheduler's id -> state record, `{}` with no logged work)
- `src/pages/body/recoveryModel.ts` (Phase 49, pure: `isListed`, `GROUP_ONLY`, `recRows`, `readyList`, `stateCounts`, `waitText`, `balanceLines`, `markRecord`, `markRows`, `markChoices`, `applyChoice`)
- `src/pages/body/RecoveryPage.tsx` (`/body/recovery`: figure in recovery mode, legend, Ready today, balance card, every muscle, tap sheet)
- `src/pages/body/MarksPage.tsx` (`/body/marks`: figure in marks mode, text twin, your marks, Avoid / Sore / Clear sheet)
- Phase 49 edits to existing files: `heatmap.ts` repo (`HeatData.recovery`), `schedule.ts` repo (`readRecoveryStates` is real), `lab.ts` repo (marks through `loadMarks` + `marksToSets`), `MuscleLab.tsx` (two links), `routes.ts` (2 routes), `en.ts` (`rc.*`, `mk.*`), `body.css` (6 swatch rules)
- `tests/shared/recovery.test.ts` (65 tests)
- `src/shared/chartMath.ts` (Phase 51, pure: `niceScale`, `downsample`, `scaleLinear`, `nearestIndex`, `labelStride` / `labelIndices`, `compact`, `dayLabel`, `preparePoints`, `timeBase`, `seriesStats`, `summaryFor`)
- `src/ui/charts/` (Phase 51): `ChartFrame.tsx` (title, states, summary, legend, readout, error boundary), `useScrub.ts` (pointer + keyboard scrub, `useWidth`), `LineChart.tsx`, `AreaChart.tsx`, `BarChart.tsx`, `Sparkline.tsx`, `charts.css`, `index.ts` (barrel)
- `src/pages/dev/ChartPreview.tsx` (Phase 51, dev only: the Charts section of `/dev/design-preview`)
- `tests/shared/chartMath.test.ts` (18), `tests/ui/charts.test.tsx` (52)
- `src/ui/charts/{Ring,Gauge,HeatGrid,StatTile,StackedBar}.tsx` (Phase 52): ring with optional second ring and centre slot; half-ring gauge with marks; Monday-start calendar heat grid; count-up stat tile with delta and sparkline; one or many stacked bars (horizontal or vertical)
- Phase 52 edits to existing files: `src/shared/chartMath.ts` (ring, gauge, heat layout, stack layout, count-up, delta, `summaryFor2`), `src/ui/charts/{charts.css,index.ts,ChartFrame.tsx}` (css, barrel, `legendMin`), `src/pages/dev/ChartPreview.tsx`, `src/i18n/en.ts`, `tests/shared/chartMath.test.ts` (now 55), `tests/ui/charts.test.tsx` (now 92)
- Phase 51 edits to existing files: `src/i18n/en.ts` (`chart.*`, `preview.charts*`), `src/pages/dev/DesignPreview.tsx` (mounts `ChartPreview`)
- `docs/design/CHART_KIT.md` (Phase 50, spec only: the nine charts, data shapes, scale rules, states, usage table; built in Phases 51 and 52)

## Owner fix after Phase 64
- `src/app/navBack.ts` (history counter + `goBack`), `tests/app/navBack.test.ts`; 40 page files, `Shell.tsx` (tab links replace) and `main.tsx` edited in place
- `src/pages/MePage.tsx` (`/me` hub list); edited in place: `routes.ts`, `en.ts` (`me.*`), `settings.css`, `base.css` (themed scrollbars)

## Added in Phase 63 (Settings II)
- `src/shared/content.ts`: zod schemas and safe readers for About and Credits, `REQUIRED_THIRD_PARTY`
- `src/shared/dataTools.ts`: wipe word check, backup file name, byte formatting
- `src/shared/reminders.ts`: reminder choice parse, `nextReminderAt` (IST)
- `src/data/repos/dataTools.ts`: `makeBackup`, `restoreBackup`, `wipeAllData`, storage numbers; `src/data/repos/reminders.ts`: read/write the reminder row
- `src/pages/settings/{DataPage,RemindersPage,GymPage,AboutPage,CreditsPage}.tsx` (`/settings/{data,reminders,gym,about,credits}`)
- `src/content/about.json`, `src/content/credits.json`: owner-editable text (licences pre-filled)
- `tests/pages/settings63.test.ts`
- Edited in place: `PrivacyPage.tsx`, `SettingsHub.tsx`, `src/shared/settings.ts` (`MORE_GROUPS`), `src/app/routes.ts`, `src/ui/styles/settings.css`, `src/i18n/en.ts`

## Added in Phase 62 (Settings I)
- `src/shared/settings.ts`: pure pref definitions (`PREF_DEFS`, defaults, `parsePref`, `parseBirthYear`) and the six `GROUPS`
- `src/data/repos/prefs.ts`: `readPref`, `writePref`, `onPrefChange`, gym-lock hook (`setGymLockResolver`, `lockedByGym`)
- `src/data/usePref.ts`: `usePref(key)` hook
- `src/app/appearance.ts`: applies Motion, Density and Haptics at start (`loadAppearance`)
- `src/pages/settings/SettingsHub.tsx` (`/settings`), `SettingsGroupPage.tsx` (`/settings/<group>`, six routes)
- `src/ui/styles/settings.css`; `tests/pages/settings.test.ts`
- Edited in place: `src/app/routes.ts`, `src/i18n/en.ts` (`st.*`), `src/ui/components/haptics.ts` + `index.ts`, `src/ui/styles/base.css` + `index.css`, `src/main.tsx`

## Added in Phase 67 (gym link: connect, sign in, sync)
- `src/shared/sync.ts`: pure sync rules: push order and per-table mode, `toServerOps` (local row -> server requests; the one place for column names [A-P67.1]), `sortForPush`, `batchOps`, `retryDelayMs`, `classifyError`, `failureReason`, cursor helpers, `chipState`, `FUNCTION_CODE_KEYS`, `passwordProblem`
- `src/data/gym/types.ts` (the `Remote` interface), `functions.ts` (Edge Function calls: `lookupLogin`, `changePasswordCall`, `syncSummaryCall`), `supabaseRemote.ts` (the real Remote; the only importer of `@supabase/supabase-js`, dynamic), `connection.ts` (stored connection, cursors, sync log, unsynced list in `prefs`), `syncState.ts` (chip store + `useChip`), `syncEngine.ts` (`pushOutbox`, `pullTable`, `runSync`), `link.ts` (`connectToGym`, `signIn`, `changePassword`, `disconnect`, `syncNow`, `initGymLink`, `retryFailed`), `useConnection.ts`
- `src/data/repos/gymLink.ts`: facade the screens import
- `src/pages/settings/GymSignInPage.tsx` (`/settings/gym/signin`), `GymPasswordPage.tsx` (`/settings/gym/password`), `GymDisconnectPage.tsx` (`/settings/gym/disconnect`), `GymSyncPage.tsx` (`/settings/gym/sync`, the Pending screen), `GymInput.tsx`, `SyncChip.tsx`
- `tests/shared/sync.test.ts`, `tests/data/gymSync.test.ts`
- Edited in place: `GymPage.tsx` (connected home), `GymConfirmPage.tsx` (Connect works), `TodayPage.tsx` (chip), `routes.ts`, `main.tsx` (`initGymLink` after the policy read), `i18n/en.ts` (`gy.*`), `settings.css`, `package.json` / lock

## Added in Phase 66 (policy engine + gym config; connecting itself is Phase 67)
- `src/shared/gymConfig.ts`: `parseGymConfig` (SFCFG1: prefix, decode, schema, version, host allow-list, major, public-key check), `extractPayload`, plain-word messages
- `src/shared/policy.ts`: zod `policySchema`, `parsePolicy`, `chooseCurrent`, `resolveFeatureValue`, library overrides (`isHiddenByGym`, `youtubeOverride`, `machineStateOf`, `hiddenSetupFor`, `applyLibraryOverrides`)
- `src/data/repos/gymPolicy.ts`: cached policy in `prefs` row `gym:policy`, `initGymPolicy` (boot), `acceptPolicy` (Phase 67 calls it), `clearPolicy`, `gymHiddenSlugs`, `machineStatusFor`; installs the flag, lock and YouTube resolvers
- `src/data/repos/gymPending.ts`: the checked code that waits for the confirm screen (memory only), `checkGymCode`, `allowedGymHosts` (`VITE_ALLOWED_GYM_HOSTS`)
- `src/pages/settings/GymAddPage.tsx` (`/settings/gym/add`: scan or paste), `GymConfirmPage.tsx` (`/settings/gym/confirm`), `GymConnectPage.tsx` (`/connect`)
- `tests/shared/gymConfig.test.ts`, `tests/shared/policy.test.ts` (run the five new `contract/fixtures/policy_*` and `gymconfig_*` files)
- Edited in place: `src/app/routes.ts`, `src/i18n/en.ts` (`gy.*`), `src/main.tsx` (boot read), `src/data/repos/exercises.ts` (hidden slugs), `src/data/repos/lab.ts` (hidden + machine status for suggestions, swaps, day builder), `src/pages/exercise/MachinePage.tsx` and `src/pages/library/LibraryPage.tsx` (machine badge), `src/pages/share/Scanner.tsx` (`onText`), `src/pages/settings/GymPage.tsx`
- `src/shared/gymData.ts` (Phase 68): pure gym-data rules: membership days left and state, member QR `SF1:<code>:<crc>`, attendance streak and month grid, unread count, request validation and status rules
- `src/data/gym/gymData.ts` (Phase 68): device cache `gym:data`, offline request queue `gym:requests`, `pullGymData`, `flushRequests`, `refreshGymData`
- `src/data/gym/gymDataApi.ts` (Phase 68): `useGymData`, `submitRequest`, `markRead`, `refreshGymNow` (screens reach them through `repos/gymLink.ts`)
- `src/pages/gym/GymPages.tsx` (Phase 68): `/gym` home, membership, QR, attendance, inbox, requests pages
- `tests/shared/gymData.test.ts` (Phase 68): 21 tests for the pure rules
- `src/shared/gymPrograms.ts` (Phase 69): pure program rules (parse rows, visible, classify cards/ignored/ended, follow, copy, changed, item available)
- `src/shared/historyUpload.ts` (Phase 69): pure upload rules (ask / Not now / Never, plan order, batches, progress)
- `src/data/gym/programs.ts` (Phase 69): program cache `gym:programs`, state `gym:programs:state`, pull, follow / unfollow / copy / ignore, Disconnect clean-up
- `src/data/gym/proposals.ts` (Phase 69): proposal queue `gym:proposals`, `proposeExercise`, `flushProposals`
- `src/data/gym/historyUpload.ts` (Phase 69): upload state `gym:upload`, `uploadStep`, `runUpload`
- `src/data/gym/gymProgramsApi.ts` (Phase 69): hooks and actions for the screens
- `src/pages/routines/GymProgramsSection.tsx` (Phase 69): Routines -> "From your gym"
- `src/pages/settings/GymUploadPage.tsx` (Phase 69): `/settings/gym/upload` (S10)
- `src/pages/exercise/ProposeToGym.tsx` (Phase 69): "Propose to gym" button
- `tests/shared/gymPrograms.test.ts`, `tests/data/gymUpload.test.ts` (Phase 69): 7 + 7 tests
- Edited in place (Phase 69): `src/shared/{routine,sync,gymData}.ts`, `src/data/gym/{types,supabaseRemote,link}.ts`, `src/data/local/index.ts` (exports `enqueueInTx`), `src/data/repos/gymLink.ts`, `src/app/routes.ts`, `src/i18n/en.ts` (`gp.*`, `gu.*`), `src/pages/routines/{RoutinesPage,RoutineDayPage,RoutineWeekPage,useRoutine}`, `src/pages/settings/GymPage.tsx`, `src/pages/exercise/ExercisePage.tsx`, `tests/data/gymSync.test.ts` (fake remote stub)
- Edited in place (Phase 68): `src/data/gym/{types,supabaseRemote,link,connection}.ts`, `src/data/repos/gymLink.ts`, `src/app/routes.ts`, `src/pages/MePage.tsx`, `src/i18n/en.ts` (`gd.*`), `src/ui/styles/settings.css` (`.sf-gdcal`), `tests/data/gymSync.test.ts` (fake remote got three stub methods)
- `docs/OWNER_CHECKLIST_0.2.0.md` (Phase 70): owner phone checklist for the connected release (connect by QR, forced password change, offline then sync, locked feature, hidden exercise, programs, upload, disconnect). Note: `scripts/overflow-audit.mjs`, listed near the top of this file, is not in the zip; Phase 70 used a throwaway script outside the repo.
- `docs/OWNER_CHECKLIST_1.1.0.md` (Phase 81): owner phone checklist for the recovery release (wipe and restore, offline then sync, kill mid-restore, free sign-up and reinstall, forgot password with approval, free to gym, two phones, phone look).
- `tests/pages/about89.test.ts` (Phase 89): About author + Android install button guard.
- `docs/OWNER_CHECKLIST_1.2.0.md` (Phase 88): owner phone checklist for the native-feel release (zoom lock, plan sharing, buttons, calendar picker, welcome flow, collapsible screens, figure follows profile, screen reader).
- `tests/guard/release120.test.ts` (Phase 88): gate guard for 1.2.0 (version, viewport lock, no native date, no ghost, figure from profile, Collapsible use, IconButton labels, dialog role).

- `src/shared/emptyCheck.ts` (Phase 73): pure restore rules: `emptyCheck` (`ok | restore_offer | block_push | different_owner`), `shouldResetCursors`, `mergeAction` (add / replace / skip, a local tombstone is final), `SHRINK_THRESHOLD` 0.3 (A-R9)
- `src/shared/restoreMap.ts` (Phase 73): pure inverse of `toServerOps` for the restore (`localFromServer`, `addSetToSession`, `finishSession`, `FLAT_RESTORE`)
- `src/data/gym/restore.ts` (Phase 73): owner stamp and base row count in `meta` (`readOwner`, `writeOwner`, `readBase`, `writeBase`), `liveRowCount`, `checkRestore`, `recordBase`, `serverHasData`, `personalTargets`, `runRestore` (reuses `pullTable`; pushes held off; no outbox writes)
- `src/pages/gym/RestorePage.tsx` (Phase 73): `/gym/restore`, the Restore screen; `rs.*` strings in `src/i18n/en.ts`; a Restore row on `/gym` appears only while the last sync verdict is not `ok`
- `scripts/measure-chunks.mjs` (Phase 73): `node scripts/measure-chunks.mjs` prints raw vs gzip vs compact-packed sizes of a seeded 1,000-session history (no dependency, no network)
- `tests/fixtures/restore_empty_check.json` (Phase 73): worked cases for the empty check, cursor reset and merge. Outside `contract/` on purpose (Phase 73 may not change it); Phase 75 may promote what both apps share
- `tests/shared/emptyCheck.test.ts` (23), `tests/data/restore.test.ts` (9) (Phase 73)
- Edited in place (Phase 73): `src/data/gym/link.ts` (`syncNow` checks before pushing; `restoreStatus`, `runRestoreNow`), `src/data/repos/gymLink.ts` (facade exports), `src/pages/gym/GymPages.tsx` (Restore row), `src/app/routes.ts` (`gym-restore`), `src/i18n/en.ts`, `docs/RECOVERY_PLAN.md` (4.6 measured)
- `src/shared/chunks.ts` (Phase 75, pure): chunk keys, wire rows, canonical JSON, encode/decode, merge, `planSync`. `src/data/local/chunks.ts` (Phase 75): `buildChunk`, `applyChunk`. Tests: `tests/shared/chunks.test.ts` (35), `tests/data/chunksLocal.test.ts` (3).
- Phase 74 (docs only, no new files): appended PHASE 74 SPEC to `docs/SYNC_SPEC.md` and `docs/GYM_CONNECTION.md`. PLANNED files, not created: `src/shared/chunks.ts` (75), `src/data/gym/backup.ts` + `src/data/repos/backup.ts` (76), `src/data/gym/freeAccount.ts` (78-79), pages under `src/pages/backup/*` for routes `/settings/backup/*` (76-80).
- Phase 76-a (backup runtime, first half): `src/shared/backupPlan.ts` (pure: mode, dirty list, trigger delay, back-off, no-retry codes, due keys, last-backed-up state, object path); `src/data/gym/backupRemote.ts` (the `BackupRemote` interface + `ManifestRow`; the real adapter is 76-b); `src/data/gym/backupMeta.ts` (device-local `backup:*` meta keys); `src/data/gym/backupRun.ts` (`pushKey`, `runBackupPass`). Tests: `tests/data/backupPush.test.ts` (14, fake remote + fault injection), `tests/shared/backupPlan.test.ts` (7). DONE in 76-b1: `src/data/gym/backupSupabase.ts` (real `BackupRemote` over fetch), `src/data/gym/backupTriggers.ts` (key mapping, scheduler, DOM listeners), `setChangeListener` added to `src/data/local/repos.ts`; tests `tests/data/backupSupabase.test.ts` (9), `tests/data/backupTriggers.test.ts` (9). PLANNED in 76-b2: resumable restore, chip + Settings line, app-boot wiring.

- Phase 76-b2 (backup runtime, second half; Phase 76 DONE): `src/data/gym/backupRestore.ts` (`runRestore`: resumable restore, `backup:restore` record, `done_keys` after each key, newest month first; `restoreIsRunning`), `src/data/gym/backupBoot.ts` (`startBackup`, `initGymBackup`, `kickBackup`, `resumeRestoreIfRunning`; the ONLY caller of `createBackupRemote` and `startBackupTriggers`; lazy-imported from `link.ts`), `src/data/gym/backupState.ts` (memory store: saving, restoring n of m, online), `src/pages/settings/BackupLine.tsx` (R13 status line on Settings -> Data, hidden while `cloud_backup` is off). Edited in place: `backupRemote.ts` (+`RestoreRemote.listManifests`), `backupSupabase.ts` (+`listManifests`), `backupRun.ts` (`fetchServerChunk` exported), `types.ts` (+optional `Remote.backupAccess`), `supabaseRemote.ts` (+`backupAccess`), `link.ts` (after a successful row sync), `src/shared/backupPlan.ts` (+`backupLine`), `src/shared/sync.ts` (chip: optional `backup` input, `backing_up` and two attention reasons), `SyncChip.tsx`, `DataPage.tsx`, `settings.css`, `src/i18n/en.ts` (`bk.*`). Tests: `tests/data/backupRestore.test.ts`, `tests/shared/backupLine.test.ts`.
- Phase 78-a (free account + backup, partial): `src/shared/freeAccount.ts` (pure rules: shard parse, username/password generators, identity, R1 view, error table), `src/app/freeBuild.ts` (build config reader), `src/data/gym/freeAccount.ts` (client), `src/data/gym/freeBoot.ts` (boot, reads one row), `src/pages/settings/Backup{Home,Consent,Password,SignIn,Delete}Page.tsx` (R1, R2, R4, R5, R11), `tests/shared/freeAccount.test.ts`, `tests/data/freeAccount.test.ts`.
- Phase 80 (free to gym transition): `src/shared/freeTransition.ts` (pure: `moveDecision`, `ownerPrompt`, `restoreSourceFor`, `switchOffer`, `moveView`, `parseMove`, `moveKeys`); `src/data/gym/freeToGym.ts` (`stepMove`, `moveHooks`, `linkPorts`, `readMoveScreen`, `answerMine`, `agreeMove`, `dropMoveAsk`, `readOldFreeId`); `src/pages/settings/BackupSwitchPage.tsx` (R10), `MoveToGym.tsx` (R12 block on the Gym home and S10); `deleteFreeAfterMove` appended to `freeAccount.ts`; hooks in `link.ts` (`syncNow`, `disconnect`); tests `tests/shared/freeTransition.test.ts`, `tests/data/freeToGym.test.ts`.
- Phase 79 (recovery questions + forgot password): `src/shared/freeRecovery.ts` (pure: `validateAnswers`, `validateForgot`, `ticketView`, `canStartRequest`, `showCancelPrompt`, `sameAccount`, `lockedUntil`); `src/pages/settings/BackupQuestionsPage.tsx` (R3), `BackupForgotPage.tsx` (R7), `BackupForgotStatusPage.tsx` (R8), `BackupForgotRedeemPage.tsx` (R9); client calls appended to `src/data/gym/freeAccount.ts`; tests `tests/shared/freeRecovery.test.ts` and a Phase 79 block in `tests/data/freeAccount.test.ts`.
- Phase 77 (new-device auto restore, gym member): `src/shared/restoreFlow.ts` (pure `planAutoRestore`: wait / none / owner / closed / update / offer / start, `screenFor`, `WIFI_ROWS` = 500); `src/data/gym/autoRestore.ts` (`assessRestore`, `runChunkRestore`, `autoRestoreIfNeeded`, `useRestoreView`; the only caller of `runRestore` from backupRestore); `src/pages/settings/BackupRestorePage.tsx` (R6 `/settings/backup/restore`, feature `cloud_backup`); `link.ts` gained `runAutoRestore`, `chunkRestoreStatus`, `runChunkRestoreNow`; `restore.ts` gained `resetStaleCursors`; `gymLink` repo re-exports the two new calls; `bk.rs.*` and `gate.restore` strings; tests `tests/shared/restoreFlow.test.ts`, `tests/data/autoRestore.test.ts`.

## Milestone 12 "Premium UI": BUILT in Phase 96
- Phase 100: `src/ui/styles/premium/controls.css` (imported from `premium/index.css`), `tests/ui/controls100.test.tsx`; `Button.tsx` gains `ActionMenu` and `loading`, `Choice.tsx` / `Chip.tsx` / `Form.tsx` gain Premium variants, dev `DesignPreview` gains a controls-states block.
- Phase 99: `src/ui/styles/premium/shell.css` (frosted tab bar, sliding indicator, spring), `src/ui/styles/premium/headers.css` (sticky sub-page bar, large title, collapsed bar for top-level pages), `tests/app/shell99.test.tsx`; `Shell.tsx` gains `CollapsedTitleBar` and an indicator in `TabBar`, `SubPageHeader.tsx` gains `PremiumHeader` + `useTitleCollapsed`, `tokens.css` gains `--glass-bg`.
- Phase 98: `src/ui/icons/premiumMap.ts`, `src/ui/components/PageIcon.tsx`, `src/ui/styles/premium/icons.css`, `tests/app/icons98.test.tsx`; `generated.ts` regenerated (97 icons).
- Phase 97: `src/ui/styles/premium/surfaces.css` (elevations, inset-grouped list, hero), `src/ui/components/HeroCard.tsx` (premium hero / classic gold Card), `Card` `elevation` prop, `tests/app/surfaces97.test.tsx`.
- `src/shared/ux.ts`: pure switches (nine keys, derived master, mirror string). `src/data/repos/ux.ts`: row `appearance:ux` + `sf.ux` mirror, `onUxChange`. `src/ui/useUx.ts`: the hook. `src/pages/settings/InterfaceStyle.tsx`: master row + nine switches. `src/ui/styles/premium/index.css` and `premium/scrollbars.css`: premium CSS home (scoped, tokens only). `tests/app/ux96.test.tsx`, `tests/guard/premium.test.ts`. `src/app/appearance.ts` and `index.html` edited (apply + early apply). Depth tokens added to `tokens.css`.
## PLANNED in Milestone 12 "Premium UI" (2026-11-26; Phase 96 items below now exist, the rest do not)
- `docs/UI_PREMIUM_PLAN.md` (EXISTS, written in the planning session): milestone plan, verdicts, Style System, phases, risks.
- `src/ui/styles/premium/*.css` (planned, Phase 96 onward): all premium CSS, scoped under `:root[data-ux-<key>='premium']`, tokens only. Planned files: `index.css`, `surfaces.css`, `icons.css`, `shell.css`, `headers.css`, `controls.css`, `wheel.css`, `sheets.css`, `motion.css`, `screens.css`, `logger.css`, `onboarding.css`.
- `src/app/appearance.ts` (planned edit, Phase 96): applies `appearance:ux` and the `data-ux-*` root attributes; `index.html` (planned edit): tiny inline early-apply script.
- `src/ui/useUx.ts` (planned, Phase 96): the `useUx('<key>')` hook.
- `src/ui/icons/premiumMap.ts` (planned, Phase 98): premium icon mapping beside the untouched classic one; `src/ui/icons/generated.ts` grows to about 80 icons.
- Phase 105 (DONE): `src/ui/components/ViewSheet.tsx` (per-page "View" button + sheet with the Layout and Look switches), `src/ui/styles/view.css` (the View button, both styles), `src/ui/styles/premium/screens.css` (inset-grouped Me / Settings / Library / Train, scoped to `data-ux-layout`), `tests/app/screens105.test.tsx`. Edited: `MePage.tsx`, `SettingsHub.tsx`, `SettingsGroupPage.tsx`, `LibraryPage.tsx`, `TrainPage.tsx`, `ui/components/index.ts`, `ui/styles/index.css`, `premium/index.css`, `i18n/en.ts` (6 strings), `tests/guard/premium.test.ts` (classic-integrity list appended).
- Phase 104 (DONE): no new source file. `src/ui/components/motion.ts` (pure feedback rules), `src/ui/components/Feedback.tsx` (`useFx`, `SetCheck`, `PrMark`, `PullToRefresh`), `src/ui/styles/premium/motion.css` (feedback rules appended), `tests/ui/feedback104.test.tsx`.
- Phase 103 (DONE): `src/app/pageMotion.ts` (page direction, back swipe, shared-title View Transition), `src/ui/styles/premium/motion.css`, `src/ui/components/motion.ts` (pure navigation rules), `src/app/Shell.tsx` (`data-dir`), `src/pages/library/LibraryPage.tsx` (row tap), `tests/app/pageMotion103.test.ts`.
- Phase 102 (DONE): `src/ui/styles/premium/sheets.css` (scrim fade, spring up, handle, medium / large, keyboard lift), `src/ui/components/Overlay.tsx` (`Sheet` -> `PremiumSheet` / `ClassicSheet`), `src/ui/components/motion.ts` (pure sheet maths), `tests/ui/sheets102.test.tsx`.
- Phase 101 (DONE): `src/ui/components/WheelPicker.tsx` (scroll-snap wheel, spinbutton role, keyboard, haptic tick), `src/shared/wheel.ts` (pure: `wheelValues`, `nearestIndex`, `snapValue`, `clampValue`, `indexAtScroll`, `scrollForIndex`, `stepIndex`, `weightWheel`), `src/ui/styles/premium/wheel.css` (imported from `premium/index.css`), `tests/shared/wheel.test.ts`, `tests/ui/wheel101.test.tsx`. Edited: `Rows.tsx` (`NumberRow` shows a wheel when `ux.wheels` is premium, else the Stepper), `SettingsGroupPage.tsx` (`StepRow` = rest seconds becomes a wheel row in Premium), `components/index.ts`, `en.ts` (`wheel.useSteppers`).
- `src/ui/components/HeroCard.tsx` (planned, Phase 97).
- `tests/guard/premium.test.ts` (planned, Phase 96): premium CSS rules, classic-integrity list, every `ux.*` key has a Settings row and a default.
- `docs/OWNER_CHECKLIST_1.3.0.md` (planned, Phase 111).
- Phase 106: `tests/app/screens106.test.tsx` (Body, Exercise page, Progress in both styles). Edited in place: `src/ui/components/ViewSheet.tsx` (optional `children`), `src/data/repos/uiSections.ts` (`ui:body-layout` row), `src/pages/body/MuscleLab.tsx`, `src/pages/exercise/ExercisePage.tsx`, `src/pages/progress/ProgressHub.tsx`, `src/ui/styles/premium/screens.css`, `src/i18n/en.ts` (5 strings).
- Phase 107-a: `src/ui/styles/premium/logger.css` (wheel pair, sticky exercise bar; imported from `premium/index.css`), `tests/app/logger107.test.tsx`. Edited in place: `src/pages/session/SetLogger.tsx` (weight and reps wheels under `ux.wheels`), `src/pages/session/SessionPage.tsx` (`LoggerView`: View sheet with Wheels / Steppers), `src/shared/wheel.ts` (`loggerWheel`), `src/ui/components/ViewSheet.tsx` (empty `keys` shows no shared rows), `src/i18n/en.ts` (4 `lg.input*` strings), `tests/guard/premium.test.ts` (classic-integrity rows).
- Phase 107-b: `tests/app/logger107b.test.tsx` (swipe with Undo in Premium and Classic, pure `swipeFollow`). Edited in place: `src/shared/logger.ts` (`swipeFollow`), `src/pages/session/SetLogger.tsx` (finger-follow, rest progress), `src/pages/session/SessionPage.tsx` (finish summary), `src/ui/styles/premium/logger.css` (swipe layer, docked rest timer, `.sf-fin`), `src/i18n/en.ts`.
- Phase 111: `tests/guard/release130.test.ts` (gate guard for 1.3.0), `docs/OWNER_CHECKLIST_1.3.0.md`. Edited in place: `package.json` / `package-lock.json` (1.3.0), `tests/guard.test.ts` (index.html page colour), `tests/guard/release120.test.ts` (version at least 1.2.0), `src/ui/styles/premium/controls.css` (chip 44 px).
- Phase 110: `src/ui/styles/premium/today.css` (Today in Premium: date line, hero + ring, liquid-gold `.sf-start`, week strip, Next up, Quick tiles, empty state; imported from `premium/index.css`), `tests/app/today110.test.tsx`. Edited in place: `src/pages/today/TodayPage.tsx`, `src/ui/styles/tokens.css` (3 tokens), `src/i18n/en.ts` (`tp.*`).
- Phase 108: `src/ui/styles/premium/onboarding.css` (gold selection, /welcome polish; imported from `premium/index.css`), `tests/app/launch108.test.ts`. Edited in place: `index.html` (theme-color, color-scheme, `#splash`), `src/pages/welcome/WelcomePage.tsx` (`key={step}`).
- Phase 113 (Tidy layout, owner-approved UI clutter pass): `src/ui/styles/premium/tidy.css` (every rule under `:root[data-ux-tidy='premium']`; imported from `premium/index.css`). Edited in place: `src/shared/ux.ts` + `index.html` (tenth key `tidy`, last), `src/pages/settings/InterfaceStyle.tsx`, `src/ui/components/SubPageHeader.tsx`, `src/ui/components/Form.tsx` (`hideLabel`), `src/ui/search/SearchBox.tsx`, `src/ui/body/BodyPicker.tsx`, `src/pages/library/LibraryPage.tsx`, `src/pages/machines/MachineIndexPage.tsx`, `src/pages/progress/ProgressHub.tsx`, `src/ui/styles/tokens.css` (`--text-muted-tidy`), `src/i18n/en.ts` (`ux.sw.tidy`, `ux.sw.tidy.hint`, `mi.sort.reach.short`), tests `ux96`, `shell99`, `premium`.
- Phase 114: `tests/shared/dayPicks114.test.ts`. Edited in place: `src/shared/schedule.ts` (`dayPicks`), `src/data/repos/schedule.ts` (`PlanState.dayPicks`), `src/pages/routines/usePlan.ts` + `WeekView.tsx` (day picker), `src/pages/session/TrainPage.tsx` (today's pick, `LoggerChoice`), `src/pages/session/SetLogger.tsx` + `src/ui/components/haptics.ts` / `index.ts` (`logged()`), `src/ui/components/WheelPicker.tsx` (arming), `src/pages/body/MuscleLab.tsx` (collapsible list, link chips), `src/pages/history/SessionViewPage.tsx` + `SessionEditor.tsx` (Change date), `src/ui/styles/premium/tidy.css` (slidable rows, wheel idle/armed), tests `wheel101`, `premium`.
- Phase 115: `premium/tidy.css` (uniform list rows, slidable-row scrollbar hidden + fade). Edited in place: `TrainPage.tsx` (short Start), `routines/BuiltList.tsx` (Shuffle icon), `routines/RoutineWeekPage.tsx` (day editor icons), `i18n/en.ts` (`fs.train.start.short`).
- Phase 116 (guided walkthrough): new `src/shared/tour.ts` (pure step list, state rules, card placement), `src/data/repos/tour.ts` (prefs row `tour` = {v, done, skipped, stepId, auto}), `src/app/tourStore.ts` (running state + `requestStart` for the Settings row), `src/ui/components/Tour.tsx` (overlay, mounted once in `Shell.tsx`), `src/ui/styles/tour.css` (imported from `styles/index.css`), `tests/shared/tour116.test.ts`. Edited in place (attributes or pass-through props only): `data-tour` on `Card`, `HeroCard`, `Row`, `RowGroup`, the tab bar links (`Shell.tsx`), `TodayPage`, `TrainPage`, `SessionPage`, `SetLogger`, `SearchBox`, `MuscleLab`; `shared/settings.ts` (row kind `tour`), `SettingsGroupPage.tsx` (the row, Appearance group), `i18n/en.ts` (`tour.*`).
- Phase 117 (page tips): new `src/shared/tips.ts` (page list, default rule), `src/data/repos/tips.ts` (prefs row `tips` = {v, on}), `src/app/tipsStore.ts` (live setting + hook), `src/ui/components/PageTip.tsx` (the "i" button + sheet, mounted in `Shell.tsx` beside `Tour`), `src/ui/styles/pagetip.css`, `tests/shared/tips117.test.ts`. Edited in place: `shared/settings.ts` (row kind `tips`), `SettingsGroupPage.tsx` (the switch row, Appearance), `i18n/en.ts` (`tips.*`), `styles/index.css`.
