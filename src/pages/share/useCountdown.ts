import { useEffect, useState } from 'preact/hooks';

/** Seconds left until `endMs` (0 when null or past), ticking once a second. */
export function useCountdown(endMs: number | null): number {
  const calc = () => (endMs === null ? 0 : Math.max(0, Math.ceil((endMs - Date.now()) / 1000)));
  const [s, setS] = useState(calc);
  useEffect(() => {
    setS(calc());
    if (endMs === null) return;
    const id = setInterval(() => setS(calc()), 1000);
    return () => clearInterval(id);
  }, [endMs]);
  return s;
}

export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
