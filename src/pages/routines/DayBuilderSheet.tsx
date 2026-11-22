import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { Badge, Button, Chip, Segmented, Sheet, Stepper } from '../../ui/components';
import { builderCtx, loadBuilderData, refsFor, type BuilderData } from '../../data/repos/dayBuilder';
import { buildDay, clampMinutes, entriesToItems, MAX_MINUTES, MIN_MINUTES, musclesForLabel, shuffleEntry, type BuildResult } from '../../shared/dayBuilder';
import type { RoutineDay, RoutineItem } from '../../shared/routine';
import { muscleLabel } from '../exercise/muscleLabel';
import { BuiltList } from './BuiltList';

type Box = '30' | '45' | '60' | 'custom';
const LEVELS = ['any', 'beginner'] as const;
const GOALS = ['any', 'muscle_gain', 'strength', 'fat_loss'] as const;

/** The muscles a day is built for: its own target muscles, else the ones its name stands for (Push, Pull, Legs...). */
export function musclesOfDay(day: Pick<RoutineDay, 'name' | 'targetMuscles'>): string[] {
  return day.targetMuscles.length > 0 ? day.targetMuscles : musclesForLabel(day.name) ?? [];
}

/** "Build this day for me": time box, level and goal in, a normal editable list out, with Shuffle per exercise. */
export function DayBuilderSheet({ open, onClose, day, onApply }: {
  open: boolean;
  onClose: () => void;
  day: RoutineDay;
  onApply: (items: RoutineItem[], mode: 'replace' | 'append') => void;
}) {
  const [data, setData] = useState<BuilderData | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState<Box>('45');
  const [custom, setCustom] = useState(40);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('any');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('any');
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [tried, setTried] = useState<Record<number, string[]>>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const muscles = musclesOfDay(day);
  const minutes = clampMinutes(box === 'custom' ? custom : Number(box));

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    loadBuilderData().then((d) => live && setData(d), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open]);

  const ctx = useMemo(() => (data ? builderCtx(data, { level: level === 'any' ? undefined : level, track: goal === 'any' ? undefined : goal }) : null), [data, level, goal]);
  const base = useMemo(
    () => (data && ctx ? buildDay({ muscles, minutes, equipment: data.preset, rampNote: t('db.ramp') }, data.pool, ctx) : null),
    [data, ctx, muscles.join(','), minutes],
  );
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
    const next = shuffleEntry(built, i, muscles, data.pool, ctx, { tried: seen, equipment: data.preset });
    if (!next) return setNote(t('db.shuffle.none'));
    setNote(null);
    setTried({ ...tried, [i]: [...seen] });
    setBuilt(next);
  };

  const apply = async (mode: 'replace' | 'append') => {
    if (!built || busy) return;
    setBusy(true);
    try {
      const refs = await refsFor(built.entries);
      onApply(entriesToItems(built.entries, (e) => refs.get(e.slug) ?? { kind: 'lib', slug: e.slug }), mode);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('db.title')}>
      <div class="sf-rt__menu">
        <div class="sf-rt__block">
          <h3 class="sf-rt__h">{t('db.muscles')}</h3>
          {muscles.length === 0 ? <p class="sf-rt__meta">{t('db.nomuscles')}</p> : <div class="sf-rt__chips">{muscles.map((m) => <Badge key={m} tone="neutral">{muscleLabel(m)}</Badge>)}</div>}
        </div>

        <div class="sf-rt__block">
          <h3 class="sf-rt__h">{t('db.time')}</h3>
          <div class="sf-rt__chips">
            {(['30', '45', '60'] as const).map((v) => <Chip key={v} selected={box === v} onPress={() => setBox(v)}>{t('db.time.min', { n: v })}</Chip>)}
            <Chip selected={box === 'custom'} onPress={() => setBox('custom')}>{t('db.time.custom')}</Chip>
          </div>
          {box === 'custom' && <Stepper label={t('db.time.custom.label')} value={custom} min={MIN_MINUTES} max={MAX_MINUTES} step={5} onChange={setCustom} />}
        </div>

        <Segmented label={t('db.level')} value={level} options={LEVELS.map((v) => ({ value: v, label: t(`db.level.${v}` as StringKey) }))} onChange={setLevel} />
        <Segmented label={t('db.goal')} value={goal} options={GOALS.map((v) => ({ value: v, label: t(`db.goal.${v}` as StringKey) }))} onChange={setGoal} />
        {data && <p class="sf-rt__meta">{t('db.equip', { name: t(`lib.equipment.${data.preset}` as StringKey) })}</p>}

        {failed ? (
          <p class="sf-rt__err" role="alert">{t('db.error')}</p>
        ) : !built || !data ? (
          muscles.length > 0 && <p class="sf-rt__meta" role="status">{t('db.loading')}</p>
        ) : built.entries.length === 0 ? (
          muscles.length > 0 && <p class="sf-rt__meta" role="status">{t('db.empty')}</p>
        ) : (
          <BuiltList result={built} onShuffle={shuffle} note={note} />
        )}

        {built && built.entries.length > 0 && (
          day.items.length === 0 ? (
            <Button disabled={busy} onPress={() => void apply('replace')}>{t('db.use')}</Button>
          ) : (
            <>
              <Button disabled={busy} onPress={() => void apply('replace')}>{t('db.replace')}</Button>
              <Button variant="secondary" disabled={busy} onPress={() => void apply('append')}>{t('db.append')}</Button>
            </>
          )
        )}
        <Button variant="secondary" onPress={onClose}>{t('rb.cancel')}</Button>
      </div>
    </Sheet>
  );
}
