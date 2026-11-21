# HOLO_ATLAS — "Body Holo Lab": what each muscle does in everyday life

Owner brief: a SEPARATE 3D hologram (the 3.5 MB prototype `reference/prototypes/holo_body_3d.html`) that **only** shows what a muscle does in day-to-day life. The exercise-targeting tool is the 2D Muscle Lab, not this. Phases 58 (spec, frozen below), 59 (content), 60 (page).

## What the prototype is (verified by reading it)
- three.js **r147 loaded from a CDN** (`cdn.jsdelivr.net`) + `OrbitControls`; we vendor both and make **no CDN call**.
- The anatomy is an embedded compressed model (about 3.5 MB file, base64 in the HTML): BodyParts3D adult **male** meshes, simplified, plus a second mesh set `META2` with 5 fitted muscles; each mesh has `{k key, id, s side}` and a `GMAP` to muscle ids.
- Custom hologram `ShaderMaterial` (fresnel rim, scanlines, flicker, additive blend), occluder meshes for depth, a base disc, views (front/back/side), a list/search panel, tap-to-select with a name sheet.
- `EXERCISES = []` is empty by design in the prototype (schema `{name, slug, equipment, muscle_id, role, emphasis, note}`): **we do not use it here.**
- Female button is disabled: "needs a licensed female model". The 3D atlas is **male only**.
- **Swapped (owner supplied a newer prototype):** `MISSING` is now empty. **Latissimus dorsi, Rectus abdominis, Internal oblique, Transversus abdominis, Multifidus** are in the 3D model as meshes generated procedurally and fitted to the BodyParts3D trunk (`FITGRP` gives their groups, `META2` their meshes). They are approximations, not BodyParts3D data, and the app must say so. The old file (5 muscles missing) is gone.
- Credits string inside the file (BodyParts3D CC BY 4.0, human-atlas MIT, holographic-material idea MIT, three.js MIT) and a note: *legacy OBJ comments mention CC BY-SA 2.1 Japan; the human-atlas authors say CC BY 4.0 supersedes it; **to be confirmed before commercial release**.* This repo keeps that warning visible in `PHASE_STATUS.md` and the Credits page.

## Scope of the page `/atlas` (feature key `holo_atlas`)
- Gold-ified hologram (`DESIGN_TOKENS.md`): gold/ivory fresnel and scanlines, warm base glow. **No cyan.**
- Orbit by drag, pinch zoom, buttons Front/Back/Side/Reset; tap a muscle to select (highlight gold), or pick from a searchable list grouped by region (Neck, Shoulders, Chest, Back, Arms, Core, Hips, Legs).
- **Selected muscle panel** (a bottom sheet, never inline expansion): name · region · **In daily life** (3-5 plain examples: walking uphill, standing from a chair, carrying shopping, reaching a shelf, sneezing/coughing, keeping posture at a desk) · **When it is weak or tight** (2-3 plain effects) · **Quick facts** (1-3). Content from `src/atlas/atlas.json`.
- **No exercises on this page.** Optional single quiet link "Train this in Muscle Lab" can be shown if the owner switches it on (default OFF, `atlas.show_train_link` pref) so the two tools stay separate as he asked.
- **The 5 fitted muscles** (lats, rectus abdominis, internal oblique, transversus abdominis, multifidus) are in the 3D model but are approximate shapes: their panel carries a quiet note (string `atlas.fitted`: "Approximate shape, not anatomical data."). Nothing in the app is "missing from 3D" any more.

