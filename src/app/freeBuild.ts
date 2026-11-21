// Phase 78 [A-P74.2]: the free-backup values baked into the build (public URLs and anon keys only, never a service key).
// `VITE_FREE_SHARDS` = JSON array of {id,url,anonKey}; `VITE_CORE_FUNCTIONS_URL` = the core project's functions URL;
// `VITE_CORE_ANON_KEY` = the core project's public anon key (an anonymous function call sends it as bearer). Any missing = free backup is hidden.
import { freeConfigReady, parseFreeShards, type FreeConfig } from '../shared/freeAccount';

type Env = Record<string, unknown>;
export function readFreeConfig(env: Env = import.meta.env as Env): FreeConfig {
  const s = (k: string): string => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  return { shards: parseFreeShards(s('VITE_FREE_SHARDS')), functionsUrl: s('VITE_CORE_FUNCTIONS_URL').replace(/\/$/, ''), coreAnon: s('VITE_CORE_ANON_KEY') };
}

let cached: FreeConfig | null = null;
export const freeConfig = (): FreeConfig => (cached ??= readFreeConfig());
export const freeBuildReady = (): boolean => freeConfigReady(freeConfig());
/** Test seam. */
export const setFreeConfigForTest = (c: FreeConfig | null): void => {
  cached = c;
};
