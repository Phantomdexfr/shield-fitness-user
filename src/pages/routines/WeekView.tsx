import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Badge, Button, Card, Chip, Collapsible, Sheet } from '../../ui/components';
import { weekdayOfKey } from '../../shared/dates';
import { cycleTiles, restShift, toggleDeloadWeek, weekCells, type WeekCell } from '../../shared/schedule';
import { saveSchedule } from '../../data/repos/schedule';
import type { Routine } from '../../shared/routine';
import { PastDays } from './PastDays';
import type { PlanData } from './usePlan';

const dayLabel = (date: string) => `${t(`rb.wd.${weekdayOfKey(date)}` as StringKey)} ${Number(date.slice(8))}`;

/** SC2: the next 7 dates with their Day (or Rest / Active recovery / Mobility), plus the cycle tiles for a cycle. */
/** `strip` (Today, Phase 86): one row of 7 outlined cells, today with a gold outline; the plan buttons sit in a closed section. */
export function WeekView({ routine, plan, onRoutine, strip, bare }: { routine: Routine; plan: PlanData; onRoutine?: (r: Routine) => void; strip?: boolean; bare?: boolean }) {
  const [, navigate] = useLocation();
  const [picked, setPicked] = useState<WeekCell | null>(null);
  const [err, setErr] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const { input } = plan;
  if (routine.days.length === 0) return null;
  const s = input.schedule;

  // A workout finished today already moved the pointer on; show today as done and keep the days after it in order.
  const doneToday = (input.sessionDates ?? []).includes(input.today);
  const n = routine.days.length;
  const cells = weekCells(doneToday ? { ...input, pointer: (((input.pointer - 1) % n) + n) % n } : input, 7);
  const isDone = (c: WeekCell) => doneToday && c.today;
  const missed = (c: WeekCell) => c.missed === true;
  const kindText = (c: WeekCell) => {
    if (c.kind === 'T' && c.dayIndex !== undefined) return routine.days[c.dayIndex]?.name ?? '';
    if (c.kind === 'open') return t('sc.open');
    if (c.kind === 'none') return '';
    return t(`sc.kind.${c.kind}` as StringKey);
  };

  const setOverride = async (date: string, v: 'rest' | 'train' | null) => {
    const overrides = { ...plan.state.overrides };
    if (v === 'rest') Object.assign(overrides, restShift(input, date));
    else if (v) overrides[date] = v;
    else delete overrides[date];
    const ok = await plan.patchState({ overrides });
    setErr(!ok);
    if (ok) setPicked(null);
  };

  // Phase 114: "do THIS Day on this date" (this week only: the pick names one date and the rotation is untouched). The day's earlier
  // rest / move choice is replaced; "Back to the plan" removes both.
  const pickDay = async (date: string, dayId: string) => {
    const overrides = { ...plan.state.overrides };
    delete overrides[date]; // a chosen rest or "move here" on this date is replaced by the pick; the pick alone makes it a training date
    const ok = await plan.patchState({ overrides, dayPicks: { ...plan.state.dayPicks, [date]: dayId } });
    setErr(!ok);
    if (ok) setPicked(null);
  };
  const clearPick = async (date: string) => {
    const dayPicks = { ...plan.state.dayPicks };
    delete dayPicks[date];
    const overrides = { ...plan.state.overrides };
    delete overrides[date];
    const ok = await plan.patchState({ overrides, dayPicks });
    setErr(!ok);
    if (ok) setPicked(null);
  };

  const toggleDeload = async () => {
    const meta = toggleDeloadWeek(input.meta ?? { deloadWeeks: [] }, plan.today, plan.settings.weekStart);
    try {
      const next = await saveSchedule(routine, s, meta);
      onRoutine?.(next);
      setErr(false);
    } catch {
      setErr(true);
    }
  };

  const deloadNow = cells[0]?.deload === true;

  return (
    <div class="sf-rt__block">
      {!bare && <h2 class={strip ? 'sf-sec__label' : 'sf-rt__h'}>{strip ? t('ux.thisWeek') : s?.mode === 'cycle' ? t('sc.cycle.title') : t('sc.week.title')}</h2>}
      {!s && <p class="sf-rt__meta">{t('sc.noplan')}</p>}
      {s?.mode === 'floating' && Object.keys(plan.recovery).length === 0 && <p class="sf-lib__note">{t('sc.rotationNow')}</p>}
      {s?.mode === 'cycle' && (
        <div class="sf-sc__tiles" role="list">
          {cycleTiles(s, plan.today).map((x, i) => (
            <span key={i} role="listitem" class={`sf-sc__tile sf-sc__tile--${x.tile} ${x.today ? 'sf-sc__tile--today' : ''}`} aria-label={`${t(`sc.kind.${x.tile}` as StringKey)}${x.today ? `, ${t('sc.today.mark')}` : ''}`}>
              <span class="sf-sc__tile-letter">{x.tile}</span>
              {x.today && <span class="sf-sc__tile-name">{t('sc.today.mark')}</span>}
            </span>
          ))}
        </div>
      )}
      {s && strip && (
        <ul class="sf-wk__strip">
          {cells.map((c) => {
            const sym = isDone(c) ? '✓' : c.kind === 'T' && c.dayIndex !== undefined ? String(c.dayIndex + 1) : c.kind === 'open' || c.kind === 'none' ? '-' : c.kind;
            return (
              <li key={c.date} class="sf-wk__li">
                <button type="button" class={`sf-wk__cell${c.today ? ' sf-wk__cell--today' : ''}${c.kind === 'T' ? ' sf-wk__cell--train' : ''}${isDone(c) ? ' sf-wk__cell--done' : ''}`} aria-label={`${dayLabel(c.date)}${c.today ? ` · ${t('sc.today.mark')}` : ''} ${isDone(c) ? t('sc.done.name') : kindText(c)}`.trim()} onClick={() => setPicked(c)}>
                  <span class="sf-wk__wd">{t(`rb.wd.${weekdayOfKey(c.date)}` as StringKey)}</span>
                  <span class="sf-wk__sym">{sym}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {s && !strip && (
        <ul class="sf-rt__list">
          {cells.map((c) => (
            <li key={c.date}>
              <Card class="sf-sc__cell" onPress={() => setPicked(c)}>
                <span class="sf-sc__date">{dayLabel(c.date)}{c.today ? ` · ${t('sc.today.mark')}` : ''}</span>
                <span class="sf-sc__what">{kindText(c)}{missed(c) ? ` · ${t('sc.missed.mark')}` : ''}</span>
                {c.deload && <Badge>{t('sc.deload.chip')}</Badge>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {strip ? (
        <Collapsible id="week-options" title={t('ux.details')}>
      <div class="sf-rt__row">
        <Button variant="secondary" onPress={() => navigate(`/routine/${routine.id}/schedule`)}>{s ? t('sc.row') : t('sc.plan')}</Button>
        {s && <Button variant="secondary" onPress={() => void toggleDeload()}>{deloadNow ? t('sc.deload.unmark') : t('sc.deload.mark')}</Button>}
      </div>
        </Collapsible>
      ) : (
      <div class="sf-rt__row">
        <Button variant="secondary" onPress={() => navigate(`/routine/${routine.id}/schedule`)}>{s ? t('sc.row') : t('sc.plan')}</Button>
        {s && <Button variant="secondary" onPress={() => void toggleDeload()}>{deloadNow ? t('sc.deload.unmark') : t('sc.deload.mark')}</Button>}
      </div>
      )}
      {s && <Button variant="secondary" onPress={() => setPastOpen(true)}>{t('past.open')}</Button>}
      <PastDays routine={routine} plan={plan} open={pastOpen} onClose={() => setPastOpen(false)} />
      {err && <p class="sf-rt__err" role="alert">{t('sc.err.save')}</p>}

      <Sheet open={picked !== null} onClose={() => setPicked(null)} title={picked ? dayLabel(picked.date) : ''}>
        {picked && (
          <div class="sf-sc__stack">
            <p class="sf-rt__meta">{picked.kind === 'T' && picked.dayIndex !== undefined ? routine.days[picked.dayIndex]?.name : kindText(picked) || t('sc.date.nothing')}</p>
            {picked.dayIndex !== undefined && (
              <Button onPress={() => navigate(`/session/new?routine=${routine.id}&day=${routine.days[picked.dayIndex!]!.id}`)}>{t('sc.date.start')}</Button>
            )}
            {picked.kind !== 'T' && <Button variant="secondary" onPress={() => void setOverride(picked.date, 'train')}>{t('sc.date.move')}</Button>}
            {picked.kind !== 'R' && <Button variant="secondary" onPress={() => void setOverride(picked.date, 'rest')}>{t('sc.date.rest')}</Button>}
            {plan.state.overrides[picked.date] && !plan.state.dayPicks[picked.date] && <Button variant="secondary" onPress={() => void setOverride(picked.date, null)}>{t('sc.date.clear')}</Button>}
            <h3 class="sf-sec__label">{t('sc.pick.title')}</h3>
            <div class="sf-rt__chips" role="group" aria-label={t('sc.pick.title')}>
              {routine.days.map((d, i) => (
                <Chip key={d.id} selected={picked.dayIndex === i} onPress={() => void pickDay(picked.date, d.id)}>{d.name}</Chip>
              ))}
            </div>
            <p class="sf-lib__note">{t('sc.pick.hint')}</p>
            {plan.state.dayPicks[picked.date] && <Button variant="secondary" onPress={() => void clearPick(picked.date)}>{t('sc.pick.clear')}</Button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

