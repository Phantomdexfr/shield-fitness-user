import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, EmptyState, Segmented, SubPageHeader } from '../../ui/components';
import { MuscleChips } from '../../ui/body';
import { builderCtx, loadBuilderData, refsFor, type BuilderData } from '../../data/repos/dayBuilder';
import { listRoutines, putRoutine } from '../../data/repos/routines';
import { newClientId } from '../../data/local';
import { entriesToItems, FULL_BODY_MUSCLES, QUICK_MINUTES, quickWorkout, shuffleEntry, type BuildResult } from '../../shared/dayBuilder';
import { MAX_DAYS, type Routine } from '../../shared/routine';
import { addDay, updateDay } from '../../shared/routineEdit';
import { BuiltList } from './BuiltList';
import { goBack } from '../../app/navBack';

type What = 'full' | 'pick';

/** `/quick`: Workout in a pinch. 15 / 20 / 30 / 45 / 60 minutes, full body or chosen muscles; respects marks and equipment mode. */
export default function QuickWorkoutPage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<BuilderData | null>(null);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState<number>(30);
  const [what, setWhat] = useState<What>('full');
  const [picked, setPicked] = useState<string[]>([]);
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [tried, setTried] = useState<Record<number, string[]>>({});
  const [note, setNote] = useState<string | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);

  useEffect(() => {
    let live = true;
    loadBuilderData().then((d) => live && setData(d), () => live && setFailed(true));
    listRoutines().then((rs) => {
      const live2 = rs.filter((r) => !r.archived);
      if (live) setRoutine(live2.find((r) => r.active) ?? live2[0] ?? null);
    }, () => undefined);
    return () => {
      live = false;
    };
  }, []);

  const ctx = useMemo(() => (data ? builderCtx(data) : null), [data]);
  const muscles = what === 'full' ? ('full' as const) : picked;
  const base = useMemo(() => {
    if (!data || !ctx || (what === 'pick' && picked.length === 0)) return null;
    let n = 0;
    return quickWorkout({ minutes, muscles, equipment: data.preset, rampNote: t('db.ramp'), pairs: data.pairs, makeGroup: () => `qs${++n}` }, data.pool, ctx);
  }, [data, ctx, minutes, what, picked.join(',')]);
  useEffect(() => {
    setBuilt(base);
    setTried({});
    setNote(null);
  }, [base]);

  const shuffle = (i: number) => {
    if (!built || !data || !ctx) return;
    const seen = new Set(tried[i] ?? []);
    const cur = built.entries[i];
    if (cur) seen.add(cur.slug);
    const next = shuffleEntry(built, i, what === 'full' ? FULL_BODY_MUSCLES : picked, data.pool, ctx, { tried: seen, equipment: data.preset });
    if (!next) return setNote(t('db.shuffle.none'));
    setNote(null);
    setTried({ ...tried, [i]: [...seen] });
    setBuilt(next);
  };

  const full = routine !== null && routine.days.length >= MAX_DAYS;
  const save = async () => {
    if (!built || !routine || full || saving) return;
    setSaving(true);
    setSaveErr(false);
    try {
      const refs = await refsFor(built.entries);
      const items = entriesToItems(built.entries, (e) => refs.get(e.slug) ?? { kind: 'lib', slug: e.slug });
      const dayId = newClientId();
      const added = addDay(routine, () => dayId);
      if (!added) return;
      const next = updateDay(added, dayId, (d) => ({ ...d, name: t('db.q.name', { n: minutes }), targetMuscles: what === 'full' ? [] : picked, items }));
      await putRoutine(next);
      navigate(`/routine/${routine.id}/day/${dayId}`);
    } catch {
      setSaveErr(true);
    } finally {
      setSaving(false);
    }
  };

  const header = <SubPageHeader title={t('db.q.title')} onBack={() => goBack(navigate, '/routines')} />;
  if (failed) return <section class="sf-page-body sf-rt">{header}<EmptyState icon="warning" title={t('db.error')} /></section>;

  return (
    <section class="sf-page-body sf-rt">
      {header}
      <div class="sf-rt__block">
        <h2 class="sf-rt__h">{t('db.q.minutes')}</h2>
        <div class="sf-rt__chips">
          {QUICK_MINUTES.map((m) => <Chip key={m} selected={minutes === m} onPress={() => setMinutes(m)}>{t('db.time.min', { n: m })}</Chip>)}
        </div>
      </div>
      <div class="sf-rt__block">
        <h2 class="sf-rt__h">{t('db.q.what')}</h2>
        <Segmented label={t('db.q.what')} value={what} options={[{ value: 'full', label: t('db.q.full') }, { value: 'pick', label: t('db.q.pick') }]} onChange={setWhat} />
        {what === 'pick' && <MuscleChips mode="pick-many" value={picked} onChange={setPicked} />}
      </div>
      {data && <p class="sf-rt__meta">{t('db.equip', { name: t(`lib.equipment.${data.preset}` as StringKey) })}</p>}

      {!data ? (
        <p class="sf-rt__meta" role="status">{t('db.loading')}</p>
      ) : what === 'pick' && picked.length === 0 ? (
        <p class="sf-rt__meta">{t('db.q.pick.none')}</p>
      ) : built && built.entries.length === 0 ? (
        <p class="sf-rt__meta" role="status">{t('db.empty')}</p>
      ) : built ? (
        <BuiltList result={built} onShuffle={shuffle} note={note} />
      ) : null}

      {built && built.entries.length > 0 && (
        <div class="sf-rt__block">
          <p class="sf-rt__meta">{t('db.q.note')}</p>
          {saveErr && <p class="sf-rt__err" role="alert">{t('rb.err.save')}</p>}
          {routine === null ? (
            <>
              <p class="sf-rt__meta">{t('db.q.noroutine')}</p>
              <Button variant="secondary" onPress={() => navigate('/routine/new')}>{t('db.q.new')}</Button>
            </>
          ) : full ? (
            <p class="sf-rt__meta">{t('db.q.fullroutine')}</p>
          ) : (
            <Button disabled={saving} onPress={() => void save()}>{saving ? t('db.q.saving') : t('db.q.save', { name: routine.name })}</Button>
          )}
        </div>
      )}
    </section>
  );
}
