import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'wouter-preact';
import { t } from '../../i18n';
import { Badge, Button, Card, Collapsible, Dialog, EmptyState, IconButton, Input, ProgressBar, Sheet, SubPageHeader, Toggle } from '../../ui/components';
import { useUx } from '../../ui/useUx';
import { deleteRoutine, duplicateRoutine, listRoutines, setActiveRoutine } from '../../data/repos/routines';
import { addDay, estimateMinutes, moveDay, overloadHints, removeDay, renameRoutine, restoreDay, weeklyVolume, type OverloadHint } from '../../shared/routineEdit';
import { newClientId } from '../../data/local';
import type { Routine, RoutineDay } from '../../shared/routine';
import { MAX_DAYS } from '../../shared/routine';
import { muscleLabel } from '../exercise/muscleLabel';
import { useRoutine } from './useRoutine';
import { usePlan } from './usePlan';
import { WeekView } from './WeekView';
import { useFeature } from '../../app/flags';
import { relayAvailable } from '../../data/relay/client';
import { SharePlanSheet } from '../share/SharePlanSheet';
import { RoutineImageSheet } from './RoutineImageSheet';
import { goBack } from '../../app/navBack';

const UNDO_MS = 6000;
type Gone = { day: RoutineDay; index: number };

/** `/routine/<id>`: the routine's days as a grid, planned weekly sets, rest-day hints. Rename, active, duplicate, delete, add/move/remove days. */
export default function RoutineWeekPage() {
  const [, params] = useRoute('/routine/:id');
  const id = params?.id ?? '';
  const [, navigate] = useLocation();
  const { load, info, lookup, save, saveError, refresh } = useRoutine(id);
  const imageOn = useFeature('routine_image');
  const [imageOpen, setImageOpen] = useState(false);
  const schedOn = useFeature('rest_scheduler');
  const shareOn = useFeature('plan_share') && relayAvailable();
  const [shareOpen, setShareOpen] = useState(false);
  const plan = usePlan(load.status === 'ready' ? load.routine : undefined);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [daysOpen, setDaysOpen] = useState(false);
  const tidy = useUx('tidy') === 'premium'; // Phase 115: Up / Down / Remove as three small icon buttons
  const [confirmDay, setConfirmDay] = useState<RoutineDay | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [undo, setUndo] = useState<Gone | null>(null);
  const [lastNote, setLastNote] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const back = () => goBack(navigate, '/routines');
  const header = (title: string) => <SubPageHeader title={title} onBack={back} />;

  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<p class="sf-lib__note" role="status">{t('rb.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<EmptyState icon="warning" title={t('rb.error.title')} actionLabel={t('rb.error.retry')} onAction={() => void refresh()} /></section>;
  if (load.status === 'missing') return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<EmptyState icon="warning" title={t('rb.w.notfound')} actionLabel={t('rb.list.title')} onAction={back} /></section>;

  const r: Routine = load.routine;
  const hints = overloadHints(r, lookup).filter((h) => !ignored.includes(hintKey(h)));
  const volume = weeklyVolume(r, lookup);
  const top = volume[0]?.sets ?? 0;
  const anyItems = r.days.some((d) => d.items.length > 0);

  const doRename = async () => {
    const all = await listRoutines();
    const res = renameRoutine(r, rename ?? '', all.filter((x) => x.id !== r.id).map((x) => x.name));
    if (!res.ok) return setRenameErr(res.error === 'name_taken' ? t('rb.w.taken') : res.error === 'name_too_long' ? t('rb.err.name_too_long') : t('rb.d.name.err'));
    setRename(null);
    setRenameErr(null);
    void save(res.value);
  };

  const doRemoveDay = (d: RoutineDay) => {
    const res = removeDay(r, d.id);
    setConfirmDay(null);
    if (!res) return setLastNote(true);
    setLastNote(false);
    setUndo({ day: res.removed, index: res.index });
    void save(res.routine);
  };

  const askRemove = (d: RoutineDay) => {
    if (r.days.length <= 1) return setLastNote(true);
    if (d.items.length > 0) setConfirmDay(d);
    else doRemoveDay(d);
  };

  const doAddDay = () => {
    const next = addDay(r, newClientId);
    if (next) void save(next);
  };

  const dayMuscles = (d: RoutineDay) => (d.targetMuscles.length ? d.targetMuscles.map(muscleLabel).join(', ') : t('rb.w.nomuscle'));

  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={r.name} onBack={back} right={<IconButton icon="dots-three-vertical" label={t('rb.menu')} onPress={() => setMenu(true)} />} />
      {saveError && <p class="sf-rt__err" role="alert">{t('rb.err.save')}</p>}
      {r.followed && <p class="sf-lib__note" role="status">{t('gp.readonly')}</p>}
      <Toggle checked={r.active} label={t('rb.w.active')} onChange={(on) => { if (on) void setActiveRoutine(r.id).then(refresh); }} disabled={r.active} />

      {undo && (
        <div class="sf-rt__undo" role="status">
          <span class="sf-rt__undo-text">{t('rb.w.day.removed', { name: undo.day.name })}</span>
          <Button variant="secondary" onPress={() => { const u = undo; setUndo(null); void save(restoreDay(r, u.day, u.index)); }}>{t('rb.undo')}</Button>
        </div>
      )}
      {lastNote && <p class="sf-rt__err" role="status">{t('rb.w.day.last')}</p>}

      {hints.map((h) => (
        <Card key={hintKey(h)} tone="raised" class="sf-rt__hint">
          <p class="sf-rt__hint-text" role="status">{h.kind === 'back_to_back' ? t('rb.w.hint.b2b', { muscle: muscleLabel(h.muscle) }) : t('rb.w.hint.cap', { muscle: muscleLabel(h.muscle), n: h.sets })}</p>
          <div class="sf-rt__row">
            <Button variant="secondary" onPress={() => setDaysOpen(true)}>{t('rb.w.hint.move')}</Button>
            <Button variant="secondary" onPress={() => setIgnored((l) => [...l, hintKey(h)])}>{t('rb.w.hint.ignore')}</Button>
          </div>
        </Card>
      ))}

      {!anyItems && <p class="sf-rt__meta">{t('rb.w.empty')}</p>}

      <ul class="sf-rt__list">
        {r.days.map((d) => {
          const min = estimateMinutes(d.items);
          return (
            <li key={d.id}>
              <Card class="sf-rt__day" onPress={() => navigate(`/routine/${r.id}/day/${d.id}`)}>
                <span class="sf-rt__name">{d.name}</span>
                <span class="sf-rt__meta">{dayMuscles(d)}</span>
                <span class="sf-rt__meta">{d.items.length === 0 ? t('rb.w.noitems') : `${t('rb.w.items', { n: d.items.length })} · ${t('rb.w.min', { n: min })}`}</span>
                <span class="sf-rt__meta sf-rt__open">{t('rb.w.open')}</span>
              </Card>
            </li>
          );
        })}
      </ul>
      <div class="sf-qgrid">
        <Button variant="secondary" onPress={() => setDaysOpen(true)}>{t('rb.w.days')}</Button>
        {shareOn && <Button variant="secondary" onPress={() => setShareOpen(true)}>{t('ps.share.title')}</Button>}
      </div>

      {schedOn && plan.ready && (
        <Collapsible id="plan" title={t('sc.week.title')}>
          <WeekView bare routine={r} plan={plan} onRoutine={(next) => void save(next)} />
        </Collapsible>
      )}

      <Collapsible id="volume" title={t('rb.w.volume')} summary={volume.length > 0 ? String(volume.length) : undefined}>
        {volume.length === 0 ? (
          <p class="sf-rt__meta">{t('rb.w.volume.empty')}</p>
        ) : (
          <ul class="sf-rt__list">
            {volume.map((v) => (
              <li key={v.muscle} class="sf-rt__vol">
                <span class="sf-rt__vol-name">{muscleLabel(v.muscle)}</span>
                <ProgressBar value={top > 0 ? v.sets / top : 0} label={`${muscleLabel(v.muscle)}: ${t('rb.w.sets', { n: v.sets })}`} class="sf-rt__vol-bar" />
                <span class="sf-rt__vol-n">{v.sets}</span>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>

      <Sheet open={menu} onClose={() => setMenu(false)} title={r.name}>
        <div class="sf-rt__menu">
          <Button variant="secondary" onPress={() => { setMenu(false); setRename(r.name); setRenameErr(null); }}>{t('rb.w.rename')}</Button>
          {!r.active && <Button variant="secondary" onPress={() => { setMenu(false); void setActiveRoutine(r.id).then(refresh); }}>{t('rb.menu.active')}</Button>}
          {imageOn && <Button variant="secondary" onPress={() => { setMenu(false); setImageOpen(true); }}>{t('ri.menu')}</Button>}
          <Button variant="secondary" onPress={() => { setMenu(false); void duplicateRoutine(r.id).then((c) => c && navigate(`/routine/${c.id}`)); }}>{t('rb.menu.duplicate')}</Button>
          <Button variant="danger" onPress={() => { setMenu(false); setConfirmDel(true); }}>{t('rb.menu.delete')}</Button>
        </div>
      </Sheet>

      {imageOn && <RoutineImageSheet open={imageOpen} onClose={() => setImageOpen(false)} routine={r} info={info} />}
      {shareOn && <SharePlanSheet open={shareOpen} onClose={() => setShareOpen(false)} routineId={r.id} />}

      <Sheet open={rename !== null} onClose={() => setRename(null)} title={t('rb.w.rename.title')}>
        <div class="sf-rt__menu">
          <Input label={t('rb.w.rename.label')} {...{ value: rename ?? '' }} error={renameErr ?? undefined} onInput={(e) => setRename((e.target as HTMLInputElement).value)} />
          <Button onPress={() => void doRename()}>{t('rb.w.save')}</Button>
        </div>
      </Sheet>

      <Sheet open={daysOpen} onClose={() => setDaysOpen(false)} title={t('rb.w.days.title')}>
        <div class="sf-rt__menu">
          <ul class="sf-rt__list">
            {r.days.map((d, i) => (
              <li key={d.id} class="sf-rt__item">
                <span class="sf-rt__name sf-rt__grow">{d.name}</span>
                {tidy ? (
                  <>
                    <Button class="sf-rt__mini" variant="secondary" disabled={i === 0} aria-label={`${t('rb.w.up')}: ${d.name}`} onPress={() => void save(moveDay(r, i, i - 1))}>↑</Button>
                    <Button class="sf-rt__mini" variant="secondary" disabled={i === r.days.length - 1} aria-label={`${t('rb.w.down')}: ${d.name}`} onPress={() => void save(moveDay(r, i, i + 1))}>↓</Button>
                    <IconButton class="sf-rt__danger" icon="trash" variant="secondary" label={`${t('rb.w.day.remove')}: ${d.name}`} onPress={() => askRemove(d)} />
                  </>
                ) : (
                  <>
                    <Button variant="secondary" disabled={i === 0} aria-label={`${t('rb.w.up')}: ${d.name}`} onPress={() => void save(moveDay(r, i, i - 1))}>{t('rb.w.up')}</Button>
                    <Button variant="secondary" disabled={i === r.days.length - 1} aria-label={`${t('rb.w.down')}: ${d.name}`} onPress={() => void save(moveDay(r, i, i + 1))}>{t('rb.w.down')}</Button>
                    <Button variant="danger" aria-label={`${t('rb.w.day.remove')}: ${d.name}`} onPress={() => askRemove(d)}>{t('rb.w.day.remove')}</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <Button variant="secondary" icon="plus" disabled={r.days.length >= MAX_DAYS} onPress={doAddDay}>{r.days.length >= MAX_DAYS ? t('rb.w.day.max') : t('rb.w.day.add')}</Button>
          <Button onPress={() => setDaysOpen(false)}>{t('rb.w.done')}</Button>
        </div>
      </Sheet>

      <Dialog open={confirmDay !== null} title={t('rb.w.day.remove')} message={t('rb.w.day.confirm', { name: confirmDay?.name ?? '' })} confirmLabel={t('rb.w.day.remove')} cancelLabel={t('rb.cancel')} danger onCancel={() => setConfirmDay(null)} onConfirm={() => confirmDay && doRemoveDay(confirmDay)} />
      <Dialog
        open={confirmDel}
        title={t('rb.delete.title', { name: r.name })}
        message={t('rb.delete.message')}
        confirmLabel={t('rb.menu.delete')}
        cancelLabel={t('rb.cancel')}
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); void deleteRoutine(r.id).then(back); }}
      />
      {r.active && <Badge tone="gold" icon="check">{t('rb.active')}</Badge>}
    </section>
  );
}

const hintKey = (h: OverloadHint): string => `${h.kind}:${h.muscle}`;
