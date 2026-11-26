import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useSearch } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, ChoiceRow, DatePicker, IconButton, Input, NumberRow, Row, RowGroup, Segmented } from '../../ui/components';
import { BodyPicker } from '../../ui/body';
import { figureFromProfile } from '../../ui/body/useFigureSex';
import { useFeature } from '../../app/flags';
import { istDayKey } from '../../shared/dates';
import { kgToLb, lbToKg, roundKg } from '../../shared/units';
import {
  HEIGHT_DEFAULT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM, WEIGHT_DEFAULT_KG, WEIGHT_MAX_KG, WEIGHT_MIN_KG,
  advance, back, birthStartDay, finish, freshState, heightLabel, isLastStep, progressOf, resumeStep, visibleSteps,
  type AboutYou, type FinishChoice, type Known, type OnboardingState, type StepId,
} from '../../shared/onboarding';
import {
  loadOnboarding, readAbout, readKnown, readWeightKg, saveAbout, saveBirthDate, saveLevel, saveName, saveOnboarding,
} from '../../data/repos/onboarding';

type Sex = 'm' | 'f' | 'unspecified';
type Level = 'beginner' | 'intermediate' | 'advanced';
const NO_KNOWN: Known = { gym: false, name: false, birth: false, sex: false };

interface Draft {
  name: string;
  birthDate: string;
  sex: Sex | null;
  heightCm: number;
  weightKg: number | null;
  units: 'kg' | 'lb';
  heightUnit: 'cm' | 'ft';
  level: AboutYou['level'];
}

const EMPTY: Draft = { name: '', birthDate: '', sex: null, heightCm: 0, weightKg: null, units: 'kg', heightUnit: 'cm', level: 'unset' };

/** /welcome: the first-run flow. `?again` re-runs it from Settings (everything shown, nothing marked unfinished, ends back in Settings). */
export default function WelcomePage() {
  const [, navigate] = useLocation();
  const rerun = new URLSearchParams(useSearch()).has('again');
  const backupOn = useFeature('free_account');
  const [ready, setReady] = useState(false);
  const [known, setKnown] = useState<Known>(NO_KNOWN);
  const [state, setState] = useState<OnboardingState>(freshState());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [k, a, kg, saved] = await Promise.all([readKnown(), readAbout(), readWeightKg(), rerun ? null : loadOnboarding()]);
      if (!live) return;
      setKnown(k);
      setDraft({ name: a.name, birthDate: a.birthDate, sex: a.sex, heightCm: a.heightCm, weightKg: kg, units: a.units, heightUnit: a.heightUnit, level: a.level });
      if (saved && !saved.done) setState(saved);
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [rerun]);

  const steps = useMemo(() => visibleSteps(known, rerun), [known, rerun]);
  const step: StepId = resumeStep(state, steps);
  const { index, total } = progressOf(step, steps);
  const last = isLastStep(step, steps);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const move = async (next: OnboardingState) => {
    setState(next);
    if (!rerun) await saveOnboarding(next).catch(() => undefined);
  };
  const leave = (to: string) => navigate(to, { replace: true });

  /** Save this step's fields, then go on (or skip it without saving). */
  const go = async (skip: boolean) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!skip) {
        if (step === 'name') await saveName(draft.name.trim());
        if (step === 'birth') await saveBirthDate(draft.birthDate);
        if (step === 'about') await saveAbout({ sex: draft.sex, heightCm: draft.heightCm, weightKg: draft.weightKg, units: draft.units, heightUnit: draft.heightUnit });
        if (step === 'training' && draft.level !== 'unset') await saveLevel(draft.level);
      }
      await move(advance(state, steps, { skip }));
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const end = async (choice: FinishChoice, to: string) => {
    if (busy) return;
    setBusy(true);
    if (!rerun) await saveOnboarding(finish(state, choice, Date.now())).catch(() => undefined);
    leave(rerun ? '/settings/account' : to);
  };

  const onBack = () => {
    if (index <= 1) return rerun ? leave('/settings/account') : undefined;
    void move(back(state, steps));
  };

  if (!ready) return <section class="sf-ob" aria-busy="true" />;

  const today = istDayKey(Date.now());
  const canContinue =
    step === 'name' ? draft.name.trim() !== '' : step === 'birth' ? draft.birthDate !== '' : step === 'about' ? draft.sex !== null : step === 'training' ? draft.level !== 'unset' : true;

  return (
    <section class="sf-ob" aria-label={t('ob.title')}>
      <header class="sf-ob__top">
        {index <= 1 && !rerun ? <span class="sf-ob__spacer" aria-hidden="true" /> : <IconButton icon="caret-left" label={t('ob.back')} onPress={onBack} />}
        <div class="sf-ob__bar" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index} aria-valuetext={t('ob.step', { n: index, of: total })}>
          {steps.map((s, i) => <span key={s} class={i < index ? 'sf-ob__seg sf-ob__seg--on' : 'sf-ob__seg'} />)}
        </div>
      </header>

      <div class="sf-ob__body" key={step}>
        <p class="sf-ob__step">{t('ob.step', { n: index, of: total })}</p>
        <h1 class="sf-ob__h">{t(`ob.${step}.h` as StringKey)}</h1>
        <p class="sf-ob__lead">{step === 'finish' && known.gym ? t('ob.finish.gym.lead') : t(`ob.${step}.lead` as StringKey)}</p>

        {step === 'name' && (
          <Input
            label={t('ob.name.label')}
            hint={t('ob.name.hint')}
            {...{ value: draft.name, maxLength: 30, autoComplete: 'given-name', enterKeyHint: 'next' }}
            onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
          />
        )}

        {step === 'birth' && (
          <DatePicker
            label={t('ob.birth.label')}
            value={draft.birthDate}
            min="1900-01-01"
            max={today}
            startAt={birthStartDay(today)}
            yearFrom={1900}
            yearTo={Number(today.slice(0, 4))}
            onChange={(v) => set({ birthDate: v })}
          />
        )}

        {step === 'about' && <AboutStep draft={draft} set={set} />}

        {step === 'training' && (
          <RowGroup>
            <ChoiceRow<Level | 'unset'>
              label={t('st.account.level')}
              value={draft.level}
              options={(['unset', 'beginner', 'intermediate', 'advanced'] as const).map((v) => ({ value: v, label: t(`st.v.${v}` as StringKey) }))}
              onChange={(v) => set({ level: v })}
            />
          </RowGroup>
        )}

        {step === 'finish' && !known.gym && (
          <>
            <p class="sf-ob__risk" role="note">{t('ob.finish.risk')}</p>
            <RowGroup label={t('ob.finish.more')}>
              <Row label={t('ob.finish.gym')} hint={t('ob.finish.gym.hint')} chevron onPress={() => void end('later', '/settings/gym/add')} />
            </RowGroup>
          </>
        )}
        {failed && <p class="sf-ob__err" role="alert">{t('ob.failed')}</p>}
      </div>

      <footer class="sf-ob__foot">
        {!last && (
          <>
            <Button size="lg" disabled={!canContinue || busy} onPress={() => void go(false)}>{t('ob.continue')}</Button>
            <Button variant="secondary" disabled={busy} onPress={() => void go(true)}>{t('ob.skip')}</Button>
          </>
        )}
        {last && !known.gym && backupOn && (
          <>
            <Button size="lg" disabled={busy} onPress={() => void end('backup', '/settings/backup/consent')}>{t('ob.finish.backup')}</Button>
            <Button variant="secondary" disabled={busy} onPress={() => void end('later', '/')}>{t('ob.finish.later')}</Button>
          </>
        )}
        {last && (known.gym || !backupOn) && <Button size="lg" disabled={busy} onPress={() => void end('later', '/')}>{t('ob.finish.start')}</Button>}
      </footer>
    </section>
  );
}

