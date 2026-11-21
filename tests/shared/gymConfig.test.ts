import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractPayload, gymConfigMessage, parseGymConfig } from '../../src/shared/gymConfig';

const read = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const valid = read('gymconfig_valid');
const invalid = read('gymconfig_invalid');

describe('parseGymConfig: good codes (fixtures gymconfig_valid)', () => {
  for (const c of valid.cases) {
    it(c.name, () => {
      const r = parseGymConfig(c.input, { allowedHosts: c.allowedHosts });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.host).toBe(c.host);
      if (c.gymName) expect(r.config.name).toBe(c.gymName);
      if (c.trainIds) expect(r.config.train.map((x) => x.id)).toEqual(c.trainIds);
      if (c.coreUrl) expect(r.config.core.url).toBe(c.coreUrl);
      if (c.functions) expect(r.config.functions).toBe(c.functions);
    });
  }
});

describe('parseGymConfig: bad codes are rejected with the right code (fixtures gymconfig_invalid)', () => {
  for (const c of invalid.cases) {
    it(c.name, () => {
      const r = parseGymConfig(c.input, { allowedHosts: c.allowedHosts });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe(c.code);
      expect(!!r.allowListMiss).toBe(!!c.allowListMiss);
    });
  }
  it('a failure never carries the input or a key back', () => {
    const c = invalid.cases.find((x: { code: string }) => x.code === 'GCF_SECRET');
    const r = parseGymConfig(c.input);
    expect(JSON.stringify(r)).not.toContain('FAKESIGNATURE');
    expect(gymConfigMessage(r as never)).not.toContain('FAKESIGNATURE');
  });
});

describe('extractPayload', () => {
  it('finds the code in a link fragment, not elsewhere', () => {
    expect(extractPayload('https://a.b/connect#SFCFG1.abc')).toBe('abc');
    expect(extractPayload('https://a.b/connect?x=SFCFG1.abc')).toBeNull();
  });
});
