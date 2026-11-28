// Phase 116: the guided walkthrough overlay. Mounted once in the Shell. It dims the screen, cuts a bright hole around ONE real element
// (found by its `data-tour` attribute) and shows a small tip card above or below it. The rules (steps, who sees it, what comes next) are in
// src/shared/tour.ts; this file only reads the real screen. Never a gate: Next, Back and Skip tour on every card, Escape = Skip tour,
// "Skip this step" on a required step, and a step whose target never shows is skipped silently after about 1.5 s.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button } from './Button';
import { beginRun, getRun, onRun, setRun, type TourRun } from '../../app/tourStore';
import { loadTour, markExisting, onboardingFinishedAtBoot, onboardingFinishedNow, saveTour } from '../../data/repos/tour';
import {
  TOUR_STEPS, WAIT_MS, afterMissing, finishedRecord, launchDecision, navTarget, nextStep, padRect, placeCard, prevStep, progressOf,
  routeMatches, runningRecord, skipAtOnce, skippedRecord, stepById, type Insets, type Placement, type Rect,
} from '../../shared/tour';

const PAD = 6;
const CARD_MAX_W = 340;
/** Used for the first placement, before the real card has been measured. */
const CARD_H_EST = 230;

interface View {
  /** The spotlight (padded). null = a centred card with no target. */
  rect: Rect | null;
  place: Placement | null;
}

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function readInsets(probe: HTMLElement | null): Insets {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(probe);
  return { top: num(cs.paddingTop), right: num(cs.paddingRight), bottom: num(cs.paddingBottom), left: num(cs.paddingLeft) };
}

/** Is a sheet, dialog or calendar open? The tour steps aside (hidden) until it closes, so it never sits on top of what the person is doing. */
const overlayOpen = (): boolean => document.querySelector('.sf-overlay') !== null;

async function persistStep(id: string): Promise<void> {
  await saveTour(runningRecord(await loadTour(), id, false));
}

async function endTour(how: 'finished' | 'skipped'): Promise<void> {
  setRun(null);
  const rec = await loadTour();
  await saveTour(how === 'finished' ? finishedRecord(rec) : skippedRecord(rec));
}

