// Pure install detection (docs/PWA_INSTALL_GATE.md). No DOM access: everything comes in through `env`.

export type InstallState =
  | 'installed'
  | 'android-promptable'
  | 'android-other'
  | 'ios-safari'
  | 'ios-other'
  | 'in-app-browser'
  | 'desktop'
  | 'unsupported';

export interface InstallEnv {
  /** matchMedia display-mode results. */
  displayModeStandalone: boolean;
  displayModeFullscreen: boolean;
  displayModeMinimalUi: boolean;
  /** iOS home-screen app flag (`navigator.standalone`). */
  navigatorStandalone: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  viewportWidth: number;
  /** A `beforeinstallprompt` event was captured. */
  hasPromptEvent: boolean;
  hasServiceWorker: boolean;
  hasIndexedDB: boolean;
}

const IN_APP_MARKERS = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok|Twitter|LinkedInApp|Pinterest|WhatsApp|GSA\/|; wv\)/i;
const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/i;
const WIDE_SCREEN_PX = 768;

export function isIos(env: Pick<InstallEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  // iPadOS 13+ reports as a Mac but has multi-touch.
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1;
}

export function isAndroid(env: Pick<InstallEnv, 'userAgent'>): boolean {
  return /Android/i.test(env.userAgent);
}

export function detectInstallState(env: InstallEnv): InstallState {
  if (env.displayModeStandalone || env.displayModeFullscreen || env.displayModeMinimalUi || env.navigatorStandalone) {
    return 'installed';
  }
  // In-app browsers first: they often lack service workers, but "open in your browser" is the right advice.
  if (IN_APP_MARKERS.test(env.userAgent)) return 'in-app-browser';
  if (!env.hasServiceWorker || !env.hasIndexedDB) return 'unsupported';
  if (isIos(env)) return IOS_OTHER_BROWSERS.test(env.userAgent) ? 'ios-other' : 'ios-safari';
  if (isAndroid(env)) return env.hasPromptEvent ? 'android-promptable' : 'android-other';
  if (env.maxTouchPoints === 0 && env.viewportWidth >= WIDE_SCREEN_PX) return 'desktop';
  // Unknown touch device: show the generic browser-menu steps.
  return 'android-other';
}
