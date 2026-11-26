// @vitest-environment happy-dom
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resetPlayed } from '../../src/ui/components/motion';
import { AreaChart, BarChart, LineChart, Sparkline, type Series } from '../../src/ui/charts';

let root: HTMLElement;
beforeEach(() => {
  resetPlayed(); // Phase 104: first-reveal motion is once per view; each test is its own view
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  act(() => render(null, root));
  vi.unstubAllGlobals();
});
const mount = (v: ComponentChild) => {
  act(() => render(v, root));
  return root;
};
const noBad = () => {
  const html = root.innerHTML;
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
};

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const line = (ys: (number | null)[], name = 'A', extra: Partial<Series> = {}): Series => ({ id: name, name, points: ys.map((y, i) => ({ x: day(i), y })), ...extra });

describe('LineChart and AreaChart: no NaN, role, summary', () => {
  const cases: [string, Series[]][] = [
    ['empty', [line([])]],
    ['no series', []],
    ['one point', [line([80])]],
    ['flat', [line([80, 80, 80])]],
    ['all null', [line([null, null, null])]],
    ['gaps', [line([80, null, 82, 83, null, 85])]],
    ['500 points', [line(Array.from({ length: 500 }, (_, i) => 50 + Math.sin(i / 9) * 10))]],
    ['zero values', [line([0, 0, 0, 0])]],
    ['overflow values', [line([1e9, 2e9, 3.5e9])]],
    ['bad numbers', [line([NaN, Infinity, 5, -Infinity, 6])]],
    ['negative', [line([-5, -3, -8])]],
    ['numeric x', [{ id: 'n', name: 'Sets', points: [1, 2, 3, 4].map((x, i) => ({ x, y: i * 2 })) }]],
  ];
  for (const [name, series] of cases) {
    test(`line: ${name}`, () => {
      mount(<LineChart title="T" series={series} />);
      noBad();
      expect(root.querySelector('figure')).not.toBeNull();
      expect(root.querySelector('.sf-sr-only')?.textContent ?? '').toContain('T.');
    });
    test(`area: ${name}`, () => {
      mount(<AreaChart title="T" series={[series[0] ?? line([])]} />);
      noBad();
    });
  }

  test('a real chart has role=img, a summary, and the empty one shows the empty text', () => {
    mount(<LineChart title="Weight" series={[line([80, 81, 79])]} unit="kg" />);
    const svg = root.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    const desc = root.querySelector(`#${svg!.getAttribute('aria-describedby')}`);
    expect(desc?.textContent).toContain('Weight. 3 points');
    mount(<LineChart title="Weight" series={[line([])]} />);
    expect(root.textContent).toContain('No data yet');
    expect(root.querySelector('svg[role="img"]')).toBeNull();
  });
  test('legend only for 2+ series, with dashes told apart', () => {
    mount(<LineChart title="T" series={[line([1, 2, 3], 'One')]} />);
    expect(root.querySelector('.sf-ch-legend')).toBeNull();
    mount(<LineChart title="T" series={[line([1, 2, 3], 'One'), line([3, 2, 1], 'Two')]} />);
    expect(root.querySelector('.sf-ch-legend')?.textContent).toContain('Two');
    expect(root.querySelector('.sf-ch-dash-dashed')).not.toBeNull();
  });
  test('500 points are drawn as at most 400', () => {
    mount(<LineChart title="T" series={[line(Array.from({ length: 500 }, (_, i) => 50 + Math.sin(i / 9) * 10))]} />);
    const d = root.querySelector('.sf-ch-line')!.getAttribute('d')!;
    expect(d.split(' L').length).toBeLessThanOrEqual(400);
    expect(root.querySelector('.sf-sr-only')?.textContent).toContain('Showing every');
  });
  test('a gap splits the line into two paths', () => {
    mount(<LineChart title="T" series={[line([80, 81, null, 83, 84])]} />);
    expect(root.querySelectorAll('.sf-ch-line').length).toBe(2);
  });
  test('target line is drawn and kept inside the domain', () => {
    mount(<LineChart title="T" series={[line([80, 81, 82])]} target={95} />);
    expect(root.querySelector('.sf-ch-target')).not.toBeNull();
    expect(root.textContent).toContain('Target 95');
  });
  test('keyboard scrub: arrows move the readout, Escape hides it', () => {
    mount(<LineChart title="T" series={[line([80, 81, 82])]} unit="kg" />);
    const plot = root.querySelector('.sf-ch-plot') as HTMLElement;
    expect(root.querySelector('.sf-ch-readout')).toBeNull();
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('82');
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('81');
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('Fri 2 Jan 2026');
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')).toBeNull();
  });
  test('scrub tick: vibrate called once per snapped point, not for the same point twice', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    mount(<LineChart title="T" series={[line([80, 81, 82])]} />);
    const plot = root.querySelector('.sf-ch-plot') as HTMLElement;
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
  test('loading shows a skeleton and no svg', () => {
    mount(<LineChart title="T" series={[line([1, 2])]} loading />);
    expect(root.querySelector('.sf-skeleton')).not.toBeNull();
    expect(root.querySelector('svg[role="img"]')).toBeNull();
  });
  test('reduced motion renders the final state (no animation classes)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    mount(<LineChart title="T" series={[line([1, 2, 3])]} />);
    expect(root.querySelector('.sf-ch-still')).not.toBeNull();
  });
});

