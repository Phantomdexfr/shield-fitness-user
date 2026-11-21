// Slugs (Phase 12). Pure. Lowercase kebab; dataset slugs are stable ids, custom exercises use `my-<kebab>`.

const MAX_LEN = 60;

/** NFKD, strip diacritics, lower-case, every non-alphanumeric run -> one hyphen, trimmed, capped at 60 characters. */
export function slugify(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, MAX_LEN).replace(/-+$/g, '');
}

export function isSlug(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

/**
 * Slug for a user-made exercise: `my-<kebab>`. If it is already taken (dataset or custom), `-2`, `-3`... is added.
 * A name with no letters or digits becomes `my-exercise`.
 */
export function customSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `my-${slugify(name) || 'exercise'}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
