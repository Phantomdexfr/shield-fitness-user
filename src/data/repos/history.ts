// History data (Phase 39): the finished-session list and everything one session screen needs. Read-only. Screens ask here only.

import { listSessions, getSession } from './sessions';
import { readBodyKg } from './body';
import { exercisesRepo, listCustomExercises } from './exercises';
import { prsForSession } from './records';
import { finishedSessions, musclesHit, summaryOf, type MapRowLike } from '../../shared/history';
import { refId, type Session } from '../../shared/session';
import type { SessionPR } from '../../shared/pr';

export async function loadFinished(): Promise<Session[]> {
  return finishedSessions(await listSessions());
}

export interface SessionView {
  session: Session;
  /** Exercise name by `refId`. A name that cannot be found shows the slug. */
  names: Record<string, string>;
  prs: SessionPR[];
  /** Muscles trained (working sets only) for the mini body. */
  muscles: Record<string, 'primary' | 'secondary'>;
  /** Body weight used for assisted exercises (70 when unset). */
  bodyKg: number;
}

/** One session with names, the PRs it set (judged against sessions before it) and the muscles it trained. Undefined if it does not exist. */
export async function loadSessionView(id: string): Promise<SessionView | undefined> {
  const session = await getSession(id);
  if (!session) return undefined;
  const custom = await listCustomExercises().catch(() => []);
  const names: Record<string, string> = {};
  const rows: MapRowLike[][] = [];
  await Promise.all(
    session.items.map(async (it) => {
      const slug = it.ref.kind === 'custom' ? custom.find((c) => c.id === (it.ref as { id: string }).id)?.slug : it.ref.slug;
      const full = slug ? await exercisesRepo.get(slug).catch(() => undefined) : undefined;
      names[refId(it.ref)] = full?.row.name ?? (it.ref.kind === 'custom' ? custom.find((c) => c.id === (it.ref as { id: string }).id)?.name : undefined) ?? slug ?? refId(it.ref);
      if (full && summaryOfItem(it)) rows.push(full.muscles as unknown as MapRowLike[]);
    }),
  );
  const prs = session.endedAt ? await prsForSession(session).catch(() => []) : [];
  return { session, names, prs, muscles: musclesHit(rows), bodyKg: await readBodyKg().catch(() => 70) };
}

const summaryOfItem = (it: Session['items'][number]): boolean => summaryOf({ id: '', clientId: '', startedAt: '', items: [it] }).workingSets > 0;
