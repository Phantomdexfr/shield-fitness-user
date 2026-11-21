// Movement figure (Phase 25): faded start pose, solid end pose, capsule limbs, joint dots, arc arrows, resistance line,
// equipment glyph, angle legend and a text twin that is always in the DOM. SVG only, colours via CSS tokens (movement.css).
// Wording is "typical movement"; nothing here says what is right or wrong.

import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { cx } from '../components/util';
import { prefersReducedMotion } from '../components/motion';
import {
  FRAME,
  buildFigure,
  lerpPose,
  placePair,
  toScreen,
  type ArcSpec,
  type FigureModel,
  type Fit,
  type Glyph,
  type MovementPattern,
  type MovementSex,
  type Params,
  type Pt,
  type Skeleton,
} from '../../shared/movement';

export interface MovementFigureProps {
  pattern: MovementPattern;
  /** The exercise's own param string (`key=value;key=value`). */
  param?: string;
  /** Params from the setup picker, laid over `param`. */
  setupParams?: Params;
  sex?: MovementSex;
  /** Exercise name, for the glyph words and the accessible label. */
  name?: string;
  machineCategory?: string;
  /** Mini = end pose only, no arcs, no legend, no text (session header). */
  mini?: boolean;
  /** Animate start to end twice, then rest. Off under reduced motion either way. */
  animate?: boolean;
  class?: string;
}

const P = (fit: Fit, p: Pt) => toScreen(fit, p);
const pt = (p: Pt) => `${p.x},${p.y}`;
const line = (pts: Pt[]) => pts.map(pt).join(' ');

function Capsules({ s, fit, cls }: { s: Skeleton; fit: Fit; cls: string }) {
  const hip = P(fit, s.hip);
  const sh = P(fit, s.shoulder);
  const head = P(fit, s.head);
  const hj = s.hipJ.map((p) => P(fit, p));
  const sj = s.shoulderJ.map((p) => P(fit, p));
  const limb = (i: 0 | 1, far: boolean) => {
    const el = P(fit, s.elbow[i]);
    const wr = P(fit, s.wrist[i]);
    const kn = P(fit, s.knee[i]);
    const an = P(fit, s.ankle[i]);
    const to = P(fit, s.toe[i]);
    return (
      <g key={i} class={far ? 'sf-mm__far' : undefined}>
        <polyline class="sf-mm__limb" points={line([sj[i]!, el, wr])} />
        <polyline class="sf-mm__limb" points={line([hj[i]!, kn, an, to])} />
        {[el, wr, kn, an].map((p, k) => (
          <circle key={k} class="sf-mm__dot" cx={p.x} cy={p.y} r={2.6} />
        ))}
      </g>
    );
  };
  const wide = sj[0]!.x !== sj[1]!.x;
  return (
    <g class={cls}>
      {limb(1, true)}
      <line class="sf-mm__trunk" x1={hip.x} y1={hip.y} x2={sh.x} y2={sh.y} />
      {wide && <line class="sf-mm__bar" x1={sj[0]!.x} y1={sj[0]!.y} x2={sj[1]!.x} y2={sj[1]!.y} />}
      {wide && <line class="sf-mm__bar" x1={hj[0]!.x} y1={hj[0]!.y} x2={hj[1]!.x} y2={hj[1]!.y} />}
      <line class="sf-mm__neck" x1={sh.x} y1={sh.y} x2={head.x} y2={head.y} />
      <circle class="sf-mm__head" cx={head.x} cy={head.y} r={9} />
      {limb(0, false)}
      <circle class="sf-mm__dot" cx={sh.x} cy={sh.y} r={3} />
      <circle class="sf-mm__dot" cx={hip.x} cy={hip.y} r={3} />
    </g>
  );
}

function arrowHead(from: Pt, to: Pt, size = 7): string {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const l = { x: to.x - size * Math.cos(a - 0.45), y: to.y - size * Math.sin(a - 0.45) };
  const r = { x: to.x - size * Math.cos(a + 0.45), y: to.y - size * Math.sin(a + 0.45) };
  return `${pt(l)} ${pt(to)} ${pt(r)}`;
}

function Arc({ arc, fit, index }: { arc: ArcSpec; fit: Fit; index: number }) {
  const c = P(fit, arc.at);
  const r = 20 + index * 7;
  const delta = ((arc.endDeg - arc.startDeg + 540) % 360) - 180;
  const n = 12;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((arc.startDeg + (delta * i) / n) * Math.PI) / 180;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) });
  }
  return (
    <g class="sf-mm__arc">
      <polyline points={line(pts)} />
      <polygon points={arrowHead(pts[n - 3]!, pts[n]!, 6)} />
    </g>
  );
}

