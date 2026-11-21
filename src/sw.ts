// Service worker (vite-plugin-pwa injectManifest). Precaches the shell; large assets are cached on first view only.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

// The DOM lib types `self` as Window; this is the minimal worker surface used here.
interface WorkerScope {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}
const sw = self as unknown as WorkerScope;
const base = import.meta.env.BASE_URL;

cleanupOutdatedCaches();
// Workbox replaces this exact literal at build time, so it must read `self.__WB_MANIFEST`.
// @ts-ignore - injected by vite-plugin-pwa, not part of the DOM lib types
precacheAndRoute(self.__WB_MANIFEST);

// Every slug route works offline: any navigation is answered with the precached app shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${base}index.html`)));

// Big static files (machine photos, atlas model) are cached on demand, never precached.
registerRoute(
  ({ url }) => url.pathname.startsWith(`${base}machines/`) || url.pathname.startsWith(`${base}atlas/`),
  new CacheFirst({ cacheName: 'sf-large-assets' }),
);

// The page asks for activation when the person taps "Reload" on the update toast.
sw.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') void sw.skipWaiting();
});
