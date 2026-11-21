import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { loadMachineIndex, type MachineIndexData } from '../../data/repos/machineLab';
import { machineFinder } from '../body/labData';
import { Badge, EmptyState, Input, Segmented, Select, SubPageHeader } from '../../ui/components';
import { nice } from '../exercise/exerciseModel';
import { indexRows, sortIndex, type IndexSort } from './machineLabModel';
import { goBack } from '../../app/navBack';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: MachineIndexData };

const SORTS: IndexSort[] = ['reach', 'name', 'zone'];
const muscleName = (id: string): string => t(`muscle.${id}` as StringKey);

/** `/machines`: all machines, sortable by muscles reached, with the machine finder (shared with the Muscle Lab). */
export default function MachineIndexPage() {
  const [, navigate] = useLocation();
  const on = useFeature('machine_lab');
  const finderOn = useFeature('machine_finder');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [sort, setSort] = useState<IndexSort>('reach');
  const [q, setQ] = useState('');
  const [finderMuscle, setFinderMuscle] = useState('');
  const back = () => goBack(navigate, '/library?tab=machines');

  useEffect(() => {
    let live = true;
    loadMachineIndex().then(
      (data) => live && setState(data ? { status: 'ready', data } : { status: 'error' }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const rows = useMemo(() => (data ? sortIndex(indexRows(data.file, data.machines), sort, q) : []), [data, sort, q]);
  const finder = useMemo(() => (data && finderMuscle ? machineFinder(data.file, finderMuscle, data.tax, data.machines) : []), [data, finderMuscle]);

  if (!on || !data) {
    return (
      <section class="sf-page-body sf-ml">
        <SubPageHeader title={t('mi.title')} onBack={back} backLabel={t('mi.back')} />
        {on && state.status === 'loading' ? <p class="sf-lib__note" role="status">{t('ex.loading')}</p> : <EmptyState icon="warning" title={t('mi.error')} actionLabel={t('mi.back')} onAction={back} />}
      </section>
    );
  }

  const options = [{ value: '', label: t('mi.finder.pick') }, ...data.file.muscles.map((m) => ({ value: m, label: muscleName(m) }))];
  return (
    <section class="sf-page-body sf-ml">
      <SubPageHeader title={t('mi.title')} onBack={back} backLabel={t('mi.back')} />

      {finderOn && (
        <section aria-label={t('mi.finder')} class="sf-ex__block">
          <Select label={t('mi.finder')} options={options} value={finderMuscle} onChange={setFinderMuscle} />
          {finderMuscle && finder.length > 0 && (
            <>
              <h2 class="sf-ex__h">{t('mi.finder.title', { muscle: muscleName(finderMuscle) })}</h2>
              <ul class="sf-lib__list">
                {finder.map((m) => (
                  <li key={m.slug} class="sf-lib__row">
                    <Link href={`/machines/${m.slug}/lab`} class="sf-lib__link">
                      <span class="sf-lib__name">{m.name}</span>
                      <span class="sf-lib__meta">{t('lab.machines.exercises', { n: m.exercises })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <Input label={t('mi.search')} {...{ type: 'search', value: q, placeholder: t('mi.search'), autoComplete: 'off' }} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      <Segmented label={t('mi.sort')} value={sort} onChange={(v: IndexSort) => setSort(v)} options={SORTS.map((s) => ({ value: s, label: t(`mi.sort.${s}` as StringKey) }))} />

      {rows.length === 0 ? (
        <p class="sf-lib__note" role="status">{t('mi.none')}</p>
      ) : (
        <ul class="sf-lib__list">
          {rows.map((m) => (
            <li key={m.slug} class="sf-lib__row">
              <Link href={`/machines/${m.slug}/lab`} class="sf-lib__link">
                <span class="sf-lib__name">{m.name}</span>
                <span class="sf-lib__meta">{t('mi.reaches', { n: m.reached, total: m.total })}</span>
                <span class="sf-ex__chips">
                  <Badge>{nice(m.category)}</Badge>
                  <Badge>{m.zone ?? t('mi.nozone')}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
