import { afterEach, describe, expect, it } from 'vitest';
import catalogue from '../../contract/features.catalogue.json';
import { resolveFeature, setPolicyResolver, standaloneValue, isKnownFeature } from '../../src/app/flags';

afterEach(() => setPolicyResolver(null));

describe('feature flags (standalone)', () => {
  it('uses the catalogue default for every feature, and forces needsConnection off', () => {
    for (const f of catalogue.features) {
      expect(resolveFeature(f.key), f.key).toBe(f.needsConnection ? false : f.default);
    }
  });
  it('known examples', () => {
    expect(resolveFeature('muscle_lab')).toBe(true);
    expect(resolveFeature('rpe_logging')).toBe(false);
    expect(resolveFeature('membership')).toBe(false);
  });
  it('unknown keys are off', () => {
    expect(isKnownFeature('nope')).toBe(false);
    expect(resolveFeature('nope')).toBe(false);
  });
  it('policy hook can override and undefined keeps the standalone value', () => {
    setPolicyResolver((k) => (k === 'muscle_lab' ? false : undefined));
    expect(resolveFeature('muscle_lab')).toBe(false);
    expect(resolveFeature('heatmap')).toBe(standaloneValue('heatmap'));
  });
});
