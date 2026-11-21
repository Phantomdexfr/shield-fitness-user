import { useEffect, useRef, useState } from 'preact/hooks';
import { getRoutine, putRoutine } from '../../data/repos/routines';
import { loadExInfo, lookupFrom, type ExInfo } from '../../data/repos/routineEdit';
import { refKey, type MuscleLookup } from '../../shared/routineEdit';
import type { Routine } from '../../shared/routine';

export type RoutineLoad = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; routine: Routine };

/** Loads one routine and the names/muscles of its exercises. `save` writes at once (autosave: nothing is lost on leaving). */
export function useRoutine(id: string) {
  const [load, setLoad] = useState<RoutineLoad>({ status: 'loading' });
  const [info, setInfo] = useState<ReadonlyMap<string, ExInfo>>(new Map());
  const [saveError, setSaveError] = useState(false);
  const live = useRef(true);

  const readInfo = (r: Routine, extra: ReadonlyMap<string, ExInfo>) => {
    const refs = r.days.flatMap((d) => d.items.map((i) => i.ref)).filter((ref) => !extra.has(refKey(ref)));
    if (refs.length === 0) return;
    void loadExInfo(refs).then((got) => live.current && setInfo((old) => new Map([...old, ...got])), () => undefined);
  };

  const refresh = () =>
    getRoutine(id).then(
      (r) => {
        if (!live.current) return;
        if (!r) return setLoad({ status: 'missing' });
        setLoad({ status: 'ready', routine: r });
        readInfo(r, info);
      },
      () => live.current && setLoad({ status: 'error' }),
    );

  useEffect(() => {
    live.current = true;
    void refresh();
    return () => {
      live.current = false;
    };
  }, [id]);

  /** Shows the change now and writes it; a failed write shows the notice and keeps the screen. */
  const save = (next: Routine): Promise<boolean> => {
    if (next.followed) return Promise.resolve(false); // Phase 69: a followed gym program is read-only here (Copy to mine to edit)
    setLoad({ status: 'ready', routine: next });
    setSaveError(false);
    readInfo(next, info);
    return putRoutine(next).then(
      () => true,
      () => {
        if (live.current) setSaveError(true);
        return false;
      },
    );
  };

  const lookup: MuscleLookup = lookupFrom(info);
  return { load, info, lookup, save, saveError, refresh };
}
