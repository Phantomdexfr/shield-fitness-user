// Phase 103 (ux.motion): the DOM side of page motion. The rules live in src/ui/components/motion.ts (pure, tested);
// this file reads the history counter, runs the back swipe and the shared-element View Transition. Classic never calls it.
import { useEffect } from 'preact/hooks';
import { SWIPE_EDGE_PX, motionAllowed, navDirection, swipeBackRelease, swipeBackStarts, type PageDir } from '../ui/components/motion';
import { currentUx } from '../ui/useUx';
import { navIndex } from './navBack';

const rootMotion = (): string | null => document.documentElement.getAttribute('data-motion');
/** Premium page motion is on and allowed right now. */
export const pageMotionOn = (): boolean => currentUx('motion') === 'premium' && motionAllowed(rootMotion());

let swipeJustWent = false;
let vtJustRan = false;

/** What the page that has just mounted should do. Reads (and clears) the one-shot flags set by the swipe and by a View Transition. */
export function consumePageDir(prevIdx: number, nextIdx: number): PageDir {
  if (swipeJustWent) {
    swipeJustWent = false;
    return 'swipe';
  }
  if (vtJustRan) {
    vtJustRan = false;
    return 'vt';
  }
  return navDirection(prevIdx, nextIdx);
}

type Vt = { finished: Promise<unknown> };
type VtDoc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => Vt };
export const viewTransitionsSupported = (): boolean => typeof (document as VtDoc).startViewTransition === 'function';

/** Not requestAnimationFrame: the page does not paint while a View Transition waits for its DOM update, so frames never come and the transition times out. */
const tick = () => new Promise<void>((r) => setTimeout(r, 16));
export const SHARED_NAME = 'sf-ex-title';

/** Open an exercise from a library row: the row's name grows into the page's big title. Returns false (do nothing, let the normal link run)
 *  when the browser has no View Transitions, motion is off, or this is a modified click. Where it returns true the navigation is done. */
export function sharedNavigate(row: HTMLElement | null, go: () => void): boolean {
  if (!row || !pageMotionOn() || !viewTransitionsSupported()) return false;
  const name = row.querySelector<HTMLElement>('.sf-lib__name');
  if (!name) return false;
  name.style.viewTransitionName = SHARED_NAME;
  vtJustRan = true;
  let tagged: HTMLElement | null = null;
  const vt = (document as VtDoc).startViewTransition!(async () => {
    go();
    // Wait (at most ~0.6 s) for the new page's big title; a slow chunk just means no shared element.
    for (let i = 0; i < 36; i += 1) {
      await tick();
      const h1 = document.querySelector<HTMLElement>('.sf-page h1');
      if (h1 && h1 !== name) {
        name.style.viewTransitionName = '';
        h1.style.viewTransitionName = SHARED_NAME;
        tagged = h1;
        return;
      }
    }
  });
  const clear = () => {
    name.style.viewTransitionName = '';
    if (tagged) tagged.style.viewTransitionName = '';
    vtJustRan = false;
  };
  void vt.finished.then(clear, clear);
  return true;
}

/** Swipe from the left edge to go back: the page follows the finger, a short pull springs back, a long pull or a flick goes back
 *  with one real `history.back()` (the browser's history stays the truth). Touch only. */
export function useSwipeBack(): void {
  useEffect(() => {
    let g: { id: number; x0: number; y0: number; t: number; vx: number; lastX: number; lastT: number; live: boolean; el: HTMLElement; w: number } | null = null;
    const page = () => document.querySelector<HTMLElement>('.sf-page');
    const reset = (el: HTMLElement, animate: boolean) => {
      el.style.transition = animate ? 'transform var(--dur-base) var(--ease-spring)' : '';
      el.style.transform = '';
      if (animate) window.setTimeout(() => { el.style.transition = ''; }, 260);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      if (!pageMotionOn() || document.documentElement.classList.contains('sf-scroll-lock')) return;
      if (!swipeBackStarts(e.clientX, navIndex() > 0)) return;
      const el = page();
      if (!el) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: e.timeStamp, vx: 0, lastX: e.clientX, lastT: e.timeStamp, live: false, el, w: window.innerWidth };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.live) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // a scroll, not a swipe
        if (dx > 8) g.live = true; else return;
      }
      const dt = e.timeStamp - g.lastT;
      // Speed only from samples a few ms apart (two events in the same instant say nothing about speed).
      if (dt >= 4) {
        g.vx = (e.clientX - g.lastX) / dt;
        g.lastX = e.clientX;
        g.lastT = e.timeStamp;
      }
      g.el.style.transition = 'none';
      g.el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      if (!s.live) return;
      const dx = e.clientX - s.x0;
      const fresh = e.timeStamp - s.lastT <= 100; // a pause before lifting is not a flick
      if (swipeBackRelease(dx, fresh ? s.vx : 0, s.w) === 'back') {
        swipeJustWent = true;
        history.back();
      } else reset(s.el, true);
    };
    const cancel = () => {
      if (g?.live) reset(g.el, true);
      g = null;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, []);
}

export { SWIPE_EDGE_PX };
