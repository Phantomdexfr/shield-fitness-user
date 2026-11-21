import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Badge, Button, Card, EmptyState } from '../../ui/components';
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
          <h2 class="sf-rt__h">{routine.name}</h2>
          <ul class="sf-rt__list">
            {days.map((d, i) => (
              <li key={d.id} class="sf-rt__item">
                <div class="sf-rt__card sf-db__text">
                  <span class="sf-rt__name">{d.name}</span>
                  <span class="sf-rt__meta">{`${d.items.length} · ${estimateMinutes(d.items)} min`}</span>
                  {ago(d.id) && <span class="sf-rt__meta">{ago(d.id)}</span>}
                  {i === suggested && <Badge tone="gold">{t('fs.train.suggested')}</Badge>}
                </div>
                <Button variant={i === suggested ? 'primary' : 'secondary'} aria-label={t('fs.train.start', { day: d.name })} onPress={() => start(d.id)}>{t('fs.train.start', { day: d.name })}</Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p class="sf-rt__meta">{t('fs.train.none')}</p>
      )}

      <Button variant="secondary" onPress={() => navigate('/session/new?free=1')}>{t('fs.train.free')}</Button>
      {last && <Button variant="secondary" onPress={() => navigate('/session/new?repeat=1')}>{t('fs.train.repeat')}</Button>}
      <Button variant="ghost" onPress={() => navigate('/routines')}>{t('fs.train.routines')}</Button>
      <Button variant="ghost" onPress={() => navigate('/history')}>{t('fs.train.history')}</Button>
      <Button variant="ghost" onPress={() => navigate('/progress')}>{t('fs.train.progress')}</Button>
    </section>
  );
}
