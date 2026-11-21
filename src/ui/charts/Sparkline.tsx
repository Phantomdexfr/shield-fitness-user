import { downsample, finiteOr, safe, scaleLinear } from '../../shared/chartMath';
import { useWidth } from './useScrub';

export interface SparklineProps {
  values: readonly number[];
  height?: number;
  fill?: boolean;
  class?: string;
}

const MAX_POINTS = 60;
const PAD = 3;

/** Tiny line: no axes, no text, no scrub, hidden from assistive tech (the number beside it carries the meaning). */
export function Sparkline({ values, height = 32, fill = false, class: cls }: SparklineProps) {
  const [ref, W] = useWidth<HTMLSpanElement>();
  const pts = downsample(
    values.flatMap((v, i) => {
      const y = finiteOr(v);
      return y === null ? [] : [{ x: i, y }];
    }),
    MAX_POINTS,
  );
  const ys = pts.map((p) => p.y as number);
  const xOf = scaleLinear(pts[0]?.x ?? 0, pts[pts.length - 1]?.x ?? 1, PAD, W - PAD);
  const yOf = scaleLinear(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1, height - PAD, PAD);
  const line = pts.map((p) => `${xOf(p.x)} ${yOf(p.y as number)}`);
  const last = pts[pts.length - 1];
  return (
    <span class={`sf-ch-spark${cls ? ` ${cls}` : ''}`} ref={ref} aria-hidden="true">
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {pts.length === 0 && <line class="sf-ch-grid" x1={PAD} x2={W - PAD} y1={height - PAD} y2={height - PAD} />}
        {pts.length > 1 && fill && <path class="sf-ch-spark-fill" d={`M${line.join(' L')} L${xOf(last!.x)} ${safe(height)} L${xOf(pts[0]!.x)} ${safe(height)} Z`} />}
        {pts.length > 1 && <path class="sf-ch-spark-line" d={`M${line.join(' L')}`} fill="none" />}
        {last && <circle class="sf-ch-spark-dot" cx={xOf(last.x)} cy={yOf(last.y as number)} r="3" />}
      </svg>
    </span>
  );
}
