// Phase 101: one reusable wheel (ux.wheels, Premium only; Classic keeps the Stepper). Scroll-snap does the feel; the middle line is gold
// between two thin gold lines. The scroller is the control: role=spinbutton, arrow keys / PageUp / PageDown / Home / End work without a finger.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { WHEEL_ITEM_PX, WHEEL_ROWS, indexAtScroll, nearestIndex, scrollForIndex, stepIndex, wheelValues } from '../../shared/wheel';
import { tick } from './haptics';
import { cx } from './util';

export interface WheelPickerProps {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Text for a value, e.g. (v) => `${v} kg`. */
  format?: (v: number) => string;
  /** Accessible name. */
  label: string;
  class?: string;
}

export function WheelPicker({ value, onChange, min, max, step = 1, format = String, label, class: cls }: WheelPickerProps) {
  const values = useMemo(() => wheelValues(min, max, step), [min, max, step]);
  const idx = Math.max(0, nearestIndex(values, value));
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(idx);
  const fromScroll = useRef(false);

  // Put the list where the value is: on mount and whenever the value changes from outside (keyboard, tap, a new range).
  // A change that came from the finger's own scroll must not move the list again (it would fight the momentum).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    const target = scrollForIndex(idx);
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    last.current = idx;
  }, [idx, values.length]);

  if (values.length === 0) return null;

  const pick = (i: number) => {
    const v = values[i];
    if (v !== undefined) onChange(v);
  };

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = indexAtScroll(el.scrollTop, values.length);
    if (i === last.current) return;
    last.current = i;
    fromScroll.current = true;
    tick();
    pick(i);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, PageUp: -5, PageDown: 5 };
    let next: number | null = null;
    if (e.key in moves) next = stepIndex(idx, moves[e.key] as number, values.length);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = values.length - 1;
    if (next === null) return;
    e.preventDefault();
    if (next !== idx) {
      tick();
      pick(next);
    }
  };

  return (
    <div class={cx('sf-wheel', cls)} style={{ '--wheel-item': `${WHEEL_ITEM_PX}px`, '--wheel-rows': String(WHEEL_ROWS) } as never}>
      <div
        ref={ref}
        class="sf-wheel__list"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={values[0]}
        aria-valuemax={values[values.length - 1]}
        aria-valuenow={values[idx]}
        aria-valuetext={format(values[idx] as number)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {values.map((v, i) => (
          <div
            key={v}
            class={cx('sf-wheel__item', i === idx && 'sf-wheel__item--on')}
            aria-hidden="true"
            onClick={() => {
              const el = ref.current;
              if (el) el.scrollTop = scrollForIndex(i);
              if (i !== idx) pick(i);
            }}
          >
            {format(v)}
          </div>
        ))}
      </div>
      <div class="sf-wheel__band" aria-hidden="true" />
    </div>
  );
}
