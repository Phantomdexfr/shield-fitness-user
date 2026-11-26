# CHART_KIT — Shield Fitness (spec, Phase 50; built in Phases 51 and 52)

Binding with `UI_RULES.md` and `DESIGN_TOKENS.md`. This file freezes the chart kit so Phases 51 and 52 do not re-think anything. Everything is in-house SVG, no chart library, no CDN. Code lives in `src/ui/charts/*` (components) and `src/shared/chartMath.ts` (pure maths, no DOM, no clock). The whole kit is a lazy chunk (<= 60 KB gzip, `UI_RULES` budget).

## 1. Kit at a glance
| Component | Phase | Shows | Used by |
|---|---|---|---|
| `LineChart` | 51 | 1 to 3 series over time or ordered x | exercise progress, body stats, 7/30-day intake, e1RM trend |
| `AreaChart` | 51 | one series with a fill under it | body weight trend, weekly volume trend |
| `BarChart` | 51 | one series of bars; optional target line | weekly volume, sessions per week, daily protein / water |
| `Sparkline` | 51 | tiny line, no axes, no scrub | exercise rows, goal cards, StatTile |
| `Ring` | 52 | one value 0..1 (+ optional second ring) | weekly consistency, protein, water |
| `Gauge` | 52 | value on a half-ring with min/max labels | goal progress, tier progress |
| `HeatGrid` | 52 | calendar grid of day intensity (consistency) | `/progress`, attendance later |
| `StatTile` | 52 | one big number, label, optional delta + sparkline | `/progress`, session summary, recaps |
| `StackedBar` | 52 | one or many bars split into parts | push/pull/legs split, balance card, muscle-group volume |

`ProgressRing` and `ProgressBar` in `src/ui/components/Feedback.tsx` stay as the simple UI atoms (no scrub, no summary). `Ring` is the chart version: same look, adds the text summary, count-up and a centre slot. Phase 52 must not break existing callers of `ProgressRing`.

## 2. Shared rules (every chart)
1. **Tokens only.** Colours come from CSS variables (`--gold-*`, `--text*`, `--line`, `--bg-*`, series ramp below). No hex in TSX or CSS outside `tokens.css`; `tests/guard.test.ts` scans the new files. No purple, violet, indigo, magenta, pink, no blue-to-purple gradient.
2. **Series ramp (colour-blind aware).** 1 gold `#D4AF37`, 2 ivory `#F4EEDC`, 3 steel `#7FA6B8`, 4 copper `#B0713A`, 5 sage `#7FB069`, 6 sand `#BDB49C`, exposed as `--chart-1 … --chart-6` (Phase 51 adds these as aliases in `tokens.css`; they do not change the values above). Max 3 series on a LineChart, 6 segments on a StackedBar. A second series is never told apart by colour alone: it gets a different dash (`none`, `6 4`, `2 3`) and its name in the legend.
3. **Grid and axes.** Gridlines `--line` 1 px, at most 5 horizontal lines, no vertical gridlines. Axis text `--text-muted`, 12 px minimum (`--text-xs`), `tabular-nums`. Fill under a line is the series colour at 12 to 18 % alpha (default 14 %).
4. **No truncation, nothing bleeds.** The chart is `width: 100%` of its card with `min-width: 0`, fixed height by prop (default 180 px; Sparkline 32 px; StatTile sparkline 28 px), `viewBox` scaled, `overflow: hidden` on the SVG only (the SVG is a picture, not text). Labels never use ellipsis: if tick labels would collide, **drop every second label** (see 5.4); legend text wraps. Long series names wrap in the legend, never clip.
5. **Touch.** Plot area plus 44 px of padding is the pointer target. `touch-action: pan-y` so the page still scrolls vertically; a horizontal drag scrubs. No hover-only information: hover on desktop mirrors the scrub.
6. **Numbers.** All values pass through a caller-supplied `format(value)` (so kg, reps, g, ml, %). Default formatter: `Intl.NumberFormat('en-IN')`, max 1 decimal. Weights are shown with `roundKg()` upstream, never re-rounded in the chart. Money is not charted in the User app.
7. **Strings** via `t('key')` (`chart.*` namespace in `en.ts`, added in Phase 51/52): "No data yet", "Not enough data", "Loading chart", "Showing every Nth point", summary templates (section 8).
8. **Icons / emoji:** none inside charts.
9. **Performance.** Pure render from props, memoised by data identity, no layout reads while scrubbing; scrub updates one cursor group via a signal or ref, not a full re-render. 60 fps target on a mid-range Android.

