// Phase 61 verify: routine image is made with no network, canvas size is 1080 x 1350, long names wrap and nothing bleeds.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMAGE_H, IMAGE_W, extents, layoutRoutine, wrapText, type ImageLabels, type Measure } from '../../src/shared/routineImage';
import { drawRoutineImage, imageFileName, shareOrDownload, type CanvasLike, type Ctx2d, type Palette } from '../../src/pages/routines/routineImageCanvas';
import type { Routine, RoutineItem } from '../../src/shared/routine';

const measure: Measure = (text, size, bold) => text.length * size * (bold ? 0.55 : 0.5);
const labels: ImageLabels = { footer: 'Shield Fitness', days: (n) => `${n} days`, more: (n) => `+${n} more`, empty: 'No exercises yet', untitled: 'My routine' };
const item = (slug: string, sets = 3, a = 8, b = 12): RoutineItem => ({ ref: { kind: 'lib', slug }, sets, repMin: a, repMax: b, restSec: 90 });
const routine = (name: string, days: Array<{ name: string; items: RoutineItem[] }>): Routine => ({
  id: 'r1', name, source: 'mine', daysPerWeek: days.length, weekdays: [], splitStyle: 'custom', active: true,
  days: days.map((d, i) => ({ id: `d${i}`, name: d.name, targetMuscles: [], items: d.items })),
});
const nameOf = (r: RoutineItem['ref']) => (r.kind === 'lib' ? r.slug.replace(/-/g, ' ') : 'custom');
const MARGIN = 72;

const fits = (l: ReturnType<typeof layoutRoutine>) => {
  for (const e of extents(l, measure)) {
    expect(e.left).toBeGreaterThanOrEqual(MARGIN - 0.5);
    expect(e.right).toBeLessThanOrEqual(IMAGE_W - MARGIN + 0.5);
    expect(e.top).toBeGreaterThanOrEqual(0);
    expect(e.bottom).toBeLessThanOrEqual(IMAGE_H - MARGIN + 30);
  }
};

describe('wrapText', () => {
  it('wraps at the width and splits a single very long word', () => {
    const lines = wrapText('Incline dumbbell bench press with a very long name', 300, 30, false, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l, 30, false)).toBeLessThanOrEqual(300);
    const w = wrapText('Supercalifragilisticexpialidocious', 200, 30, false, measure);
    expect(w.length).toBeGreaterThan(1);
    for (const l of w) expect(measure(l, 30, false)).toBeLessThanOrEqual(200);
    expect(w.join('')).toBe('Supercalifragilisticexpialidocious');
    expect(wrapText('   ', 200, 30, false, measure)).toEqual(['']);
  });
});

describe('layoutRoutine', () => {
  it('canvas size is 1080 x 1350', () => {
    const l = layoutRoutine(routine('Push', [{ name: 'Day A', items: [item('bench-press')] }]), nameOf, labels, measure);
    expect([l.width, l.height]).toEqual([1080, 1350]);
    expect([IMAGE_W, IMAGE_H]).toEqual([1080, 1350]);
  });
  it('a small routine shows everything and fits', () => {
    const l = layoutRoutine(routine('Push Pull Legs', [{ name: 'Push', items: [item('bench-press'), item('overhead-press', 4, 6, 6)] }, { name: 'Pull', items: [item('row')] }, { name: 'Legs', items: [] }]), nameOf, labels, measure);
    expect(l.hidden).toBe(0);
    fits(l);
    const texts = l.ops.filter((o) => o.kind === 'text').map((o) => (o as { text: string }).text);
    expect(texts).toContain('bench press 3×8-12');
    expect(texts).toContain('overhead press 4×6');
    expect(texts).toContain('No exercises yet');
    expect(texts).toContain('3 days');
    expect(texts).toContain('Shield Fitness');
  });
  it('long names wrap and nothing bleeds', () => {
    const long = 'Single arm incline dumbbell chest supported rear delt raise with a pause';
    const l = layoutRoutine(routine('An extremely long routine name that goes on and on', [{ name: 'Day with a really long name for testing wrap', items: [item(long.replace(/ /g, '-')), item('x'.repeat(80))] }, { name: 'B', items: [item('curl')] }]), nameOf, labels, measure);
    fits(l);
    expect(l.ops.filter((o) => o.kind === 'text' && (o as { text: string }).text.includes('chest')).length).toBeGreaterThan(0);
  });
  it('a huge routine (7 days x 20 exercises) is cut to fit with "+N more", never off the picture', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ name: `Day ${i + 1}`, items: Array.from({ length: 20 }, (_, j) => item(`exercise-number-${i}-${j}`)) }));
    const l = layoutRoutine(routine('Big', days), nameOf, labels, measure);
    fits(l);
    expect(l.hidden).toBeGreaterThan(0);
    expect(l.ops.some((o) => o.kind === 'text' && /^\+\d+ more$/.test(o.text))).toBe(true);
  });
  it('an empty name uses the fallback; the title is at most 2 lines', () => {
    const l = layoutRoutine(routine('  ', [{ name: 'A', items: [] }]), nameOf, labels, measure);
    expect(l.ops.some((o) => o.kind === 'text' && o.text === 'My routine')).toBe(true);
    const long = layoutRoutine(routine('W'.repeat(40), [{ name: 'A', items: [] }]), nameOf, labels, measure);
    fits(long);
    expect(long.ops.filter((o) => o.kind === 'text' && o.bold && o.tone === 'gold' && o.size > 40).length).toBeLessThanOrEqual(2);
  });
  it('only routine text goes in: no photos, no personal data', () => {
    const l = layoutRoutine(routine('Mine', [{ name: 'A', items: [item('squat')] }]), nameOf, labels, measure);
    expect(l.ops.every((o) => o.kind === 'rule' || ['Mine', 'A', 'squat 3×8-12', '1 days', 'Shield Fitness'].includes(o.text))).toBe(true);
  });
});

