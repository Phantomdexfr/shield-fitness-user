// Routine image (Phase 61): draws the pure layout on a canvas and hands it to the share sheet or a download. Runs only on the phone:
// no network, no photos. The canvas, the palette and the share/download environment are injectable so tests need no browser.

import { IMAGE_H, IMAGE_W, layoutRoutine, type ImageLabels, type Layout, type Measure } from '../../shared/routineImage';
import type { Routine } from '../../shared/routine';

export interface Palette {
  bg: string;
  gold: string;
  text: string;
  muted: string;
  rule: string;
  fontDisplay: string;
  fontUi: string;
}

/** The minimum of the 2D context that is used. */
export interface Ctx2d {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): Ctx2d | null;
  toBlob?(cb: (b: Blob | null) => void, type?: string): void;
}

/** Colours and fonts from the design tokens (CSS variables), so no colour is written in code. */
export function paletteFromCss(root: Element = document.documentElement): Palette {
  const css = getComputedStyle(root);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--bg-void', 'black'),
    gold: v('--gold-300', 'gold'),
    text: v('--text', 'white'),
    muted: v('--text-muted', 'gray'),
    rule: v('--gold-700', 'gray'),
    fontDisplay: v('--font-display', 'sans-serif'),
    fontUi: v('--font-ui', 'sans-serif'),
  };
}

const fontOf = (p: Palette, size: number, bold: boolean): string => (bold ? `700 ${size}px ${p.fontDisplay}` : `400 ${size}px ${p.fontUi}`);

/** Sets the canvas to 1080 x 1350 and draws the routine. Returns the layout used (for tests and the "N lines hidden" note). */
export function drawRoutineImage(canvas: CanvasLike, routine: Routine, nameOf: Parameters<typeof layoutRoutine>[1], labels: ImageLabels, palette: Palette): Layout | null {
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const measure: Measure = (text, size, bold) => {
    ctx.font = fontOf(palette, size, bold);
    return ctx.measureText(text).width;
  };
  const layout = layoutRoutine(routine, nameOf, labels, measure);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);
  for (const op of layout.ops) {
    if (op.kind === 'rule') {
      ctx.strokeStyle = palette.rule;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(op.x, op.y);
      ctx.lineTo(op.x + op.w, op.y);
      ctx.stroke();
    } else {
      ctx.font = fontOf(palette, op.size, op.bold);
      ctx.fillStyle = op.tone === 'gold' ? palette.gold : op.tone === 'muted' ? palette.muted : palette.text;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  return layout;
}

/** Makes sure the bundled fonts are ready before measuring, so wrapping uses real widths. Never throws. */
export async function fontsReady(p: Palette, doc: { fonts?: { load(font: string): Promise<unknown> } } = document): Promise<void> {
  try {
    await Promise.all([doc.fonts?.load(fontOf(p, 40, true)), doc.fonts?.load(fontOf(p, 30, false))]);
  } catch {
    /* the system font is used instead */
  }
}

export const canvasBlob = (canvas: CanvasLike): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (!canvas.toBlob) return resolve(null);
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

export interface ShareEnv {
  /** `navigator.canShare` / `navigator.share` when the browser has them. */
  canShareFiles?: (files: File[]) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
  /** Starts a download of the file. */
  download: (blob: Blob, filename: string) => void;
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Share sheet when the browser can share files, else a download. Pressing "cancel" in the share sheet is not an error. */
export async function shareOrDownload(blob: Blob, filename: string, title: string, env: ShareEnv): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (env.share && env.canShareFiles?.([file])) {
    try {
      await env.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  env.download(blob, filename);
  return 'downloaded';
}

export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    ...(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function'
      ? { canShareFiles: (files: File[]) => nav.canShare({ files }), share: (d: { files: File[]; title?: string }) => nav.share(d) }
      : {}),
    download: (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
}

/** File name from the routine name: lowercase letters, digits and dashes. */
export const imageFileName = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'routine'}.png`;
