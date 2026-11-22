import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link, useLocation, useParams, useSearch } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { setFavourite, setHidden, setNote } from '../../data/repos/personal';
import { EMPTY_PERSONAL, NOTE_MAX, type Personal } from '../../shared/personal';
import { dismissCue, loadExercisePage, policyYoutubeFor, setChosenSetup, setChosenVariation, type ExercisePageData } from '../../data/repos/exercisePage';
import { Collapsible, CollapseAll, Badge, Button, Chip, Dialog, EmptyState, PhotoFrame, SubPageHeader, Row } from '../../ui/components';
import { BodyPicker, viewsOf, isMuscle, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { FormCueCard } from './FormCueCard';
import { SetupPicker } from '../../ui/setup/SetupPicker';
import { addedBySetup, cleanSetup, offeredAxes, setupEffect, setupFromSearch, setupWeights } from './setupModel';
import type { Setup } from '../../shared/setup';
import { muscleLabel } from './muscleLabel';
import { AiReviewSheet } from '../aiReview/AiReviewSheet';
import { loadMovementData, loadMovementFor, type MovementFor } from '../../data/repos/movement';
import { deleteCustom } from '../../data/repos/customExercises';
import { ProposeToGym } from './ProposeToGym';
import { MovementSection } from '../../ui/movement/MovementSection';
import { chipMuscles } from '../../ui/movement/movementModel';
import { paramsFromSetup } from '../../shared/movement';
import { nice, bodyEmphasis, buildCueCard, cardPhoto, difficultyDots, groupMuscles, hasContested, repRangeText, resolveYoutubeUrl, statusTone, toggleVariation, variationAdds, type RoleGroup } from './exerciseModel';
import { goBack } from '../../app/navBack';


type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: ExercisePageData };

function Dots({ n }: { n: number }) {
  return (
    <span class="sf-ex__dots" role="img" aria-label={t('ex.difficulty', { n })}>
      {difficultyDots(n).map((on, i) => (
        <span key={i} class={on ? 'sf-ex__dot sf-ex__dot--on' : 'sf-ex__dot'} />
      ))}
    </span>
  );
}

