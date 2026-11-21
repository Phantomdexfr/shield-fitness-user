// Day builder (Phase 33): contract/engines.md 10 (buildDay), 21 (quickWorkout), 22 (equipment mode). Pure: no DOM, no
// storage, no clock (the day key comes in through the score context), no dataset import. The caller passes the
// candidate pool; a preset only filters it. Output is plain entries that `entriesToItems` turns into a normal Day's items.

import { allowsMachine, type EquipmentPreset } from './equipment';
import type { RoutineItem } from './routine';
import { SPLIT_TABLE } from './routine';
import { rankCandidates, scoreExercise, type Candidate, type Ranked, type ScoreContext } from './suggest';

export type BuildSlot = 'warmup' | 'main' | 'isolation' | 'finisher' | 'cooldown';
export type TimeModel = 'day' | 'quick';

/** A suggestion candidate plus the two index facts the builder needs (`warmup` = also usable as a warm-up). */
export interface BuildCandidate extends Candidate {
  subCategory?: string;
  warmup?: boolean;
}

export interface BuildEntry {
  slot: BuildSlot;
  slug: string;
  name: string;
  custom: boolean;
  /** The target muscle this pick was made for ('' for a finisher). */
  muscle: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  note?: string;
  /** Entries sharing a group are one superset (quick workout, 15 min). */
  group?: string;
}

export interface BuildResult {
  entries: BuildEntry[];
  /** Total time by the model; never above `limitSec`. */
  seconds: number;
  limitSec: number;
  model: TimeModel;
  /** Why nothing could be built. */
  reason?: 'no_muscles' | 'no_matches';
}

export interface BuildSpec {
  /** Core or detailed muscle ids (a split label is mapped with `musclesForLabel`). */
  muscles: readonly string[];
  minutes: number;
  equipment?: EquipmentPreset;
  /** The note for the first heavy lift (the screen passes `t('db.ramp')`). */
  rampNote?: string;
}

// ---------- time arithmetic ----------

export const WORK_SEC = 45;
export const REP_SEC = 3;
export const TRANSITION_SEC = 20;
export const MIN_MINUTES = 10;
export const MAX_MINUTES = 120;
export const QUICK_MINUTES = [15, 20, 30, 45, 60] as const;

/** Day model (engines.md 10): sets x (45 s work + rest). Quick model (engines.md 21): sets x (reps x 3 s + rest + 20 s). */
export function itemSeconds(it: { sets: number; repMax: number; restSec: number }, model: TimeModel): number {
  return it.sets * (model === 'quick' ? it.repMax * REP_SEC + it.restSec + TRANSITION_SEC : WORK_SEC + it.restSec);
}

export function totalSeconds(items: ReadonlyArray<{ sets: number; repMax: number; restSec: number }>, model: TimeModel): number {
  return items.reduce((s, it) => s + itemSeconds(it, model), 0);
}

// ---------- plan: how many of each slot, and the defaults ----------

interface Defaults { sets: number; minSets: number; repMin: number; repMax: number; restSec: number }

const DAY_DEFAULTS: Record<BuildSlot, Defaults> = {
  warmup: { sets: 2, minSets: 1, repMin: 10, repMax: 15, restSec: 30 },
  main: { sets: 3, minSets: 2, repMin: 6, repMax: 10, restSec: 120 },
  isolation: { sets: 3, minSets: 2, repMin: 10, repMax: 15, restSec: 60 },
  finisher: { sets: 2, minSets: 1, repMin: 10, repMax: 20, restSec: 45 },
  cooldown: { sets: 1, minSets: 1, repMin: 8, repMax: 12, restSec: 15 },
};
const QUICK_DEFAULTS: Record<'main' | 'isolation', Defaults> = {
  main: { sets: 3, minSets: 2, repMin: 8, repMax: 12, restSec: 75 },
  isolation: { sets: 3, minSets: 2, repMin: 10, repMax: 15, restSec: 45 },
};