const palette: Palette = { bg: 'BG', gold: 'GOLD', text: 'TEXT', muted: 'MUTED', rule: 'RULE', fontDisplay: 'D', fontUi: 'U' };
function fakeCanvas() {
  const calls: string[] = [];
  const ctx: Ctx2d = {
    fillStyle: '', strokeStyle: '', font: '', textAlign: 'left', lineWidth: 1,
    fillRect: (x, y, w, h) => { calls.push(`rect ${x} ${y} ${w} ${h} ${ctx.fillStyle}`); },
    fillText: (t, x) => { calls.push(`text ${t} ${x} ${ctx.fillStyle}`); },
    measureText: (t) => ({ width: measure(t, Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 30), ctx.font.startsWith('700')) }),
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const canvas: CanvasLike = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, calls };
}

describe('drawRoutineImage', () => {
  it('sets 1080 x 1350, paints the background, draws gold titles, with no network involved', () => {
    const { canvas, calls } = fakeCanvas();
    const l = drawRoutineImage(canvas, routine('Push', [{ name: 'Day A', items: [item('bench-press')] }]), nameOf, labels, palette);
    expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
    expect(l).not.toBeNull();
    expect(calls[0]).toBe('rect 0 0 1080 1350 BG');
    expect(calls.some((c) => c.startsWith('text Push ') && c.endsWith(' GOLD'))).toBe(true);
  });
  it('a canvas with no 2D context returns null instead of throwing', () => {
    expect(drawRoutineImage({ width: 0, height: 0, getContext: () => null }, routine('x', []), nameOf, labels, palette)).toBeNull();
  });
  it('the image code has no network call, no image load, no URL and no colour literal', () => {
    for (const f of ['src/shared/routineImage.ts', 'src/pages/routines/routineImageCanvas.ts', 'src/pages/routines/RoutineImageSheet.tsx']) {
      const src = readFileSync(join(__dirname, '..', '..', f), 'utf8').replace(/\/\/[^\n]*/g, '');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new Image\b|https?:\/\//);
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('shareOrDownload', () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  it('uses the share sheet when files can be shared', async () => {
    const got: string[] = [];
    const r = await shareOrDownload(blob, 'a.png', 'A', { canShareFiles: () => true, share: async (d) => { got.push(d.files[0]!.name); }, download: () => got.push('dl') });
    expect(r).toBe('shared');
    expect(got).toEqual(['a.png']);
  });
  it('falls back to a download when the browser cannot share files', async () => {
    const got: string[] = [];
    expect(await shareOrDownload(blob, 'a.png', 'A', { canShareFiles: () => false, share: async () => undefined, download: (_b, n) => got.push(n) })).toBe('downloaded');
    expect(await shareOrDownload(blob, 'b.png', 'A', { download: (_b, n) => got.push(n) })).toBe('downloaded');
    expect(got).toEqual(['a.png', 'b.png']);
  });
  it('closing the share sheet is not an error and does not download; a real failure downloads', async () => {
    const got: string[] = [];
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(await shareOrDownload(blob, 'a.png', 'A', { canShareFiles: () => true, share: async () => { throw abort; }, download: () => got.push('dl') })).toBe('cancelled');
    expect(got).toEqual([]);
    expect(await shareOrDownload(blob, 'a.png', 'A', { canShareFiles: () => true, share: async () => { throw new Error('boom'); }, download: () => got.push('dl') })).toBe('downloaded');
    expect(got).toEqual(['dl']);
  });
  it('file names are safe', () => {
    expect(imageFileName('Push / Pull: Legs!')).toBe('push-pull-legs.png');
    expect(imageFileName('***')).toBe('routine.png');
  });
});
