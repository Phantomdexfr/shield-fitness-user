# API_CONTRACTS — User app (internal module contracts)

Cross-app contracts live in `contract/` (policy, SFCFG1, connected API, engines, features, dataset). This file lists the **internal** signatures phases must honour. Types are defined in `contract/engines.md` (Ref, Item, Day, Routine, SetLog, SessionItem, Session, CustomExercise).

## Pure modules (`src/shared`)
- `muscleWeights(exerciseOrCustom, variation?) -> Record<muscleId, number>` (rules: engines.md §1-2)
- `heatBands(rawByMuscle, refP90) -> Record<muscleId, 0..5>` (§3)
- `recoveryState(lastTrainedAt, size, now) -> 'fatigued'|'recovering'|'ready'|'fresh'` (§4)
- `suggest(ctx) -> {suggested: Item[], built: Item[], more: Item[]}` (§6-7)
- `alternatives(item, reason, ctx) -> Item[]` (§8)
- `buildDay(spec, ctx) -> Day` (§9)
- `overload(history, mode) -> {weight, reps, note}`, `e1rm`, `detectPR` (§10)
- `resolvePolicy(policy|null, userPrefs, catalogue) -> Record<featureKey,{enabled,locked}>` (contract/policy.md)
- `parseGymConfig(text) -> GymConfig | Error` (contract/gym-config.md)
All take `now`/random seed as parameters.

## Local repos (`src/data/local`)
`sessions`, `routines`, `customExercises`, `prefs`, `favourites`, `marks`, `bodyStats`, `goals`, `intake`, `photos`, `outbox`. Each: `list/get/put/remove`, every row has `client_id`, `updated_at`, `deleted_at?`. `exportAll({includePhotos?, now?})` / `importAll(fileOrJson)` use the shape in `docs/SYNC_SPEC.md` (named `exportAll/importAll` in Phase 6, per PHASES.md).

### Local store — Phase 6 (`src/data/local`, import from `src/data/repos` later or the barrel `src/data/local/index.ts`)
- Stores: `kv`, `meta` (key/value rows keyed by `key`); `sessions`, `routines`, `customExercises`, `favourites`, `prefs`, `marks`, `bodyStats`, `goals`, `intake`, `photos` (keyed by `client_id`, index `updated_at`); `outbox` (auto id, indexes `table`, `nextTryAt`). Schema version 1; migrations are an append-only array in `db.ts`.
- `Repo<T>`: `list({includeDeleted?, where?, since?})`, `get(id)`, `put(row)` (fills `client_id`, sets `updated_at`, clears `deleted_at`), `remove(id)` (soft delete: sets `deleted_at`, row kept). Deleted rows are hidden by `list`/`get`.
- Outbox: off by default (standalone writes nothing). `setOutboxEnabled(true)` makes `put`/`remove` append an outbox row in the SAME transaction. `photos` and `prefs` never queue. `OutboxRow {id, table, op: 'put'|'remove', client_id, payload, created_at, attempts, nextTryAt, status: 'pending'|'failed', reason?}`. `backoffMs(attempts) = min(2^attempts*5 s, 15 min)`.
- Backup: `{app:'shield-fitness-user', schema, exportedAt, tables, photos?}`; tables = all entity stores except photos, tombstones included; outbox/kv/meta never exported. `importAll` merges by `client_id` (incoming wins only if `updated_at` is newer), all in one transaction, throws `BackupError` (plain message) on a bad or newer-schema file. Photo rows hold a data URL in `data`.
- `requestPersist()` and `getQuota()` in `storage.ts` (never throw; unsupported returns false / zeros).

## Dataset (`src/dataset`)
`getExercise(slug)`, `searchExercises(q, filters)`, `getMachine(slug)`, `musclesOf(exerciseSlug)`, `variationsOf(slug)`, `alternativesPool(slug)`. Slugs are the only public ids. Missing mapping falls back per engines.md.

### Pure basics — built in Phase 12 (`src/shared/*`, no DOM, no clock, no fetch; data comes in as arguments)
- `slug.ts`: `slugify(text)`, `isSlug(s)`, `customSlug(name, takenSlugs) -> 'my-<kebab>'` (adds `-2`, `-3` on collision; empty name -> `my-exercise`).
- `units.ts`: `roundKg(n)` (2 dp), `kgToLb`, `lbToKg`, `formatPaise(intPaise)` (throws on a non-integer).
- `dates.ts`: `IST_OFFSET_MS`, `istDayKey(ms) -> 'YYYY-MM-DD'`, `dayKeyStart(key) -> ms`, `istDayStart(ms)`, `addDays(key, n)`, `daysBetween(a, b)`, `weekdayOfKey(key)` / `istWeekday(ms)` (0 = Mon), `istWeekStartKey(ms)`, `isDayKey`, `formatIst(ms)`, `parseIso(iso) -> ms | null`.
- `validators.ts`: `validateName`, `validateWeightKg`, `validateReps`, `validateSeconds`, `validateRpe`, `validateRepRange`, `validateMuscleId(id, has)` -> `{ok:true,value} | {ok:false,error:code}`; code text = `t('validation.<code>')`.
- `muscles.ts`: `buildTaxonomy(muscles) -> {ids, has, parentOf, childrenOf, expand}`, `rollUpMax(weights, tax)`.
- `weights.ts`: `muscleWeight(role, emphasis)` (accepts `p/s/t/m`, `h/m/l` or long names), `rowsToWeights(rows)`, `fallbackRows(primary, secondary, tax)`, `applyVariation(base, shifts)`, `shiftFor(table, variation)`, `exerciseWeights(rows, variation?, shiftTable?, setupInput?)`, `applySetup(base, setup, pattern, table, skip?)` (engines.md 13b: axes stack in order grip, width, handle, position, arms, bench; `pattern` rows plus `any` rows; one cap at 1.0 at the end; muscles in `skip` are untouched, which is how an exact variation row wins). `setupInput = {setup, pattern, table}` where `table` is `setup_options.json` `shift` and `pattern` is `setup_options.patterns[slug]`.
- `setup.ts`: `Setup` type + `SetupSchema` (zod 3, partial, strict, `angleDeg` 0-90), `parseSetup(unknown)`, `SETUP_AXES`, `SETUP_VALUES`.
- `i18n`: `t(key, params?)` replaces `{name}` placeholders.

