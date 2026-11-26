// Phase 96: Settings -> Appearance -> Interface style. The master row (Premium / Classic / Custom) and the nine switches.
// Changes apply at once (applyUx follows onUxChange); nothing reloads.
import { useEffect, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { RowGroup, Segmented, Toggle } from '../../ui/components';
import { onUxChange, readUx, setUxMaster, setUxSwitch } from '../../data/repos/ux';
import { UX_KEYS, masterOf, parseSwitches, type UxMaster, type UxSwitches } from '../../shared/ux';

const MASTERS: UxMaster[] = ['premium', 'classic', 'custom'];

export function InterfaceStyle() {
  const [sw, setSw] = useState<UxSwitches>(() => parseSwitches(null));
  useEffect(() => {
    let alive = true;
    void readUx().then((s) => alive && setSw(s));
    const off = onUxChange((s) => setSw(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const master = masterOf(sw);
  return (
    <>
      <div class="sf-st__row">
        <span class="sf-st__label">{t('ux.master')}</span>
        <Segmented
          label={t('ux.master')}
          value={master}
          options={MASTERS.map((m) => ({ value: m, label: t(`ux.m.${m}` as StringKey) }))}
          onChange={(m) => void setUxMaster(m)}
        />
        <p class="sf-st__hint">{t(master === 'custom' ? 'ux.custom.hint' : 'ux.hint')}</p>
      </div>
      <RowGroup label={t('ux.title')}>
        {UX_KEYS.map((k) => (
          <Toggle key={k} checked={sw[k]} onChange={(on) => void setUxSwitch(k, on)} label={t(`ux.sw.${k}` as StringKey)} hint={t(`ux.sw.${k}.hint` as StringKey)} />
        ))}
      </RowGroup>
    </>
  );
}
