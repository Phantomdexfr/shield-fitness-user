import { useEffect, useRef, useState } from 'preact/hooks';
import { istDayKey } from '../../shared/dates';
import { DEFAULT_SETTINGS, effectiveSchedule, parseMeta, type PlanInput, type RecoveryStates, type ScheduleSettings } from '../../shared/schedule';
import { EMPTY_STATE, readRecoveryStates, readSessionDates, readSettings, readState, writeSettings, writeState, type PlanState } from '../../data/repos/schedule';
import type { Routine } from '../../shared/routine';

export interface PlanData {
  ready: boolean;
  settings: ScheduleSettings;
  state: PlanState;
  sessionDates: string[];
  recovery: RecoveryStates;
  today: string;
  input: PlanInput;
  /** Merge a change into the stored state and show it at once. Resolves false when the write failed (the change is reverted). */
  patchState: (patch: Partial<PlanState>) => Promise<boolean>;
  patchSettings: (patch: Partial<ScheduleSettings>) => Promise<boolean>;
  reload: () => void;
}

/** Loads what the scheduler needs for one routine: settings, plan state, finished-session dates, recovery. */
export function usePlan(routine: Routine | undefined): PlanData {
  const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<PlanState>(EMPTY_STATE);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStates>({});
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const live = useRef(true);
  const rid = routine?.id;

  useEffect(() => {
    live.current = true;
    if (!rid) return;
    void Promise.all([readSettings(), readState(rid), readSessionDates(), readRecoveryStates()]).then(([se, st, sd, rc]) => {
      if (!live.current) return;
      setSettings(se);
      setState(st);
      setSessionDates(sd);
      setRecovery(rc);
      setReady(true);
    });
    return () => {
      live.current = false;
    };
  }, [rid, tick]);

  const today = istDayKey(Date.now());
  const meta = parseMeta(routine?.scheduleMeta);
  const schedule = routine ? effectiveSchedule(routine) : undefined;
  const input: PlanInput = {
    ...(schedule ? { schedule } : {}),
    days: routine?.days ?? [],
    pointer: state.pointer,
    today,
    weekStart: settings.weekStart,
    meta,
    sessionDates,
    overrides: state.overrides,
    decided: state.decided,
  };

  const patchState = async (patch: Partial<PlanState>): Promise<boolean> => {
    if (!rid) return false;
    const before = state;
    const next = { ...state, ...patch };
    setState(next);
    try {
      await writeState(rid, next);
      return true;
    } catch {
      setState(before);
      return false;
    }
  };

  const patchSettings = async (patch: Partial<ScheduleSettings>): Promise<boolean> => {
    const before = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await writeSettings(next);
      return true;
    } catch {
      setSettings(before);
      return false;
    }
  };

  return { ready, settings, state, sessionDates, recovery, today, input, patchState, patchSettings, reload: () => setTick((n) => n + 1) };
}
