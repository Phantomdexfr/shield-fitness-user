// Routine as an image (Phase 61): the layout of a 1080 x 1350 picture (gold on dark). Pure: it returns drawing ops; the page draws them
// on a canvas. Text is measured through a function the caller gives, so long names are wrapped to the real width and nothing bleeds.
// No photos and no personal data: only the routine name, its day names and exercise lines, and a footer.

import type { Routine } from './routine';

export const IMAGE_W = 1080;
export const IMAGE_H = 1350;
const MARGIN = 72;
const FOOTER_H = 70;
const GAP = 40;

export type Tone = 'gold' | 'text' | 'muted';
export interface TextOp {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  bold: boolean;
  tone: Tone;
  align: 'left' | 'center';
}
export interface RuleOp {
  kind: 'rule';
  x: number;
  y: number;
  w: number;
}
export type Op = TextOp | RuleOp;

export interface ImageLabels {
  /** "Shield Fitness" style footer. */
  footer: string;
  /** Under the title, e.g. "4 days a week". */
  days: (n: number) => string;
  /** "+3 more" when a day is cut short to fit. */
  more: (n: number) => string;
  /** A day with no exercises. */
  empty: string;
  /** Fallback when the routine has no name. */
  untitled: string;
}

export interface Layout {
  width: number;
  height: number;
  ops: Op[];
  /** Day lines that were cut short to fit (0 = everything is shown). */
  hidden: number;
}

/** Width in pixels of `text` at `size` px (bold or not). The page passes `ctx.measureText`; tests pass a fake. */
export type Measure = (text: string, size: number, bold: boolean) => number;

