import { SyncChip } from '../settings/SyncChip';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { relayAvailable } from '../../data/relay/client';
import { Button, Card, EmptyState, Sheet } from '../../ui/components';
import { SharePlanSheet } from '../share/SharePlanSheet';
import { addDays, weekdayOfKey } from '../../shared/dates';
import { estimateMinutes } from '../../shared/routineEdit';
import { missedDays, pointerAfter, rankDays, recoveryPicks, restHint, todayPlan, type TodayPlan } from '../../shared/schedule';
import { activeRoutine } from '../../data/repos/schedule';
import { getExerciseIndex } from '../../dataset/loader';
import { muscleLabel } from '../exercise/muscleLabel';
import { WeekView } from '../routines/WeekView';
import { usePlan } from '../routines/usePlan';
import type { Routine } from '../../shared/routine';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; routine: Routine | undefined };
const wk = (date: string) => t(`rb.wd.${weekdayOfKey(date)}` as StringKey);
const MAX_NAMED = 3;

/** Home: the Today card (SC4 hint, SC3 missed-day sheet, Welcome back, deload banner) and the week strip. */
export default function TodayPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [swap, setSwap] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [sheetErr, setSheetErr] = useState(false);
  const [sheetGone, setSheetGone] = useState(false);
  const cardOn = useFeature('today_card');
  const schedOn = useFeature('rest_scheduler');
  const hintsOn = useFeature('rest_suggestions');
  const shareOn = useFeature('plan_share') && relayAvailable();
  const quickOn = useFeature('quick_workout');
  const [shareOpen, setShareOpen] = useState(false);

  const read = () => activeRoutine().then((routine) => setLoad({ status: 'ready', routine }), () => setLoad({ status: 'error' }));
  useEffect(() => {
    void read();
  }, []);

  const routine = load.status === 'ready' ? load.routine : undefined;
  const plan = usePlan(routine);
  const { input, state, settings, recovery, today } = plan;
  // A gym that switches the scheduler off leaves "no schedule": the app still suggests a day.
  const effective = schedOn ? input : { ...input, schedule: undefined };
  const tp: TodayPlan | undefined = plan.ready && routine ? todayPlan({ ...effective, recovery }) : undefined;

  useEffect(() => {
    if (!tp || (tp.kind !== 'active' && tp.kind !== 'mobility')) return setNames([]);
    void getExerciseIndex().then(
      (ix) => {
        const rows = ix.rows.map((r) => ({ slug: r.slug, name: r.name, category: r.category, subCategory: r.subCategory }));
        const byName = new Map(rows.map((r) => [r.slug, r.name]));
        setNames(recoveryPicks(tp.kind as 'active' | 'mobility', rows, today).map((s) => byName.get(s) ?? s));
      },
      () => setNames([]),
    );
  }, [tp?.kind, today]);

  if (load.status === 'loading' || (load.status === 'ready' && routine && !plan.ready)) return <section class="sf-page-body"><h1 class="sf-page-title">{t('page.today.title')}</h1><p class="sf-lib__note" role="status">{t('sc.today.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body"><h1 class="sf-page-title">{t('page.today.title')}</h1><EmptyState icon="warning" title={t('sc.today.error')} actionLabel={t('rb.error.retry')} onAction={() => void read()} /></section>;

  const title = <h1 class="sf-page-title">{t('page.today.title')}</h1>;
  const head = <div class="sf-today__head">{title}<SyncChip /></div>;
  const quickGrid = (withShare: boolean) => (
    <div class="sf-rt__block">
      <h2 class="sf-sec__label">{t('ux.quick')}</h2>
      <div class="sf-qgrid">
        {withShare && shareOn && <Button variant="secondary" onPress={() => setShareOpen(true)}>{t('ux.shareQuick')}</Button>}
        {shareOn && <Button variant="secondary" onPress={() => navigate('/share')}>{t('ux.scanQuick')}</Button>}
        <Button variant="secondary" onPress={() => navigate('/history')}>{t('ux.historyQuick')}</Button>
        {quickOn && <Button variant="secondary" onPress={() => navigate('/quick')}>{t('ux.quickWorkout')}</Button>}
      </div>
    </div>
  );

  if (!routine || !tp) {
    return (
      <section class="sf-page-body sf-sc">
        {head}
        {cardOn && (
          <Card tone="gold" class="sf-sc__today">
            <p class="sf-rt__name">{t('sc.today.noroutine')}</p>
            <div class="sf-rt__row">
              <Button onPress={() => navigate('/routine/new')}>{t('sc.today.makeroutine')}</Button>
              <Button variant="secondary" onPress={() => navigate('/session/new?free=1')}>{t('sc.today.justStart')}</Button>
            </div>
          </Card>
        )}
        {quickGrid(false)}
      </section>
    );
  }

  const days = routine.days;
  const startDay = (i: number) => navigate(`/session/new?routine=${routine.id}&day=${days[i]!.id}`);
  const dayName = (i: number | undefined) => (i === undefined ? '' : days[i]?.name ?? '');
  const day = tp.dayIndex !== undefined ? days[tp.dayIndex] : undefined;

  // SC3 missed-day sheet (one per open) or the Welcome back card.
  const missed = schedOn && !sheetGone ? missedDays(effective, input.meta?.savedOn ?? addDays(today, -14)) : { dates: [], inARow: 0, welcomeBack: false };
  const welcome = missed.welcomeBack && state.welcomeDone !== today;
  const sheetDate = !missed.welcomeBack ? missed.dates[0] : undefined;
  const missedDay = days.length > 0 ? days[state.pointer % days.length] : undefined;

  const decide = async (date: string, how: 'shift' | 'skip') => {
    const patch = {
      decided: [...state.decided, date],
      ...(how === 'skip' ? { pointer: pointerAfter(state.pointer % Math.max(1, days.length), days.length) } : {}),
    };
    const ok = await plan.patchState(patch);
    setSheetErr(!ok);
    return ok;
  };
  const doToday = async (date: string) => {
    const ok = await plan.patchState({ decided: [...state.decided, date], overrides: { ...state.overrides, [today]: 'train' } });
    setSheetErr(!ok);
  };
  const later = async (date: string) => {
    if (!(await decide(date, settings.missed))) return;
    setSheetGone(true);
  };
  const dismissWelcome = () => void plan.patchState({ welcomeDone: today, decided: [...state.decided, ...missed.dates] });

  // SC4 hint: once per day, never on A/M/rest, hidden without recovery data.
  const hintShown = (tp.kind === 'train' || tp.kind === 'suggest') && hintsOn && !state.hintDone.includes(today);
  const hint = hintShown ? restHint(day, recovery, settings.hints) : undefined;
  const finishHint = (extra: Partial<typeof state> = {}) => plan.patchState({ hintDone: [...state.hintDone, today], ...extra });
  const swapList = rankDays(days, state.pointer, recovery).filter((r) => r.index !== tp.dayIndex);
  const others = days.map((_, i) => i).filter((i) => i !== tp.dayIndex);

  const line = (() => {
    switch (tp.kind) {
      case 'train':
        return tp.due ? t('sc.due', { day: dayName(tp.dayIndex) }) : '';
      case 'suggest':
        if (tp.line === 'most_recovered') return t('sc.most', { name: dayName(tp.dayIndex).toLowerCase() });
        if (tp.line === 'all_recovering') return t('sc.allRecovering');
        return input.schedule && input.schedule.mode === 'floating' ? '' : t('sc.noPlanToday');
      case 'rest':
        return tp.next ? t('sc.restDay', { day: dayName(tp.next.dayIndex), weekday: wk(tp.next.date) }) : t('sc.restDay.nonext');
      default:
        return '';
    }
  })();

  const detail = day ? (day.items.length === 0 ? t('sc.today.noitems') : t('sc.today.detail', { n: day.items.length, min: estimateMinutes(day.items) })) : '';

  // A workout finished today: the card says so instead of jumping to the next day.
  const doneToday = plan.sessionDates.includes(today);
  const train = !doneToday && (tp.kind === 'train' || tp.kind === 'suggest') && day !== undefined && tp.dayIndex !== undefined;
  const restToday = () => void plan.patchState({ overrides: { ...state.overrides, [today]: 'rest' } });
  const label = tp.deload ? t('sc.deload.banner') : t('page.today.title');

  return (
    <section class="sf-page-body sf-sc">
      {head}
      {cardOn && (
        <Card tone="gold" class="sf-sc__today">
          <span class="sf-sec__label">{label}</span>
          {doneToday && <p class="sf-rt__name">{t('sc.done.name')}</p>}
          {doneToday && <p class="sf-rt__meta" role="status">{t('sc.done.line')}</p>}
          {doneToday && <Button variant="secondary" onPress={() => (tp.dayIndex !== undefined ? startDay(tp.dayIndex) : navigate('/session/new?free=1'))}>{t('sc.done.again')}</Button>}
          {!doneToday && (tp.kind === 'train' || tp.kind === 'suggest') && day && <p class="sf-rt__name">{day.name}</p>}
          {!doneToday && tp.kind === 'active' && <p class="sf-rt__name">{t('sc.kind.A')}</p>}
          {!doneToday && tp.kind === 'mobility' && <p class="sf-rt__name">{t('sc.kind.M')}</p>}
          {!doneToday && tp.kind === 'rest' && <p class="sf-rt__name">{t('sc.kind.R')}</p>}
          {!doneToday && line && <p class="sf-rt__meta" role="status">{line}</p>}
          {!doneToday && tp.cap !== undefined && <p class="sf-rt__meta" role="status">{t('sc.cap', { n: tp.cap })}</p>}
          {!doneToday && detail && (tp.kind === 'train' || tp.kind === 'suggest') && <p class="sf-rt__meta">{detail}</p>}
          {!doneToday && (tp.kind === 'active' || tp.kind === 'mobility') && <p class="sf-rt__meta">{names.length > 0 ? t(tp.kind === 'active' ? 'sc.today.recovery' : 'sc.today.mobility', { names: names.join(', ') }) : t('sc.today.recovery.none')}</p>}

          {/* ONE notice slot: the welcome-back note wins over the daily rest hint. */}
          {doneToday ? null : welcome ? (
            <div class="sf-sc__hint" role="status">
              <p class="sf-rt__hint-text">{t('sc.welcome', { day: dayName(state.pointer % days.length) })}</p>
              <div class="sf-rt__row">
                <Button variant="secondary" onPress={() => { dismissWelcome(); startDay(state.pointer % days.length); }}>{t('sc.today.start')}</Button>
                <Button variant="secondary" onPress={dismissWelcome}>{t('sc.missed.later')}</Button>
              </div>
            </div>
          ) : (
            hint && (
              <div class="sf-sc__hint" role="status">
                <p class="sf-rt__hint-text">
                  {t('sc.hint.text', {
                    muscles: hint.muscles.slice(0, MAX_NAMED).map(muscleLabel).join(', ') + (hint.muscles.length > MAX_NAMED ? ` ${t('sc.hint.more', { n: hint.muscles.length - MAX_NAMED })}` : ''),
                  })}
                </p>
                <div class="sf-rt__row">
                  <Button variant="secondary" onPress={() => void finishHint()}>{t('sc.hint.train')}</Button>
                  <Button variant="secondary" onPress={() => setSwap(true)}>{t('sc.hint.swap')}</Button>
                  <Button variant="secondary" onPress={() => void finishHint({ overrides: { ...state.overrides, [today]: 'rest' } })}>{t('sc.hint.rest')}</Button>
                </div>
              </div>
            )
          )}

          {train && <Button onPress={() => startDay(tp.dayIndex!)}>{t('sc.today.start')}</Button>}
          {!doneToday && (tp.kind === 'active' || tp.kind === 'mobility') && <Button onPress={() => navigate('/library')}>{t('sc.today.start')}</Button>}
          {!doneToday && tp.kind === 'rest' && tp.dayIndex !== undefined && <Button variant="secondary" onPress={() => startDay(tp.dayIndex!)}>{t('sc.today.another')}</Button>}
          {train && (
            <div class="sf-qgrid">
              <Button variant="secondary" onPress={() => setSwap(true)}>{t('ux.swapDay')}</Button>
              <Button variant="secondary" onPress={restToday}>{t('ux.restToday')}</Button>
            </div>
          )}
          {!doneToday && (tp.kind === 'active' || tp.kind === 'mobility') && <Button variant="secondary" onPress={restToday}>{t('sc.today.skip')}</Button>}
        </Card>
      )}

      <WeekView strip routine={routine} plan={plan} onRoutine={(r) => setLoad({ status: 'ready', routine: r })} />

      {quickGrid(true)}
      {shareOn && <SharePlanSheet open={shareOpen} onClose={() => setShareOpen(false)} routineId={routine.id} />}

      <Sheet open={sheetDate !== undefined && missedDay !== undefined} onClose={() => sheetDate && void later(sheetDate)} title={t('sc.title')}>
        {sheetDate && missedDay && (
          <div class="sf-sc__stack">
            <p class="sf-rt__hint-text" role="status">{t('sc.missed.text', { day: missedDay.name, weekday: wk(sheetDate) })}</p>
            {sheetErr && <p class="sf-rt__err" role="alert">{t('sc.missed.error')}</p>}
            <Button variant={settings.missed === 'shift' ? 'primary' : 'secondary'} onPress={() => void doToday(sheetDate)}>{sheetErr ? t('sc.missed.retry') : t('sc.missed.today')}</Button>
            <Button variant={settings.missed === 'skip' ? 'primary' : 'secondary'} onPress={() => void decide(sheetDate, 'skip').then((ok) => ok && setSheetGone(true))}>{t('sc.missed.skip')}</Button>
            <Button variant="secondary" onPress={() => void later(sheetDate)}>{t('sc.missed.later')}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={swap} onClose={() => setSwap(false)} title={t('sc.swap.title')}>
        {others.length === 0 ? (
          <div class="sf-sc__stack">
            <p class="sf-rt__meta">{t('sc.hint.only')}</p>
            <Button variant="secondary" onPress={() => { setSwap(false); void finishHint({ overrides: { ...state.overrides, [today]: 'rest' } }); }}>{t('sc.hint.rest')}</Button>
          </div>
        ) : (
          <ul class="sf-rt__list">
            {(swapList.length > 0 ? swapList.map((r) => ({ index: r.index, score: r.score as number | undefined })) : others.map((index) => ({ index, score: undefined as number | undefined }))).map((r) => (
              <li key={r.index} class="sf-rt__row">
                <span class="sf-rt__grow sf-rt__name">{days[r.index]!.name}{r.score !== undefined ? ` · ${t('sc.swap.ready', { n: r.score.toFixed(1) })}` : ''}</span>
                <Button onPress={() => { setSwap(false); startDay(r.index); }}>{t('sc.today.start')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </section>
  );
}
