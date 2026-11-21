import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Card, Chip, EmptyState, SubPageHeader } from '../../ui/components';
import { BarChart, HeatGrid, Ring, StatTile, type BarDatum } from '../../ui/charts';
import { useFeature } from '../../app/flags';
import { dayLabel } from '../../shared/chartMath';
import { loadHub, writeOwnTarget, type HubData } from '../../data/repos/progress';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: HubData };

const TARGETS = [1, 2, 3, 4, 5, 6, 7] as const;

function WeekCard({ data, onTarget }: { data: HubData; onTarget: (n: number | null) => void }) {
  const c = data.consistency;
  const left = Math.max(0, c.target - c.thisWeek);
  return (
    <Card as="section" class="sf-pg__card" aria-label={t('prog.week.title')}>
      <h2 class="sf-pg__h">{t('prog.week.title')}</h2>
      <div class="sf-pg__week">
        <Ring
          title={t('prog.week.of', { n: c.thisWeek, target: c.target })}
          value={c.thisWeek}
          max={c.target}
          size={96}
          format={(v) => String(Math.round(v))}
          summary={t('prog.week.of', { n: c.thisWeek, target: c.target })}
          centre={<span class="sf-ch-ringnum">{t('prog.week.centre', { n: c.thisWeek, target: c.target })}</span>}
        />
        <StatTile label={t('prog.streak.label')} value={c.streak} />
      </div>
      <p class="sf-rt__meta">{c.keptNow ? t('prog.week.kept') : t('prog.week.left', { n: left })}</p>
      {c.graceUsed && <p class="sf-rt__meta">{t('prog.streak.grace')}</p>}
      <p class="sf-lib__note">{t('prog.streak.note')}</p>
      <h3 class="sf-pg__h3">{t('prog.target.title')}</h3>
      <div class="sf-rt__chips" role="group" aria-label={t('prog.target.title')}>
        <Chip selected={data.ownTarget === null} onPress={() => onTarget(null)}>{t('prog.target.auto')}</Chip>
        {TARGETS.map((n) => (
          <Chip key={n} selected={data.ownTarget === n} onPress={() => onTarget(n)}>{t('prog.target.n', { n })}</Chip>
        ))}
      </div>
    </Card>
  );
}

/** `/progress`: this week's ring and streak, 12 weeks of volume, the training-day grid, plateau hints and a list of exercises to open. */
export default function ProgressHub() {
  const [, navigate] = useLocation();
  const streaksOn = useFeature('streaks');
  const recapOn = useFeature('year_review');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const read = () => {
    setLoad({ status: 'loading' });
    loadHub().then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);
  const setTarget = (n: number | null) => {
    writeOwnTarget(n).then(read, read);
  };
  const head = <SubPageHeader title={t('page.progress.title')} onBack={() => goBack(navigate, '/train')} backLabel={t('prog.back')} />;

  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;
  const d = load.data;
  const bars: BarDatum[] = d.weeks.map((w, i) => ({ x: dayLabel(w.weekStart, t, 'short'), y: w.volume, label: dayLabel(w.weekStart, t, 'full'), highlight: i === d.topWeek }));
  const plateau = d.rows.filter((r) => r.plateau);
  return (
    <section class="sf-page-body sf-rt">
      {head}
      {!d.hasSessions && <EmptyState icon="barbell" title={t('prog.empty.title')} hint={t('prog.empty.body')} />}
      {streaksOn && <WeekCard data={d} onTarget={setTarget} />}
      {d.hasSessions && (
        <>
          <BarChart title={t('prog.volume.title')} data={bars} unit="kg" emptyText={t('prog.volume.empty')} />
          <HeatGrid title={t('prog.grid.title')} cells={d.cells} from={d.range.from} to={d.range.to} today={d.today} emptyText={t('prog.grid.empty')} />
          {plateau.length > 0 && (
            <Card as="section" class="sf-pg__card">
              <h2 class="sf-pg__h">{t('prog.plateau.title')}</h2>
              <p class="sf-lib__note">{t('prog.plateau.note')}</p>
              <ul class="sf-pg__list">
                {plateau.map((r) => (
                  <li key={r.slug}><Link href={r.href} class="sf-pr__link">{r.name}</Link></li>
                ))}
              </ul>
            </Card>
          )}
          <h2 class="sf-pg__h">{t('prog.list.title')}</h2>
          <ul class="sf-pg__list">
            {d.rows.map((r) => (
              <li key={r.slug} class="sf-pg__row">
                <Link href={r.href} class="sf-pr__link">{r.name}</Link>
                <span class="sf-rt__meta">{t('prog.list.meta', { n: r.sessions, date: r.lastDay })}{r.plateau ? ` · ${t('prog.list.plateau')}` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="sf-pg__links">
        <Link href="/progress/body" class="sf-pr__link">{t('prog.links.body')}</Link>
        <Link href="/goals" class="sf-pr__link">{t('prog.links.goals')}</Link>
        <Link href="/intake" class="sf-pr__link">{t('prog.links.intake')}</Link>
        <Link href="/progress/photos" class="sf-pr__link">{t('prog.links.photos')}</Link>
        <Link href="/progress/records" class="sf-pr__link">{t('prog.links.records')}</Link>
        <Link href="/history" class="sf-pr__link">{t('prog.links.history')}</Link>
        {recapOn && <Link href="/progress/recap" class="sf-pr__link">{t('yr.link')}</Link>}
      </div>
    </section>
  );
}