## 3. Data shapes (frozen)
All chart inputs are plain JSON, built by the page from `src/shared/*` series functions (e.g. `progressSeries.ts`, Phase 53). A chart never reads IndexedDB.

```ts
type DayKey = string;                       // 'YYYY-MM-DD', IST day (src/shared/dates.ts)

interface Point {
  x: number | DayKey;                       // DayKey for time charts, number for ordered (set no., week no.)
  y: number | null;                         // null = a gap (no data), never 0 for "missing"
  label?: string;                           // optional text for the tooltip title (e.g. "Bench Press")
}
interface Series {
  id: string;                               // stable, e.g. 'weight', 'e1rm'
  name: string;                             // already translated, shown in the legend and summary
  points: Point[];                          // sorted by x ascending (the chart sorts defensively)
  dash?: 'solid' | 'dashed' | 'dotted';
  colorIndex?: 1 | 2 | 3 | 4 | 5 | 6;       // default = position in the array + 1
}
interface ChartBase {
  title: string;                            // shown above the chart AND used in the text summary
  unit?: string;                            // 'kg', 'reps', 'g', 'ml', '%'
  format?: (v: number) => string;
  height?: number;                          // px
  loading?: boolean;
  emptyText?: string;                       // overrides "No data yet"
  summary?: string;                         // caller override; otherwise generated (section 8)
  animate?: boolean;                        // default true, forced false by reduced motion
}
interface LineChartProps extends ChartBase { series: Series[]; yMin?: number; yMax?: number; zeroBased?: boolean; target?: number }
interface AreaChartProps extends ChartBase { series: [Series]; zeroBased?: boolean }
interface BarDatum { x: string; y: number; label?: string; highlight?: boolean }   // x already formatted ("12 Nov", "Mon")
interface BarChartProps extends ChartBase { data: BarDatum[]; target?: number; zeroBased?: true }
interface StackedPart { id: string; name: string; value: number; colorIndex?: 1|2|3|4|5|6 }
interface StackedBarProps extends ChartBase { rows: { label: string; parts: StackedPart[] }[]; mode?: 'absolute' | 'percent'; orientation?: 'horizontal' | 'vertical' }
interface RingProps extends ChartBase { value: number; max?: number; secondary?: { value: number; max?: number; name: string }; centre?: ComponentChildren; size?: number; stroke?: number }
interface GaugeProps extends ChartBase { value: number; min: number; max: number; marks?: number[] }
interface HeatCell { day: DayKey; value: number }           // value >= 0, 0 = nothing that day
interface HeatGridProps extends ChartBase { cells: HeatCell[]; from: DayKey; to: DayKey; weekStartsOn?: 1 }  // Monday (IST week)
interface StatTileProps { label: string; value: number | string; unit?: string; format?: (n: number) => string; delta?: { value: number; goodWhen: 'up' | 'down' | 'any' }; spark?: number[]; countUp?: boolean }
```
Rules for the shapes: `y: null` breaks the line (a visible gap, never joined across); a `y` of `NaN` / `Infinity` is treated as `null` (the chart must never emit `NaN` into an SVG attribute); duplicate x values keep the last one; an unsorted input is sorted; empty `series` or all `null` is the empty state.

## 4. Chart by chart

