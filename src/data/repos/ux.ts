// Phase 96: Interface style prefs. One device row `appearance:ux` (in the backup FILE with the other prefs, never in the cloud backup)
// plus a one-line localStorage mirror so index.html can set the root attributes before first paint ([A] 96-1).
import { prefsRepo } from '../local';
import { UX_MIRROR_KEY, UX_ROW, fromMirror, parseSwitches, toMirror, toRow, withMaster, withSwitch, type UxKey, type UxMaster, type UxSwitches } from '../../shared/ux';

const listeners = new Set<(s: UxSwitches) => void>();

export function onUxChange(fn: (s: UxSwitches) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function readMirror(): UxSwitches {
  try {
    return fromMirror(localStorage.getItem(UX_MIRROR_KEY));
  } catch {
    return fromMirror(null);
  }
}

function writeMirror(s: UxSwitches): void {
  try {
    localStorage.setItem(UX_MIRROR_KEY, toMirror(s));
  } catch {
    /* private mode or blocked: the app still applies the switches after start */
  }
}

/** Stored switches (Premium when nothing is stored or the read fails). */
export async function readUx(): Promise<UxSwitches> {
  try {
    return parseSwitches((await prefsRepo.get(UX_ROW))?.value);
  } catch {
    return parseSwitches(null);
  }
}

/** Keep the mirror equal to the row (a restored backup file may have changed the row). */
export function syncMirror(s: UxSwitches): void {
  writeMirror(s);
}

async function save(next: UxSwitches): Promise<UxSwitches> {
  writeMirror(next);
  try {
    await prefsRepo.put({ client_id: UX_ROW, value: toRow(next) } as never);
  } catch {
    /* the mirror still holds it for this device */
  }
  listeners.forEach((l) => l(next));
  return next;
}

export async function setUxSwitch(key: UxKey, on: boolean): Promise<UxSwitches> {
  return save(withSwitch(await readUx(), key, on));
}

export async function setUxMaster(master: UxMaster): Promise<UxSwitches> {
  return save(withMaster(await readUx(), master));
}
