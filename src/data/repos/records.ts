// Records repo (Phase 37): reads finished sessions and builds the PR board. Screens ask here only.

import { listSessions } from './sessions';
import { getSeparatePrPerGrip } from './exercisePage';
import { exercisesRepo, listCustomExercises } from './exercises';
import { buildBoard, sessionPRs, type BoardCard, type SessionPR } from '../../shared/pr';
import type { Session } from '../../shared/session';

export interface BoardRow extends BoardCard {
  name: string;
  /** Route of the exercise page. */
  href: string;
}

export interface BoardData {
  rows: BoardRow[];
  separateByGrip: boolean;
}

/** Everything `/progress/records` shows: a card per exercise (or per exercise and grip) with its records. */
export async function loadBoard(): Promise<BoardData> {
  const [sessions, separateByGrip, custom] = await Promise.all([listSessions(), getSeparatePrPerGrip(), listCustomExercises()]);
  const slugOf = (id: string) => custom.find((c) => c.id === id)?.slug;
  const cards = buildBoard(sessions, separateByGrip, slugOf);
  const rows = await Promise.all(
    cards.map(async (c): Promise<BoardRow> => {
      const full = await exercisesRepo.get(c.slug).catch(() => undefined);
      return { ...c, name: full?.row.name ?? c.slug, href: `/exercise/${c.slug}` };
    }),
  );
  return { rows, separateByGrip };
}

/** PRs set by one session against every other finished session (logger toast, session summary). */
export async function prsForSession(session: Session): Promise<SessionPR[]> {
  const [sessions, separateByGrip, custom] = await Promise.all([listSessions(), getSeparatePrPerGrip(), listCustomExercises()]);
  return sessionPRs(session, sessions, separateByGrip, (id) => custom.find((c) => c.id === id)?.slug);
}
