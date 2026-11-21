// Protein and water repo (Phase 55). One generic typed `intake` log; the day is the IST day of the moment it is added.
// The weight for the protein target is the latest body-stats reading (Phase 54). Screens ask here only.

import { intakeRepo, prefsRepo } from '../local';
import { istDayKey, type DayKey } from '../../shared/dates';
import { latestOf } from '../../shared/goals';
import { DEFAULT_FACTOR, MAX_ENTRY, dayTotal, parseFactor, parseIntake, type IntakeEntry, type IntakeKind } from '../../shared/intake';
import { loadEntries } from './body';

const FACTOR_ID = 'intake-protein-factor';

export interface IntakeData {
  today: DayKey;
  entries: IntakeEntry[];
  /** Latest logged body weight, or null. */
  kg: number | null;
  factor: number;
}

export async function loadIntake(nowMs: number = Date.now()): Promise<IntakeData> {
  const [rows, body, pref] = await Promise.all([
    intakeRepo.list().catch(() => []),
    loadEntries().catch(() => []),
    prefsRepo.get(FACTOR_ID).catch(() => undefined),
  ]);
  return { today: istDayKey(nowMs), entries: parseIntake(rows), kg: latestOf(body, 'kg'), factor: pref ? parseFactor(pref.value) : DEFAULT_FACTOR };
}

/** Adds one entry now. Returns false (and writes nothing) when the amount is not believable. */
export async function addIntake(kind: IntakeKind, amount: number, nowMs: number = Date.now()): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_ENTRY[kind]) return false;
  await intakeRepo.put({ kind, amount, day: istDayKey(nowMs), at: nowMs });
  return true;
}

/** Phase 57: adds one protein-only entry (grams) and returns its id for Undo, or null when the amount is not believable. Nothing about the product is kept. */
export async function addProteinEntry(grams: number, nowMs: number = Date.now()): Promise<string | null> {
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_ENTRY.protein) return null;
  const row = await intakeRepo.put({ kind: 'protein', amount: grams, day: istDayKey(nowMs), at: nowMs });
  return row.client_id;
}

/** Protein total for the IST day of `nowMs` (the number the ring on /intake shows). */
export async function proteinToday(nowMs: number = Date.now()): Promise<number> {
  const d = await loadIntake(nowMs);
  return dayTotal(d.entries, d.today, 'protein');
}

export async function removeIntake(id: string): Promise<void> {
  await intakeRepo.remove(id);
}

export async function writeFactor(factor: number): Promise<void> {
  await prefsRepo.put({ client_id: FACTOR_ID, value: parseFactor(factor) });
}
