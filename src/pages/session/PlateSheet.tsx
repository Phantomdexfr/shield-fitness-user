import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button, Chip, Input, Sheet, Stepper } from '../../ui/components';
import { DEFAULT_PLATES, platesFor } from '../../shared/pocket';
import { roundKg } from '../../shared/units';
import type { LoggerPrefs } from '../../shared/logger';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The weight in the draft, as the starting target. */
  target: number;
  prefs: LoggerPrefs;
  onPrefs: (p: LoggerPrefs) => void;
  /** "Use this weight": hands the loadable total back to the draft. */
  onUse: (kg: number) => void;
}

/** Plate calculator: target -> plates per side. The bar and the rack are editable and remembered on the device. */
export function PlateSheet({ open, onClose, target, prefs, onPrefs, onUse }: Props) {
  const [goal, setGoal] = useState(target);
  const [custom, setCustom] = useState('');
  // Chips: the usual plates plus anything the user added, each on or off.
  const all = [...new Set([...DEFAULT_PLATES.kg, ...prefs.plates])].sort((a, b) => b - a);
  const res = platesFor(goal, prefs.barKg, prefs.plates);
  const toggle = (p: number) => onPrefs({ ...prefs, plates: prefs.plates.includes(p) ? prefs.plates.filter((x) => x !== p) : [...prefs.plates, p].sort((a, b) => b - a) });
  const addCustom = () => {
    const n = roundKg(Number(custom.replace(',', '.')));
    if (!Number.isFinite(n) || n <= 0 || n > 100) return;
    setCustom('');
    if (!prefs.plates.includes(n)) onPrefs({ ...prefs, plates: [...prefs.plates, n].sort((a, b) => b - a).slice(0, 12) });
  };
  const side = res.perSide.map((p) => (p.count > 1 ? `${p.count} x ${p.plate}` : String(p.plate))).join(' + ');

  return (
    <Sheet open={open} onClose={onClose} title={t('lg.pl.title')}>
      <div class="sf-lg__sheet">
        <span class="sf-rt__meta">{t('lg.pl.target')}</span>
        <Stepper label={t('lg.pl.target')} value={goal} step={2.5} min={0} max={1000} onChange={setGoal} />
        <span class="sf-rt__meta">{t('lg.pl.bar')}</span>
        <Stepper label={t('lg.pl.bar')} value={prefs.barKg} step={2.5} min={0} max={50} onChange={(v) => onPrefs({ ...prefs, barKg: v })} />
        <div class="sf-lg__plates" role="status">
          {res.belowBar ? (
            <p class="sf-lg__plate-line">{t('lg.pl.below', { bar: prefs.barKg })}</p>
          ) : (
            <>
              <span class="sf-rt__meta">{t('lg.pl.side')}</span>
              <p class="sf-lg__plate-line">{side === '' ? t('lg.pl.none') : side}</p>
              <p class="sf-rt__meta">{t('lg.pl.loads', { total: res.total })}</p>
              {res.remainder > 0 && <p class="sf-rt__meta">{t('lg.pl.short', { total: res.total, rem: res.remainder, next: res.nextUp ?? res.total })}</p>}
            </>
          )}
        </div>
        <Button onPress={() => { onUse(res.total); onClose(); }}>{t('lg.pl.use', { total: res.total })}</Button>
        <span class="sf-rt__meta">{t('lg.pl.rack')}</span>
        <div class="sf-rt__chips">
          {all.map((p) => (
            <Chip key={p} selected={prefs.plates.includes(p)} onPress={() => toggle(p)}>{`${p} kg`}</Chip>
          ))}
        </div>
        <div class="sf-lg__addplate">
          <Input label={t('lg.pl.add')} {...{ value: custom, inputMode: 'decimal' }} onInput={(e) => setCustom((e.currentTarget as HTMLInputElement).value)} />
          <Button variant="secondary" onPress={addCustom}>{t('lg.pl.addbtn')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
