// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { Card, HeroCard, Row, RowGroup } from '../../src/ui/components';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => render(null, host));

describe('HeroCard', () => {
  test('premium: its own gold hero surface, no classic gold card class', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(<HeroCard class="x">hi</HeroCard>, host); });
    const el = host.firstElementChild as HTMLElement;
    expect(el.className).toContain('sf-hero');
    expect(el.className).toContain('sf-hero--padded');
    expect(el.className).not.toContain('sf-card--gold');
    expect(el.textContent).toBe('hi');
  });
  test('classic: exactly the existing gold Card', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(<HeroCard>hi</HeroCard>, host); });
    const el = host.firstElementChild as HTMLElement;
    expect(el.className).toContain('sf-card--gold');
    expect(el.className).not.toContain('sf-hero');
  });
  test('follows a live style change without remounting the page', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(<HeroCard>hi</HeroCard>, host); });
    expect((host.firstElementChild as HTMLElement).className).toContain('sf-hero');
    const { setUxMaster } = await import('../../src/data/repos/ux');
    await act(async () => { await setUxMaster('classic'); });
    expect((host.firstElementChild as HTMLElement).className).toContain('sf-card--gold');
    await act(async () => { await setUxMaster('premium'); });
  });
});

describe('RowGroup and Card (same markup in both styles)', () => {
  test('RowGroup keeps one box with its rows; the style is CSS only', async () => {
    for (const sw of [DEFAULT_SWITCHES, allSwitches(false)]) {
      applyUx(sw);
      await act(async () => { render(<RowGroup label="L"><Row label="A" /><Row label="B" /></RowGroup>, host); });
      const box = host.querySelector('.sf-rowgroup__box') as HTMLElement;
      expect(box.querySelectorAll(':scope > .sf-row')).toHaveLength(2);
      expect(host.querySelector('.sf-rowgroup__label')?.textContent).toBe('L');
    }
  });
  test('Card elevation adds a class only when asked; classic classes stay', async () => {
    await act(async () => { render(<Card tone="gold" elevation={3}>x</Card>, host); });
    const c = host.firstElementChild as HTMLElement;
    expect(c.className).toContain('sf-card');
    expect(c.className).toContain('sf-card--gold');
    expect(c.className).toContain('sf-card--e3');
    await act(async () => { render(<Card>x</Card>, host); });
    expect((host.firstElementChild as HTMLElement).className).not.toContain('--e');
  });
});
