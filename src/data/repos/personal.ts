// Personal exercise state repo (Phase 26): favourite, hidden, note. One row per exercise in the `favourites` store
// (client_id `ex:<slug>`), local and synced like other rows. Pure rules live in `src/shared/personal.ts`.

import { favouritesRepo } from '../local';
import { applyPersonal, clientIdFor, cleanNote, EMPTY_PERSONAL, isEmptyPersonal, parsePersonal, type Personal, type PersonalChange } from '../../shared/personal';

/** Every exercise with something set, by slug. */
export async function loadPersonal(): Promise<Map<string, Personal>> {
  return parsePersonal(await favouritesRepo.list());
}

export async function getPersonal(slug: string): Promise<Personal> {
  return (await loadPersonal()).get(slug) ?? { ...EMPTY_PERSONAL };
}

async function change(slug: string, c: PersonalChange): Promise<Personal> {
  const prev = (await loadPersonal()).get(slug);
  const next = applyPersonal(prev, c);
  const id = clientIdFor(slug);
  if (isEmptyPersonal(next)) {
    await favouritesRepo.remove(id);
    return { ...EMPTY_PERSONAL };
  }
  await favouritesRepo.put({ client_id: id, slug, favourite: next.favourite, hidden: next.hidden, note: next.note });
  return next;
}

export const setFavourite = (slug: string, on: boolean): Promise<Personal> => change(slug, { favourite: on });
export const setHidden = (slug: string, on: boolean): Promise<Personal> => change(slug, { hidden: on });

/** Save a note; an empty note clears it. Returns an error code (never saves) when the note is too long. */
export async function setNote(slug: string, text: string): Promise<{ ok: true; personal: Personal } | { ok: false; error: 'too_long' }> {
  const r = cleanNote(text);
  if (!r.ok) return r;
  return { ok: true, personal: await change(slug, { note: r.value }) };
}