## Performance and safety (this is the heaviest page)
- **Lazy:** the page, three.js, shader and the model file are separate chunks/assets, loaded only on opening `/atlas`; **not** precached at install; cached by the service worker after the first successful load.
- Model stored as a **binary file** (not base64 inside JS) to cut parse cost (about 25-33% smaller than base64 text); decode off the main thread where possible.
- **Low-power mode** (auto if `navigator.hardwareConcurrency <= 4`, `deviceMemory <= 2`, `saveData`, battery < 20%, or the user setting): pixel ratio 1, no auto-rotate, no flicker/scan animation, lower shader cost.
- **WebGL fallback:** if WebGL context creation fails or the first frame takes too long, show the 2D figure + the same atlas panel with a one-line notice.
- Pause rendering when the tab is hidden or the page is not on screen (`requestAnimationFrame` stop).
- `prefers-reduced-motion`: no auto-rotate/flicker/scan.
- A 1.5-3 s loading state with a skeleton and a "Loading 3D model (about 3.5 MB, once; measure the extracted asset)" note; a "Cancel" returns to the 2D figure. Show the size honestly before downloading on a metered connection (`navigator.connection.saveData` -> ask first).

**Measured in Phase 60:** the extracted model is 2,643,934 bytes (`body.bin` 2,003,790 + `fit.bin` 625,563 + `meta.json` 14,581), about 2.6 MB. The "3.5 MB" above was the prototype HTML.

## Content rules (`atlas.json`, Phase 58-59)
- Schema: see "Frozen content spec (Phase 58)" at the end of this file.
- Plain English, 8th-grade reading level, educational. **No medical claims, no diagnosis, no "treats/cures"**, no exercise prescriptions, no brand names. Max lengths: examples 70 chars each, facts 90 chars each. Banned phrases are tested.
- `reviewed: false` until the owner (or a physio) signs off; the Credits/About page says "Educational information, not medical advice."
- Every muscle mesh in the 3D model AND every detailed taxonomy id has a row (the 5 fitted ones included, flagged as approximate shapes), or an explicit "no content" reason.

## Licences (must be visible in Credits)
BodyParts3D (CC BY 4.0, citation text above), human-atlas (MIT), holographic-material idea (MIT), three.js (MIT), MuscleMap (MIT, for the 2D figure). The CC BY-SA ambiguity needs the owner's confirmation before the gym launches commercially.

## Frozen content spec (Phase 58)
Source of truth for the 3D list: `reference/prototypes/holo_body_3d.html` (the newer owner file, `MISSING` empty). Three files in `docs/atlas/` carry the lists; Phase 59 reads them and does not re-derive anything:
- `atlas_units.csv`: the 39 atlas units (`muscleId`, name, group, region chip, `shape`, mesh keys, taxonomy ids, note).
- `atlas_mesh_map.csv`: every mesh key in the model (74 muscle keys = 69 BodyParts3D + 5 fitted, plus `Skin`) -> its unit.
- `atlas_taxonomy_map.csv`: every id in `contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv` (34) -> units, or `parent`, or `no_content`.

### Unit = the thing that gets one text
A tap on any mesh selects its **unit** (both sides, every head or part highlight together). One row of text per unit, not per mesh: 74 mesh keys became 39 units (34 `model`, 5 `fitted`) because heads of one muscle (three triceps heads, three deltoid parts, four hamstrings) do the same job in daily life. Exceptions kept apart because their roles differ: trapezius upper vs middle/lower, rectus femoris vs the vasti, the four forearm units, gluteus maximus vs medius/minimus. `Skin` is a depth shell, not a muscle: no row, never selectable.
Sides: `L`/`R` pairs share one unit. Midline meshes (`Spinalis thoracis`, `Sternocleidomastoid` has L and M, `Skin`) behave the same.

