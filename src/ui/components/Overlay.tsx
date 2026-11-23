import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Button, IconButton } from './Button';
import { LABELS } from './labels';
import { cx } from './util';

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
}

/** Bottom sheet: drag the grip down to dismiss, tap the backdrop, press Escape or use the close button. */
export function Sheet({ open, onClose, title, closeLabel = LABELS.close, children }: SheetProps) {
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
