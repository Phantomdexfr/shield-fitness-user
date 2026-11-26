// Phase 83: which collapsible sections the person left open or closed, per page. One device row `ui:sections` = { "<page>:<id>": boolean }.
// UI components read it through this repo only. A failed read or write just means defaults (nothing breaks, nothing is lost that matters).
import { prefsRepo } from '../local';

const ROW = 'ui:sections';

export const parseSections = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (v && typeof v === 'object') for (const [k, b] of Object.entries(v as Record<string, unknown>)) if (typeof b === 'boolean') out[k] = b;
  return out;
};

export async function loadSections(): Promise<Record<string, boolean>> {
  try {
    return parseSections((await prefsRepo.get(ROW))?.value);
  } catch {
    return {};
  }
}

export async function saveSections(map: Record<string, boolean>): Promise<void> {
  try {
    await prefsRepo.put({ client_id: ROW, value: map });
  } catch {
    /* defaults next time */
  }
}

// Phase 106: Body page layout, one device row `ui:body-layout` = 'figure' | 'list'. Figure first is the Premium default; anything unknown reads as figure.
const BODY_ROW = 'ui:body-layout';
export type BodyLayout = 'figure' | 'list';
export const parseBodyLayout = (v: unknown): BodyLayout => (v === 'list' ? 'list' : 'figure');

export async function loadBodyLayout(): Promise<BodyLayout> {
  try {
    return parseBodyLayout((await prefsRepo.get(BODY_ROW))?.value);
  } catch {
    return 'figure';
  }
}

export async function saveBodyLayout(v: BodyLayout): Promise<void> {
  try {
    await prefsRepo.put({ client_id: BODY_ROW, value: v });
  } catch {
    /* default next time */
  }
}
