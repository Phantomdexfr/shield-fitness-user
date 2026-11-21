import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Badge, Button, Card, Chip, EmptyState, Input, PhotoFrame, Sheet, Stepper, SubPageHeader } from '../../ui/components';
import { BodyPicker, MuscleChips, type Sex, type View } from '../../ui/body';
import { SearchBox } from '../../ui/search/SearchBox';
import { goodFor, machineThumb, refFor, searchPicks, type Pick } from '../../data/repos/routineEdit';
import {
  addItem, insertItem, LONG_DAY_ITEMS, linkSuperset, MAX_REST, MIN_REST, moveItem, refKey, removeItem, REST_STEP, supersetLabels, unlinkSuperset, updateDay,
  validateDayName, validateItemPatch, type ItemEditError,
} from '../../shared/routineEdit';
import type { RoutineItem } from '../../shared/routine';
import { newClientId } from '../../data/local';
import { muscleLabel } from '../exercise/muscleLabel';
import { useRoutine } from './useRoutine';
import { DayBuilderSheet } from './DayBuilderSheet';
import { PartnerSheet } from './PartnerSheet';
import { goBack } from '../../app/navBack';

const UNDO_MS = 6000;

function Thumb({ machine, name }: { machine: string; name: string }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    if (machine) void machineThumb(machine).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [machine]);
  return machine ? <PhotoFrame src={src} alt={t('lib.machine.photo', { name })} class="sf-rt__thumb" /> : null;
}

