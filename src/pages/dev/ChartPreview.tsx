import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Segmented } from '../../ui/components';
import { AreaChart, BarChart, Gauge, HeatGrid, LineChart, Ring, Sparkline, StackedBar, StatTile, type BarDatum, type Series } from '../../ui/charts';
import { addDays } from '../../shared/dates';

/** Chart kit preview (dev only). Made-up numbers; nothing here is stored. */
const START = '2026-08-03';
const WEIGHT = [82.4, 82.1, 82.3, 81.8, 81.6, 81.9, 81.2, 81.0, 80.8, 81.1, 80.6, 80.4];
const E1RM = [92, 94, 95, 95, 98, 97, 100, 102, 101, 104, 106, 108];
const day = (i: number) => addDays(START, i * 7);
const HEAT = Array.from({ length: 84 }, (_, i) => ({ day: addDays('2026-08-24', i), value: i % 7 === 6 ? 0 : i % 3 === 0 ? 2 : i % 5 === 0 ? 0 : 1 }));

export default function ChartPreview() {
  const [metric, setMetric] = useState<'e1rm' | 'weight'>('e1rm');
  const weight: Series = { id: 'w', name: 'Body weight', points: WEIGHT.map((y, i) => ({ x: day(i), y })) };
  const e1: Series = { id: 'e', name: 'Estimated 1RM', points: E1RM.map((y, i) => ({ x: day(i), y: i === 5 ? null : y })) };
  const top: Series = { id: 'r', name: 'Top set', points: E1RM.map((y, i) => ({ x: day(i), y: Math.round(y * 0.85) })), dash: 'dashed' };
  const bars: BarDatum[] = [12000, 14500, 9800, 15800, 16200, 0, 13400, 17100].map((y, i) => ({ x: `W${i + 1}`, y, label: `Week ${i + 1}` }));
  return (
    <>
      <h2 class="sf-preview-h">{t('preview.charts')}</h2>
      <Segmented
        label={t('preview.charts.line')}
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'e1rm', label: 'e1RM' },
          { value: 'weight', label: 'Weight' },
        ]}
      />
      {metric === 'e1rm' ? (
        <LineChart title={t('preview.charts.line')} series={[e1, top]} unit="kg" />
      ) : (
        <LineChart title={t('preview.charts.line')} series={[weight]} unit="kg" target={80} />
      )}
      <AreaChart title={t('preview.charts.area')} series={[weight]} unit="kg" />
      <BarChart title={t('preview.charts.bar')} data={bars} unit="kg" target={15000} />
      <LineChart title={t('preview.charts.states')} series={[{ id: 'a', name: 'None', points: [] }]} />
      <LineChart title={t('preview.charts.states')} series={[{ id: 'b', name: 'One', points: [{ x: START, y: 80 }] }]} unit="kg" height={120} />
      <LineChart title={t('preview.charts.states')} series={[{ id: 'c', name: 'Flat', points: [0, 1, 2].map((i) => ({ x: day(i), y: 80 })) }]} unit="kg" height={120} />
      <h2 class="sf-preview-h">{t('preview.charts.spark')}</h2>
      <Sparkline values={E1RM} fill />
      <Sparkline values={[5, 5, 5]} />
      <h2 class="sf-preview-h">{t('preview.charts.ring')}</h2>
      <Ring title={t('preview.charts.ring')} value={2} max={3} centre={<span class="sf-ch-ringnum">2 / 3</span>} size={96} />
      <Ring title={t('preview.charts.ring2')} value={120} max={100} secondary={{ value: 60, max: 100, name: 'Last week' }} size={96} />
      <Ring title={t('preview.charts.ring2')} value={0} max={100} />
      <Ring title={t('preview.charts.ring2')} value={5} max={0} />
      <h2 class="sf-preview-h">{t('preview.charts.gauge')}</h2>
      <Gauge title={t('preview.charts.gauge')} value={62} min={0} max={100} marks={[25, 50, 75]} unit="kg" />
      <h2 class="sf-preview-h">{t('preview.charts.heat')}</h2>
      <HeatGrid title={t('preview.charts.heat')} cells={HEAT} from="2026-08-24" to="2026-11-15" format={(v) => `${v} sessions`} />
      <h2 class="sf-preview-h">{t('preview.charts.stat')}</h2>
      <StatTile label="Sessions this month" value={14} delta={{ value: 4, goodWhen: 'up', label: 'vs last month' }} spark={[3, 5, 4, 6, 8, 7, 9]} />
      <StatTile label="Volume" value={128450} unit="kg" large delta={{ value: -2.5, goodWhen: 'up' }} />
      <StatTile label="Streak" value="3 wk" />
      <h2 class="sf-preview-h">{t('preview.charts.stack')}</h2>
      <StackedBar
        title={t('preview.charts.stack')}
        mode="percent"
        rows={[
          { label: 'Push / pull', parts: [{ id: 'push', name: 'Push', value: 62 }, { id: 'pull', name: 'Pull', value: 38 }] },
          { label: 'Legs', parts: [{ id: 'push', name: 'Push', value: 0 }, { id: 'pull', name: 'Pull', value: 0 }] },
        ]}
      />
      <StackedBar
        title={t('preview.charts.stack2')}
        orientation="vertical"
        unit="sets"
        rows={[
          { label: 'Mon', parts: [{ id: 'a', name: 'Chest', value: 8 }, { id: 'b', name: 'Back', value: 6 }, { id: 'c', name: 'Legs', value: 4 }] },
          { label: 'Wed', parts: [{ id: 'a', name: 'Chest', value: 3 }, { id: 'b', name: 'Back', value: 9 }] },
          { label: 'Fri', parts: [{ id: 'c', name: 'Legs', value: 12 }] },
        ]}
      />
    </>
  );
}
