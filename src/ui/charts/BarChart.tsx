import { t } from '../../i18n';
import { compact, finiteOr, fmtNum, labelIndices, labelStride, labelWidth, niceScale, safe, scaleLinear, spacedLabelIndices, summaryFor } from '../../shared/chartMath';
import { useFx } from '../components/Feedback';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase } from './ChartFrame';
import { useScrub, useWidth } from './useScrub';

export interface BarDatum {
  x: string;
  y: number;
  label?: string;
  highlight?: boolean;
}
export interface BarChartProps extends ChartBase {
  data: BarDatum[];
  target?: number;
}

const MAX_BARS = 52;
const MAX_STAGGER = 8;

function barPath(x: number, w: number, yTop: number, yBase: number): string {
  const r = Math.min(4, w / 2, Math.max(0, yBase - yTop));
  return `M${x} ${yBase} L${x} ${safe(yTop + r)} A${r} ${r} 0 0 1 ${safe(x + r)} ${yTop} L${safe(x + w - r)} ${yTop} A${r} ${r} 0 0 1 ${safe(x + w)} ${safe(yTop + r)} L${safe(x + w)} ${yBase} Z`;
}

function BarBase(props: BarChartProps) {
  const { title, height = 180, loading, format, emptyText, action, target } = props;
  const id = useChartId();
  const [boxRef, W] = useWidth<HTMLDivElement>();
  const fmt = format ?? fmtNum;
  const animate = useFx('bar:' + title, props.animate !== false, !!loading);
  // zero-based; negative or non-finite values are clamped to 0
  const data = props.data.slice(-MAX_BARS).map((d) => ({ ...d, y: Math.max(0, finiteOr(d.y) ?? 0) }));
  const tgt = target !== undefined && Number.isFinite(target) ? target : undefined;
  const top = Math.max(0, ...data.map((d) => d.y), tgt ?? 0);
  const scale = niceScale(0, top, 5, { zeroBased: true, floorZero: true });
  const axisFmt = (v: number) => (Math.abs(v) > 9999 ? compact(v) : fmt(v));
  const ml = Math.max(28, Math.max(...scale.ticks.map((v) => axisFmt(v).length), 1) * 7 + 12);
  const mr = 8;
  const mt = 14;
  const mb = 24;
  const pw = Math.max(40, W - ml - mr);
  const ph = Math.max(40, height - mt - mb);
  const yOf = scaleLinear(scale.min, scale.max, mt + ph, mt);
  const n = data.length;
  const slot = n ? pw / n : pw;
  const bw = Math.max(2, slot * 0.6);
  const centers = data.map((_, i) => safe(ml + slot * (i + 0.5)));
  const scrub = useScrub(centers, W);
  const state = loading ? 'loading' : n === 0 ? 'empty' : 'ok';
  const summary =
    props.summary ??
    summaryFor({ kind: 'bar', title, data: data.map((d) => ({ label: d.label ?? d.x, y: d.y })), target: tgt }, fmt, t);
  const active = scrub.active;
  const lit = active ?? (data.findIndex((d) => d.highlight) >= 0 ? data.findIndex((d) => d.highlight) : n - 1);
  const stride = labelStride(n, pw, 'date');
  const labelIdx = new Set(spacedLabelIndices(labelIndices(n, stride), centers, data.map((d) => labelWidth(d.x)), 8, ml, W));
  const showValues = n <= 7 && slot >= 36;
  const readout =
    active !== null && data[active]
      ? { pct: (centers[active]! / W) * 100, title: data[active]!.label ?? data[active]!.x, rows: [{ name: '', value: fmt(data[active]!.y) + (props.unit && !props.format ? ` ${props.unit}` : ''), colorIndex: 1 }] }
      : null;
  const baseY = yOf(0);

  return (
    <ChartFrame id={id} title={title} summary={summary} state={state} height={height} emptyText={emptyText} action={action} readout={readout} plotProps={{ ref: boxRef, tabIndex: 0, ...scrub.bind }}>
      <svg ref={scrub.svgRef as never} class={`sf-ch-svg${animate ? '' : ' sf-ch-still'}`} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
        {scale.ticks.map((v) => (
          <g key={v}>
            <line class="sf-ch-grid" x1={ml} x2={ml + pw} y1={yOf(v)} y2={yOf(v)} />
            <text class="sf-ch-axis" x={ml - 6} y={yOf(v)} text-anchor="end" dominant-baseline="middle">
              {axisFmt(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          labelIdx.has(i) ? (
            <text class="sf-ch-axis" key={i} x={centers[i]} y={mt + ph + 16} text-anchor={centers[i]! > W - 24 ? 'end' : centers[i]! < ml + 16 ? 'start' : 'middle'}>
              {d.x}
            </text>
          ) : null,
        )}
        {data.map((d, i) => {
          const yTop = yOf(d.y);
          const cls = i === lit ? 'sf-ch-bar sf-ch-bar-lit' : tgt !== undefined && d.y >= tgt ? 'sf-ch-bar sf-ch-bar-hit' : 'sf-ch-bar';
          return d.y > 0 ? (
            <path key={i} class={cls} d={barPath(safe(centers[i]! - bw / 2), safe(bw), yTop, baseY)} style={{ animationDelay: `${Math.min(i, MAX_STAGGER - 1) * 40}ms` }} />
          ) : null;
        })}
        {tgt !== undefined && (
          <g>
            <line class="sf-ch-target" x1={ml} x2={ml + pw} y1={yOf(tgt)} y2={yOf(tgt)} />
            <text class="sf-ch-axis sf-ch-target-text" x={ml + pw} y={yOf(tgt) - 4} text-anchor="end">
              {t('chart.target')} {fmt(tgt)}
            </text>
          </g>
        )}
        {showValues &&
          data.map((d, i) => (
            <text class="sf-ch-axis sf-ch-bar-value" key={i} x={centers[i]} y={safe(yOf(d.y) - 4)} text-anchor="middle">
              {fmt(d.y)}
            </text>
          ))}
        {active !== null && (
          <g class="sf-ch-cursor" aria-hidden="true">
            <line x1={centers[active]} x2={centers[active]} y1={mt} y2={mt + ph} />
          </g>
        )}
      </svg>
    </ChartFrame>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <ChartBoundary title={props.title}>
      <BarBase {...props} />
    </ChartBoundary>
  );
}