export function Tour() {
  const [location, navigate] = useLocation();
  const [run, setRunState] = useState<TourRun | null>(getRun());
  const [view, setView] = useState<View | null>(null);
  const locRef = useRef(location);
  locRef.current = location;
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const cardRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const missed = useRef(new Set<string>());
  const decided = useRef(false);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => onRun(setRunState), []);

  // 1. Launch: a new install starts after onboarding, an existing install is marked "never auto", a closed tour resumes.
  useEffect(() => {
    if (run || decided.current) return;
    let live = true;
    let timer = 0;
    const check = async () => {
      const [rec, boot, now] = await Promise.all([loadTour(), onboardingFinishedAtBoot(), onboardingFinishedNow()]);
      if (!live || getRun()) return;
      const d = launchDecision({ rec, onboardingFinishedAtBoot: boot, onboardingFinishedNow: now, path: locRef.current, running: false });
      if (d === 'mark-existing') {
        decided.current = true;
        await markExisting();
      } else if (d === 'start') {
        decided.current = true;
        missed.current.clear();
        await beginRun(TOUR_STEPS[0]!.id, true);
      } else if (d === 'resume' && rec?.stepId) {
        decided.current = true;
        missed.current.clear();
        await beginRun(rec.stepId, false);
      } else if (rec?.done) {
        decided.current = true;
      } else if (!now && live) {
        // Onboarding is still running: look again shortly (also on the next page change).
        timer = window.setTimeout(() => void check(), 1500);
      }
    };
    void check();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [location, run === null]);

  const stepId = run?.stepId ?? null;

  // 2. One step: go to its page, wait for the target, spotlight it, follow it while it moves, skip the step if it never shows.
  useEffect(() => {
    if (!stepId) {
      setView(null);
      return;
    }
    const step = stepById(stepId);
    if (!step) {
      void endTour('finished');
      return;
    }
    const s = step;
    let live = true;
    let raf = 0;
    let t0 = performance.now();
    let routeSeen = false;
    let navigated = false;
    let scrolled = false;
    let lastKey = '';
    let tapEl: HTMLElement | null = null;
    /** The real element was tapped: its action is running, the tour moves on in a moment. Until then the loop must not react to the page change. */
    let tapped = false;

    const move = (to: ReturnType<typeof nextStep>, dir: 1 | -1, viaTap = false) => {
      if (!to) {
        void endTour('finished');
        return;
      }
      // Going Back over a step that was skipped for a missing target skips it again at once (no second wait).
      if (dir === 1) missed.current.delete(to.id);
      setRun({ stepId: to.id, dir, ...(viaTap ? { viaTap: true } : {}) });
      void persistStep(to.id);
    };
    const onTap = () => {
      if (s.tapAdvances === false) return;
      tapped = true;
      // The real action runs first (the capture listener is only noted); then the tour moves on.
      window.setTimeout(() => live && getRun()?.stepId === s.id && move(nextStep(s.id), 1, true), 0);
    };
    const detach = () => {
      tapEl?.removeEventListener('click', onTap, true);
      tapEl = null;
    };
    const miss = () => {
      detach();
      missed.current.add(s.id);
      const dir = getRun()?.dir ?? 1;
      const to = afterMissing(s.id, dir);
      if (!to && dir === -1) move(TOUR_STEPS[0]!, 1);
      else move(to, dir);
    };
    /** About 1.5 s; longer only right after a real tap that opens a page (the session screen). */
    const waitFor = () => (getRun()?.viaTap ? (s.waitMs ?? WAIT_MS) : WAIT_MS);
    const hide = () => setView((v) => (v === null ? v : null));

    const tick = () => {
      if (!live) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (tapped) return;
      if (overlayOpen()) {
        t0 = now;
        detach();
        hide();
        return;
      }
      if (skipAtOnce(s, missed.current) || (getRun()?.dir === -1 && missed.current.has(s.id))) {
        miss();
        return;
      }
      const routeOk = routeMatches(s.route, locRef.current);
      if (!routeOk) {
        // Go to the step's page once. If the person leaves a page the step already showed on, never drag them back: the step is just skipped.
        const nt = navTarget(s);
        if (nt && !navigated && !routeSeen) {
          navigated = true;
          navRef.current(nt);
        }
        hide();
        if (now - t0 > waitFor() + (nt ? 1500 : 0)) miss();
        return;
      }
      if (!routeSeen) {
        routeSeen = true;
        t0 = now;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const inset = readInsets(probeRef.current);
      const cw = cardRef.current?.offsetWidth ?? Math.min(CARD_MAX_W, vw - inset.left - inset.right - 32);
      const ch = cardRef.current?.offsetHeight ?? CARD_H_EST;

      if (!s.target) {
        const place = placeCard({ rect: null, vw, vh, card: { w: cw, h: ch }, inset });
        const key = `c${Math.round(place.left)},${Math.round(place.top)}`;
        if (key !== lastKey) {
          lastKey = key;
          setView({ rect: null, place });
        }
        return;
      }

      const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
      const r = el?.getBoundingClientRect();
      if (!el || !r || r.width === 0 || r.height === 0) {
        detach();
        hide();
        lastKey = '';
        if (now - t0 > waitFor()) miss();
        return;
      }
      t0 = now;
      if (tapEl !== el) {
        detach();
        tapEl = el;
        el.addEventListener('click', onTap, true);
      }

      let pad = padRect({ top: r.top, left: r.left, width: r.width, height: r.height }, PAD);
      let place = placeCard({ rect: pad, vw, vh, card: { w: cw, h: ch }, inset, pref: s.placement });
      if (!scrolled) {
        scrolled = true;
        // Bring the target (and room for the card beside it) into view once, above the fixed tab bar.
        const tab = document.querySelector('.sf-tabbar')?.getBoundingClientRect();
        const inTab = tab && r.top >= tab.top - 1;
        const usableTop = inset.top + 8;
        const usableBottom = (tab && !inTab ? tab.top : vh - inset.bottom) - 8;
        const cardTop = place.top;
        const overlaps = cardTop < pad.top + pad.height && cardTop + ch > pad.top;
        const offscreen = pad.top < usableTop || pad.top + pad.height > usableBottom;
        if (!inTab && (offscreen || overlaps)) {
          const needed = pad.height + 12 + ch;
          const avail = usableBottom - usableTop;
          const blockTop = needed <= avail ? usableTop + (avail - needed) / 2 : usableTop;
          const wanted = s.placement === 'above' && needed <= avail ? blockTop + ch + 12 : blockTop;
          window.scrollBy({ top: pad.top - wanted, behavior: 'auto' });
          return; // read the new position on the next frame
        }
      }
      pad = { top: Math.round(pad.top), left: Math.round(pad.left), width: Math.round(pad.width), height: Math.round(pad.height) };
      place = placeCard({ rect: pad, vw, vh, card: { w: cw, h: ch }, inset, pref: s.placement });
      const key = `${pad.top},${pad.left},${pad.width},${pad.height},${Math.round(place.top)},${Math.round(place.left)},${place.side}`;
      if (key !== lastKey) {
        lastKey = key;
        setView({ rect: pad, place });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      detach();
    };
  }, [stepId]);

  const shown = run !== null && view !== null;

  // 3. Keyboard: Escape = Skip tour; Tab stays inside the card while it is open.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        void endTour('skipped');
      } else if (e.key === 'Tab' && cardRef.current) {
        const items = [...cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shown]);

  // 4. Focus: into the card when it shows, back to where it was when the tour ends.
  useEffect(() => {
    if (shown && cardRef.current) {
      if (!prevFocus.current) prevFocus.current = document.activeElement as HTMLElement | null;
      cardRef.current.focus({ preventScroll: true });
    }
  }, [shown, stepId]);
  useEffect(() => {
    if (run === null && prevFocus.current) {
      const el = prevFocus.current;
      prevFocus.current = null;
      if (el.isConnected) el.focus({ preventScroll: true });
    }
  }, [run === null]);

  if (!run) return null;
  const probe = <div ref={probeRef} class="sf-tour__probe" aria-hidden="true" />;
  const step = stepById(run.stepId);
  if (!view || !step) return <div class="sf-tour">{probe}</div>;
  const { n, total } = progressOf(step.id);
  const first = prevStep(step.id) === null;
  const next = nextStep(step.id);
  const go = (to: ReturnType<typeof nextStep>, dir: 1 | -1) => {
    if (!to) {
      void endTour('finished');
      return;
    }
    if (dir === 1) missed.current.delete(to.id);
    setRun({ stepId: to.id, dir });
    void persistStep(to.id);
  };
  const vw = typeof window === 'undefined' ? 360 : window.innerWidth;
  const r = view.rect;
  const px = (v: number) => `${Math.max(0, v)}px`;
  const cardStyle = view.place
    ? { top: `${view.place.top}px`, left: `${view.place.left}px`, width: `${Math.min(CARD_MAX_W, vw - 32)}px` }
    : { top: '0px', left: '0px', width: `${Math.min(CARD_MAX_W, vw - 32)}px`, visibility: 'hidden' as const };
  return (
    <div class="sf-tour">
      {probe}
      <div class="sf-tour__dim" aria-hidden="true">
      {r ? (
        <>
          <div class="sf-tour__panel" style={{ top: 0, left: 0, right: 0, height: px(r.top) }} />
          <div class="sf-tour__panel" style={{ top: px(r.top + r.height), left: 0, right: 0, bottom: 0 }} />
          <div class="sf-tour__panel" style={{ top: px(r.top), left: 0, width: px(r.left), height: px(r.height) }} />
          <div class="sf-tour__panel" style={{ top: px(r.top), left: px(r.left + r.width), right: 0, height: px(r.height) }} />
          <div class="sf-tour__spot" style={{ top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` }} />
          {step.tapAdvances === false && <div class="sf-tour__panel" style={{ top: px(r.top), left: px(r.left), width: px(r.width), height: px(r.height) }} />}
        </>
      ) : (
        <div class="sf-tour__full" />
      )}
      </div>
      <div ref={cardRef} class="sf-tour__card" role="dialog" aria-labelledby="sf-tour-title" aria-describedby="sf-tour-body" tabIndex={-1} style={cardStyle}>
        <p class="sf-tour__count">{t('tour.progress', { n, total })}</p>
        <h2 class="sf-tour__title" id="sf-tour-title">{t(step.titleKey)}</h2>
        <p class="sf-tour__body" id="sf-tour-body">{t(step.bodyKey)}</p>
        <div class="sf-tour__row">
          {!first && <Button variant="secondary" onPress={() => go(prevStep(step.id), -1)}>{t('tour.back')}</Button>}
          {step.required ? (
            <Button variant="secondary" onPress={() => go(next, 1)}>{t('tour.skipStep')}</Button>
          ) : (
            <Button onPress={() => go(next, 1)}>{next ? t('tour.next') : t('tour.done')}</Button>
          )}
        </div>
        <div class="sf-tour__row">
          <Button variant="secondary" onPress={() => void endTour('skipped')}>{t('tour.skipTour')}</Button>
        </div>
      </div>
    </div>
  );
}
