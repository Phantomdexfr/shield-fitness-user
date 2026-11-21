import { render } from 'preact';
import './ui/styles/index.css';
import { detectInstallState } from './pwa/installGate';
import { installNavIndex } from './app/navBack';
import { captureInstallPrompt, readInstallEnv } from './pwa/prompt';

const root = document.getElementById('app')!;
captureInstallPrompt();

// Dev builds only: `?bypass-gate` skips the install gate (the branch is removed from production builds).
const bypass = import.meta.env.DEV && new URLSearchParams(location.search).has('bypass-gate');
// The worker registers in the browser tab too: Android only offers install when one is active.
void import('./pwa/update').then((m) => m.registerServiceWorker(import.meta.env.BASE_URL));

const state = bypass ? 'installed' : detectInstallState(readInstallEnv());

if (state === 'installed') {
  // The router, dataset and any gym client load only after this point.
  void import('./app/appearance').then((m) => m.loadAppearance());
  // The cached gym policy (none in standalone). Reads the device only; no network.
  void import('./data/repos/gymPolicy').then((m) => m.initGymPolicy()).then(() => import('./data/gym/link')).then((m) => m.initGymLink()).catch(() => undefined);
  // Phase 78: a phone in free backup mode restarts its backup runtime. Standalone: reads one stored row and stops.
  void import('./data/gym/freeBoot').then((m) => m.initFreeBackup()).catch(() => undefined);
  void import('./app/Shell').then(({ Shell }) => {
    installNavIndex();
    render(<Shell base={import.meta.env.BASE_URL} isDev={import.meta.env.DEV} />, root);
  });
} else {
  void import('./pwa/InstallGate').then(({ InstallGate }) => render(<InstallGate state={state} />, root));
}
