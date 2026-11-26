import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { countUpValue, deltaInfo, fmtNum, summaryFor2 } from '../../shared/chartMath';
import { useFx } from '../components/Feedback';
import { Sparkline } from './Sparkline';

export interface StatTileProps {
  label: string;
  value: number | string;
  unit?: string;
  format?: (n: number) => string;
  delta?: { value: number; goodWhen: 'up' | 'down' | 'any'; /** shown after the number, default `%` */ unit?: string; /** for example "vs last week" */ label?: string };
  spark?: number[];
  countUp?: boolean;
  large?: boolean;
  /** A link target; the tile never expands. */
  href?: string;
}

const COUNT_MS = 600;

/** Counts a number up once per view (final frame = exact `format(value)`); a text value is shown as it is. Phase 104: a later change of the
 *  number (a refresh, a re-read) is shown at once and never counts again; Premium also obeys the in-app Motion setting. */
function useCountUp(value: number | string, on: boolean, label: string): number | null {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const play = useFx(`count:${label}`, on && target !== null && typeof requestAnimationFrame === 'function', target === null);
  const done = useRef(false);
  const [shown, setShown] = useState<number | null>(target === null ? null : play ? 0 : target);
  useEffect(() => {
    if (target === null) {
      setShown(null);
      return;
    }
    if (!play || done.current) {
      setShown(target);
      return;
    }
    done.current = true;
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / COUNT_MS);
      setShown(countUpValue(target, p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, play]);
  return shown;
}

export function StatTile({ label, value, unit, format, delta, spark, countUp = true, large, href }: StatTileProps) {
  const fmt = format ?? fmtNum;
  const shown = useCountUp(value, countUp, label);
  const isNum = typeof value === 'number';
  const finalText = isNum ? (Number.isFinite(value) ? fmt(value) : '–') : String(value);
  const text = isNum ? (shown === null ? '–' : fmt(shown)) : finalText;
  const d = delta ? deltaInfo(delta.value, delta.goodWhen) : null;
  const dUnit = delta?.unit ?? '%';
  const deltaText = d && delta ? `${delta.value > 0 ? '+' : delta.value < 0 ? '-' : ''}${fmtNum(Math.abs(delta.value))}${dUnit === '%' ? ' %' : ` ${dUnit}`}${delta.label ? ` ${delta.label}` : ''}` : undefined;
  const summary = summaryFor2({ kind: 'stat', label, value: finalText, unit: isNum && Number.isFinite(value) ? unit : undefined, deltaText }, fmt, t);
  const body = (
    <>
      <span class="sf-ch-stat-label">{label}</span>
      <span class={`sf-ch-stat-row${large ? ' sf-ch-stat-large' : ''}`} aria-hidden="true">
        <span class="sf-ch-stat-num">{text}</span>
        {unit && isNum && Number.isFinite(value) && <span class="sf-ch-stat-unit">{unit}</span>}
      </span>
      {d && deltaText && (
        <span class={`sf-ch-stat-delta${d.good ? ' sf-ch-stat-good' : ''}`} aria-hidden="true">
          <i class={`sf-ch-arrow sf-ch-arrow-${d.dir}`} />
          {deltaText}
        </span>
      )}
      {spark && spark.length > 0 && <Sparkline values={spark} height={28} />}
      <span class="sf-sr-only">{summary}</span>
    </>
  );
  return href ? (
    <a class="sf-ch-stat sf-ch-stat-link" href={href}>
      {body}
    </a>
  ) : (
    <div class="sf-ch-stat" role="group">
      {body}
    </div>
  );
}
