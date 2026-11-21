// Recovery data (Phase 49): the recovery clock, the 28-day balance and the person's marks in one call, built from the
// logged sessions. Read-only. The rules live in `src/shared/recovery.ts` and `src/shared/avoid.ts`.

import { loadHeatData, type HeatData } from './heatmap';
import { loadMarks } from './marks';
import { balance, recoveryMap, recoveryStates, type AxisBalance, type AxisId, type RecoveryInfo, type RecoveryState } from '../../shared/recovery';
import { lastDays, rawHeat } from '../../shared/heat';
import { istDayKey } from '../../shared/dates';
import type { MuscleMark } from '../../shared/avoid';

/** Days of work the balance card looks at. */
export const BALANCE_DAYS = 28;

export interface RecoveryData {
  heat: HeatData;
  map: Record<string, RecoveryInfo>;
  balance: Record<AxisId, AxisBalance>;
  marks: MuscleMark[];
  /** False when nothing was ever logged: every muscle is then `fresh` and there is nothing to learn from it. */
  hasWork: boolean;
  now: number;
}

export async function loadRecovery(now: number = Date.now()): Promise<RecoveryData> {
  const [heat, marks] = await Promise.all([loadHeatData(), loadMarks().catch(() => [] as MuscleMark[])]);
  const map = recoveryMap(heat.recovery, heat.tax, now);
  const raw = rawHeat(heat.entries, lastDays(BALANCE_DAYS, istDayKey(now)));
  return { heat, map, balance: balance(raw), marks, hasWork: heat.recovery.length > 0, now };
}

/** What the scheduler reads: id -> state. `{}` when nothing was logged, so hints stay hidden and floating mode keeps its rotation ([A-P49.2]). */
export async function readRecoveryNow(now: number = Date.now()): Promise<Record<string, RecoveryState>> {
  const heat = await loadHeatData();
  if (heat.recovery.length === 0) return {};
  return recoveryStates(recoveryMap(heat.recovery, heat.tax, now));
}
