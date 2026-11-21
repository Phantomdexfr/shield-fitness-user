// Avoid / sore marks (Phase 48, contract/engines.md section 6). Pure. One mark per muscle: `avoid` hides exercises,
// `sore` only demotes them (SORE = -2 in the suggestion score). The test itself (`meetsMark`) is the one in
// suggest/score.ts, so exclusion, demotion, swaps and the day builder all read the same rule.

import type { Taxonomy } from './muscles';
import { meetsMark, SORE } from './suggest/score';
import type { MapRowTuple } from './weights';

export type MarkKind = 'avoid' | 'sore';
export interface MuscleMark {
  muscle: string;
  kind: MarkKind;
}

/** The row `client_id` for a muscle's mark in the `marks` store. */
export const markClientId = (muscle: string): string => `mk:${muscle}`;

/** Rows from the store (`{muscle, kind}`) -> clean marks. Unknown kinds and non-string muscles are dropped; one mark per muscle, `avoid` wins. */
export function parseMarks(rows: readonly { muscle?: unknown; kind?: unknown }[]): MuscleMark[] {
  const by = new Map<string, MarkKind>();
  for (const r of rows) {
    if (typeof r.muscle !== 'string' || r.muscle === '') continue;
    if (r.kind !== 'avoid' && r.kind !== 'sore') continue;
    if (by.get(r.muscle) !== 'avoid') by.set(r.muscle, r.kind);
  }
  return [...by].map(([muscle, kind]) => ({ muscle, kind })).sort((a, b) => (a.muscle < b.muscle ? -1 : a.muscle > b.muscle ? 1 : 0));
}

/** The two sets the suggestion context reads. */
export function marksToSets(marks: readonly MuscleMark[]): { avoid: Set<string>; sore: Set<string> } {
  const avoid = new Set<string>();
  const sore = new Set<string>();
  for (const m of marks) (m.kind === 'avoid' ? avoid : sore).add(m.muscle);
  return { avoid, sore };
}

/** Sets a muscle's mark (replacing any it had) or clears it. Returns a new list; the input is not changed. */
export function setMark(marks: readonly MuscleMark[], muscle: string, kind: MarkKind | 'clear'): MuscleMark[] {
  const rest = marks.filter((m) => m.muscle !== muscle);
  if (kind === 'clear') return rest;
  return [...rest, { muscle, kind }].sort((a, b) => (a.muscle < b.muscle ? -1 : a.muscle > b.muscle ? 1 : 0));
}

/**
 * The mark a muscle shows: its own, or the one on its core parent (marking `chest` marks upper and lower chest).
 * An own mark wins over the parent's; `avoid` wins over `sore` when both are inherited (there is only one parent, so this is the own-vs-parent rule).
 */
export function markOf(marks: readonly MuscleMark[], muscle: string, tax: Taxonomy): MarkKind | undefined {
  const own = marks.find((m) => m.muscle === muscle);
  if (own) return own.kind;
  const p = tax.parentOf(muscle);
  if (p && p !== muscle) return marks.find((m) => m.muscle === p)?.kind;
  return undefined;
}

export interface AvoidResult {
  /** An `avoid` mark meets the exercise: do not offer it. */
  excluded: boolean;
  /** Only a `sore` mark meets it (and nothing excludes it): demote. */
  sore: boolean;
  /** 0, or SORE (-2) when `sore`. */
  penalty: number;
}

/** engines.md 6 for one exercise's map rows. Mobility and stabiliser rows never meet a mark; a core mark covers its children. */
export function avoidFilter(rows: readonly MapRowTuple[], marks: readonly MuscleMark[], tax: Taxonomy): AvoidResult {
  const { avoid, sore } = marksToSets(marks);
  if (meetsMark(rows, avoid, tax)) return { excluded: true, sore: false, penalty: 0 };
  if (meetsMark(rows, sore, tax)) return { excluded: false, sore: true, penalty: SORE };
  return { excluded: false, sore: false, penalty: 0 };
}

/** Drops the items an `avoid` mark excludes. `rowsOf` gives an item's map rows. Order is kept. */
export function withoutAvoided<T>(items: readonly T[], rowsOf: (item: T) => readonly MapRowTuple[], marks: readonly MuscleMark[], tax: Taxonomy): T[] {
  const { avoid } = marksToSets(marks);
  if (avoid.size === 0) return [...items];
  return items.filter((it) => !meetsMark(rowsOf(it), avoid, tax));
}
