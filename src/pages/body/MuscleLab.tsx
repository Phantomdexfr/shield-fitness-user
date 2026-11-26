import { MuscleOfWeekCard } from '../recap/MuscleOfWeekCard';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { Link } from 'wouter-preact';
import type { LabData } from '../../data/repos/lab';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { EmptyState, Segmented, Row, RowGroup, Sheet } from '../../ui/components';
import { useUx } from '../../ui/useUx';
import { loadBodyLayout, type BodyLayout } from '../../data/repos/uiSections';
import { BodyPicker, MuscleChips, viewsOf, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { countByMuscle } from './labData';
import { LabPanel, LoadGate, muscleName, useLabData } from './LabPanel';
import { WorkedPanel } from './WorkedPanel';

type Mode = 'find' | 'worked';
const SHAPE = ['male', 'female'] as const;

/** `/body`: the Muscle Lab explorer. [A] The selected muscle's list opens inline under the figure (not in a sheet). */
export default function MuscleLab() {
  const on = useFeature('muscle_lab');
  const recoveryOn = useFeature('recovery_clock');
  const marksOn = useFeature('injury_marks');
  const atlasOn = useFeature('holo_atlas');
  const { state, reload } = useLabData();
  const [mode, setMode] = useState<Mode>('find');
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [sel, setSel] = useState<string | undefined>();
  const panelRef = useRef<HTMLDivElement>(null);
  // Phase 106: Premium layout = figure first (the muscle opens in a half-height sheet); List first = the page as it was (inline panel).
  const premium = useUx('layout') === 'premium';
  const [layout, setLayout] = useState<BodyLayout>('figure');
  useEffect(() => {
    void loadBodyLayout().then(setLayout);
  }, []);
  const figureFirst = premium && layout === 'figure';

  const pick = (id: string | undefined) => {
    setSel(id);
    if (id) {
      const v = viewsOf(id);
      if (v.length > 0 && !v.includes(view)) setView(v[0] as View);
    }
  };
  useEffect(() => {
    if (sel && !figureFirst) panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [sel, figureFirst]);

  const links =
    recoveryOn || marksOn || atlasOn ? (
      figureFirst ? (
        <RowGroup>
          {recoveryOn && <Row href="/body/recovery">{t('rc.recovery.link')}</Row>}
          {marksOn && <Row href="/body/marks">{t('rc.marks.link')}</Row>}
          {atlasOn && <Row href="/atlas">{t('atlas.link')}</Row>}
          {atlasOn && <Row href="/anatomy">{t('atlas.anatomyLink')}</Row>}
        </RowGroup>
      ) : (
        <div class="sf-lab__actions">
          {recoveryOn && <Row href="/body/recovery">{t('rc.recovery.link')}</Row>}
          {marksOn && <Row href="/body/marks">{t('rc.marks.link')}</Row>}
          {atlasOn && <Row href="/atlas">{t('atlas.link')}</Row>}
          {atlasOn && <Row href="/anatomy">{t('atlas.anatomyLink')}</Row>}
        </div>
      )
    ) : null;
  if (!on) return <EmptyState icon="info" title={t('lab.off.title')} hint={t('lab.off.hint')} />;
  return (
    <section class="sf-page-body sf-lab">
      <h1 class="sf-page-title">{t('page.body.title')}</h1>
      {!figureFirst && <MuscleOfWeekCard />}
      {!figureFirst && links}
      <Segmented<Mode>
        label={t('lab.mode.label')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'find', label: t('lab.mode.find') },
          { value: 'worked', label: t('lab.mode.worked') },
        ]}
      />
      <LoadGate state={state} reload={reload}>
        {(data) =>
          mode === 'worked' ? (
            <WorkedPanel data={data} sex={sex} view={view} onSex={setSex} onView={setView} />
          ) : (
            <Explorer figureFirst={figureFirst} data={data} sex={sex} view={view} sel={sel} onSex={setSex} onView={setView} onPick={pick} panelRef={panelRef} />
          )
        }
      </LoadGate>
      {figureFirst && (
        <>
          {links}
          <MuscleOfWeekCard />
        </>
      )}
    </section>
  );
}


function Explorer({ figureFirst, data, sex, view, sel, onSex, onView, onPick, panelRef }: { figureFirst: boolean; data: LabData; sex: Sex; view: View; sel?: string; onSex: (s: Sex) => void; onView: (v: View) => void; onPick: (id: string | undefined) => void; panelRef: Ref<HTMLDivElement> }) {
  const counts = useMemo(() => countByMuscle(data.candidates, data.tax.ids, data.tax), [data]);
  return (
    <>
      <p class="sf-lab__note">{t('lab.hint')}</p>
      <div class={figureFirst ? 'sf-lab__hero' : undefined}>
      <BodyPicker mode="pick-one" sex={sex} view={view} onSexChange={onSex} onViewChange={onView} value={sel ? [sel] : []} onChange={(ids) => onPick(ids[0])} />
      </div>
      <MuscleChips mode="pick-one" value={sel ? [sel] : []} onChange={(ids) => onPick(ids[0])} counts={counts} />
      {figureFirst ? (
        <Sheet open={!!sel} onClose={() => onPick(undefined)} title={sel ? muscleName(sel) : ''} detent="medium">
          {sel && (
            <div ref={panelRef} class="sf-lab__anchor">
              <LabPanel data={data} muscle={sel} view={view} onPickMuscle={onPick} onShowView={onView} />
              <Row href={`/muscle/${sel}`}>
                {t('lab.open')}: {muscleName(sel)}
              </Row>
            </div>
          )}
        </Sheet>
      ) : (
        <div ref={panelRef} class="sf-lab__anchor">
          {sel && (
            <>
              <LabPanel data={data} muscle={sel} view={view} onPickMuscle={onPick} onShowView={onView} />
              <Row href={`/muscle/${sel}`}>
                {t('lab.open')}: {muscleName(sel)}
              </Row>
            </>
          )}
        </div>
      )}
    </>
  );
}
