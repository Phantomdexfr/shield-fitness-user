import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Sheet, showToast } from '../../ui/components';
import { addDays, istDayKey, weekdayOfKey } from '../../shared/dates';
import { kindOn } from '../../shared/schedule';
import { beginPast, listSessions } from '../../data/repos/sessions';
import type { Routine } from '../../shared/routine';
import type { Session } from '../../shared/session';
import type { PlanData } from './usePlan';

const DAYS_BACK = 10;
const label = (date: string) => `${t(`rb.wd.${weekdayOfKey(date)}` as StringKey)} ${Number(date.slice(8))}`;

/** "Log a past day": the last days with what happened on each; tap one to open its workout, or to add the one you forgot. */
export function PastDays({ routine, plan, open, onClose }: { routine: Routine; plan: PlanData; open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPickDate(null);
    void listSessions().then((l) => setSessions(l.filter((s) => s.endedAt)), () => setSessions([]));
  }, [open]);

  const { input } = plan;
  const dates = Array.from({ length: DAYS_BACK }, (_, n) => addDays(input.today, -(n + 1)));
  const on = (date: string) => sessions.filter((s) => istDayKey(Date.parse(s.startedAt)) === date);
  const ctx = { today: input.today, ...(input.overrides ? { overrides: input.overrides } : {}), ...(input.meta ? { meta: input.meta } : {}) };
  const planned = (date: string) => input.schedule !== undefined && date >= (input.meta?.savedOn ?? '') && kindOn(input.schedule, date, ctx) === 'T';
  const suggested = routine.days.length > 0 ? input.pointer % routine.days.length : 0;
  const order = routine.days.map((d, i) => ({ d, i })).sort((a, b) => ((a.i - suggested + routine.days.length) % routine.days.length) - ((b.i - suggested + routine.days.length) % routine.days.length));

  const add = async (dayId: string) => {
    if (!pickDate || busy) return;
    setBusy(true);
    try {
      const s = await beginPast(routine.id, dayId, pickDate);
      if (s) {
        onClose();
        plan.reload();
        navigate(`/session/${s.id}/summary?edit=1`);
      } else showToast(t('past.fail'), { tone: 'danger' });
    } catch {
      showToast(t('past.fail'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={pickDate ? t('past.which', { date: label(pickDate) }) : t('past.title')}>
      {pickDate ? (
        <div class="sf-sc__stack">
          <p class="sf-rt__meta">{t('past.which.hint')}</p>
          {order.map(({ d }, k) => (
            <Button key={d.id} variant={k === 0 ? 'primary' : 'secondary'} disabled={busy} onPress={() => void add(d.id)}>{d.name}</Button>
          ))}
          <Button variant="secondary" onPress={() => setPickDate(null)}>{t('past.back')}</Button>
        </div>
      ) : (
        <div class="sf-sc__stack">
          <p class="sf-rt__meta">{t('past.hint')}</p>
          {dates.map((date) => {
            const done = on(date);
            return (
              <Button key={date} variant="secondary" onPress={() => (done[0] ? (onClose(), navigate(`/session/${done[0].id}/summary?edit=1`)) : setPickDate(date))}>
                {label(date)} · {done[0] ? (done[0].dayName ?? t('past.logged')) : planned(date) ? t('past.notLogged') : t('past.rest')}
              </Button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
