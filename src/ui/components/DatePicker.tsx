import { useId, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { istDayKey, type DayKey } from '../../shared/dates';
import {
  dayKeyOf, dayLabel, fitToMonth, inRange, monthGrid, monthKeyOf, monthLabel, parseDay, parseMonth, startDay, yearOptions,
} from '../../shared/calendar';
import { Button } from './Button';
import { Field, Select } from './Form';
import { Sheet } from './Overlay';
import { cx } from './util';

export interface DatePickerProps {
  label: string;
  /** "YYYY-MM-DD" (day mode) or "YYYY-MM" (month mode); "" = not set. */
  value: string;
  onChange: (value: string) => void;
  mode?: 'day' | 'month';
  min?: DayKey;
  max?: DayKey;
  /** Today in IST; defaults to the clock (pass it in tests). */
  today?: DayKey;
  /** Where the calendar opens when nothing is chosen yet (default: today). Birth dates open in a sensible past year. */
  startAt?: DayKey;
  yearFrom?: number;
  yearTo?: number;
  hint?: string;
  error?: string;
  /** Show a Clear control when a value is set. */
  clearable?: boolean;
  id?: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => t(`cal.m.${i + 1}` as StringKey));
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** The one date control of the app: a field that opens a bottom-sheet calendar. Dates are never typed and never use the browser's own date input. */
export function DatePicker({ label, value, onChange, mode = 'day', min, max, today, startAt, yearFrom, yearTo, hint, error, clearable, id }: DatePickerProps) {
  const auto = useId();
  const fid = id ?? auto;
  const now = today ?? istDayKey(Date.now());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayKey>(now);

  const isMonth = mode === 'month';
  const shown = isMonth ? monthLabel(value, MONTHS) : dayLabel(value, MONTHS);
  const here = parseDay(draft) ?? parseDay(now)!;

  const nowYear = Number(now.slice(0, 4));
  const lo = yearFrom ?? (min ? Number(min.slice(0, 4)) : nowYear - 100);
  const hi = yearTo ?? (max ? Number(max.slice(0, 4)) : nowYear + 10);
  const years = yearOptions(lo, hi);

  const openSheet = () => {
    if (isMonth) {
      const p = parseMonth(value) ?? { y: Number(now.slice(0, 4)), m: Number(now.slice(5, 7)) };
      setDraft(dayKeyOf(p.y, p.m, 1));
    } else {
      setDraft(startDay(value, startAt ?? now, min, max));
    }
    setOpen(true);
  };

  const move = (y: number, m: number) => setDraft(isMonth ? dayKeyOf(y, m, 1) : fitToMonth(draft, y, m));
  const yearOptionsList = years.map((y) => ({ value: String(y), label: String(y) }));
  const monthOptionsList = MONTHS.map((n, i) => ({ value: String(i + 1), label: n }));
  const draftLabel = isMonth ? monthLabel(monthKeyOf(here.y, here.m), MONTHS) : dayLabel(draft, MONTHS);
  const canSet = isMonth ? true : inRange(draft, min, max);

  const set = () => {
    if (!canSet) return;
    onChange(isMonth ? monthKeyOf(here.y, here.m) : draft);
    setOpen(false);
  };

  return (
    <>
      <Field id={fid} label={label} hint={hint} error={error}>
        <button type="button" id={fid} class={cx('sf-input', 'sf-datefield', !shown && 'sf-datefield--empty')} aria-haspopup="dialog" onClick={openSheet}>
          {shown || t('cal.none')}
        </button>
        {clearable && value && (
          <Button variant="secondary" onPress={() => onChange('')} aria-label={`${t('cal.clear')}: ${label}`}>{t('cal.clear')}</Button>
        )}
      </Field>
      <Sheet open={open} onClose={() => setOpen(false)} title={isMonth ? t('cal.pickMonth') : t('cal.pick')}>
        <div class="sf-cal">
          <div class="sf-cal__selects">
            <Select label={t('cal.month')} value={String(here.m)} options={monthOptionsList} onChange={(v) => move(here.y, Number(v))} />
            <Select label={t('cal.year')} value={String(here.y)} options={yearOptionsList} onChange={(v) => move(Number(v), here.m)} />
          </div>
          {!isMonth && (
            <div class="sf-cal__grid" role="grid" aria-label={`${MONTHS[here.m - 1] ?? ''} ${here.y}`}>
              {WEEKDAYS.map((w) => (
                <span key={`h${w}`} class="sf-cal__wd" role="columnheader">{t(`rb.wd.${w}` as StringKey)}</span>
              ))}
              {monthGrid(here.y, here.m).map((c) => {
                const ok = inRange(c.key, min, max);
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="gridcell"
                    class={cx('sf-cal__day', !c.inMonth && 'sf-cal__day--out', c.key === draft && 'sf-cal__day--on', c.key === now && 'sf-cal__day--today')}
                    aria-label={dayLabel(c.key, MONTHS)}
                    aria-selected={c.key === draft ? 'true' : 'false'}
                    aria-current={c.key === now ? 'date' : undefined}
                    disabled={!ok}
                    onClick={() => setDraft(c.key)}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
          )}
          <div class="sf-cal__actions">
            <Button variant="secondary" onPress={() => setOpen(false)}>{t('cal.cancel')}</Button>
            <Button disabled={!canSet} onPress={set}>{t('cal.set', { d: draftLabel })}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
