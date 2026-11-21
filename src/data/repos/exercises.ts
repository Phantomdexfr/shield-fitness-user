// Exercises repo (Phase 11): the one place UI code asks for exercises. It reads the user's custom exercises from the
// local store and hands them to the dataset queries, which merge them at query time. Screens never import
// `src/data/local/db.ts` or the dataset loader directly.

import { customExercisesRepo } from '../local';
import { gymHiddenSlugs } from './gymPolicy';
import {
  byMachine as qByMachine,
  byMuscle as qByMuscle,
  fuzzyExercises as qFuzzy,
  getExercise as qGetExercise,
  getMachine as qGetMachine,
  imageUrls as qImageUrls,
  musclesOf as qMusclesOf,
  search as qSearch,
  variationsOf as qVariationsOf,
  type CustomExercise,
  type ExerciseFull,
  type FuzzyExerciseResult,
  type MuscleHit,
  type QueryOptions,
} from '../../dataset/query';
import type { ExerciseRow, ImageUrl, MapRow, Machine } from '../../dataset/loader';
import type { SearchFilters, SearchHit } from '../../dataset/search';

/** Live custom exercises (soft-deleted rows are hidden by the repo). */
export async function listCustomExercises(): Promise<CustomExercise[]> {
  const rows = await customExercisesRepo.list();
  return rows as unknown as CustomExercise[];
}

async function opts(): Promise<QueryOptions> {
  return { custom: await listCustomExercises() };
}

export type ExerciseSearchFilters = Omit<SearchFilters, 'slugs'> & { muscle?: string };

export const exercisesRepo = {
  async get(slug: string): Promise<ExerciseFull | undefined> {
    return qGetExercise(slug, await opts());
  },
  async search(q: string, filters: ExerciseSearchFilters = {}): Promise<SearchHit[]> {
    const hide = gymHiddenSlugs();
    const hits = await qSearch(q, filters, await opts());
    return hide.size ? hits.filter((h) => !hide.has(h.row.slug)) : hits;
  },
  async fuzzy(q: string, filters: ExerciseSearchFilters = {}): Promise<FuzzyExerciseResult> {
    const hide = gymHiddenSlugs();
    const r = await qFuzzy(q, filters, await opts());
    return hide.size ? { ...r, hits: r.hits.filter((h) => !hide.has(h.row.slug)) } : r;
  },
  async byMuscle(muscleId: string): Promise<MuscleHit[]> {
    const hide = gymHiddenSlugs();
    const hits = await qByMuscle(muscleId, await opts());
    return hide.size ? hits.filter((h) => !hide.has(h.row.slug)) : hits;
  },
  async byMachine(machineSlug: string): Promise<ExerciseRow[]> {
    const hide = gymHiddenSlugs();
    const rows = await qByMachine(machineSlug, await opts());
    return hide.size ? rows.filter((r) => !hide.has(r.slug)) : rows;
  },
  async musclesOf(slug: string): Promise<MapRow[]> {
    return qMusclesOf(slug, await opts());
  },
  variationsOf(slug: string): Promise<string[]> {
    return qVariationsOf(slug);
  },
  getMachine(slug: string): Promise<Machine | undefined> {
    return qGetMachine(slug);
  },
  imageUrls(machineSlug: string): Promise<ImageUrl[]> {
    return qImageUrls(machineSlug);
  },
};
