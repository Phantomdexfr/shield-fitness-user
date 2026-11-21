import { describe, expect, it } from 'vitest';
import { detectInstallState, type InstallEnv } from '../../src/pwa/installGate';

const base: InstallEnv = {
  displayModeStandalone: false,
  displayModeFullscreen: false,
  displayModeMinimalUi: false,
  navigatorStandalone: false,
  userAgent: '',
  platform: '',
  maxTouchPoints: 0,
  viewportWidth: 1280,
  hasPromptEvent: false,
  hasServiceWorker: true,
  hasIndexedDB: true,
};
const env = (o: Partial<InstallEnv>): InstallEnv => ({ ...base, ...o });

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_FB = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0]';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('detectInstallState', () => {
  it('installed: each of the four signals alone', () => {
    for (const k of ['displayModeStandalone', 'displayModeFullscreen', 'displayModeMinimalUi', 'navigatorStandalone'] as const) {
      expect(detectInstallState(env({ [k]: true, userAgent: IPHONE_SAFARI })), k).toBe('installed');
    }
  });
  it('installed wins over an in-app UA and over missing support', () => {
    expect(detectInstallState(env({ displayModeStandalone: true, userAgent: IPHONE_INSTAGRAM, hasServiceWorker: false }))).toBe('installed');
  });
  it('android-promptable and android-other', () => {
    expect(detectInstallState(env({ userAgent: ANDROID_CHROME, maxTouchPoints: 5, hasPromptEvent: true }))).toBe('android-promptable');
    expect(detectInstallState(env({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 }))).toBe('android-other');
  });
  it('ios-safari and ios-other', () => {
    expect(detectInstallState(env({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }))).toBe('ios-safari');
    expect(detectInstallState(env({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 }))).toBe('ios-other');
  });
  it('iPadOS (reports as Mac with touch) is iOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(detectInstallState(env({ userAgent: ua, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe('ios-safari');
  });
  it('in-app browsers, even without service worker support', () => {
    expect(detectInstallState(env({ userAgent: IPHONE_INSTAGRAM, maxTouchPoints: 5, hasServiceWorker: false }))).toBe('in-app-browser');
    expect(detectInstallState(env({ userAgent: ANDROID_FB, maxTouchPoints: 5 }))).toBe('in-app-browser');
  });
  it('desktop needs no touch and a wide screen', () => {
    expect(detectInstallState(env({ userAgent: DESKTOP }))).toBe('desktop');
    expect(detectInstallState(env({ userAgent: DESKTOP, platform: 'MacIntel' }))).toBe('desktop');
  });
  it('unsupported: no service worker or no IndexedDB', () => {
    expect(detectInstallState(env({ userAgent: DESKTOP, hasServiceWorker: false }))).toBe('unsupported');
    expect(detectInstallState(env({ userAgent: ANDROID_CHROME, maxTouchPoints: 5, hasIndexedDB: false }))).toBe('unsupported');
  });
  it('an unknown touch device falls back to generic steps', () => {
    expect(detectInstallState(env({ userAgent: DESKTOP, maxTouchPoints: 2, viewportWidth: 400 }))).toBe('android-other');
  });
});
