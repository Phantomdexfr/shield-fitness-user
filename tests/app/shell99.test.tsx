// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, describe, expect, test } from 'vitest';
import { CollapsedTitleBar, TabBar } from '../../src/app/Shell';
import { activeRoutes } from '../../src/app/routes';
import { SubPageHeader } from '../../src/ui/components';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches, withSwitch } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => {
  render(null, host);
  document.body.querySelectorAll('.sf-page').forEach((n) => n.remove());
  setScroll(0);
});

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}
async function scrollTo(y: number) {
  setScroll(y);
  await act(async () => { window.dispatchEvent(new Event('scroll')); });
}
const tabbar = (path: string) => (
  <Router hook={memoryLocation({ path }).hook}>
    <TabBar routes={activeRoutes(false)} />
  </Router>
);

describe('tab bar', () => {
  test('premium: one gold indicator, positioned by the active tab; the active tab keeps its filled icon', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(tabbar('/train'), host); });
    const ind = host.querySelector('.sf-tabbar__ind') as HTMLElement;
    expect(ind).not.toBeNull();
    expect(ind.getAttribute('style')?.replace(/\s/g, '')).toContain('--tab-i:2');
    expect(ind.getAttribute('style')?.replace(/\s/g, '')).toContain('--tab-n:5');
    expect(host.querySelectorAll('.sf-tabbar__item')).toHaveLength(5);
    expect(host.querySelector('.sf-tabbar__item.is-active')?.getAttribute('aria-current')).toBe('page');
  });
  test('premium: no indicator on a page that is not a tab', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(tabbar('/nowhere-at-all'), host); });
    expect(host.querySelector('.sf-tabbar__ind')).toBeNull();
  });
  test('classic: the solid bar exactly as before, no indicator', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(tabbar('/train'), host); });
    expect(host.querySelector('.sf-tabbar__ind')).toBeNull();
    expect(host.querySelector('nav.sf-tabbar')).not.toBeNull();
    expect(host.querySelectorAll('.sf-tabbar__item')).toHaveLength(5);
  });
});

describe('sub-page header', () => {
  const header = <SubPageHeader title="Bench press" onBack={() => undefined} backLabel="Back" right={<button type="button">R</button>} />;
  test('premium: sticky bar + one large h1; the small title is CSS-only, so the text exists once', async () => {
    applyUx(withSwitch(DEFAULT_SWITCHES, 'tidy', false));
    await act(async () => { render(header, host); });
    const el = host.querySelector('header') as HTMLElement;
    expect(el.className).toContain('sf-subheader--large');
    expect(el.querySelector('.sf-subheader__bar button[aria-label="Back"]')).not.toBeNull();
    expect(el.querySelector('.sf-subheader__bar .sf-subheader__right')).not.toBeNull();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(host.textContent?.split('Bench press').length).toBe(2);
    expect(el.querySelector('.sf-subheader__small')?.getAttribute('data-title')).toBe('Bench press');
  });
  test('tidy layout: back button, title and action in ONE header row, title once', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(header, host); });
    const el = host.querySelector('header') as HTMLElement;
    expect(el.className).toContain('sf-subheader--tidy');
    expect(el.querySelector(':scope > button[aria-label="Back"]')).not.toBeNull();
    expect(el.querySelectorAll(':scope > h1')).toHaveLength(1);
    expect(host.textContent?.split('Bench press').length).toBe(2);
  });
  test('premium: collapses after scrolling and expands again at the top', async () => {
    applyUx(withSwitch(DEFAULT_SWITCHES, 'tidy', false));
    await act(async () => { render(header, host); });
    const el = host.querySelector('header') as HTMLElement;
    expect(el.className).not.toContain('is-collapsed');
    await scrollTo(120);
    expect(el.className).toContain('is-collapsed');
    await scrollTo(0);
    expect(el.className).not.toContain('is-collapsed');
  });
  test('classic: the old fixed title row, no bar and no collapse', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(header, host); });
    const el = host.querySelector('header') as HTMLElement;
    expect(el.className).toBe('sf-subheader');
    expect(el.querySelector('.sf-subheader__bar')).toBeNull();
    expect(el.querySelector('.sf-subheader__title')?.textContent).toBe('Bench press');
    await scrollTo(200);
    expect(el.className).toBe('sf-subheader');
  });
});

describe('collapsed bar for top-level pages', () => {
  const bar = () => (
    <Router hook={memoryLocation({ path: '/train' }).hook}>
      <CollapsedTitleBar />
    </Router>
  );
  function page(inner: string) {
    const p = document.createElement('div');
    p.className = 'sf-page';
    p.innerHTML = inner;
    document.body.appendChild(p);
  }
  test('premium: shows the page h1 once scrolled, hidden at the top', async () => {
    applyUx(DEFAULT_SWITCHES);
    page('<h1 class="sf-page-title">Train</h1>');
    await act(async () => { render(bar(), host); });
    const el = host.querySelector('.sf-collapsebar') as HTMLElement;
    expect(el.className).not.toContain('is-on');
    await scrollTo(150);
    expect(el.className).toContain('is-on');
    expect(el.getAttribute('data-title')).toBe('Train');
  });
  test('premium: stays off where a SubPageHeader owns the bar', async () => {
    applyUx(DEFAULT_SWITCHES);
    page('<header class="sf-subheader"><h1 class="sf-subheader__title">Records</h1></header>');
    await act(async () => { render(bar(), host); });
    await scrollTo(150);
    expect((host.querySelector('.sf-collapsebar') as HTMLElement).className).not.toContain('is-on');
  });
  test('classic: renders nothing', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(bar(), host); });
    expect(host.querySelector('.sf-collapsebar')).toBeNull();
  });
});

describe('CSS: solid fallback exists, frost only inside @supports, no layout change on collapse', () => {
  const css = (f: string) => readFileSync(join(process.cwd(), 'src/ui/styles/premium', f), 'utf8');
  test('shell.css: a solid background first, then backdrop-filter only inside @supports', () => {
    const s = css('shell.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const solid = s.indexOf('background: var(--bg-raised)');
    const sup = s.indexOf('@supports');
    expect(solid).toBeGreaterThan(-1);
    expect(sup).toBeGreaterThan(solid);
    expect(s.slice(0, sup)).not.toContain('backdrop-filter');
    expect(s.slice(sup)).toContain('backdrop-filter');
  });
  test('headers.css: same rule; collapse only changes opacity / visibility', () => {
    const h = css('headers.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const sup = h.indexOf('@supports');
    expect(sup).toBeGreaterThan(-1);
    expect(h.slice(0, sup)).not.toContain('backdrop-filter');
    expect(h.slice(sup)).toContain('backdrop-filter');
    const collapsedRules = [...h.matchAll(/\.is-collapsed[^{]*\{([^}]*)\}/g), ...h.matchAll(/\.sf-collapsebar\.is-on\s*\{([^}]*)\}/g)].map((m) => m[1] as string);
    expect(collapsedRules.length).toBeGreaterThan(0);
    for (const body of collapsedRules) expect(body).not.toMatch(/height|padding|margin|font-size|display|position/);
  });
  test('motion: slide and spring sit behind prefers-reduced-motion and the Motion setting', () => {
    for (const f of ['shell.css', 'headers.css']) {
      const s = css(f);
      expect(s).toContain('prefers-reduced-motion: no-preference');
      expect(s).toContain("[data-motion='reduced']");
    }
  });
});