interface Plan { warmup: number; main: number; isolation: number; finisher: number; cooldown: number }

/** [A-P33.1] Day: warm-ups 0/1/2 (under 30 / 30+ / 45+ min), main 1/2/3 (under 30 / under 50 / more), isolation 2/3/4, finisher from 45, cooldown from 30. */
export function dayPlan(minutes: number): Plan {
  return {
    warmup: minutes >= 45 ? 2 : minutes >= 30 ? 1 : 0,
    main: minutes < 30 ? 1 : minutes < 50 ? 2 : 3,
    isolation: minutes < 30 ? 2 : minutes < 50 ? 3 : 4,
    finisher: minutes >= 45 ? 1 : 0,
    cooldown: minutes >= 30 ? 1 : 0,
  };
}

/** [A-P33.2] Quick: 15 min = 2-3 exercises, 30 = 4-5 (engines.md 21); 20 = 3-4, 45 = 5-6, 60 = 6-7 are mine. Compounds first, no warm-up, finisher or cooldown. */
export function quickPlan(minutes: number): Plan {
  const max = minutes <= 15 ? 3 : minutes <= 20 ? 4 : minutes <= 30 ? 5 : minutes <= 45 ? 6 : 7;
  const main = minutes <= 15 ? 1 : minutes <= 30 ? 2 : 3;
  return { warmup: 0, main, isolation: max - main, finisher: 0, cooldown: 0 };
}

export function clampMinutes(n: number): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(Number.isFinite(n) ? n : 45)));
}

// ---------- split label -> muscles ----------

/** The muscles a split day label stands for ("Push", "Full body B", "Legs"), or undefined for an unknown label. A label with no muscles (Mobility) gives []. */
export function musclesForLabel(label: string): string[] | undefined {
  const key = label.trim().toLowerCase().replace(/\s+[a-d0-9]$/, '');
  for (const days of Object.values(SPLIT_TABLE)) {
    const hit = days.find((d) => d.label.toLowerCase() === key);
    if (hit) return [...hit.muscles];
  }
  return undefined;
}

export const FULL_BODY_MUSCLES: readonly string[] = SPLIT_TABLE.full_body[0]!.muscles;

// ---------- candidates per slot ----------

const FINISHER_SUBS: ReadonlySet<string> = new Set(['conditioning', 'cardio_machine', 'plyometric']);

function touches(c: Candidate, muscle: string, ctx: ScoreContext): boolean {
  const want = new Set(ctx.tax.expand(muscle));
  return c.rows.some((r) => want.has(r[0]));
}

function slotPool(slot: BuildSlot, muscle: string, pool: readonly BuildCandidate[], ctx: ScoreContext): BuildCandidate[] {
  switch (slot) {
    case 'main': return pool.filter((c) => c.category === 'compound');
    case 'isolation': return pool.filter((c) => c.category === 'isolation');
    case 'warmup': return pool.filter((c) => (c.category === 'warmup' || c.warmup === true) && touches(c, muscle, ctx));
    case 'cooldown': return pool.filter((c) => c.category === 'recovery' && touches(c, muscle, ctx));
    case 'finisher': return pool.filter((c) => c.category === 'other' && FINISHER_SUBS.has(c.subCategory ?? ''));
  }
}

/** Best first. Marks, hidden, unavailable machines and (through the pool) the equipment preset are already applied. */
export function slotRanked(slot: BuildSlot, muscle: string, pool: readonly BuildCandidate[], ctx: ScoreContext): Ranked[] {
  const ranked = rankCandidates(slotPool(slot, muscle, pool, ctx), slot === 'finisher' ? 'cardio' : muscle, slot === 'main' ? 'main' : slot === 'isolation' ? 'isolation' : 'none', ctx);
  // Main and isolation lifts must train the muscle as a primary; the other slots only need to touch it.
  return slot === 'main' || slot === 'isolation' ? ranked.filter((r) => r.parts.primary > 0) : ranked;
}

