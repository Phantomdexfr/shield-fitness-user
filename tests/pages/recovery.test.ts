import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import { balance, recoveryMap, recoveryStates, readyMuscles, type RecoveryEntry } from '../../src/shared/recovery';
import { marksToSets, markOf, type MuscleMark } from '../../src/shared/avoid';
import { restHint, type RecoveryStates } from '../../src/shared/schedule';
import { stateClass } from '../../src/ui/body/BodyPicker';
import {
  applyChoice, balanceLines, figureStates, isListed, markChoices, markRecord, markRows, readyList, recRows, stateClassOf, stateCounts, STATE_ORDER, waitText,
} from '../../src/pages/body/recoveryModel';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const map = fx('recovery_map');
const tax = buildTaxonomy(map.taxonomy);
const NOW = Date.parse(map.now);
const entries: RecoveryEntry[] = map.entries.map((e: { minutesAgo: number; weights: Record<string, number> }) => ({ at: NOW - e.minutesAgo * 60_000, weights: e.weights }));
const rec = recoveryMap(entries, tax, NOW);
const none = new Set<string>();

describe('state colour mapping', () => {
  it('each recovery state draws its own class, and the model names the same class', () => {
    for (const s of STATE_ORDER) {
      expect(stateClass('lats', { mode: 'recovery', recovery: { lats: s } }, none, none)).toBe(`sf-body__u--rec-${s}`);
      expect(stateClassOf(s)).toBe(`sf-body__u--rec-${s}`);
    }
  });
  it('a child with its own state beats the parent state', () => {
    expect(stateClass('upper_chest', { mode: 'recovery', recovery: { chest: 'fatigued', upper_chest: 'ready' } }, none, none)).toBe('sf-body__u--rec-ready');
    expect(stateClass('lower_chest', { mode: 'recovery', recovery: { chest: 'fatigued', upper_chest: 'ready' } }, none, none)).toBe('sf-body__u--rec-fatigued');
  });
  it('marks draw avoid and sore, and a mark beats a recovery colour', () => {
    expect(stateClass('biceps', { mode: 'marks', marks: { biceps: 'avoid' } }, none, none)).toBe('sf-body__u--avoid');
    expect(stateClass('biceps', { mode: 'marks', marks: { biceps: 'sore' } }, none, none)).toBe('sf-body__u--sore');
    expect(stateClass('biceps', { mode: 'recovery', marks: { biceps: 'avoid' }, recovery: { biceps: 'ready' } }, none, none)).toBe('sf-body__u--avoid');
  });
  it('figureStates equals the scheduler record', () => {
    expect(figureStates(rec)).toEqual(recoveryStates(rec));
  });
});

