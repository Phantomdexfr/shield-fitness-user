// Gym programs as a routine source (Phase 69). Pure: no DOM, no storage, no clock. Spec: docs/GYM_CONNECTION.md section 9.
// The four server tables are read as plain rows; [A-P69.1] the column names are guesses until the Admin DATA_MODEL is seen,
// and `parsePrograms` is the one place that reads them.

import type { Routine, RoutineDay, RoutineItem } from './routine';

export interface ProgramItem {
  ref: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  note?: string;
}
export interface ProgramDay {
  name: string;
  targetMuscles: string[];
  items: ProgramItem[];
}
export interface GymProgram {
  slug: string;
  name: string;
  daysPerWeek: number;
  weeks: number | null;
  goal: string;
  /** In `member_programs` for this member: shown even when not in `policy.programs_published`. */
  assigned: boolean;
  days: ProgramDay[];
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const int = (v: unknown, d: number, lo: number, hi: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const live = (r: Row): boolean => r.deleted_at == null || r.deleted_at === '';
const byPos = (a: Row, b: Row): number => int(a.position ?? a.day_index, 0, 0, 9999) - int(b.position ?? b.day_index, 0, 0, 9999);

/** Rows from `programs`, `program_days`, `program_items`, `member_programs` -> programs. Unapproved or deleted ones are dropped. */
export function parsePrograms(programs: Row[], days: Row[], items: Row[], assigned: Row[]): GymProgram[] {
  const mine = new Set(assigned.filter(live).map((r) => str(r.program_id)));
  const out: GymProgram[] = [];
  for (const p of programs) {
    const id = str(p.id);
    const slug = str(p.slug);
    if (!id || !slug || !live(p)) continue;
    if (p.status != null && str(p.status) !== 'approved') continue;
    const myDays = days.filter((d) => live(d) && str(d.program_id) === id).sort(byPos);
    out.push({
      slug,
      name: str(p.name) || slug,
      daysPerWeek: int(p.days_per_week, myDays.length || 3, 1, 7),
      weeks: p.weeks == null || p.weeks === '' ? null : int(p.weeks, 0, 1, 104) || null,
      goal: str(p.goal),
      assigned: mine.has(id),
      days: myDays.map((d) => ({
        name: str(d.name) || 'Day',
        targetMuscles: Array.isArray(d.target_muscles) ? (d.target_muscles as unknown[]).map(str).filter(Boolean) : [],
        items: items
          .filter((i) => live(i) && str(i.day_id) === str(d.id))
          .sort(byPos)
          .map((i) => {
            const repMin = int(i.rep_min, 8, 1, 100);
            const note = str(i.note);
            return { ref: str(i.exercise_ref), sets: int(i.sets, 3, 1, 20), repMin, repMax: Math.max(repMin, int(i.rep_max, repMin, 1, 100)), restSec: int(i.rest_sec, 90, 0, 900), ...(note ? { note } : {}) };
          })
          .filter((i) => i.ref !== ''),
      })),
    });
  }
  return out;
}

/** Programs the member may see: the published slugs plus anything assigned to them. */
export function visiblePrograms(all: readonly GymProgram[], published: readonly string[]): GymProgram[] {
  const pub = new Set(published);
  return all.filter((p) => p.assigned || pub.has(p.slug));
}

export interface ProgramState {
  /** Followed slugs -> the last program seen (kept so "Keep a copy" works after the gym ends it). */
  followed: Record<string, GymProgram>;
  ignored: string[];
}
export const emptyProgramState = (): ProgramState => ({ followed: {}, ignored: [] });

export interface ProgramLists {
  /** Cards to show (not ignored, not ended), with whether each is followed. */
  cards: { program: GymProgram; followed: boolean }[];
  ignored: GymProgram[];
  /** Followed but no longer visible: "Ended by your gym". */
  ended: GymProgram[];
}

export function classifyPrograms(visible: readonly GymProgram[], st: ProgramState): ProgramLists {
  const ign = new Set(st.ignored);
  const seen = new Set(visible.map((p) => p.slug));
  return {
    cards: visible.filter((p) => !ign.has(p.slug) || p.slug in st.followed).map((p) => ({ program: p, followed: p.slug in st.followed })),
    ignored: visible.filter((p) => ign.has(p.slug) && !(p.slug in st.followed)),
    ended: Object.values(st.followed).filter((p) => !seen.has(p.slug)),
  };
}

/** Local id of the read-only routine that mirrors a followed program. */
export const followedId = (slug: string): string => `gym-prog:${slug}`;
export const isFollowedRoutine = (r: { id: string; followed?: boolean }): boolean => r.followed === true || r.id.startsWith('gym-prog:');

const toItem = (i: ProgramItem): RoutineItem => ({ ref: { kind: 'lib', slug: i.ref }, sets: i.sets, repMin: i.repMin, repMax: i.repMax, restSec: i.restSec, ...(i.note ? { note: i.note } : {}) });

function toDays(p: GymProgram, makeId: () => string, keep?: Routine): RoutineDay[] {
  return p.days.map((d, n) => ({ id: keep?.days[n]?.id ?? makeId(), name: d.name, targetMuscles: [...d.targetMuscles], items: d.items.map(toItem) }));
}

/** Copy to mine: an editable normal routine, a snapshot that never changes again. */
export function copyProgram(p: GymProgram, makeId: () => string, takenNames: readonly string[]): Routine {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  let name = p.name.slice(0, 40);
  for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${p.name.slice(0, 36)} ${k}`;
  return { id: makeId(), name, source: `gym:${p.slug}`, daysPerWeek: Math.min(7, Math.max(1, p.days.length || p.daysPerWeek)), weekdays: [], splitStyle: 'custom', days: toDays(p, makeId), active: false };
}

/** Follow: the live read-only routine. Called again on every pull: the days are replaced, the active flag and schedule stay. */
export function followProgram(p: GymProgram, makeId: () => string, existing?: Routine): Routine {
  const base = existing ?? ({ id: followedId(p.slug), weekdays: [], active: false } as Partial<Routine>);
  return {
    ...(base as Routine),
    id: followedId(p.slug),
    name: p.name.slice(0, 40),
    source: 'gym',
    followed: true,
    daysPerWeek: Math.min(7, Math.max(1, p.days.length || p.daysPerWeek)),
    splitStyle: 'custom',
    days: toDays(p, makeId, existing),
  };
}

/** True when the followed routine's days differ from the program (the quiet "Updated by your gym" note). */
export function programChanged(existing: Routine, p: GymProgram): boolean {
  const sig = (days: { name: string; items: { sets: number; repMin: number; repMax: number; restSec: number; ref: unknown }[] }[]) =>
    JSON.stringify(days.map((d) => [d.name, d.items.map((i) => [i.sets, i.repMin, i.repMax, i.restSec, typeof i.ref === 'string' ? i.ref : (i.ref as { slug?: string; id?: string }).slug ?? (i.ref as { id?: string }).id])]));
  return sig(existing.days) !== sig(p.days.map((d) => ({ name: d.name, items: d.items.map(toItem) })));
}

/** An item is shown "Not available" when its exercise is not in the app or the gym hides it. Never crashes the day. */
export function itemAvailable(ref: string, known: ReadonlySet<string>, hidden: ReadonlySet<string>): boolean {
  return known.has(ref) && !hidden.has(ref);
}
