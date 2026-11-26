import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button, Chip, Stepper } from '../../ui/components';
import { IDLE_HOLD, MAX_HOLD_SECONDS, clockSeconds, defaultTarget, holdAt, holdSeconds, pauseHold, secondsLeft, startHold, type HoldTimer as Timer } from '../../shared/timed';
import { MAX_KG } from '../../shared/logger';
import { buzz, keepAwake, letSleep } from './device';

export interface HoldTimerProps {
  repMin: number;
  repMax: number;
  stepKg: number;
  /** Called with the seconds and the added weight when the person logs the hold. */
  onLog: (seconds: number, weightKg: number) => void;
}

/** Live block for a timed exercise: a running clock (start, pause, resume, reset), seconds you can set by hand, and an optional countdown. */
export function HoldTimerBlock({ repMin, repMax, stepKg, onLog }: HoldTimerProps) {
  const [timer, setTimer] = useState<Timer>(IDLE_HOLD);
  const [now, setNow] = useState(() => Date.now());
  const [countdown, setCountdown] = useState(false);
  const [target, setTarget] = useState(() => defaultTarget(repMin, repMax));
  const [weightKg, setWeightKg] = useState(0);
  const buzzed = useRef(false);

  useEffect(() => {
    if (!timer.running) return;
    void keepAwake();
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => {
      clearInterval(id);
      void letSleep();
    };
  }, [timer.running]);

  const secs = holdSeconds(timer, now);
  const left = secondsLeft(timer, now, target);
  const finished = countdown && timer.running && left === 0;

  // Countdown reached zero: stop on the target, buzz once.
  useEffect(() => {
    if (!finished || buzzed.current) return;
    buzzed.current = true;
    buzz();
    setTimer(holdAt(target));
  }, [finished]);

  const shown = countdown ? (secs >= target && !timer.running ? 0 : left) : secs;
  const start = () => {
    buzzed.current = false;
    const at = Date.now();
    setNow(at);
    setTimer((cur) => (countdown && holdSeconds(cur, at) >= target ? startHold(IDLE_HOLD, at) : startHold(cur, at)));
  };
  const pause = () => {
    const at = Date.now();
    setNow(at);
    setTimer((cur) => pauseHold(cur, at));
  };
  const reset = () => {
    buzzed.current = false;
    setTimer(IDLE_HOLD);
  };
  const log = () => {
    const at = Date.now();
    const s = holdSeconds(pauseHold(timer, at), at);
    if (s <= 0) return;
    onLog(s, weightKg);
    reset();
  };

  return (
    <div class="sf-lg__entry sf-lg__hold" data-hook="hold-timer">
      <div class="sf-lg__clock" role="timer" aria-live="off" aria-label={t('lg.hold.clock')}>
        <span class="sf-lg__clock-n" data-hook="hold-clock">{clockSeconds(shown)}</span>
        <span class="sf-rt__meta">{countdown ? t('lg.hold.left') : t('lg.hold.sec')}</span>
      </div>
      <div class="sf-qgrid">
        {timer.running ? (
          <Button onPress={pause}>{t('lg.hold.pause')}</Button>
        ) : (
          <Button onPress={start}>{timer.bankedMs > 0 ? t('lg.hold.resume') : t('lg.hold.start')}</Button>
        )}
        <Button variant="secondary" onPress={reset} disabled={timer.bankedMs === 0 && !timer.running}>{t('lg.hold.reset')}</Button>
      </div>

      <div class="sf-lg__field">
        <span class="sf-rt__meta">{t('lg.hold.edit')}</span>
        <Stepper label={t('lg.hold.edit')} value={secs} step={5} min={0} max={MAX_HOLD_SECONDS} format={clockSeconds} onChange={(v) => setTimer(holdAt(v))} />
      </div>

      <div class="sf-rt__chips" role="group" aria-label={t('lg.hold.mode')}>
        <Chip selected={!countdown} onPress={() => setCountdown(false)}>{t('lg.hold.up')}</Chip>
        <Chip selected={countdown} onPress={() => setCountdown(true)}>{t('lg.hold.down')}</Chip>
      </div>
      {countdown && (
        <div class="sf-lg__field">
          <span class="sf-rt__meta">{t('lg.hold.target')}</span>
          <Stepper label={t('lg.hold.target')} value={target} step={5} min={5} max={MAX_HOLD_SECONDS} format={clockSeconds} onChange={setTarget} />
        </div>
      )}

      <div class="sf-lg__field">
        <span class="sf-rt__meta">{t('lg.hold.weight')}</span>
        <Stepper label={t('lg.hold.weight')} value={weightKg} step={stepKg} min={0} max={MAX_KG} format={(v) => (v === 0 ? t('lg.bw') : String(v))} onChange={setWeightKg} />
      </div>
      <Button icon="plus" onPress={log} disabled={secs === 0 && !timer.running}>{t('lg.hold.log')}</Button>
    </div>
  );
}
