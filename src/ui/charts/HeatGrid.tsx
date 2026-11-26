import { useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { dayLabel, fmtNum, heatLayout, safe, summaryFor2, thinMonthLabels, type HeatCellIn, type HeatMode } from '../../shared/chartMath';
import type { DayKey } from '../../shared/dates';
import { tick } from '../components/haptics';
import { useFx } from '../components/Feedback';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase } from './ChartFrame';
import { useWidth } from './useScrub';
import type { StringKey } from '../../i18n/en';

export interface HeatGridProps extends ChartBase {
  cells: HeatCellIn[];
  from: DayKey;
  to: DayKey;
  /** `sessions` (default): 0 / 1 / 2+. `volume`: quintile bands of the non-zero days. */
  mode?: HeatMode;
  /** Outlined cell; defaults to `to`. */
  today?: DayKey;
}

const CELL = 14;
const GAP = 3;
const PITCH = CELL + GAP;
const MAX_PITCH = 30;
const TOP = 16;
const HIT = 22; // half of the 44 px target: the nearest drawn cell within 22 px of the finger wins

function HeatBase(props: HeatGridProps) {
  const { title, cells, from, to, loading, emptyText, action } = props;
  const id = useChartId();
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const fmt = props.format ?? fmtNum;
  const animate = useFx('heat:' + title, props.animate !== false, !!loading);
  const layout = heatLayout(cells, from, to, props.mode ?? 'sessions');
  const [active, setActive] = useState<number | null>(null);
  const timer = useRef(0);
  const down = useRef(false);
  const n = layout.cells.length;
  // Short ranges (<= 20 weeks) stretch to the box width so the grid fills the card; long ones keep the small cell and scroll.
  const fit = layout.weeks > 0 && layout.weeks <= 20 && boxW > 0 ? Math.floor((boxW + GAP) / layout.weeks) : PITCH;
  const pitch = Math.max(PITCH, Math.min(MAX_PITCH, fit));
  const cell = pitch - GAP;
  const w = Math.max(1, layout.weeks * pitch - GAP);
  const h = TOP + 7 * pitch - GAP;
  const todayKey = props.today ?? to;
  const state = loading ? 'loading' : cells.length === 0 || layout.weeks === 0 ? 'empty' : 'ok';
  const summary = props.summary ?? summaryFor2({ kind: 'heat', title, layout }, fmt, t);

  const show = (i: number) => {
    if (i < 0 || i >= n) return;
    if (i !== active) tick();
    setActive(i);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setActive(null);
  };
  const pick = (e: PointerEvent) => {
    const svg = (e.currentTarget as Element).querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const k = rect.width > 0 ? w / rect.width : 1;
    const px = (e.clientX - rect.left) * k;
    const py = (e.clientY - rect.top) * (rect.height > 0 ? h / rect.height : 1);
    let best = -1;
    let bd = HIT * HIT;
    layout.cells.forEach((c, i) => {
      const dx = c.col * pitch + cell / 2 - px;
      const dy = TOP + c.row * pitch + cell / 2 - py;
      const d = dx * dx + dy * dy;
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) show(best);
  };
  const bind = {
    onPointerDown(e: PointerEvent) {
      clearTimeout(timer.current);
      down.current = true;
      pick(e);
    },
    onPointerMove(e: PointerEvent) {
      if (down.current || e.pointerType === 'mouse') pick(e);
    },
    onPointerUp(e: PointerEvent) {
      down.current = false;
      if (e.pointerType !== 'mouse') timer.current = window.setTimeout(hide, 1200);
    },
    onPointerCancel() {
      down.current = false;
      hide();
    },
    onPointerLeave(e: PointerEvent) {
      if (e.pointerType === 'mouse' && !down.current) hide();
    },
    onBlur: hide,
    onKeyDown(e: KeyboardEvent) {
      if (n === 0) return;
      const cur = active ?? n;
      let next: number | null = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, Math.min(n - 1, cur - 1));
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = active === null ? n - 1 : Math.min(n - 1, cur + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      else if (e.key === 'Escape') {
        hide();
        return;
      } else return;
      e.preventDefault();
      show(next);
    },
  };
  const a = active !== null ? layout.cells[active] : undefined;
  const readout = a
    ? {
        pct: (Math.min(w, a.col * pitch + cell / 2) / Math.max(1, boxW)) * 100,
        title: dayLabel(a.day, t, 'full'),
        rows: [{ name: '', value: props.format ? fmt(a.value) : `${fmt(a.value)}${props.unit ? ` ${props.unit}` : ''}`, colorIndex: 1 }],
      }
    : null;
  const scroll = layout.weeks > 20;

  return (
    <ChartFrame id={id} title={title} summary={summary} state={state} height={h + 4} emptyText={emptyText} action={action} readout={readout} plotProps={{ ref: boxRef, tabIndex: 0, ...bind }}>
      <div class={`sf-ch-heatbox${scroll ? ' sf-ch-heatscroll' : ''}`}>
        <svg class={`sf-ch-svg${animate ? '' : ' sf-ch-still'}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
          {thinMonthLabels(layout.months).map((m) => (
            <text class="sf-ch-axis" key={m.col} x={m.col * pitch} y={11}>
              {t(`chart.m${m.month}` as StringKey)}
            </text>
          ))}
          {layout.cells.map((c, i) => (
            <rect
              key={c.day}
              class={`sf-ch-heat sf-ch-heat-${c.band}${animate ? ' sf-ch-fade' : ''}${i === active ? ' sf-ch-heat-on' : ''}`}
              x={c.col * pitch}
              y={TOP + c.row * pitch}
              width={cell}
              height={cell}
              rx="3"
              style={animate ? { animationDelay: `${safe((c.col / Math.max(1, layout.weeks - 1)) * 200, 0)}ms` } : undefined}
            />
          ))}
          {layout.cells.map((c) =>
            c.day === todayKey ? <rect class="sf-ch-today" key={`t${c.day}`} x={c.col * pitch - 0.5} y={TOP + c.row * pitch - 0.5} width={cell + 1} height={cell + 1} rx="3.5" fill="none" /> : null,
          )}
        </svg>
      </div>
    </ChartFrame>
  );
}

export function HeatGrid(props: HeatGridProps) {
  return (
    <ChartBoundary title={props.title}>
      <HeatBase {...props} />
    </ChartBoundary>
  );
}
