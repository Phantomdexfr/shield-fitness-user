import { t } from '../../i18n';
import { fmtNum, gaugeFraction, safe, summaryFor2 } from '../../shared/chartMath';
import { prefersReducedMotion } from '../components/motion';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase } from './ChartFrame';

export interface GaugeProps extends ChartBase {
  value: number;
  min: number;
  max: number;
  /** Tick marks outside the arc (for example tier thresholds); their values are listed in the legend. */
  marks?: number[];
  /** Arc width in px (default 10). */
  stroke?: number;
}

const W = 200;
const H = 118;

function GaugeBase(props: GaugeProps) {
  const { title, value, min, max, loading, emptyText, action } = props;
  const id = useChartId();
  const fmt = props.format ?? fmtNum;
  const animate = props.animate !== false && !prefersReducedMotion();
  const stroke = Math.max(4, Math.min(24, Number.isFinite(props.stroke) ? (props.stroke as number) : 10));
  const g = gaugeFraction(value, min, max, props.marks);
  const cx = W / 2;
  const cy = 92;
  const r = 76 - stroke / 2;
  const arcD = `M${safe(cx - r)} ${cy} A${safe(r)} ${safe(r)} 0 0 1 ${safe(cx + r)} ${cy}`;
  const at = (frac: number, rad: number) => {
    const a = Math.PI * (1 - frac);
    return { x: safe(cx + rad * Math.cos(a)), y: safe(cy - rad * Math.sin(a)) };
  };
  const summary = props.summary ?? summaryFor2({ kind: 'ring', title, value, max, pct: g.pct, valid: g.valid }, fmt, t);
  const legend = g.valid ? g.marks.map((m) => ({ name: fmt(min + m * (max - min)), colorIndex: 1, dash: 'solid' as const })) : [];
  return (
    <ChartFrame id={id} title={title} summary={summary} state={loading ? 'loading' : 'ok'} height={H} emptyText={emptyText} action={action} legend={legend} legendMin={1}>
      <div class="sf-ch-ringbox" style={{ height: `${H}px` }}>
        <svg class={`sf-ch-svg${animate ? '' : ' sf-ch-still'}`} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
          <path class="sf-ch-track" d={arcD} fill="none" stroke-width={stroke} />
          {g.valid && g.frac > 0 && <path class={`sf-ch-arc${g.frac >= 1 ? ' sf-ch-arc-full' : ''}${animate ? ' sf-ch-sweep' : ''}`} d={arcD} fill="none" stroke-width={stroke} pathLength="1" stroke-dasharray={`${safe(g.frac, 0)} 1`} />}
          {g.valid &&
            g.marks.map((m) => {
              const a = at(m, r + stroke / 2 + 1);
              const b = at(m, r + stroke / 2 + 7);
              return <line class="sf-ch-mark" key={m} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
            })}
          <text class="sf-ch-axis" x={safe(cx - r)} y={cy + 16} text-anchor="middle">
            {g.valid ? fmt(min) : ''}
          </text>
          <text class="sf-ch-axis" x={safe(cx + r)} y={cy + 16} text-anchor="middle">
            {g.valid ? fmt(max) : ''}
          </text>
          <text class="sf-ch-gaugenum" x={cx} y={cy - 6} text-anchor="middle">
            {g.valid ? fmt(value) : '–'}
          </text>
        </svg>
      </div>
    </ChartFrame>
  );
}

export function Gauge(props: GaugeProps) {
  return (
    <ChartBoundary title={props.title}>
      <GaugeBase {...props} />
    </ChartBoundary>
  );
}
