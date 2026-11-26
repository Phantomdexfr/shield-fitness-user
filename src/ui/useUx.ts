// Phase 96: `useUx('<key>')` says which style a piece of UI should render: 'premium' or 'classic'.
// It starts from the root attribute that index.html / applyAppearance set (so there is no flash) and follows live changes.
import { useEffect, useState } from 'preact/hooks';
import { onUxChange } from '../data/repos/ux';
import { styleOf, type UxKey, type UxStyle } from '../shared/ux';

export function currentUx(key: UxKey): UxStyle {
  if (typeof document === 'undefined') return 'premium';
  return document.documentElement.getAttribute(`data-ux-${key}`) === 'classic' ? 'classic' : 'premium';
}

export function useUx(key: UxKey): UxStyle {
  const [style, setStyle] = useState<UxStyle>(() => currentUx(key));
  useEffect(() => {
    setStyle(currentUx(key));
    return onUxChange((s) => setStyle(styleOf(s[key])));
  }, [key]);
  return style;
}
