import { useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, Sheet } from '../../ui/components';
import { istDayKey, type DayKey } from '../../shared/dates';
import { rangeFor, type RangePreset } from '../../shared/aiReview';

const PRESETS: readonly RangePreset[] = ['last7', 'last30', 'month', 'custom'];

/** Pick last 7 / 30 days, this month or a custom range; hands the day range back. */
export function RangeSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (from: DayKey, to: DayKey) => void }) {
  const [preset, setPreset] = useState<RangePreset>('last7');
  const today = istDayKey(Date.now());
  const [custom, setCustom] = useState({ from: today, to: today });
  const range = rangeFor(preset, today, custom);

  return (
    <Sheet open={open} onClose={onClose} title={t('ai.range.title')}>
      <div class="sf-rt">
        <div class="sf-rt__row" role="group" aria-label={t('ai.range.title')}>
          {PRESETS.map((p) => (
            <Chip key={p} selected={preset === p} onPress={() => setPreset(p)}>{t(`ai.range.${p}` as StringKey)}</Chip>
          ))}
        </div>
        {preset === 'custom' && (
          <div class="sf-rt">
            <label class="sf-lib__note" for="ai-from">{t('ai.range.from')}</label>
            <input id="ai-from" type="date" class="sf-input" value={custom.from} onInput={(e) => setCustom({ ...custom, from: (e.target as HTMLInputElement).value })} />
            <label class="sf-lib__note" for="ai-to">{t('ai.range.to')}</label>
            <input id="ai-to" type="date" class="sf-input" value={custom.to} onInput={(e) => setCustom({ ...custom, to: (e.target as HTMLInputElement).value })} />
          </div>
        )}
        {range ? <p class="sf-lib__note" role="status">{`${range.from} - ${range.to}`}</p> : <p class="sf-lib__note" role="alert">{t('ai.range.bad')}</p>}
        <Button disabled={!range} onPress={() => range && onPick(range.from, range.to)}>{t('ai.range.go')}</Button>
      </div>
    </Sheet>
  );
}
