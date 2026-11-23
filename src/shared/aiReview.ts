// Copy for AI review (Phase 40): contract/engines.md section 18. Pure: no DOM, no storage, no clock (the caller passes today's
// day key). Plain text only: no markdown, no emoji, `\n` line breaks, deterministic. Nothing here sends anything anywhere.

import { addDays, istDayKey, isDayKey, istWeekStartKey, parseIso, weekdayOfKey, type DayKey } from './dates';
import { e1rm, e1rmDisplay } from './engine/oneRm';
import { effectiveSets } from './history';
import { isWorking, sessionStats, type EngineSet } from './engine/sessionStats';
import { sessionPRs } from './pr';
import { refId, type Session, type SessionItem, type SetLog, type SkipReason } from './session';
import { kgToLb, roundKg } from './units';

export const AI_MAX_CHARS = 12_000;
export const AI_TRIM_NOTE = 'NOTE: detail trimmed to fit';
export const DEFAULT_INTRO = 'Review my training below. Tell me what is going well, what to change, and what to try next. Keep advice practical.';
/** More sessions than this in a range: the per-session lines are dropped and the weekly summaries stay. */
export const RANGE_SESSION_LIMIT = 30;
export const DEFAULT_LAST_N = 8;

export type AiUnit = 'kg' | 'lb';

export interface AiInclude {
  notes: boolean;
  rpe: boolean;
  setups: boolean;
  prs: boolean;
  muscles: boolean;
  /** Off by default. */
  bodyweight: boolean;
  /** Off by default. */
  name: boolean;
  /** Off by default. */
  bodyStats: boolean;
}

/** Personal values. They reach the text only when the matching include flag is on. */
export interface AiProfile {
  name?: string;
  goal?: string;
  experience?: string;
  bodyweightKg?: number | null;
  bodyStats?: string;
}

export interface AiReviewOptions {
  /** `null` = no intro prompt. */
  intro: string | null;
  units: AiUnit;
  include: AiInclude;
  profile?: AiProfile;
}

export const DEFAULT_INCLUDE: AiInclude = { notes: true, rpe: true, setups: true, prs: true, muscles: true, bodyweight: false, name: false, bodyStats: false };
export const DEFAULT_OPTIONS: AiReviewOptions = { intro: DEFAULT_INTRO, units: 'kg', include: DEFAULT_INCLUDE };

export type AiScope =
  | { kind: 'session'; id: string }
  | { kind: 'range'; from: DayKey; to: DayKey }
  | { kind: 'exercise'; slug: string; lastN?: number };

/** Everything the text needs, read by the repo. Keys of the maps are `refId(item.ref)`. */
export interface AiHistory {
  sessions: readonly Session[];
  names: Readonly<Record<string, string>>;
  machines?: Readonly<Record<string, string>>;
  /** Detailed muscle id -> weight (engines.md section 2), per exercise. */
  weights?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  muscleNames?: Readonly<Record<string, string>>;
  /** The person's own note on an exercise. */
  notes?: Readonly<Record<string, string>>;
  /** Custom exercise id -> slug. */
  customSlugs?: Readonly<Record<string, string>>;
  /** Body weight for assisted exercises (lift = bodyweight minus assist); 70 kg when unset. */
  bodyKg?: number;
}

// ---------- ranges ----------

export type RangePreset = 'last7' | 'last30' | 'month' | 'custom';

