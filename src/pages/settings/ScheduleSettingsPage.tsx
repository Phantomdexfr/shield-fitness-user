import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Button, Segmented, Stepper, SubPageHeader, Toggle, showToast } from '../../ui/components';
import { DEFAULT_LOAD_PCT, DEFAULT_SETS_PCT, DEFAULT_SETTINGS, deloadIsDefault, type ScheduleSettings } from '../../shared/schedule';
import { readSettings, writeSettings } from '../../data/repos/schedule';
import { goBack } from '../../app/navBack';

/** `/settings/schedule`: SC5. Each control saves at once; a failed write puts the control back and says so. */
export default function ScheduleSettingsPage() {
  const [, navigate] = useLocation();
  const [s, setS] = useState<ScheduleSettings>(DEFAULT_SETTINGS);
  const [err, setErr] = useState(false);
  const hintsAllowed = useFeature('rest_suggestions');

  useEffect(() => {
    void readSettings().then(setS);
  }, []);

  const change = async (patch: Partial<ScheduleSettings>) => {
    const before = s;
    const next = { ...s, ...patch };
    setS(next);
    try {
      await writeSettings(next);
      setErr(false);
      showToast(t('sc.settings.saved'));
    } catch {
      setS(before);
      setErr(true);
    }
  };

  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={t('sc.settings.title')} onBack={() => goBack(navigate, '/me')} />
      {err && <p class="sf-rt__err" role="alert">{t('sc.err.save')}</p>}

      <Toggle
        label={t('sc.settings.hints')}
        hint={hintsAllowed ? t('sc.settings.hints.hint') : t('sc.settings.gym')}
        checked={hintsAllowed && s.hints}
        disabled={!hintsAllowed}
        onChange={(hints) => void change({ hints })}
      />

      <div class="sf-rt__block">
        <h2 class="sf-ex__h">{t('sc.settings.missed')}</h2>
        <Segmented
          label={t('sc.settings.missed')}
          value={s.missed}
          options={[{ value: 'shift', label: t('sc.settings.shift') }, { value: 'skip', label: t('sc.settings.skip') }]}
          onChange={(missed) => void change({ missed })}
        />
      </div>

      <div class="sf-rt__block">
        <h2 class="sf-ex__h">{t('sc.settings.weekStart')}</h2>
        <Segmented
          label={t('sc.settings.weekStart')}
          value={s.weekStart}
          options={[{ value: 'mon', label: t('sc.settings.mon') }, { value: 'sun', label: t('sc.settings.sun') }]}
          onChange={(weekStart) => void change({ weekStart })}
        />
      </div>

      <div class="sf-rt__block">
        <h2 class="sf-ex__h">{t('sc.settings.deload')}</h2>
        <p class="sf-rt__meta">{t('sc.settings.sets')}</p>
        <Stepper label={t('sc.settings.sets')} value={s.setsPct} min={40} max={100} step={5} format={(v) => t('sc.pct', { n: v })} onChange={(setsPct) => void change({ setsPct })} />
        <p class="sf-rt__meta">{t('sc.settings.loads')}</p>
        <Stepper label={t('sc.settings.loads')} value={s.loadPct} min={70} max={100} step={5} format={(v) => t('sc.pct', { n: v })} onChange={(loadPct) => void change({ loadPct })} />
        <Button variant="secondary" disabled={deloadIsDefault(s)} onPress={() => void change({ setsPct: DEFAULT_SETS_PCT, loadPct: DEFAULT_LOAD_PCT })}>{t('sc.settings.reset')}</Button>
      </div>
    </section>
  );
}
