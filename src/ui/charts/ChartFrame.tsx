import { Component, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Skeleton } from '../components';

/** Props shared by every chart (CHART_KIT section 3). */
export interface ChartBase {
  title: string;
  unit?: string;
  format?: (v: number) => string;
  height?: number;
  loading?: boolean;
  emptyText?: string;
  /** The one gold button of an empty state (a caller element). */
  action?: ComponentChildren;
  summary?: string;
  animate?: boolean;
}

export interface LegendItem {
  name: string;
  colorIndex: number;
  dash?: 'solid' | 'dashed' | 'dotted';
}

let seq = 0;
export function useChartId(): string {
  const r = useRef<string>();
  if (!r.current) r.current = `sfch${++seq}`;
  return r.current;
}

/** Updates at most every 250 ms (polite live region while scrubbing). */
function useThrottled(text: string, ms = 250): string {
  const [v, setV] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setV(text), ms);
    return () => clearTimeout(id);
  }, [text, ms]);
  return v;
}

export interface FrameProps {
  id: string;
  title: string;
  summary: string;
  state: 'ok' | 'empty' | 'loading';
  height: number;
  emptyText?: string;
  action?: ComponentChildren;
  legend?: LegendItem[];
  /** Minimum legend entries before it shows (default 2). */
  legendMin?: number;
  /** Readout bubble content for the active point; null hides it. */
  readout?: { pct: number; title: string; rows: { name: string; value: string; colorIndex: number }[] } | null;
  plotProps?: Record<string, unknown>;
  children?: ComponentChildren;
}

/** Title, states, summary paragraph, legend and readout bubble around a chart's svg. */
export function ChartFrame({ id, title, summary, state, height, emptyText, action, legend, legendMin = 2, readout, plotProps, children }: FrameProps) {
  const live = useThrottled(readout ? `${readout.title}. ${readout.rows.map((r) => `${r.name} ${r.value}`).join(', ')}` : '');
  return (
    <figure class="sf-ch">
      <figcaption id={`${id}-t`} class="sf-ch-title">
        {title}
      </figcaption>
      {state === 'loading' ? (
        <div style={{ height: `${height}px` }} role="status" aria-label={t('chart.loading')}>
          <Skeleton height={`${height}px`} />
        </div>
      ) : state === 'empty' ? (
        <div class="sf-ch-empty" style={{ minHeight: `${height}px` }}>
          <span class="sf-ch-empty-line" aria-hidden="true" />
          <p class="sf-ch-empty-text">{emptyText ?? t('chart.empty')}</p>
          {action}
        </div>
      ) : (
        <div class="sf-ch-plot" style={{ height: `${height}px` }} {...plotProps}>
          {children}
          {readout && (
            <div class="sf-ch-readout" style={{ left: `${Math.min(82, Math.max(18, readout.pct))}%` }} aria-hidden="true">
              <span class="sf-ch-readout-title">{readout.title}</span>
              {readout.rows.map((r) => (
                <span class="sf-ch-readout-row" key={r.name + r.value}>
                  <i class="sf-ch-dot" style={{ background: `var(--chart-${r.colorIndex})` }} />
                  {r.name ? `${r.name} ` : ''}
                  <b>{r.value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <p id={`${id}-s`} class="sf-sr-only">
        {summary}
      </p>
      <div class="sf-sr-only" role="status" aria-live="polite" aria-label={t('chart.readout')}>
        {live}
      </div>
      {legend && legend.length >= legendMin && (
        <ul class="sf-ch-legend" aria-label={t('chart.legend')}>
          {legend.map((l) => (
            <li key={l.name}>
              <i class={`sf-ch-swatch sf-ch-dash-${l.dash ?? 'solid'}`} style={{ borderColor: `var(--chart-${l.colorIndex})` }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** One broken chart must not blank a page (CHART_KIT section 9, Error). */
export class ChartBoundary extends Component<{ title: string; children?: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  componentDidCatch() {
    this.setState({ failed: true });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <figure class="sf-ch">
        <figcaption class="sf-ch-title">{this.props.title}</figcaption>
        <div class="sf-ch-empty">
          <p class="sf-ch-empty-text">{t('chart.error')}</p>
        </div>
      </figure>
    );
  }
}
