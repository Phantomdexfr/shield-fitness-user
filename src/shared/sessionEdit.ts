// Editing a finished workout (Phase 92). Pure: every function returns a new session. Records and history are derived from
// sessions, so saving an edited session is all it takes for volume, PRs and the calendar to follow.

import { dayKeyStart, formatIst, parseIso, type DayKey } from './dates';
import { removeItem, type Session, type SessionItem, type SetLog } from './session';

const MIN = 60_000;
export const MAX_REPS = 999;
export const MAX_KG = 1000;

const sortedItems = (s: Session): SessionItem[] => [...s.items].sort((a, b) => a.order - b.order);

/** An item with sets is `done` (unless skipped); an item without sets that was `done` goes back to `todo`. */
function settle(it: SessionItem): SessionItem {
  if (it.status === 'skipped') return it;
  if (it.sets.length > 0) return { ...it, status: 'done' };
  return it.status === 'done' || it.status === 'doing' ? { ...it, status: 'todo' } : it;
}

function mapItem(s: Session, index: number, f: (it: SessionItem) => SessionItem): Session {
  const list = sortedItems(s);
  if (!list[index]) return s;
  return { ...s, items: list.map((it, i) => (i === index ? settle(f(it)) : it)) };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export type SetPatch = Partial<Pick<SetLog, 'weightKg' | 'reps' | 'tag'>>;

/** Changes one set. Weight 0 or less means bodyweight (null); reps are whole numbers 0 to 999. */
export function editSet(s: Session, itemIndex: number, setIndex: number, patch: SetPatch): Session {
  return mapItem(s, itemIndex, (it) => ({
    ...it,
    sets: it.sets.map((x, i) => {
      if (i !== setIndex) return x;
      const next: SetLog = { ...x };
      if ('weightKg' in patch) {
        const w = patch.weightKg ?? 0;
        next.weightKg = w > 0 ? Math.round(clamp(w, 0, MAX_KG) * 100) / 100 : null;
      }
      if (patch.reps != null) next.reps = clamp(Math.round(patch.reps), 0, MAX_REPS);
      if (patch.tag) next.tag = patch.tag;
      return next;
    }),
  }));
}

/** Adds a set after the last one, copying its weight and reps (or 0 kg x 10 on an empty exercise). */
export function addSetTo(s: Session, itemIndex: number, fallbackAt: string): Session {
  return mapItem(s, itemIndex, (it) => {
    const last = it.sets[it.sets.length - 1];
    const set: SetLog = { weightKg: last?.weightKg ?? null, reps: last?.reps ?? 10, tag: last?.tag === 'warmup' ? 'normal' : (last?.tag ?? 'normal'), doneAt: last?.doneAt ?? fallbackAt };
    const { skipReason: _r, ...rest } = it;
    return { ...rest, status: 'done', sets: [...it.sets, set] };
  });
}

/** Copies a set right after itself. */
export function duplicateSet(s: Session, itemIndex: number, setIndex: number): Session {
  return mapItem(s, itemIndex, (it) => {
    const src = it.sets[setIndex];
    if (!src) return it;
    return { ...it, sets: [...it.sets.slice(0, setIndex + 1), { ...src }, ...it.sets.slice(setIndex + 1)] };
  });
}

export function removeSetAt(s: Session, itemIndex: number, setIndex: number): Session {
  return mapItem(s, itemIndex, (it) => ({ ...it, sets: it.sets.filter((_, i) => i !== setIndex) }));
}

export const removeExercise = (s: Session, itemIndex: number): Session => removeItem(s, itemIndex).session;

/** New start (IST day, hour, minute) and duration in minutes; the end follows. Duration is kept at 0 or more. */
export function withTimes(s: Session, day: DayKey, hour: number, minute: number, durationMin: number): Session {
  const startMs = dayKeyStart(day) + clamp(Math.round(hour), 0, 23) * 60 * MIN + clamp(Math.round(minute), 0, 59) * MIN;
  const dur = clamp(Math.round(durationMin), 0, 24 * 60);
  return { ...s, startedAt: new Date(startMs).toISOString(), endedAt: new Date(startMs + dur * MIN).toISOString() };
}

/** The IST day, hour, minute and duration a session shows in the editor. */
export function timesOf(s: Session): { day: DayKey; hour: number; minute: number; durationMin: number } {
  const start = parseIso(s.startedAt) ?? 0;
  const end = s.endedAt ? (parseIso(s.endedAt) ?? start) : start;
  const text = formatIst(start);
  return { day: text.slice(0, 10), hour: Number(text.slice(11, 13)), minute: Number(text.slice(14, 16)), durationMin: Math.max(0, Math.round((end - start) / MIN)) };
}