### Runtime API — built in Phase 11 (`src/dataset/{loader,search,query}.ts`, `src/data/repos/exercises.ts`)
All async (chunks load lazily and once). Screens use `exercisesRepo` (it adds the user's custom exercises); `src/dataset/query.ts` takes them as `opts.custom`.
- `exercisesRepo.get(slug) -> {row, detail, muscles} | undefined`; `search(q, {machine?, category?, kind?, difficulty?, beginner?, track?, muscle?}) -> {row, score}[]` (empty q = browse A to Z; every token must match; typos per engines.md 14); `byMuscle(id) -> {row, weight}[]`; `byMachine(slug) -> row[]`; `musclesOf(slug) -> [id, role, emphasis, fallback][]`; `variationsOf(slug) -> string[]`; `getMachine(slug)`; `imageUrls(machineSlug) -> {url, variant, primary, w, h, alt}[]` (urls under `<BASE_URL>machines/<slug>/`).
- Row = `{slug, name, category, subCategory, kind, machine, primary[], difficulty, unilateral, beginner, tracks, warmup, chunk, custom}`; a custom exercise has `custom: true`, `category: 'custom'`, `chunk: -1`. `alternativesPool` is not built yet (Phase 15).
- Loader: `getManifest`, `getExerciseIndex`, `getMuscles`, `getMachines`, `getMedia`, `getMuscleMap`, `getVariationShift`, `getSubstitutions`, `getSupersets`, `getDetailChunk(n)`, `getDetail(slug)`, `warmDetailChunks()`, optional `getSetupOptions` / `getMachineReach` / `getSearchIndex` (null when the manifest lacks them), `setDatasetSource(src?)` (tests). A failed load is not cached.

### Compiled dataset files — frozen in Phase 7, built in Phase 9 (`npm run dataset`; manifest also carries `contract` = `contract/VERSION`, `version`, `counts`, `files`, `detailChunks`) (full detail: `docs/DATASET_RUNTIME.md`)
Output of `scripts/compile-dataset.mjs` (Phase 9) in `src/dataset/generated/`, named `<logical>.<hash8>.json`, found through `dataset.manifest.json`. Master list = `exercise_categories_all.csv` (634). Files:
- `exercises.index` `{cols,rows}`: `slug, name, category, sub_category, kind, machine, primary[], difficulty, unilateral, beginner, tracks (bitmask: beginner 1, intermediate 2, muscle_gain 4, athlete 8, fat_loss 16, strength 32, cardio 64), warmup, chunk`. Sorted by slug. Budget <= 120 KB gz (measured about 11 KB).
- `exercises.detail.<n>` (n = 0..10, 60 per chunk, sorted by slug): `{slug: {cues[], repMin, repMax, variations[], hint, cautions, tracks[], pattern, notes{muscleId: text}}}`. <= 12 KB gz each.
- `muscles` `{muscles[{id,name,parent,group,status,regions}], units[{unit,muscle}]}` (34 + 124). `machines` `{cols,rows}` (55, public id = `image_slug`). `media` `{machineSlug: [{file,variant,primary,w,h,alt}]}` (128).
- `muscle_map` `{slug: [[muscleId, role p|s|t|m, emphasis h|m|l, fallback 0|1]]}` (634 keys: 592 mapped + 42 compiled fallback, see below). `variation_shift` `{slug: {variationText: [[muscleId, 'm'|'l']]}}`. `substitutions` `{slug: slug[]}`. `supersets` `[{a,b,type,muscles[]}]`.
- Precached: manifest, index, muscles, machines, media, muscle_map, variation_shift, substitutions, supersets (about 38 KB gz in total, budget 60). Detail chunks and photos: cached on first view; detail chunks are also warmed once when idle (A43).
- Variations: six files read in a fixed order, deduped on `(slug, trimmed/collapsed/lower-cased text)`, first wins (today 4,752 in, 0 dropped). Shift rows join by exact variation text; an unmatched row is a compile error.
- Fallback (42 exercises with no map rows) is expanded at compile time: primary core id -> `p`/`m`, secondary -> `s`/`l`, core ids with detailed children expand to all children, `fallback = 1`. Same result as engines.md section 2.
- Search (Phase 11) is built from `exercises.index` plus `muscles` only: NFKD, strip marks, lower-case, split on non-alphanumerics; sorted-vocabulary prefix lookup; edit distance <= 1 (length 4-6) / <= 2 (length >= 7) over the vocabulary. Aliases and setup words arrive with `search.index.json` (Phases 10/20, optional input).

### Setup, search and reach data files — frozen in Phase 8 (formats: `contract/dataset/DATASET_GUIDE.md`, section "Phase 8 files")
Authored CSVs in `contract/dataset/`, read by the Phase 10 compiler (no app code reads them directly):
- `setup_rules.csv` (322 rules): `rule_id, keyword, axis, value, excludes, confidence, note`. Whole-word match on normalised text, trailing `s` ignored, `excludes` cancels. Produces `setup_options` (per exercise: the offered axis values) and a review report (untagged and `ambiguous` rows). Axis values are exactly engines.md section 13.
- `setup_muscle_shift.csv` (157 rows): `axis, value, applies_to, muscle_id, shift, physio_review, confidence, reason`. `applies_to` is a pattern picked from the exercise name (table in the guide): `pulldown, row, press, fly, reverse_fly, curl, pushdown, raise, any`. Feeds `applySetup` (Phase 13). Every row is `physio_review=yes`.
- `machine_companions.csv` (96 rows): `machine_name, kind (bench|attachment|mode), value, evidence (data|inferred), exercise_slug, label, note`. Feeds `machineReach` companions and modes (Phases 10, 23). A mode value `axis:value` is a setup mode of the same exercise.
- `search_aliases.csv` (621 rows): `alias, canonical, kind`. Feeds the optional `search.index` (Phase 10) and `fuzzySearch` (Phase 20).
- `REACH_GAPS.md`: gap list and suggested exercises; not data the app reads.
Compiled outputs, built in Phase 10 (same hash-named files and manifest as above; sizes gz: setup_options 6.1 KB, search.index 20.8 KB, machine_reach 5.5 KB):
- `setup_options` `{ vocab: {axis: value[]}, patterns: {slug: pattern}, exercises: {slug: {axis: value[]}}, shift: {axis: {value: {pattern: [[muscleId, 'm'|'l']]}}} }`. `exercises` lists only the options the variation rows offer (462 of 634 exercises; values in vocabulary order); `patterns` has the 193 exercises whose name matches the guide's pattern table; `shift` is `setup_muscle_shift.csv` (m = more, l = less). Feeds `applySetup` (Phase 13) and the setup picker (Phase 22).
- `search.index` `{ vocab: string[] (sorted tokens), cols: ['t','slug','name','alias','machine','muscle','setup','category'], docs: [[ 'e'|'m', slug, nameIds[], aliasIds[], machineIds[], muscleIds[], setupIds[], categoryIds[] ]], aliases: [[alias, canonical, kind]] (longest alias first), setupTerms: [[phrase, axis, value]] }`. Ids index `vocab`; token order inside a field is preserved (name order matters for the in-order bonus). 634 exercise docs then 55 machine docs, each sorted by slug. For machines the `machine` field holds the brand. Tokens come from `normText` (NFKD, strip marks, lower-case, non-alphanumerics to one space; tokens of length 1 dropped unless a digit), which Phase 12/20 must mirror in `src/shared`.
- `machine_reach` `{ muscles: string[] (the 28 muscle ids that appear in the map file), machines: { [machineSlug]: { n: exercises on the machine, all: Row[], filters: { 'bench:incline' | 'handle:rope' | 'position:seated' ...: Row[] }, bench: [[value, 1 data|0 inferred]], handle: [[value, evidence]], modes: [[value, exerciseSlug|null, label, evidence]] } } }` with `Row = [muscleId, reach 0-1 (2 dp), count of exercises reaching >= 0.3]`. Only muscles with reach > 0 are listed; `notReachable` = `muscles` minus the listed ids with reach >= 0.3 (wording "not reachable with current data").

## App shell, routes, flags (`src/app`) — Phase 4
- `ROUTES: RouteDef[]` with `{id, path, feature: string|null, component, tab?, devOnly?}`. `feature` is a key in `contract/features.catalogue.json`; `null` = core screen, never switched off. Paths are lowercase, relative to the base path. Registered now: `/`, `/body`, `/train`, `/library`, `/me`, `/exercise/:slug`, `/machine/:slug`, `/routine/:id` (routine_builder), `/muscle/:id` (muscle_lab), `/dev/design-preview` (dev only). A later phase replaces a route's `component` and adds routes here; nothing else registers routes.
- A route whose feature is off renders the 404 page.
- `resolveFeature(key)` / `useFeature(key|null)`: standalone value = catalogue `default`, forced false when `needsConnection`; unknown key = false. `setPolicyResolver((key, standalone) => boolean | undefined)` is the only place Phase 66 plugs in locks and user switches.
- `t(key)` from `src/i18n`; strings live in `src/i18n/en.ts`.

## PWA (`src/pwa`, `src/sw.ts`) — Phase 5
- `detectInstallState(env: InstallEnv): InstallState` is pure; `readInstallEnv()` is the only place that reads `navigator`/`matchMedia`. Order: installed, in-app-browser, unsupported (no service worker or IndexedDB), ios-safari/ios-other, android-promptable/android-other, desktop (no touch and width >= 768), anything else = android-other steps.
- Boot order in `main.tsx`: register the service worker, detect, then either the gate or (only when installed) dynamic import of the shell. Dev only: `?bypass-gate`.
- Service worker: precache = build output except `machines/`, `atlas/`, `version.json`; every navigation falls back to the precached `index.html`; `machines/` and `atlas/` are cached on first request (cache `sf-large-assets`). Message `{type:'SKIP_WAITING'}` activates a waiting worker.
- `version.json` = `{version, build}`; `build` is also compiled in as `__APP_BUILD__`. A different `build` triggers a worker update check on open and whenever the app becomes visible.
- Manifest: `id`/`start_url`/`scope` = base path, `display: standalone`, name "Shield Fitness", short name "Shield", icons in `public/icons/`.

## Stored JSON
Routine and Session JSON follow `contract/engines.md` shapes exactly; changing them is a contract change (Admin Phase 9 owns it).

### Frozen in Phase 14: stored shapes, suggestion scoring, list order, skip and alternatives
Docs only. Nothing here changes `contract/`: every point below is either the engines.md text made exact, or a choice where engines.md is silent (marked **[A]**, change only on the owner's word). The shapes are `engines.md` section 1 verbatim (`Ref, Item, Day, Routine, SetLog, SessionItem, Session, Setup, CustomExercise`, plus `Schedule` from section 16); Phases 15, 30-35 and 38 build against this section and must not add fields.

#### P14.1 Stored rows and field rules
- Each shape is stored as one local-store row (Phase 6): `client_id`, `updated_at` (ms UTC) and `deleted_at?` are added by the store, never by the shape. `client_id` = the shape's `id` (a `crypto.randomUUID()`). For a `Session`, `clientId` is written equal to `id` **[A]** (engines.md does not say what else it could be). A custom exercise's `id` is its row id; its `slug` is `my-<kebab>` from `customSlug()` (Phase 12) and never changes after creation.
- Times (`startedAt`, `endedAt`, `SetLog.doneAt`, `Schedule.startDate` as a day key) are ISO 8601 UTC strings ending in `Z` (`2026-11-19T04:30:00.000Z`); `startDate` is an IST day key `YYYY-MM-DD`. Weights are kg with 2 dp (`roundKg`), `null` weight or reps = not entered.
- `Ref`: `{kind:'lib', slug}` points at a dataset exercise; `{kind:'custom', id}` at a custom exercise row. A ref that no longer resolves (a deleted custom exercise) renders as "Removed exercise" and keeps its logged sets; it is never auto-deleted.
- `Item` has no id: its identity is its position in `Day.items`. `Day.id` and `Routine.id` are UUIDs. A `Day` may have `items: []`. `Routine.weekdays` is `[]` for flexible; `Routine.schedule` absent means "legacy weekdays[] behaviour". At most one routine has `active: true` (setting one clears the others, in the same write).
- `Item.supersetGroup` is a free string shared by the items of one pair (for example `"a"`); `tag` defaults to `normal`. `Item.variation` is the exact variation text from the dataset (the key used by `shiftFor`). `Item.setup` / `SessionItem.setup` validate with `SetupSchema` (Phase 13).
- Limits (soft = a gentle note, hard = the validator refuses): routine name 1-40 characters (RB; the Phase 12 name validator takes a max), custom exercise name 1-60; days 1-7 hard (RB); items per day 12 soft; `sets` 1-20, `repMin`/`repMax` 1-1000 with `repMin <= repMax` (Phase 12 validators), `restSec` 0-3600 **[A]**.
- `SessionItem.order` is a 0-based number, unique within the session, renumbered 0..n-1 after every add, remove or reorder. Every `status` change is allowed in any direction. `skipReason` is set when status becomes `skipped` and removed when it leaves `skipped`. `sets` are never deleted by a status change. A session may end with items `todo`; `endedAt` is the only "finished" marker.
- A `SessionItem` swapped by an alternative keeps its logged sets on the original (status stays as the user left it, normally `skipped`) and the replacement is a NEW item inserted at the original's `order + 1`.

#### P14.2 Scoring constants (the one table; code reads these names)
| Term | Value | Rule |
|---|---|---|
| `W_PRIMARY` | 3 | multiplies `primaryEmphasis(target)` |
| `W_SECONDARY` | 1 | multiplies `secondaryEmphasis(target)` |
| emphasis factor | h 1, m 0.6, l 0.3 | same as `muscleWeight` |
| `COMPOUND_MAIN` | +2 | category `compound` and slot `main` |
| `ISOLATION_ISO` | +1 | category `isolation` and slot `isolation` |
| `TRACK_FIT` | +1 | the user's track bit is set in the index `tracks` bitmask (beginner 1, intermediate 2, muscle_gain 4, athlete 8, fat_loss 16, strength 32, cardio 64) |
| `BEGINNER_FIT` | +1 | level `beginner` and index `beginner = 1` |
| `HARD_FOR_BEGINNER` | -1 | level `beginner` and `difficulty = 3` (both terms can apply to one row) |
| `FAVOURITE` | +2 | the exercise is a favourite |
| `RECENT` | -1.5 | the exercise appears in the user's previous session |
| `SKIPPED_OFTEN` | -1.5 | skipped in >= 3 of the last 5 sessions it appeared in |
| `SORE` | -2 | a `sore` mark meets the avoid test below |
| jitter | [-0.5, 0.5] | P14.3 |
Exact reading of the two emphasis terms **[A]**: the target is expanded to its detailed muscles (`chest` -> `upper_chest`, `lower_chest`; a detailed id stays itself). `primaryEmphasis` = the highest emphasis factor among the exercise's map rows for those muscles whose role is `p`; `secondaryEmphasis` = the same for role `s`. A stabiliser or mobility row gives 0 to both. An exercise with no map rows uses the section 2 fallback rows. A custom exercise uses its own `role`/`emphasis` (`primary` -> p, `secondary` -> s).
- **Slot** is an input: `main`, `isolation` or `none`. The tap-a-muscle list and alternatives pass `none` for lists and the skipped item's own category for alternatives (compound -> `main`, isolation -> `isolation`, else `none`) **[A]**; the day builder and "suggested next" pass the slot they are filling. With `none` both bonuses are 0.
- **Avoid test** (engines.md 6, one function for exclusion and for `SORE`): a muscle mark `m` meets an exercise when `m` (or, for a core id, any of its detailed children) is a primary row at medium or high, or a secondary row at high. `avoid` -> exclude; `sore` -> `SORE`. Hidden exercises, and exercises on a machine with status `maintenance` or `out_of_order`, are excluded (shown last with a badge only when the caller passes `showAll`). Mobility and stabiliser rows never meet the test.
- Score is rounded to 4 decimals. Order of equal scores: shorter name, then slug (same as search).
- Level is `beginner` or anything else; only `beginner` changes the score.

#### P14.3 Seeded jitter
`jitter(dayKey, slug) = round(fnv1a32(dayKey + "|" + slug) / 4294967295 - 0.5, 4)`. `dayKey` is the IST day key `YYYY-MM-DD` (Phase 12 `dates`); `slug` is the library slug or the custom `my-...` slug. `fnv1a32` runs over the UTF-8 bytes (all ASCII here): `h = 2166136261`; for each byte `h = ((h xor byte) * 16777619) mod 2^32`. Stable all day, new the next day, the same on every device and in both apps. Test vectors (Phase 15 must match): `fnv1a32("") = 0x811c9dc5`, `fnv1a32("a") = 0xe40c292c`, `fnv1a32("foobar") = 0xbf9cf968`. Real values: `jitter("2026-11-19","barbell-bench-press") = 0.1883`, `("2026-11-20","barbell-bench-press") = 0.0892`, `("2026-11-19","pec-deck-fly") = 0.3995`, `("2026-11-19","lat-pulldown") = -0.3894`. "Surprise me" uses `fnv1a32(dayKey + "|surprise|" + n)` (n = how many times the person has tapped it today, from 0) modulo the pool length, over the pool sorted by slug **[A]**.

#### P14.4 Worked examples for `scoreExercise` (date 2026-11-19; numbers from the real dataset)
| # | Exercise, target, slot, level, track | Terms | Score |
|---|---|---|---|
| 1 | barbell-bench-press, chest, main, intermediate, muscle_gain | 3x1 (lower_chest p h) + 0 + 2 + 1 (tracks 62 has bit 4) + 0.1883 | **6.1883** |
| 2 | dumbbell-bench-press, chest, main, beginner, beginner | 3 + 0 + 2 + 1 (tracks 31) + 1 (beginner flag) + 0.15 | **7.15** |
| 3 | pec-deck-fly, chest, isolation, beginner, muscle_gain | 3 + 0 + 1 (isolation) + 1 (tracks 7) + 1 + 0.3995 | **6.3995** |
| 4 | barbell-bench-press, triceps, main, intermediate, cardio | 0 + 1x1 (triceps s h) + 2 + 0 (tracks 62 has no bit 64) + 0.1883 | **3.1883** |
| 5 | incline-dumbbell-press, chest, main, intermediate, strength | 3x1 (upper_chest p h) + 0 + 2 + 0 (tracks 31 has no bit 32) + 0.1241 | **5.1241** |
| 6 | #1 with favourite and done last session | 6.1883 + 2 - 1.5 | **6.6883** |
| 7 | #1 with `sore` on chest and skipped often | 6.1883 - 2 - 1.5 | **2.6883** |
| 8 | #1 on the next day (2026-11-20) | jitter 0.0892 instead of 0.1883 | **6.0892** |
| 9 | wide-grip-pull-up, lats, main, beginner, beginner | 3x0.6 (lats p m) + 0 + 2 + 0 (tracks 30 has no bit 1) - 1 (difficulty 3, no beginner flag) + 0.0091 | **2.8091** |
| 10 | lat-pulldown, lats, main, beginner, beginner | 3 + 0 + 2 + 1 (tracks 31) + 1 - 0.3894 | **6.6106** |
Exclusion examples (no score): `avoid` lower_chest or chest excludes barbell-bench-press (lower_chest is p h); `avoid` triceps ALSO excludes it (triceps is s h); `avoid` triceps does NOT exclude incline-dumbbell-press (triceps is s m). A `sore` mark on biceps does not touch lat-pulldown (biceps is s m, below the secondary-high bar). Ties: two rows at 5.4000 order by shorter name, then slug.

#### P14.5 Tap-a-muscle list order (`muscleExerciseList`, engines.md 8)
Candidates for a muscle = every exercise with a non-mobility map row for it (the same set as `byMuscle`, Phase 11; a core id includes its children), after the filters (machine, category, kind, difficulty, track, unilateral, beginner-friendly, injury-safe) and the exclusions in P14.2. Slot = `none`. Each exercise appears once, in the first section it qualifies for:
1. **Suggested for you**: the 6 highest scores.
2. **Built for you**: candidates not in section 1 that are in `builtSlugs` (the caller passes the exercises of the active routine, this week's days when Phase 32 exists, gym programs, favourites and the user's custom exercises), ordered by score.
3. **More**: everything else, ordered by jitter descending, then slug (day-seeded, so the order is stable all day).
Fewer than 6 candidates simply fills section 1 and leaves the others empty. Hidden sections are not drawn. "Surprise me" picks from sections 1 + 2 + 3 concatenated and sorted by slug (P14.3), after filters.
Worked example (chest, beginner, track beginner, 2026-11-19, favourite = barbell-bench-press, routine has dumbbell-bench-press and incline-dumbbell-press): 101 candidates. **Suggested**: standing-cable-chest-press 5.401, pec-deck-fly 5.3995, smith-machine-bench-press 5.3875, resistance-band-chest-press 5.3793, suspension-chest-press 5.3286, incline-chest-press-machine 5.2896. **Built**: barbell-bench-press 5.1883 (3 + 0 + 0 + 2 favourite + 0.1883; it is not in the top 6, so it falls here), dumbbell-bench-press 5.15, incline-dumbbell-press 5.1241. **More**: 92 rows, first by jitter on that day: cable-front-raise (0.4977), stability-ball-dumbbell-chest-press (0.49), cable-bench-fly (0.4881), close-grip-barbell-bench-press (0.4863). On 2026-11-20 the order of More changes (resistance-band-overhead-press 0.4891 first). Surprise me, first tap of the day: pool of 101 sorted by slug, index `fnv1a32("2026-11-19|surprise|0") mod 101` -> push-up; second tap -> resistance-band-chest-press.

#### P14.6 Skip reasons and what each one does
`skipReason` is one of `busy`, `pain`, `no_time`, `too_hard`, `other`. The sheet asks for it; "Just skip" sets status `skipped` with no `skipReason` (the field is optional in the shape).
| Reason | Candidate filter | Score adjustment (added to `scoreExercise`) **[A]** |
|---|---|---|
| `busy` | drop candidates on the skipped item's machine (a skipped exercise with no machine drops nothing); "Mark busy" also hides that machine's other exercises for the rest of this session | none |
| `pain` | the person picks an area (Body Picker, one tap; default = the item's primary muscles); apply the P14.2 avoid test to that area and drop matches, session only; offer to save the mark | +0.5 per difficulty step below the item's difficulty |
| `no_time` | none | +1 for category `isolation` (single-joint) |
| `too_hard` | keep only `difficulty <=` the item's difficulty | +0.5 per difficulty step below the item's difficulty |
| `other` | none | none |
The adjustments are mine (engines.md says only "prefer"); the dataset has no per-exercise set count, so "fewer-set" is not scored.

#### P14.7 Alternatives (`alternativesFor`, engines.md 9)
Input: the skipped `SessionItem`, the reason (and area for pain), marks, machine statuses, policy, level, track, day key. Output: up to 5 candidates, never applied automatically. Candidate = `{kind:'variation', slug, variation}` (the same exercise with another variation text) or `{kind:'exercise', ref}`.
Pools, in this order **[A: pool order wins over a global score sort, as FLEXIBLE_SESSION.md describes]**:
1. **Same family**: the exercise's other variation texts (`variationsOf`, deduplicated, minus the item's current `variation`). A variation candidate scores as its own exercise and keeps data order on ties. Dropped for `busy` when the exercise has a machine (same machine), and dropped for `pain` when the exercise itself meets the avoid test.
2. **Same primary muscle + same movement pattern + same category**: "same primary muscle" = the skipped exercise's first index `primary` id is the candidate's first `primary` id; pattern = the detail `pattern` string; category = index `category`.
3. **`substitution_groups`** alternatives (the compiled `substitutions` file).
4. **Same primary muscle**, any pattern and category.
Rules: each pool is filtered (P14.6, plus the P14.2 exclusions: hidden, avoid marks, machine status), sorted by adjusted score (ties: shorter name, then slug), and appended; an exercise already offered or equal to the skipped one is skipped; stop at 5. Slot for scoring = the skipped item's category (P14.2). An empty result shows "No safe alternatives" and "Just skip" (a one-candidate result still shows "Just skip").
Worked examples (beginner, track beginner, 2026-11-19; pool sizes before filtering for lat-pulldown are 17 / 9 / 3 / 17):
- **busy**, skipped lat-pulldown (machine `lat-pulldown`): pool 1 is dropped (same machine). Pool 2 gives, in score order, plate-loaded-front-pulldown 7.2465, resistance-band-lat-pulldown 7.1312, kneeling-single-arm-cable-pulldown 6.6862, assisted-pull-up 6.2787, half-kneeling-cable-pulldown-straight-bar 5.3557. That is already 5, so pools 3 and 4 are not reached.
- **pain**, area biceps, skipped lat-pulldown: biceps is s m on it, so it does not meet the avoid test and pool 1 stays: the first five variations, each scoring 6.6106 (the exercise's own score), in data order: "Wide pronated grip", "underhand shoulder-width grip (more biceps)", "neutral grip with a MAG handle", "curved lat bar", "single-arm with a D handle". With area lats, lat-pulldown meets the test (lats p h), so pool 1 is dropped, and 16 of the 17 other exercises with lats as first primary muscle meet it too (pools 2-4); the one survivor is foam-roller-lat-roll (its lats row is mobility, which never meets the test), pool 4, score 2.4633 (0 + 0 + 0 + 1 track + 1 beginner + 0.4633 jitter, +0 for difficulty 1 vs 1). So the sheet shows that one candidate and "Just skip".
- **no_time**, skipped lat-pulldown: pool 1 first five, 6.6106 each (variations are not isolation, so no +1).
- **too_hard**, skipped wide-grip-pull-up (difficulty 3): pool 1 has 4 variations (2.8091 each): "Slightly wide vs very wide grip", "Pause at the top", "Slow lowering (3 s)", "Use the assistance pin to finish extra reps". Pool 2 then gives one more: plate-loaded-front-pulldown 8.2465 (difficulty 1 <= 3, with +1.0 for two steps easier). Total 5. Pool 3 is empty for this exercise.

#### P15 Implementation notes (Phase 15, `src/shared/suggest/`)
- `jitter.ts`: `fnv1a32`, `jitter(dayKey, slug)`, `surpriseIndex(dayKey, n, length)`. `score.ts`: constants (`W_PRIMARY` ... `SORE`, `TRACK_BITS`), types `Candidate`, `ScoreContext`, `ScoreResult`, functions `scoreExercise(candidate, target, slot, ctx) -> {score, parts, excluded?, unavailable?}`, `meetsMark`, `emphasisFor`, `slotForCategory`. `rank.ts`: `rankCandidates(candidates, target, slot, ctx, signals?) -> Ranked[]` (excluded rows dropped, unavailable last), `compareRanked`, `reasonsFor`. `list.ts`: `muscleExerciseList(candidates, target, ctx, {builtSlugs, filters, signals}) -> {suggested, built, more, unavailable}`, `surpriseMe(list, dayKey, n)`. Nothing imports the dataset or the store: the caller builds `Candidate` rows (index row + map rows; `tracks` 0 for custom) and a `Taxonomy`.
- Reason codes (engines.md 25; the selection rules are mine **[A84]**, tune by constant): priority `progress_ready, recovered, neglected, in_routine, built_by_you, favourite, same_variation, balances_week`; the first 2 that apply are returned. `recovered`: target rested >= 3 whole days (`RECOVERED_DAYS`). `neglected`: < 3 working sets on the target this week (`NEGLECTED_SETS`). `built_by_you`: a custom exercise or in the caller's built set. `balances_week`: the target has under 50% of the average sets of the muscles trained this week, needs >= 3 trained muscles (`BALANCE_SHARE`). A reason is `{code, muscle?, days?}`; the sentence text comes from `docs/EXTRAS.md` through `t()` later. A missing signal gives no reason.
- Fixtures: `contract/fixtures/suggest_score.json` (19 cases: the 10 Phase 14 scores + exclusions), `suggest_list.json` (the real chest list, 101 candidates embedded), `suggest_jitter.json`, `suggest_reasons.json` (10 cases).

#### P14.8 Which engines.md [A] values stand
All stand unchanged, for Phases 15 onwards: section 2 fallback and stabiliser x0.5; section 3 multipliers; section 5 recovery targets (72/48/36 h) and state thresholds; section 6 avoid/sore rules; section 7 weights, bonuses and penalties, and the jitter range; section 8 three-section order and top 6; section 9 pool order and "up to 5"; section 10 slots and split-label map (Phase 33 builds it; Phase 28 may refine day-count handling in `docs/ROUTINE_BUILDER.md` only). No change to `contract/` was needed, so no copy to the Admin zip is required by this phase. The Phase 14 jitter, slot and reason-adjustment choices live only here; if Admin later needs the same suggestion output, it must read this section or the owner moves it into engines.md (a contract change).

## Gym link (`src/data/gym`) — Phase 65+
`connect(config)`, `disconnect()`, `login(code, password)`, `syncNow()`, `getPolicy()`, plus read hooks for membership, attendance, inbox, programs. Table and function names come from `contract/connected-api.md` only.

## Phase 18 notes: Muscle Lab (UI only, no new contract)
- **P18.1 Rows read by the lab (assumptions, see PHASE_STATUS A-P18.1):** favourites `{slug}`; marks `{muscle, kind: 'avoid'|'sore'}`; routines as engines.md section 1. Read through `src/data/repos/lab.ts` (`loadLabData()` returns candidates, map rows, taxonomy, machines, reach, person, machine status); screens never import the loader or the store.
- **Pure helpers** in `src/pages/body/labData.ts`: `labList(candidates, target, tax, dayKey, person, filters, machineStatus)` = Phase 15 `muscleExerciseList` plus person signals; `countByMuscle`, `filterChoices`, `workedRows` / `emphasisOf`, `machineFinder` (strongest reach weight, then exercise count, then name; machines in maintenance or out of order skipped), `machineWorkedRows`.

## Phase 19 notes: Library (UI only, no contract change)
- **URL is the state:** `/library?tab=machines&q=&cat=&sub=&kind=&diff=1|2|3&beginner=1&uni=1&machine=<slug>&mcat=<category>`. Defaults are left out; unknown or malformed values are ignored (`parseLibraryUrl` / `serializeLibraryUrl` in `src/pages/library/libraryState.ts`). Typing replaces the history entry (no back-button spam).
- **Equipment mode** (`src/shared/equipment.ts`): `EquipmentPreset = gym | bodyweight | dumbbells | bands | home`; `allowsMachine(preset, machineSlug)`; exercises with no machine are always allowed; `gym` allows everything. It only filters. Stored as prefs row `client_id 'equipment-preset'` `{value}`; recent searches as prefs row `'library-recents'` `{list: string[]}` (max 8). Prefs never reach the outbox. Later phases (suggestions, day builder, swaps) read the preset through `getEquipmentPreset()` in `src/data/repos/library.ts`. The preset table is an assumption (A-P19.2) until Phase 24 authors `equipment_presets.csv`.

## Phase 20 notes: fuzzy search (no spec text changed; fixtures added to `contract/fixtures/`)
- `src/dataset/fuzzy.ts` (pure): `parseRawIndex(raw)`, `buildFuzzyIndex(raw, extraDocs?)`, `expandQuery(index, q)`, `fuzzySearch(index, q, {accept?})` -> `{hits: {type:'e'|'m', slug, score}[], tokens, suggestedSetup?: {axis, value}, didYouMean?}`. Empty query returns no hits (browsing stays with `runSearch`).
- `src/dataset/query.ts`: `fuzzyExercises(q, filters, {custom})` -> `{hits: SearchHit[], machines: string[], suggestedSetup?, didYouMean?}`; same filters as `search`; custom exercises are added as extra documents; falls back to the Phase 11 `search` when `search.index.json` is missing or the query is empty. `exercisesRepo.fuzzy` is the UI entry.
- Ranking is engines.md 14 steps 1-5. Choices not in the spec: aliases are applied to the query in one pass, longest phrase first, all alias kinds; setup words are also read from the words as typed (an alias may rewrite them); `grip`, `handle`, `width`, `stance`, `position` next to a setup word are optional; a setup word is required unless that finds nothing (then it is a bonus only); a word that is a known word, a digit, or the start of a known word is never a typo; `didYouMean` swaps each unknown word for the closest known word (edit distance within the allowance; ties go to the word used in more names/aliases) and is shown only when the corrected query finds something.
- `suggestedSetup` is the first setup word in the query that the top exercise offers (all its tokens are in the exercise's `setup` tokens). Axis for an ambiguous word (`incline` = position or bench) is the first axis in `setupTerms`. Tapping the chip opens `/exercise/<slug>?setup=<axis>:<value>`; Phase 21/22 must read `?setup=`.

## Phase 21 notes: exercise page + machine page (UI only, no contract change)
- `youtubeSearchUrl(name)` = `https://www.youtube.com/results?search_query=` + the words of `<name> exercise form` each `encodeURIComponent`-ed, joined by `+`. `resolveYoutubeUrl(name, {policy, custom})`: policy override > the user's own link (custom exercise `youtubeUrl`) > the search url. An override is used only if it parses as an `http(s)` url (never `javascript:` / `data:`). Opens with `target=_blank rel="noopener noreferrer"`. Feature `youtube_links`.
- `galleryPhotos(imageUrls, max=4)`: primary thumb first, then other angles; the detail url is paired by file stem (`x.thumb.webp` <-> `x.detail.webp`), else the thumb. Feature `machine_photos` off = text-only layout.
- `groupMuscles(rows, notes)`: Primary / Secondary / Stabiliser lists, strongest emphasis first, mobility rows left out, a muscle listed once under its strongest role. A dataset note containing `contested`, `unconfirmed` or `mixed` marks the line "Evidence is mixed".
- `loadExercisePage(slug)` -> `{row, detail, muscles, machine?, photos?, shift, substitutes, easier?, harder?, customYoutube?, variation?, cueDismissed}`. `loadMachinePage(slug)` -> `{machine, photos, exercises}`.
- Device prefs (`prefs` store, never synced): `exercise-variation:<slug>` (value = chosen variation, `''` = none; tapping it again clears it) and `form-cue-dismissed:<slug>` (value `true`). Phase 22 reads the variation for logging.
- `setYoutubePolicyResolver(fn)`: hook for the connected-mode gym override (no resolver set yet).
- Easier / harder: same category and sub-category, shares a primary muscle, nearest lower / higher `difficulty` (custom exercises have none).

## Phase 22 notes: setup picker (UI only, no contract change)
- `parseSetupData(raw)` narrows the compiled `setup_options.json` to `{exercises, patterns, shift}`; malformed = `null` (picker hidden, weights unchanged).
- `offeredAxes(offer)`: axes in UI order (grip, width, handle, position, arms, bench), only those the exercise offers, values in vocabulary order. `cleanSetup(setup, offer)` drops anything not offered; `{}` = the default.
- `setupWeights(rows, variation, shiftTable, data, slug, setup)` = Phase 13 `exerciseWeights` with the exercise's setup pattern; default or no data = the plain weights. `setupEffect(base, withSetup)` -> `{more, less}` muscle ids (wording: "Tends to emphasise ...", never a promise).
- Device prefs: `exercise-setup:<slug>` (value = a `Setup`; invalid reads as `{}`), `separate-pr-by-grip` (boolean, default false). Neither is synced.
- `itemFields(exercise, variation, setup)` = what a routine item / logged set stores: `setup` is omitted for the default. `prKey(slug, setup, separate)` = `slug` or `slug#grip:<grip>`.
- The library chip url `/exercise/<slug>?setup=<axis>:<value>` is read by the exercise page (A-P20.4 done) and overrides that one axis of the remembered setup.
- Feature `setup_options` off: no picker, setup ignored in the page's muscle effect.

## Phase 23 notes: Machine Lab (UI + two fixture files, no spec text change)
- Reads the Phase 10 `machine_reach` file; shape unchanged. No chip = `entry.all`; one chip = `entry.filters['axis:value']`; two or more chips (one value per axis: bench, handle, position) are computed at runtime by `computeRows` with the compiler's own rules (A59: role x emphasis, simplified shift, cap 1.0, 2 dp, count >= 0.3). A test proves the runtime result equals the compiled table for all 55 machines, no chip and every one-chip filter.
- A combination keeps only exercises whose setup offers every chosen value; a chosen value no exercise offers (for example Cable Crossover + rope) gives zero rows and the "Not reachable with current data" state.
- Heat band = `ceil(reach * 5)` (0.2 steps, 0 = none, 1.0 = 5). Strength words for the text twin: >= 0.8 strong, >= 0.5 moderate, >= 0.3 light, else faint.
- Exercise list for a tapped muscle: dataset exercises on the machine whose weight for the muscle (core ids expand to children) is >= 0.3, strongest first, then slug. With a chip on, the setup shown is the chosen chips; with none, it is the single bench/handle/position value that raises that exercise's weight most (or none).
- Fixtures `contract/fixtures/reach_table.json` (compiled rows, 5 machines) and `reach_combo.json` (5 runtime cases) were produced by an independent script, which also matched the compiled table for every machine and filter.
- Routes: `/machines` and `/machines/:slug/lab` (feature `machine_lab`); the older `/machine/<slug>` page stays and links to the lab.

### Frozen in Phase 24: movement data shapes (the renderer API itself is Phase 25's)
Types Phase 25 reads from `contract/dataset` (compiled or imported as is; the compiler change, if any, is Phase 25's):
```ts
type JointName = 'neck'|'shoulder_l'|'shoulder_r'|'elbow_l'|'elbow_r'|'hip_l'|'hip_r'|'knee_l'|'knee_r'|'ankle_l'|'ankle_r'|'torso_lean';
type Pose = Record<JointName, number>;            // whole degrees, conventions in MOVEMENT_PATTERN_NOTES.md
interface MovementPattern { id: string; name: string; view: 'side'|'front'; anchor: 'feet'|'seat'|'back'|'hands'|'hands_feet'|'hang'|'hips_pad';
  start: Pose; end: Pose; pathHint: string; glyph: string; armWorld: 'up'|'down'|'none'; defaultParam: string;
  twinStart: string; twinEnd: string; coachReview: true; notes: string; }
interface PatternMapRow { slug: string; patternId: string; source: 'rule'|'manual'; param: string }  // param: "key=value;key=value"
type PatternParamKey = 'bench_deg'|'torso_lean'|'grip_width'|'stance_width'|'seated'|'kneeling';
```
- Lookup: `movementFor(slug) -> { pattern, params } | null` (null = unmapped, show the plain muscle map). A custom exercise stores `patternId` and `param` itself (A-P24.4).
- Rule order, modifier rules, confidence meanings and the param effects are in `contract/dataset/MOVEMENT_PATTERN_NOTES.md`; nothing else defines them.
- Equipment presets: `equipment_presets.csv` (`preset_id, label, machine_names, machine_categories, includes_no_machine, note`); until a phase reads it, `src/shared/equipment.ts` holds the same table.

### Built in Phase 25: movement map renderer
- Compiled file `movement.<hash>.json` (lazy, optional, 7.8 KB gz, budget 20 KB): `{ joints: JointName[12], patterns: { id: { name, view, anchor, start: number[12], end: number[12], path, glyph, armWorld, defaultParam, twinStart, twinEnd } }, map: { slug: [patternId, param?] } }`. `getMovement()` in the loader; `parseMovementData(raw)` narrows it (malformed = `null`, the plain muscle map shows). The compiler errors on an unknown pattern, an unknown slug or a joint missing from a pose.
- `src/data/repos/movement.ts`: `loadMovementData()`, `movementFor(data, slug) -> { pattern, param } | null` (null = unmapped), `loadMovementFor(slug)`.
- `src/shared/movement.ts` (pure): `parseParams(text)` keeps only the six allowed keys with in-range values; `resolvePoses(pattern, param, setupParams?)`; `paramsFromSetup(pattern, setup)` (bench / incline / decline / lying -> `bench_deg`, seated -> `seated`, kneeling -> `kneeling`, wide / narrow -> `stance_width` for squat-like patterns, else `grip_width`; only keys the pattern understands); `buildFigure(pattern, param, { sex, setupParams, name, machineCategory })` -> `{ poses, placed, fit, arcs, arrow, glyph, twin }`.
- Maths (A-P25.1): y up, facing +x, trunk direction = 90 - torso_lean, thigh = trunk - hip, shin = thigh - (180 - knee), foot = shin + (180 - ankle), upper arm = trunk + 180 + shoulder, forearm = upper arm + (180 - elbow). Front view: angles measured from straight down, outward then up. The anchor point is the same in start and end; one scale fits both poses in 400 x 300 (max 2.2).
- Components: `MovementFigure`, `MovementSection`, `MiniMovement`, `PatternPreview` (see PROJECT_STRUCTURE). Feature key `movement_map` gates the exercise page and machine page blocks.
- Fixture: `contract/fixtures/movement_poses.json` (self-generated, 0.5 px).

## Phase 26 notes: favourites, hide, notes, go-tos (no `contract/` change)
- Stored row (the `favourites` store, one row per exercise): `{ client_id: 'ex:<slug>', slug, favourite, hidden, note }`. Replaces the P18.1 reading of a favourite as a bare `{slug}`; a legacy `{slug}` row with none of the three fields still reads as a favourite. A row with nothing set is removed (soft delete).
- Rules (`src/shared/personal.ts`): favourite and hidden never both stay on (setting one clears the other); note is trimmed, line breaks kept, at most 500 characters, longer is refused (nothing saved).
- Hidden means: not in Library search or counts, not in the Muscle Lab / suggestion lists (`ScoreContext.hidden`), not offered as Easier, Harder or a substitute. It stays readable by slug (exercise page, history). A "Hidden exercises (n)" view in the Library lists them so they can be shown again.
- `easierHarder(row, all, hidden?)` takes an optional hidden set (rule otherwise unchanged from Phase 21).
- No feature key: the catalogue has no key for favourites/notes (`contract/` is read-only here), so these are core, like the exercise page itself.

## Phase 27 notes: custom exercise creator (no `contract/` change)
- Stored row (the `customExercises` store): engines.md `CustomExercise` (`id` = `client_id`, `name`, `slug` `my-<kebab>`, `kind`, `machineSlug` or null, `muscles[{id, role, emphasis}]`, `repMin`, `repMax`, optional `youtubeUrl`, `notes`) plus the optional extras `patternId` and `param` (the movement pattern and its `key=value;key=value` setup, A-P24.4). Extra fields are ignored by the dataset query layer.
- `src/shared/customExercise.ts`: `validateCustom(draft, ctx)` returns `{ ok: true, value }` or `{ ok: false, errors }` with one code per field (`name`, `kind`, `machine`, `muscles`, `reps`, `youtube`, `notes`). Codes: name `name_empty`, `name_too_long`, `name_taken`; muscles `muscle_unknown`, `muscle_twice`, `muscle_primary_needed`; reps `reps_invalid`, `range_order`; youtube `url_not_https`, `url_invalid`, `url_not_youtube`; `notes_too_long`; `machine_unknown`; `kind_invalid`. Screens show `t('cx.err.<code>')`, else `t('validation.<code>')`.
- `validateYoutubeUrl`: empty is allowed; otherwise https, no user info, host `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`; returns the normalised `href`.
- Duplicate-name guard: `nameKey` (lower case, accents and punctuation removed, spaces collapsed); `takenNames` = all dataset names + the other custom exercises (never the one being edited).
- Repo `src/data/repos/customExercises.ts`: `saveCustom(draft, editingSlug?)` -> `{ ok: true, slug }` or `{ ok: false, errors }` (an unknown `editingSlug` gives `name: 'not_found'`); `getCustom(slug)`, `listCustom()`, `deleteCustom(slug)` (soft). Editing keeps `client_id` and `slug`.
- Merge: unchanged from Phase 11 (`exercisesRepo` passes the custom rows into every query); a saved exercise is found by `search`, `fuzzy`, `byMuscle`, `byMachine`, `get`, `musclesOf`. Muscle weight uses the Phase 12 rule on the stored role and emphasis (primary/high 1.0, secondary/medium 0.6, stabiliser/low 0.15).
- `ExercisePageData.customPattern?: { patternId, param }` feeds the movement figure for a custom exercise.
- Routes: `/library/new`, `/exercise/:slug/edit`, feature key `custom_exercises`.

## Phase 29 notes: schedule data (docs only, no `contract/` change)
- `Schedule` is exactly `contract/engines.md` section 16. Extra, local-only field on the routine document: `scheduleMeta: { anchorDate?: string; deloadWeeks: string[] }` (A/B anchor, ISO start dates of deload weeks). Not part of the contract; other readers ignore it (A-P29.2). Syncing it to the gym app would be a later contract change.
- Rotation pointer: derived from the sessions store (last finished Day index + 1), not stored. Per-date overrides ("Move here", "Rest") are stored locally as `{ date, dayId | 'rest' }` list on the routine document (A-P29.4).
- Engine (Phase 32): `nextDayFor({ schedule, days, today, sessions, missedMode, recoveryStates, scheduleMeta })` -> `{ kind: 'T'|'A'|'M'|'R'|'open'|'none', dayId?, missed?: { dayId, date }[], hint?: { fatigued: string[] }, deload: boolean }`. Pure, `today` is a parameter. Settings keys (Phase 32): `schedule.hintsOn` (default true), `schedule.missed` (`'shift'|'skip'`, default `'shift'`), `schedule.weekStart` (`'mon'|'sun'`), `schedule.deloadSets` (60), `schedule.deloadLoad` (90).

## Phase 30 notes: routine setup (no `contract/` change)
- Shapes: `Routine`, `RoutineDay`, `RoutineItem` in `src/shared/routine.ts` follow `contract/engines.md` section 1. One local extra: `archived?: boolean` (not in the contract; hidden from the list, nothing sets it yet).
- `createRoutine(input, makeId, takenNames)` -> `Result<Routine, 'name_too_long'|'days_range'|'weekday_invalid'|'split_unknown'>`. `input = { name, days: 2..7 | 'flexible', weekdays: number[], splitStyle }`. Flexible = 3 days, `weekdays: []`. Blank name -> "My routine", "My routine 2"... Name limit 40 (Phase 28). Weekdays are sorted and de-duplicated; they need not match the day count. Days get `makeId()` ids, empty `items`, `targetMuscles` from `SPLIT_TABLE`.
- `splitDays(style, count)` -> `{ days: {label, muscles}[], cycled }`: PPL and Upper/Lower repeat to fill (`cycled` true); Full body is "Full body A, B, C..."; Bro takes the first N of Chest, Back, Shoulders, Arms, Legs, Core and cardio, Mobility; Custom is blank "Day 1..N".
- `validateRoutine(r)` -> list of `RoutineProblem` (name, days per week 1-7, weekdays, 1-7 days, unique non-empty day ids, non-empty day names). `cloneRoutine(r, makeId, takenNames)`: new ids, "<name> copy" (then "copy 2"), inactive, `mine`, deep copy.
- Repo `src/data/repos/routines.ts`: a routine's `id` is its row `client_id`. `createAndSave` makes the routine active when it is the first live one. `setActiveRoutine` switches the others off. `deleteRoutine` is a soft delete and returns the routine for `restoreRoutine` (Undo).
- Routes: `/routines`, `/routine/new` (both `routine_builder`); `/routine/:id` is still the Phase 1 placeholder (Phase 31).

## Phase 31 notes: week view and day editor (no `contract/` change)
- `src/shared/routineEdit.ts` (pure). Items: `addItem` (3 x 8-12, rest 90 s, never blocked), `removeItem` (returns the item; a superset left alone is unlinked), `insertItem` (Undo), `moveItem(list, from, to)` (also used for days), `validateItemPatch(base, patch)` -> `Result<RoutineItem, 'sets_range'|'rep_range'|'rep_order'|'rest_range'|'note_too_long'>` (sets 1-10, reps whole 1-100 with min <= max, rest 15-600 in steps of 15, note <= 500).
- Supersets reuse `RoutineItem.supersetGroup` and `tag: 'superset'`: `linkSuperset(items, a, b, makeGroup)` (joins b's group, pair placed side by side), `unlinkSuperset`, `supersetLabels` (A, B, C by first appearance).
- Days: `addDay` (max 7, `daysPerWeek` follows the day count), `removeDay` (never the last; returns day + index for Undo), `restoreDay`, `moveDay`, `updateDay`, `validateDayName`, `renameRoutine(r, name, takenNames)` -> `name_empty|name_too_long|name_taken`.
- Volume: `dayVolume`/`weeklyVolume(r, lookup)` = sets x muscle weight (engines.md section 2: emphasis h 1 / m 0.6 / l 0.3, stabiliser x0.5), 1 dp, over the muscle ids the dataset gives. `overloadHints(r, lookup)` -> `back_to_back` (a muscle with >= 4 weighted sets on two consecutive days, last day -> first day counts) or `weekly_cap` (> 20 weighted sets a week); one hint per muscle. Constants `WEEKLY_SET_CAP`, `BACK_TO_BACK_SETS` are [A-P31.2]. `estimateMinutes(items)`: sets x (45 s + rest), rounded up to 5 min.
- Repo `src/data/repos/routineEdit.ts`: `loadExInfo(refs)`, `lookupFrom(info)`, `searchPicks(q)`, `goodFor(muscles)`, `refFor(pick)`, `machineThumb(slug)`. Routine reads/writes still go through `routines.ts` (`putRoutine` per change = autosave).
- Routes: `/routine/:id` (week) and `/routine/:id/day/:dayId` (day), both `routine_builder`.

## Phase 32 notes: scheduler (fixtures added to `contract/`, no spec text change)
- `src/shared/schedule.ts` implements `contract/engines.md` section 16 as read in `docs/SCHEDULER.md` (Phase 29). Everything takes `today` as a parameter. `weekCells(input, n)` gives the next dates with a kind (`T` `A` `M` `R`, `open` for floating, `none` for no schedule); training dates take Days in rotation from `pointer` (not tied to the weekday). `todayPlan` gives the Today card state; `missedDays(input, since)` the planned dates before today with no session and no decision (only weekdays, cycle and A/B can miss); `restHint` the >= 60% fatigued rule; `rankDays` readiness ranking (fresh 3, ready 2, recovering 1, fatigued 0, ties by rotation).
- Stored on the routine: `schedule` (contract shape) and local `scheduleMeta { anchorDate?, deloadWeeks[], savedOn? }` (A-P29.2; `savedOn` is [A-P32.1]: the lower bound for missed days and the A/B fallback anchor).
- Device-only prefs rows: `schedule-settings` (`hints`, `missed` shift|skip, `weekStart` mon|sun, `setsPct` 40-100, `loadPct` 70-100, steps of 5) and `schedule-state:<routineId>` (`pointer`, `overrides` date -> rest|train, `decided` dates, `hintDone` dates, `welcomeDone`). **Phase 34 must move `pointer` when a session ends** and must fill `startedAt`/`endedAt` on session rows (`readSessionDates` reads them).
- Recovery: `readRecoveryStates()` returns `{}` until Phases 48/49 replace it. With `{}` no readiness line and no rest-day hint is shown, floating uses rotation.
- Deload: `deloadSets(sets, pct)` and `deloadLoad(kg, pct)` are for the logger to pre-fill (Phase 38); they never change the routine's sets. `isDeloadWeek(meta, date, weekStart)`.
- Routes: `/routine/:id/schedule` and `/settings/schedule` (`rest_scheduler`); Home (`/`) shows the Today card (`today_card`); the hint obeys `rest_suggestions` and the Settings switch.

## Phase 33 notes: day builder (fixtures added to `contract/`, no spec text change)
- `buildDay(spec, pool, ctx) -> BuildResult` and `quickWorkout(input, pool, ctx) -> BuildResult` (`src/shared/dayBuilder.ts`). `spec = { muscles, minutes, equipment?, rampNote? }`; the pool is `BuildCandidate[]` (a suggestion `Candidate` plus `subCategory` and `warmup`); `ctx` is the Phase 15 `ScoreContext` (marks, hidden, favourites, machine status, day key, level, track). Result: `{ entries: BuildEntry[], seconds, limitSec, model, reason? }`. An entry is a slot, a slug, sets, rep range, rest, optional note and superset `group`; `entriesToItems` turns entries into normal routine items.
- Time: day model sets x (45 s + rest); quick model sets x (reps x 3 s + rest + 20 s), reps = the top of the range. Total never above the box. Minutes are clamped to 10-120.
- Slots, in order: warm-up (category `warmup` or `also_usable_as_warmup`, touching a target muscle), main (compound, target as primary), isolation, finisher (category `other`, sub-category conditioning / cardio machine / plyometric), cooldown (category `recovery`, touching a target muscle). The cooldown's time is held back while the others fill. Sets shrink from the default to a minimum of 2 (1 for warm-up, finisher and cooldown) before a slot is given up.
- Equipment mode only filters the pool (`allowsMachine`). Marks, hidden and unavailable machines come from `scoreExercise`; a mark never lets an excluded exercise in.
- `shuffleEntry(result, index, muscles, pool, ctx, { tried, equipment })` swaps one entry for the next candidate of the same slot with the same sets and rest, so the total time is unchanged. `supersetPartners(slug, pairs, pool, ctx, equipment)` lists partners: antagonist first, then compatible, file order within each.
- Routes: `/quick` (`quick_workout`). The day editor shows the builder button for `day_builder` and the partner button for `superset_swipe`.

## Phase 34 notes: sessions (no contract change)
- `Session` / `SessionItem` follow `contract/engines.md` section 1. Local extra fields (A-P34.1): `Session.dayName`, `SessionItem.plan { sets, repMin, repMax, restSec }` and `SessionItem.supersetGroup`. They are never read by the Admin app.
- `src/shared/session.ts`: `startFromDay(day, routineId, id, nowMs)`, `startFree`, `repeatOf`, `withLeftovers`, `addItem`, `removeItem`, `insertItem`, `moveItem`, `setStatus(s, index, status, reason?)` (any to any; `skipReason` only on `skipped`; sets untouched), `reopen`, `bringAllBack`, `logSet` (first set moves an item to `doing`, a `done` item stays `done`), `counts`, `suggestedNext` (first todo, else first doing), `allSet`, `isStale` (open over 6 h with no set), `openSession`, `lastFinished` (newest finished with items), `doneHoursAgo`, `finish(s, nowMs, keep)`. Indexes are positions in the list sorted by `order`.
- `src/data/repos/sessions.ts`: one row per session in `sessions` (`client_id` = `id`); `putSession` is the autosave; `beginDay`, `beginFree`, `beginRepeat`; `finishSession(s, 'drop'|'keep')` sets `endedAt`, moves the schedule `pointer` past the trained day (`pointerAfter`) and, for `keep`, stores the unfinished refs in prefs row `leftover:<dayId>` (added to that day's next session once); `endAsIs` ends a session without moving the pointer.
- Routes: `/train` (core), `/session/:id` (`flexible_session`). `/session/new?routine=<id>&day=<id>` | `?free=1` | `?repeat=1` creates a session and replaces itself with `/session/<id>`; if one is open it asks Resume or Start new anyway.

## Phase 35 notes: skip, alternatives and swap (contract: one new fixture file)
- `src/shared/alternatives.ts`: `alternativesFor({ skipped, variation?, reason, area?, pool, variations, substitutes, ctx, busyMachines? }) -> { alternatives, area }`. `skipped` and every pool row are `Candidate` plus `primary` (index ids, the first is the key) and `pattern` (detail string, '' when unknown). Output rows are `{ kind: 'variation', slug, name, variation, score, pool, chip, machine }` or `{ kind: 'exercise', slug, name, score, pool, chip, machine, custom? }`; `pool` is 1-4 as in P14.7; `chip` is `same_exercise | same_muscle | substitute | easier`.
- Reasons exactly as P14.6: `busy` drops the skipped machine (and the variations of an exercise that has one); `pain` adds the picked area (default: the exercise's primary muscle rows) to the avoid test for this call only and gives +0.5 per difficulty step easier; `no_time` +1 for isolation; `too_hard` drops harder ones and gives +0.5 per step easier; `other` nothing. Machines in `busyMachines` are never offered, for any reason.
- `src/shared/session.ts`: `swapItem(s, index, { ref, variation? }, reason?)` keeps the original's sets, makes it `skipped` with the reason (a `done` item stays `done`) and inserts a NEW `todo` item at `index + 1` with the same plan (setup kept only for a same-exercise variation). `markMachineBusy` / `clearMachineBusy` use the local field `Session.busyMachines: string[]` (never read by the Admin app; same kind of local extra as A-P34.1).
- `src/data/repos/alternatives.ts`: `loadAlternatives({ session, item, reason, area? })`; `machineOf(item)`. Nothing is applied by these; the screen swaps only when the person taps.
- Fixture: `contract/fixtures/alternatives_cases.json` (5 cases; expected values are the P14.7 worked examples).

## Phase 36 notes: overload, 1RM, PR engine (contract: two new fixture files)
- Import from `src/shared/engine` (barrel). Types: `EngineSet {weightKg: number|null, reps: number|null, rpe?, tag?: 'normal'|'warmup'|'drop'|'superset'}` (a `SetLog` fits), `ExerciseResult {sets}`. History arguments are oldest first.
- `e1rm(weightKg, reps) -> number|null` (Epley, reps 1-12, weight > 0, 2 dp; reps 1 = weight); `e1rmDisplay(v)` to 0.5.
- `sessionStats(sets) -> {workingSets, volume, topWeight, totalReps, bestE1rm}`; `workingSets`, `sessionVolume`, `topWeight`, `totalReps`, `bestE1rm`, `isWorking`. Warm-up and drop sets never count.
- `detectPR(history, current) -> PRHit[]` with `PRHit {kind: 'weight'|'reps'|'e1rm'|'volume', value, previous, weightKg?}`; order weight, reps, e1rm, volume; ties are not PRs; no history (or only warm-ups) -> `[]`.
- `overload(history, {mode: 'linear'|'double'|'off', intensity?: 'light'|'moderate'|'hard'|'beast', repMin, repMax, stepKg?, outOfOrder?}) -> {weightKg: number|null, reps: number[], note}`; `reps` is one target per working set of the last session; `note` codes: `off`, `out_of_order`, `no_history`, `add_weight`, `add_weight_2`, `hold_reps`, `hold_wait`, `hold_form`, `hold`, `deload`, `bodyweight` (Phase 38 turns them into words). `INTENSITY` holds the dial table; `DEFAULT_STEP_KG` 2.5.
- `isPlateau(history)`, `noProgressStreak(history)`.
- Reading choices are [A-P36.1] to [A-P36.7] in `PHASE_STATUS.md`. Fixtures: `contract/fixtures/overload_cases.json`, `overload_pr.json`.

## Phase 37 notes: three-metric PRs (contract: two new fixture files)
- `src/shared/pr.ts` (pure): `recordsOf(results) -> {weight, reps, volume, e1rm}` (null = none); `detectPRs(history, current, {hasOtherHistory?}) -> PRHit[]` with `PRHit {metric: 'weight'|'reps'|'volume'|'e1rm', value, previous: number|null}`, order weight, reps, volume, e1rm; `recordKey(slug, setup, separateByGrip)` (same as `prKey`); `buildBoard(sessions, separateByGrip?, customSlug?) -> BoardCard[]` (`{key, slug, grip?, records, dates, sessions, lastDay}`); `sessionPRs(session, others, separateByGrip?, customSlug?) -> {key, slug, ref, hits}[]`.
- Not the same as `engine/pr.ts` `detectPR` (Phase 36, overload doc reading). Rules and choices: [A-P37.1] to [A-P37.6].
- `src/data/repos/records.ts`: `loadBoard() -> {rows: (BoardCard & {name, href})[], separateByGrip}`; `prsForSession(session)`.
- UI helpers `recordText(metric, value)`, `prToastText(hit)` in `src/pages/progress/prText.ts` (the logger, Phase 38, and the summary, Phase 39, call `prsForSession` and `prToastText`).
- Route `/progress/records`, feature `pr_board`. Fixtures: `contract/fixtures/pr_cases.json`, `pr_board.json`.

## Phase 38: set logger and pocket tools
- Pure: `platesFor(target, bar, plates) -> {perSide, total, remainder, nextUp, belowBar}`; `warmupSets(workingKg, class, step)` (50/70/85% x 8/5/3, compound, >= 40 kg); `restSeconds({cls, reps, e1rmFraction, history})` (60 / 90 / 180 / 0, learns after 3 rests, clamp 50-150%). Spec: `contract/engines.md` section 20. Fixtures: `pocket_plates.json`, `pocket_warmup.json`, `pocket_rest.json`.
- `SetLog` optional local fields: `distanceM`, `incline`, `calories`, `restSec`.
- Stored prefs: `logger:prefs` `{mode, big, barKg, plates}`; `overload:prefs` `{mode, intensity}` (read only; Settings writes it later).
- Features used: `warmup_ramp`, `plate_calculator`, `smart_rest_timer`, `big_number_mode`.

## Phase 39: summary, history, PR wall
- Pure (`src/shared/history.ts`): `summaryOf(session) -> {minutes, workingSets, volume, totalReps, exercises, skipped, topWeight}` (warm-ups excluded); `groupByDay(sessions)` by IST start day (newest first); `monthGrid(ym, counts)` Monday-first whole weeks; `prWall(board)` newest records first; `musclesHit(rowsPerExercise)` primary beats secondary.
- Repos: `loadFinished()`, `loadSessionView(id) -> {session, names, prs, muscles}`, `beginRepeatOf(id)` (same exercises, all todo, no sets).
- Routes: `/session/:id/summary`, `/history`, `/history/:id` (feature `flexible_session`); the record burst and the Wall switch on `/progress/records` use `pr_celebration`.

## Phase 40: Copy for AI review (engines.md section 18; no new shape in `contract/`)
- Pure (`src/shared/aiReview.ts`): `aiReviewText(scope, history, opts) -> string`. `scope` = `{kind:'session', id}` | `{kind:'range', from, to}` (IST day keys) | `{kind:'exercise', slug, lastN?}` (default 8). `history` = `{sessions, names, machines?, weights?, muscleNames?, notes?, customSlugs?}` (maps keyed by `refId(item.ref)`). `opts` = `{intro: string | null, units: 'kg' | 'lb', include: {notes, rpe, setups, prs, muscles, bodyweight, name, bodyStats}, profile?: {name?, goal?, experience?, bodyweightKg?, bodyStats?}}`.
- Privacy: a `profile` value reaches the text only when its include flag is on (`name`, `bodyweight`, `bodyStats`); all three are off by default. `goal` and `experience` print in CONTEXT (`unknown` when empty).
- Limits: hard cap 12,000 characters (`AI_MAX_CHARS`); detail is dropped oldest first and the line `NOTE: detail trimmed to fit` is added. A range of more than 30 sessions drops the per-session lines and keeps the weekly lines.
- `rangeFor(preset, today, custom?)` -> `{from, to}` or `null` for a bad custom range. `copyWithFallback(text, env)` -> `'copied' | 'selected'` (`src/pages/aiReview/copyText.ts`).
- Repo: `loadAiHistory(labelOf)`, `getAiPrefs()`, `setAiPrefs(prefs)` (saved: intro, units and the five on/off options; never name, bodyweight or body stats).
- Routes: none new. Feature `ai_review_export` gates the three buttons.

## Phase 41: plan share, pure side (contract/plan-share.md sections 2, 3, 7; no spec change)
- `secret.ts`: `generateSecret(randomBytes) -> Uint8Array(10)`, `secretToCode(bytes) -> 'XXXX-XXXX-XXXX-XXXX'`, `codeToSecret(text) -> Result<bytes, 'secret_length'|'secret_chars'>`, `secretFromLink(linkOrCode)`, `shareLink(appBase, secret)`.
- `crypto.ts` (async, WebCrypto): `deriveId(secret) -> 32 hex`; `encryptEnvelope(env, secret, {iv, gzip?}) -> Result<iv||ct, 'too_large'|'corrupt'>`; `decryptEnvelope(ct, secret, supportedMajor) -> Result<PlanEnvelope, 'corrupt'|'too_large'|'too_new'>`; `toBase64`, `fromBase64`, `toHex`. The caller supplies the 12 IV bytes and the secret bytes (no randomness or clock inside).
- `envelope.ts`: `buildEnvelope({routine, customs, createdAt, contractMajor, from?, note?}) -> {envelope, dropped}`; `parseEnvelope(json, supportedMajor) -> Result<PlanEnvelope, 'too_new'|'invalid'>`; `importPlan(env, {makeId, librarySlugs, hiddenSlugs, takenCustomSlugs, takenRoutineNames}) -> {routine (inactive, source 'mine'), customs (value + new id), flags {unavailable, hidden, customAdded}}`.
- In the envelope a custom item refers to its exercise by the exercise's own `slug` (`ref: {kind:'custom', id: <slug>}`); on import it becomes the new custom `id`.

## Phase 42: relay client and screens (contract/plan-share.md sections 4, 6-8; no spec change)
- Relay base URL = a Supabase Edge Functions base (e.g. `https://<project>.supabase.co/functions/v1`); calls are `POST <base>/share_create|share_status|share_claim|share_cancel` with `{id[, ct]}` and, when an anon key exists, `apikey` + `Authorization: Bearer` headers. Config: `setGymRelay({url, anon})` (connected mode) else `VITE_SHARE_RELAY_URL` / `VITE_SHARE_RELAY_ANON`; neither = `relayAvailable() === false` and the buttons are hidden.
- `shareFlow.ts`: `startShare(env, envelope) -> Result<{secret, id, expiresAtMs}, StartError>`; `pollShare(id, relay, opts) -> 'delivered'|'expired'|'cancelled'|'error'` (3 s, max 60); `receivePlan(env, secret) -> Result<PlanEnvelope, ReceiveError>` where `gone` = already claimed, expired or never existed.
- Routes: `/share` (feature `plan_share`; reads `#secret` from the link, claims only after the Get plan tap), `/settings/privacy`.

## Phase 43: heat engine (contract/engines.md section 4; no spec change)
- Input is `HeatEntry[] = {day (IST key), sets (units > 0), weights (muscle -> weight)}`, one per exercise per session. The caller builds `weights` with `exerciseWeights` (variation, setup, custom picks already applied) and `sets` with `setUnits`/`entryFromSets` (warm-up = 0; reps row = 1; time-only row = seconds / 300). Pass the person's WHOLE history to `heatMap(entries, period, taxonomy)`: the reference reads it.
- `heatMap` returns `{period, sets, muscles: id -> {raw, ref, heat01, band}, rolled: parent -> {heat01, band}}`. Untrained muscles are absent. `compareHeat(base, current)` returns `{detail, rolled}` of `{base, current, delta = current - base, trend}`; both periods keep their own reference.
- Periods are IST day keys, ends inclusive: week Monday..Sunday, month = calendar month, custom swaps reversed ends, `lastDays(n, today)` includes today, `allPeriod` = first logged day .. today.

## Phase 44: heatmap page and weak-spot finder (engines.md section 23; no spec text changed)
- `weakSpots({ entries, today, sessions, groups, tax, marked? }) -> { status: 'ok' | 'not_enough', sessions, baseline, weak[] }` in `src/shared/weakSpots.ts`. Window = last 28 days incl. today. Group value = sum of `sets x` the max weight of the group's muscles in that entry. Baseline = median of groups with value > 0. Weak = value < 40% of baseline (strict), group not marked (a mark on a child covers its group), lowest first, ties by id, at most 3. Fewer than 6 sessions = `not_enough`.
- `pickDay(days, group, tax)`: first day that targets the group (or one of its parts), else the day with the fewest items (first on a tie), else null.
- Repo `src/data/repos/heatmap.ts`: `loadHeatData()` (all sessions, variation and setup applied by `setupWeights`, custom exercises by their own picks), `loadWeakSpots(data, today)` (up to 3 suggestions per group from `labList`), `addToRoutine(slug, group, tax)`.
- `BodyPickerProps.loss?: Record<MuscleId, HeatBand>`: steel ramp in compare mode (`sf-body__u--loss-N`); wins over `heat` on the same muscle.

## Muscle badge data files (Phase 45; consumed by the Phase 46 engine, no code yet)
- `strength_ladders.csv`: `ladder_id,name,kind,bw_fraction,anchor_m,anchor_f,ref_bw_m,ref_bw_f,muscles,source,notes`; `muscles` = `id:weight;...` (detailed muscle ids); `anchor_*` = e1RM / bodyweight of an Olympian at `ref_bw_*`.
- `tier_fractions.csv`: `tier_id,name,position,fraction,experience_sets` (Wood 0 ... Olympian 8).
- `strength_ladder_map.csv`: `slug,ladder_id,factor,load_mode,rule_id`; `ladder_id=none` for no ladder. `load_mode`: `total` (logged weight is the whole load), `per_hand` (x2), `bodyweight` (`bw_fraction x BW + logged added weight`). `benchmarkE1RM = Epley(load, reps) / factor`.
- `ladder_rules.csv` is the source the map was generated from (slug exact first, then whole-word phrases); the app reads only the map. Group membership and unmapped lists: `docs/MUSCLE_BADGES.md`.

## Phase 46: muscle strength engine (engines.md section 26; no spec text changed)
Pure, in `src/shared/badges/`. The caller parses the four dataset files (`ladderFromRecord`, `mapRowFromRecord`, `tierFromRecord`) into `BadgeData` and passes history; nothing is read from the app.
- `computeBadges(data, input): BadgeResult | NeedsInput`. `input` = `{ sessions: {id, day, exercises: {slug, weights, sets: {weightKg, reps, tag?, confirmed?}[]}[]}[], bodyStats: {day, kg}[], sex: 'm'|'f'|'unspecified'|null, asOf, peaks?, groups, muscles? }`. `weights` = the exercise's muscle weights as logged (`exerciseWeights`, variation and setup applied), used for experience and rust. No bodyweight -> `{status:'needs_input', needsBodyweight:true, needsSex}`; sex `null` -> `needsSex:true` (nothing is assumed).
- `BadgeResult`: `muscles[id]` = `{ranked, tier 0-8|null, progress, peak, best, candidates[], next{tier, thresholdKg, ratio, ladderId}|null, suggest[]}`; `groups[id]` = `{tier, peak, rankedMuscles, rankingLadders, rankedLadders}`; `overall` = `{tier, provisional (< 5 groups), rankedGroups}`; `experience` = `{muscles[id]{mp,tier,progress,toNext}, groups, overall}`; `rust[id]` = `{lastDay, daysSince, rusty (> 42 days)}`; `peaks` (store back as `badgePeaks`; group keys are `group:<id>`); `needsConfirm[]` (implausible sets); `estimated` (sex unspecified).
- `sessionPromotions(data, input, sessionId): Promotion[]` = tier raises (muscle, group, overall) caused by one session; `promotionsBetween(before, after)`.
- Persistence is the caller's (Phase 47): store `result.peaks` after each computation, and the set confirmations (`confirmed: true` on the set).
- Fixtures: `contract/fixtures/badges_{thresholds,sets,muscles}.json`.

## Phase 47-a: muscle badges screens (no spec text changed)
- Routes: `/profile/muscles` and `/settings/badges`, feature `muscle_badges` (tab `me`).
- New compiled dataset file `badges`: `{ ladders: [id, name, kind, bwFraction, anchorM, anchorF, refBwM, refBwF, "muscle:weight;...", source][], map: [slug, ladderId, factor, loadMode][] (mapped only), tiers: [id, name, position, fraction, experienceSets][] }`. Read with `getBadges()`, narrowed by `parseBadgeData`. Optional in the manifest.
- Local rows: `prefs` `badges.profile` = `{ sex: 'm'|'f'|'unspecified'|null, skipped, peaks, confirmed[] }`; `bodyStats` `bw:<IST day>` = `{ day, kg }`.
- `BodyPicker` prop `tier?: Record<muscleId, 0..8>`.

## Phase 48: recovery clock, balance, neglected muscles, marks (engines.md sections 5 and 6; no spec text changed)
- `recoveryState(lastTrainedAt: number | null | undefined, size: 'large'|'medium'|'small', now: number) -> 'fatigued'|'recovering'|'ready'|'fresh'` (ms UTC). Targets 72 / 48 / 36 h; elapsed / target < 0.5 fatigued, < 1 recovering, < 2 ready, otherwise fresh; never trained = fresh; a future time = just trained. `sizeOf(id)` gives the class or undefined (`full_body`, `cardio`, unknown ids).
- `recoveryMap(entries: {at: number; weights: Record<string, number>}[], tax, now) -> Record<id, {state, size, lastTrainedAt, hoursSince, hoursLeft}>`: weight >= 0.6 counts; a core id takes the latest of its own and its children's times; hours are 2 dp. `recoveryStates(map)` gives the plain `id -> state` record that `RecoveryStates` in `schedule.ts` reads (Phase 49 passes it in). `readyMuscles(map, tax)` = ready or fresh leaves in taxonomy order.
- `balance(raw) -> { pushPull, upperLower, frontBack }`, each `{ axis, a, b, verdict: 'no_data'|'balanced'|'a_leads'|'b_leads', percent: number | null }` (a = push / upper / front). `raw` is `rawHeat(entries, period)`. Rules [A-P48.3]: under 6 weighted sets = no_data; smaller / bigger >= 0.75 = balanced; percent = round(smaller / bigger x 100).
- `neglectedMuscles(raw, map, tax, now) -> { id, daysSince: number | null }[]` [A-P48.4].
- Marks: rows `{ muscle, kind: 'avoid'|'sore' }` in the `marks` store, client_id `mk:<muscle>`. `avoidFilter(rows, marks, tax) -> { excluded, sore, penalty }` (penalty 0 or -2) uses the P14.2 avoid test, so it agrees with the suggestion score. `setMark(marks, muscle, kind | 'clear')`, `parseMarks(rows)`, `marksToSets(marks)`, `markOf(marks, muscle, tax)`, `withoutAvoided(items, rowsOf, marks, tax)`. Repo: `loadMarks()`, `setMuscleMark(muscle, kind | 'clear')`.
- Fixtures: `contract/fixtures/recovery_{clock,map,balance,marks}.json`.

## Phase 49: recovery and marks screens (no contract shape changed, `contract/` untouched)
- `loadHeatData()` now also returns `recovery: RecoveryEntry[]` (`{ at, weights }` per logged item). `at` = the latest non-warm-up set's `doneAt`, else the session's `startedAt`, else 0 [A-P49.1].
- `loadRecovery(now?) -> { heat, map, balance, marks, hasWork, now }` (`src/data/repos/recovery.ts`). Balance uses `rawHeat` over the last 28 IST days (`BALANCE_DAYS`).
- `readRecoveryNow(now?) -> Record<id, RecoveryState>`; `{}` when nothing was logged. `readRecoveryStates()` in `src/data/repos/schedule.ts` returns it (and `{}` if reading fails) [A-P49.2].
- Routes: `/body/recovery` (feature `recovery_clock`), `/body/marks` (feature `injury_marks`). The Muscle Lab, day builder and swaps all read marks through `loadLabData`, which now uses `loadMarks()` and `marksToSets()` (one reading of marks).
- Screens list every muscle except the group-only parents `chest`, `shoulders`, `traps` (`GROUP_ONLY`) [A-P49.3]; `readyMuscles` / `trackedMuscles` in `src/shared/recovery.ts` leave out every parent and were not changed.

## Phase 51: chart kit I (no contract shape changed, `contract/` untouched)
Shapes are frozen in `docs/design/CHART_KIT.md` section 3. Built: `LineChart({ title, series: Series[<=3], unit?, format?, height?, loading?, emptyText?, action?, summary?, animate?, yMin?, yMax?, zeroBased?, target? })`, `AreaChart` (one series), `BarChart({ data: BarDatum[], target? ... })`, `Sparkline({ values, height?, fill? })` in `src/ui/charts`. Pure helpers in `src/shared/chartMath.ts`: `niceScale(min, max, maxTicks = 5, { zeroBased?, floorZero? }) -> { min, max, step, ticks }`, `downsample(points, 400)`, `preparePoints(points, base)`, `summaryFor(input, format, t)`. A `Point.y` of null / NaN / Infinity is a gap; today and the IST day are passed in as `DayKey`s, charts never read a clock.

## Phase 52: chart kit II (no contract shape changed, `contract/` untouched)
Phase 54 (`src/shared/goals.ts`, pure, `today` is a `DayKey`): `parseEntries(rows) -> BodyEntry[] { day, kg|null, fat|null, cm: Partial<Record<'chest'|'waist'|'hips'|'arm'|'thigh', number>> }`, `mergeEntry`, `bodySeries(entries, field)`, `latestOf`, `parseNumber(text, min, max)`, `bmi(kg, heightCm)`, `bmiBand`; goals: `Goal { id, kind: 'weight'|'body_fat'|'lift'|'attendance'|'event', title?, target, start, startDay, deadline?, slug?, achievedOn? }`, `goalProblem(goal, today)`, `progressFraction(start, target, current)`, `goalProgress(goal, current, today) -> { fraction, pct, reached, current, remaining, daysLeft, status }`, `milestones(goal, current)`, `toCelebrate(goals, progress)`, `sessionsSince(days, startDay)`, `parseGoal(row)`. Repo `src/data/repos/body.ts`: `loadBody`, `saveEntry(patch)` (row id `bw:<day>`, shared with the badges), `deleteEntry(day)`, `readHeight/writeHeight` (pref `body-height`), `loadGoals`, `createGoal`, `deleteGoal`, `markAchieved`. Routes `/progress/body` (feature `body_stats`), `/goals` (feature `goals`).

Phase 53 (progress, `src/shared/progressSeries.ts`, pure, `today` is a `DayKey` parameter): `exercisePoints(sessions, slug, customSlug?) -> { day, weight|null, reps|null, e1rm|null, sets }[]` (one per IST day, oldest first), `exerciseSummary(points)`, `metricPoints(points, 'weight'|'reps'|'e1rm')`, `plateauHint(sessions, slug)`, `exerciseList(sessions)`, `weeklyVolume(sessions, today, weeks = 12) -> { weekStart, volume, sessions }[]`, `topWeekIndex`, `gridRange(today, weeks)`, `gridCells(sessions, range)`, `scheduledTarget(schedule)`, `weeklyTarget(own, schedule)`, `consistency(sessions, today, target) -> { target, thisWeek, fill, keptNow, streak, graceUsed }` (engines.md 24). Repo `src/data/repos/progress.ts`: `loadHub(nowMs?)`, `loadExercise(slug)`, `readOwnTarget()`, `writeOwnTarget(n | null)` (device-only pref `streak-target`). Routes `/progress`, `/progress/exercise/:slug` (feature `progress_charts`; the streak card needs `streaks`).

Shapes stay as frozen in `docs/design/CHART_KIT.md` section 3. Built: `Ring({ title, value, max = 1, secondary?, centre?, size = 72, stroke? })`, `Gauge({ title, value, min, max, marks?, stroke? })`, `HeatGrid({ title, cells: {day, value}[], from, to, mode?: 'sessions' | 'volume', today?, format? })`, `StatTile({ label, value, unit?, format?, delta?: { value, goodWhen, unit?, label? }, spark?, countUp?, large?, href? })`, `StackedBar({ title, rows: { label, parts: { id, name, value, colorIndex? }[] }[], mode?: 'absolute' | 'percent', orientation?: 'horizontal' | 'vertical' })`; all in `src/ui/charts`. Pure helpers in `src/shared/chartMath.ts`: `ringFraction(value, max)`, `gaugeFraction(value, min, max, marks)`, `heatLayout(cells, from, to, mode)`, `sessionBand`, `quintileBand`, `stackLayout(rows, mode)`, `countUpValue(target, p)`, `decimalsOf`, `deltaInfo(value, goodWhen)`, `summaryFor2(input, format, t)`. Rules: nothing non-finite ever reaches an svg attribute; `max <= 0` / `min >= max` is the empty look; the count-up's last frame is the exact `format(value)`.

## Phase 55: protein, water, progress photos (no contract shape changed, `contract/` untouched)
Pure `src/shared/intake.ts` (`today` is a `DayKey`): `proteinTarget(kg|null, factor = 1.6) -> grams | null` (weight x factor to the nearest 5 g; null outside 25-400 kg; factor one of 1.2 / 1.6 / 2, else 1.6), `parseIntake(rows) -> IntakeEntry { id, kind: 'protein' | 'water', amount (g | ml), day, at }[]` (bad rows dropped; entry caps 300 g / 5000 ml), `dayTotal`, `intakeSeries(entries, kind, today, days) -> { day, total }[]` (oldest first, zeros kept), `lastEntry(entries, day)`, `glasses(ml)`, constants `QUICK_PROTEIN = [10, 25, 50]`, `GLASS_ML = 250`, `WATER_TARGET_ML = 2000`. Repos: `loadIntake(nowMs) -> { today, entries, kg, factor }`, `addIntake(kind, amount, nowMs) -> boolean`, `removeIntake(id)`, `writeFactor(f)`; `listPhotos()`, `addPhoto(mime, dataUrl, nowMs) -> id | null` (jpeg / png / webp only, 200 photos at most), `removePhoto(id)`. The local `intake` rows are `{ kind, amount, day, at }` (the connected `intake_logs` shape is not frozen in `contract/`, so this is local until the sync phase). Photo rows `{ mime, data, day }` live in the `photos` store (NEVER_SYNCED). Routes: `/intake` (feature `intake`), `/progress/photos` (feature `progress_photos`).


## Phase 56: barcode scanner + nutrition card (no contract shape changed, `contract/` untouched)
Pure `src/shared/barcode.ts`: `normalizeBarcode(raw) -> {ok, code, format: 'ean_13'|'ean_8'} | {ok:false, error: 'empty'|'chars'|'length'|'checksum'}` (spaces and hyphens ignored, digits only, GS1 check digit must match; 13 = EAN-13, 12 = UPC-A returned as EAN-13 with a leading 0, 8 = EAN-8 or a UPC-E that expands to a valid UPC-A). `upcEToUpcA`, `productUrl(code)` (only `https://world.openfoodfacts.org/api/v2/product/<8 or 13 digits>.json?fields=...`, else null), `parseProduct(json, code) -> {ok, product} | {ok:false, error: 'not_found'|'malformed'}`, `Product {code, name, brand, quantity, servingText, servingG, per100, perServing}` where a `NutrientSet` is `{kcal, protein, carbs, fat, sugar, salt}` and an unknown number is `null` (shown as a dash, never 0); `perServing` = the source's own `_serving` value, else the unrounded per-100 g value x servingG / 100 rounded once (kcal 0 dp, salt 2 dp, others 1 dp), else null; `scaleToServing`, `servingGrams`, `hasServing`, `addToCache` / `parseCache` / `findInCache` (newest first, at most `CACHE_MAX` = 50, one entry per code).
Repo `src/data/repos/barcode.ts`: `lookupBarcode(raw, deps?) -> {status: 'found', product, fromCache} | 'not_found' | 'offline' | 'malformed' | 'server' | {status:'invalid', error}`; `loadCache()`. The request is made only inside `lookupBarcode` (GET, no cookies, no referrer, 10 s timeout); an invalid code never reaches the network. The network is tried first; when it cannot be reached or the server fails, a saved copy of the same code is returned with `fromCache: true`, else `offline` / `server`. Cache = one `prefs` row `barcode:cache` (device only, never in the outbox).
Route `/intake/scan` (feature `barcode_scan`, default on, gym-lockable); the Scan button on `/intake` is shown only while the feature is on. Detector: native `BarcodeDetector` when it lists an EAN / UPC format, else the lazy ponyfill (`barcode-detector/ponyfill`) with `zxing_reader.wasm` located by its bundled URL.

## Phase 57: scan result -> protein counter (no contract shape changed, `contract/` untouched)
Pure `src/shared/intake.ts`: `proteinForPortion(product, portion) -> {ok: true, grams} | {ok: false, error: 'bad_amount'|'no_serving'|'no_protein'|'too_much'}` where `portion` is `{kind:'servings', n: 0.5|1|2}` or `{kind:'grams', g}` (g > 0, at most `MAX_PORTION_G` = 5000). Servings = `perServing.protein` x n; grams = `per100.protein` x g / 100; rounded once to 0.1 g; unknown protein or a result of 0 is an error, never a stored 0; above `MAX_ENTRY.protein` (300 g) is `too_much`. Repo `src/data/repos/intake.ts`: `addProteinEntry(grams, nowMs?) -> id | null` (one generic `intake` row `{kind:'protein', amount, day, at}`, nothing about the product), `proteinToday(nowMs?) -> grams`; Undo is the existing `removeIntake(id)`. No new route or feature key.

## Phase 58: atlas content shape (spec only, `contract/` untouched)
`src/atlas/atlas.json` (written in Phase 59) is a JSON array of `{muscleId, name, group, shape: 'model'|'fitted', meshKeys[], taxonomyIds[], inDailyLife[3-5 x <=70 chars], whenWeak[2-3 x <=90], quickFacts[2-3 x <=90], seeAlso[0-3 muscleIds], reviewed: boolean}`, one row per unit in `docs/atlas/atlas_units.csv` (39). `meshKeys` are the exact prototype keys of `docs/atlas/atlas_mesh_map.csv` (each owned by exactly one row; `Skin` has none); `taxonomyIds` come from `atlas_taxonomy_map.csv`. Full rules, banned words and counts: `docs/HOLO_ATLAS.md` -> "Frozen content spec". No route or feature key added (`holo_atlas` exists).
Phase 59 delivered the file as specified: `src/atlas/atlas.json`, 39 rows, `reviewed: false`, checked by `scripts/validate-atlas.mjs` (exports `validateAtlas`, `bannedHits`, `loadAll`). The page (Phase 60) imports the JSON as is; it must not edit text.

## Phase 60: atlas page (no contract change)
Route `/atlas`, feature `holo_atlas`, lazy. Model files `public/atlas/body.bin` + `fit.bin` (gzip blobs, unpacked in the browser) + `meta.json` (mesh tables `{body, fit}`: `lo`, `scale`, `meshes[{id,k,s,v,t,po,io}]`). `k` is a mesh key from `docs/atlas/atlas_mesh_map.csv` (74 muscle keys + `Skin`). `src/atlas/scene.ts` `createScene(options)` returns `{select(unitId|null), view('front'|'back'|'side'|'reset'), setSettings, dispose}`; `onPick(unitId|null)` reports taps. Pure rules (renderer choice, low-power thresholds, 2D mapping) in `src/atlas/logic.ts`. Nothing is stored or synced.

## Phase 61: recap cards (no contract change)
- `src/shared/recap.ts`: `computeRecap(sessions, range, deps, separateByGrip?) -> RecapStats`, `recapCards(stats)`, `validRange`, `yearRange`, `lastDaysRange`, `longestRun`, `isoWeekOf(day)`, `muscleOfWeek(day, rows)`. `deps` = `{ slugOf, musclesOf, customSlug? }`. Pure, no clock.
- `src/data/repos/recap.ts`: `loadRecap(range) -> { stats, names, firstDay }`.
- `src/shared/routineImage.ts`: `layoutRoutine(routine, nameOf, labels, measure) -> { width: 1080, height: 1350, ops, hidden }`, `wrapText`, `extents`. `src/pages/routines/routineImageCanvas.ts`: `drawRoutineImage`, `shareOrDownload(blob, filename, title, env)`, `paletteFromCss`.
- Routes: `recap` = `/progress/recap` (`year_review`). Features used: `year_review`, `muscle_of_week`, `routine_image` (already in the catalogue).


## Phase 62: settings prefs (no contract change, `contract/` untouched)
- `readPref(key)` / `writePref(key, value)` in `src/data/repos/prefs.ts`; keys are the `PREF_DEFS` names in `src/shared/settings.ts`. Own row: `prefs` client_id `settings:<key>`, value = the pref. Shared rows: `overload:prefs` {mode, intensity}, `logger:prefs` {mode, ...}; a write merges into the row.
- `usePref<T>(key)` returns `[value, set, ready]`; a value that is missing or invalid reads as the pref's default.
- Gym lock: `setGymLockResolver((feature) => boolean)`; `lockedByGym(prefKey)` is read-time only and never edits the stored value (Phase 66 installs the resolver).

## Phase 63: settings data, reminders, content (no contract change, `contract/` untouched)
- `makeBackup(nowMs)` -> `{ name, text }` (JSON of `exportAll`, no photos); `restoreBackup(text)` -> `{ added, updated, skipped }` or throws `BackupError`; `wipeAllData()` deletes the device database (caller reloads). All in `src/data/repos/dataTools.ts`.
- Reminders row: `prefs` client_id `reminders:prefs`, value `{ on: boolean, days: number[] (0=Mon..6), time: "HH:MM" IST }`. `readReminders()` / `writeReminders()` in `src/data/repos/reminders.ts`. Nothing sends a notification.
- Content files: `src/content/about.json` `{ tagline, description[], contact, links[{label,url}] }`; `src/content/credits.json` `{ ownerCredits[], thirdParty[{name,licence,url,note}] }` (schemas in `src/shared/content.ts`).

## Phase 66: policy engine and gym config (contract files unchanged; five fixtures added)
- `parseGymConfig(text, { allowedHosts?, contractMajor? })` -> `{ ok:true, config, host }` or `{ ok:false, code, allowListMiss? }`; codes `GCF_PREFIX|GCF_DECODE|GCF_SCHEMA|GCF_VERSION|GCF_HOST|GCF_MAJOR|GCF_SECRET`, first failure wins, the input is never echoed back.
- `parsePolicy(raw)` -> `{ ok, policy }`; `chooseCurrent(current, incoming)` -> `{ policy, accepted, reason: 'ok'|'invalid'|'stale' }` (same version is accepted).
- `resolveFeatureValue(key, rule, policy|null, user?)` -> `{ on, locked }`. Standalone: needsConnection off. Locked: admin `enabled`. Not locked: user value, else admin `enabled`, else catalogue default. `adminLockable:false` keys are never locked; gym-area keys are on once a policy exists.
- Hooks installed by `src/data/repos/gymPolicy.ts` (only when a policy exists): `setPolicyResolver` (flags), `setGymLockResolver` (Settings "Set by your gym"), `setYoutubePolicyResolver`. `acceptPolicy(raw)` is what Phase 67 calls after a fetch.
- Cache: `prefs` row `gym:policy` (the validated policy). Never reaches the outbox (prefs are device-only).

## Phase 67 — gym link (User app side; contract/connected-api.md is the source)
- `Remote` (src/data/gym/types.ts): `signIn(email, password)`, `signOut()`, `hasSession()`, `accessToken()`, `profile()`, `publicSettings()`, `upsert(table, rows, {onConflict, ignoreDuplicates})`, `softDelete(table, clientId, body)`, `pull(table, columns, cursor, limit)`. Errors are `RemoteError {status?, code?, message?, offline?, retry_after?}`; the engine branches only on `classifyError` (retry / auth / failed).
- `link.ts`: `connectToGym(config, host, onStep)` -> `{ok:true}` | `{ok:false, key}`; `signIn(identifier, password)` -> `{ok, mustChange}`; `changePassword(current, next)`; `disconnect()`; `syncNow(reason)`; `initGymLink()`. Failures carry a sentence key (`gy.err.*`), plus `message` only for an unknown `SFE` code, plus `retryAfter` for `SFE004`.
- Stored (device-only `prefs` rows): `gym:connection`, `gym:cursor:<table>`, `gym:synclog`, `gym:unsynced`. No password, no token, no secret.
- Push: order `workout_sessions, workout_sets, cardio_logs, personal_records, xp_events, body_stats, goals, intake_logs, routines, custom_exercises, injury_marks, exercise_prefs`; batches of 50; ignore-duplicates for append-only tables, merge for member-owned; natural-key conflict for `injury_marks` (`member_id,muscle_id`) and `exercise_prefs` (`member_id,slug`). Column names: assumption A-P67.1.
- Pull: only `gym_settings` (`key,value,updated_at`, tie column `key`).

## Phase 68 — gym data (User app side; contract/connected-api.md is the source)
- `src/shared/gymData.ts` (pure): `membershipView(row, today)` -> `{state: none|upcoming|active|expiring|expired|frozen, daysLeft, daysOver, ...}` (expiring = 7 days or fewer, the end day counts as 0 left); `pickMembership(rows, today)`; `crc16` (CCITT-FALSE); `encodeMemberQr(code)` / `decodeMemberQr(text)` for `SF1:<CODE>:<CRC4>` (CRC over `SF1:<CODE>`); `attendanceDays`, `attendanceSummary(days, today)` (last 30, streak, longest), `monthGrid`; `unreadCount`; `validateRequest`, `canOpenRequest`, `nextRequestStatus`, `requestRow`.
- `Remote` (src/data/gym/types.ts) gained `readOwn(table, columns, limit)` (core shard, RLS: own rows), `markInboxRead(id, readAt)` (`PATCH inbox {read_at}` by id) and `insertRequest(row)` (core `requests`, `on_conflict=client_id`, ignore-duplicates, `status:'open'`).
- `src/data/gym/gymData.ts`: cache in the device `prefs` row `gym:data` (memberships with plan name, attendance day keys, announcements, inbox, requests); queued requests in `prefs` row `gym:requests` (sent by `flushRequests` on the next sync, idempotent by `client_id`; a refused one stays queued). `syncNow` runs `refreshGymData` when signed in. Disconnect clears both rows.
- Connection now keeps `memberCode` (from `members.member_code` at sign-in) so the QR works offline.
- Screens through `src/data/repos/gymLink.ts`: `useGymData()`, `submitRequest(draft)`, `markRead(id)`, `refreshGymNow()`.
- Routes: `/gym`, `/gym/membership` (`membership`), `/gym/qr` and `/gym/attendance` (`attendance_qr`), `/gym/inbox` (`inbox`), `/gym/requests` (`requests`); Me tab row "My gym" when any of the four is on.
- Guessed server columns (A-P68.5): `memberships(id,plan_id,start_date,end_date,status)`, `membership_plans(id,name)`, `attendance(id,checked_in_at)`, `announcements(id,title,body,published_at)`, `inbox(id,title,body,created_at,read_at)`, `requests(client_id,kind,note,status,created_at)` + insert fields `kind,note,freeze_days`.


## Phase 69 — gym programs, proposals, history upload (User app side)
- `Remote.readOwn` now also reads `programs`, `program_days`, `program_items`, `member_programs` (core shard, RLS limits rows). `Remote.insertProposal(row)` upserts into `custom_exercises_shared` on `client_id`, ignore-duplicates.
- Guessed columns (A-P69.1, A-P69.2): see `PHASE_STATUS.md`. Pure readers: `parsePrograms` (`src/shared/gymPrograms.ts`), `proposalRow` (`src/shared/gymData.ts`).
- Routine shape: `Routine.followed?: boolean`; `RoutineSource` also allows `gym:<slug>`. A routine with `followed:true` is never converted to a server op (`toServerOps` returns `[]`).
- Screens through `src/data/repos/gymLink.ts`: `usePrograms()`, `programActions`, `useProposals()`, `proposeToGym(slug)`, `useUpload()`, `uploadActions`.
- Route: `/settings/gym/upload` (no feature key, A-P69.5).

## Phase 73 — restore safety net (User app side; no contract change)
- `emptyCheck({localRows, baseRows, serverHasData, stampedOwner, currentOwner}) -> 'ok' | 'restore_offer' | 'block_push' | 'different_owner'`. Order: owner mismatch first; local 0 with a base above 0 (or the server known to hold data) = `restore_offer`; local below 70% of base = `block_push`; else `ok`. `blocksPush(v)` is true for anything but `ok`.
- `meta` rows (device only, never exported, never synced): `owner` (`member:<MEMBER CODE>`, written once, never replaced by a different member), `restoreBase` (live synced rows at the last good sync).
- `syncNow` asks `checkRestore` before it pushes; a verdict other than `ok` skips the push for that run (pulls of settings still run). After an `ok` run it stamps the owner (if none) and records the base.
- Restore reads with the existing `Remote.pull(table, '*', cursor, limit)` for `workout_sessions`, `workout_sets`, `cardio_logs`, `routines`, `custom_exercises`, `injury_marks`, `exercise_prefs`, `body_stats`, `goals`, `intake_logs`. Column names are the [A-P67.1] guesses. Rows are merged by `client_id` (`mergeAction`), written straight to the stores (no outbox row), the cursor of a table moves after its rows are stored.
- Screens: `restoreStatus()` and `runRestoreNow(onProgress)` through the facade `src/data/repos/gymLink.ts`. Route `/gym/restore` (no feature key, A-P73.6).

## Phase 74 — backup and recovery (User app side; docs only, contract/ 1.1.0 is the source)
Contract 1.1.0 was merged into this zip before this phase; `sha256sum -c contract/CHECKSUMS.txt` is all OK (137 files). Nothing below is code yet. Wire shapes are in `contract/connected-api.md` ("Backups and free accounts") and `contract/engines.md` 27; they are NOT copied here. The planned User-side surface, so Phases 75-80 do not re-think it:
- `src/shared/chunks.ts` (Phase 75, pure, time and random as parameters): `chunkKeyFor(table, row)`, `groupIntoChunks(local)`, `encodeChunk(chunk) -> {bytes, sha256, contentSha256}` (async only for gzip and hash), `decodeChunk(bytes, manifest)` (S4 header and hash checks, S7 schema), `migrateChunk`, `mergeChunk(local, remote)` (27.6), `planSync({L, B, S, rowsL, rowsB}) -> 'NOOP'|'NOOP_REPORT_BOTH_GONE'|'PUSH'|'PUSH_ALL'|'PULL_MERGE'|'MERGE_THEN_PUSH'|'MERGE_NEVER_OVERWRITE'|'RESTORE'|'STOP_OFFER_RESTORE'` (27.7 plus S1 last; names are the fixture's; the earlier 'BLOCK' is now 'STOP_OFFER_RESTORE'). Built in Phase 75 as written in `src/shared/chunks.ts`; also `toWireRow`/`fromWireRow`, `canonicalJson`, `madeAtOf`, `makeChunk`, `fingerprintOf`, `mergeRows`/`pickRow`, `s1Blocks`, `restoreOrder`. Local: `buildAllChunks()`, `buildChunk(key)`, `applyChunk(key, decodedChunk) -> {changed, merged, needsPush}` in `src/data/local/chunks.ts` (one transaction, no outbox). Fixtures: `contract/fixtures/chunks_01..03`.
- `src/data/local` helpers (Phase 75): `buildChunk(key)`, `applyChunk(key, chunk)` in one IndexedDB transaction; `meta` keys listed in `docs/SYNC_SPEC.md` B2.
- `src/data/gym/backup.ts` (Phase 76; the only place that talks to `backup_manifest`, bucket `backups` and `ingest`): `pushDirty()`, `checkAll()`, `restoreAll(onProgress)`. Facade `src/data/repos/backup.ts` for the UI. Free-account calls (`free-signup`, `free-lookup`, `free-delete`, `free-recovery-set`, `free-reset-*`) go through `src/data/gym/freeAccount.ts` (Phase 78-79), lazy `import()` like the rest of `src/data/gym/`.
- Feature keys used: `cloud_backup`, `free_account`, `auto_restore` (already in the catalogue; no catalogue change).
- Error branching: on `code` and `retry_after` only; table in `docs/GYM_CONNECTION.md` P74-4.
- Compatibility: a gym with `contract_version` 1.0.x has no manifest or bucket; gym backup is hidden, free backup works.
- Phase 76-a (User-side internal surface, no contract change): `BackupRemote` (`src/data/gym/backupRemote.ts`): `readManifest(key)`, `upload(path, bytes)`, `insertManifest(row)`, `updateManifest(oldRev, row)` (compare-and-swap, `updated:false` = lost race), `download(path)`, `remove(path)`, `ingest(key, sha256)`. `pushKey(deps, key)` returns `pushed | noop | pulled | standalone | blocked_restore | blocked_s1 | both_gone | retry | auth | stopped | refused`; `runBackupPass(deps)` stops on `auth` and while a restore runs. `meta` keys written: `backup:mode`, `backup:dirty`, `backup:base:<key>`, `backup:attempts:<key>`, `backup:last`; read: `backup:restore`. Column and path rules are the contract's (connected-api 1.1.0, engines 27); the adapter that sends them is 76-b.
- Phase 76-b1 (User-side, no contract change): `createBackupRemote({url, anonKey, getToken, ownerUid, memberId?, shardId, functions?, fetchFn?})` implements `BackupRemote` with REST calls: `GET /rest/v1/backup_manifest?select=...&key=eq.<key>&limit=1`; `POST /storage/v1/object/backups/<owner>/<key_>/<sha>.bin` (`x-upsert: false`); `POST /rest/v1/backup_manifest` (`Prefer: resolution=ignore-duplicates,return=representation`, empty answer = exists); `PATCH /rest/v1/backup_manifest?key=eq.<key>&owner_uid=eq.<uid>&rev=eq.<old>` (`return=representation`, empty answer = lost race); `GET /storage/v1/object/authenticated/backups/<path>`; `DELETE /storage/v1/object/backups/<path>`; `POST <functions>/ingest {shard,key,sha256}`. `setChangeListener(fn)` (local layer): called after a repo put / soft delete committed. `createBackupScheduler(deps)` / `startBackupTriggers(scheduler)` decide WHEN a pass runs (10-30 s after a change, open, foreground, `online`, after a row sync via `kick()`, daily check).

## Phase 76-b2: backup restore and status (internal, no contract change)
- `RestoreRemote extends BackupRemote { listManifests(): { rows: ManifestRow[]; error? } }` (adapter: `GET /rest/v1/backup_manifest?select=...&order=key.asc&limit=1000`).
- `runRestore(deps & { remote: RestoreRemote }, { stopAfter?, onDone?, onProgress? }, fresh?) -> done | paused(offline|auth|stopped) | failed | nothing`. `backup:restore` = `{ status: running|done|failed, done_keys, total_keys }`; `running` blocks every push; a `running` record is resumed on the next pass.
- `Remote.backupAccess?() -> { url, anon, shardId, ownerUid, memberId, getToken } | null` (optional; the gym train shard of the signed-in member).
- `backupLine(input) -> { key: bk.state.*, at?, amber? }` (pure). `ChipInput.backup?: { saving, blocked, newer }`; `ChipState` adds `{ kind: 'backing_up' }` and attention reasons `backup_blocked`, `backup_update`.

### Phase 77 (internal, no contract change): new-device restore
- `planAutoRestore(input) -> { kind: 'wait'|'none'|'owner'|'closed'|'update'|'offer'|'start' }` (pure, `src/shared/restoreFlow.ts`). Order: signed out, password change, other owner, closed shard, `cloud_backup` off, manifests unreadable, no manifests, newer schema, running record (resume), phone has rows or `auto_restore` off (offer), else start. Membership status is ignored [A-R4].
- `assessRestore(ctx) -> { decision, rt }` makes ONE `listManifests` request, only when signed in, past the password change, shard known and `cloud_backup` on. `runChunkRestore(assessment)` runs the Phase 76-b2 `runRestore`, then stamps the owner and records the base. `syncNow` starts it by itself only for verdict `restore_offer`, then runs `syncNow('manual')` for the delta pull.

### Phase 78 (internal, no contract change): free account + backup
- `src/shared/freeAccount.ts` (pure): `parseFreeShards`, `freeConfigReady`, `makeUsername(rand)`, `makePassword(randInt)` (16 chars, letter + digit, no look-alikes), `freeEmail`/`freeIdFromEmail`, `normaliseIdentifier`, `backupHomeView` (R1: hidden | standalone | finish | free | connected), `freeError(code)` (P74-4 table), `canMoveMode`, `FREE_CONSENT_VERSION = 1`, `MAX_SIGNUP_TRIES = 3`.
- `src/app/freeBuild.ts`: `readFreeConfig()` from `VITE_FREE_SHARDS`, `VITE_CORE_FUNCTIONS_URL`, `VITE_CORE_ANON_KEY` [A-P78.1]; `flags.ts` turns `cloud_backup` and `free_account` on in standalone only when these are present.
- `src/data/gym/freeAccount.ts` (lazy): `createFreeAccount(deps)` (`free-signup`, SFE701 regenerates, then Auth sign-in, password held in memory for `takeShownOnce()`), `confirmSaved()`, `finishSetup(deps)` (mode flips to `free_backup` only after every chunk pushed), `signInFree(deps, id, pw)` (`free-lookup` then `/auth/v1/token`), `assessFree` / `restoreAfterSignIn`, `deleteFreeBackup` (`free-delete`), `freeTokenGetter` (single-flight refresh), `freeRuntime`, `initFreeBackup`. Meta keys `free:account`, `free:session`, owner stamp `free:<FREE_ID>`.
- Routes: `/settings/backup` (cloud_backup), `/settings/backup/{consent,password,signin}` (free_account), `/settings/backup/delete` (cloud_backup). R3 and R7-R10 are Phases 79-80.

### Phase 79 (internal, no contract change): recovery questions + forgot password
- `src/shared/freeRecovery.ts` (pure): `validateAnswers({p1,p2})` (3-100 chars after trim, [A-P79.1]), `validateForgot(input, nowYm)` -> `{ok, body}` for `free-reset-request` (`website` always empty) or the wrong `fields`, `ticketView(status, {now, createdAt, signedInSameAccount})` (`bk.fp.st.<status>`, expiry after 7 days or past `redeem_until`, `canCheck/canRedeem/canCancel`), `canStartRequest` (one open ticket), `showCancelPrompt`, `sameAccount`, `lockedUntil/isLocked` (24 h after `SFE708`).
- `src/shared/freeAccount.ts`: `freeError` knows `SFE708` (`bk.err.locked`), `SFE709` (`bk.err.noticket`), `SFE710` (`bk.err.notready`) and `RECOVERY` (`bk.q.need`).
- `src/data/gym/freeAccount.ts` (lazy): `setRecoveryAnswers(deps, answers)` (`free-recovery-set` with the account token; keeps only the flag `free:recovery`), `recoverySaved()`, `finishSetup` now answers `RECOVERY` until the flag is set, `requestReset(deps, input)` (`free-reset-request`, stores `free:ticket`; returns `OPEN` if an open ticket is stored), `checkReset(deps, identifier, code)` (`free-reset-status`; closed tickets are forgotten, an open code typed by hand is remembered), `cancelReset(deps, code)` (`free-reset-cancel`, token), `redeemReset(deps, identifier, code, password)` (`free-reset-redeem`, anonymous), `newResetPassword(deps)`, `readTicket`, `forgetTicket`, `readForgotLock`, `signedInFor`.
- Routes (feature `free_account`): `/settings/backup/questions` (R3), `/settings/backup/forgot` (R7), `/settings/backup/forgot/status` (R8), `/settings/backup/forgot/redeem` (R9).

## Phase 80: free to gym transition (member side, no contract change)
- Order: connect, sign in, password change (Phase 67) -> consent + "Is this your data?" (R12) -> first gym backup written while the mode is still `free_backup` -> `backup:mode = connected` -> `free-delete` of the free account. Any failure before the flip restores the free `backup:*` bookkeeping, the owner stamp and the free runtime; the mode never changes.
- `src/shared/freeTransition.ts`: `MoveRec` (`mine`, `agreed`, `phase: writing|flipped`, `freeId`, `oldStamp`, `snapshot`, `failCode`), `moveDecision(input) -> none|wait|rollback|delete_free|restore_first|start`, `ownerPrompt`, `restoreSourceFor`, `switchOffer`, `moveView`.
- `src/data/gym/freeToGym.ts`: `MovePorts` (`memberOwner`, `freeId`, `freeHasData`, `stopFree`, `startFree`, `gymPass`, `deleteFree`), `stepMove(ports, {hasSession, mustChange, online}) -> MoveOutcome`, `moveHooks(remote, conn, env, ports?) -> {before, after, freeFirst} | null`, `linkPorts`, `readMoveScreen`, `answerMine`, `agreeMove`, `dropMoveAsk`, `readOldFreeId`. `meta` keys: `free:move`, `free:old_id`.
- `freeAccount.deleteFreeAfterMove(deps)`: `free-delete {confirm:true}` then forgets only the free account (mode, backup bookkeeping and owner stamp stay with the gym).
- `link.disconnect()` now ends the gym backup (`connected` -> `standalone`) and drops an unfinished move consent. Route `/settings/backup/switch` (R10, `free_account`).
