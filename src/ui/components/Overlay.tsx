import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Button, IconButton } from './Button';
import { LABELS } from './labels';
import { dur, keyboardInset, prefersReducedMotion, rubberBand, sheetRelease, sheetVelocity, type SheetDetent } from './motion';
import { cx } from './util';
import { useUx } from '../useUx';

/** Overlays open at once (a date sheet inside another sheet): the scroll lock stays until the last one closes. */
let openCount = 0;

/** Escape closes, page scroll locks, focus moves in and is restored on close. */
function useOverlay(open: boolean, onClose: () => void, ref: RefObject<HTMLElement>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    openCount += 1;
    document.documentElement.classList.add('sf-scroll-lock');
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      openCount -= 1;
      if (openCount <= 0) {
        openCount = 0;
        document.documentElement.classList.remove('sf-scroll-lock');
      }
      previous?.focus?.();
    };
  }, [open]);
}

const DISMISS_DRAG_PX = 80;
/** A sheet opened by a tap (a 3D body, a map) gets the browser's follow-up click on its backdrop a moment later: ignore backdrop clicks for this long after opening. */
export const BACKDROP_GUARD_MS = 450;

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children?: ComponentChildren;
  /** Premium only: where the sheet rests when it opens. 'medium' (about half a screen) lets the person drag it up to large. Default 'large' (the classic height). */
  detent?: SheetDetent;
}

/** Bottom sheet. Premium (`ux.sheets`): finger-follow drag with velocity, detents, rubber-band, keyboard-aware. Classic: the old sheet, untouched. */
export function Sheet(props: SheetProps) {
  const ux = useUx('sheets');
  return ux === 'premium' ? <PremiumSheet {...props} /> : <ClassicSheet {...props} />;
}

/** Classic bottom sheet: drag the grip down to dismiss, tap the backdrop, press Escape or use the close button. */
function ClassicSheet({ open, onClose, title, closeLabel = LABELS.close, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const openedAt = useRef(0);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) openedAt.current = performance.now();
  wasOpen.current = open;
  useOverlay(open, onClose, ref);
  if (!open) return null;

  const down = (e: PointerEvent) => {
    start.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (start.current !== null) setDy(Math.max(0, e.clientY - start.current));
  };
  const end = () => {
    if (start.current === null) return;
    start.current = null;
    if (dy > DISMISS_DRAG_PX) onClose();
    setDy(0);
  };

  return (
    <div class="sf-overlay sf-overlay--sheet" onClick={(e) => e.target === e.currentTarget && performance.now() - openedAt.current > BACKDROP_GUARD_MS && onClose()}>
      <div
        ref={ref}
        class={cx('sf-sheet', dy > 0 && 'sf-sheet--dragging')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dy > 0 ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div
          class="sf-sheet__grip"
          aria-hidden="true"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span class="sf-sheet__handle" />
        </div>
        <div class="sf-sheet__head">
          <h2 class="sf-sheet__title" id={titleId}>
            {title}
          </h2>
          <IconButton icon="x" label={closeLabel} onPress={onClose} />
        </div>
        <div class="sf-sheet__body">{children}</div>
      </div>
    </div>
  );
}

/** Premium sheet (Phase 102): fading scrim, spring up, grab handle, the sheet follows the finger and lets go by distance or flick,
 *  medium and large stops, rubber-band when pulled past the top, lifted above the soft keyboard. Same markup and classes as classic. */
function PremiumSheet({ open, onClose, title, closeLabel = LABELS.close, children, detent: initial = 'large' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [dy, setDy] = useState(0);
  const [detent, setDetent] = useState<SheetDetent>(initial);
  const [leaving, setLeaving] = useState(false);
  const [kb, setKb] = useState(0);
  const drag = useRef<{ y0: number; raw: number; samples: Array<{ y: number; t: number }> } | null>(null);
  const openedAt = useRef(0);
  const wasOpen = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  if (open && !wasOpen.current) openedAt.current = performance.now();
  wasOpen.current = open;
  const canMedium = initial === 'medium';
  useOverlay(open, onClose, ref);

  useEffect(() => {
    if (!open) return;
    setDetent(initial);
    setDy(0);
    setLeaving(false);
  }, [open, initial]);

  // Soft keyboard: the visual viewport shrinks, the layout viewport (iOS) does not.
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setKb(keyboardInset(window.innerHeight, vv));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKb(0);
    };
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    const wait = dur('base');
    // The in-app Motion setting (data-motion) wins as well as the phone's: reduced = the sheet just goes.
    if (wait === 0 || prefersReducedMotion() || document.documentElement.getAttribute('data-motion') === 'reduced') {
      closeRef.current();
      return;
    }
    setLeaving(true);
    setDy(ref.current?.offsetHeight ?? 600);
    window.setTimeout(() => closeRef.current(), wait);
  };
  const down = (e: PointerEvent) => {
    if (leaving) return;
    drag.current = { y0: e.clientY, raw: 0, samples: [{ y: e.clientY, t: e.timeStamp }] };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    const raw = e.clientY - d.y0;
    d.raw = raw;
    // Pulled up past the top stop the sheet resists (rubber-band); pulled down it follows the finger one to one.
    setDy(raw >= 0 ? raw : -rubberBand(-raw));
  };
  const end = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const what = sheetRelease(d.raw, sheetVelocity(d.samples, e.timeStamp), detent, canMedium);
    if (what === 'dismiss') {
      dismiss();
      return;
    }
    if (what === 'medium' || what === 'large') setDetent(what);
    setDy(0);
  };

  const dragging = drag.current !== null;
  const progress = Math.min(1, Math.max(0, dy) / Math.max(1, ref.current?.offsetHeight ?? 600));
  return (
    <div
      class={cx('sf-overlay sf-overlay--sheet', leaving && 'sf-overlay--leaving')}
      style={{ '--sheet-kb': `${kb}px`, '--scrim-o': String(1 - progress * 0.9) } as never}
      onClick={(e) => e.target === e.currentTarget && performance.now() - openedAt.current > BACKDROP_GUARD_MS && dismiss()}
    >
      <div
        ref={ref}
        class={cx('sf-sheet', 'sf-sheet--premium', `sf-sheet--${detent}`, dragging && 'sf-sheet--dragging')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-detent={detent}
        style={dy !== 0 ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div
          class="sf-sheet__grip"
          aria-hidden="true"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span class="sf-sheet__handle" />
        </div>
        <div class="sf-sheet__head">
          <h2 class="sf-sheet__title" id={titleId}>
            {title}
          </h2>
          <IconButton icon="x" label={closeLabel} onPress={dismiss} />
        </div>
        <div class="sf-sheet__body">{children}</div>
      </div>
    </div>
  );
}

export interface DialogProps {
  open: boolean;
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirm (brick, never pink). */
  danger?: boolean;
  children?: ComponentChildren;
}

/** Centred confirm dialog: one clear primary action, one way out. */
export function Dialog({ open, title, message, onConfirm, onCancel, confirmLabel = LABELS.confirm, cancelLabel = LABELS.cancel, danger, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const msgId = useId();
  useOverlay(open, onCancel, ref);
  if (!open) return null;
  return (
    <div class="sf-overlay sf-overlay--dialog" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        class="sf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? msgId : undefined}
        tabIndex={-1}
      >
        <h2 class="sf-dialog__title" id={titleId}>
          {title}
        </h2>
        {message && (
          <p class="sf-dialog__message" id={msgId}>
            {message}
          </p>
        )}
        {children}
        <div class="sf-dialog__actions">
          <Button variant="secondary" onPress={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
