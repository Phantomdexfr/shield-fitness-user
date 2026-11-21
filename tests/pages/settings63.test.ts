import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { MORE_GROUPS } from '../../src/shared/settings';
import { ROUTES } from '../../src/app/routes';
import { en } from '../../src/i18n/en';
import aboutJson from '../../src/content/about.json';
import creditsJson from '../../src/content/credits.json';
import { REQUIRED_THIRD_PARTY, aboutIsEmpty, aboutSchema, creditsSchema, parseAbout, parseCredits } from '../../src/shared/content';
import { WIPE_WORD, backupFileName, formatBytes, isWipeConfirm } from '../../src/shared/dataTools';
import { DEFAULT_REMINDERS, nextReminderAt, parseReminders } from '../../src/shared/reminders';
import { istWeekday } from '../../src/shared/dates';
import { readReminders, writeReminders } from '../../src/data/repos/reminders';
import { makeBackup, restoreBackup, wipeAllData } from '../../src/data/repos/dataTools';
import { prefsRepo, resetDb } from '../../src/data/local';

beforeEach(async () => {
  await resetDb();
});

describe('phase 63 registry', () => {
  it('the six new pages are routes and have names and summaries', () => {
    const paths = new Set(ROUTES.map((r) => r.path));
    expect(MORE_GROUPS.map((g) => g.slug)).toEqual(['data', 'privacy', 'reminders', 'gym', 'about', 'credits']);
    for (const g of MORE_GROUPS) {
      expect(paths.has(`/settings/${g.slug}`), g.slug).toBe(true);
      expect(`st.g.${g.slug}` in en).toBe(true);
      expect(`st.s.${g.slug}` in en).toBe(true);
    }
  });
});

describe('content schema', () => {
  it('the shipped about.json and credits.json pass their schemas', () => {
    expect(aboutSchema.safeParse(aboutJson).success).toBe(true);
    expect(creditsSchema.safeParse(creditsJson).success).toBe(true);
  });
  it('an empty about is the placeholder state; a filled one is not', () => {
    expect(aboutIsEmpty(parseAbout({ tagline: '', description: [], contact: '', links: [] }))).toBe(true);
    expect(aboutIsEmpty(parseAbout(aboutJson))).toBe(false);
    expect(aboutIsEmpty(parseAbout({ tagline: 'Train.', description: [], contact: '', links: [] }))).toBe(false);
  });
  it('a damaged about file reads as empty, not a crash', () => {
    expect(parseAbout({ tagline: 5 })).toEqual({ tagline: '', description: [], contact: '', links: [] });
    expect(parseAbout(null).links).toEqual([]);
  });
  it('a link without a real address is refused', () => {
    expect(aboutSchema.safeParse({ tagline: '', description: [], contact: '', links: [{ label: 'x', url: 'nope' }] }).success).toBe(false);
  });
});

describe('credits cannot render empty', () => {
  it('shipped credits list every required licence', () => {
    const names = parseCredits(creditsJson).thirdParty.map((c) => c.name);
    for (const r of REQUIRED_THIRD_PARTY) expect(names, r.name).toContain(r.name);
  });
  it('an empty or damaged third-party list falls back to the required licences, keeping the owner lines', () => {
    expect(parseCredits({ ownerCredits: [], thirdParty: [] }).thirdParty.length).toBe(REQUIRED_THIRD_PARTY.length);
    expect(parseCredits(undefined).thirdParty.length).toBe(REQUIRED_THIRD_PARTY.length);
    const c = parseCredits({ ownerCredits: ['Coach Ravi'], thirdParty: 'x' });
    expect(c.ownerCredits).toEqual(['Coach Ravi']);
    expect(c.thirdParty.length).toBe(REQUIRED_THIRD_PARTY.length);
  });
  it('every entry has a licence and a web address', () => {
    for (const c of parseCredits(creditsJson).thirdParty) {
      expect(c.licence.length).toBeGreaterThan(0);
      expect(c.url.startsWith('https://')).toBe(true);
    }
  });
});