describe('recovery rows, ready list, waits', () => {
  const rows = recRows(rec, tax);
  it('rows are leaf muscles only, worst state first, never a parent that has children', () => {
    expect(rows.every((r) => tax.childrenOf(r.id).length === 0)).toBe(true);
    const order = rows.map((r) => STATE_ORDER.indexOf(r.state));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it('counts add up to the rows', () => {
    const c = stateCounts(rows);
    expect(c.fatigued + c.recovering + c.ready + c.fresh).toBe(rows.length);
  });
  it('the ready list holds only ready or fresh listed muscles', () => {
    const list = readyList(rec, tax);
    for (const id of list) expect(['ready', 'fresh']).toContain(rec[id]!.state);
    for (const id of readyMuscles(rec, tax)) expect(list).toContain(id);
  });
  it('real taxonomy: back, abs, glutes, quads and calves are listed; chest, shoulders and traps (group only) are not', () => {
    const real = buildTaxonomy(JSON.parse(readFileSync(readdirSync('src/dataset/generated').filter((f) => f.startsWith('muscles.')).map((f) => `src/dataset/generated/${f}`)[0]!, 'utf8')).muscles);
    for (const id of ['back', 'abs', 'glutes', 'quads', 'calves', 'lats', 'upper_chest', 'soleus']) expect(isListed(id, real), id).toBe(true);
    for (const id of ['chest', 'shoulders', 'traps']) expect(isListed(id, real), id).toBe(false);
  });
  it('a squat day leaves quads and glutes in the ready list once rested', () => {
    const real = buildTaxonomy(JSON.parse(readFileSync(readdirSync('src/dataset/generated').filter((f) => f.startsWith('muscles.')).map((f) => `src/dataset/generated/${f}`)[0]!, 'utf8')).muscles);
    const r = recoveryMap([{ at: NOW - 100 * 3_600_000, weights: { quads: 1, glutes: 0.8 } }], real, NOW);
    expect(r.quads!.state).toBe('ready');
    expect(readyList(r, real)).toEqual(expect.arrayContaining(['quads', 'glutes']));
  });
  it('waitText: hours under 48, days (rounded up) from 48', () => {
    expect(waitText(0.2)).toEqual({ unit: 'h', n: 1 });
    expect(waitText(23.1)).toEqual({ unit: 'h', n: 24 });
    expect(waitText(47.9)).toEqual({ unit: 'h', n: 48 });
    expect(waitText(48)).toEqual({ unit: 'd', n: 2 });
    expect(waitText(49)).toEqual({ unit: 'd', n: 3 });
  });
});

describe('balance lines', () => {
  it('names the smaller side with its percent, says balanced, or says not enough', () => {
    const lines = balanceLines(balance({ chest: 10, lats: 4, quads: 6, hamstrings: 6 }));
    const push = lines.find((l) => l.axis === 'pushPull')!;
    expect(push).toMatchObject({ kind: 'lags', lead: 'pull', trail: 'push', percent: 40 });
    const ul = lines.find((l) => l.axis === 'upperLower')!;
    expect(ul).toMatchObject({ kind: 'balanced', percent: 86 });
    expect(balanceLines(balance({})).every((l) => l.kind === 'no_data')).toBe(true);
    expect(balanceLines(balance({ chest: 6, lats: 6 })).find((l) => l.axis === 'pushPull')).toMatchObject({ kind: 'balanced' });
  });
});

describe('marks flow', () => {
  const start: MuscleMark[] = [];
  it('choices: two marks, plus Clear only when the muscle has its own mark', () => {
    expect(markChoices(undefined)).toEqual(['avoid', 'sore']);
    expect(markChoices('avoid')).toEqual(['avoid', 'sore', 'clear']);
  });
  it('mark, switch, tap again to clear; a muscle never keeps two marks', () => {
    const a = applyChoice(start, 'biceps', undefined, 'avoid');
    expect(a).toEqual([{ muscle: 'biceps', kind: 'avoid' }]);
    const b = applyChoice(a, 'biceps', 'avoid', 'sore');
    expect(b).toEqual([{ muscle: 'biceps', kind: 'sore' }]);
    expect(applyChoice(b, 'biceps', 'sore', 'sore')).toEqual([]);
    expect(applyChoice(b, 'biceps', 'sore', 'clear')).toEqual([]);
    expect(start).toEqual([]);
  });
  it('the figure record and the text list agree; avoid sorts first', () => {
    const marks: MuscleMark[] = [{ muscle: 'triceps', kind: 'sore' }, { muscle: 'lats', kind: 'avoid' }, { muscle: 'biceps', kind: 'sore' }];
    expect(markRecord(marks)).toEqual({ triceps: 'sore', lats: 'avoid', biceps: 'sore' });
    expect(markRows(marks).map((m) => m.muscle)).toEqual(['lats', 'biceps', 'triceps']);
  });
  it('avoid and sore reach the suggestion sets; a core mark covers its parts', () => {
    const marks = applyChoice(applyChoice([], 'lats', undefined, 'avoid'), 'chest', undefined, 'sore');
    const sets = marksToSets(marks);
    expect([...sets.avoid]).toEqual(['lats']);
    expect([...sets.sore]).toEqual(['chest']);
    expect(markOf(marks, 'upper_chest', tax)).toBe('sore');
  });
});

describe('scheduler hint from the real clock (>= 60% fatigued)', () => {
  const tired: RecoveryEntry[] = [{ at: NOW - 60_000, weights: { upper_chest: 1, lower_chest: 1, triceps: 1, front_delts: 0.1 } }];
  const states = recoveryStates(recoveryMap(tired, tax, NOW)) as RecoveryStates;
  it('shows when 2 of 3 target muscles are fatigued, and names them', () => {
    const day = { id: 'd', name: 'Push', targetMuscles: ['upper_chest', 'lower_chest', 'lats'] };
    expect(restHint(day, states, true)).toEqual({ muscles: ['upper_chest', 'lower_chest'] });
  });
  it('hidden below 60%, with the switch off, or with no recovery data', () => {
    const day = { id: 'd', name: 'Mixed', targetMuscles: ['upper_chest', 'lats', 'biceps'] };
    expect(restHint(day, states, true)).toBeUndefined();
    expect(restHint({ id: 'd', name: 'Push', targetMuscles: ['upper_chest'] }, states, false)).toBeUndefined();
    expect(restHint({ id: 'd', name: 'Push', targetMuscles: ['upper_chest'] }, {}, true)).toBeUndefined();
  });
});
