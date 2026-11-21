// Personal records, three metrics + e1RM (Phase 37): contract/engines.md section 17. Pure, no clock.
// Per exercise (or per exercise + grip when the person turns "separate PRs per grip" on): heaviest set (`weight`), most reps in
// a set at any weight (`reps`), biggest single set weight x reps (`volume`), best Epley (`e1rm`). Each metric is beaten on its
// own, a tie is not a PR, warm-up and drop sets are ignored, a bodyweight set (no weight) only counts for `reps`.
// First-log rule [A-P37.1]: no earlier result under the key -> baseline, no PR, unless the exercise has history elsewhere.
// This is the board's rule; `engine/pr.ts` (Phase 36) is the overload doc's session-volume reading and is kept for the engine.

import { istDayKey } from './dates';
import { e1rm } from './engine/oneRm';
import { setWeight, workingSets, type ExerciseResult } from './engine/sessionStats';
import { refId, type Session } from './session';
import { roundKg } from './units';

export type PRMetric = 'weight' | 'reps' | 'volume' | 'e1rm';
export const PR_METRICS: readonly PRMetric[] = ['weight', 'reps', 'volume', 'e1rm'];

export interface Records {
  weight: number | null;
  reps: number | null;
  volume: number | null;
  e1rm: number | null;
}

export interface PRHit {
  metric: PRMetric;
  value: number;
  /** null when the exercise had history but this metric had no value yet (for example the first weighted set after bodyweight sets). */
  previous: number | null;
}

const EMPTY: Records = { weight: null, reps: null, volume: null, e1rm: null };

/** Bests over the working sets of the given results. Bodyweight sets (weight 0 or null) only feed `reps`. */
export function recordsOf(results: readonly ExerciseResult[]): Records {
  const r: Records = { ...EMPTY };
  const up = (m: PRMetric, v: number | null) => {
    if (v != null && v > 0 && (r[m] == null || v > (r[m] as number))) r[m] = v;
  };
  for (const res of results) {
    for (const s of workingSets(res.sets)) {
      const reps = s.reps as number;
      const w = setWeight(s);
      up('reps', reps);
      if (w > 0) {
        up('weight', roundKg(w));
        up('volume', roundKg(w * reps));
        up('e1rm', e1rm(w, reps));
      }
    }
  }
  return r;
}

export interface DetectOptions {
  /** The exercise has results under another key (another grip), so a first value here is not a baseline. */
  hasOtherHistory?: boolean;
}

/** PRs that `current` sets over `history` (any order). Order of the result: weight, reps, volume, e1rm. */
export function detectPRs(history: readonly ExerciseResult[], current: ExerciseResult, o: DetectOptions = {}): PRHit[] {
  const past = history.filter((h) => workingSets(h.sets).length > 0);
  if (past.length === 0 && !o.hasOtherHistory) return [];
  const before = recordsOf(past);
  const now = recordsOf([current]);
  const hits: PRHit[] = [];
  for (const m of PR_METRICS) {
    const v = now[m];
    if (v == null) continue;
    const p = before[m];
    if (p == null || v > p) hits.push({ metric: m, value: v, previous: p });
  }
  return hits;
}

/** Board key: the slug, plus the grip when the person separates PRs per grip. Same format as `prKey` in the exercise page model. */
export function recordKey(slug: string, setup: Record<string, unknown> | undefined, separateByGrip: boolean): string {
  const grip = setup?.grip;
  return separateByGrip && typeof grip === 'string' && grip ? `${slug}#grip:${grip}` : slug;
}

/** The exercise a key belongs to (drops the grip part). */
export const slugOfKey = (key: string): string => key.split('#')[0] as string;

interface Entry {
  key: string;
  ref: string;
  result: ExerciseResult;
  dayKey: string;
}

/** Done work of finished sessions, oldest first. A session counts when it has an end time; skipped and empty items are dropped. */
function entriesOf(sessions: readonly Session[], separateByGrip: boolean, customSlug: (id: string) => string | undefined): Entry[] {
  const out: Entry[] = [];
  const ordered = sessions.filter((s) => s.endedAt).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const s of ordered) {
    for (const it of s.items) {
      if (it.status === 'skipped' || workingSets(it.sets).length === 0) continue;
      const slug = it.ref.kind === 'lib' ? it.ref.slug : customSlug(it.ref.id) ?? refId(it.ref);
      out.push({ key: recordKey(slug, it.setup, separateByGrip), ref: refId(it.ref), result: { sets: it.sets }, dayKey: istDayKey(Date.parse(s.startedAt)) });
    }
  }
  return out;
}

export interface BoardCard {
  key: string;
  slug: string;
  /** Grip name when the key is per grip. */
  grip?: string;
  records: Records;
  /** IST day key of the session that set each current record (the first value counts as its date). */
  dates: Record<PRMetric, string | null>;
  sessions: number;
  lastDay: string;
}

/** One card per key, most recently trained first (ties by key). */
export function buildBoard(sessions: readonly Session[], separateByGrip = false, customSlug: (id: string) => string | undefined = () => undefined): BoardCard[] {
  const cards = new Map<string, BoardCard>();
  for (const e of entriesOf(sessions, separateByGrip, customSlug)) {
    let c = cards.get(e.key);
    if (!c) {
      const grip = e.key.includes('#grip:') ? e.key.split('#grip:')[1] : undefined;
      c = { key: e.key, slug: slugOfKey(e.key), ...(grip ? { grip } : {}), records: { ...EMPTY }, dates: { weight: null, reps: null, volume: null, e1rm: null }, sessions: 0, lastDay: e.dayKey };
      cards.set(e.key, c);
    }
    const now = recordsOf([e.result]);
    for (const m of PR_METRICS) {
      const v = now[m];
      if (v != null && (c.records[m] == null || v > (c.records[m] as number))) {
        c.records[m] = v;
        c.dates[m] = e.dayKey;
      }
    }
    c.sessions += 1;
    c.lastDay = e.dayKey;
  }
  return [...cards.values()].sort((a, b) => (a.lastDay === b.lastDay ? a.key.localeCompare(b.key) : a.lastDay < b.lastDay ? 1 : -1));
}

export interface SessionPR {
  key: string;
  slug: string;
  ref: string;
  hits: PRHit[];
}

/**
 * PRs a session sets, judged against the finished sessions that started before it (the session itself is never part of its own
 * history). Used by the logger toast and the session summary. Several items on the same key are judged in order.
 */
export function sessionPRs(session: Session, others: readonly Session[], separateByGrip = false, customSlug: (id: string) => string | undefined = () => undefined): SessionPR[] {
  const startMs = Date.parse(session.startedAt);
  const earlier = others.filter((s) => s.id !== session.id && s.endedAt && Date.parse(s.startedAt) < startMs);
  const history = entriesOf(earlier, separateByGrip, customSlug);
  const mine = entriesOf([{ ...session, endedAt: session.endedAt ?? session.startedAt }], separateByGrip, customSlug);
  const out: SessionPR[] = [];
  for (const e of mine) {
    const own = history.filter((h) => h.key === e.key).map((h) => h.result);
    const elsewhere = history.some((h) => h.key !== e.key && slugOfKey(h.key) === slugOfKey(e.key));
    const hits = detectPRs(own, e.result, { hasOtherHistory: elsewhere });
    if (hits.length) out.push({ key: e.key, slug: slugOfKey(e.key), ref: e.ref, hits });
    history.push(e);
  }
  return out;
}
