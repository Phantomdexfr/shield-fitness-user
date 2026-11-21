// Plan envelope SFPLAN1 (Phase 41). Pure: ids and time come from the caller. Spec: contract/plan-share.md sections 3 and 7.
// Build: routine -> envelope with every id and every personal field left out. Parse: zod, unknown fields dropped.
// Import: envelope -> a new, inactive routine with fresh ids, plus the custom exercises it needs and the flags for the preview.

import { z } from 'zod';
import type { Result } from '../validators';
import type { Routine, RoutineDay, RoutineItem } from '../routine';
import { MAX_DAYS, MAX_NAME } from '../routine';
import { parseSchedule, type Schedule } from '../schedule';
import { customSlug } from '../slug';
import type { CustomExerciseValue } from '../customExercise';

export const ENVELOPE_SCHEMA = 'SFPLAN1';
export const MAX_FROM = 30;
export const MAX_NOTE = 200;

export interface EnvelopeDay {
  name: string;
  targetMuscles: string[];
  items: RoutineItem[];
}

/** A custom exercise as shared: no id, no client id, no personal notes. Items refer to it by `slug`. */
export type EnvelopeCustom = Omit<CustomExerciseValue, 'notes'>;

export interface PlanEnvelope {
  schema: typeof ENVELOPE_SCHEMA;
  contractMajor: number;
  createdAt: string;
  from?: string;
  note?: string;
  routine: { name: string; splitStyle: string; daysPerWeek: number; weekdays: number[]; days: EnvelopeDay[]; schedule?: Schedule };
  customExercises: EnvelopeCustom[];
}

// ---------- zod ----------
const str = (max: number) => z.string().min(1).max(max);
const itemSchema = z.object({
  ref: z.discriminatedUnion('kind', [z.object({ kind: z.literal('lib'), slug: str(80) }), z.object({ kind: z.literal('custom'), id: str(80) })]),
  sets: z.number().int().min(1).max(30),
  repMin: z.number().int().min(1).max(200),
  repMax: z.number().int().min(1).max(200),
  restSec: z.number().int().min(0).max(3600),
  note: z.string().max(MAX_NOTE).optional(),
  tag: z.enum(['normal', 'superset', 'drop']).optional(),
  supersetGroup: z.string().max(20).optional(),
  variation: z.string().max(80).optional(),
  setup: z.record(z.string().max(40), z.unknown()).optional(),
});
const muscleSchema = z.object({ id: str(40), role: z.enum(['primary', 'secondary', 'stabiliser']), emphasis: z.enum(['high', 'medium', 'low']) });
const customSchema = z.object({
  name: str(60),
  slug: str(80),
  kind: z.enum(['strength', 'cardio', 'bodyweight']),
  machineSlug: z.string().max(80).nullable(),
  muscles: z.array(muscleSchema).max(34),
  repMin: z.number().int().min(1).max(200),
  repMax: z.number().int().min(1).max(200),
  youtubeUrl: z.string().max(200).optional(),
  patternId: z.string().max(60).optional(),
  param: z.string().max(200).optional(),
});
const envelopeSchema = z.object({
  schema: z.literal(ENVELOPE_SCHEMA),
  contractMajor: z.number().int().min(1),
  createdAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))),
  from: z.string().max(MAX_FROM).optional(),
  note: z.string().max(MAX_NOTE).optional(),
  routine: z.object({
    name: str(MAX_NAME),
    splitStyle: str(20),
    daysPerWeek: z.number().int().min(1).max(MAX_DAYS),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    days: z.array(z.object({ name: str(MAX_NAME), targetMuscles: z.array(str(40)).max(40), items: z.array(itemSchema).max(40) })).min(1).max(MAX_DAYS),
    schedule: z.unknown().optional(),
  }),
  customExercises: z.array(customSchema).max(60),
});

export type EnvelopeError = 'too_new' | 'invalid';