describe('licence list matches the prototype headers', () => {
  const holo = readFileSync('reference/prototypes/holo_body_3d.html', 'utf8');
  const lab = readFileSync('reference/prototypes/muscle_lab_2d.html', 'utf8');
  const byName = (n: string) => parseCredits(creditsJson).thirdParty.find((c) => c.name === n)!;
  it('BodyParts3D: CC BY 4.0 and the same licence address', () => {
    expect(holo).toContain('CC Attribution 4.0');
    expect(holo).toContain(byName('BodyParts3D').url);
    expect(byName('BodyParts3D').licence).toBe('CC BY 4.0');
  });
  it('human-atlas: MIT, 2026, ashemag, same address', () => {
    expect(holo).toContain('human-atlas, MIT License, Copyright (c) 2026 ashemag');
    expect(holo).toContain(byName('human-atlas').url);
    expect(byName('human-atlas').licence).toBe('MIT');
  });
  it('hologram shader idea: MIT, 2023, Anderson Mancini, same address', () => {
    const c = byName('threejs-vanilla-holographic-material');
    expect(holo).toContain('threejs-vanilla-holographic-material, MIT License, Copyright (c) 2023 Anderson Mancini');
    expect(holo).toContain(c.url);
    expect(c.licence).toBe('MIT');
  });
  it('three.js MIT (prototype names r147; package.json pins 0.147.0)', () => {
    expect(holo).toContain('Three.js r147, MIT');
    expect(byName('three.js').licence).toBe('MIT');
  });
  it('MuscleMap: MIT, Jsplice', () => {
    expect(lab).toContain('MuscleMap by Jsplice (MIT');
    expect(byName('MuscleMap').licence).toBe('MIT');
  });
  it('Phosphor and the two fonts are present with licences; the font licence files exist', () => {
    expect(byName('Phosphor Icons').licence).toBe('MIT');
    expect(byName('Inter').licence).toBe('SIL OFL 1.1');
    expect(byName('Barlow Condensed').licence).toBe('SIL OFL 1.1');
    expect(readFileSync('src/ui/fonts/LICENSE-Inter-OFL.txt', 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(readFileSync('src/ui/fonts/LICENSE-BarlowCondensed-OFL.txt', 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});

describe('data tools', () => {
  it('wipe needs the exact word; file name uses the IST day', () => {
    expect(isWipeConfirm(WIPE_WORD)).toBe(true);
    expect(isWipeConfirm(`  ${WIPE_WORD} `)).toBe(true);
    expect(isWipeConfirm('delete')).toBe(false);
    expect(isWipeConfirm('')).toBe(false);
    expect(backupFileName(Date.UTC(2026, 10, 20, 20, 0))).toBe('shield-fitness-backup-2026-11-21.json');
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('backup then wipe then restore brings a row back', async () => {
    await prefsRepo.put({ client_id: 'settings:account.name', value: 'Asha' } as never);
    const { name, text } = await makeBackup(Date.UTC(2026, 10, 20));
    expect(name).toBe('shield-fitness-backup-2026-11-20.json');
    expect(JSON.parse(text).photos).toBeUndefined();
    await wipeAllData();
    expect(await prefsRepo.get('settings:account.name')).toBeUndefined();
    const r = await restoreBackup(text);
    expect(r.added).toBeGreaterThan(0);
    expect((await prefsRepo.get('settings:account.name'))?.value).toBe('Asha');
  });
  it('a bad file is refused and changes nothing', async () => {
    await expect(restoreBackup('not json')).rejects.toThrow();
    await expect(restoreBackup(JSON.stringify({ app: 'other' }))).rejects.toThrow();
  });
});

describe('reminders', () => {
  it('a stored choice that is wrong reads as valid', () => {
    expect(parseReminders(undefined)).toEqual(DEFAULT_REMINDERS);
    expect(parseReminders({ on: 'yes', days: [9, 2, 2, 'x', 0], time: '25:00' })).toEqual({ on: false, days: [0, 2], time: '18:00' });
  });
  it('next reminder is the next chosen day after now, in IST; none when off or no days', () => {
    // 2026-11-20 is a Friday (4). 10:00 IST = 04:30 UTC.
    const fri10 = Date.UTC(2026, 10, 20, 4, 30);
    expect(istWeekday(fri10)).toBe(4);
    const p = { on: true, days: [4], time: '18:00' };
    expect(nextReminderAt(p, fri10)).toBe(Date.UTC(2026, 10, 20, 12, 30)); // today 18:00 IST
    const after = Date.UTC(2026, 10, 20, 13, 0); // 18:30 IST, today's time has passed
    expect(nextReminderAt(p, after)).toBe(Date.UTC(2026, 10, 27, 12, 30)); // next Friday
    expect(nextReminderAt({ ...p, on: false }, fri10)).toBeNull();
    expect(nextReminderAt({ ...p, days: [] }, fri10)).toBeNull();
  });
  it('saved choice round-trips through the device store', async () => {
    expect(await readReminders()).toEqual(DEFAULT_REMINDERS);
    await writeReminders({ on: true, days: [1, 3], time: '06:30' });
    expect(await readReminders()).toEqual({ on: true, days: [1, 3], time: '06:30' });
  });
});
