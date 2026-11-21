import { useEffect, useState } from 'preact/hooks';
import { getConnection, type Connection } from './connection';

/** The stored gym connection for a screen: `undefined` while loading, `null` standalone. `reload` after an action. */
export function useConnection(): { conn: Connection | null | undefined; reload: () => void } {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    void getConnection().then((c) => live && setConn(c));
    return () => {
      live = false;
    };
  }, [n]);
  return { conn, reload: () => setN((x) => x + 1) };
}

/** hh:mm in Asia/Kolkata (build rule 7). */
export const istTime = (ms: number): string => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).format(ms);
