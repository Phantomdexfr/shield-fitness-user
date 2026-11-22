// About and Credits content (Phase 63). The owner edits src/content/about.json and credits.json later; this file reads them
// safely. Pure: no DOM, no store. A bad or empty file never breaks the page: the screen falls back to a placeholder.
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);

export const aboutSchema = z.object({
  tagline: text(120),
  /** The maker's name, shown bold under "Made by". Added in Phase 89; older files without it still parse. */
  author: text(80).default(''),
  description: z.array(text(600).min(1)).max(12),
  contact: text(160),
  links: z.array(z.object({ label: text(60).min(1), url: z.string().trim().url().max(300) })).max(8),
});
export type AboutContent = z.infer<typeof aboutSchema>;

export const thirdPartySchema = z.object({
  name: text(80).min(1),
  licence: text(40).min(1),
  url: z.string().trim().url().max(300),
  note: text(400),
});
export type ThirdParty = z.infer<typeof thirdPartySchema>;

export const creditsSchema = z.object({
  ownerCredits: z.array(text(200).min(1)).max(40),
  thirdParty: z.array(thirdPartySchema).min(1).max(80),
});
export type CreditsContent = z.infer<typeof creditsSchema>;

/** The licences the app cannot ship without. Used when credits.json is damaged or has no third-party list, so Credits is never empty. */
export const REQUIRED_THIRD_PARTY: readonly ThirdParty[] = [
  { name: 'BodyParts3D', licence: 'CC BY 4.0', url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html', note: '© The Database Center for Life Science.' },
  { name: 'human-atlas', licence: 'MIT', url: 'https://github.com/ashemag/human-atlas', note: 'Copyright (c) 2026 ashemag.' },
  { name: 'MuscleMap', licence: 'MIT', url: 'https://github.com/Jsplice/MuscleMap', note: '© 2026 Jsplice / MuscleMap contributors.' },
  { name: 'three.js', licence: 'MIT', url: 'https://threejs.org', note: '' },
  { name: 'threejs-vanilla-holographic-material', licence: 'MIT', url: 'https://github.com/ektogamat/threejs-vanilla-holographic-material', note: 'Copyright (c) 2023 Anderson Mancini.' },
  { name: 'Phosphor Icons', licence: 'MIT', url: 'https://phosphoricons.com', note: '' },
  { name: 'Inter', licence: 'SIL OFL 1.1', url: 'https://rsms.me/inter/', note: '' },
  { name: 'Barlow Condensed', licence: 'SIL OFL 1.1', url: 'https://github.com/jpt/barlow', note: '' },
];

export const EMPTY_ABOUT: AboutContent = { tagline: '', author: '', description: [], contact: '', links: [] };

export function parseAbout(raw: unknown): AboutContent {
  const r = aboutSchema.safeParse(raw);
  return r.success ? r.data : EMPTY_ABOUT;
}

/** Always returns at least the required licences: a damaged file loses the owner's lines, never the legal ones. */
export function parseCredits(raw: unknown): CreditsContent {
  const r = creditsSchema.safeParse(raw);
  if (r.success) return r.data;
  const own = z.object({ ownerCredits: z.array(text(200).min(1)).max(40) }).safeParse(raw);
  return { ownerCredits: own.success ? own.data.ownerCredits : [], thirdParty: [...REQUIRED_THIRD_PARTY] };
}

/** True when the owner has written nothing yet: the page then shows the "owner to fill" state. */
export const aboutIsEmpty = (a: AboutContent): boolean => a.tagline === '' && a.author === '' && a.description.length === 0 && a.links.length === 0 && a.contact === '';
