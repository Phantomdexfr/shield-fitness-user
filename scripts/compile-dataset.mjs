// Dataset compiler (Phase 9). Spec: docs/DATASET_RUNTIME.md. Run: npm run dataset
// contract/dataset/**/*.csv -> src/dataset/generated/*.json. Build-time only, no network.
// Idempotent: no clock, no random, fixed ordering. Any validation error exits non-zero and writes nothing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Counts the dataset guide promises (docs/DATASET_RUNTIME.md section 10). */
export const GUIDE_COUNTS = {
  exercises: 634, machines: 55, muscles: 34, mapped: 592, fallback: 42, mapRows: 2749,
  variations: 4752, shiftRows: 312, mediaFiles: 128, substitutionRows: 199, supersetRows: 38,
  // Phase 8 authored files (Phase 10 compiler)
  setupRules: 322, setupShiftRows: 157, companionRows: 96, aliasRows: 621,
};

const TRACK_BITS = { beginner: 1, intermediate: 2, muscle_gain: 4, athlete: 8, fat_loss: 16, strength: 32, cardio: 64 };
const ROLE = { primary: 'p', secondary: 's', stabiliser: 't', mobility: 'm' };
const EMPH = { high: 'h', medium: 'm', low: 'l' };
const SHIFT = { more: 'm', less: 'l' };
const CHUNK_SIZE = 60;