function GlyphShape({ glyph, model, wrist, end }: { glyph: Glyph; model: FigureModel; wrist: Pt; end: Skeleton }) {
  const fit = model.fit;
  switch (glyph) {
    case 'barbell':
      return <circle class="sf-mm__glyph" cx={wrist.x} cy={wrist.y} r={8} />;
    case 'plate':
      return <circle class="sf-mm__glyph" cx={wrist.x} cy={wrist.y} r={9} />;
    case 'kettlebell':
    case 'ball':
      return <circle class="sf-mm__glyph" cx={wrist.x} cy={wrist.y} r={7} />;
    case 'dumbbell':
      return <rect class="sf-mm__glyph" x={wrist.x - 8} y={wrist.y - 4} width={16} height={8} rx={2} />;
    case 'machine':
      return <rect class="sf-mm__glyph" x={wrist.x - 6} y={wrist.y - 6} width={12} height={12} rx={3} />;
    case 'wheel':
      return <circle class="sf-mm__glyph" cx={wrist.x} cy={wrist.y} r={10} />;
    case 'bar':
      return <line class="sf-mm__glyph" x1={wrist.x - 34} y1={wrist.y} x2={wrist.x + 34} y2={wrist.y} />;
    case 'rope':
      return <path class="sf-mm__glyph" d={`M${wrist.x - 6},${wrist.y + 10} q6,-10 12,0 t12,0`} />;
    case 'band':
    case 'suspension': {
      const floor = fit.floorY ?? FRAME.h - FRAME.pad;
      const anchor = P(fit, end.ankle[0]);
      return <line class="sf-mm__glyph sf-mm__glyph--thin" x1={wrist.x} y1={wrist.y} x2={glyph === 'band' ? anchor.x : wrist.x} y2={glyph === 'band' ? floor : FRAME.pad - 10} />;
    }
    case 'cable': {
      const a = model.arrow;
      const toS = a ? P(fit, a.to) : wrist;
      const fromS = a ? P(fit, a.from) : { x: wrist.x, y: wrist.y - 40 };
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      // the pulley sits just beyond where the path starts (the cable runs from the hand back toward it)
      const px = clamp(toS.x + (fromS.x - toS.x) * 1.2, 10, FRAME.w - 10);
      const py = clamp(toS.y + (fromS.y - toS.y) * 1.2, 10, FRAME.h - 10);
      return (
        <g>
          <line class="sf-mm__glyph sf-mm__glyph--thin" x1={wrist.x} y1={wrist.y} x2={px} y2={py} />
          <circle class="sf-mm__glyph" cx={px} cy={py} r={4} />
        </g>
      );
    }
    case 'bike': {
      const f = P(fit, end.toe[0]);
      return <circle class="sf-mm__glyph" cx={f.x} cy={f.y} r={12} />;
    }
    default:
      return null;
  }
}

/** Reduced motion or not animating: null. Otherwise 0..1 (eased), looping twice then resting at 1. */
function useLoop(on: boolean): number | null {
  const [t01, setT] = useState<number | null>(null);
  useEffect(() => {
    if (!on || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return undefined;
    const LOOP = 1200;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const e = now - t0;
      if (e >= LOOP * 2) return setT(null);
      const f = (e % LOOP) / LOOP;
      setT(f * f * (3 - 2 * f));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t01;
}

/** The figure, the angle legend and the text twin. */
export function MovementFigure(props: MovementFigureProps) {
  const { pattern, param, setupParams, sex = 'male', name = pattern.name, machineCategory, mini = false, animate = true } = props;
  const model = useMemo(
    () => buildFigure(pattern, param, { sex, name, ...(setupParams ? { setupParams } : {}), ...(machineCategory ? { machineCategory } : {}) }),
    [pattern, param, setupParams, sex, name, machineCategory],
  );
  const twinId = useId();
  const loop = useLoop(animate && !mini);
  const { fit, placed } = model;
  const live = loop === null ? null : placePair(pattern, { start: lerpPose(model.poses.start, model.poses.end, loop), end: model.poses.end }, sex).start;
  const endS = placed.end;
  const wrist = P(fit, endS.wrist[0]);
  const arrow = model.arrow;
  const label = t('mm.figure', { name });

  const svg = (
    <svg class={cx('sf-mm__svg', mini && 'sf-mm__svg--mini')} viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} role="img" aria-label={label} aria-describedby={mini ? undefined : twinId} preserveAspectRatio="xMidYMid meet">
      {fit.floorY !== null && <line class="sf-mm__floor" x1={FRAME.pad / 2} y1={fit.floorY} x2={FRAME.w - FRAME.pad / 2} y2={fit.floorY} />}
      {!mini && <Capsules s={placed.start} fit={fit} cls="sf-mm__pose sf-mm__pose--start" />}
      {!mini && live && <Capsules s={live} fit={fit} cls="sf-mm__pose sf-mm__pose--end" />}
      <Capsules s={endS} fit={fit} cls={cx('sf-mm__pose sf-mm__pose--end', !mini && live && 'sf-mm__pose--rest')} />
      {!mini && arrow && (
        <g class="sf-mm__path">
          <line x1={P(fit, arrow.from).x} y1={P(fit, arrow.from).y} x2={P(fit, arrow.to).x} y2={P(fit, arrow.to).y} />
          <polygon points={arrowHead(P(fit, arrow.from), P(fit, arrow.to))} />
        </g>
      )}
      {!mini && model.arcs.map((a, i) => <Arc key={a.joint} arc={a} fit={fit} index={i} />)}
      <GlyphShape glyph={model.glyph} model={model} wrist={wrist} end={endS} />
    </svg>
  );
  if (mini) return <div class={cx('sf-mm sf-mm--mini', props.class)}>{svg}</div>;

  return (
    <div class={cx('sf-mm', props.class)}>
      {svg}
      <div class="sf-mm__key" aria-hidden="true">
        <span class="sf-mm__swatch sf-mm__swatch--start" />
        {t('mm.start')}
        <span class="sf-mm__swatch sf-mm__swatch--end" />
        {t('mm.end')}
      </div>
      {model.arcs.length > 0 && (
        <ul class="sf-mm__arcs" aria-label={t('mm.title')}>
          {model.arcs.map((a) => (
            <li key={a.joint}>{t('mm.arc', { joint: t(`mm.joint.${a.joint}` as StringKey), from: a.from, to: a.to })}</li>
          ))}
        </ul>
      )}
      <p class="sf-mm__twin" id={twinId}>
        {[model.twin.start, model.twin.end, model.twin.widthKey ? t(model.twin.widthKey) : ''].filter(Boolean).join(' ')}
      </p>
    </div>
  );
}
