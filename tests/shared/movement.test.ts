// Movement map maths (Phase 25): kinematics against fixtures (0.5 px), params, arcs, frame fit, wording guard.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { en } from '../../src/i18n/en';
import {
  ARC_MAX, FRAME, PROPORTIONS, applyParams, buildFigure, glyphFor, parseMovementData, parseParams, paramsFromSetup, paramsToString, pathArrow, placePair, resolvePoses, skeleton, toScreen,
  type MovementData, type MovementPattern, type Pt,
} from '../../src/shared/movement';

const manifest = JSON.parse(readFileSync('src/dataset/generated/dataset.manifest.json', 'utf8'));
const data = parseMovementData(JSON.parse(readFileSync(`src/dataset/generated/${manifest.files.movement}`, 'utf8'))) as MovementData;
const pat = (id: string): MovementPattern => data.patterns[id]!;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function snapshot(id: string, param = '') {
  const f = buildFigure(pat(id), param);
  const one = (s: typeof f.placed.end): Record<'hip' | 'shoulder' | 'head' | 'wrist' | 'ankle', Pt> => ({
    hip: toScreen(f.fit, s.hip), shoulder: toScreen(f.fit, s.shoulder), head: toScreen(f.fit, s.head),
    wrist: toScreen(f.fit, s.wrist[0]), ankle: toScreen(f.fit, s.ankle[0]),
  });
  return { start: one(f.placed.start), end: one(f.placed.end), arcs: f.arcs.map((a) => `${a.joint}:${a.from}:${a.to}`) };
}
const FIXTURE_SET: Array<[string, string]> = [['horizontal_press', ''], ['horizontal_press', 'bench_deg=30'], ['squat', ''], ['lateral_raise', ''], ['pull_up', ''], ['biceps_curl', ''], ['deadlift', ''], ['push_up', '']];
const FIXTURE = 'contract/fixtures/movement_poses.json';
if (process.env['UPDATE_FIXTURES'] === '1') {
  writeFileSync(FIXTURE, JSON.stringify({ note: 'Screen coordinates (400x300 frame) of key points, male proportions, from src/shared/movement.ts (Phase 25). Tolerance 0.5 px.', cases: FIXTURE_SET.map(([id, param]) => ({ id, param, ...snapshot(id, param) })) }, null, 1) + '\n');
}

describe('data', () => {
  test('compiled movement file parses: 54 patterns, 540 mapped exercises', () => {
    expect(Object.keys(data.patterns)).toHaveLength(54);
    expect(Object.keys(data.map)).toHaveLength(540);
    expect(data.map['barbell-bench-press']?.patternId ?? data.map[Object.keys(data.map).find((k) => k.includes('bench-press'))!]!.patternId).toBeTruthy();
  });
  test('malformed data reads as null', () => {
    expect(parseMovementData(null)).toBeNull();
    expect(parseMovementData({ patterns: { x: { start: [1], end: [2] } }, map: {} })).toBeNull();
  });
});

describe('kinematics against fixtures (0.5 px)', () => {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: Array<ReturnType<typeof snapshot> & { id: string; param: string }> };
  test('fixture covers the case set', () => expect(fx.cases).toHaveLength(FIXTURE_SET.length));
  for (const c of FIXTURE_SET.map(([id, param], i) => ({ id, param, i }))) {
    test(`${c.id} ${c.param || '(default)'}`, () => {
      const want = fx.cases[c.i]!;
      const got = snapshot(c.id, c.param);
      for (const pose of ['start', 'end'] as const)
        for (const k of Object.keys(want[pose]) as Array<keyof typeof want.start>)
          for (const axis of ['x', 'y'] as const) expect(Math.abs(got[pose][k][axis] - want[pose][k][axis])).toBeLessThanOrEqual(0.5);
      expect(got.arcs).toEqual(want.arcs);
    });
  }
});

