import { useEffect, useRef, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Badge, Button, Chip, Pressable, SetCheck, Sheet, Stepper, WheelPicker, showToast } from '../../ui/components';
import { useUx } from '../../ui/useUx';
import { loggerWheel } from '../../shared/wheel';
import type { LoggerInfo, ItemHistory } from '../../data/repos/logger';
import { bestE1rm } from '../../shared/engine/sessionStats';
import { e1rm } from '../../shared/engine/oneRm';
import {
  EMPTY_CARDIO, MAX_KG, MAX_REPS, RPE_MAX, RPE_MIN, RPE_STEP, TAGS, addRamp, addSet, cardioFromDraft, deleteSet, duplicateSet, editSet, initialDraft, lastTime, restoreSet, setFromDraft, swipeAction, swipeFollow, weightStep,
  type CardioDraft, type Draft, type LoggerPrefs, type SetTag,
} from '../../shared/logger';
import { actualRest, adjustRest, clockText, defaultRest, remainingRest, restSeconds, startRest, warmupSets, type RestTimer } from '../../shared/pocket';
import type { Session, SessionItem, SetLog } from '../../shared/session';
import { buzz, keepAwake, letSleep } from './device';
import { PlateSheet } from './PlateSheet';
import { HoldTimerBlock } from './HoldTimer';
import { clockSeconds, timedFromDraft } from '../../shared/timed';

type Undo = { text: string; restore: (cur: Session) => Session };

interface Props {
  sess: Session;
  /** Index of the item in the sorted list (the index every session reducer takes). */
  idx: number;
  item: SessionItem;
  info: LoggerInfo;
  hist: ItemHistory | undefined;
  prefs: LoggerPrefs;
  onPrefs: (p: LoggerPrefs) => void;
  commit: (next: Session, u?: Undo) => void;
}

/** Put a swiped row back (the CSS springs it). */
const rowReset = (el: HTMLElement): void => {
  el.style.removeProperty('--sw-x');
  delete el.dataset.swipe;
  delete el.dataset.ready;
};

/** 1 at the start of a rest, 0 when it is over (feeds the thin bar on the docked timer). */
const restProgress = (timer: RestTimer, now: number): number => {
  return Math.max(0, Math.min(1, remainingRest(timer, now) / Math.max(1, timer.seconds)));
};

const kg = (n: number | null | undefined): string => `${n ?? 0} kg`;

/** One set row as text: "60 kg x 10", "12 reps" (bodyweight) or the cardio parts. */
export function setLine(s: SetLog): string {
  if (s.seconds !== undefined && s.reps == null && !s.distanceM && !s.incline && !s.calories && s.seconds < 600) {
    const time = s.seconds < 60 ? t('lg.c.clock', { n: clockSeconds(s.seconds) }) : t('lg.c.clockm', { n: clockSeconds(s.seconds) });
    return s.weightKg ? `${kg(s.weightKg)} · ${time}` : time;
  }
  if (s.seconds !== undefined && s.reps == null) {
    const parts = [t('lg.c.min', { n: Math.round((s.seconds / 60) * 10) / 10 })];
    if (s.distanceM) parts.push(t('lg.c.km', { n: Math.round(s.distanceM / 10) / 100 }));
    if (s.incline) parts.push(t('lg.c.inc', { n: s.incline }));
    if (s.calories) parts.push(t('lg.c.kcal', { n: s.calories }));
    return parts.join(' · ');
  }
  return s.weightKg ? t('lg.set.line', { weight: kg(s.weightKg), reps: s.reps ?? 0 }) : t('lg.set.bw', { reps: s.reps ?? 0 });
}