/** Breaks `text` into lines no wider than `maxW`. A single word wider than the line is split by characters. Never returns an empty list. */
export function wrapText(text: string, maxW: number, size: number, bold: boolean, measure: Measure): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter((w) => w !== '');
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  const push = (w: string) => {
    let rest = w;
    while (measure(rest, size, bold) > maxW && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && measure(rest.slice(0, n), size, bold) > maxW) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    cur = rest;
  };
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (measure(tryLine, size, bold) <= maxW) cur = tryLine;
    else {
      if (cur) lines.push(cur);
      cur = '';
      push(w);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Block {
  head: string[];
  lines: string[][];
  more: number;
  empty: boolean;
  height: number;
}

const itemText = (name: string, sets: number, a: number, b: number): string => `${name}  ${sets}×${a === b ? a : `${a}-${b}`}`;

/**
 * Lays the routine out. `nameOf` gives an exercise's display name (a missing one shows its slug). It first tries the full list at full
 * size, then smaller text, then fewer lines per day with a "+N more" line, so the result always fits inside the picture.
 */
export function layoutRoutine(routine: Routine, nameOf: (ref: Routine['days'][number]['items'][number]['ref']) => string, labels: ImageLabels, measure: Measure): Layout {
  const ops: Op[] = [];
  const title = routine.name.trim() === '' ? labels.untitled : routine.name;
  const innerW = IMAGE_W - MARGIN * 2;

  // Title: up to 2 lines, shrinking.
  let tSize = 76;
  let tLines = wrapText(title, innerW, tSize, true, measure);
  while (tLines.length > 2 && tSize > 44) {
    tSize -= 4;
    tLines = wrapText(title, innerW, tSize, true, measure);
  }
  // A routine name is at most 40 characters (MAX_NAME), which fits two lines at the smallest size; the slice is only a guard.
  tLines = tLines.slice(0, 2);
  let y = MARGIN;
  for (const line of tLines) {
    ops.push({ kind: 'text', x: MARGIN, y: y + tSize, text: line, size: tSize, bold: true, tone: 'gold', align: 'left' });
    y += Math.round(tSize * 1.15);
  }
  y += 10;
  const sub = labels.days(routine.days.length);
  ops.push({ kind: 'text', x: MARGIN, y: y + 34, text: sub, size: 34, bold: false, tone: 'muted', align: 'left' });
  y += 34 + 24;
  ops.push({ kind: 'rule', x: MARGIN, y, w: innerW });
  y += GAP;

  const top = y;
  const bottom = IMAGE_H - FOOTER_H - 24;
  const cols = routine.days.length <= 3 ? 1 : 2;
  const colW = cols === 1 ? innerW : Math.floor((innerW - GAP) / 2);

  const build = (scale: number, cap: number): { cols: Block[][]; sizes: { h: number; b: number }; ok: boolean } => {
    const h = Math.round(38 * scale);
    const b = Math.round(30 * scale);
    const blocks: Block[] = routine.days.map((d) => {
      const head = wrapText(d.name.trim() === '' ? '-' : d.name, colW, h, true, measure);
      const all = d.items.map((it) => wrapText(itemText(nameOf(it.ref), it.sets, it.repMin, it.repMax), colW - 24, b, false, measure));
      let lines: string[][] = all;
      let more = 0;
      if (all.length > cap) {
        lines = all.slice(0, cap);
        more = all.length - cap;
      }
      const empty = d.items.length === 0;
      const lh = Math.round(b * 1.32);
      const height = head.length * Math.round(h * 1.25) + 8 + (empty ? lh : lines.reduce((n, l) => n + l.length * lh + 6, 0)) + (more > 0 ? lh : 0) + 30;
      return { head, lines, more, empty, height };
    });
    // Fill column by column, left to right, in day order.
    const columns: Block[][] = Array.from({ length: cols }, () => []);
    let c = 0;
    let used = 0;
    let ok = true;
    for (const bl of blocks) {
      if (used + bl.height > bottom - top && columns[c]!.length > 0) {
        if (c < cols - 1) {
          c++;
          used = 0;
        } else ok = false;
      }
      if (used + bl.height > bottom - top) ok = false;
      columns[c]!.push(bl);
      used += bl.height;
    }
    return { cols: columns, sizes: { h, b }, ok };
  };

  const caps = [Infinity, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2];
  let chosen: ReturnType<typeof build> | null = null;
  outer: for (const cap of caps) {
    for (let scale = 1; scale >= 0.55; scale -= 0.05) {
      const tryIt = build(scale, cap);
      if (tryIt.ok) {
        chosen = tryIt;
        break outer;
      }
    }
  }
  chosen ??= build(0.55, 2);

  let hidden = 0;
  chosen.cols.forEach((col, ci) => {
    const x = MARGIN + ci * (colW + GAP);
    let cy = top;
    for (const bl of col) {
      const { h, b } = chosen!.sizes;
      for (const l of bl.head) {
        ops.push({ kind: 'text', x, y: cy + h, text: l, size: h, bold: true, tone: 'gold', align: 'left' });
        cy += Math.round(h * 1.25);
      }
      cy += 8;
      const lh = Math.round(b * 1.32);
      if (bl.empty) {
        ops.push({ kind: 'text', x: x + 24, y: cy + b, text: labels.empty, size: b, bold: false, tone: 'muted', align: 'left' });
        cy += lh;
      }
      for (const group of bl.lines) {
        for (const l of group) {
          ops.push({ kind: 'text', x: x + 24, y: cy + b, text: l, size: b, bold: false, tone: 'text', align: 'left' });
          cy += lh;
        }
        cy += 6;
      }
      if (bl.more > 0) {
        hidden += bl.more;
        ops.push({ kind: 'text', x: x + 24, y: cy + b, text: labels.more(bl.more), size: b, bold: false, tone: 'muted', align: 'left' });
        cy += lh;
      }
      cy += 30;
    }
  });

  ops.push({ kind: 'rule', x: MARGIN, y: IMAGE_H - FOOTER_H - 8, w: innerW });
  ops.push({ kind: 'text', x: IMAGE_W / 2, y: IMAGE_H - MARGIN + 18, text: labels.footer, size: 28, bold: true, tone: 'muted', align: 'center' });
  return { width: IMAGE_W, height: IMAGE_H, ops, hidden };
}

/** Right and bottom edge of every text op, for the fit tests and the self-check. */
export function extents(layout: Layout, measure: Measure): Array<{ right: number; bottom: number; left: number; top: number }> {
  return layout.ops.flatMap((o) => {
    if (o.kind !== 'text') return [];
    const w = measure(o.text, o.size, o.bold);
    const left = o.align === 'center' ? o.x - w / 2 : o.x;
    return [{ left, right: left + w, top: o.y - o.size, bottom: o.y + Math.round(o.size * 0.25) }];
  });
}
