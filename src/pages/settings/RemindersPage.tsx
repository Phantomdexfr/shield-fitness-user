import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Chip, Input, SubPageHeader, Toggle } from '../../ui/components';
import { DEFAULT_REMINDERS, isReminderTime, nextReminderAt, type ReminderPrefs } from '../../shared/reminders';
import { formatIst } from '../../shared/dates';
import { readReminders, writeReminders } from '../../data/repos/reminders';
import { goBack } from '../../app/navBack';

/** /settings/reminders: days and time, saved at once. Nothing is sent yet (the note says so). */
export default function RemindersPage() {
  const [, navigate] = useLocation();
  const [p, setP] = useState<ReminderPrefs>(DEFAULT_REMINDERS);
  const [timeText, setTimeText] = useState(DEFAULT_REMINDERS.time);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void readReminders().then((v) => {
      if (!alive) return;
      setP(v);
      setTimeText(v.time);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (next: ReminderPrefs) => {
    const before = p;
    setP(next);
    try {
      setErr('');
      setP(await writeReminders(next));
    } catch {
      setP(before);
      setErr(t('rm.save.fail'));
    }
  };

  const next = nextReminderAt(p, Date.now());
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.g.reminders')} onBack={() => goBack(navigate, '/settings')} />
      <div class="sf-st__row">
        <Toggle checked={p.on} onChange={(v) => void save({ ...p, on: v })} label={t('rm.on')} />
      </div>
      <div class="sf-st__row">
        <span class="sf-st__label">{t('rm.days')}</span>
        <div class="sf-st__chips">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Chip
              key={d}
              selected={p.days.includes(d)}
              onPress={() => void save({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] })}
            >
              {t(`rb.wd.${d}` as StringKey)}
            </Chip>
          ))}
        </div>
      </div>
      <div class="sf-st__row">
        <Input
          label={t('rm.time')}
          hint={t('rm.time.hint')}
          {...{ value: timeText, inputMode: 'numeric', maxLength: 5 }}
          error={isReminderTime(timeText) ? undefined : t('rm.time.err')}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            setTimeText(v);
            if (isReminderTime(v)) void save({ ...p, time: v });
          }}
        />
      </div>
      <p class="sf-st__hint">{next === null ? t('rm.next.none') : t('rm.next', { when: formatIst(next) })}</p>
      <p class="sf-st__hint">{t('rm.note')}</p>
      {err && <p class="sf-st__err" role="status">{err}</p>}
    </section>
  );
}