describe('kinematics by hand', () => {
  test('segment lengths never change with the angles', () => {
    const pr = PROPORTIONS.male;
    for (const id of Object.keys(data.patterns)) {
      const p = pat(id);
      for (const pose of [p.start, p.end]) {
        const s = skeleton(p.view, pose, 'male');
        expect(dist(s.hip, s.shoulder)).toBeCloseTo(pr.torso, 6);
        if (p.view === 'side') {
          expect(dist(s.shoulder, s.elbow[0])).toBeCloseTo(pr.upperArm, 6);
          expect(dist(s.hip, s.knee[0])).toBeCloseTo(pr.thigh, 6);
          expect(dist(s.knee[0], s.ankle[0])).toBeCloseTo(pr.shin, 6);
        }
      }
    }
  });
  test('standing overhead press end: arm and legs are vertical', () => {
    const s = skeleton('side', pat('vertical_press').end, 'male');
    expect(Math.abs(s.wrist[0].x - s.shoulder.x)).toBeLessThan(10); // authored at 170 degrees, nearly vertical
    expect(s.wrist[0].y).toBeGreaterThan(s.shoulder.y + 60);
    expect(s.ankle[0].x).toBeCloseTo(0, 4);
    expect(s.ankle[0].y).toBeCloseTo(-(PROPORTIONS.male.thigh + PROPORTIONS.male.shin), 4);
  });
  test('flat bench press end: arms point straight up from the shoulders', () => {
    const s = skeleton('side', pat('horizontal_press').end, 'male');
    expect(s.shoulder.x).toBeLessThan(-40); // head side is to the left
    expect(Math.abs(s.shoulder.y)).toBeLessThan(1); // lying flat
    expect(s.wrist[0].x - s.shoulder.x).toBeLessThan(2);
    expect(s.wrist[0].y).toBeGreaterThan(55);
  });
  test('both poses share the anchor point', () => {
    const p = pat('squat');
    const placed = placePair(p, { start: p.start, end: p.end }, 'male');
    expect(placed.start.ankle[0]).toEqual(placed.end.ankle[0]);
    const seat = pat('leg_press');
    const pl = placePair(seat, { start: seat.start, end: seat.end }, 'male');
    expect(pl.start.hip).toEqual(pl.end.hip);
  });
  test('female proportions differ from male', () => {
    const a = buildFigure(pat('squat'), '', { sex: 'male' });
    const b = buildFigure(pat('squat'), '', { sex: 'female' });
    expect(a.placed.end.head.y).not.toBeCloseTo(b.placed.end.head.y, 1);
  });
});

describe('params', () => {
  test('parse keeps only allowed keys and values', () => {
    expect(parseParams('bench_deg=30;grip_width=wide;foo=1;stance_width=shoulder;seated=no;kneeling=yes;bench_deg2=3')).toEqual({ bench_deg: '30', grip_width: 'wide', kneeling: 'yes' });
    expect(parseParams('bench_deg=200;torso_lean=-120')).toEqual({});
    expect(paramsToString({ grip_width: 'wide', bench_deg: '30' })).toBe('bench_deg=30;grip_width=wide');
  });
  test('pose changes with the bench angle', () => {
    const flat = snapshot('horizontal_press', 'bench_deg=0');
    const inc = snapshot('horizontal_press', 'bench_deg=30');
    const steep = snapshot('horizontal_press', 'bench_deg=60');
    expect(Math.abs(inc.end.shoulder.y - flat.end.shoulder.y)).toBeGreaterThan(5);
    expect(steep.end.shoulder.y).toBeLessThan(inc.end.shoulder.y); // screen y is down: higher shoulder = smaller y
    expect(inc.end.shoulder.y).toBeLessThan(flat.end.shoulder.y);
  });
  test('arms keep pointing up in the room when the bench tilts (arm_world)', () => {
    const p = pat('horizontal_press');
    const flat = skeleton('side', applyParams(p, p.end, { bench_deg: '0' }), 'male');
    const inc = skeleton('side', applyParams(p, p.end, { bench_deg: '30' }), 'male');
    const ang = (s: typeof flat) => Math.atan2(s.wrist[0].y - s.shoulder.y, s.wrist[0].x - s.shoulder.x);
    expect(Math.abs(ang(flat) - ang(inc))).toBeLessThan(0.01);
  });
  test('bench 90 means standing; seated press bends hips and knees', () => {
    const p = pat('biceps_curl');
    expect(applyParams(p, p.end, { bench_deg: '90' }).hip_l).toBe(175);
    const v = pat('vertical_press');
    const seated = applyParams(v, v.start, { seated: 'yes' });
    expect([seated.hip_l, seated.knee_l, seated.torso_lean]).toEqual([100, 100, -5]);
  });
  test('front view: wide grip opens the arms by 10 degrees', () => {
    const p = pat('lateral_raise');
    expect(applyParams(p, p.end, { grip_width: 'wide' }).shoulder_l).toBe(p.end.shoulder_l + 10);
    expect(buildFigure(p, 'grip_width=wide').twin.widthKey).toBe('mm.wide_grip');
  });
  test('setup choices become params only where the pattern understands them', () => {
    expect(paramsFromSetup(pat('horizontal_press'), { bench: 'incline' })).toEqual({ bench_deg: '30' });
    expect(paramsFromSetup(pat('horizontal_press'), { bench: 'incline', angleDeg: 45 })).toEqual({ bench_deg: '45' });
    expect(paramsFromSetup(pat('horizontal_press'), { bench: 'decline' })).toEqual({ bench_deg: '-15' });
    expect(paramsFromSetup(pat('squat'), { bench: 'incline', width: 'wide' })).toEqual({ stance_width: 'wide' });
    expect(paramsFromSetup(pat('vertical_press'), { position: 'seated' })).toEqual({ seated: 'yes' });
    expect(paramsFromSetup(pat('horizontal_press'), undefined)).toEqual({});
    expect(resolvePoses(pat('horizontal_press'), 'bench_deg=30', { bench_deg: '0' }).params.bench_deg).toBe('0');
  });
});