describe('BarChart', () => {
  const bars = (ys: number[]) => ys.map((y, i) => ({ x: `W${i + 1}`, y }));
  const cases: [string, number[]][] = [
    ['empty', []],
    ['one', [5]],
    ['flat', [4, 4, 4]],
    ['zeros', [0, 0, 0]],
    ['negative', [-5, 3, -1]],
    ['overflow', [1e12, 5e11]],
    ['bad', [NaN, 5, Infinity]],
    ['52 bars', Array.from({ length: 52 }, (_, i) => i * 100)],
    ['70 bars (cut to 52)', Array.from({ length: 70 }, (_, i) => i)],
  ];
  for (const [name, ys] of cases)
    test(`bar: ${name} has no NaN`, () => {
      mount(<BarChart title="Volume" data={bars(ys)} />);
      noBad();
    });
  test('target: hit bars get the hit class, summary names the count, value labels for <= 7 bars', () => {
    mount(<BarChart title="Volume" data={bars([10, 30, 20])} target={20} />);
    expect(root.querySelectorAll('.sf-ch-bar-hit').length).toBe(1);
    expect(root.querySelector('.sf-sr-only')?.textContent).toContain('2 of 3 reached the target of 20');
    expect(root.querySelectorAll('.sf-ch-bar-value').length).toBe(3);
  });
  test('the latest bar is lit and bars grow in order (stagger capped at 8)', () => {
    mount(<BarChart title="V" data={bars(Array.from({ length: 12 }, (_, i) => i + 1))} />);
    const all = [...root.querySelectorAll('.sf-ch-bar')] as SVGElement[];
    expect(all[all.length - 1]!.getAttribute('class')).toContain('sf-ch-bar-lit');
    expect(all[11]!.style.animationDelay).toBe('280ms');
    expect(root.querySelectorAll('.sf-ch-bar-value').length).toBe(0);
  });
  test('keyboard scrub shows the bar value', () => {
    mount(<BarChart title="V" data={bars([5, 7, 9])} unit="kg" />);
    const plot = root.querySelector('.sf-ch-plot') as HTMLElement;
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('W1');
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('5');
  });
  test('empty data -> empty state text, loading -> skeleton', () => {
    mount(<BarChart title="V" data={[]} emptyText="Log a workout" />);
    expect(root.textContent).toContain('Log a workout');
    mount(<BarChart title="V" data={bars([1])} loading />);
    expect(root.querySelector('.sf-skeleton')).not.toBeNull();
  });
});

describe('Sparkline', () => {
  for (const [name, v] of [['empty', []], ['one', [3]], ['flat', [2, 2, 2]], ['bad', [NaN, 1, Infinity, 3]], ['500', Array.from({ length: 500 }, (_, i) => i % 17)]] as [string, number[]][])
    test(`spark: ${name} has no NaN, is hidden from assistive tech`, () => {
      mount(<Sparkline values={v} fill />);
      noBad();
      expect(root.querySelector('.sf-ch-spark')?.getAttribute('aria-hidden')).toBe('true');
    });
  test('500 values draw at most 60 points', () => {
    mount(<Sparkline values={Array.from({ length: 500 }, (_, i) => i % 17)} />);
    expect(root.querySelector('.sf-ch-spark-line')!.getAttribute('d')!.split(' L').length).toBeLessThanOrEqual(60);
  });
});

// ---- Phase 52: ring, gauge, heat grid, stat tile, stacked bar ----
import { Gauge, HeatGrid, Ring, StackedBar, StatTile } from '../../src/ui/charts';

const srText = () => root.querySelector('.sf-sr-only')?.textContent ?? '';

