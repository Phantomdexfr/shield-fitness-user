// Avoid / sore marks repo (Phase 48). One row per muscle in the `marks` store (client_id `mk:<muscle>`), local and synced
// like other rows. The rules live in `src/shared/avoid.ts`.

import { marksRepo } from '../local';
import { markClientId, parseMarks, type MarkKind, type MuscleMark } from '../../shared/avoid';

/** Every mark, one per muscle. */
export async function loadMarks(): Promise<MuscleMark[]> {
  return parseMarks((await marksRepo.list()) as unknown as { muscle?: unknown; kind?: unknown }[]);
}

/** Marks a muscle `avoid` or `sore`, or clears it. Returns the new list. */
export async function setMuscleMark(muscle: string, kind: MarkKind | 'clear'): Promise<MuscleMark[]> {
  // Older rows for the same muscle (any client_id) are cleared too, so one muscle never shows two marks.
  const rows = (await marksRepo.list()) as unknown as { client_id: string; muscle?: unknown }[];
  for (const r of rows) if (r.muscle === muscle && r.client_id !== markClientId(muscle)) await marksRepo.remove(r.client_id);
  if (kind === 'clear') await marksRepo.remove(markClientId(muscle));
  else await marksRepo.put({ client_id: markClientId(muscle), muscle, kind });
  return loadMarks();
}
