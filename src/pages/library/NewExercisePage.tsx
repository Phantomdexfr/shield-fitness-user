import { useEffect, useState } from 'preact/hooks';
import { useLocation, useParams } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { en } from '../../i18n/en';
import { useFeature } from '../../app/flags';
import { Button, EmptyState, Input, Segmented, Select, Stepper, SubPageHeader } from '../../ui/components';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { PatternPreview } from '../../ui/movement/MovementSection';
import { listMachines } from '../../data/repos/library';
import { getCustom, saveCustom } from '../../data/repos/customExercises';
import { loadMovementData } from '../../data/repos/movement';
import type { Machine } from '../../dataset/loader';
import type { MovementData } from '../../shared/movement';
import { applyPicked, draftFromStored, EMPTY_DRAFT, pickerEmphasis, setMuscle, type CustomDraft, type CustomEmphasis, type CustomErrors, type CustomField, type CustomKind, type CustomRole } from '../../shared/customExercise';
import { muscleLabel } from '../exercise/muscleLabel';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'ready' };

/** Turns an error code into text: `cx.err.<code>` first, then the shared `validation.<code>` strings. */
function errText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const own = `cx.err.${code}`;
  const shared = `validation.${code}`;
  if (own in en) return t(own as StringKey);
  if (shared in en) return t(shared as StringKey);
  return t('cx.err.save');
}

