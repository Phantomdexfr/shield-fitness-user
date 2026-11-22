// Phase 82: which body figure a page draws. It follows the profile (`getProfile().sex`: 'f' = female; 'm', 'unspecified' and never-asked = male).
// The "Switch figure" link changes only this page's view, never the profile. Used by every page that mounts a BodyPicker.
import { useEffect, useState } from 'preact/hooks';
import { getProfile } from '../../data/repos/badges';
import type { Sex } from './figures';

/** Pure rule: only a profile sex of `f` draws the female figure. */
export const figureFromProfile = (sex: 'm' | 'f' | 'unspecified' | null | undefined): Sex => (sex === 'f' ? 'female' : 'male');

/** The opposite figure (what "Switch figure" selects). */
export const otherFigure = (sex: Sex): Sex => (sex === 'male' ? 'female' : 'male');

let last: Sex = 'male'; // the figure the last page resolved, so the next page starts on it without a flash

/** `[figure, setFigure]` like `useState`: the profile's figure, until the person taps "Switch figure" on this page. */
export function useFigureSex(): [Sex, (s: Sex) => void] {
  const [fromProfile, setFromProfile] = useState<Sex>(last);
  const [picked, setPicked] = useState<Sex | null>(null);
  useEffect(() => {
    let live = true;
    getProfile().then(
      (p) => {
        last = figureFromProfile(p.sex);
        if (live) setFromProfile(last);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return [picked ?? fromProfile, setPicked];
}
