import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { fmtNum, safe, stackLayout, summaryFor2, type StackPartIn } from '../../shared/chartMath';
import { tick } from '../components/haptics';
import { prefersReducedMotion } from '../components/motion';
import { ChartBoundary, ChartFrame, useChartId, type ChartBase, type LegendItem } from './ChartFrame';
import { useWidth } from './useScrub';

export interface StackedPart extends StackPartIn {}
export interface StackedBarProps extends ChartBase {
  rows: { label: string; parts: StackedPart[] }[];
  mode?: 'absolute' | 'percent';
  orientation?: 'horizontal' | 'vertical';
}

const MAX_VERTICAL = 8;
const ROW_H = 76;
const INSIDE_PAD = 10;

function StackBase(props: StackedBarProps) {
  const { title, loading, emptyText, action } = props;
  const mode = props.mode ?? 'absolute';
  const id = useChartId();
  const fmt = props.format ?? fmtNum;
  const animate = props.animate !== false && !prefersReducedMotion();
  const [sel, setSel] = useState<{ r: number; s: number } | null>(null);
  const [boxRef, W] = useWidth<HTMLDivElement>();
  const vertical = props.orientation === 'vertical' && props.rows.length <= MAX_VERTICAL;
  const lay = stackLayout(props.rows, mode);
  const empty = lay.rows.length === 0 || lay.rows.every((r) => r.total <= 0);
  const state = loading ? 'loading' : lay.rows.length === 0 ? 'empty' : 'ok';
  const summary = props.summary ?? summaryFor2({ kind: 'stack', title, rows: lay.rows, mode }, fmt, t);
  const height = vertical ? Math.max(120, props.height ?? 180) : Math.max(60, lay.rows.length * ROW_H);

  // legend: every part once (by id, first name and colour seen); a single row also lists its values
  const seen = new Map<string, LegendItem & { v: number; p: number }>();
  for (const r of lay.rows) for (const s of r.segs) if (!seen.has(s.id)) seen.set(s.id, { name: s.name, colorIndex: s.colorIndex, v: s.value, p: s.pct });
  const single = lay.rows.length === 1;
  const legend: LegendItem[] = [...seen.values()].map((l) => ({ name: single ? `${l.name} ${mode === 'percent' ? `${l.p} %` : fmt(l.v)}` : l.name, colorIndex: l.colorIndex }));

  const pickSeg = (r: number, s: number) => {
    if (sel?.r !== r || sel?.s !== s) tick();
    setSel(sel && sel.r === r && sel.s === s ? null : { r, s });
  };
  const selSeg = sel ? lay.rows[sel.r]?.segs[sel.s] : undefined;
  const info = sel && selSeg ? `${lay.rows[sel.r]!.label}: ${selSeg.name} ${fmt(selSeg.value)} (${selSeg.pct} %)` : '';
  const trackW = Math.max(40, W);

  const seg = (r: number, s: number) => {
    const row = lay.rows[r]!;
    const g = row.segs[s]!;
    const px = g.size * trackW;
    const text = mode === 'percent' ? `${g.pct} %` : fmt(g.value);
    const showText = !vertical && px >= 48 && text.length * 7 + INSIDE_PAD <= px;
    return (
      <button
        type="button"
        key={g.id}
        class={`sf-ch-seg${sel && sel.r === r && sel.s === s ? ' sf-ch-seg-on' : ''}${animate ? ' sf-ch-seg-in' : ''}`}
        style={{ [vertical ? 'height' : 'width']: `${safe(g.size * 100)}%`, background: `var(--chart-${g.colorIndex})` }}
        aria-pressed={sel?.r === r && sel?.s === s}
        aria-label={`${row.label}: ${g.name} ${fmt(g.value)} (${g.pct} %)`}
        onClick={() => pickSeg(r, s)}
      >
        {showText && <span class="sf-ch-seg-text">{text}</span>}
      </button>
    );
  };

  return (
    <ChartFrame id={id} title={title} summary={summary} state={state} height={height} emptyText={emptyText} action={action} legend={legend}>
      <div class={`sf-ch-stack${vertical ? ' sf-ch-stack-v' : ''}`} ref={boxRef} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`} style={{ height: `${height}px` }}>
        {lay.rows.map((row, r) => (
          <div class="sf-ch-stack-row" key={r}>
            {vertical ? (
              <>
                <div class="sf-ch-track-v">{!empty && row.total > 0 ? row.segs.map((_, s) => seg(r, s)) : null}</div>
                <span class="sf-ch-stack-label">{row.label}</span>
              </>
            ) : (
              <>
                <span class="sf-ch-stack-label">{row.label}</span>
                <div class="sf-ch-track-h">{row.total > 0 ? row.segs.map((_, s) => seg(r, s)) : null}</div>
              </>
            )}
          </div>
        ))}
      </div>
      {info && (
        <p class="sf-ch-stack-info" aria-hidden="true">
          {info}
        </p>
      )}
    </ChartFrame>
  );
}

export function StackedBar(props: StackedBarProps) {
  return (
    <ChartBoundary title={props.title}>
      <StackBase {...props} />
    </ChartBoundary>
  );
}