describe('arcs, path and glyph', () => {
  test('arcs: at most 3, each 25 degrees or more, biggest first', () => {
    for (const id of Object.keys(data.patterns)) {
      const f = buildFigure(pat(id), '');
      expect(f.arcs.length).toBeLessThanOrEqual(ARC_MAX);
      const sizes = f.arcs.map((a) => Math.abs(a.to - a.from));
      sizes.forEach((n) => expect(n).toBeGreaterThanOrEqual(25));
      expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    }
    expect(snapshot('horizontal_press').arcs[0]).toMatch(/^elbow:/);
  });
  test('hold, cyclic and unknown hints draw no resistance arrow', () => {
    const placed = placePair(pat('plank'), { start: pat('plank').start, end: pat('plank').end }, 'male');
    expect(pathArrow('hold', placed)).toBeNull();
    expect(pathArrow('cyclic_stride', placed)).toBeNull();
    expect(pathArrow('made_up_hint', placed)).toBeNull();
    expect(buildFigure(pat('horizontal_press'), '').arrow).not.toBeNull();
  });
  test('glyph order: name words, machine category, pattern default', () => {
    expect(glyphFor('Dumbbell Bench Press', 'strength_machine', 'barbell')).toBe('dumbbell');
    expect(glyphFor('Chest Press', 'strength_machine', 'barbell')).toBe('machine');
    expect(glyphFor('Chest Press', 'cable', 'barbell')).toBe('cable');
    expect(glyphFor('Bench Press', undefined, 'barbell')).toBe('barbell');
    expect(glyphFor('Resistance Band Row', undefined, 'cable')).toBe('band');
  });
});

describe('320 px overflow audit (every pattern, both sexes, both poses, wide setups)', () => {
  test('every drawn point stays inside the 4:3 frame', () => {
    for (const sex of ['male', 'female'] as const)
      for (const id of Object.keys(data.patterns)) {
        for (const param of ['', 'grip_width=wide', 'stance_width=wide', 'bench_deg=60']) {
          const f = buildFigure(pat(id), param, { sex });
          for (const s of [f.placed.start, f.placed.end]) {
            const pts = [s.hip, s.shoulder, s.head, ...s.shoulderJ, ...s.hipJ, ...s.elbow, ...s.wrist, ...s.knee, ...s.ankle, ...s.toe];
            for (const q of pts) {
              const p = toScreen(f.fit, q);
              expect(p.x, `${id} ${param} x`).toBeGreaterThanOrEqual(0);
              expect(p.x, `${id} ${param} x`).toBeLessThanOrEqual(FRAME.w);
              expect(p.y, `${id} ${param} y`).toBeGreaterThanOrEqual(0);
              expect(p.y, `${id} ${param} y`).toBeLessThanOrEqual(FRAME.h);
            }
          }
        }
      }
  });
});

describe('wording guard', () => {
  const banned = /\b(correct|wrong|proper|properly|perfect|should|must)\b/i;
  test('mm.* strings and pattern twins avoid prescriptive words', () => {
    for (const [k, v] of Object.entries(en)) if (k.startsWith('mm.')) expect(banned.test(v), k).toBe(false);
    for (const p of Object.values(data.patterns)) expect(banned.test(`${p.twinStart} ${p.twinEnd}`), p.id).toBe(false);
  });
  test('the info sheet says typical, approximate and not a form instruction', () => {
    expect(en['mm.info']).toMatch(/Typical movement/);
    expect(en['mm.info']).toMatch(/not a form instruction/);
  });
  test('fixture file exists', () => expect(existsSync(FIXTURE)).toBe(true));
});
