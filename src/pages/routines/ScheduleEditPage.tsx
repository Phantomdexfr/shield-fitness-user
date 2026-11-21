import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Card, Chip, Dialog, EmptyState, Field, Pressable, Stepper, SubPageHeader } from '../../ui/components';
import { istDayKey, isDayKey, type DayKey } from '../../shared/dates';
import { CYCLE_MAX, CYCLE_MIN, CYCLE_PRESETS, EVERY_N_MAX, MAX_PER_WEEK_MAX, MIN_REST_MAX, effectiveSchedule, nextTile, parseMeta, parseSettings, toggleDeloadWeek, type CycleTile, type WeekStart } from '../../shared/schedule';
import { readSettings, saveSchedule } from '../../data/repos/schedule';
import { draftFrom, draftProblem, draftSchedule, sameDraft, weekdayOrder, type Draft, type Mode, type SubDraft } from './scheduleDraft';
import { useRoutine } from './useRoutine';
import { goBack } from '../../app/navBack';

const MODES: Mode[] = ['weekdays', 'cycle', 'every_n', 'floating', 'ab_weeks', 'none'];
const today = () => istDayKey(Date.now());

/** A native date picker in the standard field frame (the shared Input has no `type`). */
function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field id={id} label={label}>
      <input id={id} class="sf-input" type="date" value={value} onInput={(e) => onChange(e.currentTarget.value)} />
    </Field>
  );
}

function WeekdayChips({ value, onChange, weekStart }: { value: number[]; onChange: (v: number[]) => void; weekStart: WeekStart }) {
  return (
    <div class="sf-rt__chips">
      {weekdayOrder(weekStart).map((d) => (
        <Chip key={d} selected={value.includes(d)} aria-label={`${t('rb.wd.label')} ${t(`rb.wd.${d}` as StringKey)}`} onPress={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}>
          {t(`rb.wd.${d}` as StringKey)}
        </Chip>
      ))}
    </div>
  );
}

function CycleEditor({ pattern, start, onPattern, onStart }: { pattern: CycleTile[]; start: DayKey; onPattern: (p: CycleTile[]) => void; onStart: (d: DayKey) => void }) {
  const resize = (len: number) => onPattern(len > pattern.length ? [...pattern, ...Array<CycleTile>(len - pattern.length).fill('R')] : pattern.slice(0, len));
  return (
    <div class="sf-sc__stack">
      <Stepper label={t('sc.cycle.length')} value={pattern.length} min={CYCLE_MIN} max={CYCLE_MAX} onChange={resize} />
      <div class="sf-sc__tiles" role="group" aria-label={t('sc.mode.cycle')}>
        {pattern.map((tile, i) => (
          <Pressable key={i} class={`sf-sc__tile sf-sc__tile--${tile}`} aria-label={t('sc.tile.label', { n: i + 1, kind: t(`sc.kind.${tile}` as StringKey) })} onPress={() => onPattern(pattern.map((x, j) => (j === i ? nextTile(x) : x)))}>
            <span class="sf-sc__tile-letter">{tile}</span>
            <span class="sf-sc__tile-name">{t(`sc.kind.${tile}` as StringKey)}</span>
          </Pressable>
        ))}
      </div>
      <p class="sf-lib__note">{t('sc.cycle.presets')}</p>
      <div class="sf-rt__chips">
        {Object.entries(CYCLE_PRESETS).map(([name, p]) => (
          <Chip key={name} selected={p.join('') === pattern.join('')} onPress={() => onPattern([...p])}>{name}</Chip>
        ))}
      </div>
      <DateField id="sc-cycle-start" label={t('sc.cycle.start')} value={start} onChange={(v) => isDayKey(v) && onStart(v)} />
    </div>
  );
}

