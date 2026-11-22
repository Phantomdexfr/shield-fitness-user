import { describe, expect, it } from 'vitest';
import {
  STEP_IDS, advance, back, birthStartDay, cleanHeightCm, cmToFtIn, finish, firstRunDecision, freshState, heightLabel,
  isLastStep, parseState, progressOf, redirectExempt, resumeStep, visibleSteps, type Known,
} from '../../src/shared/onboarding';

const none: Known = { gym: false, name: false, birth: false, sex: false };
const all = visibleSteps(none);

describe('onboarding steps', () => {
  it('a new person sees five steps in order', () => {
    expect(all).toEqual(['name', 'birth', 'about', 'training', 'finish']);
    expect(all).toEqual([...STEP_IDS]);
  });
  it('Continue moves on and clears a skip mark; the last step does not advance', () => {
    let s = freshState();
    s = advance(s, all);
    expect(s.step).toBe('birth');
    s = advance(s, all, { skip: true });
    expect(s.step).toBe('about');
    expect(s.skipped).toEqual(['birth']);
    s = back(s, all);
    s = advance(s, all); // came back to birth and answered it
    expect(s.skipped).toEqual([]);
    const end = { ...s, step: 'finish' as const };
    expect(advance(end, all)).toBe(end);
  });
  it('every skippable step can be skipped, and skip twice does not duplicate', () => {
    let s = freshState();
    for (let i = 0; i < 4; i++) s = advance(s, all, { skip: true });
    expect(s.step).toBe('finish');
    expect(s.skipped).toEqual(['name', 'birth', 'about', 'training']);
    s = { ...s, step: 'name' };
    s = advance(s, all, { skip: true });
    expect(s.skipped).toEqual(['name', 'birth', 'about', 'training']);
  });
  it('Back always works, and stays put on the first step', () => {
    const first = freshState();
    expect(back(first, all)).toBe(first);
    expect(back({ ...first, step: 'finish' }, all).step).toBe('training');
  });
  it('progress is 1-based and counts only shown steps', () => {
    expect(progressOf('name', all)).toEqual({ index: 1, total: 5 });
    expect(progressOf('about', all)).toEqual({ index: 3, total: 5 });
    expect(isLastStep('finish', all)).toBe(true);
    expect(isLastStep('about', all)).toBe(false);
  });
});

describe('resume', () => {
  it('a saved step comes back after an app kill', () => {
    const saved = parseState(JSON.parse(JSON.stringify({ ...freshState(), step: 'about', skipped: ['birth'] })))!;
    expect(resumeStep(saved, all)).toBe('about');
    expect(saved.skipped).toEqual(['birth']);
  });
  it('a saved step that is no longer shown moves to the next shown one', () => {
    const gym: Known = { gym: true, name: true, birth: true, sex: true };
    const steps = visibleSteps(gym);
    expect(resumeStep({ ...freshState(), step: 'name' }, steps)).toBe('training');
    expect(resumeStep({ ...freshState(), step: 'about' }, steps)).toBe('training');
  });
  it('damaged or unknown stored values read as never started', () => {
    expect(parseState(null)).toBeNull();
    expect(parseState({ v: 2, done: false, step: 'name' })).toBeNull();
    expect(parseState({ v: 1, done: false, step: 'nope' })).toBeNull();
    const p = parseState({ v: 1, done: false, step: 'birth', skipped: ['name', 'name', 'x'], backup: 'zzz', finishedAt: 'no' })!;
    expect(p.skipped).toEqual(['name']);
    expect(p.backup).toBeNull();
    expect(p.finishedAt).toBeNull();
  });
});

describe('gym-member shortcuts', () => {
  it('a gym member skips the steps the phone already knows', () => {
    expect(visibleSteps({ gym: true, name: true, birth: false, sex: false })).toEqual(['birth', 'about', 'training', 'finish']);
    expect(visibleSteps({ gym: true, name: true, birth: true, sex: true })).toEqual(['training', 'finish']);
  });
  it('a standalone person never skips a step, even with data stored (they may change it)', () => {
    expect(visibleSteps({ gym: false, name: true, birth: true, sex: true })).toEqual([...STEP_IDS]);
  });
  it('a re-run from Settings shows everything even for a gym member', () => {
    expect(visibleSteps({ gym: true, name: true, birth: true, sex: true }, true)).toEqual([...STEP_IDS]);
  });
});

describe('finish and first run', () => {
  it('finish never turns anything on by itself and records the choice', () => {
    const s = finish({ ...freshState(), step: 'finish' }, 'later', 1000);
    expect(s).toMatchObject({ done: true, backup: 'later', finishedAt: 1000 });
    expect(finish(freshState(), 'backup', 5).backup).toBe('backup');
  });
  it('runs once: fresh = run, started = resume, done = never again, old install = skip', () => {
    expect(firstRunDecision(null, { hasData: false })).toBe('run');
    expect(firstRunDecision(null, { hasData: true })).toBe('skip');
    expect(firstRunDecision(freshState(), { hasData: true })).toBe('run');
    expect(firstRunDecision({ ...freshState(), done: true }, { hasData: false })).toBe('no');
  });
  it('links that open on purpose are not redirected', () => {
    for (const p of ['/welcome', '/connect', '/share', '/share/receive', '/settings/gym/add', '/settings/backup/consent']) expect(redirectExempt(p), p).toBe(true);
    for (const p of ['/', '/train', '/settings', '/settings/account', '/sharex']) expect(redirectExempt(p), p).toBe(false);
  });
});

describe('the numbers', () => {
  it('height: 0 = not set, otherwise a whole number 100..250', () => {
    expect(cleanHeightCm(0)).toBe(0);
    expect(cleanHeightCm(99)).toBe(0);
    expect(cleanHeightCm(251)).toBe(0);
    expect(cleanHeightCm(170.4)).toBe(170);
    expect(cleanHeightCm('170')).toBe(0);
    expect(cleanHeightCm(NaN)).toBe(0);
  });
  it('feet and inches', () => {
    expect(cmToFtIn(170)).toEqual({ ft: 5, inch: 7 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 });
    expect(heightLabel(170, 'cm')).toBe('170 cm');
    expect(heightLabel(170, 'ft')).toBe('5′ 7″');
    expect(heightLabel(0, 'cm')).toBe('');
  });
  it('the birth calendar opens 25 years back', () => {
    expect(birthStartDay('2026-11-22')).toBe('2001-01-01');
  });
});
