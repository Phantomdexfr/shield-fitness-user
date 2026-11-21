import { Link, Route, Router, Switch, useLocation, useRouter } from 'wouter-preact';
import { matchRoute } from 'wouter-preact';
import { useEffect } from 'preact/hooks';
import { Icon, ToastHost, cx } from '../ui/components';
import { NotFound } from '../pages/NotFound';
import { t } from '../i18n';
import { UpdateToast } from '../pwa/UpdateToast';
import { useFeature } from './flags';
import { TABS, activeRoutes, type RouteDef } from './routes';

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

function TabBar({ routes }: { routes: RouteDef[] }) {
  const active = useActiveTab(routes);
  return (
    <nav class="sf-tabbar" aria-label={t('tab.nav')}>
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.path} replace class={cx('sf-tabbar__item', active === tab.id && 'is-active')} aria-current={active === tab.id ? 'page' : undefined}>
          <Icon name={tab.icon} weight={active === tab.id ? 'fill' : 'regular'} size={24} />
          <span class="sf-tabbar__label">{t(tab.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

/** A switched-off feature behaves like a missing page. */
function Gate({ route, params }: { route: RouteDef; params: Record<string, string> }) {
  const on = useFeature(route.feature);
  const C = route.component;
  return on ? <C params={params} /> : <NotFound />;
}

function Pages({ routes }: { routes: RouteDef[] }) {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return (
    <div class="sf-page" key={location}>
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

export function Shell({ base, isDev }: { base: string; isDev: boolean }) {
  const routes = activeRoutes(isDev);
  return (
    <Router base={normaliseBase(base)}>
      <div class="sf-shell">
        <main class="sf-shell__main">
          <Pages routes={routes} />
        </main>
        <TabBar routes={routes} />
        <ToastHost />
        <UpdateToast />
      </div>
    </Router>
  );
}