/** Equipment mode only filters (engines.md 22). */
export function equipmentPool(pool: readonly BuildCandidate[], preset: EquipmentPreset | undefined): BuildCandidate[] {
  return preset ? pool.filter((c) => allowsMachine(preset, c.machine)) : [...pool];
}

// ---------- build ----------

interface Pair { a: string; b: string; type?: string }

interface Core {
  model: TimeModel;
  minutes: number;
  plan: Plan;
  defaults: (slot: BuildSlot) => Defaults;
  ramp: boolean;
  pairs?: readonly Pair[];
  makeGroup?: () => string;
}

function build(spec: BuildSpec, pool: readonly BuildCandidate[], ctx: ScoreContext, core: Core): BuildResult {
  const limitSec = core.minutes * 60;
  const out: BuildResult = { entries: [], seconds: 0, limitSec, model: core.model };
  if (spec.muscles.length === 0) return { ...out, reason: 'no_muscles' };
  const avail = equipmentPool(pool, spec.equipment);
  const used = new Set<string>();
  const muscles = spec.muscles;
  let left = limitSec;

  const fit = (slot: BuildSlot, budget: number): number => {
    const d = core.defaults(slot);
    for (let s = d.sets; s >= d.minSets; s -= 1) if (itemSeconds({ sets: s, repMax: d.repMax, restSec: d.restSec }, core.model) <= budget) return s;
    return 0;
  };
  const entryFor = (slot: BuildSlot, r: Ranked, muscle: string, sets: number, custom: boolean): BuildEntry => {
    const d = core.defaults(slot);
    return { slot, slug: r.slug, name: r.name, custom, muscle, sets, repMin: d.repMin, repMax: d.repMax, restSec: d.restSec };
  };
  const isCustom = (slug: string): boolean => avail.find((c) => c.slug === slug)?.custom === true;

  /** First unused pick for the slot, trying the muscles in turn from `start`. */
  const pick = (slot: BuildSlot, start: number): { r: Ranked; muscle: string } | null => {
    const list = slot === 'finisher' ? [''] : muscles;
    for (let k = 0; k < list.length; k += 1) {
      const muscle = list[(start + k) % list.length]!;
      const hit = slotRanked(slot, muscle, avail, ctx).find((r) => !used.has(r.slug));
      if (hit) return { r: hit, muscle };
    }
    return null;
  };

  // The cooldown's time is held back so the earlier slots cannot crowd it out.
  let reserve = 0;
  let cooldown: { r: Ranked; muscle: string } | null = null;
  if (core.plan.cooldown > 0) {
    cooldown = pick('cooldown', 0);
    const s = cooldown ? fit('cooldown', left) : 0;
    if (cooldown && s > 0) reserve = itemSeconds({ sets: s, repMax: core.defaults('cooldown').repMax, restSec: core.defaults('cooldown').restSec }, core.model);
    else cooldown = null;
  }
  if (cooldown) used.add(cooldown.r.slug);

  let paired = false;
  const add = (slot: BuildSlot, count: number, startAt: number): number => {
    let made = 0;
    for (let i = 0; i < count; i += 1) {
      const p = pick(slot, startAt + i);
      if (!p) break;
      const sets = fit(slot, left - reserve);
      if (sets === 0) break;
      const e = entryFor(slot, p.r, p.muscle, sets, isCustom(p.r.slug));
      used.add(e.slug);
      out.entries.push(e);
      left -= itemSeconds(e, core.model);
      made += 1;
      // Quick workout, 15 min: pair the first lift with a listed partner when one is free and fits.
      if (core.pairs && core.makeGroup && made === 1 && slot === 'main') pairFirst(e);
    }
    return made;
  };

  const pairFirst = (first: BuildEntry): void => {
    for (const pr of core.pairs ?? []) {
      const other = pr.a === first.slug ? pr.b : pr.b === first.slug ? pr.a : '';
      if (!other || used.has(other)) continue;
      const c = avail.find((x) => x.slug === other);
      if (!c) continue;
      const sc = scoreExercise(c, spec.muscles[0]!, 'none', ctx);
      if (sc.excluded) continue;
      const slot: BuildSlot = c.category === 'compound' ? 'main' : 'isolation';
      const d = core.defaults(slot === 'main' ? 'main' : 'isolation');
      let sets = 0;
      for (let s = d.sets; s >= d.minSets; s -= 1) if (itemSeconds({ sets: s, repMax: d.repMax, restSec: d.restSec }, core.model) <= left - reserve) { sets = s; break; }
      if (sets === 0) continue;
      const group = core.makeGroup!();
      first.group = group;
      const e: BuildEntry = { slot, slug: c.slug, name: c.name, custom: c.custom === true, muscle: first.muscle, sets, repMin: d.repMin, repMax: d.repMax, restSec: d.restSec, group };
      used.add(e.slug);
      out.entries.push(e);
      left -= itemSeconds(e, core.model);
      paired = true;
      return;
    }
  };

  add('warmup', core.plan.warmup, 0);
  const mains = out.entries.length;
  const heavy = add('main', core.plan.main, 0);
  const firstMain = out.entries.find((e, i) => i >= mains && e.slot === 'main');
  if (core.ramp && spec.rampNote && firstMain) firstMain.note = spec.rampNote;
  add('isolation', core.plan.isolation - (paired ? 1 : 0), heavy);
  if (core.plan.finisher > 0) add('finisher', core.plan.finisher, 0);
  if (cooldown) {
    const s = fit('cooldown', left);
    if (s > 0) {
      reserve = 0;
      const e = entryFor('cooldown', cooldown.r, cooldown.muscle, s, isCustom(cooldown.r.slug));
      out.entries.push(e);
      left -= itemSeconds(e, core.model);
    }
  }
  out.seconds = totalSeconds(out.entries, core.model);
  if (out.entries.length === 0) out.reason = 'no_matches';
  return out;
}

