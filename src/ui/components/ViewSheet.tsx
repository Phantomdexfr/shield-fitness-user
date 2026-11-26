// Phase 105: the per-page "View" entry (docs/UI_PREMIUM_PLAN.md 3.2). A small button under the page title opens a sheet with the
// switches that matter on THAT page (Layout, Look). Same switches as Settings -> Appearance -> Interface style: they apply at once.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { t, type StringKey } from '../../i18n';
import { setUxSwitch } from '../../data/repos/ux';
import type { UxKey } from '../../shared/ux';
import { useUx } from '../useUx';
import { Button } from './Button';
import { Row, Switch } from './Rows';
import { Sheet } from './Overlay';

/** Which switches a page offers. Layout first, then Look. */
export const VIEW_KEYS: readonly UxKey[] = ['layout', 'surfaces'];

function ViewRow({ k }: { k: UxKey }) {
  const on = useUx(k) === 'premium';
  const label = t(`ux.sw.${k}` as StringKey);
  return (
    <Row label={label} hint={t(`ux.sw.${k}.hint` as StringKey)} trailing={<Switch checked={on} label={label} onChange={(next) => void setUxSwitch(k, next)} />} />
  );
}

/** Phase 106: `children` = page-specific choices (for example Body's Figure first / List first), shown above the shared switches. */
export function ViewSheet({ keys = VIEW_KEYS, children }: { keys?: readonly UxKey[]; children?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="sf-view">
      <Button variant="secondary" icon="dots-three-vertical" aria-label={t('ux.view')} onPress={() => setOpen(true)}>
        {t('ux.view')}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('ux.view.title')}>
        <div class="sf-view__body">
          {children}
          {keys.length > 0 && (
            <div class="sf-rowgroup">
              <div class="sf-rowgroup__box">
                {keys.map((k) => (
                  <ViewRow key={k} k={k} />
                ))}
              </div>
            </div>
          )}
          <p class="sf-view__note">{t('ux.view.note')}</p>
        </div>
      </Sheet>
    </div>
  );
}
