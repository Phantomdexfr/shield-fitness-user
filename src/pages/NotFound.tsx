import { useLocation } from 'wouter-preact';
import { EmptyState } from '../ui/components';
import { t } from '../i18n';

export function NotFound() {
  const [, navigate] = useLocation();
  return (
    <section class="sf-page-body" data-not-found="">
      <h1 class="sf-page-title">{t('page.notfound.title')}</h1>
      <EmptyState icon="warning" title={t('page.notfound.title')} hint={t('page.notfound.hint')} actionLabel={t('page.notfound.action')} onAction={() => navigate('/')} />
    </section>
  );
}
