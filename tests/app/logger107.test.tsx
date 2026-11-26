// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { SetLogger } from '../../src/pages/session/SetLogger';
import { applyUx } from '../../src/app/appearance';
import { onUxChange } from '../../src/data/repos/ux';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';
import { loggerWheel, wheelValues } from '../../src/shared/wheel';
import { DEFAULT_LOGGER_PREFS } from '../../src/shared/logger';
import type { Session } from '../../src/shared/session';
import type { LoggerInfo } from '../../src/data/repos/logger';

const host = document.createElement('div');
document.body.appendChild(host);
beforeAll(() => onUxChange(applyUx));
afterEach(() => render(null, host));

const INFO: LoggerInfo = { cls: 'compound', cardio: false, timed: false, repMin: 8, repMax: 12, stepKg: null, outOfOrder: false };
const session = (): Session => ({
  id: 's1', clientId: 's1', startedAt: '2026-11-26T05:00:00.000Z',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' } as never, status: 'doing', sets: [{ weightKg: 60, reps: 10, tag: 'normal', doneAt: '2026-11-26T05:10:00.000Z' }], order: 0 }],
});

const mount = async (sw: ReturnType<typeof allSwitches>, committed: Session[]) => {
  applyUx(sw);
  await act(async () => render(null, host));
  const sess = session();
  await act(async () => render(<SetLogger sess={sess} idx={0} item={sess.items[0]!} info={INFO} hist={undefined} prefs={DEFAULT_LOGGER_PREFS} onPrefs={() => {}} commit={(n) => { committed.push(n); }} />, host));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
const logSet = async () => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Log set') as HTMLElement;
  await act(async () => b.click());
};
const lastSet = (c: Session[]) => c[c.length - 1]!.items[0]!.sets.slice(-1)[0]!;

describe('loggerWheel (pure)', () => {
  test('the current value is always on the grid; a high value opens the full range', () => {
    expect(loggerWheel(60, 2.5, 1000, 'weight')).toEqual({ min: 0, max: 500, step: 2.5, value: 60 });
    const odd = loggerWheel(61, 2.5, 1000, 'weight');
    expect(wheelValues(odd.min, odd.max, odd.step)).toContain(61);
    expect(loggerWheel(620, 2.5, 1000, 'weight').max).toBe(1000);
    expect(loggerWheel(10, 1, 200, 'reps')).toEqual({ min: 0, max: 100, step: 1, value: 10 });
    expect(loggerWheel(150, 1, 200, 'reps').max).toBe(200);
    expect(loggerWheel(NaN, 2.5, 1000, 'weight').value).toBe(0);
  });
});

describe('Logger input: wheels and steppers save the same values', () => {
  test('Premium wheels: two spinbuttons, no steppers; keys move the draft and Log set saves it', async () => {
    const out: Session[] = [];
    await mount(DEFAULT_SWITCHES, out);
    const spins = [...host.querySelectorAll('[role="spinbutton"]')] as HTMLElement[];
    expect(spins.map((s) => s.getAttribute('aria-label'))).toEqual(['Weight (kg)', 'Reps']);
    expect(host.querySelector('.sf-stepper')).toBeNull();
    const w = spins[0]!, r = spins[1]!;
    expect(w.getAttribute('aria-valuenow')).toBe('60');
    for (let i = 0; i < 2; i++) await act(async () => { w.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    await act(async () => { r.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true })); });
    await logSet();
    expect(lastSet(out)).toMatchObject({ weightKg: 65, reps: 5 });
  });

  test('Steppers (wheels off): plus / minus buttons give the same saved values', async () => {
    const out: Session[] = [];
    await mount({ ...allSwitches(true), wheels: false }, out);
    expect(host.querySelector('[role="spinbutton"]')).toBeNull();
    const groups = [...host.querySelectorAll('.sf-stepper')] as HTMLElement[];
    expect(groups.length).toBe(2);
    const plus = (g: HTMLElement) => g.querySelectorAll('button')[1] as HTMLElement;
    const minus = (g: HTMLElement) => g.querySelectorAll('button')[0] as HTMLElement;
    await act(async () => { plus(groups[0]!).click(); });
    await act(async () => { plus(groups[0]!).click(); });
    for (let i = 0; i < 5; i++) await act(async () => { minus(groups[1]!).click(); });
    await logSet();
    expect(lastSet(out)).toMatchObject({ weightKg: 65, reps: 5 });
  });

  test('Classic (everything off): steppers', async () => {
    const out: Session[] = [];
    await mount(allSwitches(false), out);
    expect(host.querySelector('[role="spinbutton"]')).toBeNull();
    expect(host.querySelectorAll('.sf-stepper').length).toBe(2);
  });
});
