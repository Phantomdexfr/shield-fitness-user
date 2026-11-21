// Schedule repo (Phase 32): settings, per-routine plan state, finished-session dates and saving a routine's schedule.
// Settings and state are device-only prefs rows (never synced). Sessions arrive in Phase 34; until then there are none.
// `readRecoveryStates` reads the recovery clock (Phase 49); it returns {} with no logged work (hints stay hidden, floating uses rotation).

import { prefsRepo, sessionsRepo } from '../local';
import { istDayKey, type DayKey } from '../../shared/dates';
import { parseSettings, type RecoveryStates, type Schedule, type ScheduleMeta, type ScheduleSettings } from '../../shared/schedule';
import { listRoutines, putRoutine } from './routines';
import { readRecoveryNow } from './recovery';
import type { Routine } from '../../shared/routine';

const SETTINGS_ID = 'schedule-settings';
const STATE_ID = (routineId: string) => `schedule-state:${routineId}`;

export async function readSettings(): Promise<ScheduleSettings> {
  try {
    return parseSettings((await prefsRepo.get(SETTINGS_ID))?.value);
  } catch {
    return parseSettings(undefined);
  }
}

export async function writeSettings(s: ScheduleSettings): Promise<void> {
  await prefsRepo.put({ client_id: SETTINGS_ID, value: s });
}

/** Per-routine plan state kept on the device. `pointer` is moved by sessions (Phase 34) or by "Skip it". */
export interface PlanState {
  pointer: number;
  /** Per-date choices: `rest` = chosen rest day, `train` = "move here". */
  overrides: Record<string, 'rest' | 'train'>;
  /** Missed dates the user decided about (they never come back). */
  decided: string[];
  /** Days on which the rest-day hint was already answered (it shows once per day). */
  hintDone: string[];
  /** The last day a "Welcome back" card was dismissed. */
  welcomeDone?: string;
}

export const EMPTY_STATE: PlanState = { pointer: 0, overrides: {}, decided: [], hintDone: [] };

export function parseState(raw: unknown): PlanState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const overrides: Record<string, 'rest' | 'train'> = {};
  if (r.overrides && typeof r.overrides === 'object') {
    for (const [k, v] of Object.entries(r.overrides as Record<string, unknown>)) if (v === 'rest' || v === 'train') overrides[k] = v;
  }
  const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  return {
    pointer: typeof r.pointer === 'number' && Number.isInteger(r.pointer) && r.pointer >= 0 ? r.pointer : 0,
    overrides,
    decided: strs(r.decided),
    hintDone: strs(r.hintDone),
    ...(typeof r.welcomeDone === 'string' ? { welcomeDone: r.welcomeDone } : {}),
  };
}

export async function readState(routineId: string): Promise<PlanState> {
  try {
    return parseState((await prefsRepo.get(STATE_ID(routineId)))?.value);
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function writeState(routineId: string, s: PlanState): Promise<void> {
  await prefsRepo.put({ client_id: STATE_ID(routineId), value: s });
}

/** IST day keys of finished sessions (a session with `endedAt`). Empty until Phase 34 writes sessions. */
export async function readSessionDates(): Promise<DayKey[]> {
  try {
    const rows = (await sessionsRepo.list()) as unknown as { startedAt?: unknown; endedAt?: unknown }[];
    const out: DayKey[] = [];
    for (const r of rows) {
      if (typeof r.endedAt !== 'string' || typeof r.startedAt !== 'string') continue;
      const ms = Date.parse(r.startedAt);
      if (Number.isFinite(ms)) out.push(istDayKey(ms));
    }
    return out.sort();
  } catch {
    return [];
  }
}

/** The real recovery clock (Phase 49). Empty = no data (nothing logged, or the clock cannot be read), so hints and readiness stay hidden. */
export async function readRecoveryStates(): Promise<RecoveryStates> {
  try {
    return await readRecoveryNow();
  } catch {
    return {};
  }
}

/** Saves the schedule and its extras on the routine (`schedule` is the contract field, `scheduleMeta` is local). `undefined` = no schedule. */
export async function saveSchedule(routine: Routine, schedule: Schedule | undefined, meta: ScheduleMeta): Promise<Routine> {
  const next: Routine = { ...routine, scheduleMeta: meta };
  if (schedule) next.schedule = schedule;
  else delete next.schedule;
  await putRoutine(next);
  return next;
}

/** The active routine, or the first live one, for Home. */
export async function activeRoutine(): Promise<Routine | undefined> {
  const all = (await listRoutines()).filter((r) => !r.archived);
  return all.find((r) => r.active) ?? all[0];
}
