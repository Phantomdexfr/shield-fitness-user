import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { relayAvailable } from '../../data/relay/client';
import { Badge, Button, Card, Collapsible, EmptyState, Row, RowGroup } from '../../ui/components';
import { activeRoutine, readState } from '../../data/repos/schedule';
import { listSessions } from '../../data/repos/sessions';
import { estimateMinutes } from '../../shared/routineEdit';
import { doneHoursAgo, lastFinished, openSession, type Session } from '../../shared/session';
import type { Routine } from '../../shared/routine';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; routine?: Routine; pointer: number; sessions: Session[] };

/** `/train`: resume an open workout, start today's suggested day, any other day, a free session or the last one again. */
export default function TrainPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const shareOn = useFeature('plan_share') && relayAvailable();

  const read = () => {
    setLoad({ status: 'loading' });
    Promise.all([listSessions(), activeRoutine()]).then(
      async ([sessions, routine]) => setLoad({ status: 'ready', sessions, routine, pointer: routine ? (await readState(routine.id)).pointer : 0 }),
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
  const days = routine?.days ?? [];
  const suggested = days.length > 0 ? load.pointer % days.length : -1;
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
        {i === suggested && <Badge tone="gold">{t('fs.train.suggested')}</Badge>}
      </div>
      <Button variant={i === suggested && !open ? 'primary' : 'secondary'} aria-label={t('fs.train.start', { day: d.name })} onPress={() => start(d.id)}>{t('fs.train.start', { day: d.name })}</Button>
    </li>
  );

  return (
    <section class="sf-page-body sf-rt">
      {title}
      {open && (
        <Card tone="gold" class="sf-rt__hint">
          <p class="sf-rt__hint-text">{t('fs.progress.title')}{open.dayName ? `: ${open.dayName}` : ''}</p>
          <Button onPress={() => navigate(`/session/${open.id}`)}>{t('fs.resume')}</Button>
        </Card>
      )}

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
    </section>
  );
}
