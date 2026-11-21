// Gym programs as a routine source (Phase 69). Reads the four program tables (core shard, read only), keeps them on the device in
// one `prefs` row, and offers Follow / Copy to mine / Ignore. A followed program is mirrored as a read-only routine (id `gym-prog:<slug>`,
// `followed: true`) so Today, the week view and sessions work unchanged; it is never pushed to the gym (`toServerOps` skips it).

import { newClientId, prefsRepo } from '../local';
import { getRoutine, listRoutines, putRoutine } from '../repos/routines';
import { routinesRepo } from '../local';
import { classifyPrograms, copyProgram, emptyProgramState, followProgram, followedId, parsePrograms, programChanged, visiblePrograms, type GymProgram, type ProgramLists, type ProgramState } from '../../shared/gymPrograms';
import { getPolicy } from '../repos/gymPolicy';
import type { Remote } from './types';

const CACHE_ROW = 'gym:programs';
const STATE_ROW = 'gym:programs:state';

export interface ProgramCache {
  fetchedAt: number | null;
  programs: GymProgram[];
}
const emptyCache = (): ProgramCache => ({ fetchedAt: null, programs: [] });

export async function readProgramCache(): Promise<ProgramCache> {
  try {
    return ((await prefsRepo.get(CACHE_ROW))?.value as ProgramCache | undefined) ?? emptyCache();
  } catch {
    return emptyCache();
  }
}
export async function readProgramState(): Promise<ProgramState> {
  try {
    const v = (await prefsRepo.get(STATE_ROW))?.value as Partial<ProgramState> | undefined;
    return { followed: v?.followed ?? {}, ignored: v?.ignored ?? [] };
  } catch {
    return emptyProgramState();
  }
}
const writeState = (s: ProgramState) => prefsRepo.put({ client_id: STATE_ROW, value: s } as never).then(() => notify());

/** What the screens show. `signedInOnly` cards are decided by the screen (hidden when `gym_programs` is off). */
export async function programLists(): Promise<ProgramLists & { fetchedAt: number | null; unavailable: Record<string, number> }> {
  const [c, st] = await Promise.all([readProgramCache(), readProgramState()]);
  const lists = classifyPrograms(visiblePrograms(c.programs, getPolicy()?.programs_published ?? []), st);
  return { ...lists, fetchedAt: c.fetchedAt, unavailable: {} };
}

/** [A-P69.1] Column names are guesses. A failed read keeps the old cache; followed routines are refreshed from the new rows. */
export async function pullPrograms(remote: Remote, now: number): Promise<{ ok: boolean }> {
  const [p, d, i, m] = await Promise.all([
    remote.readOwn('programs', 'id,slug,name,days_per_week,weeks,goal,status,deleted_at', 200),
    remote.readOwn('program_days', 'id,program_id,position,name,target_muscles,deleted_at', 1000),
    remote.readOwn('program_items', 'id,day_id,position,exercise_ref,sets,rep_min,rep_max,rest_sec,note,deleted_at', 5000),
    remote.readOwn('member_programs', 'program_id,deleted_at', 200),
  ]);
  if (p.error || d.error || i.error || m.error) return { ok: false };
  const programs = parsePrograms(p.rows, d.rows, i.rows, m.rows);
  await prefsRepo.put({ client_id: CACHE_ROW, value: { fetchedAt: now, programs } satisfies ProgramCache } as never);
  await refreshFollowed(visiblePrograms(programs, getPolicy()?.programs_published ?? []));
  notify();
  return { ok: true };
}

/** Replace the days of every followed routine whose program changed; keep the active flag and schedule. Followed programs the gym ended stay as they are. */
async function refreshFollowed(visible: GymProgram[]): Promise<void> {
  const st = await readProgramState();
  let changed = false;
  for (const p of visible) {
    if (!(p.slug in st.followed)) continue;
    const mirror = await getRoutine(followedId(p.slug));
    if (!mirror || programChanged(mirror, p)) await putRoutine(followProgram(p, newClientId, mirror));
    st.followed[p.slug] = p;
    changed = true;
  }
  if (changed) await writeState(st);
}

const find = async (slug: string): Promise<GymProgram | undefined> => {
  const [c, st] = await Promise.all([readProgramCache(), readProgramState()]);
  return c.programs.find((p) => p.slug === slug) ?? st.followed[slug];
};

export async function followGymProgram(slug: string): Promise<boolean> {
  const p = await find(slug);
  if (!p) return false;
  const st = await readProgramState();
  await putRoutine(followProgram(p, newClientId, await getRoutine(followedId(slug))));
  await writeState({ followed: { ...st.followed, [slug]: p }, ignored: st.ignored.filter((s) => s !== slug) });
  return true;
}

/** Stop following: the link and the read-only routine go; sessions already logged keep their data. */
export async function unfollowGymProgram(slug: string): Promise<void> {
  const st = await readProgramState();
  const { [slug]: _gone, ...rest } = st.followed;
  void _gone;
  if (await getRoutine(followedId(slug))) await routinesRepo.remove(followedId(slug));
  await writeState({ ...st, followed: rest });
}

/** Copy to mine: an editable snapshot (`source: 'gym:<slug>'`). Returns the new routine id. */
export async function copyGymProgram(slug: string): Promise<string | null> {
  const p = await find(slug);
  if (!p) return null;
  const all = await listRoutines();
  const r = copyProgram(p, newClientId, all.map((x) => x.name));
  await putRoutine(r);
  return r.id;
}

/** "Keep a copy" for a program the gym ended (or on Disconnect): copy, then drop the link. */
export async function keepCopyAndUnfollow(slug: string): Promise<string | null> {
  const id = await copyGymProgram(slug);
  if (id) await unfollowGymProgram(slug);
  return id;
}

export async function ignoreGymProgram(slug: string, on: boolean): Promise<void> {
  const st = await readProgramState();
  const rest = st.ignored.filter((s) => s !== slug);
  await writeState({ ...st, ignored: on ? [...rest, slug] : rest });
}

/** Disconnect [A-P69.3]: every followed routine becomes an editable copy (nothing is lost, nothing is asked), then the cache and state go. */
export async function clearPrograms(): Promise<void> {
  const st = await readProgramState();
  for (const slug of Object.keys(st.followed)) await keepCopyAndUnfollow(slug).catch(() => undefined);
  await prefsRepo.remove(CACHE_ROW).catch(() => undefined);
  await prefsRepo.remove(STATE_ROW).catch(() => undefined);
  notify();
}

const listeners = new Set<() => void>();
export const onPrograms = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function notify(): void {
  listeners.forEach((l) => l());
}