function SubCard({ title, value, onChange, weekStart }: { title: string; value: SubDraft; onChange: (v: SubDraft) => void; weekStart: WeekStart }) {
  return (
    <Card tone="raised" class="sf-sc__card">
      <h3 class="sf-rt__h">{title}</h3>
      <div class="sf-rt__chips">
        <Chip selected={value.kind === 'weekdays'} onPress={() => onChange({ ...value, kind: 'weekdays' })}>{t('sc.mode.weekdays')}</Chip>
        <Chip selected={value.kind === 'cycle'} onPress={() => onChange({ ...value, kind: 'cycle' })}>{t('sc.mode.cycle')}</Chip>
      </div>
      {value.kind === 'weekdays' ? (
        <WeekdayChips value={value.weekdays} weekStart={weekStart} onChange={(weekdays) => onChange({ ...value, weekdays })} />
      ) : (
        <CycleEditor pattern={value.pattern} start={value.start} onPattern={(pattern) => onChange({ ...value, pattern })} onStart={(start) => onChange({ ...value, start })} />
      )}
    </Card>
  );
}

/** `/routine/<id>/schedule`: SC1. One question per card; nothing is saved until Save. */
export default function ScheduleEditPage() {
  const [, params] = useRoute('/routine/:id/schedule');
  const id = params?.id ?? '';
  const [, navigate] = useLocation();
  const { load, refresh } = useRoutine(id);
  const [weekStart, setWeekStart] = useState<WeekStart>(parseSettings(undefined).weekStart);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [start, setStart] = useState<Draft | null>(null);
  const [deload, setDeload] = useState<string[]>([]);
  const [deloadStart, setDeloadStart] = useState<string[]>([]);
  const [newWeek, setNewWeek] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);

  useEffect(() => {
    void readSettings().then((s) => setWeekStart(s.weekStart));
  }, []);

  useEffect(() => {
    if (load.status !== 'ready' || draft) return;
    const r = load.routine;
    const meta = parseMeta(r.scheduleMeta);
    const d = draftFrom(effectiveSchedule(r), meta.anchorDate ?? meta.savedOn, today());
    setDraft(d);
    setStart(structuredClone(d));
    setDeload(meta.deloadWeeks);
    setDeloadStart(meta.deloadWeeks);
  }, [load.status]);

  const back = () => goBack(navigate, `/routine/${id}`);
  const header = () => <SubPageHeader title={t('sc.title')} onBack={back} />;

  if (load.status === 'loading' || (load.status === 'ready' && !draft)) return <section class="sf-page-body sf-rt">{header()}<p class="sf-lib__note" role="status">{t('rb.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{header()}<EmptyState icon="warning" title={t('rb.error.title')} actionLabel={t('rb.error.retry')} onAction={() => void refresh()} /></section>;
  if (load.status === 'missing' || !draft || !start) return <section class="sf-page-body sf-rt">{header()}<EmptyState icon="warning" title={t('sc.notfound')} actionLabel={t('rb.list.title')} onAction={() => navigate('/routines')} /></section>;

  const r = load.routine;
  const dirty = !sameDraft(draft, start) || deload.join() !== deloadStart.join();
  const problem = draftProblem(draft);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const leave = () => (dirty ? setLeaving(true) : back());
  const dayCount = r.days.length;

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    setSaveErr(false);
    const prev = parseMeta(r.scheduleMeta);
    const sched = draftSchedule(draft);
    const meta = { ...prev, deloadWeeks: deload, savedOn: prev.savedOn ?? today(), ...(draft.mode === 'ab_weeks' ? { anchorDate: draft.anchor } : {}) };
    try {
      await saveSchedule(r, sched, meta);
      back();
    } catch {
      setSaveErr(true);
      setSaving(false);
    }
  };

  const addWeek = () => {
    if (!newWeek || !isDayKey(newWeek)) return;
    const next = toggleDeloadWeek({ deloadWeeks: deload }, newWeek, weekStart);
    setDeload(next.deloadWeeks.length >= deload.length ? next.deloadWeeks : deload);
    setNewWeek(null);
  };

  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={t('sc.title')} onBack={leave} />
      <h2 class="sf-ex__h">{t('sc.q')}</h2>
      <div class="sf-rt__chips" role="radiogroup" aria-label={t('sc.q')}>
        {MODES.map((m) => (
          <Chip key={m} role="radio" selected={draft.mode === m} onPress={() => set({ mode: m })}>{t(`sc.mode.${m}` as StringKey)}</Chip>
        ))}
      </div>

      {draft.mode === 'weekdays' && (
        <Card tone="raised" class="sf-sc__card">
          <WeekdayChips value={draft.weekdays} weekStart={weekStart} onChange={(weekdays) => set({ weekdays })} />
          {draft.weekdays.length > 0 && draft.weekdays.length !== dayCount && <p class="sf-lib__note">{t('sc.takeTurns', { days: dayCount, weekdays: draft.weekdays.length })}</p>}
        </Card>
      )}

      {draft.mode === 'cycle' && (
        <Card tone="raised" class="sf-sc__card">
          <CycleEditor pattern={draft.pattern} start={draft.start} onPattern={(pattern) => set({ pattern })} onStart={(s) => set({ start: s })} />
        </Card>
      )}

      {draft.mode === 'every_n' && (
        <Card tone="raised" class="sf-sc__card">
          <Stepper label={t('sc.n.label')} value={draft.n} min={1} max={EVERY_N_MAX} format={(v) => t('sc.n.fmt', { n: v })} onChange={(n) => set({ n })} />
          {draft.n === 1 && <p class="sf-lib__note">{t('sc.everyDay')}</p>}
        </Card>
      )}

      {draft.mode === 'floating' && (
        <Card tone="raised" class="sf-sc__card">
          <p class="sf-rt__meta">{t('sc.maxPerWeek')}</p>
          <Stepper label={t('sc.maxPerWeek')} value={draft.maxPerWeek} min={1} max={MAX_PER_WEEK_MAX} onChange={(maxPerWeek) => set({ maxPerWeek })} />
          <p class="sf-rt__meta">{t('sc.minRest')}</p>
          <Stepper label={t('sc.minRest')} value={draft.minRest} min={0} max={MIN_REST_MAX} onChange={(minRest) => set({ minRest })} />
          <p class="sf-lib__note">{t('sc.rotation.note')}</p>
        </Card>
      )}

      {draft.mode === 'ab_weeks' && (
        <div class="sf-sc__stack">
          <SubCard title={t('sc.weekA')} value={draft.a} weekStart={weekStart} onChange={(a) => set({ a })} />
          <SubCard title={t('sc.weekB')} value={draft.b} weekStart={weekStart} onChange={(b) => set({ b })} />
          <DateField id="sc-ab-start" label={t('sc.ab.start')} value={draft.anchor} onChange={(v) => isDayKey(v) && set({ anchor: v })} />
        </div>
      )}

      {problem === 'no_training_day' && <p class="sf-rt__err" role="alert">{t('sc.err.no_training_day')}</p>}
      {problem && problem !== 'no_training_day' && <p class="sf-rt__err" role="alert">{problem === 'cycle_length' ? t('sc.err.cycle_length') : t('sc.err.other')}</p>}

      <div class="sf-rt__block">
        <h2 class="sf-ex__h">{t('sc.deload.title')}</h2>
        {deload.length === 0 ? (
          <p class="sf-lib__note">{t('sc.deload.none')}</p>
        ) : (
          <ul class="sf-rt__list">
            {deload.map((w) => (
              <li key={w} class="sf-rt__row">
                <span class="sf-rt__grow sf-rt__meta">{w}</span>
                <Button variant="ghost" aria-label={t('sc.deload.remove', { date: w })} onPress={() => setDeload(deload.filter((x) => x !== w))}>{t('sc.deload.unmark')}</Button>
              </li>
            ))}
          </ul>
        )}
        {newWeek === null ? (
          <Button variant="secondary" onPress={() => setNewWeek(today())}>{t('sc.deload.add')}</Button>
        ) : (
          <div class="sf-sc__stack">
            <DateField id="sc-deload-date" label={t('sc.deload.date')} value={newWeek} onChange={setNewWeek} />
            <Button variant="secondary" onPress={addWeek} disabled={!isDayKey(newWeek)}>{t('sc.deload.add')}</Button>
          </div>
        )}
      </div>

      {saveErr && <p class="sf-rt__err" role="alert">{t('sc.err.save')}</p>}
      <div class="sf-rt__bar">
        <Button onPress={() => void save()} disabled={!!problem || saving}>{t('sc.save')}</Button>
      </div>

      <Dialog open={leaving} title={t('sc.discard.title')} confirmLabel={t('sc.discard.yes')} cancelLabel={t('sc.discard.keep')} onConfirm={back} onCancel={() => setLeaving(false)} />
    </section>
  );
}
