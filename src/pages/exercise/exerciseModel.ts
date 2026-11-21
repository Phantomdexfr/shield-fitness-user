// Exercise page + machine page model (Phase 21). Pure: no DOM, no store, no dataset imports. The repo
// (`src/data/repos/exercisePage.ts`) loads data and passes it in. Spec: docs/EXERCISE_PAGE.md.

import type { ExerciseRow, ImageUrl, MapRow } from '../../dataset/loader';

// ---------- YouTube button ----------

const YT_SEARCH = 'https://www.youtube.com/results?search_query=';

/** `https://www.youtube.com/results?search_query=<name>+exercise+form`: words joined by +, each URL-encoded. */
export function youtubeSearchUrl(name: string): string {
  const words = `${name} exercise form`.trim().split(/\s+/).filter(Boolean).map((w) => encodeURIComponent(w));
  return YT_SEARCH + words.join('+');
}

/** An override is used only when it is a well-formed http(s) URL; anything else is ignored (never a script/data URL). */
export function cleanLink(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  try {
    return new URL(s).href;
  } catch {
    return undefined;
  }
}

export interface YoutubeOverrides {
  /** Gym policy override (connected mode). Wins over the user's own link. */
  policy?: string | null;
  /** The user's own link on a custom exercise. */
  custom?: string | null;
}

/** Policy override > the user's own link > the search URL. */
export function resolveYoutubeUrl(name: string, o: YoutubeOverrides = {}): string {
  return cleanLink(o.policy) ?? cleanLink(o.custom) ?? youtubeSearchUrl(name);
}

// ---------- photos ----------

export interface GalleryPhoto {
  thumb: string;
  /** Detail url of the same angle, or the thumb when there is no detail. */
  detail: string;
  alt: string;
  primary: boolean;
}

const stem = (url: string): string => url.replace(/\.(thumb|detail)\.[a-z0-9]+$/i, '');

/** Primary photo first, then other angles; at most `max` (default 4). Thumbs are shown, the detail opens on tap. */
export function galleryPhotos(urls: readonly ImageUrl[], max = 4): GalleryPhoto[] {
  const thumbs = urls.filter((u) => u.variant === 'thumb');
  const details = new Map(urls.filter((u) => u.variant === 'detail').map((u) => [stem(u.url), u.url]));
  const ordered = [...thumbs.filter((u) => u.primary), ...thumbs.filter((u) => !u.primary)];
  return ordered.slice(0, max).map((u) => ({ thumb: u.url, detail: details.get(stem(u.url)) ?? u.url, alt: u.alt, primary: u.primary }));
}

/** The photo a card shows: primary thumb, else any thumb, else the first url. */
export function cardPhoto(urls: readonly ImageUrl[]): string | undefined {
  return (urls.find((u) => u.variant === 'thumb' && u.primary) ?? urls.find((u) => u.variant === 'thumb') ?? urls[0])?.url;
}

// ---------- muscles ----------

export type RoleGroup = 'primary' | 'secondary' | 'stabiliser';
export interface MuscleLine {
  id: string;
  emphasis: 'h' | 'm' | 'l';
  contested: boolean;
}

const GROUP: Record<string, RoleGroup> = { p: 'primary', s: 'secondary', t: 'stabiliser' };
const ORDER = { h: 0, m: 1, l: 2 } as const;
const CONTESTED = /contested|unconfirmed|mixed/i;

/** Map rows -> the text lists. Mobility rows (`m`) are not listed; a muscle appears once, under its strongest role. A note that says "contested" etc. marks the line. */
export function groupMuscles(rows: readonly MapRow[], notes: Record<string, string> = {}): Record<RoleGroup, MuscleLine[]> {
  const out: Record<RoleGroup, MuscleLine[]> = { primary: [], secondary: [], stabiliser: [] };
  const seen = new Set<string>();
  for (const want of ['p', 's', 't']) {
    for (const [id, role, emphasis] of rows) {
      const g = GROUP[role];
      if (role !== want || !g || seen.has(id)) continue;
      seen.add(id); // a muscle is listed once, under its strongest role
      const e = emphasis === 'h' || emphasis === 'm' || emphasis === 'l' ? emphasis : 'm';
      out[g].push({ id, emphasis: e, contested: CONTESTED.test(notes[id] ?? '') });
    }
  }
  for (const g of Object.keys(out) as RoleGroup[]) out[g].sort((a, b) => ORDER[a.emphasis] - ORDER[b.emphasis]);
  return out;
}

