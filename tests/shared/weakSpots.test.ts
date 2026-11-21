import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import { groupValues, median, pickDay, weakSpots } from '../../src/shared/weakSpots';

const load = (f: string) => JSON.parse(readFileSync(`contract/fixtures/${f}`, 'utf8'));
const cases = load('weakspots_cases.json');
const tax = buildTaxonomy(cases.muscles);

describe('weakSpots fixtures (engines.md 23)', () => {
  for (const c of cases.cases) {
    it(c.name, () => {
      const r = weakSpots({ entries: c.entries, today: c.today, sessions: c.sessions, groups: c.groups, tax, marked: c.marked });
      expect(r).toEqual({ ...c.expected, sessions: c.sessions });
      if (c.expectedValues) expect(groupValues(c.entries, c.today, tax)).toEqual(c.expectedValues);
    });
  }
  it('does not change its input and gives the same answer twice', () => {
    const c = cases.cases[0];
    const copy = JSON.stringify(c.entries);
    const a = weakSpots({ entries: c.entries, today: c.today, sessions: c.sessions, groups: c.groups, tax });
    const b = weakSpots({ entries: [...c.entries].reverse(), today: c.today, sessions: c.sessions, groups: c.groups, tax });
    expect(JSON.stringify(c.entries)).toBe(copy);
    expect(b).toEqual(a);
  });
  it('median of nothing is 0', () => expect(median([])).toBe(0));
});

describe('pickDay fixtures', () => {
  const f = load('weakspots_routine.json');
  const t2 = buildTaxonomy(f.muscles);
  for (const c of f.cases) it(c.name, () => expect(pickDay(c.days, c.group, t2)).toBe(c.expected));
});