/** Checks and cleans decrypted JSON. Unknown fields are dropped; a custom reference with no matching exercise is `invalid`. */
export function parseEnvelope(raw: unknown, supportedMajor: number): Result<PlanEnvelope, EnvelopeError> {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r.schema === ENVELOPE_SCHEMA && typeof r.contractMajor === 'number' && r.contractMajor > supportedMajor) return { ok: false, error: 'too_new' };
  }
  const p = envelopeSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: 'invalid' };
  const d = p.data;
  const slugs = d.customExercises.map((c) => c.slug);
  if (new Set(slugs).size !== slugs.length) return { ok: false, error: 'invalid' };
  const known = new Set(slugs);
  for (const day of d.routine.days) for (const it of day.items) if (it.ref.kind === 'custom' && !known.has(it.ref.id)) return { ok: false, error: 'invalid' };
  for (const day of d.routine.days) for (const it of day.items) if (it.repMin > it.repMax) return { ok: false, error: 'invalid' };
  const schedule = parseSchedule(d.routine.schedule);
  const out: PlanEnvelope = {
    schema: ENVELOPE_SCHEMA,
    contractMajor: d.contractMajor,
    createdAt: d.createdAt,
    ...(d.from ? { from: d.from } : {}),
    ...(d.note ? { note: d.note } : {}),
    routine: {
      name: d.routine.name,
      splitStyle: d.routine.splitStyle,
      daysPerWeek: d.routine.daysPerWeek,
      weekdays: d.routine.weekdays,
      days: d.routine.days.map((day) => ({ name: day.name, targetMuscles: day.targetMuscles, items: day.items.map(cleanItem) })),
      ...(schedule ? { schedule } : {}),
    },
    customExercises: d.customExercises.map(cleanCustom),
  };
  return { ok: true, value: out };
}

function cleanItem(it: z.infer<typeof itemSchema>): RoutineItem {
  return {
    ref: it.ref.kind === 'lib' ? { kind: 'lib', slug: it.ref.slug } : { kind: 'custom', id: it.ref.id },
    sets: it.sets,
    repMin: it.repMin,
    repMax: it.repMax,
    restSec: it.restSec,
    ...(it.note ? { note: it.note } : {}),
    ...(it.tag ? { tag: it.tag } : {}),
    ...(it.supersetGroup ? { supersetGroup: it.supersetGroup } : {}),
    ...(it.variation ? { variation: it.variation } : {}),
    ...(it.setup ? { setup: it.setup } : {}),
  };
}

function cleanCustom(c: z.infer<typeof customSchema>): EnvelopeCustom {
  return {
    name: c.name,
    slug: c.slug,
    kind: c.kind,
    machineSlug: c.machineSlug,
    muscles: c.muscles.map((m) => ({ id: m.id, role: m.role, emphasis: m.emphasis })),
    repMin: c.repMin,
    repMax: c.repMax,
    ...(c.youtubeUrl ? { youtubeUrl: c.youtubeUrl } : {}),
    ...(c.patternId ? { patternId: c.patternId } : {}),
    ...(c.param ? { param: c.param } : {}),
  };
}

// ---------- build ----------
/** A stored custom exercise; items reference it by `id` (or the client id). Extra fields are ignored. */
export type CustomSource = CustomExerciseValue & { id?: string; client_id?: string };

export interface BuildInput {
  routine: Routine;
  customs: readonly CustomSource[];
  createdAt: string;
  contractMajor: number;
  from?: string;
  note?: string;
}

/**
 * Routine -> envelope. Built field by field from a whitelist, so nothing else on the routine (ids, archived flag, schedule meta,
 * history links) can leak. Only custom exercises the routine uses are included. An item whose custom exercise no longer exists is
 * dropped and counted in `dropped`.
 */
export function buildEnvelope(input: BuildInput): { envelope: PlanEnvelope; dropped: number } {
  const byRef = new Map<string, CustomSource>();
  for (const c of input.customs) {
    if (c.id) byRef.set(c.id, c);
    if (c.client_id) byRef.set(c.client_id, c);
  }
  const used = new Map<string, CustomSource>();
  let dropped = 0;
  const days: EnvelopeDay[] = input.routine.days.map((d: RoutineDay) => {
    const items: RoutineItem[] = [];
    for (const it of d.items) {
      if (it.ref.kind === 'custom') {
        const c = byRef.get(it.ref.id);
        if (!c) {
          dropped += 1;
          continue;
        }
        used.set(c.slug, c);
        items.push(copyItem(it, { kind: 'custom', id: c.slug }));
      } else items.push(copyItem(it, { kind: 'lib', slug: it.ref.slug }));
    }
    return { name: d.name, targetMuscles: [...d.targetMuscles], items };
  });
  const schedule = parseSchedule(input.routine.schedule);
  const from = (input.from ?? '').trim().slice(0, MAX_FROM);
  const note = (input.note ?? '').trim().slice(0, MAX_NOTE);
  const envelope: PlanEnvelope = {
    schema: ENVELOPE_SCHEMA,
    contractMajor: input.contractMajor,
    createdAt: input.createdAt,
    ...(from ? { from } : {}),
    ...(note ? { note } : {}),
    routine: {
      name: input.routine.name,
      splitStyle: input.routine.splitStyle,
      daysPerWeek: input.routine.daysPerWeek,
      weekdays: [...input.routine.weekdays],
      days,
      ...(schedule ? { schedule } : {}),
    },
    customExercises: [...used.values()].map(toEnvelopeCustom),
  };
  return { envelope, dropped };
}

