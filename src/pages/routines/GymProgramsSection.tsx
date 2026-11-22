import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Badge, Button, Card } from '../../ui/components';
import { istTime, programActions, usePrograms } from '../../data/repos/gymLink';
import { followedId, type GymProgram } from '../../shared/gymPrograms';

/** Routines -> "From your gym" (docs/GYM_CONNECTION.md section 9). Hidden when standalone or `gym_programs` is off. */
export function GymProgramsSection({ onChanged }: { onChanged: () => void }) {
  const on = useFeature('gym_programs');
  const [, navigate] = useLocation();
  const { view, signedIn } = usePrograms();
  const [note, setNote] = useState('');
  if (!on || signedIn === null) return null;
  if (!signedIn && !view?.cards.length) {
    return (
      <section class="sf-rt__gym" aria-label={t('gp.h')}>
        <h2 class="sf-rt__name">{t('gp.h')}</h2>
        <p class="sf-rt__meta">{t('gp.signin')}</p>
        <Button variant="secondary" onPress={() => navigate('/settings/gym/signin')}>{t('gd.signin.go')}</Button>
      </section>
    );
  }
  if (!view) return null;
  const run = (fn: () => Promise<unknown>, msg = '') => void fn().then(() => { setNote(msg); onChanged(); }, () => undefined);
  const meta = (p: GymProgram) => (p.weeks ? t('gp.meta.weeks', { days: p.daysPerWeek, weeks: p.weeks }) : t('gp.meta', { days: p.daysPerWeek }));
  return (
    <section class="sf-rt__gym" aria-label={t('gp.h')}>
      <h2 class="sf-rt__name">{t('gp.h')}</h2>
      {view.fetchedAt !== null && <p class="sf-rt__meta">{t('gp.updated', { time: istTime(view.fetchedAt) })}</p>}
      {note && <p class="sf-rt__meta" role="status">{note}</p>}
      {view.cards.length === 0 && view.ended.length === 0 && <p class="sf-rt__meta">{t('gp.none')}</p>}
      <ul class="sf-rt__list">
        {view.cards.map(({ program: p, followed }) => (
          <li key={p.slug} class="sf-rt__item">
            <Card class="sf-rt__card">
              <span class="sf-rt__name">{p.name}</span>
              <span class="sf-rt__meta">{meta(p)}</span>
              {p.goal && <span class="sf-rt__meta">{p.goal}</span>}
              <Badge tone="gold">{p.assigned ? t('gp.badge.assigned') : t('gp.badge.published')}</Badge>
              {followed && <Badge icon="check">{t('gp.following')}</Badge>}
              {followed ? (
                <>
                  <Button variant="secondary" onPress={() => navigate(`/routine/${followedId(p.slug)}`)}>{t('gp.open')}</Button>
                  <Button variant="secondary" onPress={() => run(() => programActions.unfollow(p.slug))}>{t('gp.unfollow')}</Button>
                </>
              ) : (
                <Button onPress={() => run(() => programActions.follow(p.slug))}>{t('gp.follow')}</Button>
              )}
              <Button variant="secondary" onPress={() => run(() => programActions.copy(p.slug), t('gp.copied'))}>{t('gp.copy')}</Button>
              {!followed && <Button variant="secondary" onPress={() => run(() => programActions.ignore(p.slug, true))}>{t('gp.ignore')}</Button>}
            </Card>
          </li>
        ))}
      </ul>
      {view.ended.length > 0 && (
        <>
          <h3 class="sf-rt__name">{t('gp.ended')}</h3>
          <ul class="sf-rt__list">
            {view.ended.map((p) => (
              <li key={p.slug} class="sf-rt__item">
                <Card class="sf-rt__card">
                  <span class="sf-rt__name">{p.name}</span>
                  <Button variant="secondary" onPress={() => run(() => programActions.keepCopy(p.slug), t('gp.copied'))}>{t('gp.ended.keep')}</Button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {view.ignored.length > 0 && (
        <>
          <h3 class="sf-rt__name">{t('gp.ignored', { n: view.ignored.length })}</h3>
          <ul class="sf-rt__list">
            {view.ignored.map((p) => (
              <li key={p.slug} class="sf-rt__item">
                <Card class="sf-rt__card">
                  <span class="sf-rt__name">{p.name}</span>
                  <Button variant="secondary" onPress={() => run(() => programActions.ignore(p.slug, false))}>{t('gp.unignore')}</Button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
