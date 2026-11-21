// Search (Phase 11). Pure: no loader, no DOM, no network. Built from the exercise rows plus machine and muscle names.
// Scoring follows contract/engines.md section 14 for the parts Phase 11 has data for (name, machine, muscle, category).
// Aliases and setup words arrive with `search.index.json` in Phase 20 (A47).

import type { ExerciseRow } from './loader';

/** Same function the compiler uses (scripts/compile-dataset.mjs `normText`): NFKD, strip marks, lower-case, non-alphanumerics -> one space. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Split on spaces; drop one-character tokens unless they are digits. */
export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length > 1 || /^[0-9]$/.test(t));
}

/** Edit distance with adjacent transpositions counted as one edit. Returns max + 1 when it is above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      }
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m] ?? max + 1;
}

/** Allowed edits for a query token: none under 4 characters, 1 for 4-6, 2 for 7 and more. */
export function maxEdits(len: number): number {
  if (len < 4) return 0;
  return len <= 6 ? 1 : 2;
}

// engines.md 14 step 3
const SCORE_EXACT = 1.0;
const SCORE_PREFIX = 0.85;
const SCORE_FUZZY = 0.6;
const FIELD_NAME = 1.0;
const FIELD_MACHINE = 0.6;
const FIELD_MUSCLE = 0.5;
const FIELD_CATEGORY = 0.3;
const ORDER_BONUS = 0.3;
const UNMATCHED_NAME_PENALTY = 0.05;

/** 1.0 exact, 0.85 prefix, 0.6 fuzzy, 0 no match (query token against one vocabulary token). */
export function matchScore(q: string, v: string): number {
  if (q === v) return SCORE_EXACT;
  if (v.startsWith(q)) return SCORE_PREFIX;
  const max = maxEdits(q.length);
  if (max > 0 && editDistance(q, v, max) <= max) return SCORE_FUZZY;
  return 0;
}

export interface SearchDoc {
  row: ExerciseRow;
  nameTokens: string[];
}

export interface SearchIndex {
  docs: SearchDoc[];
  /** Sorted unique tokens. */
  vocab: string[];
  /** token -> best field weight per document index. */
  postings: Map<string, Map<number, number>>;
}

export interface SearchNames {
  /** machine slug -> machine name */
  machines: ReadonlyMap<string, string>;
  /** muscle id -> muscle name */
  muscles: ReadonlyMap<string, string>;
}

/** Build the in-memory index. Pure; callers cache the result. */
export function buildSearchIndex(rows: readonly ExerciseRow[], names: SearchNames): SearchIndex {
  const docs: SearchDoc[] = [];
  const postings = new Map<string, Map<number, number>>();

  const add = (token: string, doc: number, weight: number): void => {
    let m = postings.get(token);
    if (!m) {
      m = new Map();
      postings.set(token, m);
    }
    if ((m.get(doc) ?? 0) < weight) m.set(doc, weight);
  };

  rows.forEach((row, d) => {
    const nameTokens = tokenize(row.name);
    docs.push({ row, nameTokens });
    for (const t of nameTokens) add(t, d, FIELD_NAME);
    const machineName = row.machine ? names.machines.get(row.machine) : undefined;
    if (machineName) for (const t of tokenize(machineName)) add(t, d, FIELD_MACHINE);
    for (const id of row.primary) {
      const n = names.muscles.get(id);
      if (n) for (const t of tokenize(n)) add(t, d, FIELD_MUSCLE);
    }
    for (const t of tokenize(`${row.category} ${row.subCategory}`)) add(t, d, FIELD_CATEGORY);
  });

  return { docs, vocab: [...postings.keys()].sort(), postings };
}