/** Emphasis for the mini body: primary = bright, secondary and stabiliser = mid. Primary wins on duplicates. */
export function bodyEmphasis(g: Record<RoleGroup, MuscleLine[]>): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const x of [...g.stabiliser, ...g.secondary]) out[x.id] = 'secondary';
  for (const x of g.primary) out[x.id] = 'primary';
  return out;
}

export const hasContested = (g: Record<RoleGroup, MuscleLine[]>): boolean => [...g.primary, ...g.secondary, ...g.stabiliser].some((x) => x.contested);

// ---------- chips, difficulty, easier / harder ----------

/** Three dots, `n` of them filled (1-3, clamped). */
export function difficultyDots(n: number): boolean[] {
  const k = Math.max(1, Math.min(3, Math.round(n || 1)));
  return [0, 1, 2].map((i) => i < k);
}

type Family = Pick<ExerciseRow, 'slug' | 'name' | 'category' | 'subCategory' | 'primary' | 'difficulty' | 'custom'>;

/** Closest easier and harder family member: same category and sub-category, shares a primary muscle. Ties by name. Hidden ("never show") exercises are never offered. */
export function easierHarder(row: Family, all: readonly Family[], hidden: ReadonlySet<string> = new Set()): { easier?: Family; harder?: Family } {
  const kin = all.filter(
    (x) => !x.custom && x.slug !== row.slug && !hidden.has(x.slug) && x.category === row.category && x.subCategory === row.subCategory && x.primary.some((m) => row.primary.includes(m)),
  );
  const closest = (list: Family[], dir: 1 | -1) =>
    [...list].sort((a, b) => Math.abs(a.difficulty - row.difficulty) - Math.abs(b.difficulty - row.difficulty) || a.name.localeCompare(b.name) || dir)[0];
  return {
    easier: closest(kin.filter((x) => x.difficulty < row.difficulty), -1),
    harder: closest(kin.filter((x) => x.difficulty > row.difficulty), 1),
  };
}

// ---------- variations ----------

/** Muscles a variation adds, from the variation shift table: `[muscle, emphasis]` pairs. Empty when none. */
export function variationAdds(shift: Record<string, Array<[string, string]>> | undefined, variation: string): Array<{ id: string; emphasis: string }> {
  return (shift?.[variation] ?? []).map(([id, emphasis]) => ({ id, emphasis }));
}

/** Tapping the chosen variation again clears it. */
export const toggleVariation = (current: string | undefined, tapped: string): string | undefined => (current === tapped ? undefined : tapped);

// ---------- form cue card ----------

export interface CueCard {
  /** Up to 3 cues, then one common mistake (the dataset caution) when there is one. */
  slides: Array<{ kind: 'cue' | 'mistake'; text: string }>;
}

export function buildCueCard(cues: readonly string[], cautions: string): CueCard {
  const slides: CueCard['slides'] = cues.map((c) => c.trim()).filter(Boolean).slice(0, 3).map((text) => ({ kind: 'cue' as const, text }));
  const m = cautions.trim();
  if (m) slides.push({ kind: 'mistake', text: m });
  return { slides };
}

// ---------- machine status ----------

export const statusTone = (status: string): 'ok' | 'warn' | 'danger' => (status === 'active' ? 'ok' : status === 'maintenance' ? 'warn' : 'danger');

/** Rep range text, or '' when unknown. */
export function repRangeText(min: number | null, max: number | null): string {
  if (min == null && max == null) return '';
  if (min != null && max != null) return min === max ? String(min) : `${min}-${max}`;
  return String(min ?? max);
}

// ---------- labels (shared by both pages) ----------

export const nice = (raw: string): string => (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ') : raw);