describe('Ring', () => {
  const cases: [string, number, number | undefined][] = [
    ['normal', 2, 3], ['zero', 0, 100], ['over 100 %', 120, 100], ['huge', 1e12, 1], ['negative', -5, 10], ['NaN value', NaN, 10],
    ['Infinity', Infinity, 10], ['max 0', 5, 0], ['max NaN', 5, NaN], ['max negative', 5, -3], ['default max', 0.4, undefined],
  ];
  for (const [name, v, m] of cases) {
    test(`ring: ${name}: no NaN, role=img, summary`, () => {
      mount(<Ring title="T" value={v} max={m} />);
      noBad();
      expect(root.querySelector('svg[role="img"]')).not.toBeNull();
      expect(srText()).toContain('T.');
    });
  }
  test('over 100 % keeps a full arc, shows the true number and the lap ring', () => {
    mount(<Ring title="Protein" value={120} max={100} />);
    expect(root.querySelector('.sf-ch-ringnum')?.textContent).toBe('120 %');
    expect(root.querySelector('.sf-ch-arc-full')).not.toBeNull();
    expect(root.querySelector('.sf-ch-lap')).not.toBeNull();
    expect(srText()).toBe('Protein. 120 of 100 (120 %).');
  });
  test('zero is only the track; max <= 0 shows a dash and the empty summary', () => {
    mount(<Ring title="T" value={0} max={100} />);
    expect(root.querySelector('.sf-ch-arc')).toBeNull();
    expect(root.querySelector('.sf-ch-track')).not.toBeNull();
    mount(<Ring title="T" value={4} max={0} />);
    expect(root.querySelector('.sf-ch-ringnum')?.textContent).toBe('–');
    expect(srText()).toBe('T. No data yet.');
  });
  test('secondary ring and a centre slot; no lap under 100 %', () => {
    mount(<Ring title="Week" value={2} max={3} secondary={{ value: 1, max: 3, name: 'Last week' }} centre={<b class="mine">2 / 3</b>} size={96} />);
    expect(root.querySelector('.sf-ch-arc2')).not.toBeNull();
    expect(root.querySelector('.mine')?.textContent).toBe('2 / 3');
    expect(root.querySelector('.sf-ch-lap')).toBeNull();
    expect(srText()).toContain('Last week');
  });
  test('reduced motion renders the final state (no sweep class)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    mount(<Ring title="T" value={1} max={2} />);
    expect(root.querySelector('.sf-ch-sweep')).toBeNull();
    expect(root.querySelector('.sf-ch-still')).not.toBeNull();
  });
});

describe('Gauge', () => {
  const cases: [string, number, number, number, number[]?][] = [
    ['normal', 50, 0, 100], ['zero', 0, 0, 100], ['over', 150, 0, 100], ['below', -10, 0, 100], ['min = max', 5, 5, 5], ['min > max', 5, 10, 0],
    ['NaN', NaN, 0, 100], ['huge', 1e12, 0, 1e13], ['marks', 40, 0, 100, [25, 50, 75, NaN, 400]],
  ];
  for (const [name, v, lo, hi, marks] of cases) {
    test(`gauge: ${name}: no NaN, role=img`, () => {
      mount(<Gauge title="T" value={v} min={lo} max={hi} marks={marks} />);
      noBad();
      expect(root.querySelector('svg[role="img"]')).not.toBeNull();
    });
  }
  test('marks are listed in the legend, min and max sit under the ends, the centre shows the true value', () => {
    mount(<Gauge title="Tier" value={140} min={0} max={100} marks={[60]} />);
    expect(root.querySelector('.sf-ch-legend')?.textContent).toContain('60');
    expect(root.querySelectorAll('.sf-ch-mark').length).toBe(1);
    expect(root.querySelector('.sf-ch-gaugenum')?.textContent).toBe('140');
    expect(srText()).toBe('Tier. 140 of 100 (140 %).');
  });
  test('min >= max is the empty gauge', () => {
    mount(<Gauge title="T" value={1} min={3} max={3} />);
    expect(root.querySelector('.sf-ch-arc')).toBeNull();
    expect(srText()).toBe('T. No data yet.');
  });
});

