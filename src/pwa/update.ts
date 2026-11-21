// Service worker registration, update detection and the version.json check (production only).
import { Workbox } from 'workbox-window';


type Listener = () => void;
let updateReady = false;
let wb: Workbox | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const updateStore = {
  isReady: () => updateReady,
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Activates the waiting worker; the page reloads when it takes control. */
  apply(): void {
    if (wb) wb.messageSkipWaiting();
    else location.reload();
  },
};

/** True when the deployed build id differs from the one running. */
export function isNewBuild(running: string, deployed: unknown): boolean {
  return typeof deployed === 'string' && deployed !== '' && deployed !== running;
}

async function checkVersion(base: string): Promise<void> {
  try {
    const res = await fetch(`${base}version.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { build?: string };
    if (isNewBuild(__APP_BUILD__, data.build)) await wb?.update();
  } catch {
    // Offline or blocked: skip silently; the next open tries again.
  }
}

export function registerServiceWorker(base: string): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  wb = new Workbox(`${base}sw.js`, { scope: base });
  wb.addEventListener('waiting', () => {
    updateReady = true;
    emit();
  });
  wb.addEventListener('controlling', () => {
    // Only reload when the person asked for the update (not on the very first install).
    if (updateReady) location.reload();
  });
  void wb.register().then(() => checkVersion(base));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion(base);
  });
}
