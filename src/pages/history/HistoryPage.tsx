import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, Collapsible, EmptyState, SubPageHeader } from '../../ui/components';
import { loadFinished } from '../../data/repos/history';
import { readBodyKg } from '../../data/repos/body';
import { countByDay, groupByDay, monthGrid, monthOfDay, shiftMonth, summaryOf, volumeText } from '../../shared/history';
import { formatIst, istDayKey, parseIso, type DayKey } from '../../shared/dates';
import type { Session } from '../../shared/session';
import { dayLabel, monthLabel } from './dayText';
import { useFeature } from '../../app/flags';
import { RangeSheet } from '../aiReview/RangeSheet';
import { AiReviewSheet } from '../aiReview/AiReviewSheet';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; sessions: Session[] };

function Entry({ s, bodyKg, onOpen }: { s: Session; bodyKg: number; onOpen: () => void }) {
  const st = summaryOf(s, bodyKg);
  const at = parseIso(s.startedAt);
  return (
    <button type="button" class="sf-hs__item" onClick={onOpen}>
      <span class="sf-hs__item-title">{s.dayName ?? t('hs.free')}</span>
      <span class="sf-rt__meta">{at !== null ? formatIst(at).slice(11) : ''}</span>
      <span class="sf-rt__meta">{st.workingSets === 0 ? t('hs.line.none') : t('hs.line', { n: st.exercises, volume: volumeText(st.volume), min: st.minutes })}</span>
    </button>
  );
}

/** `/history`: a month calendar with a dot on every day you trained, and the list of workouts below (tap a day to filter). */
export default function HistoryPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [bodyKg, setBodyKg] = useState(70);
  useEffect(() => { void readBodyKg().then(setBodyKg).catch(() => undefined); }, []);
  const [month, setMonth] = useState(() => monthOfDay(istDayKey(Date.now())));
  const [picked, setPicked] = useState<DayKey | null>(null);
  const aiOn = useFeature('ai_review_export');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [aiRange, setAiRange] = useState<{ from: DayKey; to: DayKey } | null>(null);

  const read = () => {
    setLoad({ status: 'loading' });
    loadFinished().then((sessions) => setLoad({ status: 'ready', sessions }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);

  const sessions = load.status === 'ready' ? load.sessions : [];
  const counts = useMemo(() => countByDay(sessions), [load]);
  const groups = useMemo(() => groupByDay(sessions), [load]);
  const grid = useMemo(() => monthGrid(month, counts), [month, counts]);

  const back = () => goBack(navigate, '/train');
  const head = <SubPageHeader title={t('page.history.title')} onBack={back} backLabel={t('sm.back')} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('hs.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('hs.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;
  if (sessions.length === 0) return <section class="sf-page-body sf-rt">{head}<EmptyState icon="barbell" title={t('hs.empty.title')} hint={t('hs.empty.body')} /></section>;

  const shown = picked ? groups.filter((g) => g.day === picked) : groups;
  return (
    <section class="sf-page-body sf-rt">
      {head}
      <Collapsible id="calendar" title={t('ux.calendar')} summary={monthLabel(month)}>
      <div class="sf-hs__month">
        <Button variant="secondary" aria-label={t('hs.prev')} onPress={() => setMonth(shiftMonth(month, -1))}>{'<'}</Button>
        <h2 class="sf-hs__month-name" role="status">{monthLabel(month)}</h2>
        <Button variant="secondary" aria-label={t('hs.next')} onPress={() => setMonth(shiftMonth(month, 1))}>{'>'}</Button>
      </div>
      <div class="sf-hs__grid" role="grid">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} class="sf-hs__wd" role="columnheader">{t(`hs.wd.${i}` as StringKey)}</span>)}
        {grid.flat().map((c, i) =>
          c.day === null ? (
            <span key={`b${i}`} class="sf-hs__cell sf-hs__cell--blank" aria-hidden="true" />
          ) : (
            <button
              key={c.day}
              type="button"
              class="sf-hs__cell"
              aria-pressed={picked === c.day}
              aria-label={c.count > 0 ? t('hs.cell', { day: dayLabel(c.day), n: c.count }) : t('hs.cell.none', { day: dayLabel(c.day) })}
              onClick={() => setPicked(picked === c.day ? null : (c.day as DayKey))}
            >
              <span>{c.n}</span>
              {c.count > 0 && <span class="sf-hs__dot" aria-hidden="true" />}
            </button>
          ),
        )}
      </div>
      </Collapsible>
      {picked && (
        <div class="sf-rt__row">
          <span class="sf-rt__meta" role="status">{t('hs.showing', { day: dayLabel(picked) })}</span>
          <Chip onPress={() => setPicked(null)}>{t('hs.clear')}</Chip>
        </div>
      )}
      {aiOn && <Button variant="secondary" onPress={() => setRangeOpen(true)}>{t('ai.btn.period')}</Button>}
      <div class="sf-hs__list">
        {shown.length === 0 && <p class="sf-lib__note">{t('hs.none.day')}</p>}
        {shown.map((g) => (
          <div key={g.day} class="sf-hs__list">
            <h3 class="sf-hs__day">{dayLabel(g.day)}</h3>
            {g.sessions.map((s) => <Entry key={s.id} s={s} bodyKg={bodyKg} onOpen={() => navigate(`/history/${s.id}`)} />)}
          </div>
        ))}
      </div>
      {aiOn && <RangeSheet open={rangeOpen} onClose={() => setRangeOpen(false)} onPick={(from, to) => { setRangeOpen(false); setAiRange({ from, to }); }} />}
      {aiOn && aiRange && <AiReviewSheet open scope={{ kind: 'range', from: aiRange.from, to: aiRange.to }} title={t('ai.range.title')} onClose={() => setAiRange(null)} />}
    </section>
  );
}