/** `/library/new` (create) and `/exercise/:slug/edit` (edit). Muscles are tapped on the Body Picker, then given a role and emphasis below it. */
export default function NewExercisePage() {
  const { slug } = useParams<{ slug?: string }>();
  const [, navigate] = useLocation();
  const movementOn = useFeature('movement_map');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [draft, setDraft] = useState<CustomDraft>({ ...EMPTY_DRAFT, muscles: [] });
  const [errors, setErrors] = useState<CustomErrors>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  const [movement, setMovement] = useState<MovementData | null>(null);
  const [sex, setSex] = useState<Sex>('male');
  const [view, setView] = useState<View>('front');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    Promise.all([slug ? getCustom(slug) : Promise.resolve(undefined), listMachines(), loadMovementData()]).then(
      ([existing, ms, mv]) => {
        if (!live) return;
        setMachines(ms);
        setMovement(mv);
        if (slug && !existing) return setLoad({ status: 'missing' });
        if (existing) setDraft(draftFromStored(existing));
        setLoad({ status: 'ready' });
      },
      () => live && setLoad({ status: 'missing' }),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  const back = () => goBack(navigate, slug ? `/exercise/${slug}` : '/library');
  const title = slug ? t('cx.edit.title') : t('cx.new.title');
  const patch = (p: Partial<CustomDraft>, field?: CustomField) => {
    setDraft((d) => ({ ...d, ...p }));
    if (field) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  if (load.status !== 'ready') {
    return (
      <section class="sf-page-body sf-cx">
        <SubPageHeader title={title} onBack={back} backLabel={t('cx.cancel')} />
        {load.status === 'loading' ? <p class="sf-lib__note" role="status">{t('ex.loading')}</p> : <EmptyState icon="warning" title={t('ex.unknown')} actionLabel={t('ex.back')} onAction={() => navigate('/library')} />}
      </section>
    );
  }

  const save = () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    saveCustom(draft, slug).then(
      (r) => {
        setSaving(false);
        if (r.ok) return navigate(`/exercise/${r.slug}`);
        setErrors(r.errors);
      },
      () => {
        setSaving(false);
        setFailed(true);
      },
    );
  };

  const roleOptions = (['primary', 'secondary', 'stabiliser'] as CustomRole[]).map((v) => ({ value: v, label: t(`cx.role.${v}` as StringKey) }));
  const emphasisOptions = (['high', 'medium', 'low'] as CustomEmphasis[]).map((v) => ({ value: v, label: t(`cx.emphasis.${v}` as StringKey) }));
  const kindOptions = (['strength', 'cardio', 'bodyweight'] as CustomKind[]).map((v) => ({ value: v, label: t(`cx.kind.${v}` as StringKey) }));
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <section class="sf-page-body sf-cx">
      <SubPageHeader title={title} onBack={back} backLabel={t('cx.cancel')} />

      <Input
        label={t('cx.name')}
        hint={t('cx.name.hint')}
        {...{ value: draft.name, autoComplete: 'off' }}
        {...(errors.name ? { error: errText(errors.name) as string } : {})}
        onInput={(e) => patch({ name: (e.currentTarget as HTMLInputElement).value }, 'name')}
      />

      <Segmented label={t('cx.kind')} options={kindOptions} value={draft.kind} onChange={(kind) => patch({ kind }, 'kind')} />

      <Select
        label={t('cx.machine')}
        value={draft.machineSlug}
        options={[{ value: '', label: t('cx.machine.none') }, ...machines.map((m) => ({ value: m.slug, label: m.name }))]}
        onChange={(machineSlug) => patch({ machineSlug }, 'machine')}
        {...(errors.machine ? { error: errText(errors.machine) as string } : {})}
      />

      <section aria-label={t('cx.muscles')} class="sf-ex__block">
        <h2 class="sf-ex__h">{t('cx.muscles')}</h2>
        <p class="sf-lib__note">{t('cx.muscles.hint')}</p>
        <BodyPicker
          mode="pick-many"
          size="compact"
          sex={sex}
          view={view}
          onSexChange={setSex}
          onViewChange={setView}
          value={draft.muscles.map((m) => m.id)}
          emphasis={pickerEmphasis(draft.muscles)}
          onChange={(ids) => patch({ muscles: applyPicked(draft.muscles, ids) }, 'muscles')}
        />
        {draft.muscles.length === 0 && <p class="sf-lib__note">{t('cx.muscles.empty')}</p>}
        {draft.muscles.map((m) => (
          <div key={m.id} class="sf-cx__mrow">
            <div class="sf-cx__mhead">
              <span class="sf-cx__mname">{muscleLabel(m.id)}</span>
              <Button variant="ghost" onPress={() => patch({ muscles: draft.muscles.filter((x) => x.id !== m.id) }, 'muscles')}>
                {t('cx.muscle.remove', { name: muscleLabel(m.id) })}
              </Button>
            </div>
            <Segmented label={t('cx.role')} options={roleOptions} value={m.role} onChange={(role) => patch({ muscles: setMuscle(draft.muscles, m.id, { role }) }, 'muscles')} />
            <Segmented label={t('cx.emphasis')} options={emphasisOptions} value={m.emphasis} onChange={(emphasis) => patch({ muscles: setMuscle(draft.muscles, m.id, { emphasis }) }, 'muscles')} />
          </div>
        ))}
        {errors.muscles && <p class="sf-cx__error" role="alert">{errText(errors.muscles)}</p>}
      </section>

      <section aria-label={t('cx.reps')} class="sf-ex__block">
        <h2 class="sf-ex__h">{t('cx.reps')}</h2>
        <div class="sf-cx__reps">
          <Stepper label={t('cx.reps.min')} value={draft.repMin} min={1} max={1000} step={1} onChange={(repMin) => patch({ repMin }, 'reps')} />
          <Stepper label={t('cx.reps.max')} value={draft.repMax} min={1} max={1000} step={1} onChange={(repMax) => patch({ repMax }, 'reps')} />
        </div>
        {errors.reps && <p class="sf-cx__error" role="alert">{errText(errors.reps)}</p>}
      </section>

      {movementOn && (
        <section aria-label={t('cx.pattern.title')} class="sf-ex__block">
          <h2 class="sf-ex__h">{t('cx.pattern.title')}</h2>
          <PatternPreview data={movement} value={{ patternId: draft.patternId, param: draft.param }} onChange={(v) => patch({ patternId: v.patternId, param: v.param })} sex={sex} name={draft.name.trim()} />
        </section>
      )}

      <Input
        label={t('cx.youtube')}
        hint={t('cx.youtube.hint')}
        {...{ value: draft.youtube, autoComplete: 'off', inputMode: 'url' }}
        {...(errors.youtube ? { error: errText(errors.youtube) as string } : {})}
        onInput={(e) => patch({ youtube: (e.currentTarget as HTMLInputElement).value }, 'youtube')}
      />

      <Input
        label={t('cx.notes')}
        hint={t('cx.notes.hint')}
        {...{ value: draft.notes, autoComplete: 'off' }}
        {...(errors.notes ? { error: errText(errors.notes) as string } : {})}
        onInput={(e) => patch({ notes: (e.currentTarget as HTMLInputElement).value }, 'notes')}
      />

      {hasErrors && <p class="sf-cx__error" role="alert">{t('cx.form.problems')}</p>}
      {failed && <p class="sf-cx__error" role="alert">{t('cx.err.save')}</p>}
      <div class="sf-cx__actions">
        <Button onPress={save} disabled={saving}>
          {saving ? t('cx.saving') : t('cx.save')}
        </Button>
        <Button variant="secondary" onPress={back}>
          {t('cx.cancel')}
        </Button>
      </div>
    </section>
  );
}
