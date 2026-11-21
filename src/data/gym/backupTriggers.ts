// Phase 76-b1: WHEN a backup pass runs (SYNC_SPEC B4). Pure-ish: timers, clock, randomness and the pass itself are injected,
// so it is tested on a fake clock. `startBackupTriggers` is the only part that touches `window` / `document`.
//  1/2 a finished session saved, edited or deleted, a body / intake row, a `small` edit -> that chunk key dirty, pass in 10-30 s
//  3   app open, foreground, `online`, after a successful row sync -> pass now (`kick`)
//  4   once a day -> every key dirty (a three-way check of everything), then a pass
//  5   no polling while hidden, no Realtime
//  7   standalone (or feature off): nothing runs, nothing is marked
import { setChangeListener, type EntityStore, type Row } from '../local';
import { buildAllChunks } from '../local/chunks';
import { istMonth } from '../../shared/chunks';
import { triggerDelayMs } from '../../shared/backupPlan';
import { markDirty } from './backupMeta';
import { getDb } from '../local';

const DAY_MS = 24 * 3600_000;
const DAILY_KEY = 'backup:daily';

/**
 * The chunk key a changed local row belongs to, or null when it is not backed up. Sessions count only once FINISHED
 * (an active session autosaves per set and is not backed up until it ends; a delete of a finished one counts).
 */
export function chunkKeyOfChange(store: EntityStore, row: Row): string | null {
  switch (store) {
    case 'sessions': {
      const started = typeof row.startedAt === 'string' ? Date.parse(row.startedAt) : NaN;
      const finished = typeof row.endedAt === 'string';
      if (!Number.isFinite(started) || (!finished && row.deleted_at == null)) return null;
      return `sessions:${istMonth(started / 1000)}`;
    }
    case 'bodyStats': {
      const day = typeof row.day === 'string' && /^\d{4}-\d{2}/.test(row.day) ? row.day : null;
      return day ? `body:${day.slice(0, 7)}` : `body:${istMonth(row.updated_at / 1000)}`;
    }
    case 'intake':
      return `body:${istMonth((typeof row.at === 'number' ? row.at : row.updated_at) / 1000)}`;
    case 'routines':
    case 'customExercises':
    case 'goals':
    case 'marks':
    case 'favourites':
      return 'small';
    default:
      return null; // prefs, photos: never backed up
  }
}

export interface SchedulerDeps {
  /** Runs one backup pass (`runBackupPass` with real deps). Errors are swallowed here; the pass records its own state. */
  runPass: () => Promise<unknown>;
  /** False when standalone or `cloud_backup` is off: nothing is marked, nothing runs. */
  enabled: () => Promise<boolean>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  now: () => number;
  rand: () => number;
  /** Test seam: the dirty-marking and the key listing. */
  mark?: (key: string) => Promise<void>;
  allKeys?: () => Promise<string[]>;
  readDaily?: () => Promise<number | null>;
  writeDaily?: (at: number) => Promise<void>;
}

export interface BackupScheduler {
  /** A row changed: mark its chunk dirty and (re)arm the 10-30 s timer. */
  noteChange(store: EntityStore, row: Row): void;
  /** Pass now: open, foreground, online, after a successful row sync. Skipped while hidden is the caller's job. */
  kick(): Promise<void>;
  /** Mark every chunk dirty once per 24 h, then kick. Returns whether it marked anything. */
  dailyCheck(): Promise<boolean>;
  dispose(): void;
}

export function createBackupScheduler(d: SchedulerDeps): BackupScheduler {
  const mark = d.mark ?? markDirty;
  const allKeys = d.allKeys ?? (async () => (await buildAllChunks()).chunks.map((c) => c.key));
  const readDaily = d.readDaily ?? (async () => {
    const v = (await (await getDb()).get('meta', DAILY_KEY))?.value;
    return typeof v === 'number' ? v : null;
  });
  const writeDaily = d.writeDaily ?? (async (at: number) => { await (await getDb()).put('meta', { key: DAILY_KEY, value: at }); });
  let timer: unknown = null;
  let running = false;
  let again = false;

  async function pass(): Promise<void> {
    if (running) { again = true; return; } // one pass at a time; a change during a pass earns one more
    running = true;
    try {
      do {
        again = false;
        if (!(await d.enabled())) return;
        try { await d.runPass(); } catch { /* the pass records its own error state */ }
      } while (again);
    } finally {
      running = false;
    }
  }

  return {
    noteChange(store, row) {
      const key = chunkKeyOfChange(store, row);
      if (!key) return;
      void (async () => {
        if (!(await d.enabled())) return;
        await mark(key);
        if (timer !== null) d.clearTimer(timer); // a burst of edits waits for the last one
        timer = d.setTimer(() => { timer = null; void pass(); }, triggerDelayMs(d.rand()));
      })();
    },
    kick: () => pass(),
    async dailyCheck() {
      if (!(await d.enabled())) return false;
      const last = await readDaily();
      if (last !== null && d.now() - last < DAY_MS) return false;
      for (const k of await allKeys()) await mark(k);
      await writeDaily(d.now());
      await pass();
      return true;
    },
    dispose() {
      if (timer !== null) d.clearTimer(timer);
      timer = null;
    },
  };
}

export interface BrowserEnv {
  onVisible(fn: () => void): () => void;
  onOnline(fn: () => void): () => void;
  isHidden(): boolean;
}
export const browserEnv = (): BrowserEnv => ({
  onVisible: (fn) => { const h = (): void => { if (document.visibilityState === 'visible') fn(); }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); },
  onOnline: (fn) => { window.addEventListener('online', fn); return () => window.removeEventListener('online', fn); },
  isHidden: () => document.visibilityState === 'hidden',
});

/**
 * Connects the scheduler to the app: repo changes, foreground, `online`, and the open-time pass + daily check. Returns a
 * stop function. App boot calls this (Phase 76-b2 wires it with real deps); nothing calls it yet.
 */
export function startBackupTriggers(s: BackupScheduler, env: BrowserEnv = browserEnv()): () => void {
  setChangeListener((store, row) => s.noteChange(store, row));
  const offVis = env.onVisible(() => { void s.kick(); });
  const offNet = env.onOnline(() => { void s.kick(); });
  void s.kick().then(() => s.dailyCheck());
  return () => { setChangeListener(null); offVis(); offNet(); s.dispose(); };
}

