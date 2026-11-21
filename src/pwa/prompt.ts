// Captures `beforeinstallprompt` (Android Chrome) as early as possible and reads the real environment.
import type { InstallEnv } from './installGate';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
}

export function onPromptChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function hasInstallPrompt(): boolean {
  return deferred !== null;
}

/** Shows the browser install dialog. Resolves true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome === 'accepted';
}

export function readInstallEnv(): InstallEnv {
  const mm = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    displayModeStandalone: mm('(display-mode: standalone)'),
    displayModeFullscreen: mm('(display-mode: fullscreen)'),
    displayModeMinimalUi: mm('(display-mode: minimal-ui)'),
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    viewportWidth: window.innerWidth,
    hasPromptEvent: hasInstallPrompt(),
    hasServiceWorker: 'serviceWorker' in navigator,
    hasIndexedDB: typeof indexedDB !== 'undefined',
  };
}
