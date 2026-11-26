import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useUx } from '../useUx';
import { IconButton } from './Button';
import { LABELS } from './labels';

export interface SubPageHeaderProps {
  title: string;
  onBack: (e: Event) => void;
  backLabel?: string;
  /** Optional trailing action (an IconButton). */
  right?: ComponentChildren;
}

/** Phase 99: true once the page has scrolled past the large title (about 40 px). Passive listener, state only flips on change. */
export function useTitleCollapsed(threshold = 40): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const on = () => setCollapsed(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return collapsed;
}

/** Premium (ux.headers): a sticky bar (back + small title that fades in on scroll) above a large title that scrolls away with the page, so nothing shifts. The small title is drawn by CSS from data-title, so the text exists once in the DOM. */
function PremiumHeader({ title, onBack, backLabel = LABELS.back, right }: SubPageHeaderProps) {
  const collapsed = useTitleCollapsed();
  return (
    <header class={collapsed ? 'sf-subheader sf-subheader--large is-collapsed' : 'sf-subheader sf-subheader--large'}>
      <div class="sf-subheader__bar">
        <IconButton icon="caret-left" label={backLabel} onPress={onBack} />
        <span class="sf-subheader__small" data-title={title} aria-hidden="true" />
        {right && <div class="sf-subheader__right">{right}</div>}
      </div>
      <h1 class="sf-subheader__title">{title}</h1>
    </header>
  );
}

/** Tidy layout (ux.tidy): one line, back button then the title (wraps), optional trailing action. Same structure under Classic and Premium headers. */
function TidyHeader({ title, onBack, backLabel = LABELS.back, right }: SubPageHeaderProps) {
  return (
    <header class="sf-subheader sf-subheader--tidy">
      <IconButton icon="caret-left" label={backLabel} onPress={onBack} />
      <h1 class="sf-subheader__title">{title}</h1>
      {right && <div class="sf-subheader__right">{right}</div>}
    </header>
  );
}

/** Back + title for settings sub-pages (a list of groups, each its own page). The title wraps. Classic = fixed small title; Premium = large title that collapses. */
export function SubPageHeader(props: SubPageHeaderProps) {
  const ux = useUx('headers');
  const tidy = useUx('tidy') === 'premium';
  // Phase 113 (ux.tidy): back button and title on ONE line, title starting right after the button (CSS in premium/tidy.css).
  if (tidy) return <TidyHeader {...props} />;
  if (ux === 'premium') return <PremiumHeader {...props} />;
  const { title, onBack, backLabel = LABELS.back, right } = props;
  return (
    <header class="sf-subheader">
      <IconButton icon="caret-left" label={backLabel} onPress={onBack} />
      <h1 class="sf-subheader__title">{title}</h1>
      {right && <div class="sf-subheader__right">{right}</div>}
    </header>
  );
}
