import { t } from '../../i18n';
import {
  compact, dayLabel, downsample, fmtNum, labelIndices, labelStride, niceScale, preparePoints, safe, scaleLinear,
  seriesStats, summaryFor, timeBase, type PreparedPoint, type RawPoint,
} from '../../shared/chartMath';
import { addDays } from '../../shared/dates';
import { prefersReducedMotion } from '../components/motion';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase, type LegendItem } from './ChartFrame';
import { useScrub, useWidth } from './useScrub';

export interface Series {
  id: string;
  name: string;
  points: RawPoint[];
  dash?: 'solid' | 'dashed' | 'dotted';
  colorIndex?: 1 | 2 | 3 | 4 | 5 | 6;
}
export interface LineChartProps extends ChartBase {
  series: Series[];
  yMin?: number;
  yMax?: number;
  zeroBased?: boolean;
  target?: number;
}

const MAX_SERIES = 3;
const MAX_POINTS = 400;
const DASHES = ['solid', 'dashed', 'dotted'] as const;

interface Inner extends LineChartProps {
  area?: boolean;
}

function segments(pts: readonly { y: number | null }[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  pts.forEach((p, i) => {
    if (p.y === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

function LineBase(props: Inner) {
  const { title, series: allSeries, height = 180, loading, format, emptyText, action, area, target, zeroBased = false } = props;
  const id = useChartId();
  const [boxRef, W] = useWidth<HTMLDivElement>();
  const series = allSeries.slice(0, MAX_SERIES);
  const fmt = format ?? fmtNum;
  const animate = props.animate !== false && !prefersReducedMotion();

  const base = timeBase(series.map((s) => s.points));
  const prepared = series.map((s) => preparePoints(s.points, base));
  const drawn = prepared.map((p) => downsample(p, MAX_POINTS));
  const everyN = Math.max(1, ...prepared.map((p, i) => (drawn[i]!.length < p.length ? Math.ceil(p.length / drawn[i]!.length) : 1)));
  const real = prepared.map((p) => p.filter((q) => q.y !== null));
  const totalReal = real.reduce((n, r) => n + r.length, 0);

  const xText = (p: PreparedPoint) => (base !== null && typeof p.raw === 'string' ? dayLabel(p.raw, t) : String(p.raw));
  const stats = prepared.map((p, i) => seriesStats(series[i]!.name, p, xText));
  const summary = props.summary ?? summaryFor({ kind: 'line', title, series: stats, everyN }, fmt, t);
  const legend: LegendItem[] = series.map((s, i) => ({ name: s.name, colorIndex: s.colorIndex ?? i + 1, dash: s.dash ?? DASHES[i] }));

  // y domain
  const ys = real.flatMap((r) => r.map((p) => p.y as number));
  if (target !== undefined && Number.isFinite(target)) ys.push(target);
  const dMin = ys.length ? Math.min(...ys) : 0;
  const dMax = ys.length ? Math.max(...ys) : 1;
  const scale = niceScale(props.yMin ?? dMin, props.yMax ?? dMax, 5, { zeroBased, floorZero: !zeroBased && dMin >= 0 });
  const axisFmt = (v: number) => (Math.abs(v) > 9999 ? compact(v) : fmt(v));
  const longest = Math.max(...scale.ticks.map((v) => axisFmt(v).length), 1);
  const ml = Math.max(28, longest * 7 + 12);
  const mr = 12;
  const mt = 10;
  const mb = 24;
  const pw = Math.max(40, W - ml - mr);
  const ph = Math.max(40, height - mt - mb);
  const yOf = scaleLinear(scale.min, scale.max, mt + ph, mt);

  // x positions
  const timeAxis = base !== null;
  const union = [...new Set(drawn.flatMap((d) => d.filter((p) => p.y !== null).map((p) => p.x)))].sort((a, b) => a - b);
  let xOf: (x: number) => number;
  if (timeAxis) xOf = scaleLinear(union[0] ?? 0, union[union.length - 1] ?? 1, ml + 4, ml + pw - 4);
  else {
    const idx = new Map(union.map((x, i) => [x, i]));
    xOf = (x) => safe(union.length < 2 ? ml + pw / 2 : ml + 4 + ((idx.get(x) ?? 0) / (union.length - 1)) * (pw - 8));
  }
  const xs = union.map(xOf);
  const scrub = useScrub(xs, W);
  const single = totalReal === 1;
  const shown = scrub.active ?? (single ? 0 : null);

  const state = loading ? 'loading' : totalReal === 0 ? 'empty' : 'ok';
  let readout: Parameters<typeof ChartFrame>[0]['readout'] = null;
  if (shown !== null && union[shown] !== undefined) {
    const ux = union[shown]!;
    const rows = drawn.flatMap((d, i) => {
      const p = d.find((q) => q.x === ux && q.y !== null);
      return p ? [{ name: series[i]!.name, value: fmt(p.y as number) + (props.unit && !props.format ? ` ${props.unit}` : ''), colorIndex: series[i]!.colorIndex ?? i + 1 }] : [];
    });
    const first = drawn.flatMap((d) => d).find((q) => q.x === ux);
    const heading = first ? (base !== null && typeof first.raw === 'string' ? dayLabel(first.raw, t, 'full') : (first.label ?? String(first.raw))) : '';
    readout = { pct: (xs[shown]! / W) * 100, title: heading, rows };
  }

  // x tick labels
  const xLabels: { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[] = [];
  if (union.length > 0) {
    if (timeAxis) {
      const x0 = union[0]!;
      const x1 = union[union.length - 1]!;
      const n = x0 === x1 ? 1 : Math.min(Math.floor(pw / 56), 5);
      const style = x1 - x0 > 120 ? 'month' : 'short';
      let prev = '';
      for (let i = 0; i < Math.max(1, n); i++) {
        const f = n <= 1 ? 0 : i / (n - 1);
        const day = Math.round(x0 + f * (x1 - x0));
        const text = dayLabel(addDays(base!, day), t, style);
        if (text === prev) continue;
        prev = text;
        xLabels.push({ x: n <= 1 ? xOf(x0) : xOf(day), text, anchor: n <= 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
      }
    } else {
      const stride = labelStride(union.length, pw, 'number');
      const picks = labelIndices(union.length, stride);
      picks.forEach((i, k) => xLabels.push({ x: xs[i]!, text: String(union[i]), anchor: picks.length > 1 && k === 0 ? 'start' : picks.length > 1 && k === picks.length - 1 ? 'end' : 'middle' }));
    }
  }

  const baseY = yOf(scale.min);
  const showDots = totalReal <= 30;

  return (
    <ChartFrame
      id={id}
      title={title}
      summary={summary}
      state={state}
      height={height}
      emptyText={emptyText}
      action={action}
      legend={legend}
      readout={readout}
      plotProps={{ ref: boxRef, tabIndex: 0, ...scrub.bind }}
    >
      <svg
        ref={scrub.svgRef as never}
        class={`sf-ch-svg${animate ? '' : ' sf-ch-still'}`}
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-s`}
      >
        {area && (
          <defs>
            {series.map((s, i) => (
              <linearGradient id={`${id}-g${i}`} key={s.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: `var(--chart-${s.colorIndex ?? i + 1})`, stopOpacity: 0.28 }} />
                <stop offset="1" style={{ stopColor: `var(--chart-${s.colorIndex ?? i + 1})`, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
        )}
        {scale.ticks.map((v) => (
          <g key={v}>
            <line class="sf-ch-grid" x1={ml} x2={ml + pw} y1={yOf(v)} y2={yOf(v)} />
            <text class="sf-ch-axis" x={ml - 6} y={yOf(v)} text-anchor="end" dominant-baseline="middle">
              {axisFmt(v)}
            </text>
          </g>
        ))}
        {xLabels.map((l) => (
          <text class="sf-ch-axis" key={l.x + l.text} x={l.x} y={mt + ph + 16} text-anchor={l.anchor}>
            {l.text}
          </text>
        ))}
        {target !== undefined && Number.isFinite(target) && (
          <g>
            <line class="sf-ch-target" x1={ml} x2={ml + pw} y1={yOf(target)} y2={yOf(target)} />
            <text class="sf-ch-axis sf-ch-target-text" x={ml + pw} y={yOf(target) - 4} text-anchor="end">
              {t('chart.target')} {fmt(target)}
            </text>
          </g>
        )}
        {drawn.map((d, si) => {
          const color = `var(--chart-${series[si]!.colorIndex ?? si + 1})`;
          const dash = series[si]!.dash ?? DASHES[si];
          const segs = segments(d);
          return (
            <g key={series[si]!.id} style={{ color }}>
              {segs.map((seg, k) => {
                const pts = seg.map((i) => `${xOf(d[i]!.x)} ${yOf(d[i]!.y as number)}`);
                if (seg.length === 1) return <circle class="sf-ch-dot-solo" key={k} cx={xOf(d[seg[0]!]!.x)} cy={yOf(d[seg[0]!]!.y as number)} r="3" />;
                const line = `M${pts.join(' L')}`;
                return (
                  <g key={k}>
                    {area && <path d={`${line} L${xOf(d[seg[seg.length - 1]!]!.x)} ${baseY} L${xOf(d[seg[0]!]!.x)} ${baseY} Z`} fill={`url(#${id}-g${si})`} stroke="none" />}
                    <path class={`sf-ch-line sf-ch-dash-${dash}${dash === 'solid' ? ' sf-ch-draw' : ''}`} d={line} pathLength={dash === 'solid' ? 1 : undefined} fill="none" />
                  </g>
                );
              })}
              {showDots && d.map((p, i) => (p.y === null ? null : <circle class="sf-ch-dot-solo" key={i} cx={xOf(p.x)} cy={yOf(p.y)} r="3" />))}
            </g>
          );
        })}
        {shown !== null && union[shown] !== undefined && (
          <g class="sf-ch-cursor" aria-hidden="true">
            <line x1={xs[shown]} x2={xs[shown]} y1={mt} y2={mt + ph} />
            {drawn.map((d, si) => {
              const p = d.find((q) => q.x === union[shown] && q.y !== null);
              return p ? <circle key={si} cx={xs[shown]} cy={yOf(p.y as number)} r="5" style={{ fill: `var(--chart-${series[si]!.colorIndex ?? si + 1})` }} /> : null;
            })}
          </g>
        )}
      </svg>
    </ChartFrame>
  );
}

export function LineChart(props: LineChartProps) {
  return (
    <ChartBoundary title={props.title}>
      <LineBase {...props} />
    </ChartBoundary>
  );
}

export function AreaOf(props: Omit<LineChartProps, 'series'> & { series: [Series] }) {
  return (
    <ChartBoundary title={props.title}>
      <LineBase {...props} area />
    </ChartBoundary>
  );
}
