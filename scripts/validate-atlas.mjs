// Phase 59: validates src/atlas/atlas.json against docs/HOLO_ATLAS.md "Frozen content spec" and the three docs/atlas CSVs.
// CLI: node scripts/validate-atlas.mjs  (prints counts, exits 1 on any error). Pure functions are exported for tests.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GROUPS = ['Chest', 'Shoulders', 'Arms', 'Forearms', 'Back', 'Core', 'Glutes', 'Hip flexors', 'Quadriceps', 'Hamstrings', 'Adductors', 'Calves & shins', 'Neck'];
export const BANNED = ['cure', 'treat', 'treatment', 'diagnose', 'diagnosis', 'heal', 'therapy', 'rehab', 'rehabilitate', 'prevent', 'guarantee', 'guaranteed', 'fix', 'injury-proof', 'burn fat', 'lose weight', 'bodybuilding', 'steroid', 'supplement'];
// Tone rule "no exercises, sets or reps, equipment, brands": a small catch-list, not a full dictionary.
export const EXERCISE_WORDS = ['squat', 'squats', 'deadlift', 'deadlifts', 'sets', 'reps', 'dumbbell', 'barbell', 'kettlebell', 'machine', 'cable', 'workout', 'exercise', 'exercises', 'nike', 'youtube'];
export const LIMITS = { name: [1, 40], daily: [3, 5, 8, 70], weak: [2, 3, 8, 90], facts: [2, 3, 8, 90], see: [0, 3], total: 700 };
const FIELDS = ['muscleId', 'name', 'group', 'shape', 'meshKeys', 'taxonomyIds', 'inDailyLife', 'whenWeak', 'quickFacts', 'seeAlso', 'reviewed'];

export function parseCsv(s) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; r.push(f); f = ''; if (r.length > 1 || r[0] !== '') rows.push(r); r = []; }
    else f += c;
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  const [head, ...body] = rows;
  return body.map((x) => Object.fromEntries(head.map((k, i) => [k, x[i] ?? ''])));
}