/** engines.md section 13 vocabulary. */
const AXES = {
  grip: ['pronated', 'supinated', 'neutral', 'mixed', 'hammer', 'reverse'],
  width: ['wide', 'shoulder', 'narrow'],
  handle: ['straight_bar', 'ez_bar', 'curved_lat_bar', 'rope', 'v_handle', 'd_handle', 'mag_handle', 'strap', 'stirrup', 'bare_handles'],
  position: ['seated', 'standing', 'kneeling', 'half_kneeling', 'lying', 'incline', 'decline', 'leaning', 'chest_supported'],
  arms: ['both', 'single', 'alternating'],
  bench: ['none', 'flat', 'incline', 'decline', 'utility', 'preacher', 'stability_ball'],
};
/** Pattern-from-name table (DATASET_GUIDE "setup_muscle_shift.csv"): [pattern, name words, cancelling words]; first match wins. */
const PATTERNS = [
  ['reverse_fly', ['reverse fly', 'reverse flye', 'reverse pec deck', 'reverse butterfly', 'rear delt fly', 'rear delt flye', 'rear delt raise', 'rear fly', 'bent over fly'], []],
  ['pulldown', ['pulldown', 'pull down', 'pull up', 'chin up', 'lat pull'], ['straight arm', 'scapular']],
  ['pushdown', ['pushdown', 'push down', 'pressdown', 'press down', 'triceps extension', 'skull crusher'], ['leg', 'back', 'hip']],
  ['curl', ['curl'], ['leg', 'hamstring', 'wrist', 'nordic', 'knee', 'crunch', 'forearm', 'roll']],
  ['raise', ['raise'], ['calf', 'leg', 'knee', 'hip', 'heel', 'toe', 'tibialis', 'rear', 'hanging', 'pelvic', 'y raise', 'w raise']],
  ['fly', ['fly', 'flye', 'crossover', 'pec deck', 'butterfly'], ['reverse', 'rear']],
  ['row', ['row', 'face pull'], ['upright', 'rowing']],
  ['press', ['press', 'push up'], ['leg press', 'calf', 'pallof', 'squeeze', 'jm press', 'sled', 'wall press', 'press up']],
];
const PATTERN_NAMES = [...PATTERNS.map((p) => p[0]), 'any'];
const ALIAS_KINDS = ['abbreviation', 'muscle', 'exercise', 'machine', 'setup', 'spelling'];
/** Rows that mention a grip or handle in any wording; used only to measure how many carry at least one setup tag (Phase 10 verify: >= 90%; width-only rows such as "Wide grip" count as tagged). */
const BROAD_GRIP_HANDLE = /\b(grips?|handles?|hammer|supinated|pronated|neutral|underhand|overhand|palms?|rope|stirrups?|straps?|(ez|straight|lat|v|t|curved|cambered) bar)\b/;
/** Grip and aid words Phase 8 left out of the vocabulary on purpose (DATASET_GUIDE): hook, snatch, clean and front-squat grips, lifting straps. Listed in the review file, not counted in the 90% check. */
const OUT_OF_VOCAB = /\b(hook grip|snatch grip|clean grip|front squat grip|straps?)\b/;
const normText = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Whole-word phrase match; a trailing "s" on the last word is ignored. `text` and `phrase` are already normalised. */
const hasPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `) || ` ${text} `.includes(` ${phrase}s `);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const VARIATION_FILES = [
  'exercise_variations.csv',
  'new_exercises/added_variations_for_existing_exercises.csv',
  'new_exercises/new_exercise_variations.csv',
  'new_exercises/cable_new_exercise_variations.csv',
  'new_exercises/progression_variations.csv',
  'new_exercises/variations_gap_fill_all_machines.csv',
];

/** Gzip budgets in bytes (section 8). */
const BUDGET_GZ = {
  'exercises.index': 120_000, muscles: 8_000, machines: 10_000, media: 8_000, muscle_map: 20_000,
  variation_shift: 8_000, substitutions: 8_000, supersets: 3_000, 'dataset.manifest': 2_000,
};
const BUDGET_OTHER_GZ = { setup_options: 30_000, movement: 20_000, machine_reach: 20_000, 'search.index': 250_000, badges: 20_000 };
const BUDGET_PRECACHED_GZ = 60_000;
const BUDGET_CHUNK_GZ = 12_000;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const split = (s) => (s ?? '').split(';').map((x) => x.trim()).filter(Boolean);
const sha8 = (data) => createHash('sha256').update(data).digest('hex').slice(0, 8);
const toInt = (s) => (s === '' || s == null ? null : Math.round(Number(s)));

function readCsv(dir, rel, errors, requiredCols = []) {
  const path = join(dir, rel);
  if (!existsSync(path)) {
    errors.push(`${rel}: file not found`);
    return [];
  }
  // Some source files mix CRLF and LF; papaparse guesses one, so normalise first.
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, newline: '\n' });
  for (const e of parsed.errors) errors.push(`${rel}: row ${e.row ?? '?'}: ${e.message}`);
  const cols = parsed.meta.fields ?? [];
  for (const c of requiredCols) if (!cols.includes(c)) errors.push(`${rel}: missing column "${c}"`);
  return parsed.data;
}

/**
 * Compile the dataset in memory. Returns { errors, files, counts, report }.
 * `files` is { fileName: string } and is empty when there are errors.
 * opts: csvDir, publicDir, contractVersion, expected (counts object or null to skip the count check).
 */
export function compile({ csvDir, publicDir, contractVersion, expected = GUIDE_COUNTS }) {
  const errors = [];
  const D = (rel, cols) => readCsv(csvDir, rel, errors, cols);

  // ---- muscles (taxonomy + figure units) ----
  const taxRows = D('detailed_muscles/muscle_taxonomy_detailed.csv', ['id', 'name', 'parent_group', 'group', 'status', 'map_regions']);
  const muscleIds = new Set();
  for (const r of taxRows) {
    if (muscleIds.has(r.id)) errors.push(`muscle taxonomy: duplicate id "${r.id}"`);
    muscleIds.add(r.id);
  }
  for (const r of taxRows) {
    if (!muscleIds.has(r.parent_group)) errors.push(`muscle taxonomy: "${r.id}" parent_group "${r.parent_group}" is not a muscle id`);
    if (r.status !== 'core' && r.status !== 'proposed') errors.push(`muscle taxonomy: "${r.id}" status "${r.status}"`);
  }
  const checkMuscle = (id, where) => {
    if (!muscleIds.has(id)) errors.push(`${where}: unknown muscle id "${id}"`);
  };
  const childrenOf = (id) => taxRows.filter((m) => m.parent_group === id && m.id !== id).map((m) => m.id);
  const unitRows = D('detailed_muscles/html_unit_to_detailed.csv', ['unit_id', 'detailed_muscle_id']);
  const units = unitRows.map((r) => {
    checkMuscle(r.detailed_muscle_id, `html_unit_to_detailed (${r.unit_id})`);
    return { unit: r.unit_id, muscle: r.detailed_muscle_id };
  });
  const musclesJson = {
    muscles: taxRows.map((r) => ({ id: r.id, name: r.name, parent: r.parent_group, group: r.group, status: r.status, regions: r.map_regions })),
    units,
  };

  // ---- machines + media ----
  const machineRows = D('machines.csv', ['name', 'brand', 'category', 'zone', 'muscle_groups', 'quantity', 'weight_step_kg', 'setup_cues', 'status', 'image_slug']);
  const machineDetailRows = D('detailed_muscles/machines_detailed.csv', ['name', 'detailed_muscle_groups']);
  const detailedByName = new Map(machineDetailRows.map((r) => [r.name, split(r.detailed_muscle_groups)]));
  const machineByName = new Map();
  const machineSlugs = new Set();
  for (const r of machineRows) {
    if (machineByName.has(r.name)) errors.push(`machines: duplicate name "${r.name}"`);
    if (machineSlugs.has(r.image_slug)) errors.push(`machines: duplicate image_slug "${r.image_slug}"`);
    if (!SLUG_RE.test(r.image_slug)) errors.push(`machines: image_slug "${r.image_slug}" is not lower-kebab`);
    machineByName.set(r.name, r.image_slug);
    machineSlugs.add(r.image_slug);
  }
  const machineCols = ['slug', 'name', 'brand', 'category', 'zone', 'stepKg', 'quantity', 'status', 'cues', 'muscles', 'detailed'];
  const machineOut = machineRows.map((r) => {
    const core = split(r.muscle_groups);
    core.forEach((id) => checkMuscle(id, `machines (${r.name}) muscle_groups`));
    const det = detailedByName.get(r.name);
    if (!det) errors.push(`machines_detailed: no row for machine "${r.name}"`);
    (det ?? []).forEach((id) => checkMuscle(id, `machines_detailed (${r.name})`));
    return [
      r.image_slug, r.name, r.brand, r.category, r.zone === '' ? null : r.zone,
      r.weight_step_kg === '' ? null : Number(r.weight_step_kg), Number(r.quantity), r.status, split(r.setup_cues), core, det ?? [],
    ];
  }).sort((a, b) => cmp(a[0], b[0]));
  const machinesJson = { cols: machineCols, rows: machineOut };

  const mediaRows = D('media_manifest.csv', ['machine_slug', 'file', 'variant', 'order', 'is_primary', 'width', 'height', 'alt']);
  const mediaJson = {};
  const primaryKinds = new Map(); // slug -> Set of variants flagged primary
  for (const r of mediaRows) {
    if (!machineSlugs.has(r.machine_slug)) errors.push(`media_manifest: machine_slug "${r.machine_slug}" is not a machine`);
    if (r.variant !== 'thumb' && r.variant !== 'detail') errors.push(`media_manifest: variant "${r.variant}" (${r.file})`);
    if (publicDir && !existsSync(join(publicDir, r.machine_slug, r.file))) errors.push(`media_manifest: file missing on disk: ${r.machine_slug}/${r.file}`);
    const primary = r.is_primary === 'yes';
    (mediaJson[r.machine_slug] ??= []).push({ file: r.file, variant: r.variant, primary, w: Number(r.width), h: Number(r.height), alt: r.alt, _o: Number(r.order) });
    if (primary) (primaryKinds.get(r.machine_slug) ?? primaryKinds.set(r.machine_slug, new Set()).get(r.machine_slug)).add(r.variant);
  }
  for (const s of machineSlugs) {
    const k = primaryKinds.get(s);
    if (!k || !k.has('thumb')) errors.push(`machine "${s}": no primary thumb in the media manifest`);
    if (!k || !k.has('detail')) errors.push(`machine "${s}": no primary detail image in the media manifest`);
  }
  const mediaOut = {};
  for (const slug of Object.keys(mediaJson).sort(cmp)) {
    mediaOut[slug] = mediaJson[slug]
      .map((x, i) => ({ ...x, _i: i }))
      .sort((a, b) => a._o - b._o || cmp(a.variant, b.variant) || a._i - b._i)
      .map(({ _o, _i, ...rest }) => rest);
  }

  // ---- master list ----
  const master = D('exercise_categories/exercise_categories_all.csv', [
    'name', 'slug', 'category', 'sub_category', 'also_warmup', 'movement_pattern', 'kind', 'machine_name', 'primary_muscles', 'secondary_muscles',
    'rep_min', 'rep_max', 'unilateral', 'beginner_friendly', 'difficulty', 'track_fit', 'injury_cautions', 'variations', 'cues',
  ]);
  const slugSet = new Set();
  const nameToSlug = new Map();
  for (const r of master) {
    if (!SLUG_RE.test(r.slug)) errors.push(`exercise "${r.name}": slug "${r.slug}" is not lower-kebab`);
    if (slugSet.has(r.slug)) errors.push(`exercises: duplicate slug "${r.slug}"`);
    if (nameToSlug.has(r.name)) errors.push(`exercises: duplicate name "${r.name}"`);
    slugSet.add(r.slug);
    nameToSlug.set(r.name, r.slug);
  }
  const resolveName = (name, where) => {
    const s = nameToSlug.get(name);
    if (!s) errors.push(`${where}: exercise name "${name}" does not resolve`);
    return s;
  };

  // ---- muscle map + fallback ----
  const mapRows = D('detailed_muscles/exercise_muscle_map.csv', ['slug', 'muscle_id', 'role', 'emphasis', 'note']);
  const muscleMap = {};
  const notes = {}; // slug -> { muscleId: note }
  for (const r of mapRows) {
    if (!slugSet.has(r.slug)) { errors.push(`exercise_muscle_map: slug "${r.slug}" is not in the master list`); continue; }
    checkMuscle(r.muscle_id, `exercise_muscle_map (${r.slug})`);
    if (!ROLE[r.role]) errors.push(`exercise_muscle_map (${r.slug}): role "${r.role}"`);
    if (!EMPH[r.emphasis]) errors.push(`exercise_muscle_map (${r.slug}): emphasis "${r.emphasis}"`);
    const list = (muscleMap[r.slug] ??= []);
    if (list.some((x) => x[0] === r.muscle_id)) errors.push(`exercise_muscle_map (${r.slug}): duplicate muscle "${r.muscle_id}"`);
    list.push([r.muscle_id, ROLE[r.role], EMPH[r.emphasis], 0]);
    if (r.note) (notes[r.slug] ??= {})[r.muscle_id] = r.note;
  }
  const mapped = Object.keys(muscleMap).length;
  const fallbackSlugs = [];
  for (const r of master) {
    if (muscleMap[r.slug]) continue;
    fallbackSlugs.push(r.slug);
    const rows = [];
    const seen = new Set();
    const emit = (id, role, emph) => {
      const kids = childrenOf(id);
      for (const m of kids.length ? kids : [id]) {
        if (seen.has(m)) continue;
        seen.add(m);
        rows.push([m, role, emph, 1]);
      }
    };
    const prim = split(r.primary_muscles);
    const sec = split(r.secondary_muscles).filter((id) => !prim.includes(id));
    prim.forEach((id) => emit(id, 'p', 'm'));
    sec.forEach((id) => emit(id, 's', 'l'));
    muscleMap[r.slug] = rows;
  }
  const muscleMapOut = {};
  for (const k of Object.keys(muscleMap).sort(cmp)) muscleMapOut[k] = muscleMap[k];

  // ---- variations (six files, first wins) ----
  const variations = {}; // slug -> [text]
  const seenVar = new Set();
  let variationsIn = 0;
  let variationsDropped = 0;
  for (const f of VARIATION_FILES) {
    for (const r of D(f, ['slug', 'variation'])) {
      variationsIn++;
      if (!slugSet.has(r.slug)) { errors.push(`${f}: slug "${r.slug}" is not in the master list`); continue; }
      const text = r.variation;
      if (!text || !text.trim()) { errors.push(`${f}: blank variation for "${r.slug}"`); continue; }
      const key = `${r.slug}\u0000${norm(text)}`;
      if (seenVar.has(key)) { variationsDropped++; continue; }
      seenVar.add(key);
      (variations[r.slug] ??= []).push(text);
    }
  }

  // ---- variation shift ----
  const shiftRows = D('detailed_muscles/variation_muscle_shift.csv', ['exercise', 'variation', 'muscle_id', 'shift']);
  const shiftOut = {};
  for (const r of shiftRows) {
    const slug = resolveName(r.exercise, 'variation_muscle_shift');
    if (!slug) continue;
    checkMuscle(r.muscle_id, `variation_muscle_shift (${slug})`);
    if (!SHIFT[r.shift]) errors.push(`variation_muscle_shift (${slug}): shift "${r.shift}"`);
    const list = variations[slug] ?? [];
    const text = list.find((t) => t === r.variation) ?? list.find((t) => norm(t) === norm(r.variation));
    if (!text) { errors.push(`variation_muscle_shift: "${r.exercise}" has no variation "${r.variation}"`); continue; }
    ((shiftOut[slug] ??= {})[text] ??= []).push([r.muscle_id, SHIFT[r.shift]]);
  }
  const shiftSorted = {};
  for (const k of Object.keys(shiftOut).sort(cmp)) {
    shiftSorted[k] = {};
    for (const t of Object.keys(shiftOut[k])) shiftSorted[k][t] = shiftOut[k][t];
  }

  // ---- substitutions + supersets ----
  const subRows = D('substitution_groups.csv', ['exercise', 'alternatives']);
  const subOut = {};
  for (const r of subRows) {
    const slug = resolveName(r.exercise, 'substitution_groups');
    if (!slug) continue;
    const alts = split(r.alternatives).map((n) => resolveName(n, `substitution_groups (${slug})`)).filter(Boolean);
    if (subOut[slug]) errors.push(`substitution_groups: duplicate exercise "${r.exercise}"`);
    subOut[slug] = alts;
  }
  const subSorted = {};
  for (const k of Object.keys(subOut).sort(cmp)) subSorted[k] = subOut[k];
  const supRows = D('superset_pairs.csv', ['exercise_a', 'exercise_b', 'pair_type', 'muscles']);
  const supersets = supRows.map((r) => {
    const a = resolveName(r.exercise_a, 'superset_pairs');
    const b = resolveName(r.exercise_b, 'superset_pairs');
    return { a, b, type: r.pair_type, muscles: (r.muscles ?? '').split('/').map((x) => x.trim()).filter(Boolean) };
  });

  // ---- exercises: validate + index + detail chunks ----
  const indexCols = ['slug', 'name', 'category', 'sub_category', 'kind', 'machine', 'primary', 'difficulty', 'unilateral', 'beginner', 'tracks', 'warmup', 'chunk'];
  const sortedMaster = [...master].sort((a, b) => cmp(a.slug, b.slug));
  const indexRows = [];
  const chunks = [];
  sortedMaster.forEach((r, i) => {
    const where = `exercise "${r.slug}"`;
    let machine = '';
    if (r.machine_name !== '') {
      machine = machineByName.get(r.machine_name);
      if (!machine) { errors.push(`${where}: machine_name "${r.machine_name}" does not resolve`); machine = ''; }
    }
    const primary = split(r.primary_muscles);
    primary.forEach((id) => checkMuscle(id, `${where} primary_muscles`));
    split(r.secondary_muscles).forEach((id) => checkMuscle(id, `${where} secondary_muscles`));
    const repMin = toInt(r.rep_min);
    const repMax = toInt(r.rep_max);
    if (repMin !== null && repMax !== null && repMin > repMax) errors.push(`${where}: rep_min ${repMin} > rep_max ${repMax}`);
    if ((repMin === null) !== (repMax === null)) errors.push(`${where}: only one of rep_min / rep_max is set`);
    const tracks = split(r.track_fit);
    let bits = 0;
    for (const t of tracks) {
      if (!TRACK_BITS[t]) errors.push(`${where}: unknown track "${t}"`);
      else bits |= TRACK_BITS[t];
    }
    const difficulty = Number(r.difficulty);
    if (![1, 2, 3].includes(difficulty)) errors.push(`${where}: difficulty "${r.difficulty}"`);
    for (const [col, v] of [['unilateral', r.unilateral], ['beginner_friendly', r.beginner_friendly]]) {
      if (v !== 'yes' && v !== 'no') errors.push(`${where}: ${col} "${v}" is not yes/no`);
    }
    const chunk = Math.floor(i / CHUNK_SIZE);
    indexRows.push([
      r.slug, r.name, r.category, r.sub_category, r.kind, machine, primary, difficulty,
      r.unilateral === 'yes' ? 1 : 0, r.beginner_friendly === 'yes' ? 1 : 0, bits, r.also_warmup === 'yes' ? 1 : 0, chunk,
    ]);
    (chunks[chunk] ??= {})[r.slug] = {
      cues: split(r.cues), repMin, repMax, variations: variations[r.slug] ?? [], hint: r.variations,
      cautions: r.injury_cautions, tracks, pattern: r.movement_pattern, notes: notes[r.slug] ?? {},
    };
  });

  // ======== Phase 10: setup options, search index, machine reach ========
  const ruleRows = D('setup_rules.csv', ['rule_id', 'keyword', 'axis', 'value', 'excludes', 'confidence']);
  const rules = [];
  const ruleIds = new Set();
  for (const r of ruleRows) {
    if (ruleIds.has(r.rule_id)) errors.push(`setup_rules: duplicate rule_id "${r.rule_id}"`);
    ruleIds.add(r.rule_id);
    if (!AXES[r.axis]) { errors.push(`setup_rules ${r.rule_id}: unknown axis "${r.axis}"`); continue; }
    if (!AXES[r.axis].includes(r.value)) { errors.push(`setup_rules ${r.rule_id}: unknown value "${r.value}" for axis ${r.axis}`); continue; }
    const kw = normText(r.keyword);
    if (!kw) { errors.push(`setup_rules ${r.rule_id}: blank keyword`); continue; }
    rules.push({ id: r.rule_id, kw, axis: r.axis, value: r.value, ex: r.excludes.split('|').map(normText).filter(Boolean), amb: r.confidence === 'ambiguous' });
  }
  const tagText = (text) => {
    const n = normText(text);
    const tags = [];
    const amb = [];
    for (const ru of rules) {
      if (!hasPhrase(n, ru.kw) || ru.ex.some((x) => hasPhrase(n, x))) continue;
      tags.push([ru.axis, ru.value]);
      if (ru.amb) amb.push(ru.id);
    }
    return { n, tags, amb };
  };

  // exercise pattern from the name (DATASET_GUIDE, setup_muscle_shift.csv)
  const patternOf = (name) => {
    const n = normText(name);
    for (const [p, words, not] of PATTERNS) {
      if (words.some((w) => hasPhrase(n, w)) && !not.some((w) => hasPhrase(n, w))) return p;
    }
    return null;
  };
  const patternBySlug = {};
  const patternCount = {};
  for (const r of master) {
    const p = patternOf(r.name);
    if (p) { patternBySlug[r.slug] = p; patternCount[p] = (patternCount[p] ?? 0) + 1; }
  }

  // tag every variation row
  const optionsBySlug = {}; // slug -> axis -> Set
  const review = []; // [slug, variation, reason, matched]
  let rowsTagged = 0;
  let tagTotal = 0;
  let broadRows = 0;
  let broadTagged = 0;
  let ambiguousRows = 0;
  for (const slug of Object.keys(variations).sort(cmp)) {
    for (const text of variations[slug]) {
      const { n, tags, amb } = tagText(text);
      const gh = tags.length > 0;
      const oov = OUT_OF_VOCAB.test(n);
      const broad = BROAD_GRIP_HANDLE.test(n) && !oov;
      if (oov && !tags.length) review.push([slug, text, 'out_of_vocabulary_grip_or_aid', '']);
      if (tags.length) {
        rowsTagged++;
        tagTotal += tags.length;
        const o = (optionsBySlug[slug] ??= {});
        for (const [a, v] of tags) (o[a] ??= new Set()).add(v);
      }
      if (broad) { broadRows++; if (gh) broadTagged++; else review.push([slug, text, 'grip_or_handle_word_untagged', '']); }
      if (amb.length) { ambiguousRows++; review.push([slug, text, 'ambiguous_rule', amb.join(' ')]); }
    }
  }
  const setupExercises = {};
  for (const slug of Object.keys(optionsBySlug).sort(cmp)) {
    setupExercises[slug] = {};
    for (const a of Object.keys(AXES)) {
      const set = optionsBySlug[slug][a];
      if (set) setupExercises[slug][a] = AXES[a].filter((v) => set.has(v));
    }
  }
  if (broadRows && broadTagged / broadRows < 0.9) errors.push(`setup tagging: only ${broadTagged} of ${broadRows} grip/handle-word rows carry a setup tag (< 90%)`);

  // setup muscle shift table
  const shiftSetupRows = D('setup_muscle_shift.csv', ['axis', 'value', 'applies_to', 'muscle_id', 'shift']);
  const setupShift = {};
  for (const r of shiftSetupRows) {
    const where = `setup_muscle_shift (${r.axis}/${r.value}/${r.applies_to}/${r.muscle_id})`;
    if (!AXES[r.axis] || !AXES[r.axis].includes(r.value)) { errors.push(`${where}: unknown axis or value`); continue; }
    if (!PATTERN_NAMES.includes(r.applies_to)) errors.push(`${where}: unknown pattern "${r.applies_to}"`);
    checkMuscle(r.muscle_id, where);
    if (!SHIFT[r.shift]) errors.push(`${where}: shift "${r.shift}"`);
    (((setupShift[r.axis] ??= {})[r.value] ??= {})[r.applies_to] ??= []).push([r.muscle_id, SHIFT[r.shift]]);
  }
  const setupShiftSorted = {};
  for (const a of Object.keys(AXES)) {
    if (!setupShift[a]) continue;
    setupShiftSorted[a] = {};
    for (const v of AXES[a]) if (setupShift[a][v]) setupShiftSorted[a][v] = Object.fromEntries(Object.keys(setupShift[a][v]).sort(cmp).map((p) => [p, setupShift[a][v][p]]));
  }
  const setupOptionsJson = { vocab: AXES, patterns: Object.fromEntries(Object.keys(patternBySlug).sort(cmp).map((k) => [k, patternBySlug[k]])), exercises: setupExercises, shift: setupShiftSorted };

  // movement map (Phase 25): patterns + per-exercise map, see contract/dataset/MOVEMENT_PATTERN_NOTES.md
  const JOINTS = ['neck', 'shoulder_l', 'shoulder_r', 'elbow_l', 'elbow_r', 'hip_l', 'hip_r', 'knee_l', 'knee_r', 'ankle_l', 'ankle_r', 'torso_lean'];
  const poseOf = (cell, where) => {
    const kv = Object.fromEntries(split(cell).map((x) => x.split(':')));
    return JOINTS.map((j) => {
      const v = Number(kv[j]);
      if (kv[j] === undefined || !Number.isFinite(v)) errors.push(`${where}: joint ${j} missing or not a number`);
      return v;
    });
  };
  const mvRows = D('movement_patterns.csv', ['pattern_id', 'name', 'view', 'anchor', 'joints_start', 'joints_end', 'path_hint', 'equipment_glyph', 'arm_world', 'default_param', 'twin_start', 'twin_end']);
  const movementPatterns = {};
  for (const r of mvRows) {
    const where = `movement_patterns (${r.pattern_id})`;
    if (movementPatterns[r.pattern_id]) errors.push(`${where}: duplicate`);
    movementPatterns[r.pattern_id] = { name: r.name, view: r.view, anchor: r.anchor, start: poseOf(r.joints_start, where), end: poseOf(r.joints_end, where), path: r.path_hint, glyph: r.equipment_glyph, armWorld: r.arm_world, defaultParam: r.default_param, twinStart: r.twin_start, twinEnd: r.twin_end };
  }
  const movementMap = {};
  const exerciseSlugs = new Set(master.map((m) => m.slug));
  for (const r of D('exercise_pattern_map.csv', ['slug', 'pattern_id', 'source', 'param'])) {
    if (!movementPatterns[r.pattern_id]) errors.push(`exercise_pattern_map (${r.slug}): unknown pattern "${r.pattern_id}"`);
    if (!exerciseSlugs.has(r.slug)) errors.push(`exercise_pattern_map (${r.slug}): unknown exercise slug`);
    movementMap[r.slug] = r.param ? [r.pattern_id, r.param] : [r.pattern_id];
  }
  // muscle badges (Phase 47): ladders, exercise map and tier table, read by src/shared/badges. Optional: a test folder may not have them.
  let badgesJson = null;
  if (existsSync(join(csvDir, 'strength_ladders.csv'))) {
    const lad = D('strength_ladders.csv', ['ladder_id', 'name', 'kind', 'bw_fraction', 'anchor_m', 'anchor_f', 'ref_bw_m', 'ref_bw_f', 'muscles', 'source']);
    const bmap = D('strength_ladder_map.csv', ['slug', 'ladder_id', 'factor', 'load_mode']);
    const tf = D('tier_fractions.csv', ['tier_id', 'name', 'position', 'fraction', 'experience_sets']);
    const ladIds = new Set(lad.map((r) => r.ladder_id));
    for (const r of bmap) if (r.ladder_id !== 'none' && !ladIds.has(r.ladder_id)) errors.push(`strength_ladder_map (${r.slug}): unknown ladder "${r.ladder_id}"`);
    badgesJson = {
      ladders: lad.map((r) => [r.ladder_id, r.name, r.kind, Number(r.bw_fraction), Number(r.anchor_m), Number(r.anchor_f), Number(r.ref_bw_m), Number(r.ref_bw_f), r.muscles, r.source]),
      map: bmap.filter((r) => r.ladder_id !== 'none').map((r) => [r.slug, r.ladder_id, Number(r.factor), r.load_mode]).sort((x, y) => cmp(x[0], y[0])),
      tiers: tf.map((r) => [r.tier_id, r.name, Number(r.position), Number(r.fraction), Number(r.experience_sets)]).sort((x, y) => x[2] - y[2]),
    };
  }
  const movementJson = { joints: JOINTS, patterns: Object.fromEntries(Object.keys(movementPatterns).sort(cmp).map((k) => [k, movementPatterns[k]])), map: Object.fromEntries(Object.keys(movementMap).sort(cmp).map((k) => [k, movementMap[k]])) };

  // machine companions + modes
  const compRows = D('machine_companions.csv', ['machine_name', 'kind', 'value', 'evidence', 'exercise_slug', 'label']);
  const companions = {}; // machineSlug -> { bench: [], handle: [], modes: [] }
  for (const r of compRows) {
    const where = `machine_companions (${r.machine_name}/${r.kind}/${r.value})`;
    const ms = machineByName.get(r.machine_name);
    if (!ms) { errors.push(`${where}: machine_name does not resolve`); continue; }
    if (r.evidence !== 'data' && r.evidence !== 'inferred') errors.push(`${where}: evidence "${r.evidence}"`);
    const c = (companions[ms] ??= { bench: [], handle: [], modes: [] });
    if (r.kind === 'bench' || r.kind === 'attachment') {
      const axis = r.kind === 'bench' ? 'bench' : 'handle';
      if (!AXES[axis].includes(r.value)) { errors.push(`${where}: unknown ${axis} value`); continue; }
      c[axis].push([r.value, r.evidence === 'data' ? 1 : 0]);
    } else if (r.kind === 'mode') {
      if (r.exercise_slug) {
        if (!slugSet.has(r.exercise_slug)) { errors.push(`${where}: exercise_slug "${r.exercise_slug}" is not an exercise`); continue; }
      } else {
        const [a, v] = r.value.split(':');
        if (!AXES[a] || !AXES[a].includes(v)) { errors.push(`${where}: mode value must be axis:value from the vocabulary`); continue; }
      }
      c.modes.push([r.value, r.exercise_slug || null, r.label, r.evidence === 'data' ? 1 : 0]);
    } else errors.push(`${where}: kind "${r.kind}"`);
  }

  // machine reach (engines.md 15, computed at compile time)
  const universe = [...new Set(mapRows.map((r) => r.muscle_id))].sort(cmp);
  const ROLE_F = { p: 1, s: 1, t: 0.5, m: 0 };
  const EMPH_F = { h: 1, m: 0.6, l: 0.3 };
  const exByMachine = {};
  for (const r of master) if (r.machine_name !== '' && machineByName.has(r.machine_name)) (exByMachine[machineByName.get(r.machine_name)] ??= []).push(r.slug);
  const weightsOf = (slug, axis, value) => {
    const w = {};
    for (const [m, role, emph] of muscleMap[slug] ?? []) {
      const x = ROLE_F[role] * EMPH_F[emph];
      if (x > 0) w[m] = Math.max(w[m] ?? 0, x);
    }
    if (axis) {
      const t = setupShift[axis]?.[value];
      const p = patternBySlug[slug];
      const list = [...(t?.any ?? []), ...(p && t?.[p] ? t[p] : [])];
      for (const [m, dir] of list) {
        if (dir === 'm') w[m] = w[m] === undefined ? 0.3 : Math.min(1, w[m] * 1.25);
        else if (w[m] !== undefined) w[m] = w[m] * 0.75;
      }
    }
    return w;
  };
  const reachRows = (slugs, axis, value) => {
    const best = {};
    const cnt = {};
    for (const s of slugs) {
      const w = weightsOf(s, axis, value);
      for (const [m, x] of Object.entries(w)) {
        if (x > (best[m] ?? 0)) best[m] = x;
        if (x >= 0.3) cnt[m] = (cnt[m] ?? 0) + 1;
      }
    }
    return Object.keys(best).sort(cmp).filter((m) => best[m] > 0).map((m) => [m, Math.round(Math.min(1, best[m]) * 100) / 100, cnt[m] ?? 0]);
  };
  const reachMachines = {};
  const reachUnreached = {};
  for (const ms of [...machineSlugs].sort(cmp)) {
    const exs = (exByMachine[ms] ?? []).sort(cmp);
    const comp = companions[ms] ?? { bench: [], handle: [], modes: [] };
    const posSet = new Set();
    for (const s of exs) for (const v of setupExercises[s]?.position ?? []) posSet.add(v);
    const filters = {};
    const addFilter = (axis, v) => {
      const key = `${axis}:${v}`;
      if (filters[key]) return;
      filters[key] = reachRows(exs.filter((s) => setupExercises[s]?.[axis]?.includes(v)), axis, v);
    };
    comp.bench.forEach(([v]) => addFilter('bench', v));
    comp.handle.forEach(([v]) => addFilter('handle', v));
    AXES.position.filter((v) => posSet.has(v)).forEach((v) => addFilter('position', v));
    const all = reachRows(exs);
    reachMachines[ms] = { n: exs.length, all, filters, bench: comp.bench, handle: comp.handle, modes: comp.modes };
    const reached = new Set(all.filter((x) => x[1] >= 0.3).map((x) => x[0]));
    reachUnreached[ms] = universe.filter((m) => !reached.has(m));
  }
  const machineReachJson = { muscles: universe, machines: reachMachines };

  // search aliases
  const aliasRows = D('search_aliases.csv', ['alias', 'canonical', 'kind']);
  const aliasList = [];
  const aliasSeen = new Set();
  for (const r of aliasRows) {
    const a = normText(r.alias);
    const c = normText(r.canonical);
    if (!a || !c) { errors.push(`search_aliases: blank alias or canonical ("${r.alias}" -> "${r.canonical}")`); continue; }
    if (aliasSeen.has(a)) errors.push(`search_aliases: duplicate alias "${a}"`);
    aliasSeen.add(a);
    if (a === c) errors.push(`search_aliases: alias "${a}" maps to itself`);
    if (!ALIAS_KINDS.includes(r.kind)) errors.push(`search_aliases: kind "${r.kind}" (${a})`);
    aliasList.push([a, c, r.kind]);
  }
  {
    // Loop = a cycle through aliases with DIFFERENT canonicals (a -> canonical containing b -> canonical containing a ...).
    // An alias whose canonical contains another alias of the same canonical (rhomboid -> "rhomboids teres") is a harmless fixed point: expansion is one pass.
    const byAlias = new Map(aliasList.map(([a, c]) => [a, c]));
    const edges = new Map();
    for (const [a, c] of aliasList) edges.set(a, aliasList.map(([b]) => b).filter((b) => b !== a && ` ${c} `.includes(` ${b} `) && byAlias.get(b) !== c));
    const state = new Map();
    const dfs = (a, path) => {
      state.set(a, 1);
      for (const b of edges.get(a) ?? []) {
        if (state.get(b) === 1) { errors.push(`search_aliases: alias loop ${[...path, a, b].join(' -> ')}`); continue; }
        if (!state.get(b)) dfs(b, [...path, a]);
      }
      state.set(a, 2);
    };
    for (const [a] of aliasList) if (!state.get(a)) dfs(a, []);
  }
  aliasList.sort((x, y) => y[0].split(' ').length - x[0].split(' ').length || y[0].length - x[0].length || cmp(x[0], y[0]));

  // search index
  const vocabSet = new Set();
  const tok = (s) => normText(s).split(' ').filter((t) => t.length > 1 || /^[0-9]$/.test(t));
  const muscleName = new Map(taxRows.map((m) => [m.id, m.name]));
  const docAliasTokens = new Map(); // normalised doc name -> Set of alias phrases
  for (const [a, c, k] of aliasList) {
    if (k !== 'exercise' && k !== 'machine') continue;
    (docAliasTokens.get(c) ?? docAliasTokens.set(c, new Set()).get(c)).add(a);
  }
  const docs = []; // [t, slug, name, alias, machine, muscle, setup, category] token strings arrays
  const matchedAliasDocs = new Set();
  const addDoc = (t, slug, name, machineText, muscleTexts, setupWords, catTexts) => {
    const nn = normText(name);
    const al = docAliasTokens.get(nn);
    if (al) matchedAliasDocs.add(nn);
    const f = [tok(name), [...(al ?? [])].flatMap(tok), tok(machineText), muscleTexts.flatMap(tok), setupWords.flatMap(tok), catTexts.flatMap(tok)];
    f.forEach((arr) => arr.forEach((x) => vocabSet.add(x)));
    docs.push([t, slug, ...f]);
  };
  for (const r of sortedMaster) {
    const ms = r.machine_name !== '' ? r.machine_name : '';
    const mus = new Set(split(r.primary_muscles).map((id) => muscleName.get(id)));
    for (const [m, role] of muscleMap[r.slug] ?? []) if (role === 'p' || role === 's') mus.add(muscleName.get(m));
    const setupWords = [];
    for (const [a, vs] of Object.entries(setupExercises[r.slug] ?? {})) vs.forEach((v) => setupWords.push(v.replace(/_/g, ' ')));
    addDoc('e', r.slug, r.name, ms, [...mus].filter(Boolean), setupWords, [r.category, r.sub_category]);
  }
  for (const m of machineOut) {
    addDoc('m', m[0], m[1], m[2], m[9].map((id) => muscleName.get(id) ?? id), [], [m[3]]);
  }
  const unmatchedAliasDocs = [...docAliasTokens.keys()].filter((k) => !matchedAliasDocs.has(k)).length;
  const vocab = [...vocabSet].sort(cmp);
  const vid = new Map(vocab.map((t, i) => [t, i]));
  const searchIndexJson = {
    vocab,
    cols: ['t', 'slug', 'name', 'alias', 'machine', 'muscle', 'setup', 'category'],
    docs: docs.map(([t, slug, ...f]) => [t, slug, ...f.map((arr) => arr.map((x) => vid.get(x)))]),
    aliases: aliasList,
    setupTerms: Object.keys(AXES).flatMap((a) => AXES[a].map((v) => [v.replace(/_/g, ' '), a, v])),
  };

  const reviewRows = review.sort((a, b) => cmp(a[0], b[0]) || cmp(a[2], b[2]) || cmp(a[1], b[1]));
  const reviewCsv = Papa.unparse([['slug', 'variation', 'reason', 'matched_rules'], ...reviewRows], { newline: '\n' }) + '\n';
  const phase10 = {
    setupRules: ruleRows.length, setupShiftRows: shiftSetupRows.length, companionRows: compRows.length, aliasRows: aliasRows.length,
    variationRowsTagged: rowsTagged, tagTotal, ambiguousRows, gripHandleWordRows: broadRows, gripHandleWordTagged: broadTagged,
    reviewRows: reviewRows.length, patternsAssigned: Object.keys(patternBySlug).length, exercisesWithOptions: Object.keys(setupExercises).length,
    searchDocs: docs.length, searchVocab: vocab.length, aliasesUnmatchedDocs: unmatchedAliasDocs,
  };

  // ---- counts and guide check ----
  const mapRowTotal = mapRows.length;
  const shiftTotal = shiftRows.length;
  const variationsKept = variationsIn - variationsDropped;
  const counts = {
    exercises: master.length, machines: machineRows.length, muscles: taxRows.length, mapped, fallback: fallbackSlugs.length,
    mapRows: mapRowTotal, variations: variationsKept, variationsIn, variationsDropped, shiftRows: shiftTotal,
    mediaFiles: mediaRows.length, substitutionRows: subRows.length, supersetRows: supRows.length, detailChunks: chunks.length, units: units.length,
  };
  Object.assign(counts, phase10);
  counts.movementPatterns = Object.keys(movementPatterns).length;
  counts.movementMapped = Object.keys(movementMap).length;
  if (expected) {
    for (const k of Object.keys(expected)) {
      if (counts[k] !== expected[k]) errors.push(`count mismatch for ${k}: got ${counts[k]}, DATASET_GUIDE says ${expected[k]}`);
    }
  }
  if (errors.length) return { errors, files: {}, counts, report: { fallbackSlugs }, reviewCsv: '' };

  // ---- serialise, hash, manifest ----
  const out = {}; // fileName -> text
  const hashes = []; // "logical:hash"
  const logicalToFile = {};
  const sizes = {}; // logical -> { raw, gz }
  const emit = (logical, obj) => {
    const text = JSON.stringify(obj) + '\n';
    const h = sha8(text);
    const file = `${logical}.${h}.json`;
    out[file] = text;
    logicalToFile[logical] = file;
    hashes.push(`${logical}:${h}`);
    sizes[logical] = { raw: Buffer.byteLength(text), gz: gzipSync(text, { level: 9 }).length };
    return file;
  };
  emit('exercises.index', { cols: indexCols, rows: indexRows });
  const detailChunks = chunks.map((c, n) => ({ n, count: Object.keys(c).length, file: emit(`exercises.detail.${n}`, c) }));
  emit('muscles', musclesJson);
  emit('machines', machinesJson);
  emit('media', mediaOut);
  emit('muscle_map', muscleMapOut);
  emit('variation_shift', shiftSorted);
  emit('substitutions', subSorted);
  emit('supersets', supersets);
  emit('setup_options', setupOptionsJson);
  emit('movement', movementJson);
  if (badgesJson) emit('badges', badgesJson);
  emit('search.index', searchIndexJson);
  emit('machine_reach', machineReachJson);
  const files = {};
  for (const k of Object.keys(logicalToFile).filter((k) => !k.startsWith('exercises.detail.')).sort(cmp)) files[k] = logicalToFile[k];
  const version = sha8([...hashes].sort(cmp).join('\n'));
  const manifest = { contract: contractVersion, version, counts, files, detailChunks };
  const manifestText = JSON.stringify(manifest) + '\n';
  out['dataset.manifest.json'] = manifestText;
  sizes['dataset.manifest'] = { raw: Buffer.byteLength(manifestText), gz: gzipSync(manifestText, { level: 9 }).length };

  // ---- size budgets ----
  const budgetErrors = [];
  let precached = 0;
  for (const [k, max] of Object.entries(BUDGET_GZ)) {
    precached += sizes[k].gz;
    if (sizes[k].gz > max) budgetErrors.push(`size budget: ${k} is ${sizes[k].gz} B gz, budget ${max}`);
  }
  for (const [k, max] of Object.entries(BUDGET_OTHER_GZ)) if (sizes[k] && sizes[k].gz > max) budgetErrors.push(`size budget: ${k} is ${sizes[k].gz} B gz, budget ${max}`);
  if (precached > BUDGET_PRECACHED_GZ) budgetErrors.push(`size budget: precached total ${precached} B gz, budget ${BUDGET_PRECACHED_GZ}`);
  for (const c of detailChunks) {
    const g = sizes[`exercises.detail.${c.n}`].gz;
    if (g > BUDGET_CHUNK_GZ) budgetErrors.push(`size budget: detail chunk ${c.n} is ${g} B gz, budget ${BUDGET_CHUNK_GZ}`);
  }
  if (budgetErrors.length) return { errors: budgetErrors, files: {}, counts, report: { fallbackSlugs }, reviewCsv: '' };

  const cable = reachMachines['cable-crossover'];
  const reachReport = cable ? { universe: universe.length, reached: universe.length - reachUnreached['cable-crossover'].length, notReached: reachUnreached['cable-crossover'] } : null;
  return { errors: [], files: out, counts, reviewCsv, report: { fallbackSlugs, sizes, precached, version, patternCount, reachReport } };
}

/** Replace the generated folder contents atomically enough: only called when compile() had no errors. */
export function writeGenerated(outDir, files) {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(join(outDir, f));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
}

function main() {
  const csvDir = join(ROOT, 'contract', 'dataset');
  const publicDir = join(ROOT, 'public', 'machines');
  const outDir = join(ROOT, 'src', 'dataset', 'generated');
  const contractVersion = readFileSync(join(ROOT, 'contract', 'VERSION'), 'utf8').trim();
  const res = compile({ csvDir, publicDir, contractVersion });
  const c = res.counts;
  console.log(`exercises ${c.exercises} | machines ${c.machines} | muscles ${c.muscles} | mapped ${c.mapped} + fallback ${c.fallback} | map rows ${c.mapRows}`);
  console.log(`variations ${c.variations} (in ${c.variationsIn}, dropped ${c.variationsDropped}) | shift rows ${c.shiftRows} | media files ${c.mediaFiles} | substitutions ${c.substitutionRows} | supersets ${c.supersetRows} | detail chunks ${c.detailChunks} | figure units ${c.units}`);
  if (c.setupRules !== undefined) {
    console.log(`setup rules ${c.setupRules} | setup shift rows ${c.setupShiftRows} | companion rows ${c.companionRows} | alias rows ${c.aliasRows}`);
    console.log(`variation rows tagged ${c.variationRowsTagged} (${c.tagTotal} tags, ${c.ambiguousRows} via ambiguous rules) | grip/handle-word rows ${c.gripHandleWordRows}, tagged ${c.gripHandleWordTagged} | review rows ${c.reviewRows} | exercises with options ${c.exercisesWithOptions} | patterns assigned ${c.patternsAssigned}`);
    console.log(`search docs ${c.searchDocs}, vocabulary ${c.searchVocab}, exercise/machine aliases whose target is not a document name ${c.aliasesUnmatchedDocs}`);
  }
  if (res.errors.length) {
    console.error(`\n${res.errors.length} error(s); nothing written:`);
    for (const e of res.errors.slice(0, 50)) console.error(`  - ${e}`);
    if (res.errors.length > 50) console.error(`  ... and ${res.errors.length - 50} more`);
    process.exit(1);
  }
  writeGenerated(outDir, res.files);
  mkdirSync(join(ROOT, 'review'), { recursive: true });
  writeFileSync(join(ROOT, 'review', 'untagged_variations.csv'), res.reviewCsv);
  console.log(`fallback exercises (${res.report.fallbackSlugs.length}): ${res.report.fallbackSlugs.join(', ')}`);
  if (res.report.patternCount) console.log(`patterns: ${Object.entries(res.report.patternCount).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const rr = res.report.reachReport;
  if (rr) console.log(`cable-crossover reach: ${rr.reached} of ${rr.universe} mapped muscles; not reached: ${rr.notReached.join(', ')}`);
  console.log('\nfile (gzip bytes / raw bytes):');
  for (const [k, s] of Object.entries(res.report.sizes)) if (!k.startsWith('exercises.detail.')) console.log(`  ${k}: ${s.gz} / ${s.raw}`);
  const ch = Object.entries(res.report.sizes).filter(([k]) => k.startsWith('exercises.detail.')).map(([, s]) => s);
  console.log(`  detail chunks: ${ch.length}, max ${Math.max(...ch.map((s) => s.gz))} gz, total ${ch.reduce((a, s) => a + s.gz, 0)} gz / ${ch.reduce((a, s) => a + s.raw, 0)} raw`);
  console.log(`  precached total (gz): ${res.report.precached}`);
  console.log(`\ndataset version ${res.report.version}; wrote ${Object.keys(res.files).length} files to src/dataset/generated/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
