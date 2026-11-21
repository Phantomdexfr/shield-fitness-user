// Fuzzy search (Phase 20). Spec: contract/engines.md section 14. Pure: no loader, no DOM, no network, no clock, no library.
// Input is the compiled `search.index.json` (Phase 10) plus optional extra documents (custom exercises).
// Deterministic: the same index and query always give the same result in the same order.

import { editDistance, maxEdits, normalizeText } from './search';

/** Shape of the compiled `search.index.json` (docs hold token ids into `vocab`; field order is `cols`). */
export interface RawSearchIndex {
  vocab: string[];
  cols: string[];
  docs: Array<[string, string, ...number[][]]>;
  aliases: Array<[string, string, string]>;
  setupTerms: Array<[string, string, string]>;
}

/** Loose check of the loaded file. Returns null when it does not look like a search index. */
export function parseRawIndex(raw: unknown): RawSearchIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RawSearchIndex>;
  if (!Array.isArray(r.vocab) || !Array.isArray(r.docs) || !Array.isArray(r.aliases) || !Array.isArray(r.setupTerms)) return null;
  return r as RawSearchIndex;
}

/** One document as token strings per field. Used for the extra (custom) documents. */
export interface FuzzyDocInput {
  type: 'e' | 'm';
  slug: string;
  name: string[];
  alias: string[];
  machine: string[];
  muscle: string[];
  setup: string[];
  category: string[];
}

// engines.md 14 step 3
const SCORE_EXACT = 1.0;
const SCORE_PREFIX = 0.85;
const SCORE_FUZZY = 0.6;
const FIELD_WEIGHT = { name: 1.0, alias: 0.9, machine: 0.6, muscle: 0.5, setup: 0.5, category: 0.3 } as const;
const ORDER_BONUS = 0.3;
const UNMATCHED_NAME_PENALTY = 0.05;
/** Words that only decorate a setup word ("reverse grip", "wide stance"): never required to match. */
const FILLER = new Set(['grip', 'grips', 'handle', 'handles', 'width', 'stance', 'position']);

type Field = keyof typeof FIELD_WEIGHT;
const FIELDS: Field[] = ['name', 'alias', 'machine', 'muscle', 'setup', 'category'];

interface FDoc {
  type: 'e' | 'm';
  slug: string;
  nameTokens: string[];
  /** Length of the normalised name (tie-break: shorter first). */
  nameLen: number;
  setupSet: Set<string>;
}

export interface FuzzyIndex {
  docs: FDoc[];
  /** Sorted unique tokens. */
  vocab: string[];
  /** token -> document index -> best field weight. */
  postings: Map<string, Map<number, number>>;
  /** Alias phrase (normalised, space separated) -> canonical tokens. */
  aliasMap: Map<string, string[]>;
  aliasMaxLen: number;
  setupTerms: Array<{ tokens: string[]; axis: string; value: string }>;
  setupMaxLen: number;
}

/** Build the in-memory index. Pure; callers cache the result. */
export function buildFuzzyIndex(raw: RawSearchIndex, extra: readonly FuzzyDocInput[] = []): FuzzyIndex {
  const docs: FDoc[] = [];
  const postings = new Map<string, Map<number, number>>();
  const add = (token: string, d: number, w: number): void => {
    let m = postings.get(token);
    if (!m) {
      m = new Map();
      postings.set(token, m);
    }
    if ((m.get(d) ?? 0) < w) m.set(d, w);
  };
  const push = (type: 'e' | 'm', slug: string, f: Record<Field, string[]>): void => {
    const d = docs.length;
    docs.push({ type, slug, nameTokens: f.name, nameLen: f.name.join(' ').length, setupSet: new Set(f.setup) });
    for (const field of FIELDS) for (const tok of f[field]) add(tok, d, FIELD_WEIGHT[field]);
  };

  const colIndex = FIELDS.map((f) => raw.cols.indexOf(f));
  for (const row of raw.docs) {
    const type = row[0] === 'm' ? 'm' : 'e';
    const f = {} as Record<Field, string[]>;
    FIELDS.forEach((field, i) => {
      const ids = (row[colIndex[i] as number] as unknown as number[] | undefined) ?? [];
      f[field] = ids.map((id) => raw.vocab[id] as string).filter((s) => s !== undefined);
    });
    push(type, row[1], f);
  }
  for (const x of extra) push(x.type, x.slug, { name: x.name, alias: x.alias, machine: x.machine, muscle: x.muscle, setup: x.setup, category: x.category });

  const aliasMap = new Map<string, string[]>();
  let aliasMaxLen = 1;
  for (const [alias, canonical] of raw.aliases) {
    const from = normalizeText(alias).split(' ').filter(Boolean);
    const to = normalizeText(canonical).split(' ').filter(Boolean);
    if (from.length === 0 || to.length === 0) continue;
    const key = from.join(' ');
    if (key === to.join(' ') || aliasMap.has(key)) continue;
    aliasMap.set(key, to);
    if (from.length > aliasMaxLen) aliasMaxLen = from.length;
  }
  const setupTerms = raw.setupTerms.map(([phrase, axis, value]) => ({ tokens: normalizeText(phrase).split(' ').filter(Boolean), axis, value }));
  const setupMaxLen = setupTerms.reduce((n, s) => Math.max(n, s.tokens.length), 1);

  return { docs, vocab: [...postings.keys()].sort(), postings, aliasMap, aliasMaxLen, setupTerms, setupMaxLen };
}