export function bannedHits(text) {
  const hits = [];
  const low = text.toLowerCase();
  for (const w of [...BANNED, ...EXERCISE_WORDS]) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9-])${esc}([^a-z0-9-]|$)`).test(low)) hits.push(w);
  }
  return hits;
}

const isStr = (v) => typeof v === 'string';
const strArr = (v) => Array.isArray(v) && v.every(isStr);

/** units/meshMap/taxMap are the parsed CSV row arrays. Returns { errors, counts }. */
export function validateAtlas(atlas, { units, meshMap, taxMap }) {
  const errors = [];
  const err = (id, m) => errors.push(`${id}: ${m}`);
  if (!Array.isArray(atlas)) return { errors: ['atlas is not an array'], counts: {} };
  const ids = new Set(atlas.map((a) => a && a.muscleId));
  const meshOwner = new Map();
  const csvUnit = new Map(units.map((u) => [u.muscleId, u]));

  if (atlas.length !== units.length) errors.push(`row count ${atlas.length} != units CSV ${units.length}`);
  atlas.forEach((a, i) => {
    const id = a && isStr(a.muscleId) ? a.muscleId : `row ${i}`;
    if (!a || typeof a !== 'object') return err(id, 'not an object');
    for (const k of Object.keys(a)) if (!FIELDS.includes(k)) err(id, `unknown field ${k}`);
    for (const k of FIELDS) if (!(k in a)) err(id, `missing field ${k}`);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) err(id, 'muscleId not snake_case');
    if (atlas.findIndex((b) => b && b.muscleId === a.muscleId) !== i) err(id, 'duplicate muscleId');
    const u = csvUnit.get(a.muscleId);
    if (!u) err(id, 'not in atlas_units.csv');
    else {
      if (units[i] && units[i].muscleId !== a.muscleId) err(id, `order differs from CSV (expected ${units[i].muscleId} at ${i})`);
      if (a.name !== u.name) err(id, 'name differs from CSV');
      if (a.group !== u.group) err(id, 'group differs from CSV');
      if (a.shape !== u.shape) err(id, 'shape differs from CSV');
      if (JSON.stringify(a.meshKeys) !== JSON.stringify(u.mesh_keys.split('|'))) err(id, 'meshKeys differ from CSV');
      if (JSON.stringify(a.taxonomyIds) !== JSON.stringify(u.taxonomy_ids ? u.taxonomy_ids.split('|') : [])) err(id, 'taxonomyIds differ from CSV');
    }
    if (!isStr(a.name) || a.name.length < LIMITS.name[0] || a.name.length > LIMITS.name[1]) err(id, `name must be ${LIMITS.name[0]}-${LIMITS.name[1]} chars`);
    if (!GROUPS.includes(a.group)) err(id, `group "${a.group}" not one of the 13`);
    if (a.shape !== 'model' && a.shape !== 'fitted') err(id, 'shape must be model or fitted');
    if (typeof a.reviewed !== 'boolean') err(id, 'reviewed must be a boolean');
    else if (a.reviewed !== false) err(id, 'reviewed must stay false until the owner or a physio signs off');
    if (!strArr(a.meshKeys) || a.meshKeys.length < 1) err(id, 'meshKeys must be a non-empty string array');
    else for (const m of a.meshKeys) { if (meshOwner.has(m)) err(id, `mesh "${m}" also in ${meshOwner.get(m)}`); else meshOwner.set(m, id); }
    if (!strArr(a.taxonomyIds)) err(id, 'taxonomyIds must be a string array');

    const check = (field, min, max, lo, hi) => {
      const v = a[field];
      if (!strArr(v)) return err(id, `${field} must be a string array`);
      if (v.length < min || v.length > max) err(id, `${field} needs ${min}-${max} items, has ${v.length}`);
      v.forEach((s, j) => {
        if (s.length < lo || s.length > hi) err(id, `${field}[${j}] is ${s.length} chars (limit ${lo}-${hi})`);
        if (s !== s.trim()) err(id, `${field}[${j}] has stray spaces`);
        for (const w of bannedHits(s)) err(id, `${field}[${j}] contains banned word "${w}"`);
        if (/https?:|www\./i.test(s)) err(id, `${field}[${j}] contains a link`);
        if (/\p{Extended_Pictographic}/u.test(s)) err(id, `${field}[${j}] contains an emoji`);
      });
      if (new Set(v).size !== v.length) err(id, `${field} has duplicate items`);
    };
    check('inDailyLife', LIMITS.daily[0], LIMITS.daily[1], LIMITS.daily[2], LIMITS.daily[3]);
    check('whenWeak', LIMITS.weak[0], LIMITS.weak[1], LIMITS.weak[2], LIMITS.weak[3]);
    check('quickFacts', LIMITS.facts[0], LIMITS.facts[1], LIMITS.facts[2], LIMITS.facts[3]);
    const total = ['inDailyLife', 'whenWeak', 'quickFacts'].reduce((n, f) => n + (strArr(a[f]) ? a[f].join('').length : 0), 0);
    if (total > LIMITS.total) err(id, `text totals ${total} chars (limit ${LIMITS.total})`);
    if (!strArr(a.seeAlso) || a.seeAlso.length > LIMITS.see[1]) err(id, 'seeAlso must be a string array of at most 3');
    else for (const s of a.seeAlso) { if (!ids.has(s)) err(id, `seeAlso "${s}" does not exist`); if (s === a.muscleId) err(id, 'seeAlso lists itself'); }
  });

  // Ownership: every mesh key in the model map, and every taxonomy id, has an owner row.
  for (const m of meshMap) {
    if (m.mesh_key === 'Skin') { if (meshOwner.has('Skin')) errors.push('Skin must have no row'); continue; }
    if (!meshOwner.has(m.mesh_key)) errors.push(`mesh "${m.mesh_key}" has no owner row`);
    else if (meshOwner.get(m.mesh_key) !== m.muscleId) errors.push(`mesh "${m.mesh_key}" is in ${meshOwner.get(m.mesh_key)} but the mesh map says ${m.muscleId}`);
  }
  const meshKeysCsv = new Set(meshMap.map((m) => m.mesh_key));
  for (const k of meshOwner.keys()) if (!meshKeysCsv.has(k)) errors.push(`mesh "${k}" is not in atlas_mesh_map.csv`);
  const taxOwned = new Set(atlas.flatMap((a) => (a && strArr(a.taxonomyIds) ? a.taxonomyIds : [])));
  for (const t of taxMap) {
    if (t.kind === 'detailed' && !taxOwned.has(t.taxonomy_id)) errors.push(`taxonomy id "${t.taxonomy_id}" has no owner row`);
    if (t.kind === 'parent') for (const u of t.atlas_units.split('|')) if (!ids.has(u)) errors.push(`parent "${t.taxonomy_id}" points to missing unit ${u}`);
  }

  const kinds = (k) => taxMap.filter((t) => t.kind === k).length;
  const counts = {
    rows: atlas.length,
    model: atlas.filter((a) => a && a.shape === 'model').length,
    fitted: atlas.filter((a) => a && a.shape === 'fitted').length,
    meshKeysOwned: meshOwner.size,
    meshKeysBodyparts3d: meshMap.filter((m) => m.source === 'bodyparts3d' && meshOwner.has(m.mesh_key)).length,
    meshKeysFitted: meshMap.filter((m) => m.source === 'fitted' && meshOwner.has(m.mesh_key)).length,
    taxonomyIds: taxMap.length,
    taxonomyDetailed: kinds('detailed'),
    taxonomyParent: kinds('parent'),
    taxonomyNoContent: kinds('no_content'),
    unreviewed: atlas.filter((a) => a && a.reviewed === false).length,
  };
  return { errors, counts };
}

export function loadAll(root) {
  const rd = (p) => readFileSync(join(root, p), 'utf8');
  return {
    atlas: JSON.parse(rd('src/atlas/atlas.json')),
    refs: {
      units: parseCsv(rd('docs/atlas/atlas_units.csv')),
      meshMap: parseCsv(rd('docs/atlas/atlas_mesh_map.csv')),
      taxMap: parseCsv(rd('docs/atlas/atlas_taxonomy_map.csv')),
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { atlas, refs } = loadAll(root);
  const { errors, counts } = validateAtlas(atlas, refs);
  console.log('atlas counts:', JSON.stringify(counts));
  if (errors.length) { console.error(errors.join('\n')); console.error(`FAIL: ${errors.length} error(s)`); process.exit(1); }
  console.log('atlas OK');
}