/** The set rows, entry steppers and pocket tools for one open item of a session. */
export function SetLogger({ sess, idx, item, info, hist, prefs, onPrefs, commit }: Props) {
  const rampOn = useFeature('warmup_ramp');
  const plateOn = useFeature('plate_calculator');
  const smartOn = useFeature('smart_rest_timer');
  const adv = prefs.mode === 'advanced';
  // Phase 107-a: weight and reps are wheels in Premium (ux.wheels); Classic and "Steppers" keep the plus / minus pair. Same draft, same saved values.
  const wheels = useUx('wheels') === 'premium';
  // Phase 107-b: under ux.layout Premium a set row follows the finger and shows what the release will do; Classic keeps the bare swipe.
  const follow = useUx('layout') === 'premium';
  const step = weightStep(info.stepKg);
  const last = lastTime(hist?.results ?? [], hist?.suggestion);
  const sug = hist?.suggestion ?? null;
  const fill = () => initialDraft({ logged: item.sets, last, suggestion: sug, repMin: item.plan?.repMin ?? info.repMin, repMax: item.plan?.repMax ?? info.repMax, ...(item.plan ? { planReps: item.plan.repMin } : {}) });

  const [draft, setDraft] = useState<Draft>(fill);
  const [cardio, setCardio] = useState<CardioDraft>(EMPTY_CARDIO);
  const touched = useRef(false);
  const [timer, setTimer] = useState<RestTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editAt, setEditAt] = useState<number | null>(null);
  // Phase 104: the set logged a moment ago gets a drawn tick (Premium only; SetCheck draws nothing in Classic or with Motion Reduced).
  const [fresh, setFresh] = useState<string | null>(null);
  const [plates, setPlates] = useState(false);
  const buzzed = useRef(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // History arrives after the first paint: refill only if the person has not touched the numbers yet.
  useEffect(() => {
    if (!touched.current && item.sets.length === 0) setDraft(fill());
  }, [hist]);

  const left = timer ? remainingRest(timer, now) : 0;
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer]);
  useEffect(() => {
    if (!timer) return;
    if (left > 0) {
      buzzed.current = false;
      void keepAwake();
      return;
    }
    if (!buzzed.current) {
      buzzed.current = true;
      buzz();
    }
    if (!prefs.big) void letSleep();
  }, [timer, left === 0]);
  useEffect(() => () => void (prefs.big ? undefined : letSleep()), []);

  const edit = (d: Partial<Draft>) => {
    touched.current = true;
    setDraft((cur) => ({ ...cur, ...d }));
  };

  const restFor = (d: Draft): number => {
    const cls = info.cls;
    if (!smartOn) return item.plan?.restSec ?? defaultRest(cls, d.reps);
    const best = bestE1rm(hist?.results[hist.results.length - 1]?.sets ?? []);
    const mine = e1rm(d.weightKg, d.reps);
    return restSeconds({ cls, reps: d.reps, e1rmFraction: best && mine ? mine / best : null, history: hist?.rests ?? [] });
  };

  const log = () => {
    const at = Date.now();
    const iso = new Date(at).toISOString();
    const rest = actualRest(timer, at);
    if (info.cardio) {
      commit(addSet(sess, idx, cardioFromDraft(cardio, iso)));
      setFresh(iso);
      setTimer(null);
      return;
    }
    commit(addSet(sess, idx, setFromDraft(draft, iso, rest)));
    setFresh(iso);
    touched.current = true;
    const secs = draft.tag === 'warmup' ? 0 : restFor(draft);
    setNow(at);
    setTimer(secs > 0 ? startRest(at, secs) : null);
  };

  const logTimed = (seconds: number, weightKg: number) => {
    const at = Date.now();
    const iso = new Date(at).toISOString();
    const rest = actualRest(timer, at);
    commit(addSet(sess, idx, timedFromDraft({ seconds, weightKg }, iso, rest)));
    setFresh(iso);
    touched.current = true;
    const secsRest = restFor({ ...draft, reps: 10 });
    setNow(at);
    setTimer(secsRest > 0 ? startRest(at, secsRest) : null);
  };

  const ramp = rampOn && !info.cardio && !info.timed ? warmupSets(draft.weightKg, info.cls, step) : [];
  const doRamp = () => {
    if (ramp.length === 0) return;
    commit(addRamp(sess, idx, ramp, new Date().toISOString()));
    showToast(t('lg.ramp.done', { n: ramp.length }), { tone: 'ok' });
  };

  const del = (i: number) => {
    const res = deleteSet(sess, idx, i);
    if (!res.removed) return;
    commit(res.session, { text: t('lg.deleted', { n: i + 1 }), restore: (cur) => restoreSet(cur, idx, i, res.removed!) });
  };
  const dup = (i: number) => {
    const at = i + 1;
    const iso = new Date().toISOString();
    setFresh(iso);
    commit(duplicateSet(sess, idx, i, iso), { text: t('lg.copied', { n: i + 1 }), restore: (cur) => deleteSet(cur, idx, at).session });
  };

  const bw = info.cls === 'bodyweight' || (draft.weightKg === 0 && last !== null && last.weightKg === 0);
  const sameAsSug = sug && sug.weightKg != null && draft.weightKg === sug.weightKg && draft.reps === (sug.reps[0] ?? draft.reps);
  const editing = editAt !== null ? item.sets[editAt] : undefined;

  return (
    <div class="sf-lg">
      {last && (
        <p class="sf-lg__last">
          {last.weightKg > 0 ? t('lg.last', { weight: kg(last.weightKg), reps: last.reps.join(', ') }) : t('lg.last.bw', { reps: last.reps.join(', ') })}
          {last.trend && <Badge tone={last.trend === 'up' ? 'ok' : last.trend === 'down' ? 'warn' : 'neutral'}>{t(`lg.trend.${last.trend}` as StringKey)}</Badge>}
        </p>
      )}

      {sug && sug.weightKg != null && !info.cardio && !info.timed && !sameAsSug && (
        <Chip onPress={() => edit({ weightKg: sug.weightKg ?? 0, reps: sug.reps[0] ?? draft.reps })}>
          {sug.weightKg > 0 ? t('lg.try', { weight: kg(sug.weightKg), reps: sug.reps[0] ?? draft.reps }) : t('lg.try.bw', { reps: sug.reps[0] ?? draft.reps })}
        </Chip>
      )}

      {item.sets.length > 0 && (
        <>
          <ol class="sf-lg__sets">
            {item.sets.map((s, i) => (
              <li
                key={`${s.doneAt}-${i}`}
                class="sf-lg__row"
                data-label-del={t('lg.del')}
                data-label-dup={t('lg.dup')}
                onPointerDown={(e) => { swiped.current = false; press.current = { x: e.clientX, y: e.clientY }; }}
                onPointerMove={(e) => {
                  const p = press.current;
                  if (!follow || !p) return;
                  const f = swipeFollow(e.clientX - p.x, e.clientY - p.y);
                  const el = e.currentTarget as HTMLElement;
                  el.style.setProperty('--sw-x', `${f.x}px`);
                  el.dataset.swipe = f.x === 0 ? '' : f.x < 0 ? 'delete' : 'duplicate';
                  el.dataset.ready = f.action ? 'yes' : '';
                }}
                onPointerUp={(e) => {
                  const p = press.current;
                  press.current = null;
                  rowReset(e.currentTarget as HTMLElement);
                  const a = p ? swipeAction(e.clientX - p.x, e.clientY - p.y) : null;
                  if (a) { swiped.current = true; a === 'delete' ? del(i) : dup(i); }
                }}
                onPointerCancel={(e) => { press.current = null; rowReset(e.currentTarget as HTMLElement); }}
              >
                <Pressable class="sf-lg__set" aria-label={t('lg.edit.aria', { n: i + 1, line: setLine(s) })} onPress={() => { if (swiped.current) { swiped.current = false; return; } setEditAt(i); }}>
                  <span class="sf-lg__n">{i + 1}</span>
                  {s.doneAt === fresh && <SetCheck />}
                  <span class="sf-lg__line">{setLine(s)}</span>
                  {s.tag !== 'normal' && <Badge tone="neutral">{t(`lg.tag.${s.tag}` as StringKey)}</Badge>}
                  {s.rpe != null && <span class="sf-rt__meta">{t('lg.rpe.n', { n: s.rpe })}</span>}
                </Pressable>
              </li>
            ))}
          </ol>
          <p class="sf-rt__meta">{t('lg.swipe')}</p>
        </>
      )}

      {timer && (
        <div class="sf-lg__rest" role="timer" aria-live="off" style={timer ? { '--rest-p': String(restProgress(timer, now)) } : undefined}>
          <span class="sf-lg__clock">{left > 0 ? t('lg.rest', { time: clockText(left) }) : t('lg.rest.over')}</span>
          <div class="sf-rt__row">
            <Button variant="secondary" onPress={() => setTimer(adjustRest(timer, -15))}>{t('lg.rest.minus')}</Button>
            <Button variant="secondary" onPress={() => setTimer(adjustRest(timer, 15))}>{t('lg.rest.plus')}</Button>
            <Button variant="secondary" onPress={() => setTimer(null)}>{t('lg.rest.skip')}</Button>
          </div>
        </div>
      )}

      {info.timed ? (
        <HoldTimerBlock repMin={item.plan?.repMin ?? info.repMin} repMax={item.plan?.repMax ?? info.repMax} stepKg={step} onLog={logTimed} />
      ) : info.cardio ? (
        <div class="sf-lg__entry">
          <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.c.minutes')}</span><Stepper label={t('lg.c.minutes')} value={cardio.minutes} step={1} min={0} max={600} onChange={(v) => setCardio({ ...cardio, minutes: v })} /></div>
          <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.c.distance')}</span><Stepper label={t('lg.c.distance')} value={cardio.distanceKm} step={0.1} min={0} max={500} onChange={(v) => setCardio({ ...cardio, distanceKm: v })} /></div>
          <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.c.incline')}</span><Stepper label={t('lg.c.incline')} value={cardio.incline} step={0.5} min={0} max={40} onChange={(v) => setCardio({ ...cardio, incline: v })} /></div>
          <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.c.calories')}</span><Stepper label={t('lg.c.calories')} value={cardio.calories} step={5} min={0} max={5000} onChange={(v) => setCardio({ ...cardio, calories: v })} /></div>
          <Button icon="plus" onPress={log}>{t('lg.log.cardio')}</Button>
        </div>
      ) : (
        <div class="sf-lg__entry">
          <div class={`sf-lg__pair${wheels ? ' sf-lg__pair--wheels' : ''}`}>
            <div class="sf-lg__field">
              <span class="sf-rt__meta">{t('lg.weight')}</span>
              {wheels ? (
                <WheelPicker class="sf-lg__wheel" label={t('lg.weight')} {...loggerWheel(draft.weightKg, step, MAX_KG, 'weight')} format={(v) => (v === 0 && bw ? t('lg.bw') : String(v))} onChange={(v) => edit({ weightKg: v })} />
              ) : (
                <Stepper label={t('lg.weight')} value={draft.weightKg} step={step} min={0} max={MAX_KG} format={(v) => (v === 0 && bw ? t('lg.bw') : String(v))} onChange={(v) => edit({ weightKg: v })} />
              )}
            </div>
            <div class="sf-lg__field">
              <span class="sf-rt__meta">{t('lg.reps')}</span>
              {wheels ? (
                <WheelPicker class="sf-lg__wheel" label={t('lg.reps')} {...loggerWheel(draft.reps, 1, MAX_REPS, 'reps')} onChange={(v) => edit({ reps: v })} />
              ) : (
                <Stepper label={t('lg.reps')} value={draft.reps} step={1} min={0} max={MAX_REPS} onChange={(v) => edit({ reps: v })} />
              )}
            </div>
          </div>
          {adv && (
            <>
              <div class="sf-lg__field">
                <span class="sf-rt__meta">{t('lg.rpe')}</span>
                {draft.rpe === null ? (
                  <Button variant="secondary" onPress={() => edit({ rpe: 8 })}>{t('lg.rpe.add')}</Button>
                ) : (
                  <div class="sf-rt__row">
                    <Stepper class="sf-lg__grow" label={t('lg.rpe')} value={draft.rpe} step={RPE_STEP} min={RPE_MIN} max={RPE_MAX} onChange={(v) => edit({ rpe: v })} />
                    <Button variant="secondary" onPress={() => edit({ rpe: null })}>{t('lg.rpe.clear')}</Button>
                  </div>
                )}
              </div>
              <div class="sf-rt__chips" role="group" aria-label={t('lg.tag')}>
                {TAGS.map((g: SetTag) => <Chip key={g} selected={draft.tag === g} onPress={() => edit({ tag: g })}>{t(`lg.tag.${g}` as StringKey)}</Chip>)}
              </div>
            </>
          )}
          <Button icon="plus" onPress={log}>{t('lg.log')}</Button>
          <div class="sf-rt__row">
            {ramp.length > 0 && item.sets.length === 0 && <Button variant="secondary" onPress={doRamp}>{t('lg.ramp')}</Button>}
            {plateOn && <Button variant="secondary" onPress={() => setPlates(true)}>{t('lg.plates')}</Button>}
          </div>
        </div>
      )}

      <PlateSheet open={plates} onClose={() => setPlates(false)} target={draft.weightKg} prefs={prefs} onPrefs={onPrefs} onUse={(w) => edit({ weightKg: w })} />

      <Sheet open={editAt !== null && editing !== undefined} onClose={() => setEditAt(null)} title={t('lg.edit.title', { n: (editAt ?? 0) + 1 })}>
        {editing && editAt !== null && (
          <div class="sf-lg__sheet">
            {editing.seconds !== undefined && editing.reps == null ? (
              info.timed ? (
                <>
                  <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.hold.edit')}</span><Stepper label={t('lg.hold.edit')} value={editing.seconds} step={5} min={0} max={3600} format={clockSeconds} onChange={(v) => commit(editSet(sess, idx, editAt, { seconds: Math.round(v) }))} /></div>
                  <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.hold.weight')}</span><Stepper label={t('lg.hold.weight')} value={editing.weightKg ?? 0} step={step} min={0} max={MAX_KG} format={(v) => (v === 0 ? t('lg.bw') : String(v))} onChange={(v) => commit(editSet(sess, idx, editAt, { weightKg: v > 0 ? v : null }))} /></div>
                </>
              ) : (
                <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.c.minutes')}</span><Stepper label={t('lg.c.minutes')} value={Math.round(editing.seconds / 6) / 10} step={1} min={0} max={600} onChange={(v) => commit(editSet(sess, idx, editAt, { seconds: Math.round(v * 60) }))} /></div>
              )
            ) : (
              <>
                <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.weight')}</span><Stepper label={t('lg.weight')} value={editing.weightKg ?? 0} step={step} min={0} max={MAX_KG} onChange={(v) => commit(editSet(sess, idx, editAt, { weightKg: v > 0 ? v : null }))} /></div>
                <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.reps')}</span><Stepper label={t('lg.reps')} value={editing.reps ?? 0} step={1} min={0} max={MAX_REPS} onChange={(v) => commit(editSet(sess, idx, editAt, { reps: v }))} /></div>
                {adv && (
                  <>
                    <div class="sf-rt__chips" role="group" aria-label={t('lg.tag')}>
                      {TAGS.map((g: SetTag) => <Chip key={g} selected={editing.tag === g} onPress={() => commit(editSet(sess, idx, editAt, { tag: g }))}>{t(`lg.tag.${g}` as StringKey)}</Chip>)}
                    </div>
                    {editing.rpe != null && editing.tag !== 'warmup' && <Stepper label={t('lg.rpe')} value={editing.rpe} step={RPE_STEP} min={RPE_MIN} max={RPE_MAX} onChange={(v) => commit(editSet(sess, idx, editAt, { rpe: v }))} />}
                  </>
                )}
              </>
            )}
            <div class="sf-rt__row">
              <Button variant="secondary" onPress={() => { dup(editAt); setEditAt(null); }}>{t('lg.dup')}</Button>
              <Button variant="danger" onPress={() => { del(editAt); setEditAt(null); }}>{t('lg.del')}</Button>
              <Button onPress={() => setEditAt(null)}>{t('lg.done')}</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

