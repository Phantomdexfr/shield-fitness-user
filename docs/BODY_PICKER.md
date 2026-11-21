# BODY_PICKER — one reusable body figure used everywhere

Source art: the 2D figure in `reference/prototypes/muscle_lab_2d.html` (MuscleMap, MIT; credit kept in `credits.json`). Phase 16 `[D]` finalised this doc (section "Frozen in Phase 16" below; where it differs from the older text above, the Phase 16 section wins); Phase 17 builds it. **Read the prototype selectively** (`grep -n 'function figSVG\|FALLBACK\|tierOf'`); it is 680 KB because it embeds 51 base64 photos, which we do NOT reuse (photos come from `public/machines/`).

## Component contract (frozen in Phase 16)
```ts
<BodyPicker
  mode="pick-one" | "pick-many" | "heat" | "recovery" | "marks" | "view"
  sex="male" | "female"   view="front" | "back"          // swipe or buttons switch front/back
  value={muscleIds[]}  onChange={(ids)=>...}               // pick modes
  heat={Record<muscleId, 0|1|2|3|4|5>}                     // heat mode (bands from contract/engines.md)
  recovery={Record<muscleId, 'fatigued'|'recovering'|'ready'|'fresh'>}
  marks={Record<muscleId, 'avoid'|'sore'>}
  emphasis={Record<muscleId, 'primary'|'secondary'>}       // 'view' mode for an exercise
  onSelect={(id)=>...}                                     // tap in non-pick modes
/>
<MuscleChips ... />   // text twin: same data as a list, same selection, same colours
```

## Where it is used (one component, many features)
| Screen | Mode |
|---|---|
| Muscle Lab explorer (`/body`) | `pick-one` -> exercise list |
| "Muscles worked" for an exercise/machine | `view` (primary/secondary bands) |
| Day editor target muscles / day builder | `pick-many` |
| Custom exercise creator | `pick-many` twice (primary, then secondary) with emphasis chips |
| Heatmap (`/heatmap`) | `heat` |
| Recovery (`/body/recovery`) | `recovery` |
| Avoid / sore marks (`/body/marks`) | `marks` |
| Session summary mini body | `view` (read-only, small) |
| Exercise page mini body | `view` |

