import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Sheet, SubPageHeader } from '../../ui/components';
import { deleteRoutine, duplicateRoutine, listRoutines, restoreRoutine, setActiveRoutine } from '../../data/repos/routines';
import type { Routine } from '../../shared/routine';
import { relayAvailable } from '../../data/relay/client';
import { goBack } from '../../app/navBack';
import { GymProgramsSection } from './GymProgramsSection';
import { SharePlanSheet } from '../share/SharePlanSheet';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; routines: Routine[] };

const UNDO_MS = 6000;

/** `/routines`: the person's routines, the active one first. New, set active, duplicate, delete (with Undo). */
export default function RoutinesPage() {
  const [, navigate] = useLocation();
  const quick = useFeature('quick_workout');
  const shareOn = useFeature('plan_share') && relayAvailable();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [menu, setMenu] = useState<Routine | null>(null);
  const [confirm, setConfirm] = useState<Routine | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [undo, setUndo] = useState<Routine | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () =>
    listRoutines().then(
      (routines) => setLoad({ status: 'ready', routines: routines.filter((r) => !r.archived) }),
      () => setLoad({ status: 'error' }),
    );

  useEffect(() => {
    void refresh();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const run = (fn: () => Promise<unknown>) => {
    setMenu(null);
    fn().then(refresh, () => setLoad({ status: 'error' }));
  };

  const doDelete = (r: Routine) => {
    setConfirm(null);
    setMenu(null);
    deleteRoutine(r.id).then(
      (gone) => {
        if (gone) {
          setUndo(gone);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setUndo(null), UNDO_MS);
        }
        return refresh();
      },
      () => setLoad({ status: 'error' }),
    );
  };

  const doUndo = () => {
    const r = undo;
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
    if (r) restoreRoutine(r).then(refresh, () => setLoad({ status: 'error' }));
  };

  const header = <SubPageHeader title={t('rb.list.title')} onBack={() => goBack(navigate, '/train')} />;

  if (load.status === 'loading') {
    return (
      <section class="sf-page-body sf-rt">
        {header}
        <p class="sf-lib__note" role="status">{t('rb.loading')}</p>
      </section>
    );
  }
  if (load.status === 'error') {
    return (
      <section class="sf-page-body sf-rt">
        {header}
        <EmptyState icon="warning" title={t('rb.error.title')} actionLabel={t('rb.error.retry')} onAction={() => { setLoad({ status: 'loading' }); void refresh(); }} />
      </section>
    );
  }

  const { routines } = load;
  return (
    <section class="sf-page-body sf-rt">
      {header}
      <Button icon="plus" onPress={() => navigate('/routine/new')}>{t('rb.new')}</Button>
      {(quick || shareOn) && (
        <div class="sf-qgrid">
          {quick && <Button variant="secondary" onPress={() => navigate('/quick')}>{t('db.q.open')}</Button>}
          {shareOn && <Button variant="secondary" onPress={() => navigate('/share')}>{t('ps.recv.open')}</Button>}
        </div>
      )}

      {undo && (
        <div class="sf-rt__undo" role="status">
          <span class="sf-rt__undo-text">{t('rb.deleted', { name: undo.name })}</span>
          <Button variant="secondary" onPress={doUndo}>{t('rb.undo')}</Button>
        </div>
      )}

      {routines.length === 0 ? (
        <EmptyState icon="barbell" title={t('rb.empty.title')} hint={t('rb.empty.hint')} actionLabel={t('rb.new')} onAction={() => navigate('/routine/new')} />
      ) : (
        <ul class="sf-rt__list">
          {routines.map((r) => (
            <li key={r.id} class="sf-rt__entry">
             <div class="sf-rt__item">
              <Card class="sf-rt__card" onPress={() => navigate(`/routine/${r.id}`)}>
                <span class="sf-rt__name">{r.name}</span>
                <span class="sf-rt__meta">
                  {r.followed ? `${t('gp.tag')} · ` : ''}{t('rb.days', { n: r.days.length })}
                  {' · '}
                  {t(`rb.split.${['ppl', 'upper_lower', 'full_body', 'bro', 'custom'].includes(r.splitStyle) ? r.splitStyle : 'custom'}` as never)}
                </span>
                {r.active && <Badge tone="gold" icon="check">{t('rb.active')}</Badge>}
              </Card>
              <IconButton icon="dots-three-vertical" label={t('rb.menu')} onPress={() => setMenu(r)} />
             </div>
             {shareOn && <Button variant="secondary" onPress={() => setShareId(r.id)}>{t('ps.share.title')}</Button>}
            </li>
          ))}
        </ul>
      )}

      <GymProgramsSection onChanged={() => void refresh()} />

      {shareOn && <SharePlanSheet open={shareId !== null} onClose={() => setShareId(null)} routineId={shareId ?? undefined} />}

      <Sheet open={menu !== null} onClose={() => setMenu(null)} title={menu?.name ?? t('rb.menu')}>
        {menu && (
          <div class="sf-rt__menu">
            <Button variant="secondary" onPress={() => { const id = menu.id; setMenu(null); navigate(`/routine/${id}`); }}>{t('rb.menu.open')}</Button>
            {!menu.active && <Button variant="secondary" onPress={() => run(() => setActiveRoutine(menu.id))}>{t('rb.menu.active')}</Button>}
            <Button variant="secondary" onPress={() => run(() => duplicateRoutine(menu.id))}>{t('rb.menu.duplicate')}</Button>
            <Button variant="danger" onPress={() => setConfirm(menu)}>{t('rb.menu.delete')}</Button>
          </div>
        )}
      </Sheet>

      <Dialog
        open={confirm !== null}
        title={t('rb.delete.title', { name: confirm?.name ?? '' })}
        message={t('rb.delete.message')}
        confirmLabel={t('rb.menu.delete')}
        cancelLabel={t('rb.cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && doDelete(confirm)}
      />
    </section>
  );
}
