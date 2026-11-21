import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Card, Chip, EmptyState, SubPageHeader } from '../../ui/components';
import { useFeature } from '../../app/flags';
import { istDayKey, type DayKey } from '../../shared/dates';
import { volumeText } from '../../shared/history';
import { lastDaysRange, recapCards, validRange, yearRange, type RecapCardKind, type RecapRange } from '../../shared/recap';
import { loadRecap, type RecapData } from '../../data/repos/recap';
import { muscleLabel } from '../exercise/muscleLabel';
import { recordText } from '../progress/prText';
import { goBack } from '../../app/navBack';

type Preset = 'year' | 'lastyear' | 'd90' | 'd30' | 'all' | 'custom';
const PRESETS: readonly Preset[] = ['year', 'lastyear', 'd90', 'd30', 'all', 'custom'];
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: RecapData };

function rangeFor(p: Preset, today: DayKey, firstDay: string | null, custom: RecapRange): RecapRange {
  const y = Number(today.slice(0, 4));
  if (p === 'year') return yearRange(y);
  if (p === 'lastyear') return yearRange(y - 1);
  if (p === 'd90') return lastDaysRange(today, 90);
  if (p === 'd30') return lastDaysRange(today, 30);
  if (p === 'all') return { from: firstDay ?? today, to: today };
  return custom;
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div class="sf-rcp__big">
      <span class="sf-rcp__num">{value}</span>
      <span class="sf-rcp__lbl">{label}</span>
    </div>
  );
}

function CardBody({ kind, data }: { kind: RecapCardKind; data: RecapData }) {
  const s = data.stats;
  const name = (slug: string) => data.names[slug] ?? slug;
  switch (kind) {
    case 'totals':
      return (
        <>
          <h2 class="sf-rcp__h">{t('yr.totals')}</h2>
          <Big value={String(s.sessions)} label={t(s.sessions === 1 ? 'yr.sessions.one' : 'yr.sessions.many')} />
          <Big value={s.workingSets.toLocaleString('en-IN')} label={t('yr.sets')} />
          <Big value={volumeText(s.volume)} label={t('yr.volume')} />
        </>
      );
    case 'heaviest':
      return s.heaviest ? (
        <>
          <h2 class="sf-rcp__h">{t('yr.heaviest')}</h2>
          <Big value={recordText('weight', s.heaviest.kg)} label={name(s.heaviest.slug)} />
          <p class="sf-rt__meta">{s.heaviest.day}</p>
        </>
      ) : null;
    case 'muscles':
      return s.mostTrained ? (
        <>
          <h2 class="sf-rcp__h">{t('yr.muscles')}</h2>
          <Big value={muscleLabel(s.mostTrained.id)} label={t('yr.most', { n: s.mostTrained.sets })} />
          {s.leastTrained && <Big value={muscleLabel(s.leastTrained.id)} label={t('yr.least', { n: s.leastTrained.sets })} />}
        </>
      ) : null;
    case 'streak':
      return (
        <>
          <h2 class="sf-rcp__h">{t('yr.streak')}</h2>
          <Big value={String(s.longestStreakDays)} label={t(s.longestStreakDays === 1 ? 'yr.streak.one' : 'yr.streak.many')} />
          <p class="sf-rt__meta">{t('yr.streak.note')}</p>
        </>
      );
    case 'favourite':
      return s.favourite ? (
        <>
          <h2 class="sf-rcp__h">{t('yr.fav')}</h2>
          <Big value={name(s.favourite.slug)} label={t('yr.fav.in', { n: s.favourite.sessions })} />
          <Link href={`/exercise/${s.favourite.slug}`} class="sf-pr__link">{t('yr.open')}</Link>
        </>
      ) : null;
    case 'pr':
      return s.biggestPr ? (
        <>
          <h2 class="sf-rcp__h">{t('yr.pr')}</h2>
          <Big value={recordText('weight', s.biggestPr.value)} label={name(s.biggestPr.slug)} />
          <p class="sf-rt__meta">{t('yr.pr.was', { prev: recordText('weight', s.biggestPr.previous), day: s.biggestPr.day })}</p>
        </>
      ) : null;
  }
}