/** The day range for a preset. `custom` needs two valid day keys, from not after to; anything else returns null. */
export function rangeFor(preset: RangePreset, today: DayKey, custom?: { from: string; to: string }): { from: DayKey; to: DayKey } | null {
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  if (preset === 'last30') return { from: addDays(today, -29), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (!custom || !isDayKey(custom.from) || !isDayKey(custom.to) || custom.from > custom.to) return null;
  return { from: custom.from, to: custom.to };
}

// ---------- small formatters ----------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const SKIP_TEXT: Record<SkipReason, string> = { busy: 'machine busy', pain: 'pain', no_time: 'no time', too_hard: 'too hard', other: 'other' };

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const trimZeros = (n: number): string => String(Math.round(n * 100) / 100);

/** A weight in the chosen unit, 2 dp at most, no trailing zeros. */
export function weightText(kg: number | null | undefined, unit: AiUnit): string {
  if (kg == null || !Number.isFinite(kg)) return '-';
  return trimZeros(unit === 'lb' ? kgToLb(kg) : roundKg(kg));
}

const volumeOf = (kg: number, unit: AiUnit): string => String(Math.round(unit === 'lb' ? kgToLb(kg) : kg));
const e1rmOf = (kg: number | null, unit: AiUnit): string => (kg == null ? '-' : trimZeros(unit === 'lb' ? Math.round(kgToLb(kg) * 2) / 2 : (e1rmDisplay(kg) ?? kg)));

function dayText(day: DayKey, withYear: boolean): string {
  const wd = WEEKDAYS[weekdayOfKey(day)] ?? '';
  const [y, m, d] = day.split('-');
  const mon = MONTHS[Number(m) - 1] ?? '';
  return `${wd} ${Number(d)} ${mon}${withYear ? ` ${y}` : ''}`;
}

const dayOfSession = (s: Session): DayKey => istDayKey(Date.parse(s.startedAt));
const byStart = (a: Session, b: Session): number => Date.parse(a.startedAt) - Date.parse(b.startedAt);

function minutesOf(s: Session): number {
  const a = parseIso(s.startedAt);
  const b = s.endedAt ? parseIso(s.endedAt) : null;
  return a !== null && b !== null ? Math.max(0, Math.round((b - a) / 60000)) : 0;
}

const slugOfItem = (it: SessionItem, h: AiHistory): string => (it.ref.kind === 'lib' ? it.ref.slug : (h.customSlugs?.[it.ref.id] ?? refId(it.ref)));
const nameOf = (it: SessionItem, h: AiHistory): string => oneLine(h.names[refId(it.ref)] ?? slugOfItem(it, h));
const workingOf = (it: SessionItem): SetLog[] => it.sets.filter((s) => isWorking(s as EngineSet));

/** Best working set: heaviest weight, then most reps. */
function topSet(it: SessionItem): SetLog | undefined {
  return [...workingOf(it)].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
}

const setText = (s: SetLog, unit: AiUnit): string => `${weightText(s.weightKg, unit)}${s.weightKg == null ? '' : ` ${unit}`} x ${s.reps ?? '-'}`;

function bestE1rmOf(it: SessionItem): number | null {
  let best: number | null = null;
  for (const s of workingOf(it)) {
    const v = e1rm(s.weightKg, s.reps);
    if (v != null && (best === null || v > best)) best = v;
  }
  return best;
}

/** `grip: supinated, handle: rope`. Variation first, then the setup axes A to Z. */
function setupWords(it: SessionItem): string {
  const parts: string[] = [];
  if (it.variation) parts.push(`variation: ${oneLine(it.variation)}`);
  for (const k of Object.keys(it.setup ?? {}).sort()) {
    const v = (it.setup as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) parts.push(`${k}: ${v.replace(/_/g, ' ')}`);
    else if (typeof v === 'number' && Number.isFinite(v)) parts.push(`${k}: ${trimZeros(v)}`);
  }
  return parts.join(', ');
}

// ---------- shared header ----------

function contextLine(o: AiReviewOptions): string {
  const p = o.profile ?? {};
  let line = `CONTEXT: goal=${p.goal ? oneLine(p.goal) : 'unknown'}; experience=${p.experience ? oneLine(p.experience) : 'unknown'}; units=${o.units}`;
  if (o.include.bodyweight) line += `; bodyweight=${p.bodyweightKg != null ? `${weightText(p.bodyweightKg, o.units)} ${o.units}` : '-'}`;
  return line;
}

/** Lines every layout starts with: the optional intro, CONTEXT, and the two opt-in personal lines. */
function headerLines(o: AiReviewOptions): string[] {
  const out: string[] = [];
  if (o.intro && o.intro.trim()) out.push(o.intro.trim());
  out.push(contextLine(o));
  const p = o.profile ?? {};
  if (o.include.name && p.name && p.name.trim()) out.push(`NAME: ${oneLine(p.name)}`);
  if (o.include.bodyStats && p.bodyStats && p.bodyStats.trim()) out.push(`BODY STATS: ${oneLine(p.bodyStats)}`);
  return out;
}

// ---------- muscles ----------

/** Weighted working sets per muscle: sum of working sets x the exercise's muscle weight. */
function muscleSets(sessions: readonly Session[], h: AiHistory): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions)
    for (const it of s.items) {
      const w = h.weights?.[refId(it.ref)];
      const n = workingOf(it).length;
      if (!w || n === 0) continue;
      for (const [m, v] of Object.entries(w)) if (v > 0) out.set(m, (out.get(m) ?? 0) + n * v);
    }
  return out;
}

