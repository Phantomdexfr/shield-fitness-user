// Phase 98: the icon at the start of a Me / Settings / Gym row. ux.icons OFF: the classic bare icon, same markup as before.
// ON: the correctly matched Phosphor icon inside a 32 px tinted rounded tile.
import { premiumIconFor } from '../icons/premiumMap';
import { useUx } from '../useUx';
import { Icon, type IconName } from './Icon';

export function PageIcon({ id, classic }: { id: string; classic: IconName }) {
  const premium = useUx('icons') === 'premium';
  return (
    <span class={premium ? 'sf-st__icon sf-tile' : 'sf-st__icon'} aria-hidden="true">
      <Icon name={premium ? premiumIconFor(id, classic) : classic} size={premium ? 20 : 24} />
    </span>
  );
}