### 4.1 LineChart
- 1 to 3 series. Line 2 px, round joins, series colour. Points are drawn as 3 px dots only when there are <= 30 points; the scrub cursor always shows a 5 px dot with a 2 px `--bg-raised` ring.
- Curve: straight segments (no smoothing; smoothing invents data). Gaps (`y: null`) break the line; a single isolated point is drawn as a dot.
- Y scale from `niceScale` (section 5); `zeroBased` forces the min to 0 (default **false** for weight and e1RM, **true** for volume and reps). An optional `target` draws a dashed `--gold-300` horizontal line with its label at the right end, and is included in the domain.
- X axis: time uses `DayKey` spacing proportional to days (a 2-week gap looks like a gap); ordered x uses equal spacing. Tick labels see 5.4.
- Draw-in: the path animates `stroke-dashoffset` over `--dur-slow` (320 ms) once on first reveal.

### 4.2 AreaChart
`LineChart` with one series and the fill under the line (series colour at 14 %, vertical fade to 0 at the baseline, gold only). Baseline is the axis minimum. Used where "how much, over time" reads better than "where is the line". Same scrub, gaps and scale rules; a gap leaves a hole in the fill.

### 4.3 BarChart
- One series. Bar width = 60 % of the slot, radius `--r-sm` on the top corners only, gap >= 4 px. Colour `--gold-500`; the highlighted bar (default: the latest, or the one scrubbed) is `--gold-300`. Bars that reached the `target` are `--gold-400` and the target line is dashed `--gold-300`.
- Always zero-based. Negative values are not supported (volume, reps, grams, millilitres are >= 0; a negative is clamped to 0 and logged to console in dev).
- Up to 52 bars (a year of weeks). More than 52: group by caller (the page aggregates); the chart does not aggregate.
- Value labels: shown on the bar only when there are <= 7 bars and the label fits the slot; otherwise only the scrub readout shows values.
- Grow-in: bars scale from the baseline over 320 ms, stagger <= 8 bars (`MAX_STAGGERED_ITEMS`), the rest appear with the last one.

### 4.4 StackedBar
- `rows` with `parts`. `mode: 'percent'` normalises each row to 100 %; `'absolute'` uses a shared scale across rows (`niceScale`).
- Segments use `--chart-1…6` with a 1 px `--bg-raised` separator. Segment order is the order given; parts with `value <= 0` are skipped (no empty slivers).
- **No colour alone:** a legend sits under the chart (swatch + name + value or %), and each segment >= 48 px wide shows its short name or percent inside in `--text-on-gold` / `--text` for contrast; smaller segments rely on the legend and the scrub readout.
- Horizontal is default (fits 360 px with row labels above each bar, not beside it, so labels wrap and never clip). Vertical is for <= 8 rows.
- Zero total in a row = an empty track (`--bg-card` with a hairline), the summary says "no data".

### 4.5 Sparkline
- 32 px high, no axes, no grid, no text, no scrub, `aria-hidden="true"` (the number beside it carries the meaning; the parent supplies the text). 1.5 px gold line, last point a 3 px dot, optional 12 % fill. Gaps are bridged by a straight line here only (a sparkline is a shape, not a record). <= 60 points (downsampled). One point = a dot; flat = a horizontal line in the vertical middle.
- Trend colour: line is `--gold-400`; the delta in a StatTile uses text and an arrow icon, never red.

### 4.6 Ring
- `value / max` clamped to 0..1 for the arc; the **centre text shows the true number** (so 120 % protein reads "120 %" while the arc is full). Over 100 % adds a thin outer gold-100 ring (a second lap indicator) so overflow is visible.
- Optional `secondary` is an inner ring (colour 3 steel) for a second measure (e.g. water inside protein is NOT done; one ring per measure is the default, `secondary` exists for "this week vs last week").
- Round caps, 7 px stroke at 72 px default, track `--line`, arc `--gold-400` with `--glow-gold` only when the value is >= 100 %.
- Draw-in over 320 ms once. Centre slot takes a number and a small caption (`children`).
- Role: `role="img"` with `aria-label` from the summary (the existing `ProgressRing` keeps `role="progressbar"` for the simple atom).
- Zero value = just the track; `max <= 0` or non-finite = the empty state (a track and a dash), never a divide by zero.

### 4.7 Gauge
Half-ring (180°) from `min` to `max`, same stroke rules as Ring, value needle replaced by the arc end cap. Optional `marks` (e.g. tier thresholds) are tick marks outside the arc with their text in the legend, not on the arc. Min and max labels sit under the ends. Value outside min..max is clamped for the arc and shown true in the centre. `min >= max` = the empty state.

