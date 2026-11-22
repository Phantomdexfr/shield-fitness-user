// Phase 83: the shared collapsible section (docs/UX_REDESIGN_PLAN.md section 2). A 48 px bar (title left, short summary right, chevron),
// a real <button> with aria-expanded. Open or closed is remembered per page (`<page>:<id>`); `defaultOpen` is used until the person chooses.
// A page with 4 or more sections shows <CollapseAll /> at the top.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { loadSections, saveSections } from '../../data/repos/uiSections';
import { Icon } from './Icon';
import { cx } from './util';

const chosen = new Map<string, boolean>(); // what the person set (key -> open)
const registry = new Map<string, Map<string, boolean>>(); // page -> section id -> default open
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

const notify = () => listeners.forEach((fn) => fn());
const volatile = new Set<string>(); // keys that are never stored (a section tied to one live workout)
const persist = () => void saveSections(Object.fromEntries([...chosen].filter(([k]) => !volatile.has(k))));
/** Page key: the first path segment (`/exercise/bench-press` -> `exercise`, `/` -> `home`), unless the page passes its own. */
export const pageKeyOf = (path: string): string => path.split('?')[0]!.split('/').filter(Boolean)[0] ?? 'home';

function ensureLoaded() {
  loading ??= loadSections().then((m) => {
    for (const [k, v] of Object.entries(m)) if (!chosen.has(k)) chosen.set(k, v);
    notify();
  });
}

function useStore(): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((n) => n + 1);
    listeners.add(fn);
    ensureLoaded();
    return () => {
      listeners.delete(fn);
    };
  }, []);
}

const isOpen = (page: string, id: string, def: boolean): boolean => chosen.get(`${page}:${id}`) ?? def;

/** Test seam: forget everything in memory (the stored row is untouched). */
export function resetSectionsForTest(): void {
  chosen.clear();
  volatile.clear();
  registry.clear();
  loading = null;
}

export interface CollapsibleProps {
  /** Stable id within the page. */
  id: string;
  title: string;
  /** Short text on the right ("6 exercises"). */
  summary?: string;
  /** Open until the person chooses. Default closed; the first, most important block of a page is not a Collapsible at all or passes true. */
  defaultOpen?: boolean;
  /** Override the page key (default: from the route). */
  page?: string;
  /** false = the choice lives only until the app closes (Phase 86: the exercises of one live workout). Default true. */
  remember?: boolean;
  class?: string;
  children?: ComponentChildren;
}

export function Collapsible({ id, title, summary, defaultOpen = false, page, remember = true, class: cls, children }: CollapsibleProps) {
  const [loc] = useLocation();
  const pg = page ?? pageKeyOf(loc);
  useStore();
  useEffect(() => {
    let m = registry.get(pg);
    if (!m) registry.set(pg, (m = new Map()));
    m.set(id, defaultOpen);
    notify();
    return () => {
      registry.get(pg)?.delete(id);
      notify();
    };
  }, [pg, id, defaultOpen]);
  const open = isOpen(pg, id, defaultOpen);
  const toggle = () => {
    if (!remember) volatile.add(`${pg}:${id}`);
    chosen.set(`${pg}:${id}`, !open);
    persist();
    notify();
  };
  const bodyId = `sf-sec-${pg}-${id}`;
  return (
    <section class={cx('sf-sec', open && 'sf-sec--open', cls)}>
      <h2 class="sf-sec__h">
        <button type="button" class="sf-sec__bar" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span class="sf-sec__title">{title}</span>
          {summary && <span class="sf-sec__summary">{summary}</span>}
          <Icon name="caret-right" size={20} class="sf-sec__chev" />
        </button>
      </h2>
      {open && (
        <div class="sf-sec__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}

/** "Collapse all" / "Expand all" for the sections of this page. Shows only when the page has 4 or more. */
export function CollapseAll({ page }: { page?: string }) {
  const [loc] = useLocation();
  const pg = page ?? pageKeyOf(loc);
  useStore();
  const sections = registry.get(pg);
  if (!sections || sections.size < 4) return null;
  const anyOpen = [...sections].some(([id, def]) => isOpen(pg, id, def));
  const run = () => {
    for (const id of sections.keys()) chosen.set(`${pg}:${id}`, !anyOpen);
    if (pg.startsWith('session-')) for (const id of sections.keys()) volatile.add(`${pg}:${id}`);
    persist();
    notify();
  };
  return (
    <button type="button" class="sf-sec__all" onClick={run}>
      {t(anyOpen ? 'ui.collapseAll' : 'ui.expandAll')}
    </button>
  );
}
