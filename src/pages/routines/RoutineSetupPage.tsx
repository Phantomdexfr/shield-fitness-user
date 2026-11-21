import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, Dialog, Input, Sheet, Stepper, SubPageHeader } from '../../ui/components';
import { createAndSave } from '../../data/repos/routines';
import { MAX_DAYS, MAX_NAME, MIN_DAYS, SPLIT_STYLES, splitDays, weekdayMismatch, type RoutineInputError, type SplitStyle } from '../../shared/routine';
import { muscleLabel } from '../exercise/muscleLabel';
import { goBack } from '../../app/navBack';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DEFAULT_DAYS = 3;

/** `/routine/new`: name, days per week (2-7 or Flexible), optional weekdays, split style. Nothing is saved until Create. */
export default function RoutineSetupPage() {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | 'flexible'>(DEFAULT_DAYS);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [split, setSplit] = useState<SplitStyle>('ppl');
  const [preview, setPreview] = useState<SplitStyle | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<RoutineInputError | 'save' | null>(null);

  const count = days === 'flexible' ? DEFAULT_DAYS : days;
  const dirty = name.trim() !== '' || days !== DEFAULT_DAYS || weekdays.length > 0 || split !== 'ppl';
  const back = () => (dirty ? setLeaving(true) : goBack(navigate, '/routines'));

  const pickSplit = (s: SplitStyle) => {
    if (s === 'custom') setSplit('custom');
    else setPreview(s);
  };

  const create = () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    createAndSave({ name, days, weekdays, splitStyle: split }).then(
      (r) => {
        setSaving(false);
        if (r.ok) return navigate(`/routine/${r.routine.id}`);
        setError(r.error);
      },
      () => {
        setSaving(false);
        setError('save');
      },
    );
  };

  const errText = error === null ? undefined : error === 'save' ? t('rb.err.save') : t(`rb.err.${error}` as StringKey);
  const nameError = error === 'name_too_long' ? errText : undefined;
  const previewDays = preview ? splitDays(preview, count) : null;

  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={t('rb.new.title')} onBack={back} backLabel={t('rb.cancel')} />

      <Input
        label={t('rb.name')}
        hint={t('rb.name.hint')}
        {...{ value: name, autoComplete: 'off', maxLength: MAX_NAME + 20 }}
        {...(nameError ? { error: nameError } : {})}
        onInput={(e) => { setName((e.currentTarget as HTMLInputElement).value); setError(null); }}
      />

      <section class="sf-rt__block" aria-label={t('rb.days.label')}>
        <h2 class="sf-ex__h">{t('rb.days.label')}</h2>
        <p class="sf-lib__note">{days === 'flexible' ? t('rb.days.flexible.hint') : t('rb.days.hint')}</p>
        <div class="sf-rt__row">
          <Stepper
            label={t('rb.days.label')}
            value={count}
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            decreaseLabel={t('rb.days.less')}
            increaseLabel={t('rb.days.more')}
            class={days === 'flexible' ? 'sf-rt__off' : ''}
            onChange={(n) => setDays(n)}
          />
          <Chip selected={days === 'flexible'} onPress={() => setDays(days === 'flexible' ? DEFAULT_DAYS : 'flexible')}>{t('rb.days.flexible')}</Chip>
        </div>
      </section>

      {days !== 'flexible' && (
        <section class="sf-rt__block" aria-label={t('rb.weekdays')}>
          <h2 class="sf-ex__h">{t('rb.weekdays')}</h2>
          <p class="sf-lib__note">{t('rb.weekdays.hint')}</p>
          <div class="sf-rt__chips">
            {WEEKDAYS.map((d) => (
              <Chip key={d} selected={weekdays.includes(d)} aria-label={`${t('rb.wd.label')} ${t(`rb.wd.${d}` as StringKey)}`} onPress={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => a - b)))}>
                {t(`rb.wd.${d}` as StringKey)}
              </Chip>
            ))}
          </div>
          {weekdayMismatch(days, weekdays) && <p class="sf-lib__note">{t('rb.weekdays.mismatch', { chosen: weekdays.length, days: count })}</p>}
        </section>
      )}

      <section class="sf-rt__block" aria-label={t('rb.split')}>
        <h2 class="sf-ex__h">{t('rb.split')}</h2>
        <div class="sf-rt__chips">
          {SPLIT_STYLES.map((s) => (
            <Chip key={s} selected={split === s} onPress={() => pickSplit(s)}>{t(`rb.split.${s}` as StringKey)}</Chip>
          ))}
        </div>
        {split === 'custom' && <p class="sf-lib__note">{t('rb.split.custom.hint')}</p>}
      </section>

      {errText && error !== 'name_too_long' && <p class="sf-rt__err" role="alert">{errText}</p>}

      <div class="sf-rt__bar">
        <Button onPress={create} disabled={saving}>{t('rb.create')}</Button>
      </div>

      <Sheet open={preview !== null} onClose={() => setPreview(null)} title={preview ? t(`rb.split.${preview}` as StringKey) : ''}>
        {preview && previewDays && (
          <div class="sf-rt__menu">
            <h3 class="sf-ex__h">{t('rb.split.preview')}</h3>
            <ul class="sf-rt__prev">
              {previewDays.days.map((d, i) => (
                <li key={i} class="sf-rt__prev-row">
                  <span class="sf-rt__name">{d.label}</span>
                  <span class="sf-rt__meta">{d.muscles.length === 0 ? t('rb.split.nomuscles') : d.muscles.map(muscleLabel).join(', ')}</span>
                </li>
              ))}
            </ul>
            {previewDays.cycled && <p class="sf-lib__note">{t('rb.split.cycled', { n: count, list: previewDays.days.map((d) => d.label).join(', ') })}</p>}
            <Button onPress={() => { setSplit(preview); setPreview(null); }}>{t('rb.split.use')}</Button>
            <Button variant="secondary" onPress={() => setPreview(null)}>{t('rb.split.back')}</Button>
          </div>
        )}
      </Sheet>

      <Dialog open={leaving} title={t('rb.discard.title')} message={t('rb.discard.message')} confirmLabel={t('rb.discard')} cancelLabel={t('rb.keep')} danger onCancel={() => setLeaving(false)} onConfirm={() => navigate('/routines')} />
    </section>
  );
}
