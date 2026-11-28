// Phase 117: page tips on/off. Prefs row `tips` = { v: 1, on }. A failed read or write never breaks the app.
import { prefsRepo } from '../local';
import { parseTips, tipsEnabled, type TipsRecord } from '../../shared/tips';
import { loadTour } from './tour';

const ROW = 'tips';

export async function loadTipsRow(): Promise<TipsRecord | null> {
  try {
    return parseTips((await prefsRepo.get(ROW))?.value);
  } catch {
    return null;
  }
}

export async function saveTipsOn(on: boolean): Promise<void> {
  try {
    await prefsRepo.put({ client_id: ROW, value: { v: 1, on } } as never);
  } catch {
    /* the switch still works for this session */
  }
}

/** The effective setting (own choice, else the new-install default). */
export async function readTipsOn(): Promise<boolean> {
  const [row, tour] = await Promise.all([loadTipsRow(), loadTour()]);
  return tipsEnabled(row, tour?.auto === true);
}
