import { useState } from 'preact/hooks';
import { useLocation, useParams } from 'wouter-preact';
import { t } from '../../i18n';
import { EmptyState, SubPageHeader } from '../../ui/components';
import { BodyPicker, isMuscle, viewsOf, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { LabPanel, LoadGate, muscleName, useLabData } from './LabPanel';
import { goBack } from '../../app/navBack';

/** `/muscle/<id>`: one muscle's page (same list as the explorer, with a compact figure). */
export default function MusclePage() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { state, reload } = useLabData();
  const known = isMuscle(id);
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>((known ? viewsOf(id)[0] : undefined) ?? 'front');
  return (
    <section class="sf-page-body sf-lab">
      <SubPageHeader title={known ? muscleName(id) : t('page.muscle.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('lab.muscle.back')} />
      {!known ? (
        <EmptyState icon="info" title={t('lab.muscle.unknown')} actionLabel={t('lab.muscle.back')} onAction={() => navigate('/body')} />
      ) : (
        <>
          <BodyPicker mode="view" size="compact" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} emphasis={{ [id]: 'primary' }} />
          <LoadGate state={state} reload={reload}>
            {(data) => <LabPanel data={data} muscle={id} view={view} onShowView={setView} onPickMuscle={(m) => navigate(`/muscle/${m}`)} />}
          </LoadGate>
        </>
      )}
    </section>
  );
}