/** Normalise a query, expand aliases (longest phrase first, one pass), drop one-character tokens except digits. */
export function expandQuery(index: FuzzyIndex, query: string): string[] {
  const raw = normalizeText(query).split(' ').filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < raw.length) {
    let used = 0;
    for (let len = Math.min(index.aliasMaxLen, raw.length - i); len >= 1; len -= 1) {
      const hit = index.aliasMap.get(raw.slice(i, i + len).join(' '));
      if (hit) {
        out.push(...hit);
        used = len;
        break;
      }
    }
    if (used === 0) {
      out.push(raw[i] as string);
      used = 1;
    }
    i += used;
  }
  // drop one-character words (except digits) and a word repeated right after an expansion ("ez" -> "ez bar", then "bar")
  return out.filter((t, i) => (t.length > 1 || /^[0-9]$/.test(t)) && t !== out[i - 1]);
}

interface QToken {
  text: string;
  /** Must match for a document to qualify (pass 1). */
  required: boolean;
  /** Part of a setup word; made optional in the second pass. */
  setup: boolean;
}

export interface SetupTermHit {
  axis: string;
  value: string;
  tokens: string[];
}

/** Find setup words in the token list (longest phrase first). Also returns which token positions they cover. */
function findSetup(index: FuzzyIndex, tokens: readonly string[]): { terms: SetupTermHit[]; covered: Set<number> } {
  const terms: SetupTermHit[] = [];
  const covered = new Set<number>();
  let i = 0;
  while (i < tokens.length) {
    let used = 0;
    for (let len = Math.min(index.setupMaxLen, tokens.length - i); len >= 1 && used === 0; len -= 1) {
      const span = tokens.slice(i, i + len);
      const matches = index.setupTerms.filter((s) => s.tokens.length === len && s.tokens.every((tk, k) => tk === span[k]));
      if (matches.length > 0) {
        for (const m of matches) terms.push({ axis: m.axis, value: m.value, tokens: m.tokens });
        for (let k = i; k < i + len; k += 1) covered.add(k);
        used = len;
      }
    }
    i += used === 0 ? 1 : used;
  }
  return { terms, covered };
}

/** Best match of one query token over the vocabulary: document index -> token score x field weight. */
function tokenHits(index: FuzzyIndex, q: string): Map<number, number> {
  const hits = new Map<number, number>();
  const max = maxEdits(q.length);
  for (const v of index.vocab) {
    let kind = 0;
    if (v === q) kind = SCORE_EXACT;
    else if (v.startsWith(q)) kind = SCORE_PREFIX;
    else if (max > 0 && editDistance(q, v, max) <= max) kind = SCORE_FUZZY;
    if (kind === 0) continue;
    const post = index.postings.get(v);
    if (!post) continue;
    for (const [d, w] of post) {
      const s = kind * w;
      if (s > (hits.get(d) ?? 0)) hits.set(d, s);
    }
  }
  return hits;
}

/** Does query token `q` touch vocabulary token `v` at all (exact, prefix or typo)? */
function touches(q: string, v: string): boolean {
  if (v.startsWith(q)) return true;
  const max = maxEdits(q.length);
  return max > 0 && editDistance(q, v, max) <= max;
}

export interface FuzzyHit {
  type: 'e' | 'm';
  slug: string;
  score: number;
}

export interface SuggestedSetup {
  axis: string;
  value: string;
}

export interface FuzzyOptions {
  /** Filters from the caller: return false to drop a document before ranking. */
  accept?: (doc: { type: 'e' | 'm'; slug: string }) => boolean;
  /** Skip the "did you mean" work (used internally). */
  noSuggest?: boolean;
}

export interface FuzzyResult {
  /** Ranked, best first. Exercises and machines together; callers split by `type`. */
  hits: FuzzyHit[];
  /** Query tokens after alias expansion (what was actually searched). */
  tokens: string[];
  /** Set when the query named a setup value that the top hit offers. */
  suggestedSetup?: SuggestedSetup;
  /** A corrected query that finds something, when a typed word is not a known word. */
  didYouMean?: string;
}

