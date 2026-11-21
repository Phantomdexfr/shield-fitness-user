// Personal exercise state (Phase 26): favourite, "never show" (hidden) and a private note, one row per exercise.
// Pure: no DOM, no store, no clock. The repo (`src/data/repos/personal.ts`) stores rows; screens and engines use this.
//
// Row shape (favourites store, client_id `ex:<slug>`): `{ slug, favourite?, hidden?, note? }`.
// Rules: a favourite cannot be hidden (hiding clears the favourite, favouriting clears the hide); a row with
// nothing set is removed rather than kept empty.

export const NOTE_MAX = 500;

export interface Personal {
  favourite: boolean;
  hidden: boolean;
  note: string;
}

export const EMPTY_PERSONAL: Personal = { favourite: false, hidden: false, note: '' };

export type NoteResult = { ok: true; value: string } | { ok: false; error: 'too_long' };

/** Trim a note; line breaks stay. Over `NOTE_MAX` characters is an error (never silently cut). */
export function cleanNote(raw: string): NoteResult {
  const value = raw.replace(/\r\n?/g, '\n').trim();
  return value.length > NOTE_MAX ? { ok: false, error: 'too_long' } : { ok: true, value };
}

export const clientIdFor = (slug: string): string => `ex:${slug}`;

/** Stored rows -> map by slug. Rows that do not fit are ignored; a legacy `{slug}` row counts as a favourite. */
export function parsePersonal(rows: readonly unknown[]): Map<string, Personal> {
  const out = new Map<string, Personal>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.slug !== 'string' || !r.slug) continue;
    const legacy = r.favourite === undefined && r.hidden === undefined && r.note === undefined;
    const p: Personal = {
      favourite: legacy ? true : r.favourite === true,
      hidden: r.hidden === true,
      note: typeof r.note === 'string' ? r.note : '',
    };
    if (p.hidden) p.favourite = false;
    if (isEmptyPersonal(p)) continue;
    out.set(r.slug, p);
  }
  return out;
}

export const isEmptyPersonal = (p: Personal): boolean => !p.favourite && !p.hidden && p.note === '';

export type PersonalChange = { favourite: boolean } | { hidden: boolean } | { note: string };

/** Apply one change. Favourite and hidden never both stay on (the one just set wins). */
export function applyPersonal(prev: Personal | undefined, change: PersonalChange): Personal {
  const p: Personal = { ...(prev ?? EMPTY_PERSONAL) };
  if ('favourite' in change) {
    p.favourite = change.favourite;
    if (change.favourite) p.hidden = false;
  } else if ('hidden' in change) {
    p.hidden = change.hidden;
    if (change.hidden) p.favourite = false;
  } else {
    p.note = change.note;
  }
  return p;
}

export const favouriteSlugs = (m: ReadonlyMap<string, Personal>): Set<string> => new Set([...m].filter(([, p]) => p.favourite).map(([s]) => s));
export const hiddenSlugs = (m: ReadonlyMap<string, Personal>): Set<string> => new Set([...m].filter(([, p]) => p.hidden).map(([s]) => s));

/** "My go-tos": favourites that are not hidden, by name (A to Z), ties by slug. Slugs with no known name are skipped. */
export function goTos(m: ReadonlyMap<string, Personal>, nameOf: (slug: string) => string | undefined): Array<{ slug: string; name: string }> {
  const out: Array<{ slug: string; name: string }> = [];
  for (const [slug, p] of m) {
    const name = nameOf(slug);
    if (p.favourite && !p.hidden && name) out.push({ slug, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
}

/** Drop hidden exercises from a list (search, suggestions, easier/harder). History reads by slug and is not filtered. */
export function withoutHidden<T extends { slug: string }>(rows: readonly T[], hidden: ReadonlySet<string>): T[] {
  return hidden.size === 0 ? [...rows] : rows.filter((r) => !hidden.has(r.slug));
}
