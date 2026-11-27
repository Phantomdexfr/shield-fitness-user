import { SyncChip } from '../settings/SyncChip';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { relayAvailable } from '../../data/relay/client';
import { Button, Card, EmptyState, HeroCard, Icon, PullToRefresh, Sheet } from '../../ui/components';
import type { IconName } from '../../ui/components';
import { BodyPicker, MUSCLE_IDS, isMuscle, viewsOf, type Emphasis, type MuscleId, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { useUx } from '../../ui/useUx';
import { currentOpen } from '../../data/repos/sessions';
import { listCustom } from '../../data/repos/customExercises';
import { syncNow } from '../../data/repos/gymLink';
import { SharePlanSheet } from '../share/SharePlanSheet';
import { addDays, istDayKey, weekdayOfKey } from '../../shared/dates';
import { estimateMinutes } from '../../shared/routineEdit';
import { missedDays, rankDays, recoveryPicks, restHint, restShift, todayPlan, type TodayPlan } from '../../shared/schedule';
import { activeRoutine } from '../../data/repos/schedule';
import { getExerciseIndex } from '../../dataset/loader';
import { muscleLabel } from '../exercise/muscleLabel';
import { WeekView } from '../routines/WeekView';
import { usePlan } from '../routines/usePlan';
import type { Routine, RoutineItem } from '../../shared/routine';
import type { Session } from '../../shared/session';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; routine: Routine | undefined };
const wk = (date: string) => t(`rb.wd.${weekdayOfKey(date)}` as StringKey);
const MAX_NAMED = 3;
const MAX_NEXT = 3;

/** Premium date label from an IST day key: "Thursday, 26 Nov". The key is already the IST day, so no clock and no time zone maths here. */
export function dateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(y!, m! - 1, d!)));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  return `${g('weekday')}, ${g('day')} ${g('month')}`;
}

/**
 * Premium ring [A-P109.2]: exercises with at least one set logged / exercises in an open session started today.
 * Full when today's workout is completed; an empty ring (0 of the day's exercises) before a session is open; none when there is nothing to count.
 */
export function ringOf(open: Session | undefined, today: string, doneToday: boolean, planned: number): { done: number; n: number } | undefined {
  if (doneToday) return { done: Math.max(planned, 1), n: Math.max(planned, 1) };
  if (open && !open.endedAt && istDayKey(Date.parse(open.startedAt)) === today && open.items.length > 0) {
    return { done: open.items.filter((i) => i.sets.length > 0).length, n: open.items.length };
  }
  return planned > 0 ? { done: 0, n: planned } : undefined;
}

const ALL_GOLD = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 'primary'])) as Record<MuscleId, Emphasis>;

function Ring({ done, n }: { done: number; n: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const full = done >= n;
  return (
    <span class="sf-ring" role="img" aria-label={full ? t('tp.ring.done') : t('tp.ring', { done, n })}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
        <circle class="sf-ring__track" cx="32" cy="32" r={R} fill="none" stroke-width="6" />
        <circle class="sf-ring__bar" cx="32" cy="32" r={R} fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray={`${(C * Math.min(done, n)) / n} ${C}`} transform="rotate(-90 32 32)" />
      </svg>
      <span class="sf-ring__txt">{full ? <Icon name="check" size={22} /> : `${done}/${n}`}</span>
    </span>
  );
}

function QuickTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <button type="button" class="sf-qtile" onClick={onPress}>
      <span class="sf-qtile__ico"><Icon name={icon} size={22} /></span>
      <span class="sf-qtile__lbl">{label}</span>
    </button>
  );
}

interface NextRow { key: string; name: string; slug: string | undefined; muscle: MuscleId | undefined; item: RoutineItem }

