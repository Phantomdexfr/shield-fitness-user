import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { IDLE_HOLD, TIMED_SLUGS, clockSeconds, defaultTarget, holdAt, holdMs, holdSeconds, isTimedSlug, pauseHold, secondsLeft, startHold, timedFromDraft } from '../../src/shared/timed';
import { experienceMp } from '../../src/shared/badges/experience';

describe('timed slugs', () => {
  it('every timed slug is a real library exercise', () => {
    const dir = 'src/dataset/generated';
    const slugs = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.startsWith('exercises.detail.'))) for (const k of Object.keys(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))) slugs.add(k);
    for (const s of TIMED_SLUGS) expect(slugs.has(s), s).toBe(true);
  });
  it('plank, hold and carry are timed; bench press and moving planks are not', () => {
    expect(isTimedSlug('plank')).toBe(true);
    expect(isTimedSlug('wall-sit')).toBe(true);
    expect(isTimedSlug('dumbbell-farmers-carry')).toBe(true);
    expect(isTimedSlug('barbell-bench-press')).toBe(false);
    expect(isTimedSlug('plank-jack')).toBe(false);
  });
});

describe('hold timer', () => {
  it('runs, pauses, resumes and keeps real time', () => {
    let t = startHold(IDLE_HOLD, 1000);
    expect(holdSeconds(t, 6500)).toBe(5);
    t = pauseHold(t, 11_000);
    expect(holdSeconds(t, 99_000)).toBe(10);
    t = startHold(t, 20_000);
    expect(holdSeconds(t, 25_000)).toBe(15);
    expect(holdMs(pauseHold(t, 30_000), 90_000)).toBe(20_000);
  });
  it('starting twice or pausing while paused changes nothing', () => {
    const r = startHold(IDLE_HOLD, 5);
    expect(startHold(r, 50)).toBe(r);
    expect(pauseHold(IDLE_HOLD, 50)).toBe(IDLE_HOLD);
  });
  it('seconds can be set by hand and are capped at an hour', () => {
    expect(holdSeconds(holdAt(45), 0)).toBe(45);
    expect(holdSeconds(holdAt(99999), 0)).toBe(3600);
    expect(holdSeconds(holdAt(-4), 0)).toBe(0);
  });
  it('countdown never goes below zero; default target is the middle of the range', () => {
    expect(secondsLeft(holdAt(30), 0, 45)).toBe(15);
    expect(secondsLeft(holdAt(60), 0, 45)).toBe(0);
    expect(defaultTarget(20, 60)).toBe(40);
    expect(defaultTarget(30, 45)).toBe(40);
  });
  it('clock text', () => {
    expect(clockSeconds(45)).toBe('45');
    expect(clockSeconds(90)).toBe('1:30');
  });
});

describe('timed rows and experience', () => {
  const at = '2026-11-25T08:00:00.000Z';
  it('timedFromDraft: seconds, no reps, weight only when given', () => {
    expect(timedFromDraft({ seconds: 45, weightKg: 0 }, at)).toEqual({ weightKg: null, reps: null, seconds: 45, tag: 'normal', doneAt: at });
    expect(timedFromDraft({ seconds: 30, weightKg: 10 }, at, 60)).toMatchObject({ weightKg: 10, seconds: 30, restSec: 60 });
  });
  it('a hold of 10 s or more counts as a set for Experience; 5 s does not', () => {
    const ex = (seconds: number) => ({ day: '2026-11-25', exercises: [{ weights: { abs: 1 }, sets: [{ reps: null, seconds }] }] });
    expect(experienceMp([ex(45)]).abs).toBe(1);
    expect(experienceMp([ex(5)]).abs).toBeUndefined();
  });
});
