// Phase 73: how big is a member's backup? Raw JSON vs gzip vs compact-packed + gzip, on a seeded 1,000-session history
// shaped like `exportAll()` (sessions with nested items and sets, plus routines, body stats, intake).
// Usage: node scripts/measure-chunks.mjs   (no network, no dependency, deterministic)
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

let seed = 73;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const uuid = () => {
  const h = createHash('md5').update(String(rnd()) + String(rnd())).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const SLUGS = ['barbell-bench-press', 'barbell-back-squat', 'conventional-deadlift', 'lat-pulldown', 'overhead-press', 'seated-cable-row', 'dumbbell-curl', 'triceps-pushdown', 'leg-press', 'romanian-deadlift', 'incline-dumbbell-press', 'cable-fly', 'lateral-raise', 'leg-curl', 'calf-raise'];
const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

// 1,000 sessions over about 2.7 years (every ~1 day), 6 exercises x 4 sets (same shape as the Phase 46 speed test).
const sessions = Array.from({ length: 1000 }, (_, i) => {
  const startedAt = T0 + Math.floor(i * 0.98 * DAY) + Math.floor(rnd() * 3600_000);
  return {
    client_id: uuid(),
    updated_at: startedAt + 3_600_000,
    deleted_at: null,
    startedAt,
    endedAt: startedAt + 3_000_000 + Math.floor(rnd() * 900_000),
    dayName: pick(['Push', 'Pull', 'Legs']),
    items: Array.from({ length: 6 }, (_, o) => ({
      ref: { kind: 'lib', slug: pick(SLUGS) },
      order: o,
      status: 'done',
      plan: { sets: 4, repMin: 6, repMax: 10, restSec: 90 },
      sets: Array.from({ length: 4 }, (_, k) => ({
        reps: 6 + Math.floor(rnd() * 5),
        weight: 20 + Math.floor(rnd() * 24) * 2.5,
        tag: 'normal',
        doneAt: startedAt + (o * 4 + k) * 150_000,
        restSec: 90,
      })),
    })),
  };
});
const routines = Array.from({ length: 4 }, () => ({ client_id: uuid(), updated_at: T0, deleted_at: null, name: 'Routine', days: Array.from({ length: 3 }, () => ({ id: uuid(), name: 'Day', items: SLUGS.slice(0, 6).map((s) => ({ ref: { kind: 'lib', slug: s }, sets: 3, repMin: 8, repMax: 12 })) })) }));
const bodyStats = Array.from({ length: 120 }, (_, i) => ({ client_id: `bw:${i}`, updated_at: T0 + i * 7 * DAY, deleted_at: null, day: new Date(T0 + i * 7 * DAY).toISOString().slice(0, 10), kg: 80 + Math.round(rnd() * 40) / 10 }));
const intake = Array.from({ length: 900 }, () => ({ client_id: uuid(), updated_at: T0, deleted_at: null, kind: pick(['protein', 'water']), amount: pick([10, 25, 50, 250]), day: '2025-01-01', at: T0 }));

const file = { app: 'shield-fitness-user', schema: 1, exportedAt: T0, tables: { sessions, routines, customExercises: [], favourites: [], marks: [], bodyStats, goals: [], intake } };

// ---- compact packing: column-oriented sessions, slug dictionary, uuids as 16 raw bytes (base64), times as deltas ----
const b64 = (u) => Buffer.from(u.replace(/-/g, ''), 'hex').toString('base64');
const dict = [...new Set(SLUGS)];
function packSessions(list) {
  let prev = 0;
  return list.map((s) => {
    const d = s.startedAt - prev;
    prev = s.startedAt;
    return [b64(s.client_id), d, s.endedAt - s.startedAt, s.updated_at - s.endedAt, s.dayName[0], s.items.map((it) => [dict.indexOf(it.ref.slug), it.sets.map((x) => [x.reps, x.weight, x.doneAt - s.startedAt])])];
  });
}
const packed = { ...file, tables: { ...file.tables, sessions: packSessions(sessions) } };

const raw = (o) => Buffer.byteLength(JSON.stringify(o));
const gz = (o) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';

// ---- per IST-month session chunks (the Phase 75 plan) ----
const byMonth = new Map();
for (const s of sessions) {
  const m = new Date(s.startedAt + 5.5 * 3600_000).toISOString().slice(0, 7);
  (byMonth.get(m) ?? byMonth.set(m, []).get(m)).push(s);
}
const monthly = [...byMonth.values()];
const biggestGz = Math.max(...monthly.map((m) => gz(m)));
const biggestPacked = Math.max(...monthly.map((m) => gz(packSessions(m))));
const months = byMonth.size;
const years = (sessions.at(-1).startedAt - sessions[0].startedAt) / (365 * DAY);

console.log('Phase 73 measurement: seeded 1,000-session history (6 exercises x 4 sets), same shape as exportAll()');
console.log(`  sessions ${sessions.length}, sets ${sessions.length * 24}, span ${years.toFixed(2)} years, ${months} IST months`);
console.log('');
console.log('  Whole file                 raw JSON ' + kb(raw(file)) + '   gzip ' + kb(gz(file)) + '   compact + gzip ' + kb(gz(packed)));
console.log(`  Ratio vs raw               gzip ${(raw(file) / gz(file)).toFixed(1)}x   compact + gzip ${(raw(file) / gz(packed)).toFixed(1)}x`);
console.log('  Sessions only              raw JSON ' + kb(raw(sessions)) + '   gzip ' + kb(gz(sessions)) + '   compact + gzip ' + kb(gz(packSessions(sessions))));
console.log('');
console.log(`  Largest month chunk        gzip ${kb(biggestGz)}   compact + gzip ${kb(biggestPacked)}   (target < 200 KB, A-R1)`);
const perYear = (n) => n / years;
console.log(`  Per member per year        gzip ${kb(perYear(gz(file)))}   compact + gzip ${kb(perYear(gz(packed)))}   (guess in 4.6: 30-80 KB)`);
const perSession = gz(monthly[Math.floor(months / 2)]) / monthly[Math.floor(months / 2)].length;
const perSessionP = gz(packSessions(monthly[Math.floor(months / 2)])) / monthly[Math.floor(months / 2)].length;
console.log(`  One finished session pushes a month chunk again; the whole mid-history month is ${kb(gz(monthly[Math.floor(months / 2)]))} gzip, ${kb(gz(packSessions(monthly[Math.floor(months / 2)])))} compact (per session ${perSession.toFixed(0)} B / ${perSessionP.toFixed(0)} B)`);
console.log('  NOTE: made-up but realistic data; UUID entropy is real (md5-derived), repeated names are cheap. A real member varies.');