/** Premium "Next up": the first 3 exercises of today's workout, each with a mini figure of the muscle it trains. Reads the day already loaded. */
function NextUp({ items, onOpen }: { items: RoutineItem[]; onOpen: (slug: string) => void }) {
  const [rows, setRows] = useState<NextRow[]>([]);
  const [sex] = useFigureSex();
  const [open, setOpen] = useState(false);
  const first = open ? items : items.slice(0, MAX_NEXT);
  const sig = first.map((i) => (i.ref.kind === 'lib' ? i.ref.slug : i.ref.id)).join('|');
  useEffect(() => {
    let live = true;
    void Promise.all([getExerciseIndex().catch(() => undefined), listCustom().catch(() => [])]).then(([ix, custom]) => {
      if (!live) return;
      setRows(
        first.map((item, i) => {
          if (item.ref.kind === 'lib') {
            const row = ix?.bySlug.get(item.ref.slug);
            return { key: `${i}-${item.ref.slug}`, name: row?.name ?? item.ref.slug, slug: item.ref.slug, muscle: row?.primary.find(isMuscle), item };
          }
          const id = item.ref.id;
          const c = custom.find((x) => x.id === id);
          const m = c?.muscles.find((x) => x.role === 'primary' && isMuscle(x.id)) ?? c?.muscles.find((x) => isMuscle(x.id));
          return { key: `${i}-${id}`, name: c?.name ?? id, slug: c?.slug, muscle: m?.id, item };
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [sig]);
  if (items.length === 0) return null;
  const more = items.length - MAX_NEXT;
  return (
    <div class="sf-rt__block sf-nextup">
      <h2 class="sf-sec__label">{t('tp.next')}</h2>
      <ul class="sf-nextup__list">
        {rows.map((r) => {
          const view: View = (r.muscle ? viewsOf(r.muscle)[0] : undefined) ?? 'front';
          const reps = r.item.repMin === r.item.repMax ? String(r.item.repMin) : `${r.item.repMin}-${r.item.repMax}`;
          return (
            <li key={r.key}>
              <button type="button" class="sf-nextup__row" disabled={!r.slug} onClick={() => r.slug && onOpen(r.slug)}>
                <span class="sf-nextup__fig" aria-hidden="true">
                  <BodyPicker mode="view" size="mini" sex={sex} view={view} emphasis={r.muscle ? ({ [r.muscle]: 'primary' } as Record<MuscleId, Emphasis>) : {}} />
                </span>
                <span class="sf-nextup__txt">
                  <span class="sf-nextup__name">{r.name}</span>
                  <span class="sf-nextup__meta">{t('tp.setsReps', { sets: r.item.sets, reps })}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <button type="button" class="sf-nextup__more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('tp.less') : t('tp.more', { n: more })}
        </button>
      )}
    </div>
  );
}

/** Home: the Today card (SC4 hint, SC3 missed-day sheet, Welcome back, deload banner) and the week strip. */
export default function TodayPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [swap, setSwap] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const cardOn = useFeature('today_card');
  const schedOn = useFeature('rest_scheduler');
  const hintsOn = useFeature('rest_suggestions');
  const shareOn = useFeature('plan_share') && relayAvailable();
  const quickOn = useFeature('quick_workout');
  const [shareOpen, setShareOpen] = useState(false);
  const premium = useUx('layout') === 'premium';
  const [open, setOpen] = useState<Session | undefined>();
  const [sex] = useFigureSex();

  const read = () => activeRoutine().then((routine) => setLoad({ status: 'ready', routine }), () => setLoad({ status: 'error' }));
  useEffect(() => {
    void read();
    void currentOpen().then(setOpen, () => setOpen(undefined));
  }, []);
  // Pull to refresh (Phase 104): sync when connected (a standalone phone skips at once), then re-read the routine.
  const refresh = () => Promise.allSettled([syncNow('manual'), read(), currentOpen().then(setOpen, () => setOpen(undefined))]);

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
  const quickGrid = (withShare: boolean) =>
    premium ? (
      <div class="sf-rt__block">
        <h2 class="sf-sec__label">{t('ux.quick')}</h2>
        <div class="sf-qtiles">
          {withShare && shareOn && <QuickTile icon="export" label={t('ux.shareQuick')} onPress={() => setShareOpen(true)} />}
          {shareOn && <QuickTile icon="qr-code" label={t('ux.scanQuick')} onPress={() => navigate('/share')} />}
          <QuickTile icon="clock-counter-clockwise" label={t('ux.historyQuick')} onPress={() => navigate('/history')} />
          {quickOn && <QuickTile icon="lightning" label={t('ux.quickWorkout')} onPress={() => navigate('/quick')} />}
        </div>
      </div>
    ) : (
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
  // Premium top (ux.layout): the large title, then a small IST date label and the sync pill on one line, then the View entry.
  const premiumHead = (
    <>
      {title}
      <div class="sf-today__top">
        <span class="sf-today__date">{dateLabel(plan.today)}</span>
        <SyncChip />
      </div>
    </>
  );

  if (!routine || !tp) {
    if (premium) {
      return (
        <section class="sf-page-body sf-sc">
          {premiumHead}
          {cardOn && (
            <HeroCard class="sf-today-empty">
              <span class="sf-today-empty__fig" aria-hidden="true">
                <BodyPicker mode="view" size="mini" sex={sex} view="front" emphasis={ALL_GOLD} />
              </span>
              <p class="sf-rt__name">{t('sc.today.noroutine')}</p>
              <Button fullWidth onPress={() => navigate('/routine/new')}>{t('sc.today.makeroutine')}</Button>
              <button type="button" class="sf-today__link" onClick={() => navigate('/session/new?free=1')}>{t('sc.today.justStart')}</button>
            </HeroCard>
          )}
          {quickGrid(false)}
        </section>
      );
    }
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

  // Unlogged planned days count as rest and the plan slides forward by itself (autoShifts); only a long break shows the Welcome back card.
  const missed = schedOn ? missedDays(effective, input.meta?.savedOn ?? addDays(today, -14)) : { dates: [], inARow: 0, welcomeBack: false };
  const welcome = missed.welcomeBack && state.welcomeDone !== today;

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
  const restOverrides = () => ({ ...state.overrides, ...restShift(effective, today) });
  const restToday = () => void plan.patchState({ overrides: restOverrides() });
  const label = tp.deload ? t('sc.deload.banner') : t('page.today.title');

  const lines = (
    <>
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
    </>
  );
  const notice = (
    <>
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
                  <Button variant="secondary" onPress={() => void finishHint({ overrides: restOverrides() })}>{t('sc.hint.rest')}</Button>
                </div>
              </div>
            )
          )}
    </>
  );
  const actions = (
    <>
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
    </>
  );
  const ring = ringOf(open, today, doneToday, day?.items.length ?? 0);
  const showRing = doneToday || (train && ring !== undefined);
  const premiumActions = (
    <>
      {train && <Button class="sf-start" onPress={() => startDay(tp.dayIndex!)}>{t('tp.start')}</Button>}
      {!doneToday && (tp.kind === 'active' || tp.kind === 'mobility') && <Button onPress={() => navigate('/library')}>{t('sc.today.start')}</Button>}
      {!doneToday && tp.kind === 'rest' && tp.dayIndex !== undefined && <Button variant="secondary" onPress={() => startDay(tp.dayIndex!)}>{t('sc.today.another')}</Button>}
      {train && (
        <div class="sf-today-hero__sec">
          <Button variant="secondary" onPress={() => setSwap(true)}>{t('ux.swapDay')}</Button>
          <Button variant="secondary" onPress={restToday}>{t('ux.restToday')}</Button>
        </div>
      )}
      {!doneToday && (tp.kind === 'active' || tp.kind === 'mobility') && <Button variant="secondary" onPress={restToday}>{t('sc.today.skip')}</Button>}
    </>
  );
  const showNext = premium && train && day !== undefined && day.items.length > 0;
  return (
    <PullToRefresh onRefresh={refresh}>
    <section class="sf-page-body sf-sc">
      {premium ? premiumHead : head}
      {cardOn && premium && (
        <HeroCard class="sf-today-hero">
          <div class="sf-today-hero__top">
            <div class="sf-today-hero__text">
              <span class="sf-sec__label">{label}</span>
              {lines}
            </div>
            {showRing && ring && <Ring done={ring.done} n={ring.n} />}
          </div>
          {notice}
          {premiumActions}
        </HeroCard>
      )}
      {cardOn && !premium && (
        <Card tone="gold" class="sf-sc__today">
          <span class="sf-sec__label">{label}</span>
          {lines}

          {/* ONE notice slot: the welcome-back note wins over the daily rest hint. */}
          {notice}

          {actions}
        </Card>
      )}
      {showNext && <NextUp items={day!.items} onOpen={(slug) => navigate(`/exercise/${slug}`)} />}

      <WeekView strip routine={routine} plan={plan} onRoutine={(r) => setLoad({ status: 'ready', routine: r })} />

      {quickGrid(true)}
      {shareOn && <SharePlanSheet open={shareOpen} onClose={() => setShareOpen(false)} routineId={routine.id} />}

      <Sheet open={swap} onClose={() => setSwap(false)} title={t('sc.swap.title')}>
        {others.length === 0 ? (
          <div class="sf-sc__stack">
            <p class="sf-rt__meta">{t('sc.hint.only')}</p>
            <Button variant="secondary" onPress={() => { setSwap(false); void finishHint({ overrides: restOverrides() }); }}>{t('sc.hint.rest')}</Button>
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
    </PullToRefresh>
  );
}
