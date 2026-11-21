import { useEffect, useState } from 'preact/hooks';
import { IconButton } from './Button';
import { LABELS } from './labels';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
export interface ToastOptions {
  tone?: ToastTone;
  /** 0 = stays until dismissed. Default 3500. */
  durationMs?: number;
}

const MAX_VISIBLE = 3;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((fn) => fn());

/** Module-level store so any code can raise a toast; <ToastHost /> renders it. */
export const toastStore = {
  get: (): readonly ToastItem[] => items,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  push(message: string, opts: ToastOptions = {}): number {
    const id = nextId++;
    items = [...items, { id, message, tone: opts.tone ?? 'neutral' }].slice(-MAX_VISIBLE);
    const ms = opts.durationMs ?? 3500;
    if (ms > 0) timers.set(id, setTimeout(() => toastStore.dismiss(id), ms));
    emit();
    return id;
  },
  dismiss(id: number): void {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    items = items.filter((i) => i.id !== id);
    emit();
  },
  clear(): void {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    items = [];
    emit();
  },
};

export const showToast = (message: string, opts?: ToastOptions) => toastStore.push(message, opts);

/** Mount once in the shell. */
export function ToastHost({ dismissLabel = LABELS.dismiss }: { dismissLabel?: string }) {
  const [list, setList] = useState<readonly ToastItem[]>(toastStore.get());
  useEffect(() => {
    setList(toastStore.get());
    return toastStore.subscribe(() => setList(toastStore.get()));
  }, []);
  return (
    <div class="sf-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`sf-toast sf-toast--${t.tone}`}>
          <p class="sf-toast__msg">{t.message}</p>
          <IconButton icon="x" label={dismissLabel} onPress={() => toastStore.dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