function copyItem(it: RoutineItem, ref: RoutineItem['ref']): RoutineItem {
  return {
    ref,
    sets: it.sets,
    repMin: it.repMin,
    repMax: it.repMax,
    restSec: it.restSec,
    ...(it.note ? { note: it.note } : {}),
    ...(it.tag ? { tag: it.tag } : {}),
    ...(it.supersetGroup ? { supersetGroup: it.supersetGroup } : {}),
    ...(it.variation ? { variation: it.variation } : {}),
    ...(it.setup ? { setup: { ...it.setup } } : {}),
  };
}

function toEnvelopeCustom(c: CustomSource): EnvelopeCustom {
  return {
    name: c.name,
    slug: c.slug,
    kind: c.kind,
    machineSlug: c.machineSlug,
    muscles: c.muscles.map((m) => ({ id: m.id, role: m.role, emphasis: m.emphasis })),
    repMin: c.repMin,
    repMax: c.repMax,
    ...(c.youtubeUrl ? { youtubeUrl: c.youtubeUrl } : {}),
    ...(c.patternId ? { patternId: c.patternId } : {}),
    ...(c.param ? { param: c.param } : {}),
  };
}

// ---------- import ----------
export interface ImportContext {
  makeId: () => string;
  /** Every exercise slug in the dataset (not custom ones). */
  librarySlugs: ReadonlySet<string>;
  /** Library slugs the gym hides from this person. */
  hiddenSlugs: ReadonlySet<string>;
  /** Slugs already used by the person's own exercises. */
  takenCustomSlugs: Iterable<string>;
  takenRoutineNames: Iterable<string>;
}

export type ImportedCustom = CustomExerciseValue & { id: string };

export interface ImportFlags {
  /** Library slugs not in this person's dataset (kept in the routine as unavailable items, a swap prompt follows). */
  unavailable: string[];
  /** Library slugs the gym hides (kept too). */
  hidden: string[];
  /** Number of custom exercises that will be added. */
  customAdded: number;
}

export interface ImportPlan {
  routine: Routine;
  customs: ImportedCustom[];
  flags: ImportFlags;
}

const lowerKey = (s: string): string => s.trim().toLowerCase();

function freeRoutineName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(lowerKey));
  const b = base.trim().slice(0, MAX_NAME);
  if (!used.has(lowerKey(b))) return b;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${b.slice(0, MAX_NAME - suffix.length).trim()}${suffix}`;
    if (!used.has(lowerKey(candidate))) return candidate;
  }
}

/**
 * Envelope -> what to save. The routine is new and inactive, never replaces anything; every id is regenerated; custom exercises get
 * `my-<kebab>` slugs that do not collide with the library, the person's own exercises or each other. Never throws on unknown slugs.
 */
export function importPlan(env: PlanEnvelope, ctx: ImportContext): ImportPlan {
  const taken = new Set<string>([...ctx.librarySlugs, ...ctx.takenCustomSlugs]);
  const idBySlug = new Map<string, string>();
  const customs: ImportedCustom[] = env.customExercises.map((c) => {
    const slug = customSlug(c.name, taken);
    taken.add(slug);
    const id = ctx.makeId();
    idBySlug.set(c.slug, id);
    return { ...c, slug, id };
  });
  const unavailable = new Set<string>();
  const hidden = new Set<string>();
  const days: RoutineDay[] = env.routine.days.map((d) => ({
    id: ctx.makeId(),
    name: d.name,
    targetMuscles: [...d.targetMuscles],
    items: d.items.map((it): RoutineItem => {
      if (it.ref.kind === 'custom') return { ...it, ref: { kind: 'custom', id: idBySlug.get(it.ref.id) ?? it.ref.id } };
      if (!ctx.librarySlugs.has(it.ref.slug)) unavailable.add(it.ref.slug);
      else if (ctx.hiddenSlugs.has(it.ref.slug)) hidden.add(it.ref.slug);
      return { ...it };
    }),
  }));
  const routine: Routine = {
    id: ctx.makeId(),
    name: freeRoutineName(env.routine.name, ctx.takenRoutineNames),
    source: 'mine',
    daysPerWeek: env.routine.daysPerWeek,
    weekdays: [...env.routine.weekdays],
    splitStyle: env.routine.splitStyle,
    days,
    active: false,
    ...(env.routine.schedule ? { schedule: env.routine.schedule } : {}),
  };
  return { routine, customs, flags: { unavailable: [...unavailable], hidden: [...hidden], customAdded: customs.length } };
}
