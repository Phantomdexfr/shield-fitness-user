import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link, useLocation, useSearch } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { exercisesRepo } from '../../data/repos/exercises';
import { machineStatusFor } from '../../data/repos/gymPolicy';
import { loadPersonal } from '../../data/repos/personal';
import { goTos, hiddenSlugs, type Personal } from '../../shared/personal';
import { clearRecentSearches, forgetSearch, getEquipmentPreset, getRecentSearches, listMachines, rememberSearch, setEquipmentPreset } from '../../data/repos/library';
import type { ExerciseRow, Machine } from '../../dataset/loader';
import { EQUIPMENT_PRESETS, type EquipmentPreset } from '../../shared/equipment';
import { Badge, Button, Chip, EmptyState, PhotoFrame, Select, Sheet, Tabs, Toggle } from '../../ui/components';
import { SearchBox } from '../../ui/search/SearchBox';
import {
  countBy, filterMachines, machineCategories, parseLibraryUrl, refineExercises, serializeLibraryUrl, sheetFilterCount,
  type LibraryState, type LibraryTab,
} from './libraryState';

const PAGE = 30;
const ANY = '__any';
const nice = (raw: string): string => (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ') : raw);


function MachineThumb({ slug, name }: { slug: string; name: string }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    exercisesRepo.imageUrls(slug).then(
      (l) => live && setSrc((l.find((x) => x.variant === 'thumb' && x.primary) ?? l.find((x) => x.variant === 'thumb') ?? l[0])?.url),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [slug]);
  return <PhotoFrame src={src} alt={t('lib.machine.photo', { name })} class="sf-lib__thumb" />;
}

/** `/library`: exercises and machines, search as you type, chips, a filters sheet, equipment mode, recent searches.
 *  All state lives in the URL query (`?tab=&q=&cat=&sub=&kind=&diff=&beginner=1&uni=1&machine=&mcat=`). */
export default function LibraryPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const state = useMemo(() => parseLibraryUrl(search), [search]);
  const equipmentOn = useFeature('equipment_mode');
  const machineLabOn = useFeature('machine_lab');
  const customOn = useFeature('custom_exercises');
  const [preset, setPreset] = useState<EquipmentPreset>('gym');
  const [recents, setRecents] = useState<string[]>([]);
  const [hits, setHits] = useState<ExerciseRow[] | undefined>();
  const [hint, setHint] = useState<{ didYouMean?: string; setup?: { axis: string; value: string }; top?: string }>({});
  const [machines, setMachines] = useState<Machine[] | undefined>();
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [personal, setPersonal] = useState<Map<string, Personal>>(new Map());
  const [showHidden, setShowHidden] = useState(false);

  const go = (next: LibraryState) => navigate(`/library${serializeLibraryUrl(next)}`, { replace: true });
  const patch = (o: Partial<LibraryState>) => go({ ...state, ...o });
  const effective: EquipmentPreset = equipmentOn ? preset : 'gym';

  useEffect(() => {
    getEquipmentPreset().then(setPreset, () => undefined);
    getRecentSearches().then(setRecents, () => undefined);
    listMachines().then(setMachines, () => setFailed(true));
    loadPersonal().then(setPersonal, () => undefined);
  }, []);

  // Exercises: the search function handles text, kind, difficulty, beginner and machine; refine() does the rest.
  useEffect(() => {
    if (state.tab !== 'exercises') return;
    let live = true;
    exercisesRepo
      .fuzzy(state.q, { kind: state.kind, difficulty: state.difficulty, beginner: state.beginner || undefined, machine: state.machine })
      .then(
        (r) => {
          if (!live) return;
          setHits(r.hits.map((h) => h.row));
          setHint({ didYouMean: r.didYouMean, setup: r.suggestedSetup, top: r.hits[0]?.row.slug });
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    return () => {
      live = false;
    };
  }, [state.tab, state.q, state.kind, state.difficulty, state.beginner, state.machine]);
  useEffect(() => setShown(PAGE), [search, preset]);

  const hidden = useMemo(() => hiddenSlugs(personal), [personal]);
  const scope = useMemo(() => (hits ? refineExercises(hits, { ...state, category: undefined, sub: undefined }, effective).filter((r) => !hidden.has(r.slug)) : []), [hits, state, effective, hidden]);
  const cats = useMemo(() => countBy(scope, 'category'), [scope]);
  const inCat = useMemo(() => (state.category ? scope.filter((r) => r.category === state.category) : scope), [scope, state.category]);
  const subs = useMemo(() => (state.category ? countBy(inCat, 'subCategory') : []), [inCat, state.category]);
  // Hidden exercises leave the list (and the counts and chips); the "Hidden exercises" view shows only them.
  const results = useMemo(
    () => (hits ? refineExercises(hits, state, effective).filter((r) => hidden.has(r.slug) === showHidden) : []),
    [hits, state, effective, hidden, showHidden],
  );
  const mine = useMemo(() => (hits ? goTos(personal, (s) => hits.find((r) => r.slug === s)?.name) : []), [hits, personal]);
  const mlist = useMemo(() => (machines ? filterMachines(machines, state, effective) : []), [machines, state, effective]);
  const mcats = useMemo(() => (machines ? machineCategories(machines, effective) : []), [machines, effective]);
  const machineName = (slug: string) => machines?.find((m) => m.slug === slug)?.name ?? slug;

  const remember = () => {
    if (state.q.trim().length >= 2) rememberSearch(state.q).then(setRecents, () => undefined);
  };
  const pickPreset = (p: EquipmentPreset) => {
    setPreset(p);
    setEquipmentPreset(p).catch(() => undefined);
  };
  const clearFilters = () => go({ tab: state.tab, q: state.q });

  const loading = state.tab === 'exercises' ? hits === undefined && !failed : machines === undefined && !failed;
  const count = state.tab === 'exercises' ? results.length : mlist.length;
  const countText =
    state.tab === 'exercises'
      ? count === 1 ? t('lib.count.exercises.one') : t('lib.count.exercises', { n: count })
      : count === 1 ? t('lib.count.machines.one') : t('lib.count.machines', { n: count });
  const filtered = sheetFilterCount(state) + (state.category ? 1 : 0) + (state.sub ? 1 : 0) + (state.mcat ? 1 : 0) > 0 || state.q !== '';
  const nFilters = sheetFilterCount(state);

  const sheetMachines = useMemo(() => (machines ?? []).filter((m) => m.slug === state.machine || filterMachines([m], { tab: 'machines', q: '' }, effective).length > 0), [machines, state.machine, effective]);

  return (
    <section class="sf-page-body sf-lib">
      <h1 class="sf-page-title">{t('page.library.title')}</h1>
      <Tabs
        label={t('lib.tabs')}
        active={state.tab}
        onChange={(v: LibraryTab) => go({ ...state, tab: v, sub: undefined })}
        items={[{ value: 'exercises', label: t('lib.tab.exercises') }, { value: 'machines', label: t('lib.tab.machines') }]}
      />

      {equipmentOn && (
        <div class="sf-lib__equip" role="group" aria-label={t('lib.equipment')}>
          {EQUIPMENT_PRESETS.map((p) => (
            <Chip key={p} selected={preset === p} onPress={() => pickPreset(p)}>
              {t(`lib.equipment.${p}` as StringKey)}
            </Chip>
          ))}
          {preset !== 'gym' && <p class="sf-lib__note">{t('lib.equipment.note')}</p>}
        </div>
      )}

      <SearchBox
        value={state.q}
        placeholder={state.tab === 'exercises' ? t('lib.search.exercises') : t('lib.search.machines')}
        onInput={(q) => patch({ q })}
        onCommit={remember}
        didYouMean={state.tab === 'exercises' ? hint.didYouMean : undefined}
        setupChip={
          state.tab === 'exercises' && state.q !== '' && hint.setup && hint.top
            ? {
                label: t('lib.setup.chip', { value: hint.setup.value.replace(/_/g, ' ') }),
                onPress: () => navigate(`/exercise/${hint.top}?setup=${hint.setup?.axis}:${hint.setup?.value}`),
              }
            : undefined
        }
        recents={recents}
        onRemoveRecent={(r) => forgetSearch(r).then(setRecents, () => undefined)}
        onClearRecents={() => clearRecentSearches().then(() => setRecents([]), () => undefined)}
        actions={
          state.tab === 'exercises' ? (
            <>
              <Button variant="secondary" onPress={() => setSheet(true)}>
                {t('lib.filters')}
                {nFilters > 0 ? ` (${nFilters})` : ''}
              </Button>
              {customOn && (
                <Button variant="secondary" onPress={() => navigate('/library/new')}>
                  {t('cx.new')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {state.tab === 'exercises' && cats.length > 0 && (
        <div class="sf-lib__chipgroup" role="group" aria-label={t('lib.category')}>
          <Chip selected={!state.category} onPress={() => patch({ category: undefined, sub: undefined })}>
            {t('lib.category.all')}
          </Chip>
          {cats.map((c) => (
            <Chip key={c.value} selected={state.category === c.value} onPress={() => patch({ category: c.value, sub: undefined })}>
              {nice(c.value)} {c.n}
            </Chip>
          ))}
        </div>
      )}
      {state.tab === 'exercises' && subs.length > 1 && (
        <div class="sf-lib__chipgroup" role="group" aria-label={t('lib.sub')}>
          {subs.map((c) => (
            <Chip key={c.value} selected={state.sub === c.value} onPress={() => patch({ sub: state.sub === c.value ? undefined : c.value })}>
              {nice(c.value)} {c.n}
            </Chip>
          ))}
        </div>
      )}
      {state.tab === 'machines' && machineLabOn && (
        <Link href="/machines" class="sf-lab__link">
          {t('mi.title')}: {t('mi.finder')}
        </Link>
      )}
      {state.tab === 'machines' && mcats.length > 1 && (
        <div class="sf-lib__chipgroup" role="group" aria-label={t('lib.category')}>
          <Chip selected={!state.mcat} onPress={() => patch({ mcat: undefined })}>
            {t('lib.category.all')}
          </Chip>
          {mcats.map((c) => (
            <Chip key={c.value} selected={state.mcat === c.value} onPress={() => patch({ mcat: c.value })}>
              {nice(c.value)} {c.n}
            </Chip>
          ))}
        </div>
      )}

      {state.tab === 'exercises' && !showHidden && state.q === '' && mine.length > 0 && (
        <section aria-label={t('lib.gotos')} class="sf-ex__block">
          <h2 class="sf-ex__h">{t('lib.gotos')}</h2>
          <ul class="sf-lib__list">
            {mine.map((g) => (
              <li key={g.slug} class="sf-lib__row">
                <Link href={`/exercise/${g.slug}`} class="sf-lib__link">
                  <span class="sf-lib__name">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.tab === 'exercises' && (hidden.size > 0 || showHidden) && (
        <Button variant="secondary" onPress={() => setShowHidden(!showHidden)}>
          {showHidden ? t('lib.hidden.back') : t('lib.hidden.show', { n: hidden.size })}
        </Button>
      )}
      {state.tab === 'exercises' && showHidden && <h2 class="sf-ex__h">{t('lib.hidden.title')}</h2>}

      {failed ? (
        <EmptyState icon="warning" title={t('lib.error')} />
      ) : loading ? (
        <p class="sf-lib__note" role="status">{t('lib.loading')}</p>
      ) : (
        <>
          <p class="sf-lib__count" role="status" aria-live="polite">{countText}</p>
          {count === 0 ? (
            <EmptyState icon="magnifying-glass" title={t('lib.empty.title')} hint={t('lib.empty.hint')} actionLabel={filtered ? t('lib.empty.clear') : undefined} onAction={clearFilters} />
          ) : state.tab === 'exercises' ? (
            <>
              <ul class="sf-lib__list">
                {results.slice(0, shown).map((r) => (
                  <li key={r.slug} class="sf-lib__row">
                    <Link href={`/exercise/${r.slug}`} class="sf-lib__link">
                      <span class="sf-lib__name">{r.name}</span>
                      <span class="sf-lib__meta">
                        {r.custom ? t('lib.custom') : nice(r.category)}
                        {r.machine ? ` · ${machineName(r.machine)}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {results.length > shown && (
                <Button variant="secondary" onPress={() => setShown(shown + PAGE)}>
                  {t('lib.more', { n: Math.min(PAGE, results.length - shown) })}
                </Button>
              )}
            </>
          ) : (
            <ul class="sf-lib__machines">
              {mlist.map((m) => (
                <li key={m.slug}>
                  <Link href={`/machine/${m.slug}`} class="sf-lib__mcard">
                    <MachineThumb slug={m.slug} name={m.name} />
                    <span class="sf-lib__name">{m.name}</span>
                    <span class="sf-lib__meta">{nice(m.category)}</span>
                    {machineStatusFor(m.slug, m.status).status !== 'active' && <Badge>{t(`lib.status.${machineStatusFor(m.slug, m.status).status}` as StringKey)}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('lib.filters.title')}>
        <div class="sf-lib__sheet">
          <Select
            label={t('lab.filter.kind')}
            value={state.kind ?? ANY}
            options={[{ value: ANY, label: t('lab.filters.any') }, ...['strength', 'bodyweight', 'cardio'].map((k) => ({ value: k, label: nice(k) }))]}
            onChange={(v) => patch({ kind: v === ANY ? undefined : v })}
          />
          <Select
            label={t('lab.filter.difficulty')}
            value={state.difficulty === undefined ? ANY : String(state.difficulty)}
            options={[{ value: ANY, label: t('lab.filters.any') }, ...['1', '2', '3'].map((d) => ({ value: d, label: t(`lab.filter.difficulty.${d}` as StringKey) }))]}
            onChange={(v) => patch({ difficulty: v === ANY ? undefined : Number(v) })}
          />
          <Select
            label={t('lib.filter.machine')}
            value={state.machine ?? ANY}
            options={[{ value: ANY, label: t('lab.filters.any') }, ...sheetMachines.map((m) => ({ value: m.slug, label: m.name }))]}
            onChange={(v) => patch({ machine: v === ANY ? undefined : v })}
          />
          <Toggle checked={!!state.beginner} onChange={(v) => patch({ beginner: v || undefined })} label={t('lab.filter.beginner')} />
          <Toggle checked={!!state.unilateral} onChange={(v) => patch({ unilateral: v || undefined })} label={t('lab.filter.unilateral')} />
          <div class="sf-lib__sheetbtns">
            {nFilters > 0 && (
              <Button variant="ghost" onPress={() => go({ ...state, kind: undefined, difficulty: undefined, machine: undefined, beginner: undefined, unilateral: undefined })}>
                {t('lib.filters.clear')}
              </Button>
            )}
            <Button onPress={() => setSheet(false)}>{t('lib.filters.done')}</Button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