function rank(index: FuzzyIndex, qTokens: QToken[], accept: FuzzyOptions['accept'], strictSetup: boolean): FuzzyHit[] {
  const perToken = qTokens.map((q) => tokenHits(index, q.text));
  const needed = qTokens.map((q, i) => (q.required && (strictSetup || !q.setup) ? i : -1)).filter((i) => i >= 0);
  // candidates: documents matched by the first required token (or any token when none is required)
  const seedIdx = needed.length > 0 ? (needed[0] as number) : 0;
  const hits: FuzzyHit[] = [];
  for (const d of (perToken[seedIdx] as Map<number, number>).keys()) {
    const doc = index.docs[d] as FDoc;
    if (accept && !accept({ type: doc.type, slug: doc.slug })) continue;
    if (!needed.every((i) => (perToken[i] as Map<number, number>).has(d))) continue;
    let score = 0;
    for (const m of perToken) score += m.get(d) ?? 0;

    // +0.3 when the (non-filler) query tokens appear in order in the name
    let pos = 0;
    let inOrder = true;
    for (const q of qTokens) {
      if (!q.required) continue;
      let found = -1;
      for (let i = pos; i < doc.nameTokens.length; i += 1) {
        if (touches(q.text, doc.nameTokens[i] as string)) {
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
    const unmatched = doc.nameTokens.filter((nt) => !qTokens.some((q) => touches(q.text, nt))).length;
    score -= unmatched * UNMATCHED_NAME_PENALTY;
    hits.push({ type: doc.type, slug: doc.slug, score: Math.round(score * 1e6) / 1e6 });
  }
  const len = new Map<string, number>(index.docs.map((x) => [`${x.type}:${x.slug}`, x.nameLen]));
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      (len.get(`${a.type}:${a.slug}`) as number) - (len.get(`${b.type}:${b.slug}`) as number) ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) ||
      (a.type < b.type ? -1 : 1),
  );
}

/** Closest known word for a typed word (edit distance within the allowance); ties go to the commoner word, then A to Z. */
function closestWord(index: FuzzyIndex, q: string): string | undefined {
  const max = maxEdits(q.length);
  if (max === 0 || /^[0-9]+$/.test(q)) return undefined;
  let best: { v: string; dist: number; n: number } | undefined;
  for (const v of index.vocab) {
    const dist = editDistance(q, v, max);
    if (dist > max) continue;
    // commoner = used in more document names or aliases (weight >= 0.9), so "latt" gives "lat", not "lats"
    let n = 0;
    for (const w of index.postings.get(v)?.values() ?? []) if (w >= FIELD_WEIGHT.alias) n += 1;
    if (!best || dist < best.dist || (dist === best.dist && n > best.n)) best = { v, dist, n };
  }
  return best?.v;
}

/** The query with each unknown word replaced by its closest known word, or undefined when nothing needs fixing. */
function correction(index: FuzzyIndex, tokens: readonly string[]): string | undefined {
  const known = new Set(index.vocab);
  let changed = false;
  const fixed = tokens.map((q) => {
    if (known.has(q) || /^[0-9]+$/.test(q)) return q;
    // a word still being typed is not a typo
    const start = index.vocab.findIndex((v) => v.startsWith(q));
    if (start >= 0) return q;
    const c = closestWord(index, q);
    if (c && c !== q) {
      changed = true;
      return c;
    }
    return q;
  });
  return changed ? fixed.join(' ') : undefined;
}

/**
 * Search the index. Every (non-filler, non-setup) query token must match some document token (exact, prefix or typo).
 * Setup words ("reverse", "rope") are required too, but when that finds nothing they become a bonus only.
 * An empty query returns no hits (browsing is the caller's job).
 */
export function fuzzySearch(index: FuzzyIndex, query: string, opts: FuzzyOptions = {}): FuzzyResult {
  const tokens = expandQuery(index, query);
  if (tokens.length === 0) return { hits: [], tokens };

  const { terms: expandedTerms, covered } = findSetup(index, tokens);
  // setup words are also read from the words as typed: an alias may rewrite "rope pushdown" and lose "rope"
  const typed = normalizeText(query).split(' ').filter((x) => x.length > 1 || /^[0-9]$/.test(x));
  const terms = [...findSetup(index, typed).terms, ...expandedTerms];
  const qTokens: QToken[] = tokens.map((text, i) => {
    const isSetup = covered.has(i);
    const filler = !isSetup && FILLER.has(text) && (covered.has(i - 1) || covered.has(i + 1));
    return { text, setup: isSetup, required: !filler };
  });
  // a query made only of filler words falls back to requiring them
  if (qTokens.every((q) => !q.required)) qTokens.forEach((q) => (q.required = true));

  let hits = rank(index, qTokens, opts.accept, true);
  if (hits.length === 0 && qTokens.some((q) => q.setup) && qTokens.some((q) => !q.setup && q.required)) {
    hits = rank(index, qTokens, opts.accept, false);
  }

  const result: FuzzyResult = { hits, tokens };

  // suggested setup: first query setup word that the top exercise offers
  const top = hits.find((h) => h.type === 'e');
  if (top && terms.length > 0) {
    const doc = index.docs.find((d) => d.type === 'e' && d.slug === top.slug);
    const offered = terms.find((s) => s.tokens.every((tk) => doc?.setupSet.has(tk)));
    if (offered) result.suggestedSetup = { axis: offered.axis, value: offered.value };
  }

  if (!opts.noSuggest) {
    const fixed = correction(index, tokens);
    if (fixed !== undefined) {
      const again = fuzzySearch(index, fixed, { accept: opts.accept, noSuggest: true });
      if (again.hits.length > 0) result.didYouMean = fixed;
    }
  }
  return result;
}
