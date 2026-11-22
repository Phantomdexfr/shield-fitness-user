import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { loadLabData, machinePhotos, type LabData } from '../../data/repos/lab';
import { istDayKey } from '../../shared/dates';
import { useFeature } from '../../app/flags';
import { Badge, Button, Collapsible, EmptyState, PhotoFrame, Select, Toggle, Row } from '../../ui/components';
import { FALLBACK, parentOf, tierOf, viewsOf, type View } from '../../ui/body';
import { activeFilterCount, filterChoices, labList, machineFinder, surpriseMe, type LabFilters, type Ranked } from './labData';
import type { Reason } from '../../shared/suggest';

export type LabState = { status: 'loading' } | { status: 'ready'; data: LabData } | { status: 'error' };

/** Loads the lab data once per mount. */
export function useLabData(): { state: LabState; reload: () => void } {
  const [state, setState] = useState<LabState>({ status: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadLabData().then(
      (data) => live && setState({ status: 'ready', data }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [tries]);
  return { state, reload: () => setTries((n) => n + 1) };
}

export const muscleName = (id: string): string => t(`muscle.${id}` as StringKey);
const nice = (raw: string): string => (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ') : raw);
const ANY = '__any';
const NONE = '__none';
const PAGE = 20;

export function whyText(r: Reason): string {
  const key = `lab.why.${r.code}` as StringKey;
  return t(key, { muscle: r.muscle ? muscleName(r.muscle) : '', n: r.days ?? 0 });
}

export function LoadGate({ state, reload, children }: { state: LabState; reload: () => void; children: (d: LabData) => preact.ComponentChildren }) {
  if (state.status === 'loading') return <p role="status">{t('lab.loading')}</p>;
  if (state.status === 'error') return <EmptyState icon="warning" title={t('lab.error')} actionLabel={t('lab.retry')} onAction={reload} />;
  return <>{children(state.data)}</>;
}

function ExerciseRow({ r, machineName, why, unavailable }: { r: Ranked; machineName?: string; why: boolean; unavailable?: boolean }) {
  return (
    <li class="sf-lab__row">
      <Row href={`/exercise/${r.slug}`}>
        <span class="sf-lab__name">{r.name}</span>
        {machineName && <span class="sf-lab__meta">{machineName}</span>}
      </Row>
      {unavailable && <Badge tone="warn">{t('lab.unavailable.badge')}</Badge>}
      {why && r.reasons.length > 0 && (
        <ul class="sf-lab__why" aria-label={t('lab.why.label')}>
          {r.reasons.map((x) => (
            <li key={x.code}>
              <Badge tone="gold">{whyText(x)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Section({ id, open, title, rows, data, why, limit, onMore, unavailable }: { id: string; open?: boolean; title: string; rows: Ranked[]; data: LabData; why: boolean; limit: number; onMore: () => void; unavailable?: boolean }) {
  const names = useMemo(() => new Map(data.machines.map((m) => [m.slug, m.name])), [data]);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const left = rows.length - shown.length;
  return (
    <Collapsible id={id} title={title} summary={String(rows.length)} defaultOpen={open}>
      <ul class="sf-lab__list">
        {shown.map((r) => (
          <ExerciseRow key={r.slug} r={r} why={why} unavailable={unavailable} machineName={names.get(data.candidates.find((c) => c.slug === r.slug)?.machine ?? '')} />
        ))}
      </ul>
      {left > 0 && (
        <Button variant="secondary" fullWidth onPress={onMore}>
          {t('lab.more.load', { n: Math.min(PAGE, left) })}
        </Button>
      )}
    </Collapsible>
  );
}

function FilterBar({ data, muscle, value, onChange }: { data: LabData; muscle: string; value: LabFilters; onChange: (f: LabFilters) => void }) {
  const ch = useMemo(() => filterChoices(data.candidates, muscle, data.tax), [data, muscle]);
  const machineName = (s: string) => data.machines.find((m) => m.slug === s)?.name ?? s;
  const opts = (xs: string[], label: (x: string) => string) => [{ value: ANY, label: t('lab.filters.any') }, ...xs.map((x) => ({ value: x, label: label(x) }))];
  const tracks = ['beginner', 'intermediate', 'muscle_gain', 'athlete', 'fat_loss', 'strength', 'cardio'];
  const set = <K extends keyof LabFilters>(k: K, v: LabFilters[K] | undefined) => {
    const next = { ...value };
    if (v === undefined || v === false) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const n = activeFilterCount(value);
  return (
    <div class="sf-lab__filters" role="group" aria-label={t('lab.filters')}>
      <Select
        label={t('lab.filter.equipment')}
        value={value.machine === undefined ? ANY : value.machine === '' ? NONE : value.machine}
        options={[{ value: ANY, label: t('lab.filters.any') }, ...(ch.machines.includes('') ? [{ value: NONE, label: t('lab.filter.equipment.none') }] : []), ...ch.machines.filter(Boolean).map((m) => ({ value: m, label: machineName(m) }))]}
        onChange={(v) => set('machine', v === ANY ? undefined : v === NONE ? '' : v)}
      />
      <Select label={t('lab.filter.category')} value={value.category ?? ANY} options={opts(ch.categories, nice)} onChange={(v) => set('category', v === ANY ? undefined : v)} />
      <Select label={t('lab.filter.kind')} value={value.kind ?? ANY} options={opts(ch.kinds, nice)} onChange={(v) => set('kind', v === ANY ? undefined : v)} />
      <Select
        label={t('lab.filter.difficulty')}
        value={value.difficulty === undefined ? ANY : String(value.difficulty)}
        options={opts(ch.difficulties.map(String), (d) => t(`lab.filter.difficulty.${d}` as StringKey))}
        onChange={(v) => set('difficulty', v === ANY ? undefined : Number(v))}
      />
      <Select label={t('lab.filter.track')} value={value.track ?? ANY} options={opts(tracks, nice)} onChange={(v) => set('track', v === ANY ? undefined : v)} />
      <Toggle checked={!!value.unilateral} onChange={(v) => set('unilateral', v)} label={t('lab.filter.unilateral')} />
      <Toggle checked={!!value.beginnerFriendly} onChange={(v) => set('beginnerFriendly', v)} label={t('lab.filter.beginner')} />
      {n > 0 && (
        <Button variant="secondary" onPress={() => onChange({})}>
          {t('lab.filters.clear')} ({n})
        </Button>
      )}
    </div>
  );
}

function MachineThumb({ slug, name }: { slug: string; name: string }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    machinePhotos(slug).then((l) => live && setSrc((l.find((x) => x.variant === 'thumb' && x.primary) ?? l.find((x) => x.variant === 'thumb') ?? l[0])?.url), () => undefined);
    return () => {
      live = false;
    };
  }, [slug]);
  return <PhotoFrame src={src} alt={t('lab.machines.photo', { name })} class="sf-lab__thumb" />;
}

/** Machine finder (feature `machine_finder`): the best machines for one muscle, with photos, from the reach table. */
export function MachineFinder({ data, muscle }: { data: LabData; muscle: string }) {
  const on = useFeature('machine_finder');
  const list = useMemo(() => machineFinder(data.reach, muscle, data.tax, data.machines), [data, muscle]);
  if (!on) return null;
  return (
    <Collapsible id="machines" title={t('lab.machines.title', { muscle: muscleName(muscle) })}>
      {list.length === 0 ? (
        <p class="sf-lab__note">{t('lab.machines.none')}</p>
      ) : (
        <ul class="sf-lab__machines">
          {list.map((m) => (
            <li key={m.slug}>
              <Link href={`/machine/${m.slug}`} class="sf-lab__mcard">
                <MachineThumb slug={m.slug} name={m.name} />
                <span class="sf-lab__name">{m.name}</span>
                <span class="sf-lab__meta">{t('lab.machines.exercises', { n: m.exercises })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}

function noteFor(id: string): string | null {
  const tier = tierOf(id);
  if (tier === 'sys') return t('body.note.sys');
  if (tier === 'list') return t('body.note.list');
  if (tier === 'approx') return t('body.note.approx');
  return FALLBACK[id] ? t('body.note.deep') : null;
}

export interface LabPanelProps {
  data: LabData;
  muscle: string;
  view?: View;
  onPickMuscle?: (id: string) => void;
  onShowView?: (v: View) => void;
}

/** The exercise list for one muscle: note, whole-group, surprise me, filters, three sections, machine finder. */
export function LabPanel({ data, muscle, view, onPickMuscle, onShowView }: LabPanelProps) {
  const why = useFeature('why_chips');
  const [filters, setFilters] = useState<LabFilters>({});
  const [limit, setLimit] = useState(PAGE);
  const [taps, setTaps] = useState(0);
  const [pick, setPick] = useState<Ranked | null | undefined>();
  const dayKey = useMemo(() => istDayKey(Date.now()), []);
  useEffect(() => {
    setFilters({});
    setLimit(PAGE);
    setPick(undefined);
  }, [muscle]);
  const list = useMemo(() => labList(data.candidates, muscle, data.tax, dayKey, data.person, filters, data.machineStatus), [data, muscle, dayKey, filters]);
  const total = list.suggested.length + list.built.length + list.more.length + list.unavailable.length;
  const parent = parentOf(muscle);
  const views = viewsOf(muscle);
  const note = noteFor(muscle);
  const filtered = activeFilterCount(filters) > 0;
  const surprise = () => {
    setPick(surpriseMe(list, dayKey, taps) ?? null);
    setTaps((n) => n + 1);
  };
  const more = () => setLimit((n) => n + PAGE);

  return (
    <div class="sf-lab__panel">
      <h2 class="sf-lab__title">{muscleName(muscle)}</h2>
      {note && <p class="sf-lab__note">{note}</p>}
      {view && views.length > 0 && !views.includes(view) && onShowView && (
        <Button variant="secondary" onPress={() => onShowView(views[0] as View)}>
          {t('lab.other_view', { view: t(`body.view.${views[0]}` as StringKey).toLowerCase() })}
        </Button>
      )}
      {parent !== muscle && onPickMuscle && (
        <Button variant="secondary" onPress={() => onPickMuscle(parent)}>
          {t('lab.group.whole', { name: muscleName(parent) })}
        </Button>
      )}
      <FilterBar data={data} muscle={muscle} value={filters} onChange={setFilters} />
      <div class="sf-lab__actions">
        <Button icon="magnifying-glass" onPress={surprise} disabled={total === 0}>
          {t('lab.surprise')}
        </Button>
        <span class="sf-lab__n" role="status">
          {total === 1 ? t('lab.count.one') : t('lab.count', { n: total })}
        </span>
      </div>
      {pick !== undefined && (
        <section class="sf-lab__pick" aria-label={t('lab.surprise.title')}>
          {pick ? (
            <ul class="sf-lab__list">
              <ExerciseRow r={pick} why={why} />
            </ul>
          ) : (
            <p class="sf-lab__note">{t('lab.surprise.empty')}</p>
          )}
        </section>
      )}
      {total === 0 ? (
        <EmptyState
          icon="info"
          title={filtered ? t('lab.empty.title') : tierOf(muscle) === 'list' ? t('lab.empty.list.title') : t('lab.empty.none.title')}
          hint={filtered ? t('lab.empty.hint') : t('lab.empty.none.hint')}
          actionLabel={filtered ? t('lab.filters.clear') : undefined}
          onAction={filtered ? () => setFilters({}) : undefined}
        />
      ) : (
        <>
          <Section id="suggested" open title={t('lab.sec.suggested')} rows={list.suggested} data={data} why={why} limit={limit} onMore={more} />
          <Section id="built" title={t('lab.sec.built')} rows={list.built} data={data} why={why} limit={limit} onMore={more} />
          <Section id="more" title={t('lab.sec.more')} rows={list.more} data={data} why={why} limit={limit} onMore={more} />
          <Section id="unavailable" title={t('lab.sec.unavailable')} rows={list.unavailable} data={data} why={false} limit={limit} onMore={more} unavailable />
        </>
      )}
      <MachineFinder data={data} muscle={muscle} />
    </div>
  );
}