/** Engines.md 10: warm-up(s) + ramp-up note, main compounds, isolation, optional finisher, one cooldown, filled in order until the time box is full. */
export function buildDay(spec: BuildSpec, pool: readonly BuildCandidate[], ctx: ScoreContext): BuildResult {
  const minutes = clampMinutes(spec.minutes);
  return build({ ...spec, minutes }, pool, ctx, { model: 'day', minutes, plan: dayPlan(minutes), defaults: (s) => DAY_DEFAULTS[s], ramp: true });
}

export interface QuickInput {
  minutes: number;
  /** Muscle ids, or 'full' for the full-body muscles. */
  muscles: readonly string[] | 'full';
  equipment?: EquipmentPreset;
  rampNote?: string;
  /** Superset pairs (the compiled supersets file); used at 15 min. */
  pairs?: readonly Pair[];
  makeGroup?: () => string;
}

/** Engines.md 21: total time (reps x 3 s + rest + 20 s per set) never above the request; compounds first; marks and equipment respected. */
export function quickWorkout(input: QuickInput, pool: readonly BuildCandidate[], ctx: ScoreContext): BuildResult {
  const minutes = clampMinutes(input.minutes);
  const muscles = input.muscles === 'full' ? FULL_BODY_MUSCLES : input.muscles;
  const quick = (s: BuildSlot): Defaults => QUICK_DEFAULTS[s === 'main' ? 'main' : 'isolation'];
  const core: Core = { model: 'quick', minutes, plan: quickPlan(minutes), defaults: quick, ramp: minutes >= 30 };
  if (minutes <= 15 && input.pairs && input.makeGroup) {
    core.pairs = input.pairs;
    core.makeGroup = input.makeGroup;
  }
  return build({ muscles, minutes, equipment: input.equipment, rampNote: input.rampNote }, pool, ctx, core);
}

