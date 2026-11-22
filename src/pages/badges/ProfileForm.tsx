import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button, Input, Segmented } from '../../ui/components';
import { getProfile, parseBodyweight, saveBodyweight, saveProfile } from '../../data/repos/badges';
import type { Sex } from '../../shared/badges';

/** Sex and bodyweight. Nothing is assumed: the form starts empty on first run. Used by the first-run prompt and Settings. */
export function ProfileForm({ initialSex, initialKg, firstRun, onDone, onSkip }: {
  initialSex: Sex | null;
  initialKg: number | null;
  firstRun: boolean;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const [sex, setSex] = useState<Sex | null>(initialSex);
  const [kgText, setKgText] = useState(initialKg == null ? '' : String(initialKg));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const kg = parseBodyweight(kgText);
    if (!sex) return setError(t('badge.form.need_sex'));
    if (kg == null) return setError(t('badge.form.bad_kg'));
    setBusy(true);
    try {
      const p = await getProfile();
      await saveProfile({ ...p, sex, skipped: false });
      if (kg !== initialKg) await saveBodyweight(kg);
      onDone();
    } catch {
      setError(t('badge.form.failed'));
      setBusy(false);
    }
  };

  return (
    <div class="sf-bd">
      <p class="sf-bd__note">{firstRun ? t('badge.form.intro') : t('badge.form.edit')}</p>
      <Segmented<Sex>
        label={t('badge.form.sex')}
        value={sex as Sex}
        onChange={(v) => { setSex(v); setError(''); }}
        options={[
          { value: 'm', label: t('badge.form.male') },
          { value: 'f', label: t('badge.form.female') },
          { value: 'unspecified', label: t('badge.form.unspecified') },
        ]}
      />
      {sex === 'unspecified' && <p class="sf-bd__note">{t('badge.form.estimated')}</p>}
      <Input
        label={t('badge.form.kg')}
        hint={t('badge.form.kg_hint')}
        {...{ value: kgText, inputMode: 'decimal', autoComplete: 'off' }}
        onInput={(e) => { setKgText((e.target as HTMLInputElement).value); setError(''); }}
      />
      {error && <p class="sf-bd__note sf-bd__err" role="alert">{error}</p>}
      <Button disabled={busy} onPress={save}>{t('badge.form.save')}</Button>
      {firstRun && onSkip && <Button variant="secondary" onPress={onSkip}>{t('badge.form.skip')}</Button>}
    </div>
  );
}