### `src/atlas/atlas.json` (written in Phase 59)
A plain JSON array, one object per unit, in the order of `atlas_units.csv`:
| field | type | rule |
|---|---|---|
| `muscleId` | string | snake_case id from `atlas_units.csv`; unique |
| `name` | string | 1-40 chars, as in `atlas_units.csv` |
| `group` | string | one of the 13 prototype groups: Chest, Shoulders, Arms, Forearms, Back, Core, Glutes, Hip flexors, Quadriceps, Hamstrings, Adductors, Calves & shins, Neck |
| `shape` | `"model"` or `"fitted"` | copied from the CSV; `fitted` shows the approximate-shape note |
| `meshKeys` | string[] | exact keys from `atlas_mesh_map.csv`; every key appears in exactly one row |
| `taxonomyIds` | string[] | from the CSV; may be empty (`pectoralis_minor`) |
| `inDailyLife` | string[] | 3-5 items, each 8-70 chars |
| `whenWeak` | string[] | 2-3 items, each 8-90 chars |
| `quickFacts` | string[] | 2-3 items, each 8-90 chars |
| `seeAlso` | string[] | 0-3 `muscleId`s that exist, not itself |
| `reviewed` | boolean | `false` until the owner or a physio signs off |
`meshKeys`, `taxonomyIds`, `group`, `shape` and `name` are copied from the CSV by Phase 59, so the author writes only the four text arrays and `seeAlso`. Text stays English in `atlas.json`; the page labels around it use `t()` strings. No `youtube`, URL, exercise list or image field exists.

### Region chips (list grouping and filter)
The list is grouped by the 8 chips; the row's `group` is the finer 13. Mapping: Neck = Neck; Shoulders = Shoulders; Chest = Chest; Back = Back; Arms = Arms + Forearms; Core = Core; Hips = Glutes + Hip flexors + Adductors; Legs = Quadriceps + Hamstrings + Calves & shins. Where the prototype group and the taxonomy disagree (serratus anterior: Core vs back; teres major: Shoulders vs back; tensor fasciae latae: Hip flexors vs abductors), the atlas uses the prototype group, and the CSV note says so.

### Tone rules
- Plain English, 8th-grade reading level, short sentences, everyday verbs (stand up, climb stairs, carry bags, reach a shelf, turn your head, cough).
- Educational only. No medical claims: never diagnose, name a condition as a cause, promise a result, or tell the reader what to do. Hedge with "can", "often", "may". `whenWeak` describes how everyday things can feel, not what is wrong with the person.
- No exercises, no sets or reps, no equipment, no brand names, no body-shaming or "ideal body" wording, no emoji.
- Fitted muscles use the same tone; the approximate-shape note is shown by the UI, not repeated in the text.
- Banned words and phrases (Phase 59 tests them, case-insensitive, whole words): cure, treat, treatment, diagnose, diagnosis, heal, therapy, rehab, rehabilitate, prevent, guarantee, guaranteed, fix, injury-proof, burn fat, lose weight, bodybuilding, steroid, supplement.
- Each row's text arrays together stay under 700 chars so the bottom sheet fits a 360 px screen without scrolling far; the sheet itself scrolls, nothing is cut off.

### Counts to be checked in Phase 59
74 mesh keys all owned (69 `bodyparts3d`, 5 `fitted`), `Skin` has no row, 39 rows, 34 taxonomy ids: 28 `detailed`, 4 `parent` (chest, back, shoulders, traps), 2 `no_content` (`full_body`, `cardio`: not muscles).

### How the 2D figure covers the atlas (WebGL fallback)
All 5 fitted muscles are in 3D now, so none is "missing". In the 2D fallback a unit highlights the drawn regions of its `taxonomyIds` (`contract/dataset/detailed_muscles/html_unit_to_detailed.csv`): lats, abs (rectus abdominis, transversus abdominis), obliques (internal oblique) and lower back (multifidus) all have drawn regions. Seven units have **no drawn 2D region** and are shown as text only, with the existing Muscle Lab "list" honesty tier: pectoralis minor, serratus anterior, rotator cuff, soleus, tibialis anterior, iliopsoas, sartorius.
Not in either model, so no row: diaphragm and pelvic floor, hand and foot muscles, face and jaw, deep neck muscles, the small muscles between ribs and vertebrae. The page says "Not every muscle is shown."

### Open for the owner
Licence of the 5 fitted muscles (not BodyParts3D data) before launch; physio or owner wording review (`reviewed: false` stays until then).

