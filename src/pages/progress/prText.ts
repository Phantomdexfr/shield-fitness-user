import { t } from '../../i18n';
import type { PRHit, PRMetric } from '../../shared/pr';

/** Number text for a record: kg with up to 2 decimals, reps as a whole number, e1RM to the nearest 0.5. */
export function recordText(metric: PRMetric, value: number): string {
  if (metric === 'reps') return t('pr.value.reps', { n: String(value) });
  const shown = metric === 'e1rm' ? Math.round(value * 2) / 2 : value;
  return t('pr.value.kg', { n: String(shown) });
}

/** One line for the logger toast and the session summary (Phases 38 and 39 call this). */
export function prToastText(hit: PRHit): string {
  const value = recordText(hit.metric, hit.value);
  if (hit.previous == null) return t('pr.toast.first', { value });
  return t(`pr.toast.${hit.metric}` as const, { value, previous: recordText(hit.metric, hit.previous) });
}