/** First index in the sorted `vocab` whose entry is >= `prefix`. */
function lowerBound(vocab: readonly string[], prefix: string): number {
  let lo = 0;
  let hi = vocab.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((vocab[mid] as string) < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** For one query token: document index -> best token score (match kind x field weight). */
function tokenHits(index: SearchIndex, q: string): Map<number, number> {
  const hits = new Map<number, number>();
  const take = (v: string, kind: number): void => {
    const post = index.postings.get(v);
    if (!post) return;
    for (const [d, w] of post) {
      const s = kind * w;
      if (s > (hits.get(d) ?? 0)) hits.set(d, s);
    }
  };
  // exact + prefix by binary search, then a scan while the prefix holds
  for (let i = lowerBound(index.vocab, q); i < index.vocab.length; i += 1) {
    const v = index.vocab[i] as string;
    if (!v.startsWith(q)) break;
    take(v, v === q ? SCORE_EXACT : SCORE_PREFIX);
  }
  // fuzzy only over the vocabulary, never over exercise rows
  const max = maxEdits(q.length);
  if (max > 0) {
    for (const v of index.vocab) {
      if (v.startsWith(q)) continue;
      if (editDistance(q, v, max) <= max) take(v, SCORE_FUZZY);
    }
  }
  return hits;
}

export type TrackName = 'beginner' | 'intermediate' | 'muscle_gain' | 'athlete' | 'fat_loss' | 'strength' | 'cardio';
export const TRACK_BITS: Record<TrackName, number> = {
  beginner: 1,
  intermediate: 2,
  muscle_gain: 4,
  athlete: 8,
  fat_loss: 16,
  strength: 32,
  cardio: 64,
};

export interface SearchFilters {
  /** Machine slug. */
  machine?: string;
  category?: string;
  kind?: string;
  difficulty?: number;
  beginner?: boolean;
  track?: TrackName;
  /** Slugs allowed by a muscle filter (computed by the caller from the muscle map). */
  slugs?: ReadonlySet<string>;
}

export function passesFilters(row: ExerciseRow, f: SearchFilters): boolean {
  if (f.slugs && !f.slugs.has(row.slug)) return false;
  if (f.machine !== undefined && row.machine !== f.machine) return false;
  if (f.category !== undefined && row.category !== f.category) return false;
  if (f.kind !== undefined && row.kind !== f.kind) return false;
  if (f.difficulty !== undefined && row.difficulty !== f.difficulty) return false;
  if (f.beginner !== undefined && row.beginner !== f.beginner) return false;
  if (f.track !== undefined && (row.tracks & TRACK_BITS[f.track]) === 0) return false;
  return true;
}

export interface SearchHit {
  row: ExerciseRow;
  score: number;
}

function byNameThenSlug(a: ExerciseRow, b: ExerciseRow): number {
  return a.name.length - b.name.length || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/**
 * Rank documents for a query. Empty query = browse: every row that passes the filters, A to Z by name.
 * Every query token must match (exact, prefix or typo); ties go to the shorter name, then the slug.
 */
export function runSearch(index: SearchIndex, query: string, filters: SearchFilters = {}): SearchHit[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) {
    return index.docs
      .filter((d) => passesFilters(d.row, filters))
      .map((d) => ({ row: d.row, score: 0 }))
      .sort((a, b) => a.row.name.localeCompare(b.row.name, 'en') || (a.row.slug < b.row.slug ? -1 : 1));
  }

  const perToken = qTokens.map((q) => tokenHits(index, q));
  const first = perToken[0] as Map<number, number>;
  const hits: SearchHit[] = [];
  for (const d of first.keys()) {
    const doc = index.docs[d] as SearchDoc;
    if (!passesFilters(doc.row, filters)) continue;
    let score = 0;
    let all = true;
    for (const m of perToken) {
      const s = m.get(d);
      if (s === undefined) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;

    // +0.3 when the query tokens appear in order in the name
    let pos = 0;
    let inOrder = true;
    for (const q of qTokens) {
      let found = -1;
      for (let i = pos; i < doc.nameTokens.length; i += 1) {
        if (matchScore(q, doc.nameTokens[i] as string) > 0) {
          found = i;
          break;
        }
      }
      if (found < 0) {
        inOrder = false;
        break;
      }
      pos = found + 1;
    }
    if (inOrder) score += ORDER_BONUS;

    // -0.05 per name token that no query token touches
    const unmatched = doc.nameTokens.filter((nt) => !qTokens.some((q) => matchScore(q, nt) > 0)).length;
    score -= unmatched * UNMATCHED_NAME_PENALTY;

    hits.push({ row: doc.row, score });
  }
  return hits.sort((a, b) => b.score - a.score || byNameThenSlug(a.row, b.row));
}