## Behaviour rules
- Region -> muscle id mapping comes from `contract/dataset/detailed_muscles/html_unit_to_detailed.csv` (125 rows). Muscles with no drawn region (serratus_anterior, rotator_cuff, soleus, tibialis_anterior, hip_flexors, quads_lower, neck splits) use the prototype's FALLBACK regions and show a small "approximate region" note, exactly as the prototype does (tiers `clear / approx / list`). Keep that honesty.
- **Hit areas:** every region gets an invisible 44 px minimum target; a zoom button enlarges the figure x1.6 for small muscles (forearm, calves, neck).
- **Selection** supports tap, long-press (select the whole group), keyboard (Tab/Enter/Space) and screen readers (`aria-label` = muscle name + state).
- **Sex toggle** male/female (the 2D art has both). **Front/back** via swipe and buttons (keep the prototype's swipe rule: horizontal > 60 px and 1.5x vertical).
- **Text twin always present:** a searchable muscle list with counts, because colour alone is not enough and tiny regions are hard to tap.
- **Theming:** only tokens. Idle `--bg-raised` + hairline, hover/press `--gold-300`, selected primary `--heat-5` + glow, secondary `--heat-3`, heat bands `--heat-0..5`, recovery colours and avoid/sore hatches per `DESIGN_TOKENS.md`. **Never the prototype's cyan/orange.**
- **Motion:** gold scanline sweep and base glow (the "hologram" feel) are optional decoration, off under reduced motion and in low-power mode.
- **Performance:** SVG paths inlined once per figure/view/sex (4 files), memoised; re-render only changed regions.
- Parent muscles (chest, back, shoulders, traps, quads, glutes...) roll up from children per `muscle_taxonomy_detailed.csv`; the figure may draw parents as unions.

---
## Frozen in Phase 16 (2026-11-19) — spec for Phases 17 and 18
Measured from `reference/prototypes/muscle_lab_2d.html` (data object `F`, line 148) against `contract/dataset/detailed_muscles/html_unit_to_detailed.csv`.

### P16.1 Figure data extraction (Phase 17 does this once)
- One-off script `scripts/extract-body-figures.mjs` (Phase 17; not run in CI). It reads line 148 of the prototype, strips the base64 photos, evaluates `F`, and writes **4 files**: `src/ui/body/figures/{maleFront,maleBack,femaleFront,femaleBack}.ts`.
- Each file: `export const fig = { outline: string, units: Unit[] } as const`, with `Unit = { id: string /* e.g. 'male_front:traps:1' */, region: string /* prototype muscle, e.g. 'traps' */, muscle: DetailedMuscleId, tier: 'clear' | 'approximate', d: string, clip?: [number, number][] }`. `muscle` is filled from the CSV (column `detailed_muscle_id`) at extraction time, so the UI never reads the CSV.
- `viewBox` is `170 30 684 1440` for all four. Keep the 1-decimal rounding of path numbers (no further simplification: it would move region borders).
- Measured size: 124 units, 237 KB of region paths + 65 KB of outlines (about 300 KB raw, about 75 KB per file). Each file is its own lazy chunk; only the chosen sex loads, the other sex loads on first toggle. Nothing is bundled into the main chunk.
- Counts per file: 31 units each. `male_front` and `female_front` also have 5 clip-pathed units (the 4 chest halves + neck); both back files have 1 (neck). 16 units are tier `approximate` (chest halves x8, neck x4, back/scapular x4).
- Phase 17 test (required): every unit id in the 4 files appears exactly once in the CSV and every CSV row appears in a file (124 = 124; checked in this phase, no gaps).

### P16.2 Region -> detailed muscle map (all 124 unit ids covered)
Prototype region -> detailed muscle id (per CSV; sides are 1 = left, 2 = right unless the table says otherwise):
| Prototype region | Detailed id | Notes |
|---|---|---|
| traps | `upper_traps` (units 1-2) / `mid_lower_traps` (units 3-4) | Front views have only units 1-2. Back views have 4 |
| upper_chest, lower_chest | same ids | approximate, clipped halves (front only) |
| front_delts, side_delts | same | front view; side_delts also on back |
| rear_delts | `rear_delts` | back only |
| biceps, triceps, forearms | same | triceps on both views |
| abs, obliques | same | obliques on both views |
| quads | `quads` (units 1-2) / `quads_lower` (units 3-4) | the lower segment sits above the knee; the CSV note says "confirm what this region is meant to show": Phase 17 keeps it as `quads_lower` and flags it as an owner question (below) |
| adductors, abductors | same | both views |
| calves | `calves` | both views |
| neck | `neck` | 1 unit per view, approximate, clipped |
| back | `rhomboids_teres` | back only, approximate; named "Rhomboids / Teres (Scapular Zone)" |
| lats, lower_back, glutes, hamstrings | same | back only |
- **Parents are unions, not drawn units.** `chest` = upper_chest + lower_chest; `shoulders` = front/side/rear delts; `traps` = upper_traps + mid_lower_traps; `back` = rhomboids_teres + serratus_anterior (+ lats stays its own id); `quads` = quads + quads_lower + adductors (taxonomy parent); `glutes` = glutes + abductors; `calves` = calves + soleus + tibialis_anterior. Selecting a parent id selects all its drawn children (the prototype's `AGG` only expands chest and shoulders; Phase 17 generalises it from `muscle_taxonomy_detailed.csv`, column `parent_group`).
- **No drawn region** (tier `list`): `serratus_anterior`, `rotator_cuff`, `soleus`, `tibialis_anterior`, `hip_flexors`, plus any muscle on the other view (e.g. lats on a front view). The prototype defines a fallback only for `hip_flexors` -> `quads`. **[A] Phase 16 extends it** (surface neighbour shown softly, never as the muscle itself): `serratus_anterior` -> `obliques`; `rotator_cuff` -> `front_delts, side_delts, rear_delts`; `soleus` -> `calves`; `tibialis_anterior` -> `calves`; `hip_flexors` -> `quads`. Each shows the note "Deep or hidden muscle, shown at its surface region" and, if the muscle is drawn on the other view, a "Show front/back" button. Change only on the owner's word.
- **Tiers kept from the prototype:** `clear` (own region), `approx` (every unit approximate: dashed outline + note "Approximate region: split from a broader area by a geometric rule, not traced from anatomy"), `list` (no region: text only), `sys` (`full_body`, `cardio`: whole figure tinted softly, no region).

### P16.3 Hit areas for small regions (honest numbers)
- At a 360 px phone the figure is about 300 px wide, so 1 viewBox unit is about 0.44 px. The narrowest regions are the triceps on the front view (16-21 units wide = 7-9 px) and the adductors (26-32 units = 11-14 px). A true 44 px target is **geometrically impossible** for these, so the rule is:
  1. Each region gets an invisible companion `<path>` (same `d`, `fill: transparent`, `stroke: transparent`, `pointer-events: all`) whose `stroke-width` makes it at least 44 px across in screen pixels (`44 / scale` units), drawn **under** the visible regions so a direct hit on a larger neighbour still wins.
  2. For a tap that lands on no region, snap to the nearest region centre within 22 px, but only among regions whose rendered width is under 44 px.
  3. The zoom button scales the figure x1.6 (scroll inside its frame, nothing bleeds); at x1.6 the triceps are about 12-14 px, so the text twin (P16.6) remains the reliable path for tiny muscles.
- Every region also has a row in `<MuscleChips>`; colour and region are never the only way to pick.
- Long-press (500 ms) selects the whole group (prototype `whole` toggle) and gives a light haptic where available.

### P16.4 Props (final)
```ts
type MuscleId = string;   // detailed id or parent id from muscle_taxonomy_detailed.csv
type BodyPickerProps = {
  mode: 'pick-one' | 'pick-many' | 'heat' | 'recovery' | 'marks' | 'view';
  sex: 'male' | 'female';               // controlled
  view: 'front' | 'back';               // controlled
  onViewChange?(v: 'front' | 'back'): void;   // swipe + buttons
  onSexChange?(s: 'male' | 'female'): void;
  value?: MuscleId[];                   // pick modes: selected (pick-one holds 0 or 1)
  onChange?(ids: MuscleId[]): void;     // pick modes
  heat?: Record<MuscleId, 0 | 1 | 2 | 3 | 4 | 5>;
  recovery?: Record<MuscleId, 'fatigued' | 'recovering' | 'ready' | 'fresh'>;
  marks?: Record<MuscleId, 'avoid' | 'sore'>;
  emphasis?: Record<MuscleId, 'primary' | 'secondary'>;   // 'view' mode
  onSelect?(id: MuscleId): void;        // tap in heat / recovery / marks / view
  size?: 'full' | 'compact' | 'mini';   // mini = read-only, no toggles, no zoom, no tooltips
  showScan?: boolean;                   // gold scanline decoration, default false; always off under reduced motion
};
```
- Defaults: `sex` comes from the profile setting, `view` front. In `mini` size no events fire. Unknown ids in `value`/`heat`/etc. are ignored silently (never throw).
- `pick-one` replaces the selection; `pick-many` toggles; both call `onChange`. Heat/recovery/marks never change `value`.
- A muscle shown in several modes at once resolves in this order: marks (avoid/sore hatch) over selected over emphasis over recovery over heat over idle.

### P16.5 Labels and tooltips
- Label = muscle name from the taxonomy via `t('muscle.<id>')` (strings added to `src/i18n/en.ts` in Phase 17), plus " (approximate region)" for approx tier. This is also the region's `aria-label`; selected state adds `, selected`, heat adds `, heat 3 of 5`, marks add `, avoid` / `, sore`.
- Tooltip: on hover (pointer devices) and on press-and-hold (touch) show a small chip with the name near the finger, never under it, never clipped by the frame. No tooltip in `mini`. A visible caption line below the figure always repeats the last touched muscle, so touch users are not relying on hover.
- Keyboard: one tab stop for the figure; arrow keys move between regions in drawing order (the prototype's roving `tabindex`), Enter/Space select, Escape clears in `pick-one`.

### P16.6 Text twin (`<MuscleChips>`)
Same props shape as the figure (`mode`, `value`, `onChange`, `heat`, `recovery`, `marks`, `emphasis`, `onSelect`). Search box at the top (matches name, id and group name, as the prototype's list does), grouped Upper body / Arms / Core / Lower body / Other, each row: name, count (exercise count in the Muscle Lab; heat value in heat mode), tier badge (clear / approximate / list only). Muscles with no drawn region appear here only, which is what makes them selectable.

### P16.7 Keep from the prototype / drop
- **Keep:** the explorer layout (figure + panel); the "muscles worked" primary/secondary view; the searchable muscle list with tier badges; the bottom-sheet panel for the selected muscle (our shared `Sheet` primitive); "show whole group"; "show the other view" button for muscles on the other side; the swipe rule (horizontal > 60 px and > 1.5x the vertical movement); the approximate-region honesty note; roving tabindex and aria labels; the `#debug` coloured-region overlay (kept as a dev-only query flag in `/dev/design-preview`, never in production).
- **Drop:** the cyan/orange palette and the `--cy`, `--hot`, `--soft`, `--amber` variables; Google Fonts (`Barlow`, `Chakra Petch`, `JetBrains Mono`; the app uses Inter and Barlow Condensed, self-hosted); the 51 embedded base64 machine photos and the "pick a machine" tab (machines come from `public/machines/`, handled in the Machine Lab phases); `<details>` expand rows for exercises (UI rules forbid expand cards: rows link to `/exercise/<slug>`); the prototype's exercise dataset `D.ex` (the app uses the compiled dataset); the "SOURCE ART: MUSCLEMAP (MIT)" stage tag (credit moves to `credits.json`).

### P16.8 Palette mapping (prototype -> tokens; no hex in components)
| Prototype | Used for | App token |
|---|---|---|
| `--bg` `#030d15`, `--bg2` `#071a27` | page, stage | `--bg-base`, `--bg-void` |
| `--panel` `#081d2a` | panel, idle region fill | `--bg-card` (panel), `--bg-raised` (idle region) |
| `--line` `#124457` | hairlines, region stroke | `--line` (region stroke), `--line-strong` (figure outline) |
| `--tx` `#d4f4fb`, `--mut` `#7fa9b6` | text | `--text`, `--text-muted` |
| `--cy` `#4de8ff`, `--cy2` `#1fa9c4` | hover, press, scanline, glow | `--gold-300` (hover/press), `--gold-500` (scanline, 4% alpha), `--glow-gold` (glow) |
| class `sel` / `pri` (orange `--hot`) | selected / primary | `--heat-5` + `--glow-gold` |
| class `sec` | secondary | `--heat-3` |
| class `grp` | whole-group tint | `--heat-2` |
| class `soft` (`--soft`) | fallback / `sys` tint | `--heat-1` with dashed `--line-strong` outline |
| class `ap` (approximate) | dashed outline | `--line-strong`, `stroke-dasharray` |
| heat bands (new) | heat mode | `--heat-0 … --heat-5`; compare-mode loss ramp `--loss-1..5` is not used here |
| recovery (new) | recovery mode | fatigued copper, recovering amber, ready gold, fresh ivory outline, from the recovery tokens in `DESIGN_TOKENS.md` |
| avoid / sore (new) | marks mode | avoid: ivory stripes + `--danger` outline (`--danger-wash` fill); sore: amber hatch |
Recovery and avoid/sore colours are named in `DESIGN_TOKENS.md` as hex only; Phase 17 adds semantic custom properties for them in `tokens.css` if they do not exist yet (named in Phase 17's scope check, not added here).
- Pattern, not colour alone: heat bands also print the number in the text twin; avoid/sore use hatch patterns; recovery states use the label in the twin.

### P16.9 Muscle Lab explorer (`/body`, built in Phase 18)
`pick-one` figure + `<MuscleChips>` + a bottom sheet for the selected muscle: name, tier badge, note (approximate / deep / other side / whole body), "show whole group", and the exercise list (primary first, then secondary; text filter; equipment filter; "include whole <parent>" toggle when fewer than 3 primary exercises) with rows linking to `/exercise/<slug>`. Exercise counts come from the dataset repo (`exercisesForMuscle`), never from a copy in the component.

### Open owner questions (not blocking)
1. CSV note on `quads:3/4`: confirm the lower thigh segment is meant to be "Lower Quads (above knee)" (Phase 17 assumes yes).
2. Are the [A] fallback regions in P16.2 acceptable for serratus anterior, rotator cuff, soleus and tibialis anterior?

---
## Phase 17 implementation notes (2026-11-19)
- Built as specified in P16.1-P16.8. Differences from the spec, all small:
  - `Unit` also carries `box: [x, y, w, h]` (viewBox units, computed at extraction) for hit-area ordering and nearest-region snapping. Companion hit paths use `vector-effect: non-scaling-stroke` with `stroke-width: 44px`, so the 44 px is in screen pixels at any zoom without measuring.
  - Touch press-and-hold does not show the floating tooltip (long-press is "select the whole group"); touch users get the caption line under the figure. The floating chip shows for mouse hover only.
  - Static per-muscle tier (`regions.ts`) is view-independent; the per-view "Not visible from this side / Show back" note is not built in the component (Phase 18 can use `viewsOf(id)`).
  - Marks use SVG `<pattern>` hatches (`#sf-body-hatch-avoid`, `#sf-body-hatch-sore`) because CSS gradients cannot fill SVG paths.
- Measured at 360-wide and 320-wide phones: the front triceps render about 10 x 39 px, so the 44 px companion path and the text twin remain the reliable way to pick them.
