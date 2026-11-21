import { useEffect, useState } from 'preact/hooks';
import catalogue from '../../contract/features.catalogue.json';
import { freeBuildReady } from './freeBuild';

export interface FeatureDef {
  key: string;
  label: string;
  group: string;
  default: boolean;
  needsConnection: boolean;
  adminLockable: boolean;
}

const defs = new Map<string, FeatureDef>((catalogue.features as FeatureDef[]).map((f) => [f.key, f]));

export function isKnownFeature(key: string): boolean {
  return defs.has(key);
}

export function featureDef(key: string): FeatureDef | undefined {
  return defs.get(key);
}

export function allFeatureKeys(): string[] {
  return [...defs.keys()];
}

/** Standalone value: needsConnection features are off, everything else uses its catalogue default. */
export function standaloneValue(key: string): boolean {
  const d = defs.get(key);
  if (!d) return false;
  if (d.needsConnection) return false;
  // Phase 78 [A-P74.1]: a build default, not a catalogue change. Free backup is on only when the build carries the free shard values.
  if ((key === 'cloud_backup' || key === 'free_account') && freeBuildReady()) return true;
  return d.default;
}

/**
 * Policy hook point (contract/policy.md). Phase 66 installs a resolver that applies gym locks and
 * user switches. It receives the standalone value and may return a replacement, or undefined to keep it.
 * Until then no resolver is set, so locks do not exist.
 */
export type PolicyResolver = (key: string, standalone: boolean) => boolean | undefined;

let resolver: PolicyResolver | null = null;
const listeners = new Set<() => void>();

export function setPolicyResolver(fn: PolicyResolver | null): void {
  resolver = fn;
  notifyFlagsChanged();
}

export function notifyFlagsChanged(): void {
  listeners.forEach((l) => l());
}

/** Resolve a feature. Unknown keys are off. */
export function resolveFeature(key: string): boolean {
  const base = standaloneValue(key);
  if (!resolver) return base;
  const r = resolver(key, base);
  return r === undefined ? base : r;
}

/** True when the feature is on. A null key (core screens) is always on. Re-renders when the policy changes. */
export function useFeature(key: string | null): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return key === null ? true : resolveFeature(key);
}