/** `/exercise/<slug>` (custom exercises too). Sections follow docs/EXERCISE_PAGE.md. */
export default function ExercisePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const youtubeOn = useFeature('youtube_links');
  const cuesOn = useFeature('form_cues');
  const photosOn = useFeature('machine_photos');
  const setupOn = useFeature('setup_options');
  const movementOn = useFeature('movement_map');
  const aiOn = useFeature('ai_review_export');
  const [aiOpen, setAiOpen] = useState(false);
  const search = useSearch();
  const [setup, setSetup] = useState<Setup>({});
  const [state, setState] = useState<State>({ status: 'loading' });
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [variation, setVariation] = useState<string | undefined>();
  const [cueGone, setCueGone] = useState(false);
  const [movement, setMovement] = useState<MovementFor | null | undefined>(undefined);
  const [personal, setPersonal] = useState<Personal>(EMPTY_PERSONAL);
  const [noteText, setNoteText] = useState('');
  const [noteMsg, setNoteMsg] = useState<'' | 'saved' | 'error'>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customOn = useFeature('custom_exercises');

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadExercisePage(slug).then(
      (data) => {
        if (!live) return;
        if (!data) return setState({ status: 'missing' });
        setVariation(data.variation);
        setSetup(cleanSetup({ ...data.setup, ...setupFromSearch(search) }, data.setupOffer));
        setCueGone(data.cueDismissed);
        setPersonal(data.personal);
        setNoteText(data.personal.note);
        setNoteMsg('');
        const first = data.row.primary.find(isMuscle);
        setView((first ? viewsOf(first)[0] : undefined) ?? 'front');
        setState({ status: 'ready', data });
      },
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    let live = true;
    setMovement(undefined);
    if (movementOn && !slug.startsWith('my-')) loadMovementFor(slug).then((m) => live && setMovement(m), () => live && setMovement(null));
    return () => {
      live = false;
    };
  }, [slug, movementOn]);

  // A custom exercise stores its own pattern (chosen in the creator); a dataset exercise's comes from the compiled map above.
  const customPattern = state.status === 'ready' ? state.data.customPattern : undefined;
  const isCustom = state.status === 'ready' && state.data.row.custom;
  useEffect(() => {
    if (!movementOn || !isCustom) return;
    let live = true;
    if (!customPattern) {
      setMovement(null);
      return;
    }
    loadMovementData().then(
      (d) => {
        const pattern = d?.patterns[customPattern.patternId];
        if (live) setMovement(pattern ? { pattern, param: customPattern.param } : null);
      },
      () => live && setMovement(null),
    );
    return () => {
      live = false;
    };
  }, [movementOn, isCustom, customPattern?.patternId, customPattern?.param]);

  const data = state.status === 'ready' ? state.data : undefined;
  const groups = useMemo(() => (data ? groupMuscles(data.muscles, data.detail.notes) : undefined), [data]);
  const back = () => goBack(navigate, '/library');
  const effective = setupOn ? setup : {};
  const shown = useMemo(() => {
    if (!data) return undefined;
    const rows = data.muscles;
    const base = setupWeights(rows, variation, data.shift, data.setupData, data.row.slug, {});
    const chosen = setupWeights(rows, variation, data.shift, data.setupData, data.row.slug, effective);
    return { effect: setupEffect(base, chosen), added: addedBySetup(base, chosen), chosen };
  }, [data, variation, effective]);

  if (!data || !groups) {
    return (
      <section class="sf-page-body sf-ex">
        <SubPageHeader title={t('page.exercise.title')} onBack={back} backLabel={t('ex.back')} />
        {state.status === 'loading' ? <p class="sf-lib__note" role="status">{t('ex.loading')}</p> : <EmptyState icon="warning" title={state.status === 'missing' ? t('ex.unknown') : t('ex.error')} actionLabel={t('ex.back')} onAction={back} />}
      </section>
    );
  }

  const { row, detail, machine } = data;
  const emphasis = bodyEmphasis(groups);
  for (const id of shown?.added ?? []) emphasis[id] ??= 'secondary';
  const photo = data.photos ? cardPhoto(data.photos) : undefined;
  const reps = repRangeText(detail.repMin, detail.repMax);
  const card = buildCueCard(detail.cues, detail.cautions);
  const yt = resolveYoutubeUrl(row.name, { policy: policyYoutubeFor(row.slug), custom: data.customYoutube });

  const pick = (v: string) => {
    const next = toggleVariation(variation, v);
    setVariation(next);
    void setChosenVariation(row.slug, next);
  };
  const changeSetup = (next: Setup) => {
    const clean = cleanSetup(next, data.setupOffer);
    setSetup(clean);
    void setChosenSetup(row.slug, clean);
  };
  const dismiss = () => {
    setCueGone(true);
    void dismissCue(row.slug);
  };
  const toggleFavourite = () => void setFavourite(row.slug, !personal.favourite).then(setPersonal, () => undefined);
  const toggleHidden = () => void setHidden(row.slug, !personal.hidden).then(setPersonal, () => undefined);
  const saveNote = () => {
    if (noteText.trim() === personal.note) return;
    void setNote(row.slug, noteText).then(
      (r) => {
        if (!r.ok) return setNoteMsg('error');
        setPersonal(r.personal);
        setNoteText(r.personal.note);
        setNoteMsg('saved');
      },
      () => setNoteMsg('error'),
    );
  };

  return (
    <section class="sf-page-body sf-ex">
      <SubPageHeader title={row.name} onBack={back} backLabel={t('ex.back')} />
      <div class="sf-ex__chips">
        {row.custom ? <Badge tone="gold">{t('ex.custom')}</Badge> : <Badge>{nice(row.category)}</Badge>}
        {row.subCategory && <Badge>{nice(row.subCategory)}</Badge>}
        <Badge>{nice(row.kind)}</Badge>
        <Dots n={row.difficulty} />
        {detail.pattern && detail.pattern.toLowerCase() !== row.subCategory.toLowerCase() && <Badge>{nice(detail.pattern)}</Badge>}
        {row.unilateral && <Badge>{t('ex.chip.unilateral')}</Badge>}
        {row.beginner && <Badge tone="ok">{t('ex.chip.beginner')}</Badge>}
      </div>

      <CollapseAll />
      <div class="sf-ex__pair" role="group" aria-label={t('ex.mine')}>
        <Chip selected={personal.favourite} onPress={toggleFavourite}>
          {personal.favourite ? t('ex.fav.remove') : t('ex.fav.add')}
        </Chip>
        <Button variant="secondary" onPress={toggleHidden}>
          {personal.hidden ? t('ex.unhide') : t('ex.hide')}
        </Button>
      </div>
      {personal.hidden && <p class="sf-lib__note" role="status">{t('ex.hidden.note')}</p>}
      {row.custom && customOn && (
        <div class="sf-ex__pair" role="group" aria-label={t('ex.custom')}>
          <Button variant="secondary" onPress={() => navigate(`/exercise/${row.slug}/edit`)}>
            {t('cx.edit')}
          </Button>
          <Button variant="secondary" onPress={() => setConfirmDelete(true)}>
            {t('cx.delete')}
          </Button>
        </div>
      )}
      {row.custom && customOn && <ProposeToGym slug={row.slug} />}
      <Dialog
        open={confirmDelete}
        title={t('cx.delete.title')}
        message={t('cx.delete.message')}
        confirmLabel={t('cx.delete')}
        cancelLabel={t('cx.cancel')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteCustom(row.slug).then(() => navigate('/library'), () => setConfirmDelete(false))}
      />

      {cuesOn && !cueGone && <FormCueCard card={card} onDismiss={dismiss} />}

      {movementOn && movement === null && <p class="sf-lib__note">{t('mm.unmapped')}</p>}
      {movementOn && movement && (
        <Collapsible id="movement" title={t('mm.title')}>
        <MovementSection
          pattern={movement.pattern}
          param={movement.param}
          setupParams={paramsFromSetup(movement.pattern, effective)}
          sex={sex}
          name={row.name}
          {...(machine ? { machineCategory: machine.category } : {})}
          chips={chipMuscles(shown?.chosen ?? {}, groups.primary.map((m) => m.id), shown?.added ?? []).map((id) => ({ id, label: muscleLabel(id) }))}
        />
        </Collapsible>
      )}

      <Collapsible id="muscles" title={t('ex.muscles')} defaultOpen>
        <BodyPicker mode="view" size="compact" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} emphasis={emphasis} />
        {(['primary', 'secondary', 'stabiliser'] as RoleGroup[]).map(
          (g) =>
            groups[g].length > 0 && (
              <p key={g} class="sf-ex__line">
                <strong>{t(`ex.muscles.${g}` as StringKey)}:</strong>{' '}
                {groups[g].map((m, i) => (
                  <span key={m.id}>
                    {i > 0 ? ' · ' : ''}
                    {muscleLabel(m.id)} ({t(`ex.emphasis.${m.emphasis}` as StringKey)})
                    {m.contested && <Badge tone="warn">{t('ex.evidence')}</Badge>}
                  </span>
                ))}
              </p>
            ),
        )}
        {hasContested(groups) && <p class="sf-lib__note">{t('ex.evidence')}</p>}
      </Collapsible>

      <Collapsible id="machine" title={t('ex.machine')}>
        {machine ? (
          <Link href={`/machine/${machine.slug}`} class="sf-ex__machine">
            {photosOn && <PhotoFrame src={photo} alt={t('lib.machine.photo', { name: machine.name })} class="sf-ex__mthumb" />}
            <span class="sf-ex__mname">{machine.name}</span>
            <Badge tone={statusTone(machine.status)}>{t(`lib.status.${machine.status}` as StringKey)}</Badge>
          </Link>
        ) : (
          <p class="sf-ex__line">{t('ex.machine.none')}</p>
        )}
      </Collapsible>

      {setupOn && offeredAxes(data.setupOffer).length > 0 && (
        <Collapsible id="title" title={t('setup.title')}>
          <p class="sf-lib__note">{t('setup.hint')}</p>
          <SetupPicker offer={data.setupOffer} value={setup} onChange={changeSetup} />
          <p class="sf-ex__line sf-ex__effect" role="status">
            {shown && (shown.effect.more.length > 0 || shown.effect.less.length > 0)
              ? [
                  shown.effect.more.length > 0 ? t('setup.effect.more', { muscles: shown.effect.more.map(muscleLabel).join(', ') }) : '',
                  shown.effect.less.length > 0 ? t('setup.effect.less', { muscles: shown.effect.less.map(muscleLabel).join(', ') }) : '',
                ].filter(Boolean).join('. ')
              : t('setup.effect.none')}
          </p>
        </Collapsible>
      )}

      {detail.variations.length > 0 && (
        <Collapsible id="variations" title={t('ex.variations')}>
          <p class="sf-lib__note">{t('ex.variations.hint')}</p>
          <ul class="sf-ex__vars">
            {detail.variations.map((v) => {
              const adds = variationAdds(data.shift, v);
              return (
                <li key={v}>
                  <Chip selected={variation === v} onPress={() => pick(v)}>
                    {v}
                  </Chip>
                  {adds.length > 0 && <span class="sf-lib__note">{t('ex.variations.adds', { muscles: adds.map((a) => muscleLabel(a.id)).join(', ') })}</span>}
                </li>
              );
            })}
          </ul>
        </Collapsible>
      )}

      {(data.easier || data.harder) && (
        <div class="sf-ex__pair">
          {data.easier && <Button variant="secondary" onPress={() => navigate(`/exercise/${data.easier!.slug}`)}>{`${t('ex.easier')}: ${data.easier.name}`}</Button>}
          {data.harder && <Button variant="secondary" onPress={() => navigate(`/exercise/${data.harder!.slug}`)}>{`${t('ex.harder')}: ${data.harder.name}`}</Button>}
        </div>
      )}

      {(detail.cues.length > 0 || reps) && (
        <Collapsible id="howto" title={t('ex.howto')}>
          {reps && <p class="sf-ex__line">{t('ex.reps', { range: reps })}</p>}
          {detail.cues.length > 0 && (
            <ul class="sf-ex__list">
              {detail.cues.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </Collapsible>
      )}

      {detail.cautions && (
        <Collapsible id="cautions" title={t('ex.cautions')}>
          <p class="sf-ex__line">{detail.cautions}</p>
        </Collapsible>
      )}

      {youtubeOn && (
        <div class="sf-ex__block">
          <a class="sf-btn sf-btn--secondary sf-btn--md sf-btn--full" href={yt} target="_blank" rel="noopener noreferrer">
            <span class="sf-btn__label">{t('ex.watch')}</span>
          </a>
          <p class="sf-lib__note">{t('ex.watch.note')}</p>
        </div>
      )}

      {data.substitutes.length > 0 && (
        <Collapsible id="substitutes" title={t('ex.substitutes')}>
          <ul class="sf-lib__list">
            {data.substitutes.map((s) => (
              <li key={s.slug} class="sf-lib__row">
                <Row href={`/exercise/${s.slug}`}>
                  <span class="sf-lib__name">{s.name}</span>
                  <span class="sf-lib__meta">{nice(s.category)}</span>
                </Row>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <Collapsible id="note" title={t('ex.note')}>
        <textarea
          class="sf-input sf-ex__note"
          rows={3}
          maxLength={NOTE_MAX + 100}
          aria-label={t('ex.note')}
          value={noteText}
          onInput={(e) => {
            setNoteText((e.target as HTMLTextAreaElement).value);
            setNoteMsg('');
          }}
          onBlur={saveNote}
        />
        <p class="sf-lib__note" role="status">
          {noteMsg === 'error' ? t('ex.note.error') : noteMsg === 'saved' ? t('ex.note.saved') : t('ex.note.hint')}
        </p>
      </Collapsible>

      <Collapsible id="history" title={t('ex.history')}>
        <p class="sf-lib__note">{t('ex.history.none')}</p>
        {aiOn && <Button variant="secondary" onPress={() => setAiOpen(true)}>{t('ai.btn.lift')}</Button>}
      </Collapsible>
      {aiOn && <AiReviewSheet open={aiOpen} onClose={() => setAiOpen(false)} scope={{ kind: 'exercise', slug, lastN: 8 }} title={t('ai.title.lift')} />}
    </section>
  );
}
