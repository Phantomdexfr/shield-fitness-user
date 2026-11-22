// @vitest-environment happy-dom
// Phase 82: the figure follows the profile, "Switch figure" changes only the page's view.
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { figureFromProfile, otherFigure, useFigureSex } from '../../src/ui/body/useFigureSex';
import { getProfile, saveProfile, EMPTY_PROFILE } from '../../src/data/repos/badges';
import { BodyPicker } from '../../src/ui/body';
import { t } from '../../src/i18n';
import type { Sex } from '../../src/ui/body';

describe('figureFromProfile / otherFigure (pure)', () => {
  test('only f draws the female figure; m, unspecified and never-asked draw the male one', () => {
    expect(figureFromProfile('f')).toBe('female');
    expect(figureFromProfile('m')).toBe('male');
    expect(figureFromProfile('unspecified')).toBe('male');
    expect(figureFromProfile(null)).toBe('male');
    expect(figureFromProfile(undefined)).toBe('male');
  });
  test('otherFigure flips', () => {
    expect(otherFigure('male')).toBe('female');
    expect(otherFigure('female')).toBe('male');
  });
});

let root: HTMLElement;
let seen: { sex: Sex; set: (s: Sex) => void } | null = null;
function Probe() {
  const [sex, set] = useFigureSex();
  seen = { sex, set };
  return <span data-sex={sex} />;
}
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  seen = null;
});
afterEach(() => act(() => render(null, root)));

describe('useFigureSex', () => {
  test('starts from the saved profile, and a page switch does not change the profile', async () => {
    await saveProfile({ ...EMPTY_PROFILE, sex: 'f' });
    act(() => render(<Probe />, root));
    await flush();
    expect(seen!.sex).toBe('female');
    act(() => seen!.set('male'));
    expect(seen!.sex).toBe('male');
    expect((await getProfile()).sex).toBe('f');
  });
  test('a male profile (and an unspecified one) draws the male figure', async () => {
    await saveProfile({ ...EMPTY_PROFILE, sex: 'unspecified' });
    act(() => render(<Probe />, root));
    await flush();
    expect(seen!.sex).toBe('male');
  });
});

describe('BodyPicker "Switch figure"', () => {
  test('a link replaces the Male/Female control and asks for the other figure', () => {
    const calls: Sex[] = [];
    act(() => render(<BodyPicker mode="heat" sex="male" view="front" onSexChange={(s) => calls.push(s)} />, root));
    const link = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === t('body.switch'));
    expect(link).toBeTruthy();
    expect(root.textContent).not.toContain(t('body.sex.female'));
    act(() => link!.click());
    expect(calls).toEqual(['female']);
  });
  test('no link when the page gives no handler', () => {
    act(() => render(<BodyPicker mode="heat" sex="male" view="front" />, root));
    expect(root.textContent).not.toContain(t('body.switch'));
  });
});
