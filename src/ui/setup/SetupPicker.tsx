import { t, type StringKey } from '../../i18n';
import { Button, Chip } from '../components';
import { chooseOnAxis, isDefaultSetup, offeredAxes, type SetupOffer } from '../../pages/exercise/setupModel';
import type { Setup } from '../../shared/setup';

export interface SetupPickerProps {
  /** What the exercise offers; axes it does not offer are not shown. */
  offer: SetupOffer | undefined;
  value: Setup;
  onChange: (next: Setup) => void;
  class?: string;
}

const nice = (raw: string): string => raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');

/** One compact chip row per offered axis. Nothing chosen = the exercise's default. Choosing a chosen chip clears it.
 *  Reused by the exercise page now, and by routine items, the set logger and swap suggestions in their phases. */
export function SetupPicker({ offer, value, onChange, class: cls }: SetupPickerProps) {
  const axes = offeredAxes(offer);
  if (axes.length === 0) return null;
  return (
    <div class={`sf-setup ${cls ?? ''}`.trim()}>
      {axes.map(({ axis, values }) => (
        <div key={axis} class="sf-setup__axis" role="group" aria-label={t(`setup.axis.${axis}` as StringKey)}>
          <span class="sf-setup__label">{t(`setup.axis.${axis}` as StringKey)}</span>
          <div class="sf-setup__chips">
            {values.map((v) => (
              <Chip key={v} selected={value[axis] === v} onPress={() => onChange(chooseOnAxis(value, axis, v))}>
                {nice(v)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {!isDefaultSetup(value) && (
        <Button variant="ghost" onPress={() => onChange({})}>
          {t('setup.reset')}
        </Button>
      )}
    </div>
  );
}