describe('HeatGrid', () => {
  const days = (n: number, v: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ day: new Date(Date.UTC(2026, 7, 24 + i)).toISOString().slice(0, 10), value: v(i) }));
  test('12 weeks: cells drawn, bands as classes, today outlined, summary lists active days', () => {
    mount(<HeatGrid title="Consistency" cells={days(84, (i) => (i % 3 === 0 ? 2 : i % 2))} from="2026-08-24" to="2026-11-15" />);
    noBad();
    expect(root.querySelectorAll('.sf-ch-heat').length).toBe(84);
    expect(root.querySelectorAll('.sf-ch-heat-5').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.sf-ch-today').length).toBe(1);
    expect(srText()).toMatch(/^Consistency\. \d+ active days in 12 weeks\. Longest run \d+ days\./);
  });
  const bad: [string, any, string, string][] = [
    ['empty cells', [], '2026-08-24', '2026-11-15'],
    ['from after to', [], '2026-11-15', '2026-08-24'],
    ['bad keys', [{ day: 'x', value: 1 }], 'x', 'y'],
    ['NaN and negative values', [{ day: '2026-11-02', value: NaN }, { day: '2026-11-03', value: -1 }, { day: '2026-11-04', value: Infinity }], '2026-11-02', '2026-11-08'],
    ['all zero', days(14, () => 0), '2026-08-24', '2026-09-06'],
    ['huge', days(14, () => 1e15), '2026-08-24', '2026-09-06'],
    ['60 weeks', [], '2025-09-01', '2026-11-20'],
  ];
  for (const [name, cells, from, to] of bad) {
    test(`heat: ${name}: no NaN`, () => {
      mount(<HeatGrid title="T" cells={cells} from={from} to={to} />);
      noBad();
    });
  }
  test('empty shows the empty text; 60 weeks is clamped to 53 columns and scrolls inside its own box', () => {
    mount(<HeatGrid title="T" cells={[]} from="2026-08-24" to="2026-11-15" />);
    expect(root.textContent).toContain('No data yet');
    mount(<HeatGrid title="T" cells={days(10, () => 1)} from="2025-09-01" to="2026-11-20" />);
    expect(root.querySelector('.sf-ch-heatscroll')).not.toBeNull();
    expect(srText()).toContain('in 53 weeks');
  });
  test('keyboard: Left from nothing lands on the last day; the readout names the IST day', () => {
    mount(<HeatGrid title="T" cells={days(7, () => 2)} from="2026-08-24" to="2026-08-30" format={(v) => `${v} sessions`} />);
    const plot = root.querySelector('.sf-ch-plot') as HTMLElement;
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('Sun 30 Aug 2026');
    expect(root.querySelector('.sf-ch-readout')?.textContent).toContain('2 sessions');
    act(() => void plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(root.querySelector('.sf-ch-readout')).toBeNull();
  });
  test('volume mode uses quintile bands (five non-zero days -> bands 1 to 5)', () => {
    mount(<HeatGrid title="T" mode="volume" cells={[1, 2, 3, 4, 5].map((v, i) => ({ day: `2026-11-0${i + 2}`, value: v * 1000 }))} from="2026-11-02" to="2026-11-08" />);
    for (const b of [1, 2, 3, 4, 5]) expect(root.querySelectorAll(`.sf-ch-heat-${b}`).length).toBe(1);
  });
});

describe('StatTile', () => {
  test('final text is exact, summary sr-only, no NaN (reduced motion = no count-up)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    mount(<StatTile label="Volume" value={128450} unit="kg" delta={{ value: 4, goodWhen: 'up', label: 'vs last week' }} spark={[1, 2, 3]} />);
    noBad();
    expect(root.querySelector('.sf-ch-stat-num')?.textContent).toBe('1,28,450');
    expect(root.querySelector('.sf-ch-stat-good')).not.toBeNull();
    expect(root.querySelector('.sf-ch-arrow-up')).not.toBeNull();
    expect(srText()).toBe('Volume: 1,28,450 kg. +4 % vs last week.');
  });
  test('a bad delta is not good: down when up is wanted stays muted, never an error colour', () => {
    mount(<StatTile label="Sessions" value={3} countUp={false} delta={{ value: -2, goodWhen: 'up' }} />);
    expect(root.querySelector('.sf-ch-stat-delta')).not.toBeNull();
    expect(root.querySelector('.sf-ch-stat-good')).toBeNull();
    expect(root.querySelector('.sf-ch-arrow-down')).not.toBeNull();
  });
  const odd: [string, any][] = [['NaN', NaN], ['Infinity', Infinity], ['zero', 0], ['negative', -4], ['huge', 1e21], ['text', '3 wk'], ['decimal', 81.25]];
  for (const [name, v] of odd) {
    test(`stat: ${name}: no NaN`, () => {
      mount(<StatTile label="L" value={v} delta={{ value: NaN, goodWhen: 'any' }} spark={[NaN, 1, Infinity]} />);
      noBad();
    });
  }
  test('count-up starts at 0 and ends on the exact format(value)', async () => {
    vi.useFakeTimers();
    let t0 = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => setTimeout(() => cb((t0 += 100)), 100) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    mount(<StatTile label="L" value={81.25} />);
    expect(root.querySelector('.sf-ch-stat-num')?.textContent).toBe('0');
    await act(async () => void vi.advanceTimersByTime(2000));
    expect(root.querySelector('.sf-ch-stat-num')?.textContent).toBe('81.3');
    vi.useRealTimers();
  });
  test('a string value is never counted up; href makes a link, not an expander', () => {
    mount(<StatTile label="Streak" value="3 wk" href="/progress" />);
    expect(root.querySelector('a.sf-ch-stat')?.getAttribute('href')).toBe('/progress');
    expect(root.querySelector('.sf-ch-stat-num')?.textContent).toBe('3 wk');
  });
});

