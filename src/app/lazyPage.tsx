import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';

/** Wraps a dynamic import as a page component (code-split; used by dev-only pages). */
export function lazyPage(load: () => Promise<{ default: ComponentType }>): ComponentType {
  return function LazyPage() {
    const [C, setC] = useState<ComponentType | null>(null);
    useEffect(() => {
      let live = true;
      load().then((m) => live && setC(() => m.default));
      return () => {
        live = false;
      };
    }, []);
    return C ? <C /> : <p role="status">{t('page.loading')}</p>;
  };
}
