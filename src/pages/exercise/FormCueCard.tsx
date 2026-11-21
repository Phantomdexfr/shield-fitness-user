import { t } from '../../i18n';
import { Button } from '../../ui/components';
import type { CueCard } from './exerciseModel';

export interface FormCueCardProps {
  card: CueCard;
  onDismiss: () => void;
}

/** Form cue card (feature `form_cues`): up to 3 cues and 1 common mistake, swipeable (scroll-snap), dismissible forever.
 *  The set logger mounts this same component before the first set of a new exercise. */
export function FormCueCard({ card, onDismiss }: FormCueCardProps) {
  if (card.slides.length === 0) return null;
  let cueN = 0;
  return (
    <section class="sf-cue" aria-label={t('ex.cue.title')}>
      <h2 class="sf-ex__h">{t('ex.cue.title')}</h2>
      <ul class="sf-cue__track" tabIndex={0} role="group" aria-label={t('ex.cue.region')}>
        {card.slides.map((s, i) => {
          if (s.kind === 'cue') cueN += 1;
          return (
            <li key={i} class={`sf-cue__slide${s.kind === 'mistake' ? ' sf-cue__slide--mistake' : ''}`}>
              <span class="sf-cue__label">{s.kind === 'cue' ? t('ex.cue.cue', { n: cueN }) : t('ex.cue.mistake')}</span>
              <span class="sf-cue__text">{s.text}</span>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" onPress={onDismiss}>
        {t('ex.cue.dismiss')}
      </Button>
    </section>
  );
}