/** Step 3: figure preview, sex, a group of three rows (birth date is its own step; here height, weight and units). */
function AboutStep({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const [touchedKg, setTouchedKg] = useState(draft.weightKg != null);
  const [touchedCm, setTouchedCm] = useState(draft.heightCm > 0);
  const imperial = draft.units === 'lb';
  const figure = figureFromProfile(draft.sex);
  const kg = draft.weightKg ?? WEIGHT_DEFAULT_KG;
  const heightText = (cm: number) => heightLabel(cm, draft.heightUnit);

  return (
    <div class="sf-ob__about">
      <Segmented<Sex>
        label={t('badge.form.sex')}
        value={draft.sex as Sex}
        onChange={(v) => set({ sex: v })}
        options={[
          { value: 'm', label: t('badge.form.male') },
          { value: 'f', label: t('badge.form.female') },
          { value: 'unspecified', label: t('badge.form.unspecified') },
        ]}
      />
      <div class="sf-ob__figure" role="img" aria-label={t(figure === 'female' ? 'ob.about.fig.f' : 'ob.about.fig.m')}>
        <BodyPicker mode="view" sex={figure} view="front" size="mini" />
      </div>
      {draft.sex === 'unspecified' && <p class="sf-ob__note">{t('badge.form.estimated')}</p>}
      <Segmented<'kg' | 'lb'>
        label={t('ob.about.units')}
        value={draft.units}
        onChange={(v) => set({ units: v, heightUnit: v === 'lb' ? 'ft' : 'cm' })}
        options={[{ value: 'kg', label: t('ob.about.metric') }, { value: 'lb', label: t('ob.about.imperial') }]}
      />
      <RowGroup>
        <NumberRow
          label={t('ob.about.height')}
          value={draft.heightCm || HEIGHT_DEFAULT_CM}
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          format={heightText}
          empty={touchedCm ? undefined : t('ob.about.unset')}
          onChange={(v) => { setTouchedCm(true); set({ heightCm: v }); }}
        />
        {imperial ? (
          <NumberRow
            label={t('ob.about.weight')}
            value={Math.round(kgToLb(kg))}
            min={Math.round(kgToLb(WEIGHT_MIN_KG))}
            max={Math.round(kgToLb(WEIGHT_MAX_KG))}
            format={(v) => `${v} lb`}
            empty={touchedKg ? undefined : t('ob.about.unset')}
            onChange={(v) => { setTouchedKg(true); set({ weightKg: roundKg(lbToKg(v)) }); }}
          />
        ) : (
          <NumberRow
            label={t('ob.about.weight')}
            value={Math.round(kg)}
            min={WEIGHT_MIN_KG}
            max={WEIGHT_MAX_KG}
            format={(v) => `${v} kg`}
            empty={touchedKg ? undefined : t('ob.about.unset')}
            onChange={(v) => { setTouchedKg(true); set({ weightKg: v }); }}
          />
        )}
      </RowGroup>
    </div>
  );
}
