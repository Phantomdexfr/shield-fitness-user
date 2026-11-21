import type { ComponentChildren } from 'preact';
import { IconButton } from './Button';
import { LABELS } from './labels';

export interface SubPageHeaderProps {
  title: string;
  onBack: (e: Event) => void;
  backLabel?: string;
  /** Optional trailing action (an IconButton). */
  right?: ComponentChildren;
}

/** Back + title for settings sub-pages (a list of groups, each its own page). The title wraps. */
export function SubPageHeader({ title, onBack, backLabel = LABELS.back, right }: SubPageHeaderProps) {
  return (
    <header class="sf-subheader">
      <IconButton icon="caret-left" label={backLabel} onPress={onBack} />
      <h1 class="sf-subheader__title">{title}</h1>
      {right && <div class="sf-subheader__right">{right}</div>}
    </header>
  );
}
