import { EmptyState } from '../ui/components';
import { t, type StringKey } from '../i18n';

/** Stand-in for screens built in later phases. Shows the slug/id when the route has one. */
export function Placeholder({ titleKey, param }: { titleKey: StringKey; param?: string }) {
  return (
    <section class="sf-page-body">
      <h1 class="sf-page-title">{t(titleKey)}</h1>
      {param && (
        <p class="sf-page-param">
          {t('page.slug.label')}: <code>{param}</code>
        </p>
      )}
      <EmptyState icon="info" title={t('page.soon.title')} hint={t('page.soon.hint')} />
    </section>
  );
}
