import { useEffect, useState } from 'preact/hooks';
import { readPref, onPrefChange, writePref } from './repos/prefs';
import { defaultOf, type PrefValue } from '../shared/settings';

/** Read a setting and a setter. Starts at the default, loads the stored value, follows later changes. */
export function usePref<T extends PrefValue>(key: string): [T, (next: T) => Promise<void>, boolean] {
  const [value, setValue] = useState<PrefValue>(defaultOf(key));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void readPref(key).then((v) => {
      if (!alive) return;
      setValue(v);
      setReady(true);
    });
    const off = onPrefChange((k, v) => {
      if (k === key) setValue(v);
    });
    return () => {
      alive = false;
      off();
    };
  }, [key]);
  const set = async (next: T) => {
    await writePref(key, next);
  };
  return [value as T, set, ready];
}