/** `/progress/recap`: swipeable year-in-review cards for a year, the last 30 / 90 days, all time or any two dates. Everything is read on this phone. */
export default function RecapPage() {
  const [, navigate] = useLocation();
  const on = useFeature('year_review');
  const today = istDayKey(Date.now());
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState<RecapRange>({ from: `${today.slice(0, 4)}-01-01`, to: today });
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [first, setFirst] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const range = rangeFor(preset, today, first, custom);
  const bad = !validRange(range);
  const key = `${range.from}|${range.to}`;
  const read = () => {
    if (bad) return;
    setLoad({ status: 'loading' });
    loadRecap(range).then(
      (data) => {
        setFirst(data.firstDay);
        setLoad({ status: 'ready', data });
        setIdx(0);
        track.current?.scrollTo?.({ left: 0 });
      },
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(read, [key]);

  const head = <SubPageHeader title={t('page.recap.title')} onBack={() => goBack(navigate, '/progress')} backLabel={t('prog.back')} />;
  if (!on) return <section class="sf-page-body sf-rt">{head}<EmptyState icon="info" title={t('yr.off')} /></section>;

  const cards = load.status === 'ready' ? recapCards(load.data.stats) : [];
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(cards.length - 1, i));
    el.scrollTo?.({ left: n * el.clientWidth, behavior: 'smooth' });
    setIdx(n);
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <section class="sf-page-body sf-rt sf-rcp">
      {head}
      <div class="sf-rt__chips" role="group" aria-label={t('yr.range')}>
        {PRESETS.map((p) => (
          <Chip key={p} selected={preset === p} onPress={() => setPreset(p)}>{t(`yr.range.${p}` as StringKey)}</Chip>
        ))}
      </div>
      {preset === 'custom' && (
        <div class="sf-rcp__dates">
          <div class="sf-rt">
            <label class="sf-lib__note" for="yr-from">{t('yr.from')}</label>
            <input id="yr-from" type="date" class="sf-input" value={custom.from} max={custom.to} onInput={(e) => setCustom({ ...custom, from: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="sf-rt">
            <label class="sf-lib__note" for="yr-to">{t('yr.to')}</label>
            <input id="yr-to" type="date" class="sf-input" value={custom.to} min={custom.from} onInput={(e) => setCustom({ ...custom, to: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
      )}
      {bad && <p class="sf-lib__note" role="alert">{t('yr.range.bad')}</p>}
      {!bad && load.status === 'loading' && <p class="sf-lib__note" role="status">{t('yr.loading')}</p>}
      {!bad && load.status === 'error' && <EmptyState icon="warning" title={t('yr.error')} actionLabel={t('rb.error.retry')} onAction={read} />}
      {!bad && load.status === 'ready' && cards.length === 0 && <EmptyState icon="barbell" title={t('yr.empty.title')} hint={t('yr.empty.body')} />}
      {!bad && load.status === 'ready' && cards.length > 0 && (
        <>
          <p class="sf-rt__meta">{range.from} → {range.to}</p>
          <div class="sf-rcp__track" ref={track} onScroll={onScroll} role="region" aria-roledescription="carousel" aria-label={t('page.recap.title')} tabIndex={0}>
            {cards.map((k, i) => (
              <Card as="article" key={k} class="sf-rcp__card" aria-label={t('yr.card.of', { n: i + 1, total: cards.length })}>
                <CardBody kind={k} data={load.data} />
              </Card>
            ))}
          </div>
          <div class="sf-rcp__nav">
            <Button variant="secondary" disabled={idx <= 0} onPress={() => go(idx - 1)}>{t('yr.prev')}</Button>
            <span class="sf-rt__meta" role="status">{t('yr.card.of', { n: idx + 1, total: cards.length })}</span>
            <Button variant="secondary" disabled={idx >= cards.length - 1} onPress={() => go(idx + 1)}>{t('yr.next')}</Button>
          </div>
        </>
      )}
    </section>
  );
}
