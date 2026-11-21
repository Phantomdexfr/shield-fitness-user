// Set logger data (Phase 38): what the logger needs to know about each exercise in a session, the history it reads
// for "Last time", the overload chip and the smart rest timer, and the stored logger preferences. Read-only except prefs.
// The screen asks here; it never reads the dataset or the store directly.

import { prefsRepo } from '../local';
import { classOf, type ExerciseClass } from '../../shared/pocket';
import { DEFAULT_LOGGER_PREFS, resultsFor, restHistory, sanitizePrefs, type LoggerPrefs } from '../../shared/logger';
import { overload, type Intensity, type OverloadMode, type OverloadResult } from '../../shared/engine/overload';
import type { ExerciseResult } from '../../shared/engine/sessionStats';
import { refId, type ItemRef, type Session } from '../../shared/session';
import { exercisesRepo, listCustomExercises } from './exercises';
import { listSessions } from './sessions';

export interface LoggerInfo {
  cls: ExerciseClass;
  cardio: boolean;
  repMin: number;
  repMax: number;
  /** Machine weight step, or null (then 2.5 kg). */
  stepKg: number | null;
  /** Machine marked out of order is not tracked yet; always false. */
  outOfOrder: boolean;
}

const FALLBACK: LoggerInfo = { cls: 'isolation', cardio: false, repMin: 8, repMax: 12, stepKg: null, outOfOrder: false };

/** Class, rep range and weight step for each distinct exercise. A missing exercise gets the fallback (never throws). */
export async function loadLoggerInfo(refs: readonly ItemRef[]): Promise<Map<string, LoggerInfo>> {
  const custom = await listCustomExercises().catch(() => []);
  const unique = new Map<string, ItemRef>();
  for (const r of refs) unique.set(refId(r), r);
  const out = new Map<string, LoggerInfo>();
  await Promise.all(
    [...unique].map(async ([key, ref]) => {
      try {
        if (ref.kind === 'custom') {
          const c = custom.find((x) => x.id === ref.id);
          if (!c) return void out.set(key, FALLBACK);
          const machine = c.machineSlug ? await exercisesRepo.getMachine(c.machineSlug).catch(() => undefined) : undefined;
          return void out.set(key, {
            cls: c.kind === 'cardio' ? 'cardio' : c.kind === 'bodyweight' ? 'bodyweight' : 'isolation',
            cardio: c.kind === 'cardio',
            repMin: c.repMin,
            repMax: c.repMax,
            stepKg: machine?.stepKg ?? null,
            outOfOrder: false,
          });
        }
        const full = await exercisesRepo.get(ref.slug);
        if (!full) return void out.set(key, FALLBACK);
        const machine = full.row.machine ? await exercisesRepo.getMachine(full.row.machine).catch(() => undefined) : undefined;
        const cls = classOf(full.row);
        out.set(key, {
          cls,
          cardio: cls === 'cardio',
          repMin: full.detail.repMin ?? FALLBACK.repMin,
          repMax: full.detail.repMax ?? FALLBACK.repMax,
          stepKg: machine?.stepKg ?? null,
          outOfOrder: false,
        });
      } catch {
        out.set(key, FALLBACK);
      }
    }),
  );
  return out;
}

// ---------- prefs ----------

const PREFS_ID = 'logger:prefs';
const OVERLOAD_ID = 'overload:prefs';

export async function getLoggerPrefs(): Promise<LoggerPrefs> {
  try {
    return sanitizePrefs((await prefsRepo.get(PREFS_ID))?.value);
  } catch {
    return { ...DEFAULT_LOGGER_PREFS, plates: [...DEFAULT_LOGGER_PREFS.plates] };
  }
}

export async function putLoggerPrefs(p: LoggerPrefs): Promise<void> {
  await prefsRepo.put({ client_id: PREFS_ID, value: p } as never);
}

/** Overload mode and dial. Settings (Phase 62) will write `overload:prefs`; until then the defaults apply [A-P38.2]. */
export async function getOverloadSettings(): Promise<{ mode: OverloadMode; intensity: Intensity }> {
  try {
    const v = (await prefsRepo.get(OVERLOAD_ID))?.value as { mode?: string; intensity?: string } | undefined;
    const mode: OverloadMode = v?.mode === 'linear' || v?.mode === 'off' ? v.mode : 'double';
    const intensity: Intensity = v?.intensity === 'light' || v?.intensity === 'hard' || v?.intensity === 'beast' ? v.intensity : 'moderate';
    return { mode, intensity };
  } catch {
    return { mode: 'double', intensity: 'moderate' };
  }
}

// ---------- history ----------

export interface ItemHistory {
  results: ExerciseResult[];
  rests: number[];
  suggestion: OverloadResult | null;
}

/** For each exercise of the session: finished results (oldest first), real rests so far, and the overload suggestion. */
export async function loadHistory(session: Session, infos: ReadonlyMap<string, LoggerInfo>): Promise<Map<string, ItemHistory>> {
  const [all, settings] = await Promise.all([listSessions().catch(() => [] as Session[]), getOverloadSettings()]);
  const out = new Map<string, ItemHistory>();
  for (const it of session.items) {
    const key = refId(it.ref);
    if (out.has(key)) continue;
    const info = infos.get(key) ?? FALLBACK;
    const results = resultsFor(all, it.ref, session.id);
    const rests = restHistory(all, it.ref);
    const suggestion = info.cardio
      ? null
      : overload(results, { mode: settings.mode, intensity: settings.intensity, repMin: it.plan?.repMin ?? info.repMin, repMax: it.plan?.repMax ?? info.repMax, stepKg: info.stepKg, outOfOrder: info.outOfOrder });
    out.set(key, { results, rests, suggestion: suggestion && suggestion.note !== 'off' && suggestion.note !== 'no_history' && suggestion.note !== 'out_of_order' ? suggestion : null });
  }
  return out;
}
