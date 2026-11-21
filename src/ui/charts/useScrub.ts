import { useEffect, useRef, useState } from 'preact/hooks';
import { nearestIndex } from '../../shared/chartMath';
import { tick } from '../components/haptics';

const HIDE_AFTER_MS = 1200;
const MIN_TICK_GAP_MS = 40;
const DEFAULT_WIDTH = 320;

/** Measured content width of an element (falls back to 320 where there is no layout, e.g. tests). */
export function useWidth<T extends Element>(): [{ current: T | null }, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      if (width > 0) setW(width);
    };
    read();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Pointer + keyboard scrub (CHART_KIT 7). `xs` = ascending pixel positions of the drawn points in svg units,
 * `width` = svg width in those units. A horizontal drag scrubs; a mostly vertical move hands the gesture back to the page.
 */
export function useScrub(xs: readonly number[], width: number) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<Element | null>(null);
  const st = useRef({ down: false, decided: false, cancelled: false, sx: 0, sy: 0, last: -1, lastTick: 0, timer: 0 });
  const count = xs.length;

  useEffect(() => () => clearTimeout(st.current.timer), []);

  const show = (i: number) => {
    if (i < 0) return;
    const s = st.current;
    if (i !== s.last) {
      s.last = i;
      const now = Date.now();
      if (now - s.lastTick >= MIN_TICK_GAP_MS) {
        s.lastTick = now;
        tick();
      }
    }
    setActive(i);
  };
  const hide = () => {
    clearTimeout(st.current.timer);
    st.current.last = -1;
    setActive(null);
  };
  const fromClient = (clientX: number) => {
    const el = svgRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    const rw = rect && rect.width > 0 ? rect.width : width;
    const left = rect ? rect.left : 0;
    return nearestIndex(xs, (clientX - left) * (width / rw));
  };

  const bind = {
    onPointerDown(e: PointerEvent) {
      const s = st.current;
      clearTimeout(s.timer);
      s.down = true;
      s.decided = false;
      s.cancelled = false;
      s.sx = e.clientX;
      s.sy = e.clientY;
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* not capturable: fine */
      }
      show(fromClient(e.clientX));
    },
    onPointerMove(e: PointerEvent) {
      const s = st.current;
      if (!s.down) {
        if (e.pointerType === 'mouse') show(fromClient(e.clientX));
        return;
      }
      if (s.cancelled) return;
      const dx = Math.abs(e.clientX - s.sx);
      const dy = Math.abs(e.clientY - s.sy);
      if (!s.decided) {
        if (dy > 10 && dx < 6) {
          s.cancelled = true;
          hide();
          return;
        }
        if (dx > 6) s.decided = true;
      }
      show(fromClient(e.clientX));
    },
    onPointerUp(e: PointerEvent) {
      const s = st.current;
      s.down = false;
      if (s.cancelled) return;
      if (e.pointerType === 'mouse') return;
      clearTimeout(s.timer);
      s.timer = window.setTimeout(hide, HIDE_AFTER_MS);
    },
    onPointerCancel() {
      st.current.down = false;
      hide();
    },
    onPointerLeave(e: PointerEvent) {
      if (e.pointerType === 'mouse' && !st.current.down) hide();
    },
    onBlur() {
      hide();
    },
    onKeyDown(e: KeyboardEvent) {
      if (count === 0) return;
      const cur = active ?? count - 1;
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = active === null ? count - 1 : Math.max(0, cur - 1);
      else if (e.key === 'ArrowRight') next = active === null ? count - 1 : Math.min(count - 1, cur + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      else if (e.key === 'Escape') {
        hide();
        return;
      } else return;
      e.preventDefault();
      show(next);
    },
  };
  return { active: active !== null && active < count ? active : null, bind, svgRef };
}
