import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link, useLocation, useParams } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { loadMachineLab, type MachineLabData } from '../../data/repos/machineLab';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { Collapsible, CollapseAll, Button, Chip, EmptyState, SubPageHeader, Row } from '../../ui/components';
import { nice } from '../exercise/exerciseModel';
import {
  chipGroups, exercisesReaching, heatFor, notReachable, reachedCount, rowsFor, selectionKeys, textTwin, toggleChip, COMPANION_AXES,
  type CompanionAxis, type Selection,
} from './machineLabModel';
import { goBack } from '../../app/navBack';

type State = { status: 'loading' } | { status: 'missing' } | { status: 'nodata' } | { status: 'error' } | { status: 'ready'; data: MachineLabData };

const muscleName = (id: string): string => t(`muscle.${id}` as StringKey);
const PAGE = 12;

/** `/machines/<slug>/lab`: what this machine can reach, from our data. Never claims a machine cannot train a muscle. */
export default function MachineLabPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const on = useFeature('machine_lab');
  const [state, setState] = useState<State>({ status: 'loading' });
  const back = () => goBack(navigate, `/machine/${slug}`);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadMachineLab(slug).then(
      (data) => live && setState(data === undefined ? { status: 'missing' } : data === null ? { status: 'nodata' } : { status: 'ready', data }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  if (!on || state.status !== 'ready') {
    const msg = state.status === 'missing' ? t('ml.unknown') : state.status === 'nodata' ? t('ml.nodata') : t('ml.error');
    return (
      <section class="sf-page-body sf-ml">
        <SubPageHeader title={t('page.machinelab.title')} onBack={back} backLabel={t('ml.back')} />
        {on && state.status === 'loading' ? <p class="sf-lib__note" role="status">{t('ex.loading')}</p> : <EmptyState icon="warning" title={msg} actionLabel={t('ml.back')} onAction={back} />}
      </section>
    );
  }
  return (
    <section class="sf-page-body sf-ml">
      <SubPageHeader title={`${state.data.machine.name}: ${t('mc.lab')}`} onBack={back} backLabel={t('ml.back')} />
      <MachineLabView data={state.data} />
    </section>
  );
}

/** Presentational: everything comes from `data`, so it can be rendered in tests without loading the dataset. */
export function MachineLabView({ data }: { data: MachineLabData }) {
  const { entry, file, inputs, tax } = data;
  const [sel, setSel] = useState<Selection>({});
  const [muscle, setMuscle] = useState<string | undefined>();
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [shown, setShown] = useState(PAGE);

  const groups = useMemo(() => chipGroups(entry), [entry]);
  const { rows } = useMemo(() => rowsFor(entry, sel, inputs), [entry, sel, inputs]);
  const heat = useMemo(() => heatFor(rows), [rows]);
  const twin = useMemo(() => textTwin(rows), [rows]);
  const missing = useMemo(() => notReachable(file.muscles, rows), [file, rows]);
  const list = useMemo(() => (muscle ? exercisesReaching(tax.expand(muscle), sel, inputs) : []), [muscle, sel, inputs, tax]);
  const filtered = selectionKeys(sel).length > 0;

  const onChip = (axis: CompanionAxis, value: string) => {
    setSel((s) => toggleChip(s, axis, value));
    setShown(PAGE);
  };
  const pick = (id: string | undefined) => {
    setMuscle(id);
    setShown(PAGE);
  };
  const setupText = (s: Selection): string => COMPANION_AXES.filter((a) => s[a]).map((a) => `${t(`ml.axis.${a}` as StringKey)}: ${nice(s[a] as string)}`).join(', ');
  const linkFor = (slug: string, s: Selection): string => {
    const axis = COMPANION_AXES.find((a) => s[a]);
    return axis ? `/exercise/${slug}?setup=${axis}:${s[axis]}` : `/exercise/${slug}`;
  };

  return (
    <>
      <p class="sf-lab__note">{t('ml.intro')}</p>
      <p class="sf-ml__sum" role="status">
        {t('ml.summary', { n: reachedCount(rows), total: file.muscles.length })} · {t('ml.summary.exercises', { n: entry.n })}
      </p>

      {groups.length > 0 && (
        <Collapsible id="filters" title={t('ml.chips')} summary={filtered ? t('ml.clear') : undefined}>
          {groups.map((g) => (
            <div key={g.axis} class="sf-ml__group" role="group" aria-label={t(`ml.axis.${g.axis}` as StringKey)}>
              <h2 class="sf-ex__h">{t(`ml.axis.${g.axis}` as StringKey)}</h2>
              <div class="sf-ex__chips">
                {g.values.map((v) => (
                  <Chip key={v.value} selected={sel[g.axis] === v.value} onPress={() => onChip(g.axis, v.value)}>
                    {nice(v.value)}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {filtered && (
            <Button variant="secondary" onPress={() => setSel({})}>
              {t('ml.clear')}
            </Button>
          )}
        </Collapsible>
      )}

      {rows.length === 0 ? (
        <div class="sf-ml__none" role="status">
          <h2 class="sf-ex__h">{t('ml.none.title')}</h2>
          <p class="sf-lab__note">{t('ml.none.body')}</p>
        </div>
      ) : (
        <div role="group" aria-label={t('ml.figure')}>
          <BodyPicker mode="pick-one" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} heat={heat} value={muscle ? [muscle] : []} onChange={(ids) => pick(ids[0])} />
        </div>
      )}

      {muscle ? (
        <Collapsible id="list" title={t('ml.list.title', { muscle: muscleName(muscle) })} defaultOpen>
          {list.length === 0 ? (
            <p class="sf-lab__note">{t('ml.list.none', { muscle: muscleName(muscle) })}</p>
          ) : (
            <>
              <ul class="sf-lib__list">
                {list.slice(0, shown).map((e) => (
                  <li key={e.slug} class="sf-lib__row">
                    <Row href={linkFor(e.slug, e.setup)}>
                      <span class="sf-lib__name">{data.names[e.slug] ?? nice(e.slug)}</span>
                      <span class="sf-lib__meta">{selectionKeys(e.setup).length > 0 ? t('ml.list.with', { setup: setupText(e.setup) }) : t(`ml.strength.${textTwin([[muscle, e.weight, 1]])[0]?.strength ?? 'faint'}` as StringKey)}</span>
                    </Row>
                  </li>
                ))}
              </ul>
              {list.length > shown && (
                <Button variant="secondary" onPress={() => setShown(shown + PAGE)}>
                  {t('ml.list.more')}
                </Button>
              )}
            </>
          )}
        </Collapsible>
      ) : (
        rows.length > 0 && <p class="sf-lab__note">{t('ml.pick')}</p>
      )}

      {entry.modes.length > 0 && (
        <Collapsible id="modes" title={t('ml.modes')}>
          <ul class="sf-ex__list">
            {entry.modes.map(([value, exercise, label]) => (
              <li key={value}>{exercise ? <Link href={`/exercise/${exercise}`}>{label}</Link> : label}</li>
            ))}
          </ul>
        </Collapsible>
      )}

      <Collapsible id="title" title={t('ml.twin.title')}>
        {twin.length === 0 ? (
          <p class="sf-lab__note" data-hook="reach-twin">{t('ml.none.title')}</p>
        ) : (
          <ul class="sf-ex__list" data-hook="reach-twin">
            {twin.map((r) => (
              <li key={r.muscle}>{t('ml.twin.row', { muscle: muscleName(r.muscle), strength: t(`ml.strength.${r.strength}` as StringKey), n: r.count })}</li>
            ))}
          </ul>
        )}
      </Collapsible>

      {missing.length > 0 && (
        <div data-hook="not-reachable">
          <Collapsible id="notreach" title={t('ml.notreach')}>
            <p class="sf-ex__line">{missing.map(muscleName).join(' · ')}</p>
            <p class="sf-lab__note">{t('ml.notreach.note')}</p>
          </Collapsible>
        </div>
      )}
    </>
  );
}
