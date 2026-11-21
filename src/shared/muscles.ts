// Muscle taxonomy helpers (Phase 12). Pure: the caller passes the muscle list (from the dataset), nothing is imported.
// Parent roll-up: each detailed muscle has a `parent` (core id). A core id with detailed children
// (chest, back, shoulders, abs, glutes, quads, calves, traps) lists itself as its own parent.

export interface MuscleInfo {
  id: string;
  parent: string;
  name?: string;
  group?: string;
  status?: string;
}

export interface Taxonomy {
  /** All muscle ids, in the order given. */
  ids: string[];
  has(id: string): boolean;
  /** Parent (core) id, or undefined for an unknown id. A core id is its own parent. */
  parentOf(id: string): string | undefined;
  /** Detailed children of a core id, without the id itself ([] when it has none). */
  childrenOf(id: string): string[];
  /** `childrenOf(id)` when it has children, otherwise `[id]`. */
  expand(id: string): string[];
}

export function buildTaxonomy(muscles: readonly MuscleInfo[]): Taxonomy {
  const parent = new Map<string, string>();
  const kids = new Map<string, string[]>();
  for (const m of muscles) {
    parent.set(m.id, m.parent);
    if (m.parent !== m.id) {
      const list = kids.get(m.parent) ?? [];
      list.push(m.id);
      kids.set(m.parent, list);
    }
  }
  return {
    ids: muscles.map((m) => m.id),
    has: (id) => parent.has(id),
    parentOf: (id) => parent.get(id),
    childrenOf: (id) => [...(kids.get(id) ?? [])],
    expand: (id) => {
      const k = kids.get(id);
      return k && k.length > 0 ? [...k] : [id];
    },
  };
}

/** Roll detailed weights up to their parents by MAX (engines.md section 4: a parent region shows the max of its children). */
export function rollUpMax(weights: Readonly<Record<string, number>>, tax: Taxonomy): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(weights)) {
    const p = tax.parentOf(id) ?? id;
    if (w > (out[p] ?? 0)) out[p] = w;
  }
  return out;
}
