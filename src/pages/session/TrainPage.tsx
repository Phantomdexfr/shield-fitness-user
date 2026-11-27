import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { relayAvailable } from '../../data/relay/client';
import { Badge, Button, Card, Collapsible, EmptyState, HeroCard, Row, RowGroup, Segmented } from '../../ui/components';
import { setUxSwitch } from '../../data/repos/ux';
import { useUx } from '../../ui/useUx';
import { activeRoutine, readState } from '../../data/repos/schedule';
import { listSessions } from '../../data/repos/sessions';
import { estimateMinutes } from '../../shared/routineEdit';
import { istDayKey } from '../../shared/dates';
import { doneHoursAgo, lastFinished, openSession, type Session } from '../../shared/session';
import type { Routine } from '../../shared/routine';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; routine?: Routine; pointer: number; sessions: Session[]; picks?: Record<string, string> };

/** `/train`: resume an open workout, start today's suggested day, any other day, a free session or the last one again. */
export default function TrainPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const shareOn = useFeature('plan_share') && relayAvailable();
  const premium = useUx('layout') === 'premium';

  const read = () => {
    setLoad({ status: 'loading' });
    Promise.all([listSessions(), activeRoutine()]).then(
      async ([sessions, routine]) => {
        const st = routine ? await readState(routine.id) : undefined;
        setLoad({ status: 'ready', sessions, routine, pointer: st ? st.pointer : 0, ...(st?.dayPicks ? { picks: st.dayPicks } : {}) });
      },
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(read, []);

  const title = <h1 class="sf-page-title">{t('page.train.title')}</h1>;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{title}<p class="sf-lib__note" role="status">{t('fs.train.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{title}<EmptyState icon="warning" title={t('fs.train.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;

  const { routine, sessions } = load;
  const open = openSession(sessions);
  const last = lastFinished(sessions);
  const todayKey = istDayKey(Date.now());
  const doneToday = sessions.filter((x) => x.endedAt && istDayKey(Date.parse(x.startedAt)) === todayKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const days = routine?.days ?? [];
  // Phase 114: a Day picked for today (Week view -> a date -> "Do this Day") is the suggested one.
  const pickedIx = days.findIndex((d) => d.id === load.picks?.[todayKey]);
  const suggested = days.length > 0 ? (pickedIx >= 0 ? pickedIx : load.pointer % days.length) : -1;
  const now = Date.now();
  const start = (dayId: string) => navigate(`/session/new?routine=${routine!.id}&day=${dayId}`);
  const ago = (dayId: string) => {
    const h = doneHoursAgo(sessions, dayId, now);
    return h === undefined ? '' : h === 0 ? t('fs.train.doneago0') : t('fs.train.doneago', { n: h });
  };

  const dayItem = (d: Routine['days'][number], i: number) => (
    <li key={d.id} class="sf-rt__item">
      <div class="sf-rt__card sf-db__text">
        <span class="sf-rt__name">{d.name}</span>
        <span class="sf-rt__meta">{`${d.items.length} · ${estimateMinutes(d.items)} min`}</span>
        {ago(d.id) && <span class="sf-rt__meta">{ago(d.id)}</span>}
        {i === suggested && <Badge tone="gold">{doneToday ? t('fs.train.next') : t('fs.train.suggested')}</Badge>}
      </div>
      <Button variant={i === suggested && !open && !doneToday ? 'primary' : 'secondary'} aria-label={t('fs.train.start', { day: d.name })} onPress={() => start(d.id)}>{t('fs.train.start', { day: d.name })}</Button>
    </li>
  );

  const lastRow = last ? (
    <RowGroup label={t('tr.last')}>
      <Row label={last.dayName || t('fs.train.free')} value={istDayKey(Date.parse(last.startedAt))} href="/history" />
    </RowGroup>
  ) : null;

  return (
    <section class="sf-page-body sf-rt">
      {title}
      {open && (
        <Card tone="gold" class="sf-rt__hint">
          <p class="sf-rt__hint-text">{t('fs.progress.title')}{open.dayName ? `: ${open.dayName}` : ''}</p>
          <Button onPress={() => navigate(`/session/${open.id}`)}>{t('fs.resume')}</Button>
        </Card>
      )}

      {doneToday && !open && (
        <Card tone="gold" class="sf-rt__hint" data-hook="train-done">
          <p class="sf-rt__hint-text">{t('sc.done.name')}{doneToday.dayName ? `: ${doneToday.dayName}` : ''}</p>
          <p class="sf-rt__meta">{t('sc.done.line')}</p>
        </Card>
      )}

      {premium ? (
        <>
          {/* Premium layout: ONE hero card holds what to do next (a free session when there is no routine), so the tab is never blank. */}
          {!open && !doneToday && (
            <HeroCard class="sf-tr__hero">
              {routine && days.length > 0 ? (
                <>
                  <h2 class="sf-sec__label">{routine.name}</h2>
                  <ul class="sf-rt__list">{days.map((d, i) => (i === suggested ? dayItem(d, i) : null))}</ul>
                </>
              ) : (
                <>
                  <p class="sf-rt__meta">{t('fs.train.none')}</p>
                  <Button onPress={() => navigate('/session/new?free=1')}>{t('fs.train.free')}</Button>
                </>
              )}
            </HeroCard>
          )}
          {(open || doneToday) && routine && days.length > 0 && (
            <div class="sf-rt__block">
              <h2 class="sf-sec__label">{routine.name}</h2>
              <ul class="sf-rt__list">{days.map((d, i) => (i === suggested ? dayItem(d, i) : null))}</ul>
            </div>
          )}
          {routine && days.length > 1 && (
            <Collapsible id="days" title={t('ux.days')} summary={String(days.length - 1)}>
              <ul class="sf-rt__list">{days.map((d, i) => (i === suggested ? null : dayItem(d, i)))}</ul>
            </Collapsible>
          )}
          {lastRow}
          <RowGroup label={t('tr.ways')}>
            {routine && days.length > 0 && <Row label={t('fs.train.free')} onPress={() => navigate('/session/new?free=1')} />}
            {last && <Row label={t('fs.train.repeat')} onPress={() => navigate('/session/new?repeat=1')} />}
            {shareOn && <Row label={t('ps.recv.open')} onPress={() => navigate('/share')} />}
            <Row label={t('fs.train.routines')} href="/routines" />
            <Row label={t('fs.train.history')} href="/history" />
            <Row label={t('fs.train.progress')} href="/progress" />
          </RowGroup>
        </>
      ) : (
        <>
          {routine && days.length > 0 ? (
            <div class="sf-rt__block">
              <h2 class="sf-sec__label">{routine.name}</h2>
              <ul class="sf-rt__list">{days.map((d, i) => (i === suggested ? dayItem(d, i) : null))}</ul>
              {days.length > 1 && (
                <Collapsible id="days" title={t('ux.days')} summary={String(days.length - 1)}>
                  <ul class="sf-rt__list">{days.map((d, i) => (i === suggested ? null : dayItem(d, i)))}</ul>
                </Collapsible>
              )}
            </div>
          ) : (
            <p class="sf-rt__meta">{t('fs.train.none')}</p>
          )}

          <Collapsible id="ways" title={t('ux.otherWays')}>
            <Button variant="secondary" onPress={() => navigate('/session/new?free=1')}>{t('fs.train.free')}</Button>
            {last && <Button variant="secondary" onPress={() => navigate('/session/new?repeat=1')}>{t('fs.train.repeat')}</Button>}
            {shareOn && <Button variant="secondary" onPress={() => navigate('/share')}>{t('ps.recv.open')}</Button>}
          </Collapsible>
          <RowGroup>
            <Row label={t('fs.train.routines')} href="/routines" />
            <Row label={t('fs.train.history')} href="/history" />
            <Row label={t('fs.train.progress')} href="/progress" />
          </RowGroup>
        </>
      )}
      <LoggerChoice />
    </section>
  );
}

/** Phase 114 (ux.tidy): pick the set logger right on the Train page: wheels or the + / - pair. Same switch as Settings -> Appearance -> Wheel pickers. */
function LoggerChoice() {
  const tidy = useUx('tidy') === 'premium';
  const wheels = useUx('wheels') === 'premium';
  if (!tidy) return null;
  return (
    <div class="sf-rt__logger">
      <h2 class="sf-sec__label">{t('tr.logger')}</h2>
      <Segmented
        label={t('tr.logger')}
        value={wheels ? 'wheel' : 'steps'}
        options={[
          { value: 'wheel', label: t('tr.logger.wheel') },
          { value: 'steps', label: t('tr.logger.steps') },
        ]}
        onChange={(v) => void setUxSwitch('wheels', v === 'wheel')}
      />
    </div>
  );
}
