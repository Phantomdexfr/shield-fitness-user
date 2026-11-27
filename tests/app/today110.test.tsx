// @vitest-environment happy-dom
// Phase 110: Today in both styles (hero + ring, Start, Next up, Quick tiles, empty state, View switch). Verify line of PHASES.md Phase 110.
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import TodayPage, { dateLabel, ringOf } from '../../src/pages/today/TodayPage';
import { applyUx } from '../../src/app/appearance';
import { setPolicyResolver } from '../../src/app/flags';
import { onUxChange } from '../../src/data/repos/ux';
import { createAndSave, putRoutine } from '../../src/data/repos/routines';
import { beginDay, finishSession, putSession } from '../../src/data/repos/sessions';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';
import { newItem } from '../../src/shared/routineEdit';
import type { Session } from '../../src/shared/session';

const host = document.createElement('div');
document.body.appendChild(host);
beforeAll(() => {
  onUxChange(applyUx);
});
afterEach(() => {
  render(null, host);
  setPolicyResolver(null);
});

const settle = async () => {
  for (let i = 0; i < 12; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
};
const mount = async () => {
  await act(async () => render(null, host)); // a fresh mount: useUx reads the root attribute again
  await act(async () => render(<Router hook={memoryLocation({ path: '/' }).hook}><TodayPage /></Router>, host));
  await settle();
};
const premium = () => applyUx(DEFAULT_SWITCHES);
const classic = () => applyUx(allSwitches(false));
const btn = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const SLUGS = ['bench-press', 'squat', 'deadlift', 'row', 'curl'];

describe('pure helpers', () => {
  test('dateLabel reads an IST day key as "Weekday, D Mon"', () => {
    expect(dateLabel('2026-11-26')).toBe('Thursday, 26 Nov');
    expect(dateLabel('2026-01-05')).toBe('Monday, 5 Jan');
  });
  test('ringOf: full when done, logged / planned in a session open today, empty before, none with nothing to count', () => {
    const today = '2026-11-26';
    const sess = (items: number, logged: number, endedAt?: string): Session => ({
      id: 's', clientId: 's', startedAt: '2026-11-26T05:00:00.000Z', ...(endedAt ? { endedAt } : {}),
      items: Array.from({ length: items }, (_, i) => ({ ref: { kind: 'lib' as const, slug: `x${i}` }, status: 'todo' as const, order: i, sets: i < logged ? [{ weightKg: 10, reps: 8, tag: 'normal' as const, doneAt: 'x' }] : [] })),
    });
    expect(ringOf(undefined, today, true, 5)).toEqual({ done: 5, n: 5 });
    expect(ringOf(sess(4, 2), today, false, 4)).toEqual({ done: 2, n: 4 });
    expect(ringOf(sess(4, 2, '2026-11-26T06:00:00.000Z'), today, false, 4)).toEqual({ done: 0, n: 4 });
    expect(ringOf({ ...sess(4, 2), startedAt: '2026-11-20T05:00:00.000Z' }, today, false, 4)).toEqual({ done: 0, n: 4 });
    expect(ringOf(undefined, today, false, 0)).toBeUndefined();
  });
});

describe('Today without a routine', () => {
  test('Premium: a gold figure, ONE line, ONE primary button, "Just start" as a text link, Quick tiles', async () => {
    premium();
    await mount();
    expect(host.querySelector('.sf-today-empty')).not.toBeNull();
    expect(host.querySelector('.sf-today-empty .sf-body, .sf-today-empty svg')).not.toBeNull();
    expect(host.querySelectorAll('.sf-today-empty > p').length).toBe(1);
    expect(host.querySelectorAll('.sf-today-empty > .sf-btn').length).toBe(1);
    expect(btn('Make a routine')).toBeTruthy();
    const link = host.querySelector('button.sf-today__link');
    expect(link?.textContent).toBe('Just start');
    expect(host.querySelector('.sf-qtiles')).not.toBeNull();
    expect(host.querySelector('.sf-qgrid')).toBeNull();
    expect(host.querySelector('.sf-today__date')?.textContent).toMatch(/^[A-Z][a-z]+day, \d{1,2} [A-Z][a-z]{2}$/);
  });
  test('Classic: the old gold card with two buttons and the old Quick buttons', async () => {
    classic();
    await mount();
    expect(host.querySelector('.sf-today-empty')).toBeNull();
    expect(host.querySelectorAll('.sf-sc__today .sf-btn').length).toBe(2);
    expect(host.querySelector('.sf-qgrid')).not.toBeNull();
    expect(host.querySelector('.sf-qtiles')).toBeNull();
    expect(host.querySelector('.sf-today__date')).toBeNull();
  });
});

describe('Today with a plan', () => {
  test('setup: one routine, one day of five exercises', async () => {
    const made = await createAndSave({ name: 'Test', days: 2, weekdays: [], splitStyle: 'full_body' as never });
    if (!made.ok) throw new Error(made.error);
    const r = made.routine;
    r.days[0] = { ...r.days[0]!, items: SLUGS.map((slug) => newItem({ kind: 'lib', slug })) };
    await putRoutine(r);
    expect((await createAndSave({ name: 'Other', days: 2, weekdays: [], splitStyle: 'full_body' as never })).ok).toBe(true);
  });

  test('Premium: hero, ring at 0, liquid-gold Start, Swap day + Rest today, week strip, Next up (3 + "+2 more"), Quick tiles', async () => {
    premium();
    await mount();
    expect(host.querySelector('.sf-today-hero')).not.toBeNull();
    expect(host.querySelector('.sf-sc__today')).toBeNull();
    expect(host.querySelector('.sf-ring')?.getAttribute('aria-label')).toBe('0 of 5 exercises logged');
    const start = host.querySelector('.sf-start');
    expect(start?.textContent).toBe('Start workout');
    expect(host.querySelectorAll('.sf-start').length).toBe(1);
    expect(btn('Swap day')).toBeTruthy();
    expect(btn('Rest today')).toBeTruthy();
    expect(host.querySelector('.sf-today-hero')?.textContent).toMatch(/5 exercises/);
    expect(host.querySelector('.sf-today-hero ~ .sf-rt__block')).not.toBeNull(); // the week block (WeekView, logic untouched) follows the hero
    expect(host.querySelectorAll('.sf-nextup__row').length).toBe(3);
    expect(host.querySelector('.sf-nextup')?.textContent).toContain('+2 more');
    expect(host.querySelector('.sf-nextup__meta')?.textContent).toMatch(/^\d+ x \d+(-\d+)?$/);
    expect(host.querySelector('.sf-qtiles')).not.toBeNull();
    expect(host.querySelector('.sf-view')).toBeNull(); // no View button on pages; the switch is in Settings -> Appearance
  });

  test('Premium: "+2 more" is a button; it expands to all 5 rows and "Less" collapses back to 3', async () => {
    premium();
    await mount();
    const more = btn('+2 more');
    expect(more).toBeTruthy();
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { more?.click(); });
    await settle();
    expect(host.querySelectorAll('.sf-nextup__row').length).toBe(5);
    const less = btn('Less');
    expect(less?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { less?.click(); });
    await settle();
    expect(host.querySelectorAll('.sf-nextup__row').length).toBe(3);
    expect(btn('+2 more')).toBeTruthy();
  });

  test('Classic: byte-for-byte the old card, no ring, no Next up, no liquid Start, the old Quick buttons', async () => {
    classic();
    await mount();
    expect(host.querySelector('.sf-sc__today')).not.toBeNull();
    expect(host.querySelector('.sf-today-hero, .sf-ring, .sf-nextup, .sf-start, .sf-qtiles, .sf-view, .sf-today__date')).toBeNull();
    expect(btn('Start')).toBeTruthy();
    expect(host.querySelector('.sf-qgrid')).not.toBeNull();
    expect(host.querySelector('.sf-today__head')).not.toBeNull();
  });

  test('Quick tiles: each is gated by its own flag and a hidden tile leaves no gap', async () => {
    premium();
    await mount();
    const labels = () => [...host.querySelectorAll('.sf-qtile__lbl')].map((n) => n.textContent);
    expect(labels()).toContain('Quick workout');
    expect(labels()).toContain('History');
    setPolicyResolver((k) => (k === 'quick_workout' ? false : undefined));
    await mount();
    expect(labels()).toEqual(['History']);
    expect(host.querySelectorAll('.sf-qtile').length).toBe(1);
  });

  test('Today card off (flag): no hero and no Next up in Premium', async () => {
    premium();
    setPolicyResolver((k) => (k === 'today_card' ? false : undefined));
    await mount();
    expect(host.querySelector('.sf-today-hero')).toBeNull();
    expect(host.querySelector('.sf-start')).toBeNull();
  });

  test('switching Page layouts off (as Settings -> Appearance does) gives the Classic Today at once', async () => {
    premium();
    await mount();
    const { setUxSwitch } = await import('../../src/data/repos/ux');
    await act(async () => { await setUxSwitch('layout', false); });
    await settle();
    expect(document.documentElement.getAttribute('data-ux-layout')).toBe('classic');
    expect(host.querySelector('.sf-sc__today')).not.toBeNull();
    expect(host.querySelector('.sf-today-hero')).toBeNull();
  });

  test('ring counts exercises with a set logged in a session open today', async () => {
    premium();
    const { listRoutines } = await import('../../src/data/repos/routines');
    const active = (await listRoutines()).find((r) => r.active)!;
    const s = (await beginDay(active.id, active.days[0]!.id))!;
    s.items[0]!.sets.push({ weightKg: 40, reps: 8, tag: 'normal', doneAt: new Date().toISOString() });
    s.items[1]!.sets.push({ weightKg: 40, reps: 8, tag: 'normal', doneAt: new Date().toISOString() });
    await putSession(s);
    await mount();
    expect(host.querySelector('.sf-ring')?.getAttribute('aria-label')).toBe('2 of 5 exercises logged');
  });

  test('after a finished workout: full ring, the done text, no Next up, no Start workout; Classic shows the same text', async () => {
    const { currentOpen } = await import('../../src/data/repos/sessions');
    const open = (await currentOpen())!;
    await finishSession(open, 'drop');
    premium();
    await mount();
    expect(host.querySelector('.sf-ring')?.getAttribute('aria-label')).toBe('Workout completed');
    expect(host.querySelector('.sf-today-hero')?.textContent).toContain('Workout for today completed');
    expect(host.querySelector('.sf-nextup')).toBeNull();
    expect(host.querySelector('.sf-start')).toBeNull();
    classic();
    await mount();
    expect(host.querySelector('.sf-sc__today')?.textContent).toContain('Workout for today completed');
    expect(host.querySelector('.sf-ring')).toBeNull();
  });
});
