import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation, useParams } from 'wouter-preact';
import { t } from '../../i18n';
import { Card, EmptyState, Segmented, SubPageHeader } from '../../ui/components';
import { LineChart, StatTile } from '../../ui/charts';
import { metricPoints, type ExerciseMetric } from '../../shared/progressSeries';
import { loadExercise, type ExerciseData } from '../../data/repos/progress';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ExerciseData };

const CHART: Record<ExerciseMetric, 'prog.ex.chart.weight' | 'prog.ex.chart.reps' | 'prog.ex.chart.e1rm'> = { weight: 'prog.ex.chart.weight', reps: 'prog.ex.chart.reps', e1rm: 'prog.ex.chart.e1rm' };

/** `/progress/exercise/<slug>`: weight, reps and estimated 1RM over time (one at a time), with best numbers and a plateau hint. */
export default function ExerciseProgress() {
  const slug = (useParams<{ slug: string }>().slug ?? '').toLowerCase();
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [metric, setMetric] = useState<ExerciseMetric>('e1rm');
  const read = () => {
    setLoad({ status: 'loading' });
    loadExercise(slug).then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, [slug]);
  const back = () => goBack(navigate, '/progress');

  if (load.status === 'loading') return <section class="sf-page-body sf-rt"><SubPageHeader title={t('page.progress.exercise.title')} onBack={back} backLabel={t('prog.back')} /><p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt"><SubPageHeader title={t('page.progress.exercise.title')} onBack={back} backLabel={t('prog.back')} /><EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;
  const d = load.data;
  const head = <SubPageHeader title={d.name ?? t('page.progress.exercise.title')} onBack={back} backLabel={t('prog.back')} />;
  if (d.points.length === 0) {
    return (
      <section class="sf-page-body sf-rt">
        {head}
        <EmptyState icon="barbell" title={t('prog.ex.empty.title')} hint={t('prog.ex.empty.body')} />
        <Link href={`/exercise/${d.slug}`} class="sf-pr__link">{t('prog.ex.open')}</Link>
      </section>
    );
  }
  const s = d.summary;
  const series = [{ id: metric, name: t(CHART[metric]), points: metricPoints(d.points, metric) }];
  return (
    <section class="sf-page-body sf-rt">
      {head}
      <Segmented
        label={t('prog.ex.metric')}
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'e1rm', label: t('prog.ex.e1rm') },
          { value: 'weight', label: t('prog.ex.weight') },
          { value: 'reps', label: t('prog.ex.reps') },
        ]}
      />
      <LineChart title={t(CHART[metric])} series={series} unit={metric === 'reps' ? undefined : 'kg'} emptyText={t('prog.ex.empty.chart')} />
      <div class="sf-pg__tiles">
        <StatTile label={t('prog.ex.best.weight')} value={s.bestWeight ?? '–'} {...(s.bestWeight != null ? { unit: 'kg' } : {})} />
        <StatTile label={t('prog.ex.best.e1rm')} value={s.bestE1rm ?? '–'} {...(s.bestE1rm != null ? { unit: 'kg' } : {})} />
        <StatTile label={t('prog.ex.sessions')} value={s.sessions} />
      </div>
      {d.plateau && <Card as="section" class="sf-pg__card"><p class="sf-lib__note">{t('prog.ex.plateau')}</p></Card>}
      <p class="sf-lib__note">{t('prog.ex.note')}</p>
      <Link href={`/exercise/${d.slug}`} class="sf-pr__link">{t('prog.ex.open')}</Link>
    </section>
  );
}