const muscleName = (id: string, h: AiHistory): string => oneLine(h.muscleNames?.[id] ?? id.replace(/_/g, ' ')).toLowerCase();

function rankedMuscles(m: Map<string, number>, h: AiHistory): Array<{ name: string; value: number }> {
  return [...m.entries()]
    .map(([id, value]) => ({ name: muscleName(id, h), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

// ---------- assembling and trimming ----------

interface Parts {
  head: string[];
  /** Droppable detail, oldest first (for a session: first exercise first). */
  detail: string[];
  tail: string[];
  /** Which end of `detail` goes first when the text is too long. */
  dropFrom: 'start' | 'end';
  /** Detail already dropped on purpose (range over the session limit). */
  trimmed?: boolean;
}

function assemble(p: Parts, cap = AI_MAX_CHARS): string {
  const join = (detail: string[], note: boolean): string => [...p.head, ...(note ? [AI_TRIM_NOTE] : []), ...detail, ...p.tail].join('\n');
  let detail = [...p.detail];
  let note = !!p.trimmed;
  let text = join(detail, note);
  while (text.length > cap && detail.length > 0) {
    note = true;
    if (p.dropFrom === 'start') detail = detail.slice(1);
    else detail = detail.slice(0, -1);
    text = join(detail, note);
  }
  if (text.length <= cap) return text;
  // Even head + tail do not fit: cut whole lines from the end, never mid-line, and say so.
  const lines = text.split('\n');
  let out = lines;
  while (out.join('\n').length > cap - AI_TRIM_NOTE.length - 1 && out.length > 1) out = out.slice(0, -1);
  return `${out.join('\n')}\n${AI_TRIM_NOTE}`;
}

// ---------- session ----------

function exerciseBlock(it: SessionItem, n: number, h: AiHistory, o: AiReviewOptions): string | null {
  if (it.sets.length === 0 && it.status !== 'skipped') return null;
  let head = `${n}) ${nameOf(it, h)}`;
  const words = o.include.setups ? setupWords(it) : '';
  if (words) head += ` [${words}]`;
  const machine = h.machines?.[refId(it.ref)];
  if (machine) head += ` [machine: ${oneLine(machine)}]`;
  const lines = [head];
  if (it.sets.length > 0) {
    const sets = it.sets.map((s, i) => {
      let t = `Set ${i + 1}: ${setText(s, o.units)}`;
      if (s.seconds != null) t += ` ${s.seconds} s`;
      if (s.distanceM != null) t += ` ${trimZeros(s.distanceM)} m`;
      if (s.tag === 'warmup') t += ' (warm-up)';
      else if (s.tag === 'drop') t += ' (drop)';
      if (o.include.rpe && s.rpe != null) t += ` (RPE ${trimZeros(s.rpe)})`;
      return t;
    });
    lines.push(`   ${sets.join(' | ')}`);
  }
  const note = o.include.notes ? h.notes?.[refId(it.ref)] : undefined;
  if (note && note.trim()) lines.push(`   Note: ${oneLine(note)}`);
  if (it.status === 'skipped') lines.push(`   Skipped${it.skipReason ? ` (${SKIP_TEXT[it.skipReason]})` : ''}`);
  return lines.join('\n');
}

const valueText = (metric: string, v: number, unit: AiUnit): string =>
  metric === 'reps' ? String(v) : metric === 'e1rm' ? `${e1rmOf(v, unit)} ${unit}` : metric === 'volume' ? `${trimZeros(unit === 'lb' ? kgToLb(v) : v)} ${unit}` : `${weightText(v, unit)} ${unit}`;
const metricLabel = (metric: string): string => (metric === 'e1rm' ? 'e1RM' : metric);

function sessionText(s: Session, h: AiHistory, o: AiReviewOptions): string {
  const st = sessionStatsOf(s, h.bodyKg);
  const items = [...s.items].sort((a, b) => a.order - b.order);
  const day = dayOfSession(s);
  const head = [
    ...headerLines(o),
    `SESSION: ${dayText(day, true)} | ${s.dayName ? oneLine(s.dayName) : 'Free workout'} | ${minutesOf(s)} min | ${st.exercises} exercises | ${st.workingSets} sets | volume ${volumeOf(st.volume, o.units)} ${o.units}`,
  ];
  const detail: string[] = [];
  let n = 0;
  for (const it of items) {
    const block = exerciseBlock(it, n + 1, h, o);
    if (block) {
      n += 1;
      detail.push(block);
    }
  }
  const tail: string[] = [];
  if (o.include.prs) {
    const prs = sessionPRs(s, h.sessions, false, (id) => h.customSlugs?.[id]);
    const bits = prs.flatMap((p) => p.hits.map((x) => `${oneLine(h.names[p.ref] ?? p.slug)}: ${metricLabel(x.metric)} ${valueText(x.metric, x.value, o.units)} (${x.previous == null ? 'first' : valueText(x.metric, x.previous, o.units)})`));
    tail.push(`PRS: ${bits.length ? bits.join('; ') : 'none'}`);
  }
  if (o.include.muscles) {
    const ranked = rankedMuscles(muscleSets([s], h), h);
    const total = ranked.reduce((a, m) => a + m.value, 0);
    if (total > 0) tail.push(`MUSCLES (share of weighted volume): ${ranked.slice(0, 8).map((m) => `${m.name} ${Math.round((m.value / total) * 100)}%`).join(', ')}`);
  }
  return assemble({ head, detail, tail, dropFrom: 'end' });
}

function sessionStatsOf(s: Session, bodyKg?: number) {
  const all = s.items.flatMap((it) => effectiveSets(it, bodyKg));
  const st = sessionStats(all);
  return { ...st, exercises: s.items.filter((it) => sessionStats(it.sets as EngineSet[]).workingSets > 0).length };
}

// ---------- range ----------

interface TrendRow {
  name: string;
  sessions: number;
  first: number | null;
  best: number | null;
  latest: number | null;
}

function trendsOf(sessions: readonly Session[], h: AiHistory): TrendRow[] {
  const map = new Map<string, TrendRow>();
  for (const s of sessions)
    for (const it of s.items) {
      if (workingOf(it).length === 0) continue;
      const key = slugOfItem(it, h);
      const v = bestE1rmOf(it);
      const row = map.get(key) ?? { name: nameOf(it, h), sessions: 0, first: null, best: null, latest: null };
      row.sessions += 1;
      if (v != null) {
        if (row.first === null) row.first = v;
        if (row.best === null || v > row.best) row.best = v;
        row.latest = v;
      }
      map.set(key, row);
    }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)).slice(0, 5);
}

function rangeText(from: DayKey, to: DayKey, h: AiHistory, o: AiReviewOptions): string {
  const inRange = h.sessions.filter((s) => s.endedAt && dayOfSession(s) >= from && dayOfSession(s) <= to).sort(byStart);
  const stats = inRange.map((x) => sessionStatsOf(x, h.bodyKg));
  const totalSets = stats.reduce((a, x) => a + x.workingSets, 0);
  const totalVol = stats.reduce((a, x) => a + x.volume, 0);
  const head = [...headerLines(o), `RANGE: ${from} to ${to} | ${inRange.length} sessions | ${totalSets} sets | volume ${volumeOf(totalVol, o.units)} ${o.units}`];
  const tail: string[] = [];
  if (inRange.length === 0) return assemble({ head: [...head, 'No finished sessions in this range.'], detail: [], tail, dropFrom: 'start' });

  const weeks = new Map<DayKey, { n: number; sets: number; vol: number }>();
  inRange.forEach((s, i) => {
    const wk = istWeekStartKey(Date.parse(s.startedAt));
    const w = weeks.get(wk) ?? { n: 0, sets: 0, vol: 0 };
    w.n += 1;
    w.sets += stats[i]?.workingSets ?? 0;
    w.vol += stats[i]?.volume ?? 0;
    weeks.set(wk, w);
  });
  head.push('WEEKS:');
  for (const wk of [...weeks.keys()].sort()) {
    const w = weeks.get(wk);
    if (w) head.push(`Week of ${wk}: ${w.n} sessions, ${w.sets} sets, volume ${volumeOf(w.vol, o.units)} ${o.units}`);
  }
  if (o.include.muscles) {
    const ranked = rankedMuscles(muscleSets(inRange, h), h).slice(0, 10);
    if (ranked.length) head.push(`MUSCLES (weighted sets): ${ranked.map((m) => `${m.name} ${trimZeros(Math.round(m.value * 10) / 10)}`).join(', ')}`);
  }

  const tooMany = inRange.length > RANGE_SESSION_LIMIT;
  const detail: string[] = [];
  if (!tooMany) {
    for (const s of inRange) {
      const bits = [...s.items]
        .sort((a, b) => a.order - b.order)
        .filter((it) => workingOf(it).length > 0)
        .map((it) => {
          const top = topSet(it);
          return `${nameOf(it, h)}: ${top ? setText(top, o.units) : '-'}, ${workingOf(it).length} sets`;
        });
      detail.push(`${dayText(dayOfSession(s), false)} | ${s.dayName ? oneLine(s.dayName) : 'Free workout'} | ${bits.length ? bits.join('; ') : 'no working sets'}`);
    }
    head.push('SESSIONS:');
  }
  const trends = trendsOf(inRange, h);
  if (trends.length) {
    tail.push('TRENDS (e1RM, most logged exercises):');
    for (const t of trends) tail.push(`${t.name}: first ${e1rmOf(t.first, o.units)}, best ${e1rmOf(t.best, o.units)}, latest ${e1rmOf(t.latest, o.units)} ${o.units} (${t.sessions} sessions)`);
  }
  return assemble({ head, detail, tail, dropFrom: 'start', trimmed: tooMany });
}

// ---------- exercise ----------

function exerciseText(slug: string, lastN: number, h: AiHistory, o: AiReviewOptions): string {
  const rows: Array<{ day: DayKey; it: SessionItem }> = [];
  for (const s of [...h.sessions].filter((x) => x.endedAt).sort(byStart))
    for (const it of s.items) if (slugOfItem(it, h) === slug && workingOf(it).length > 0 && it.status !== 'skipped') rows.push({ day: dayOfSession(s), it });
  const first = rows[0];
  const name = first ? nameOf(first.it, h) : oneLine(h.names[slug] ?? slug);
  const n = Math.max(1, Math.floor(lastN));
  const shown = rows.slice(-n);
  const head = [...headerLines(o), `EXERCISE: ${name} | last ${shown.length} of ${rows.length} sessions`];
  if (rows.length === 0) return assemble({ head: [...head, 'No logged sets for this exercise.'], detail: [], tail: [], dropFrom: 'start' });

  const detail = shown.map(({ day, it }) => {
    const top = topSet(it);
    const parts = [dayText(day, true), `${workingOf(it).length} sets`, `top ${top ? setText(top, o.units) : '-'}`, `e1RM ${e1rmOf(bestE1rmOf(it), o.units)}`];
    const words = o.include.setups ? setupWords(it) : '';
    if (words) parts.push(`setup: ${words}`);
    if (o.include.rpe) {
      const r = workingOf(it).filter((s) => s.rpe != null);
      if (r.length) parts.push(`RPE ${r.map((s) => trimZeros(s.rpe as number)).join('/')}`);
    }
    return parts.join(' | ');
  });

  const e = rows.map((r) => ({ day: r.day, v: bestE1rmOf(r.it) })).filter((x): x is { day: DayKey; v: number } => x.v != null);
  const tail: string[] = [];
  const note = o.include.notes ? h.notes?.[first ? refId(first.it.ref) : slug] : undefined;
  if (note && note.trim()) tail.push(`Note: ${oneLine(note)}`);
  if (e.length > 0) {
    const best = e.reduce((a, b) => (b.v > a.v ? b : a));
    const f = e[0] as { day: DayKey; v: number };
    const l = e[e.length - 1] as { day: DayKey; v: number };
    tail.push(`SUMMARY (all ${rows.length} sessions, e1RM ${o.units}): first ${e1rmOf(f.v, o.units)} (${f.day}), best ${e1rmOf(best.v, o.units)} (${best.day}), latest ${e1rmOf(l.v, o.units)} (${l.day})`);
  } else tail.push(`SUMMARY (all ${rows.length} sessions): e1RM -`);
  return assemble({ head, detail, tail, dropFrom: 'start' });
}

// ---------- entry point ----------

/** The plain-text export for a session, a day range or one exercise. A session that does not exist gives a one-line note. */
export function aiReviewText(scope: AiScope, history: AiHistory, opts: AiReviewOptions = DEFAULT_OPTIONS): string {
  if (scope.kind === 'session') {
    const s = history.sessions.find((x) => x.id === scope.id);
    return s ? sessionText(s, history, opts) : [...headerLines(opts), 'SESSION: not found'].join('\n');
  }
  if (scope.kind === 'range') return rangeText(scope.from, scope.to, history, opts);
  return exerciseText(scope.slug, scope.lastN ?? DEFAULT_LAST_N, history, opts);
}
