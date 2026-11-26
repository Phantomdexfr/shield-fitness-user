import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import { fmtNum, ringFraction, safe, summaryFor2 } from '../../shared/chartMath';
import { useFx } from '../components/Feedback';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase } from './ChartFrame';

export interface RingProps extends ChartBase {
  value: number;
  max?: number;
  secondary?: { value: number; max?: number; name: string };
  /** Centre slot; the default is the true percentage. */
  centre?: ComponentChildren;
  size?: number;
  stroke?: number;
}

function RingBase(props: RingProps) {
  const { title, value, max = 1, secondary, centre, loading, emptyText, action } = props;
  const id = useChartId();
  const size = Math.max(40, Math.min(240, Number.isFinite(props.size) ? (props.size as number) : 72));
  const stroke = Math.max(3, Math.min(size / 4, Number.isFinite(props.stroke) ? (props.stroke as number) : Math.round((size * 7) / 72)));
  const animate = useFx('ring:' + title, props.animate !== false, !!loading);
  const fmt = props.format ?? fmtNum;
  const f = ringFraction(value, max);
  const sec = secondary ? ringFraction(secondary.value, secondary.max ?? max) : null;
  const lapStroke = Math.max(2, Math.round(stroke / 3));
  // outer lap ring sits in the margin outside the main track
  const pad = f.over ? lapStroke + 2 : 0;
  const r = (size - stroke) / 2;
  const c = size / 2 + pad;
  const box = size + pad * 2;
  const r2 = r - stroke - 3;
  const summary = props.summary ?? (secondary && f.valid && sec?.valid
    ? `${summaryFor2({ kind: 'ring', title, value, max, pct: f.pct, valid: true }, fmt, t)} ${secondary.name}: ${fmt(secondary.value)} (${sec.pct} %).`
    : summaryFor2({ kind: 'ring', title, value, max, pct: f.pct, valid: f.valid }, fmt, t));
  const state = loading ? 'loading' : 'ok';
  const arc = (rad: number, frac: number, cls: string, w: number) =>
    frac > 0 ? (
      <circle class={`${cls}${animate ? ' sf-ch-sweep' : ''}`} cx={c} cy={c} r={safe(rad)} fill="none" stroke-width={w} pathLength="1" stroke-dasharray={`${safe(frac, 0)} 1`} transform={`rotate(-90 ${c} ${c})`} />
    ) : null;
  return (
    <ChartFrame id={id} title={title} summary={summary} state={state} height={box} emptyText={emptyText} action={action}>
      <div class="sf-ch-ringbox" style={{ height: `${box}px` }}>
        <svg class={`sf-ch-svg${animate ? '' : ' sf-ch-still'}`} width={box} height={box} viewBox={`0 0 ${box} ${box}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
          <circle class="sf-ch-track" cx={c} cy={c} r={safe(r)} fill="none" stroke-width={stroke} />
          {arc(r, f.frac, f.frac >= 1 && f.valid ? 'sf-ch-arc sf-ch-arc-full' : 'sf-ch-arc', stroke)}
          {f.over && <circle class="sf-ch-lap" cx={c} cy={c} r={safe(size / 2 + 1)} fill="none" stroke-width={lapStroke} pathLength="1" stroke-dasharray={`${safe(f.lap, 0)} 1`} transform={`rotate(-90 ${c} ${c})`} />}
          {sec && sec.valid && r2 > 4 && (
            <g>
              <circle class="sf-ch-track" cx={c} cy={c} r={safe(r2)} fill="none" stroke-width={Math.max(2, stroke - 2)} />
              {arc(r2, sec.frac, 'sf-ch-arc2', Math.max(2, stroke - 2))}
            </g>
          )}
        </svg>
        <div class="sf-ch-ringcentre" aria-hidden="true">
          {centre ?? <span class="sf-ch-ringnum">{f.valid ? `${fmtNum(f.pct)} %` : '–'}</span>}
        </div>
      </div>
    </ChartFrame>
  );
}

export function Ring(props: RingProps) {
  return (
    <ChartBoundary title={props.title}>
      <RingBase {...props} />
    </ChartBoundary>
  );
}
