// Phase 82: with no gym and no VITE_SHARE_RELAY_URL, the plan-share relay falls back to the free-backup core functions URL and public anon key.
import { afterEach, describe, expect, it } from 'vitest';
import { relayAvailable, relayConfig, setGymRelay } from '../../src/data/relay/client';
import { setFreeConfigForTest } from '../../src/app/freeBuild';

afterEach(() => {
  setGymRelay(null);
  setFreeConfigForTest(null);
});

describe('relayConfig fallback (Phase 82)', () => {
  it('uses the core functions URL and anon key when no relay is set', () => {
    setFreeConfigForTest({ shards: [], functionsUrl: 'https://core.example/functions/v1', coreAnon: 'sb_publishable_abcdef' });
    expect(relayConfig()).toEqual({ url: 'https://core.example/functions/v1', anon: 'sb_publishable_abcdef' });
    expect(relayAvailable()).toBe(true);
  });
  it('a gym relay still wins', () => {
    setFreeConfigForTest({ shards: [], functionsUrl: 'https://core.example/functions/v1', coreAnon: 'sb_publishable_abcdef' });
    setGymRelay({ url: 'https://gym.example/f', anon: 'g' });
    expect(relayConfig()?.url).toBe('https://gym.example/f');
  });
  it('stays hidden when the build has no core values (or a non-https URL, or a short key)', () => {
    setFreeConfigForTest({ shards: [], functionsUrl: '', coreAnon: '' });
    expect(relayConfig()).toBeNull();
    setFreeConfigForTest({ shards: [], functionsUrl: 'http://core.example/f', coreAnon: 'sb_publishable_abcdef' });
    expect(relayConfig()).toBeNull();
    setFreeConfigForTest({ shards: [], functionsUrl: 'https://core.example/f', coreAnon: 'short' });
    expect(relayAvailable()).toBe(false);
  });
});
