import { MuscleOfWeekCard } from '../recap/MuscleOfWeekCard';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { Link } from 'wouter-preact';
import type { LabData } from '../../data/repos/lab';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { EmptyState, Segmented } from '../../ui/components';
import { BodyPicker, MuscleChips, viewsOf, type Sex, type View } from '../../ui/body';
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
  const [sex, setSex] = useState<Sex>(SHAPE[0]);
  const [view, setView] = useState<View>('front');
  const [sel, setSel] = useState<string | undefined>();
  const panelRef = useRef<HTMLDivElement>(null);

  const pick = (id: string | undefined) => {
    setSel(id);
    if (id) {
      const v = viewsOf(id);
      if (v.length > 0 && !v.includes(view)) setView(v[0] as View);
    }
  };
  useEffect(() => {
    if (sel) panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [sel]);

  if (!on) return <EmptyState icon="info" title={t('lab.off.title')} hint={t('lab.off.hint')} />;
  return (
    <section class="sf-page-body sf-lab">
      <h1 class="sf-page-title">{t('page.body.title')}</h1>
      <MuscleOfWeekCard />
      {(recoveryOn || marksOn || atlasOn) && (
        <div class="sf-lab__actions">
          {recoveryOn && <Link href="/body/recovery" class="sf-lab__link">{t('rc.recovery.link')}</Link>}
          {marksOn && <Link href="/body/marks" class="sf-lab__link">{t('rc.marks.link')}</Link>}
          {atlasOn && <Link href="/atlas" class="sf-lab__link">{t('atlas.link')}</Link>}
        </div>
      )}
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
            <Explorer data={data} sex={sex} view={view} sel={sel} onSex={setSex} onView={setView} onPick={pick} panelRef={panelRef} />
          )
        }
      </LoadGate>
    </section>
  );
}


function Explorer({ data, sex, view, sel, onSex, onView, onPick, panelRef }: { data: LabData; sex: Sex; view: View; sel?: string; onSex: (s: Sex) => void; onView: (v: View) => void; onPick: (id: string | undefined) => void; panelRef: Ref<HTMLDivElement> }) {
  const counts = useMemo(() => countByMuscle(data.candidates, data.tax.ids, data.tax), [data]);
  return (
    <>
      <p class="sf-lab__note">{t('lab.hint')}</p>
      <BodyPicker mode="pick-one" sex={sex} view={view} onSexChange={onSex} onViewChange={onView} value={sel ? [sel] : []} onChange={(ids) => onPick(ids[0])} />
      <MuscleChips mode="pick-one" value={sel ? [sel] : []} onChange={(ids) => onPick(ids[0])} counts={counts} />
      <div ref={panelRef} class="sf-lab__anchor">
        {sel && (
          <>
            <LabPanel data={data} muscle={sel} view={view} onPickMuscle={onPick} onShowView={onView} />
            <Link href={`/muscle/${sel}`} class="sf-lab__link">
              {t('lab.open')}: {muscleName(sel)}
            </Link>
          </>
        )}
      </div>
    </>
  );
}
