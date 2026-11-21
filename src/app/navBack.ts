// Back that behaves (owner fix after Phase 64). The on-screen Back arrow used to `navigate(<fixed page>)`, which ADDS a history
// entry, so the phone's Back gesture then returned to the page just left: an endless ping-pong. Now every in-app push is counted
// in `history.state.sfIdx`; Back = a real history step when there is an in-app entry behind, else a replace to the fallback page.

type Nav = (to: string, opts?: { replace?: boolean }) => void;

const stateOf = (s: unknown): Record<string, unknown> => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {});

/** How many in-app pages sit behind the current one (0 = none: first page of this visit). */
export function navIndex(): number {
  const v = stateOf(history.state).sfIdx;
  return typeof v === 'number' && v > 0 ? v : 0;
}

let installed = false;

/** Wrap pushState/replaceState once so every navigation (wouter included) keeps the counter. */
export function installNavIndex(): void {
  if (installed) return;
  installed = true;
  const push = history.pushState.bind(history);
  const rep = history.replaceState.bind(history);
  history.pushState = (s, t, u) => push({ ...stateOf(s), sfIdx: navIndex() + 1 }, t, u);
  history.replaceState = (s, t, u) => rep({ ...stateOf(s), sfIdx: navIndex() }, t, u);
}

/** The Back arrow: one real step back when possible, otherwise go to `fallback` without adding an entry. */
export function goBack(navigate: Nav, fallback: string): void {
  if (navIndex() > 0) history.back();
  else navigate(fallback, { replace: true });
}
