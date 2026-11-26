import { Link, Route, Router, Switch, useLocation, useRouter } from 'wouter-preact';
import { matchRoute } from 'wouter-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, ToastHost, cx } from '../ui/components';
import { useTitleCollapsed } from '../ui/components/SubPageHeader';
import type { PageDir } from '../ui/components/motion';
import { useUx } from '../ui/useUx';
import { NotFound } from '../pages/NotFound';
import { t } from '../i18n';
import { UpdateToast } from '../pwa/UpdateToast';
import { redirectExempt } from '../shared/onboarding';
import { useFeature } from './flags';
import { TABS, activeRoutes, type RouteDef } from './routes';
import { navIndex } from './navBack';
import { consumePageDir, useSwipeBack } from './pageMotion';

/** wouter wants a base without a trailing slash; Vite's BASE_URL has one. */
export function normaliseBase(base: string): string {
  const b = base.replace(/\/+$/, '');
  return b === '/' ? '' : b;
}

function useActiveTab(routes: RouteDef[]) {
  const [location] = useLocation();
  const router = useRouter();
  for (const r of routes) {
    const [ok] = matchRoute(router.parser, r.path, location);
    if (ok) return r.tab;
  }
  return undefined;
}

export function TabBar({ routes }: { routes: RouteDef[] }) {
  const active = useActiveTab(routes);
  const ux = useUx('tabbar');
  const index = TABS.findIndex((tab) => tab.id === active);
  return (
    <nav class="sf-tabbar" aria-label={t('tab.nav')}>
      {/* Premium (ux.tabbar): a gold indicator that slides to the active tab. Classic renders no indicator. */}
      {ux === 'premium' && index >= 0 && <span class="sf-tabbar__ind" aria-hidden="true" style={`--tab-i:${index};--tab-n:${TABS.length}`} />}
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.path} replace class={cx('sf-tabbar__item', active === tab.id && 'is-active')} aria-current={active === tab.id ? 'page' : undefined}>
          <Icon name={tab.icon} weight={active === tab.id ? 'fill' : 'regular'} size={24} />
          <span class="sf-tabbar__label">{t(tab.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Premium (ux.headers): top-level pages keep their large title (a plain h1); once it scrolls away a small frosted bar shows it. Sub-pages with SubPageHeader own their sticky bar, so this one stays off there. Out of flow: no layout shift. */
export function CollapsedTitleBar() {
  const ux = useUx('headers');
  const [location] = useLocation();
  const collapsed = useTitleCollapsed();
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!collapsed) return;
    const own = document.querySelector('.sf-page .sf-subheader') !== null;
    setTitle(own ? '' : (document.querySelector('.sf-page h1')?.textContent ?? ''));
  }, [collapsed, location]);
  if (ux !== 'premium' || location === '/welcome') return null;
  return <div class={collapsed && title ? 'sf-collapsebar is-on' : 'sf-collapsebar'} data-title={title} aria-hidden="true" />;
}

/** A switched-off feature behaves like a missing page. */
function Gate({ route, params }: { route: RouteDef; params: Record<string, string> }) {
  const on = useFeature(route.feature);
  const C = route.component;
  return on ? <C params={params} /> : <NotFound />;
}

/** Phase 85: a fresh install opens /welcome once (an older install is marked done silently). Deep links that open on purpose are left alone. */
function useFirstRun() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (redirectExempt(location)) return;
    let live = true;
    void import('../data/repos/onboarding')
      .then((m) => m.decideOnboarding(Date.now()))
      .then((d) => {
        if (live && d === 'run') navigate('/welcome', { replace: true });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Decided once per visit to the app, not on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Pages({ routes }: { routes: RouteDef[] }) {
  const [location] = useLocation();
  useFirstRun();
  const motion = useUx('motion');
  useSwipeBack();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  // Premium (ux.motion): how this page arrived (push / pop / none / swipe / vt), read from the in-app history counter once per location.
  const seen = useRef({ loc: location, idx: navIndex(), dir: 'none' as PageDir });
  if (seen.current.loc !== location) {
    seen.current = { loc: location, idx: navIndex(), dir: consumePageDir(seen.current.idx, navIndex()) };
  }
  return (
    <div class="sf-page" key={location} data-dir={motion === 'premium' ? seen.current.dir : undefined}>
      <Switch>
        {routes.map((r) => (
          <Route key={r.id} path={r.path}>
            {(params: Record<string, string>) => <Gate route={r} params={params} />}
          </Route>
        ))}
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </div>
  );
}

/** The welcome flow is full screen: no tab bar there. */
function TabBarUnlessWelcome({ routes }: { routes: RouteDef[] }) {
  const [location] = useLocation();
  return location === '/welcome' ? null : <TabBar routes={routes} />;
}

export function Shell({ base, isDev }: { base: string; isDev: boolean }) {
  const routes = activeRoutes(isDev);
  return (
    <Router base={normaliseBase(base)}>
      <div class="sf-shell">
        <main class="sf-shell__main">
          <Pages routes={routes} />
        </main>
        <CollapsedTitleBar />
        <TabBarUnlessWelcome routes={routes} />
        <ToastHost />
        <UpdateToast />
      </div>
    </Router>
  );
}