### 4.8 HeatGrid (consistency)
- Calendar grid, columns = weeks (Monday start, IST), rows = Monday to Sunday, newest week on the right. 12 weeks default (`from` and `to` are `DayKey`s from the page; max 53 weeks).
- Cell 14 px with 3 px gap at >= 360 px; the grid scrolls horizontally inside its own card only when more than 20 weeks are asked for (`overflow-x: auto`, never the page). Each cell has a 44 px hit area through a transparent overlay row/column pair, not 44 px visual cells.
- Colour = the **heat ramp** bands 0 to 5 (`--heat-0 … --heat-5`), gold only. Band by value: 0 sessions = 0; 1 session = 3; 2 or more sessions (or volume above the user's median for volume mode) = 5; a `mode: 'volume'` variant uses quantile bands (0, then 1 to 5 by quintile of non-zero days). A planned rest day is drawn as 0 with no marker; a missed planned day is not shown (rest days never count against the user, `engines.md` 24).
- Today's cell has a 1 px `--gold-300` outline. Future cells are not drawn.
- Tap or scrub a cell: readout "Mon 12 Nov: 2 sessions, 14,200 kg" (format by caller). Month initials above the first week of each month.
- Not colour alone: the summary lists the active-day count and the longest run (section 8).

### 4.9 StatTile
- Label (14 px `--text-2`), big value (display face, `--text-xl` 28 px, or `--text-2xl` 40 px in the `large` variant), unit (small, same baseline), optional delta line ("+4 % vs last week", arrow icon up/down/flat, colour `--ok` when it is good, `--text-muted` when neutral or bad: **never red**), optional Sparkline at the bottom.
- **Count-up:** from 0 to the value over 600 ms with ease-out, once per first reveal of that tile in the view (an `IntersectionObserver`-free rule: once on mount). Integers count as integers, decimals keep their decimals; the final frame is always the exact `format(value)` string (so no rounding drift). Reduced motion: shows the final value immediately.
- A `string` value (e.g. "3 wk") is not counted up.
- Fixed layout, no expansion; tapping a tile (if the caller gives `href`) goes to a page, never expands.

## 5. Scale and axis rules (`src/shared/chartMath.ts`)

### 5.1 `niceScale(min, max, maxTicks = 5, opts?)`
Returns `{ min, max, step, ticks: number[] }`.
1. If `min` / `max` are not finite, or there is no data: returns `{ min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] }` (never NaN).
2. Pad the data range by 5 % on both sides (except when `zeroBased`, then min = 0 and only the top is padded).
3. If `max === min` (flat or one point): widen to `[v - d, v + d]` where `d = max(|v| * 0.05, 1)`; if `v === 0` use `[0, 1]`.
4. `rawStep = (max - min) / (maxTicks - 1)`; `step` = the smallest value in `{1, 2, 2.5, 5, 10} x 10^k` that is >= `rawStep`.
5. `niceMin = floor(min / step) * step`, `niceMax = ceil(max / step) * step`; ticks from `niceMin` to `niceMax` by `step`, rounded to `step`'s decimals (no `0.30000000000000004`).
6. Result has 3 to `maxTicks + 1` ticks. Weight charts never show a tick below 0.
Worked example (by hand): data 62.4 to 65.1 -> pad 5 % of the 2.7 range = 0.135 -> 62.265 to 65.235; rawStep = 2.97 / 4 = 0.7425; smallest allowed step >= 0.7425 is 1; niceMin 62, niceMax 66, ticks 62, 63, 64, 65, 66. Flat example: all values 80 -> d = max(4, 1) = 4 -> 76 to 84, rawStep 2 -> step 2, ticks 76, 78, 80, 82, 84. Phase 51's tests work further cases from these steps, not from the code.

### 5.2 Domain and zero baseline
Bars, volume and any "amount" chart are zero-based. Weight, body fat and e1RM are not (a 62 to 65 kg trend must not look flat), but the chart prints the min tick so the cut axis is visible. Never a dual y axis.

### 5.3 `downsample(points, maxPoints = 400)`
- <= 400 points drawn per series (spec limit). Above it, **LTTB** (largest-triangle-three-buckets) keeps the first and last point and the visual shape; `null` gaps are kept as gap markers before bucketing (each run between gaps is downsampled in proportion to its length).
- Scrub snaps to the **drawn** points, and the readout says "Showing every Nth point" in the text summary when downsampled. The raw data and totals in the summary always use the full series, not the drawn one.
- Pure, deterministic, stable under the same input; tested with 10,000 points.

### 5.4 Tick labels
Max labels that fit: `floor(plotWidth / 56)` for dates, `floor(plotWidth / 40)` for numbers. If more ticks than fit, keep the first and last and every Nth between (N = ceil(ticks / fit)); never overlap, never rotate, never shrink below 12 px.
- Time x labels: span <= 14 days -> "12 Nov"; <= 120 days -> "12 Nov" with the month shown once per month change; > 120 days -> "Nov 26". Always IST (section 6).
- Numbers use `format`; thousands grouped (en-IN).

## 6. Dates and time zone
- Every time axis is built from `DayKey` strings made by `istDayKey()`; **a chart never calls `new Date()` for today** and never formats with the device time zone. Today is passed in by the page (`today: DayKey`) like every shared function (no clock in `src/shared`).
- Week = Monday to Sunday in IST (`istWeekStartKey`). Gym day = IST midnight. A session at 23:50 IST belongs to that IST day even if the device is in another zone.
- Tooltip date format: "Mon 12 Nov 2026" (full) in the readout, "12 Nov" on the axis. Strings from `t()`; month/day names come from the app's i18n, not `toLocaleString` with the device locale.
- A gap in days is real: x positions are proportional to elapsed days.

## 7. Interaction
1. **Scrub:** `pointerdown` on the plot captures the pointer; `pointermove` finds the nearest **drawn** point by x (binary search, O(log n)); a vertical cursor line (`--line-strong`) plus the dot move to it; a readout bubble shows `title`-less value: date, series name, value (all series at that x, up to 3 lines). Release hides the cursor after 1.2 s (or immediately on `pointercancel`). Vertical movement over 10 px before 6 px horizontal cancels the scrub and lets the page scroll.
2. **Haptic tick:** `tick()` from `haptics.ts` (8 ms) each time the snapped point changes; Android only, silently nothing on iOS. Never more than one tick per 40 ms; nothing in reduced motion is changed (haptics are not motion), but the setting `haptics` (Settings) turns it off.
3. **Keyboard / screen reader:** the chart is focusable (`tabindex="0"`), Left/Right arrows move the cursor point by point, Home/End jump to first/last, Esc hides the cursor; the readout is an `aria-live="polite"` region (updates throttled to 250 ms).
4. **Readout position:** the bubble sits above the point, flips below near the top, and is clamped inside the card horizontally (it never bleeds out of the viewport). It wraps text; width <= 70 % of the chart.
5. **Tap on a bar / cell / segment:** same readout; a second tap elsewhere moves it. No navigation from a plain chart; links belong to the card around it.
6. **Legend:** a row of swatch + name chips under the chart, wrapping. Tapping a legend chip does nothing in v1 (no hidden series, keeps the chart stable).

## 8. Text summary (every chart, mandatory)
Each chart renders a visually-hidden (`.sf-sr-only`) paragraph and puts the same id in `aria-describedby`; the SVG has `role="img"` and `aria-labelledby` (title). The summary is generated by `chartMath.summaryFor(kind, data, format, t)` unless the caller passes `summary`. Templates (English; keys in `chart.summary.*`):
- Line / Area: "{title}. {n} points from {firstDate} to {lastDate}. Latest {latest}, lowest {min}, highest {max}, change {delta} since the first point." Multi-series repeat per series. Downsampled adds "Showing every {N}th point."
- Bar: "{title}. {n} bars. Highest {max} on {label}, lowest {min} on {label}, average {avg}." With target: "{k} of {n} reached the target of {target}."
- StackedBar: "{title}. {row}: {part} {value} ({pct} %), …" for each row.
- Ring / Gauge: "{title}. {value} of {max} ({pct} %)."
- HeatGrid: "{title}. {active} active days in {weeks} weeks. Longest run {run} days. Most active week {weekLabel}."
- StatTile: "{label}: {value} {unit}. {delta text}."
- Empty: "{title}. No data yet." Not enough: "{title}. Not enough data yet; log {k} more sessions to see a trend."
The summary also carries the information colour would otherwise carry (e.g. which bars met the target), per the "no information by colour alone" rule.

## 9. States
| State | Look | Rules |
|---|---|---|
| Loading | Skeleton block the chart's height with the title visible (`Skeleton` from components) | shown only when `loading` is true or data takes > 150 ms; never a spinner over blank |
| Empty (no points) | Title, a faint dashed baseline, one line "No data yet" + the caller's one gold button (e.g. "Log a workout") | `emptyText` / `action` slot; no axes, no fake data |
| Not enough (1 point, or fewer than the chart's minimum) | The one point drawn as a dot with its value; line charts need >= 2 points for a line, trends need >= 3 for any "change" text | the summary says so; no trend arrow |
| Flat (all values equal) | A horizontal line in the middle of the plot with one tick at that value | `niceScale` flat rule; never a divide by zero |
| Gaps | Broken line / hole in fill / missing bars | never zero-filled |
| Error | Same as Empty with "Could not draw this chart" and no button | caught by an error boundary per chart so one chart cannot blank a page |
| Huge values / tiny values | `format` handles units; tick labels use compact form above 9,999 ("12.4k") with the full value in the readout | |
Phase 51/52 tests: **no `NaN` or `Infinity` in any rendered attribute** for empty, 1-point, flat, all-null, negative-clamped, zero and overflow inputs.

## 10. Motion (reduced motion)
- First-reveal only, never looping: line/area draw-in 320 ms, bars grow 320 ms (stagger <= 8), ring/gauge sweep 320 ms, StatTile count-up 600 ms, heat grid cells fade in by column over 320 ms total.
- Data changes after the first reveal (a new set logged while the page is open): values tween in 180 ms (`--dur-base`), no redraw from zero.
- `prefers-reduced-motion: reduce` (read through `prefersReducedMotion()` in `motion.ts`): no draw-in, no growth, no sweep, no count-up, no stagger, no tween; charts render in their final state and the scrub cursor moves without easing. Haptic ticks stay (settings-controlled).

## 11. Where each chart is used (every chart named in `FEATURES.md` has a row)
| FEATURES id | Feature | Chart(s) | Data shape | Page / phase |
|---|---|---|---|---|
| P-01 | Chart kit | all nine in this file | section 3 | Phases 51, 52 (+ a preview section) |
| P-02 | Per-exercise progress | `LineChart` (3 series: weight, reps, e1RM, one shown at a time via a `Segmented`) with PR dots; `StatTile` (best weight, best e1RM, sessions) | `Series` per metric, x = `DayKey` of the session | `/progress/exercise/<slug>`, Phase 53 |
| P-02 | Weekly volume | `BarChart` (12 weeks, weekly total kg, highest week highlighted) | `BarDatum` per IST week | `/progress`, Phase 53 |
| P-02 | Consistency grid | `HeatGrid` (12 weeks) | `HeatCell` per IST day | `/progress`, Phase 53 |
| X-12 | Streaks + consistency ring | `Ring` (this week's sessions / target, centre = "2 / 3") + `StatTile` (streak weeks) | value, max = weekly target | `/progress` and Home, Phase 53 |
| P-03 | Body stats | `AreaChart` (weight), `LineChart` (body fat %, each measurement), `StatTile` (BMI, latest) | `Series` per metric | `/progress/body`, Phase 54 |
| P-03 | Goals | `Gauge` or `Ring` (progress to goal), `LineChart` with `target` (weight / lift goals) | value, min, max | `/goals`, Phase 54 |
| P-04 | Protein + water | `Ring` per measure (today), `BarChart` with `target` (7 and 30 days) | `BarDatum` per IST day | `/intake`, Phase 55 |
| B-05 | Recovery balance (already built in Phase 49 as text bars) | later `StackedBar` (percent, 2 parts: push / pull, upper / lower, front / back) | `StackedPart` per side | `/body/recovery`, a later polish pass; not required in Phase 52 |
| X-11 / Heatmap compare | Weak spots, heatmap | no chart (body figure + lists); `StackedBar` optional for sets per group | n/a | Phase 44 is already built; not changed |
| X-13 | Year-in-review | `StatTile` (count-up), `BarChart` (sessions per month), `HeatGrid` (year) inside the cards | n/a | Phase 61 |
| X-14 | Muscle badges | `Gauge` (progress to the next tier) and `StatTile` (strength score) | value, min, max (tier thresholds as `marks`) | Phase 47 is built without it; an optional later swap |
| X-01 | AI review export trend | none (plain text export) | n/a | Phase 40 |
| Session summary | Totals | `StatTile` row (sets, volume, duration) | n/a | Phase 39 is built; optional later |
Everything under "X-11", "B-05" balance, "X-14" and "Session summary" is **optional adoption**, not a Phase 52 duty: those pages already ship with their own text bars. Phases 53 to 55 and 61 are the required users.

## 12. File layout for Phases 51 and 52 (names fixed here)
```
src/shared/chartMath.ts            niceScale, downsample (LTTB), tickLabels, scaleLinear, summaryFor, sanitize (no-NaN guard)
src/ui/charts/ChartFrame.tsx       title, legend, empty / loading / error states, summary paragraph, readout bubble
src/ui/charts/useScrub.ts          pointer + keyboard scrub hook (snap, tick, cancel on vertical scroll)
src/ui/charts/LineChart.tsx        (51)  AreaChart.tsx (51)  BarChart.tsx (51)  Sparkline.tsx (51)
src/ui/charts/Ring.tsx  Gauge.tsx  HeatGrid.tsx  StatTile.tsx  StackedBar.tsx   (52)
src/ui/charts/charts.css           tokens only; `.sf-ch*` classes
src/ui/charts/index.ts             barrel; lazy-loaded by pages with dynamic import
src/pages/…/ChartPreview.tsx       a preview section (Phase 51 adds it; 52 extends it), reached from the existing design preview page
tests/shared/chartMath.test.ts     51
tests/ui/charts.test.tsx           51 (line, area, bar, sparkline) and 52 (rest)
```

## 13. Verification the later phases must pass (summary)
- `chartMath`: `niceScale` (normal, flat, one point, empty, negative, huge, tiny, zero-based), `downsample` (10,000 -> <= 400, first and last kept, gaps kept, deterministic), `tickLabels` (never overlap), `summaryFor` (each kind, empty, not-enough).
- Render: each component renders with empty, one point, flat, all-null, gaps, 400+ points and zero/overflow values with **no NaN or Infinity** in the markup; has `role="img"` and the text summary; legend present for 2+ series; reduced motion renders the final state.
- Guard: no hex, no purple-hue colour, no `text-overflow` / `line-clamp` in `src/ui/charts/*`.
- Browser (51 and 52, one run each at 360 px): scrub a line with a pointer, bars and a ring on the preview section, no horizontal overflow.

## 14. Assumptions in this spec
- **[A-P50.1]** LTTB for downsampling (standard, keeps shape); 400-point limit per the phase line.
- **[A-P50.2]** Straight segments, no curve smoothing.
- **[A-P50.3]** Heat grid bands: 0 / 1 / 2+ sessions mapped to `--heat-0`, `--heat-3`, `--heat-5`; volume mode uses quintiles. A coach or the owner may want different cut-offs.
- **[A-P50.4]** StatTile count-up 600 ms and chart draw-in 320 ms are my choice within `--dur-slow`; the owner can change them.
- **[A-P50.5]** Legend chips do not toggle series in v1.
- **[A-P50.6]** The delta colour is never red: good = `--ok` sage, otherwise muted text.
- **[A-P50.7]** The `niceScale` steps in 5.1 are the contract; a Phase 51 test that disagrees with the code means the code is fixed, not the steps.
