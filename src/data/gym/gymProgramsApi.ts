// What the Phase 69 screens call: hooks for programs, proposals and the history upload. Screens import it through
// `src/data/repos/gymLink.ts`; the remote is reached only through the link.

import { useEffect, useState } from 'preact/hooks';
import { getConnection } from './connection';
import { copyGymProgram, followGymProgram, ignoreGymProgram, keepCopyAndUnfollow, onPrograms, programLists, unfollowGymProgram } from './programs';
import { onProposals, proposeExercise, readProposals, type Proposal } from './proposals';
import { answer, askNow, cancelUpload, onUpload, startUpload, uploadView, type UploadView } from './historyUpload';
import { runHistoryUpload, syncNow } from './link';
import type { ProgramLists } from '../../shared/gymPrograms';
import type { UploadAnswer } from '../../shared/historyUpload';

export type ProgramView = (ProgramLists & { fetchedAt: number | null }) | null;

export function usePrograms(): { view: ProgramView; signedIn: boolean | null } {
  const [s, setS] = useState<{ view: ProgramView; signedIn: boolean | null }>({ view: null, signedIn: null });
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [view, conn] = await Promise.all([programLists(), getConnection()]);
      if (live) setS({ view: conn ? view : null, signedIn: conn ? conn.signedIn : null });
    };
    void load();
    const off = onPrograms(() => void load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}
export const programActions = { follow: followGymProgram, unfollow: unfollowGymProgram, copy: copyGymProgram, keepCopy: keepCopyAndUnfollow, ignore: ignoreGymProgram };

export function useProposals(): Proposal[] {
  const [l, setL] = useState<Proposal[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => void readProposals().then((x) => live && setL(x));
    load();
    const off = onProposals(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return l;
}
/** Queue a proposal now (works offline) and try to send it at once. */
export async function proposeToGym(slug: string) {
  const r = await proposeExercise(slug, Date.now());
  if (r === 'queued') void syncNow('manual').catch(() => undefined);
  return r;
}

export function useUpload(): { view: UploadView | null; ask: boolean; loaded: boolean } {
  const [s, setS] = useState<{ view: UploadView | null; ask: boolean; loaded: boolean }>({ view: null, ask: false, loaded: false });
  useEffect(() => {
    let live = true;
    const load = async () => {
      const now = Date.now();
      const [view, ask] = await Promise.all([uploadView(now), askNow(now)]);
      if (live) setS({ view, ask, loaded: true });
    };
    void load();
    const off = onUpload(() => void load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}
export const uploadActions = {
  answer: (a: UploadAnswer) => answer(a, Date.now()),
  start: startUpload,
  cancel: cancelUpload,
  run: runHistoryUpload,
};
