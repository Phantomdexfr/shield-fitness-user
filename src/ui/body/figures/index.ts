import type { Figure, Sex, View } from './types';

export type { Figure, Sex, View, Unit, Tier } from './types';

const LOADERS: Record<string, () => Promise<{ fig: Figure }>> = {
  male_front: () => import('./maleFront'),
  male_back: () => import('./maleBack'),
  female_front: () => import('./femaleFront'),
  female_back: () => import('./femaleBack'),
};
const cache = new Map<string, Figure>();

/** Figure already loaded, or undefined. */
export const peekFigure = (sex: Sex, view: View): Figure | undefined => cache.get(`${sex}_${view}`);

/** Lazy-load one figure (its own chunk); cached after the first call. */
export async function loadFigure(sex: Sex, view: View): Promise<Figure> {
  const key = `${sex}_${view}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const loader = LOADERS[key];
  if (!loader) throw new Error(`unknown figure ${key}`);
  const { fig } = await loader();
  cache.set(key, fig);
  return fig;
}
