// Pure helpers for the recovery and marks screens (Phase 49). No DOM, no store.

import type { Taxonomy } from '../../shared/muscles';
import { AXES, recoveryStates, type AxisBalance, type AxisId, type RecoveryInfo, type RecoveryState } from '../../shared/recovery';
import { setMark, type MarkKind, type MuscleMark } from '../../shared/avoid';

/** Worst first: what needs rest at the top of the list. */
export const STATE_ORDER: readonly RecoveryState[] = ['fatigued', 'recovering', 'ready', 'fresh'];

/** The figure's recovery colours: the same ids the Body Picker draws (`sf-body__u--rec-<state>`). */
export const stateClassOf = (s: RecoveryState): string => `sf-body__u--rec-${s}`;

/**
 * Parent ids drawn only through their children (the taxonomy says `regions: none`). Every other parent (back, abs, glutes,
 * quads, calves) is a muscle in its own right and is listed ([A-P49.3]). `readyMuscles` in `src/shared/recovery.ts` leaves
 * all parents out, which would hide squat work, so the screens use `isListed` instead.
 */
export const GROUP_ONLY: ReadonlySet<string> = new Set(['chest', 'shoulders', 'traps']);

export const isListed = (id: string, tax: Taxonomy): boolean => tax.childrenOf(id).length === 0 || !GROUP_ONLY.has(id);

export interface RecRow {
  id: string;
  state: RecoveryState;
  hoursLeft: number;
  hoursSince: number | null;
}

/** One row per listed muscle that has a clock, worst state first, longest wait first, ties by id. */
export function recRows(map: Readonly<Record<string, RecoveryInfo>>, tax: Taxonomy): RecRow[] {
  const rows: RecRow[] = [];
  for (const id of tax.ids) {
    const i = map[id];
    if (!i || !isListed(id, tax)) continue;
    rows.push({ id, state: i.state, hoursLeft: i.hoursLeft, hoursSince: i.hoursSince });
  }
  return rows.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || b.hoursLeft - a.hoursLeft || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Listed muscles that are `ready` or `fresh` now, in taxonomy order. */
export function readyList(map: Readonly<Record<string, RecoveryInfo>>, tax: Taxonomy): string[] {
  return tax.ids.filter((id) => {
    const i = map[id];
    return !!i && isListed(id, tax) && (i.state === 'ready' || i.state === 'fresh');
  });
}

/** The id -> state record for the figure (parents included, the figure lets a child's own entry win). */
export const figureStates = (map: Readonly<Record<string, RecoveryInfo>>): Record<string, RecoveryState> => recoveryStates(map);

/** Count of muscles per state (listed muscles only), for the legend. */
export function stateCounts(rows: readonly RecRow[]): Record<RecoveryState, number> {
  const out: Record<RecoveryState, number> = { fatigued: 0, recovering: 0, ready: 0, fresh: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}

/** "How long until ready" as a count and a unit: hours under 48, else whole days rounded up. */
export function waitText(hoursLeft: number): { unit: 'h' | 'd'; n: number } {
  if (hoursLeft < 48) return { unit: 'h', n: Math.max(1, Math.ceil(hoursLeft)) };
  return { unit: 'd', n: Math.ceil(hoursLeft / 24) };
}

export interface BalanceLine {
  axis: AxisId;
  /** `kind` picks the sentence. For `lags`, `lead` is the smaller side and `trail` the bigger one (names from AXES). */
  kind: 'no_data' | 'balanced' | 'lags';
  lead: string;
  trail: string;
  percent: number | null;
}

/** One line per axis: the smaller side is named with its percent of the bigger side ("pull is 40% of push"). */
export function balanceLines(b: Readonly<Record<AxisId, AxisBalance>>): BalanceLine[] {
  return (Object.keys(AXES) as AxisId[]).map((axis) => {
    const x = b[axis];
    const { a, b: bb } = AXES[axis];
    if (x.verdict === 'no_data') return { axis, kind: 'no_data', lead: a, trail: bb, percent: null };
    if (x.verdict === 'balanced') return { axis, kind: 'balanced', lead: a, trail: bb, percent: x.percent };
    // The verdict names the bigger side; the line names the smaller (lagging) side first: "pull is 40% of push".
    return x.verdict === 'a_leads'
      ? { axis, kind: 'lags', lead: bb, trail: a, percent: x.percent }
      : { axis, kind: 'lags', lead: a, trail: bb, percent: x.percent };
  });
}

// ---------------------------------------------------------------- marks

/** The figure's mark record: id -> avoid | sore. */
export function markRecord(marks: readonly MuscleMark[]): Record<string, MarkKind> {
  const out: Record<string, MarkKind> = {};
  for (const m of marks) out[m.muscle] = m.kind;
  return out;
}

/** Marked muscles, avoid first, then by id (the text list under the figure). */
export function markRows(marks: readonly MuscleMark[]): MuscleMark[] {
  return [...marks].sort((a, b) => (a.kind === b.kind ? (a.muscle < b.muscle ? -1 : a.muscle > b.muscle ? 1 : 0) : a.kind === 'avoid' ? -1 : 1));
}

/** What the sheet offers for a muscle that currently has `current`: the two marks and Clear (only when marked). */
export function markChoices(current: MarkKind | undefined): Array<MarkKind | 'clear'> {
  return current ? ['avoid', 'sore', 'clear'] : ['avoid', 'sore'];
}

/** The list after tapping a choice: the same muscle never keeps two marks, and tapping the mark it already has clears it. */
export function applyChoice(marks: readonly MuscleMark[], muscle: string, current: MarkKind | undefined, choice: MarkKind | 'clear'): MuscleMark[] {
  return setMark(marks, muscle, choice === current ? 'clear' : choice);
}
