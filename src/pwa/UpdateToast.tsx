import { useEffect, useState } from 'preact/hooks';
import { Button } from '../ui/components';
import { t } from '../i18n';
import { updateStore } from './update';

/** "Update ready - Reload". Shown only when a new service worker is waiting. */
export function UpdateToast() {
  const [ready, setReady] = useState(updateStore.isReady());
  useEffect(() => updateStore.subscribe(() => setReady(updateStore.isReady())), []);
  if (!ready) return null;
  return (
    <div class="sf-update" role="status">
      <p class="sf-update__text">{t('update.ready')}</p>
      <Button variant="primary" onPress={() => updateStore.apply()}>
        {t('update.reload')}
      </Button>
    </div>
  );
}