describe('StackedBar', () => {
  const rows = [
    { label: 'Upper', parts: [{ id: 'push', name: 'Push', value: 62 }, { id: 'pull', name: 'Pull', value: 38 }] },
    { label: 'Lower', parts: [{ id: 'push', name: 'Push', value: 0 }, { id: 'pull', name: 'Pull', value: 0 }] },
  ];
  test('percent: two segments, zero row is an empty track, legend and summary carry the numbers', () => {
    mount(<StackedBar title="Balance" mode="percent" rows={rows} />);
    noBad();
    expect(root.querySelectorAll('.sf-ch-seg').length).toBe(2);
    expect(root.querySelectorAll('.sf-ch-track-h').length).toBe(2);
    expect(root.querySelector('.sf-ch-legend')?.textContent).toContain('Pull');
    expect(srText()).toBe('Balance. Upper: Push 62 (62 %), Pull 38 (38 %). Lower: no data.');
  });
  const odd: [string, any][] = [
    ['no rows', []], ['empty parts', [{ label: 'A', parts: [] }]], ['all zero', [{ label: 'A', parts: [{ id: 'a', name: 'A', value: 0 }] }]],
    ['NaN and negative', [{ label: 'A', parts: [{ id: 'a', name: 'A', value: NaN }, { id: 'b', name: 'B', value: -3 }, { id: 'c', name: 'C', value: 2 }] }]],
    ['huge', [{ label: 'A', parts: [{ id: 'a', name: 'A', value: 1e308 }, { id: 'b', name: 'B', value: 1e308 }] }]],
    ['8 parts', [{ label: 'A', parts: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, value: 1 })) }]],
  ];
  for (const [name, r] of odd) {
    for (const mode of ['absolute', 'percent'] as const) {
      test(`stack ${mode}: ${name}: no NaN`, () => {
        mount(<StackedBar title="T" rows={r} mode={mode} />);
        noBad();
      });
    }
  }
  test('no rows shows the empty text; at most 6 segments are drawn', () => {
    mount(<StackedBar title="T" rows={[]} />);
    expect(root.textContent).toContain('No data yet');
    mount(<StackedBar title="T" rows={odd[5]![1]} />);
    expect(root.querySelectorAll('.sf-ch-seg').length).toBe(6);
  });
  test('vertical orientation and a tap on a segment shows the readout line', () => {
    mount(<StackedBar title="T" orientation="vertical" rows={[{ label: 'Mon', parts: [{ id: 'a', name: 'Chest', value: 8 }, { id: 'b', name: 'Back', value: 2 }] }]} />);
    expect(root.querySelector('.sf-ch-stack-v')).not.toBeNull();
    const b = root.querySelector('.sf-ch-seg') as HTMLElement;
    expect(b.tagName).toBe('BUTTON');
    act(() => void b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(root.querySelector('.sf-ch-stack-info')?.textContent).toBe('Mon: Chest 8 (80 %)');
    act(() => void b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(root.querySelector('.sf-ch-stack-info')).toBeNull();
  });
  test('a single row lists values in the legend; more than 8 rows fall back to horizontal', () => {
    mount(<StackedBar title="T" mode="percent" rows={[{ label: 'A', parts: [{ id: 'a', name: 'Push', value: 1 }, { id: 'b', name: 'Pull', value: 1 }] }]} />);
    expect(root.querySelector('.sf-ch-legend')?.textContent).toContain('Push 50 %');
    mount(<StackedBar title="T" orientation="vertical" rows={Array.from({ length: 9 }, (_, i) => ({ label: `R${i}`, parts: [{ id: 'a', name: 'A', value: 1 }] }))} />);
    expect(root.querySelector('.sf-ch-stack-v')).toBeNull();
  });
});