// ---------- shuffle one ----------

/**
 * Replaces one entry with the next best candidate for the same slot. Same sets, reps and rest, so the total time does not
 * change and still fits. `tried` = slugs already offered for this position (the screen keeps it); a slug already in the
 * day is never offered. When everything was tried the list starts again. Returns null when nothing else fits the slot.
 */
export function shuffleEntry(
  result: BuildResult,
  index: number,
  muscles: readonly string[],
  pool: readonly BuildCandidate[],
  ctx: ScoreContext,
  opts: { tried?: ReadonlySet<string>; equipment?: EquipmentPreset } = {},
): BuildResult | null {
  const cur = result.entries[index];
  if (!cur) return null;
  const avail = equipmentPool(pool, opts.equipment);
  const inDay = new Set(result.entries.map((e) => e.slug));
  const order = cur.slot === 'finisher' ? [''] : [cur.muscle, ...muscles.filter((m) => m !== cur.muscle)];
  const options: Array<{ r: Ranked; muscle: string }> = [];
  for (const m of order) for (const r of slotRanked(cur.slot, m, avail, ctx)) if (!inDay.has(r.slug) && !options.some((o) => o.r.slug === r.slug)) options.push({ r, muscle: m });
  if (options.length === 0) return null;
  const tried = opts.tried ?? new Set<string>();
  const next = options.find((o) => !tried.has(o.r.slug)) ?? options[0]!;
  const entries = result.entries.map((e, i) => {
    if (i !== index) return e;
    const swapped: BuildEntry = { ...e, slug: next.r.slug, name: next.r.name, custom: avail.find((c) => c.slug === next.r.slug)?.custom === true, muscle: next.muscle };
    return swapped;
  });
  return { ...result, entries, seconds: totalSeconds(entries, result.model) };
}

// ---------- entries -> Day items ----------

/** Plain routine items. `refOf` gives the item ref (a library slug, or the custom exercise's id). Superset groups become group ids with the superset tag. */
export function entriesToItems(entries: readonly BuildEntry[], refOf: (e: BuildEntry) => RoutineItem['ref']): RoutineItem[] {
  return entries.map((e) => {
    const it: RoutineItem = { ref: refOf(e), sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec, tag: e.group ? 'superset' : 'normal' };
    if (e.note) it.note = e.note;
    if (e.group) it.supersetGroup = e.group;
    return it;
  });
}

// ---------- superset swipe ----------

export interface Partner {
  slug: string;
  name: string;
  /** `antagonist` or `compatible` (the pairs data). */
  type: string;
  /** Muscle words from the pairs data, for the card. */
  muscles: string[];
}

export interface PairRow { a: string; b: string; type: string; muscles: string[] }

/** Partners for an exercise from the pairs data: antagonist first, then compatible, file order within each. Hidden, marked, unavailable and off-preset exercises are left out. */
export function supersetPartners(
  slug: string,
  pairs: readonly PairRow[],
  pool: readonly BuildCandidate[],
  ctx: ScoreContext,
  equipment?: EquipmentPreset,
): Partner[] {
  const out: Partner[] = [];
  for (const pr of pairs) {
    const other = pr.a === slug ? pr.b : pr.b === slug ? pr.a : '';
    if (!other || out.some((p) => p.slug === other)) continue;
    const c = pool.find((x) => x.slug === other);
    if (!c || (equipment && !allowsMachine(equipment, c.machine))) continue;
    if (scoreExercise(c, '', 'none', ctx).excluded) continue;
    out.push({ slug: other, name: c.name, type: pr.type, muscles: [...pr.muscles] });
  }
  const rank = (t: string): number => (t === 'antagonist' ? 0 : 1);
  return out.map((p, i) => ({ p, i })).sort((x, y) => rank(x.p.type) - rank(y.p.type) || x.i - y.i).map((x) => x.p);
}
