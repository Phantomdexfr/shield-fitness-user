// Protein and water intake (Phase 55). Pure: no DOM, no storage, no clock (`today` is a DayKey, times are parameters).
// One generic typed log: every row is { kind, amount, day, at }. The day is the IST day of `at`, fixed when the row is made.

import { addDays, isDayKey, istDayKey, type DayKey } from './dates';
import type { Product } from './barcode';

export type IntakeKind = 'protein' | 'water';
export const INTAKE_KINDS: readonly IntakeKind[] = ['protein', 'water'];

export interface IntakeEntry {
  id: string;
  kind: IntakeKind;
  /** Protein in grams, water in millilitres. */
  amount: number;
  day: DayKey;
  /** UTC milliseconds when it was added. */
  at: number;
}

/** Quick-add buttons (grams) and the water glass (ml). */
export const QUICK_PROTEIN: readonly number[] = [10, 25, 50];
export const GLASS_ML = 250;
/** Daily water target: 8 glasses. */
export const WATER_TARGET_ML = 2000;
/** Largest single entry that is believable (keeps a typo from wrecking the day). */
export const MAX_ENTRY: Record<IntakeKind, number> = { protein: 300, water: 5000 };

/** Grams of protein per kg of body weight the person can pick. */
export const PROTEIN_FACTORS: readonly number[] = [1.2, 1.6, 2];
export const DEFAULT_FACTOR = 1.6;
const WEIGHT_RANGE: [number, number] = [25, 400];

export function parseFactor(v: unknown): number {
  return typeof v === 'number' && PROTEIN_FACTORS.includes(v) ? v : DEFAULT_FACTOR;
}

/** Daily protein target in grams: weight x factor, rounded to the nearest 5 g. Null without a believable weight. */
export function proteinTarget(kg: number | null, factor: number = DEFAULT_FACTOR): number | null {
  if (kg === null || !Number.isFinite(kg) || kg < WEIGHT_RANGE[0] || kg > WEIGHT_RANGE[1]) return null;
  const f = parseFactor(factor);
  return Math.round((kg * f) / 5) * 5;
}

/** Rows from the store to clean entries; anything that is not a believable entry is dropped. */
export function parseIntake(rows: readonly Record<string, unknown>[]): IntakeEntry[] {
  const out: IntakeEntry[] = [];
  for (const r of rows) {
    const kind = r.kind;
    if (kind !== 'protein' && kind !== 'water') continue;
    const amount = r.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_ENTRY[kind]) continue;
    const at = r.at;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    const day = typeof r.day === 'string' && isDayKey(r.day) ? r.day : istDayKey(at);
    if (typeof r.client_id !== 'string') continue;
    out.push({ id: r.client_id, kind, amount, day, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Total of one kind on one day. */
export function dayTotal(entries: readonly IntakeEntry[], day: DayKey, kind: IntakeKind): number {
  let sum = 0;
  for (const e of entries) if (e.day === day && e.kind === kind) sum += e.amount;
  return Math.round(sum * 10) / 10;
}

/** The newest entry of the day (any kind), or undefined. The Undo button removes this one. */
export function lastEntry(entries: readonly IntakeEntry[], day: DayKey): IntakeEntry | undefined {
  let best: IntakeEntry | undefined;
  for (const e of entries) if (e.day === day && (!best || e.at >= best.at)) best = e;
  return best;
}

export interface IntakePoint {
  day: DayKey;
  total: number;
}

/** The last `days` days ending on `today`, oldest first, zeros kept. */
export function intakeSeries(entries: readonly IntakeEntry[], kind: IntakeKind, today: DayKey, days: number): IntakePoint[] {
  const n = Math.max(1, Math.min(366, Math.floor(days)));
  const totals = new Map<DayKey, number>();
  for (const e of entries) if (e.kind === kind) totals.set(e.day, (totals.get(e.day) ?? 0) + e.amount);
  const out: IntakePoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, total: Math.round((totals.get(day) ?? 0) * 10) / 10 });
  }
  return out;
}

/** Share of the target, 0 and up (a ring caps the look, the number can pass 100 %). */
export function share(total: number, target: number | null): number {
  return target !== null && target > 0 ? total / target : 0;
}

/** Water as glasses, one decimal (500 ml -> 2). */
export const glasses = (ml: number): number => Math.round((ml / GLASS_ML) * 10) / 10;

/** Phase 57: protein for one portion of a scanned product. Protein only; no other nutrient is ever kept. */
export const SERVING_STEPS: readonly number[] = [0.5, 1, 2];
export type Portion = { kind: 'servings'; n: number } | { kind: 'grams'; g: number };
export type PortionError = 'bad_amount' | 'no_serving' | 'no_protein' | 'too_much';
export type PortionResult = { ok: true; grams: number } | { ok: false; error: PortionError };

/** Largest portion weight accepted in the grams box. */
export const MAX_PORTION_G = 5000;
const round1 = (v: number): number => Math.round(v * 10 + Number.EPSILON) / 10;

/**
 * Grams of protein for `portion` of `product`, rounded once to 0.1 g.
 * Servings use the product's per-serving protein (its own number, else per 100 g x serving grams / 100); grams use per 100 g.
 * An unknown protein is an error (never 0); a result that rounds to 0 is `no_protein` (it cannot be stored); above one entry's limit is `too_much`.
 */
export function proteinForPortion(product: Pick<Product, 'per100' | 'perServing'>, portion: Portion): PortionResult {
  let raw: number;
  if (portion.kind === 'servings') {
    if (!SERVING_STEPS.includes(portion.n)) return { ok: false, error: 'bad_amount' };
    const per = product.perServing.protein;
    if (per === null) return { ok: false, error: product.per100.protein === null ? 'no_protein' : 'no_serving' };
    raw = per * portion.n;
  } else {
    if (!Number.isFinite(portion.g) || portion.g <= 0 || portion.g > MAX_PORTION_G) return { ok: false, error: 'bad_amount' };
    const per100 = product.per100.protein;
    if (per100 === null) return { ok: false, error: 'no_protein' };
    raw = (per100 * portion.g) / 100;
  }
  const grams = round1(raw);
  if (grams <= 0) return { ok: false, error: 'no_protein' };
  if (grams > MAX_ENTRY.protein) return { ok: false, error: 'too_much' };
  return { ok: true, grams };
}