/** `/routine/<id>/day/<dayId>`: name, target muscles (Body Picker), exercises (add, remove with Undo, reorder, edit sheet), suggestions. */
export default function RoutineDayPage() {
  const [, params] = useRoute('/routine/:id/day/:dayId');
  const id = params?.id ?? '';
  const dayId = params?.dayId ?? '';
  const [, navigate] = useLocation();
  const { load, info, save, saveError, refresh } = useRoutine(id);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState(false);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const [muscleDraft, setMuscleDraft] = useState<string[]>([]);
  const [sex, setSex] = useState<Sex>('male');
  const [view, setView] = useState<View>('front');
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const [good, setGood] = useState<Array<{ muscle: string; picks: Pick[] }>>([]);
  const [edit, setEdit] = useState<{ index: number; item: RoutineItem } | null>(null);
  const [editErr, setEditErr] = useState<ItemEditError | null>(null);
  const [undo, setUndo] = useState<{ item: RoutineItem; index: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const builderOn = useFeature('day_builder');
  const swipeOn = useFeature('superset_swipe');
  const [buildOpen, setBuildOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const back = () => goBack(navigate, `/routine/${id}`);
  const routine = load.status === 'ready' ? load.routine : null;
  const day = routine?.days.find((d) => d.id === dayId) ?? null;
  const targets = day?.targetMuscles.join(',') ?? '';

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!addOpen) return;
    let live = true;
    void goodFor(targets ? targets.split(',') : []).then((g) => live && setGood(g));
    return () => {
      live = false;
    };
  }, [addOpen, targets]);

  useEffect(() => {
    let live = true;
    void searchPicks(q).then((p) => live && setFound(p), () => live && setFound([]));
    return () => {
      live = false;
    };
  }, [q]);

  const header = (title: string) => <SubPageHeader title={title} onBack={back} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<p class="sf-lib__note" role="status">{t('rb.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<EmptyState icon="warning" title={t('rb.error.title')} actionLabel={t('rb.error.retry')} onAction={() => void refresh()} /></section>;
  if (!routine || !day) return <section class="sf-page-body sf-rt">{header(t('page.routine.title'))}<EmptyState icon="warning" title={t('rb.d.notfound')} actionLabel={t('rb.list.title')} onAction={() => navigate('/routines')} /></section>;

  const items = day.items;
  const setItems = (next: RoutineItem[]) => void save(updateDay(routine, dayId, (d) => ({ ...d, items: next })));
  const nameOf = (it: RoutineItem) => info.get(refKey(it.ref))?.name ?? (it.ref.kind === 'lib' ? it.ref.slug : '...');
  const inDay = new Set(items.map((i) => refKey(i.ref)));
  const labels = supersetLabels(items);

  const commitName = () => {
    if (nameDraft === null) return;
    const v = validateDayName(nameDraft);
    if (!v.ok) return setNameErr(true);
    setNameErr(false);
    setNameDraft(null);
    void save(updateDay(routine, dayId, (d) => ({ ...d, name: v.value })));
  };

  const addPick = async (p: Pick) => {
    const ref = await refFor(p);
    setItems(addItem(items, ref));
  };

  const doRemove = (index: number) => {
    const res = removeItem(items, index);
    if (!res.removed) return;
    setUndo({ item: res.removed, index });
    setItems(res.items);
  };

  const doUndo = () => {
    const u = undo;
    setUndo(null);
    if (u) setItems(insertItem(items, u.index, u.item));
  };

  // Drag: press the handle, move over another card, release. The up/down buttons do the same without dragging.
  const overIndex = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-idx]') as HTMLElement | null;
    return el && listRef.current?.contains(el) ? Number(el.dataset.idx) : null;
  };
  const dragStart = (i: number, e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ from: i, over: i });
  };
  const dragMove = (e: PointerEvent) => {
    if (!drag) return;
    const o = overIndex(e.clientX, e.clientY);
    if (o !== null && o !== drag.over) setDrag({ from: drag.from, over: o });
  };
  const dragEnd = () => {
    if (drag && drag.from !== drag.over) setItems(moveItem(items, drag.from, drag.over));
    setDrag(null);
  };

  const openEdit = (index: number) => {
    setEditErr(null);
    setEdit({ index, item: { ...items[index]! } });
  };
  const saveEdit = () => {
    if (!edit) return;
    const base = items[edit.index]!;
    const res = validateItemPatch(base, { sets: edit.item.sets, repMin: edit.item.repMin, repMax: edit.item.repMax, restSec: edit.item.restSec, note: edit.item.note ?? '' });
    if (!res.ok) return setEditErr(res.error);
    const next = items.map((it, i) => (i === edit.index ? res.value : it));
    setEdit(null);
    setItems(next);
  };
  /** Superset swipe: pair the item being edited with a partner, adding the partner to the day first when it is not there. */
  const pairWith = async (partnerSlug: string) => {
    if (!edit) return;
    const ref = await refFor({ slug: partnerSlug, name: partnerSlug, custom: false });
    let next = items;
    let at = next.findIndex((it) => refKey(it.ref) === refKey(ref));
    if (at < 0) {
      next = addItem(next, ref);
      at = next.length - 1;
    }
    setPartnerOpen(false);
    setEdit(null);
    setItems(linkSuperset(next, edit.index, at, newClientId));
  };
  const applyBuilt = (built: RoutineItem[], mode: 'replace' | 'append') => {
    if (mode === 'replace') return setItems(built);
    const have = new Set(items.map((it) => refKey(it.ref)));
    setItems([...items, ...built.filter((it) => !have.has(refKey(it.ref)))]);
  };
  const patch = (p: Partial<RoutineItem>) => edit && setEdit({ index: edit.index, item: { ...edit.item, ...p } });
  const pairs = edit ? items.map((it, i) => ({ it, i })).filter(({ i }) => i !== edit.index) : [];

  const PickRow = ({ p }: { p: Pick }) => (
    <li class="sf-rt__item">
      <span class="sf-rt__name sf-rt__grow">{p.name}</span>
      {inDay.has(p.custom ? `custom:${p.slug}` : p.slug) && <Badge tone="neutral">{t('rb.d.in')}</Badge>}
      <Button variant="secondary" icon="plus" aria-label={`${t('rb.d.add')}: ${p.name}`} onPress={() => void addPick(p)}>{t('rb.d.add')}</Button>
    </li>
  );

  return (
    <section class="sf-page-body sf-rt">
      {header(day.name)}
      {saveError && <p class="sf-rt__err" role="alert">{t('rb.err.save')}</p>}
      {routine?.followed && <p class="sf-lib__note" role="status">{t('gp.readonly')}</p>}

      <Input
        label={t('rb.d.name')}
        {...{ value: nameDraft ?? day.name, autoComplete: 'off' }}
        error={nameErr ? t('rb.d.name.err') : undefined}
        onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)}
        onBlur={commitName}
        onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && commitName()}
      />

      <div class="sf-rt__block">
        <h2 class="sf-rt__h">{t('rb.d.muscles')}</h2>
        <div class="sf-rt__chips">
          {day.targetMuscles.length === 0 ? <span class="sf-rt__meta">{t('rb.d.muscles.none')}</span> : day.targetMuscles.map((m) => <Badge key={m} tone="neutral">{muscleLabel(m)}</Badge>)}
        </div>
        <Button variant="secondary" onPress={() => { setMuscleDraft(day.targetMuscles); setMusclesOpen(true); }}>{t('rb.d.muscles.pick')}</Button>
      </div>

      <Button icon="plus" onPress={() => { setQ(''); setAddOpen(true); }}>{t('rb.d.add')}</Button>
      {builderOn && <Button variant="secondary" onPress={() => setBuildOpen(true)}>{t('db.build')}</Button>}

      {undo && (
        <div class="sf-rt__undo" role="status">
          <span class="sf-rt__undo-text">{t('rb.d.removed', { name: nameOf(undo.item) })}</span>
          <Button variant="ghost" onPress={doUndo}>{t('rb.undo')}</Button>
        </div>
      )}
      {items.length >= LONG_DAY_ITEMS && <p class="sf-rt__meta" role="status">{t('rb.d.long')}</p>}

      {items.length === 0 ? (
        <EmptyState icon="barbell" title={t('rb.d.empty')} actionLabel={t('rb.d.add')} onAction={() => { setQ(''); setAddOpen(true); }} />
      ) : (
        <ul class="sf-rt__list" ref={listRef} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={() => setDrag(null)}>
          {items.map((it, i) => {
            const name = nameOf(it);
            const label = labels.get(i);
            return (
              <li key={`${refKey(it.ref)}-${i}`} data-idx={i} class={`sf-rt__ex${drag?.over === i && drag.from !== i ? ' sf-rt__ex--over' : ''}${drag?.from === i ? ' sf-rt__ex--drag' : ''}`}>
                <Card class="sf-rt__excard" onPress={() => openEdit(i)}>
                  <Thumb machine={info.get(refKey(it.ref))?.machine ?? ''} name={name} />
                  <span class="sf-rt__name">{name}</span>
                  <span class="sf-rt__meta">{t('rb.d.line', { sets: it.sets, min: it.repMin, max: it.repMax, rest: it.restSec })}</span>
                  {label && <Badge tone="gold">{t('rb.d.ss.badge', { g: label })}</Badge>}
                </Card>
                <div class="sf-rt__ctl">
                  <Button variant="ghost" disabled={i === 0} aria-label={t('rb.d.up', { name })} onPress={() => setItems(moveItem(items, i, i - 1))}>{t('rb.w.up')}</Button>
                  <Button variant="ghost" disabled={i === items.length - 1} aria-label={t('rb.d.down', { name })} onPress={() => setItems(moveItem(items, i, i + 1))}>{t('rb.w.down')}</Button>
                  <button type="button" class="sf-rt__grip" aria-label={t('rb.d.drag', { name })} onPointerDown={(e) => dragStart(i, e as PointerEvent)}>{t('rb.d.drag.short')}</button>
                  <Button variant="danger" aria-label={`${t('rb.d.remove')}: ${name}`} onPress={() => doRemove(i)}>{t('rb.d.remove')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={musclesOpen} onClose={() => setMusclesOpen(false)} title={t('rb.d.muscles')}>
        <div class="sf-rt__menu">
          <BodyPicker mode="pick-many" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} value={muscleDraft} onChange={setMuscleDraft} size="compact" />
          <MuscleChips mode="pick-many" value={muscleDraft} onChange={setMuscleDraft} />
          <Button onPress={() => { setMusclesOpen(false); void save(updateDay(routine, dayId, (d) => ({ ...d, targetMuscles: muscleDraft }))); }}>{t('rb.w.save')}</Button>
        </div>
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('rb.d.add')}>
        <div class="sf-rt__menu">
          <SearchBox value={q} placeholder={t('rb.d.search')} onInput={setQ} />
          {q.trim() !== '' ? (
            found.length === 0 ? <p class="sf-rt__meta">{t('rb.d.nofind')}</p> : <ul class="sf-rt__list">{found.map((p) => <PickRow key={p.slug} p={p} />)}</ul>
          ) : good.length === 0 ? (
            <p class="sf-rt__meta">{t('rb.d.pickhint')}</p>
          ) : (
            good.map((g) => (
              <div key={g.muscle} class="sf-rt__block">
                <h3 class="sf-rt__h">{t('rb.d.good', { muscle: muscleLabel(g.muscle) })}</h3>
                <ul class="sf-rt__list">{g.picks.map((p) => <PickRow key={p.slug} p={p} />)}</ul>
              </div>
            ))
          )}
          <Button onPress={() => setAddOpen(false)}>{t('rb.w.done')}</Button>
        </div>
      </Sheet>

      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit ? nameOf(edit.item) : t('rb.d.edit')}>
        {edit && (
          <div class="sf-rt__menu">
            <Stepper label={t('rb.d.sets')} value={edit.item.sets} min={1} max={10} onChange={(v) => patch({ sets: v })} />
            <Stepper label={t('rb.d.repmin')} value={edit.item.repMin} min={1} max={100} onChange={(v) => patch({ repMin: v })} />
            <Stepper label={t('rb.d.repmax')} value={edit.item.repMax} min={1} max={100} onChange={(v) => patch({ repMax: v })} />
            <Stepper label={t('rb.d.rest')} value={edit.item.restSec} min={MIN_REST} max={MAX_REST} step={REST_STEP} format={(v) => t('rb.d.rest.fmt', { n: v })} onChange={(v) => patch({ restSec: v })} />
            <Input label={t('rb.d.note')} {...{ value: edit.item.note ?? '' }} onInput={(e) => patch({ note: (e.target as HTMLInputElement).value })} />
            <div class="sf-rt__block">
              <h3 class="sf-rt__h">{t('rb.d.ss')}</h3>
              {pairs.length === 0 ? <p class="sf-rt__meta">{t('rb.d.ss.none')}</p> : (
                <div class="sf-rt__chips">
                  {pairs.map(({ it, i }) => (
                    <Chip key={i} selected={!!edit.item.supersetGroup && it.supersetGroup === edit.item.supersetGroup} onPress={() => { setItems(linkSuperset(items, edit.index, i, newClientId)); setEdit(null); }}>{t('rb.d.ss.link', { name: nameOf(it) })}</Chip>
                  ))}
                </div>
              )}
              {swipeOn && edit.item.ref.kind === 'lib' && <Button variant="secondary" onPress={() => setPartnerOpen(true)}>{t('db.ss.find')}</Button>}
              {edit.item.supersetGroup && <Button variant="ghost" onPress={() => { setItems(unlinkSuperset(items, edit.index)); setEdit(null); }}>{t('rb.d.ss.unlink')}</Button>}
            </div>
            {editErr && <p class="sf-rt__err" role="alert">{t(`rb.d.err.${editErr}` as StringKey)}</p>}
            <Button onPress={saveEdit}>{t('rb.d.save')}</Button>
            <Button variant="ghost" onPress={() => setEdit(null)}>{t('rb.cancel')}</Button>
          </div>
        )}
      </Sheet>
      <DayBuilderSheet open={buildOpen} onClose={() => setBuildOpen(false)} day={day} onApply={applyBuilt} />
      {edit && edit.item.ref.kind === 'lib' && <PartnerSheet open={partnerOpen} onClose={() => setPartnerOpen(false)} slug={edit.item.ref.slug} name={nameOf(edit.item)} onPick={(s) => void pairWith(s)} />}
    </section>
  );
}
