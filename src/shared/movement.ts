// Movement map maths (Phase 25): forward kinematics from joint angles. Pure: no DOM, no clock, no network.
// Conventions are in contract/dataset/MOVEMENT_PATTERN_NOTES.md; drawing rules in docs/MOVEMENT_MAP.md (P24.1).
// Everything here is "typical movement", not a form instruction. All angles are the author's (coach review pending).

export const JOINT_NAMES = ['neck', 'shoulder_l', 'shoulder_r', 'elbow_l', 'elbow_r', 'hip_l', 'hip_r', 'knee_l', 'knee_r', 'ankle_l', 'ankle_r', 'torso_lean'] as const;
export type JointName = (typeof JOINT_NAMES)[number];
export type Pose = Record<JointName, number>;
export type MovementView = 'side' | 'front';
export type ParamKey = 'bench_deg' | 'torso_lean' | 'grip_width' | 'stance_width' | 'seated' | 'kneeling';
export type Params = Partial<Record<ParamKey, string>>;
export type MovementSex = 'male' | 'female';

export interface MovementPattern {
  id: string;
  name: string;
  view: MovementView;
  anchor: 'feet' | 'seat' | 'back' | 'hands' | 'hands_feet' | 'hang' | 'hips_pad';
  start: Pose;
  end: Pose;
  pathHint: string;
  glyph: string;
  armWorld: 'up' | 'down' | 'none';
  defaultParam: string;
  twinStart: string;
  twinEnd: string;
}

export interface Pt {
  x: number;
  y: number;
}

/** Segment lengths in arbitrary units (about centimetres). Two tables; the choice is a profile preference. */
export interface Proportions {
  torso: number;
  head: number;
  headDist: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  foot: number;
  shoulderW: number;
  hipW: number;
}
export const PROPORTIONS: Record<MovementSex, Proportions> = {
  male: { torso: 52, head: 11, headDist: 22, upperArm: 30, forearm: 33, thigh: 43, shin: 42, foot: 24, shoulderW: 38, hipW: 18 },
  female: { torso: 48, head: 10, headDist: 20, upperArm: 27, forearm: 30, thigh: 41, shin: 39, foot: 22, shoulderW: 34, hipW: 20 },
};

const RAD = Math.PI / 180;
/** Unit vector for a math angle in degrees (0 = +x, 90 = up). y points up here; the renderer flips it. */
const dir = (deg: number): Pt => ({ x: Math.cos(deg * RAD), y: Math.sin(deg * RAD) });
const add = (p: Pt, d: Pt, len: number): Pt => ({ x: p.x + d.x * len, y: p.y + d.y * len });
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- parsing ----------

const PARAM_KEYS: readonly ParamKey[] = ['bench_deg', 'torso_lean', 'grip_width', 'stance_width', 'seated', 'kneeling'];
const isParamKey = (k: string): k is ParamKey => (PARAM_KEYS as readonly string[]).includes(k);

/** "key=value;key=value" -> params. Unknown keys and out-of-range or unknown values are dropped. */
export function parseParams(text: string | undefined): Params {
  const out: Params = {};
  for (const part of (text ?? '').split(';')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (!k || v === undefined || !isParamKey(k)) continue;
    if (k === 'bench_deg') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= -15 && n <= 90) out[k] = String(Math.round(n));
    } else if (k === 'torso_lean') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= -90 && n <= 90) out[k] = String(Math.round(n));
    } else if (k === 'grip_width' || k === 'stance_width') {
      if (v === 'narrow' || v === 'wide') out[k] = v;
    } else if (v === 'yes') out[k] = v;
  }
  return out;
}

export const paramsToString = (p: Params): string =>
  PARAM_KEYS.filter((k) => p[k] !== undefined)
    .map((k) => `${k}=${p[k]}`)
    .join(';');

/** Compiled pose (12 numbers in JOINT_NAMES order) -> Pose. */
export function poseFromArray(a: readonly number[]): Pose {
  const p = {} as Pose;
  JOINT_NAMES.forEach((j, i) => (p[j] = a[i] ?? 0));
  return p;
}

/** Compiled `movement` file shape, narrowed. Anything malformed = null (the plain muscle map is shown). */
export interface MovementData {
  patterns: Record<string, MovementPattern>;
  map: Record<string, { patternId: string; param: string }>;
}
export function parseMovementData(raw: unknown): MovementData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { patterns?: Record<string, Record<string, unknown>>; map?: Record<string, string[]> };
  if (!r.patterns || !r.map) return null;
  const patterns: Record<string, MovementPattern> = {};
  for (const [id, p] of Object.entries(r.patterns)) {
    const s = p['start'];
    const e = p['end'];
    if (!Array.isArray(s) || !Array.isArray(e) || s.length !== 12 || e.length !== 12) return null;
    patterns[id] = {
      id,
      name: String(p['name'] ?? id),
      view: p['view'] === 'front' ? 'front' : 'side',
      anchor: p['anchor'] as MovementPattern['anchor'],
      start: poseFromArray(s as number[]),
      end: poseFromArray(e as number[]),
      pathHint: String(p['path'] ?? ''),
      glyph: String(p['glyph'] ?? 'none'),
      armWorld: p['armWorld'] === 'up' || p['armWorld'] === 'down' ? p['armWorld'] : 'none',
      defaultParam: String(p['defaultParam'] ?? ''),
      twinStart: String(p['twinStart'] ?? ''),
      twinEnd: String(p['twinEnd'] ?? ''),
    };
  }
  const map: MovementData['map'] = {};
  for (const [slug, v] of Object.entries(r.map)) if (Array.isArray(v) && v[0] && patterns[v[0]]) map[slug] = { patternId: v[0], param: v[1] ?? '' };
  return { patterns, map };
}

// ---------- params -> poses ----------

/** The torso lean the pattern's numbers were authored at (for the arm_world rule). */
export function defaultTorsoLean(p: MovementPattern): number {
  const d = parseParams(p.defaultParam);
  if (d.bench_deg !== undefined) return Number(d.bench_deg) - 90;
  if (d.torso_lean !== undefined) return Number(d.torso_lean);
  return p.start.torso_lean;
}

/** Apply params to one pose (notes file, "arm_world and default_param" table). Returns a new pose. */
export function applyParams(pattern: MovementPattern, pose: Readonly<Pose>, params: Params): Pose {
  const out: Pose = { ...pose };
  const base = defaultTorsoLean(pattern);
  const setBoth = (a: JointName, b: JointName, v: number) => {
    out[a] = v;
    out[b] = v;
  };
  let lean: number | undefined;
  if (params.bench_deg !== undefined) {
    const deg = Number(params.bench_deg);
    lean = deg - 90;
    if (deg >= 85) {
      setBoth('hip_l', 'hip_r', 175);
      setBoth('knee_l', 'knee_r', 175);
    }
  }
  if (params.torso_lean !== undefined) lean = Number(params.torso_lean);
  if (params.seated === 'yes') {
    if (pattern.id === 'vertical_press') {
      setBoth('hip_l', 'hip_r', 100);
      setBoth('knee_l', 'knee_r', 100);
      lean = -5;
    } else if (pattern.id === 'calf_raise') {
      setBoth('hip_l', 'hip_r', 95);
      setBoth('knee_l', 'knee_r', 95);
    }
  }
  if (params.kneeling === 'yes') {
    setBoth('hip_l', 'hip_r', 175);
    setBoth('knee_l', 'knee_r', 90);
    setBoth('ankle_l', 'ankle_r', 140);
  }
  if (lean !== undefined) {
    const delta = lean - base;
    out.torso_lean = lean;
    if (pattern.armWorld !== 'none') {
      out.shoulder_l += delta;
      out.shoulder_r += delta;
    }
  }
  if (pattern.view === 'front') {
    const sign = (k: 'grip_width' | 'stance_width') => (params[k] === 'wide' ? 10 : params[k] === 'narrow' ? -10 : 0);
    const g = sign('grip_width');
    const s = sign('stance_width');
    if (g) {
      out.shoulder_l += g;
      out.shoulder_r += g;
    }
    if (s) {
      out.hip_l = Math.max(0, out.hip_l + s);
      out.hip_r = Math.max(0, out.hip_r + s);
    }
  }
  return out;
}

export interface ResolvedPoses {
  start: Pose;
  end: Pose;
  params: Params;
}
/** Pattern + the exercise's own params (+ the user's setup params laid over them). */
export function resolvePoses(pattern: MovementPattern, exerciseParam: string | undefined, setupParams?: Params): ResolvedPoses {
  const params: Params = { ...parseParams(exerciseParam), ...(setupParams ?? {}) };
  return { start: applyParams(pattern, pattern.start, params), end: applyParams(pattern, pattern.end, params), params };
}

const STANCE_PATTERNS = new Set(['squat', 'lunge', 'step_up', 'leg_press', 'calf_raise', 'jump', 'lateral_lunge', 'jumping_jack', 'hip_thrust', 'deadlift']);
interface SetupLike {
  width?: string;
  position?: string;
  bench?: string;
  angleDeg?: number;
}
/**
 * Setup picker choices (Phase 22) -> movement params. Only the keys the pattern understands are produced.
 * An empty result means "draw the exercise as mapped".
 */
export function paramsFromSetup(pattern: MovementPattern, setup: SetupLike | undefined): Params {
  const out: Params = {};
  if (!setup) return out;
  const usesBench = parseParams(pattern.defaultParam).bench_deg !== undefined;
  if (usesBench) {
    const incline = setup.angleDeg !== undefined ? setup.angleDeg : 30;
    if (setup.bench === 'flat' || setup.position === 'lying') out.bench_deg = '0';
    else if (setup.bench === 'incline' || setup.position === 'incline') out.bench_deg = String(Math.min(90, Math.max(0, Math.round(incline))));
    else if (setup.bench === 'decline' || setup.position === 'decline') out.bench_deg = '-15';
  }
  if (setup.position === 'seated' && (pattern.id === 'vertical_press' || pattern.id === 'calf_raise')) out.seated = 'yes';
  if (setup.position === 'kneeling') out.kneeling = 'yes';
  if (setup.width === 'wide' || setup.width === 'narrow') out[STANCE_PATTERNS.has(pattern.id) ? 'stance_width' : 'grip_width'] = setup.width;
  return out;
}

/** "Wide grip." etc. Strings are `mm.*` keys; the model returns the key so the UI can translate. */
export function widthKey(params: Params): 'mm.wide_grip' | 'mm.narrow_grip' | 'mm.wide_stance' | 'mm.narrow_stance' | null {
  if (params.grip_width === 'wide') return 'mm.wide_grip';
  if (params.grip_width === 'narrow') return 'mm.narrow_grip';
  if (params.stance_width === 'wide') return 'mm.wide_stance';
  if (params.stance_width === 'narrow') return 'mm.narrow_stance';
  return null;
}

// ---------- forward kinematics ----------

export interface Skeleton {
  hip: Pt;
  shoulder: Pt;
  head: Pt;
  /** Where each arm and leg joins the trunk (the same point as shoulder / hip in a side view). */
  shoulderJ: [Pt, Pt];
  hipJ: [Pt, Pt];
  /** Limbs: near (l) then far (r). In a front view l is the figure's left. */
  elbow: [Pt, Pt];
  wrist: [Pt, Pt];
  knee: [Pt, Pt];
  ankle: [Pt, Pt];
  toe: [Pt, Pt];
  /** Direction (math degrees) of the segment leaving each near-side joint; used to place arc arrows. */
  seg: Record<ArcJoint, number>;
  /** Where each near-side joint is. */
  at: Record<ArcJoint, Pt>;
}
export type ArcJoint = 'neck' | 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle' | 'torso';

function sideSkeleton(pose: Readonly<Pose>, pr: Proportions): Skeleton {
  const lean = pose.torso_lean;
  const phi = 90 - lean; // trunk direction, hip -> shoulder
  const hip: Pt = { x: 0, y: 0 };
  const shoulder = add(hip, dir(phi), pr.torso);
  const head = add(shoulder, dir(phi - pose.neck), pr.headDist);
  const limb = (i: 0 | 1) => {
    const sh = i === 0 ? pose.shoulder_l : pose.shoulder_r;
    const el = i === 0 ? pose.elbow_l : pose.elbow_r;
    const hp = i === 0 ? pose.hip_l : pose.hip_r;
    const kn = i === 0 ? pose.knee_l : pose.knee_r;
    const an = i === 0 ? pose.ankle_l : pose.ankle_r;
    const upperDir = phi + 180 + sh;
    const foreDir = upperDir + (180 - el);
    const elbow = add(shoulder, dir(upperDir), pr.upperArm);
    const wrist = add(elbow, dir(foreDir), pr.forearm);
    const thighDir = phi - hp;
    const shinDir = thighDir - (180 - kn);
    const footDir = shinDir + (180 - an);
    const knee = add(hip, dir(thighDir), pr.thigh);
    const ankle = add(knee, dir(shinDir), pr.shin);
    const toe = add(ankle, dir(footDir), pr.foot);
    return { elbow, wrist, knee, ankle, toe, upperDir, foreDir, thighDir, shinDir, footDir };
  };
  const a = limb(0);
  const b = limb(1);
  return {
    hip, shoulder, head, shoulderJ: [shoulder, shoulder], hipJ: [hip, hip],
    elbow: [a.elbow, b.elbow], wrist: [a.wrist, b.wrist], knee: [a.knee, b.knee], ankle: [a.ankle, b.ankle], toe: [a.toe, b.toe],
    seg: { neck: phi - pose.neck, shoulder: a.upperDir, elbow: a.foreDir, hip: a.thighDir, knee: a.shinDir, ankle: a.footDir, torso: phi },
    at: { neck: shoulder, shoulder, elbow: a.elbow, hip, knee: a.knee, ankle: a.ankle, torso: hip },
  };
}

function frontSkeleton(pose: Readonly<Pose>, pr: Proportions): Skeleton {
  const lean = pose.torso_lean;
  const up = dir(90 - lean);
  const hip: Pt = { x: 0, y: 0 };
  const shoulder = add(hip, up, pr.torso);
  const head = add(shoulder, up, pr.headDist);
  const out = (i: 0 | 1) => (i === 0 ? -1 : 1);
  // abduction angle from straight down; positive goes outward, then up
  const fromDown = (o: Pt, side: number, deg: number, len: number): Pt => ({ x: o.x + side * Math.sin(deg * RAD) * len, y: o.y - Math.cos(deg * RAD) * len });
  const limb = (i: 0 | 1) => {
    const side = out(i);
    const sh = i === 0 ? pose.shoulder_l : pose.shoulder_r;
    const el = i === 0 ? pose.elbow_l : pose.elbow_r;
    const hp = i === 0 ? pose.hip_l : pose.hip_r;
    const kn = i === 0 ? pose.knee_l : pose.knee_r;
    const sPt: Pt = { x: shoulder.x + side * (pr.shoulderW / 2), y: shoulder.y };
    const hPt: Pt = { x: hip.x + side * (pr.hipW / 2), y: hip.y };
    const elbow = fromDown(sPt, side, sh, pr.upperArm);
    const wrist = fromDown(elbow, side, sh + (180 - el), pr.forearm);
    const knee = fromDown(hPt, side, hp, pr.thigh);
    const ankle = fromDown(knee, side, Math.max(0, hp - (180 - kn)), pr.shin);
    const toe: Pt = { x: ankle.x + side * (pr.foot * 0.35), y: ankle.y };
    return { elbow, wrist, knee, ankle, toe, sPt, hPt, sh, hp };
  };
  const a = limb(0);
  const b = limb(1);
  return {
    hip, shoulder, head, shoulderJ: [a.sPt, b.sPt], hipJ: [a.hPt, b.hPt],
    elbow: [a.elbow, b.elbow], wrist: [a.wrist, b.wrist], knee: [a.knee, b.knee], ankle: [a.ankle, b.ankle], toe: [a.toe, b.toe],
    seg: { neck: 90 - lean, shoulder: -90 - a.sh, elbow: -90 - a.sh - (180 - pose.elbow_l), hip: -90 - a.hp, knee: -90 - Math.max(0, a.hp - (180 - pose.knee_l)), ankle: 180, torso: 90 - lean },
    at: { neck: shoulder, shoulder: a.sPt, elbow: a.elbow, hip: a.hPt, knee: a.knee, ankle: a.ankle, torso: hip },
  };
}

/** Skeleton before anchoring: hip at the origin. */
export function skeleton(view: MovementView, pose: Readonly<Pose>, sex: MovementSex): Skeleton {
  return view === 'front' ? frontSkeleton(pose, PROPORTIONS[sex]) : sideSkeleton(pose, PROPORTIONS[sex]);
}

function mapSkeleton(s: Skeleton, f: (p: Pt) => Pt): Skeleton {
  const two = (v: [Pt, Pt]): [Pt, Pt] => [f(v[0]), f(v[1])];
  const at = {} as Record<ArcJoint, Pt>;
  (Object.keys(s.at) as ArcJoint[]).forEach((k) => (at[k] = f(s.at[k])));
  return { hip: f(s.hip), shoulder: f(s.shoulder), head: f(s.head), shoulderJ: two(s.shoulderJ), hipJ: two(s.hipJ), elbow: two(s.elbow), wrist: two(s.wrist), knee: two(s.knee), ankle: two(s.ankle), toe: two(s.toe), seg: s.seg, at };
}

/** The fixed point of the anchor (what stays put between start and end). */
function anchorPoint(anchor: MovementPattern['anchor'], s: Skeleton): Pt {
  switch (anchor) {
    case 'feet':
      return s.ankle[0];
    case 'hands':
    case 'hands_feet':
    case 'hang':
      return s.wrist[0];
    default:
      return s.hip; // seat, back, hips_pad
  }
}

export interface PlacedPair {
  start: Skeleton;
  end: Skeleton;
}
/** Both poses placed so the anchor point is the same in both (y up, units as above). */
export function placePair(pattern: MovementPattern, poses: { start: Pose; end: Pose }, sex: MovementSex): PlacedPair {
  const a = skeleton(pattern.view, poses.start, sex);
  const b = skeleton(pattern.view, poses.end, sex);
  const pa = anchorPoint(pattern.anchor, a);
  const pb = anchorPoint(pattern.anchor, b);
  return {
    start: mapSkeleton(a, (p) => ({ x: p.x - pa.x, y: p.y - pa.y })),
    end: mapSkeleton(b, (p) => ({ x: p.x - pb.x, y: p.y - pb.y })),
  };
}

// ---------- arcs, resistance line, glyph ----------

export interface ArcSpec {
  joint: ArcJoint;
  from: number;
  to: number;
  /** Where the arc is drawn (end pose) and the sweep in math degrees. */
  at: Pt;
  startDeg: number;
  endDeg: number;
}
const ARC_VALUE: Record<ArcJoint, (p: Readonly<Pose>) => number> = {
  neck: (p) => p.neck,
  shoulder: (p) => p.shoulder_l,
  elbow: (p) => p.elbow_l,
  hip: (p) => p.hip_l,
  knee: (p) => p.knee_l,
  ankle: (p) => p.ankle_l,
  torso: (p) => p.torso_lean,
};
export const ARC_MIN_CHANGE = 25;
export const ARC_MAX = 3;

/** Joints that change by 25 degrees or more, biggest change first, at most 3 (P24.1). Hold-like patterns still get arcs if joints move. */
export function arcsFor(poses: { start: Pose; end: Pose }, placed: PlacedPair): ArcSpec[] {
  const joints = Object.keys(ARC_VALUE) as ArcJoint[];
  return joints
    .map((j, order) => ({ j, order, from: ARC_VALUE[j](poses.start), to: ARC_VALUE[j](poses.end) }))
    .filter((x) => Math.abs(x.to - x.from) >= ARC_MIN_CHANGE)
    .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from) || x.order - y.order)
    .slice(0, ARC_MAX)
    .map((x) => ({ joint: x.j, from: Math.round(x.from), to: Math.round(x.to), at: placed.end.at[x.j], startDeg: placed.start.seg[x.j], endDeg: placed.end.seg[x.j] }));
}

type Track = 'hand' | 'hip' | 'shoulder' | 'ankle' | 'none';
const TRACK: Record<string, Track> = {
  line_up_from_chest: 'hand', line_up_from_shoulder: 'hand', body_lowers_toward_floor: 'hip', body_lowers_between_hands: 'hip',
  arc_arms_close: 'hand', arc_arms_open: 'hand', arc_up_sides: 'hand', arc_up_front: 'hand', shoulders_elevate: 'shoulder',
  line_up_along_torso: 'hand', pull_down_to_chest: 'hand', arc_down_straight_arms: 'hand', body_lifts_to_bar: 'hip',
  pull_to_torso: 'hand', pull_to_hip_or_chest: 'hand', hips_move_back: 'hip', line_up_from_floor: 'hand', body_lowers_vertical: 'hip',
  body_rises_onto_step: 'hip', push_away_along_sled: 'ankle', arc_shin_up: 'ankle', arc_heel_to_seat: 'ankle', heels_rise: 'ankle',
  arc_hand_to_shoulder: 'hand', push_down_elbows_fixed: 'hand', line_up_overhead: 'hand', line_up_from_forehead: 'hand',
  trunk_curls_up: 'shoulder', arc_legs_up: 'ankle', diagonal_high_to_low: 'hand', push_forward: 'hand', hips_rise: 'hip',
  torso_rises: 'shoulder', body_leaves_floor: 'hip', drive_then_pull: 'hand', pull_down_and_hinge: 'hand', wheel_rolls_forward: 'hand',
  opposite_arm_and_leg_lower: 'hand', forearm_swings_back: 'hand', pull_from_floor_to_shoulders: 'hand', torso_leans_sideways: 'shoulder',
  trunk_curls_down: 'shoulder', arms_and_legs_open: 'hand', throw_down_to_floor: 'hand', step_to_side_and_sit: 'hip',
};

export interface ArrowSpec {
  from: Pt;
  to: Pt;
}
/** The resistance / movement arrow (P24.1). `hold`, cyclic and unknown hints draw none, and so does a path under 12 units. */
export function pathArrow(hint: string, placed: PlacedPair): ArrowSpec | null {
  const track = TRACK[hint] ?? 'none';
  if (track === 'none') return null;
  const pick = (s: Skeleton): Pt => (track === 'hand' ? s.wrist[0] : track === 'hip' ? s.hip : track === 'shoulder' ? s.shoulder : s.ankle[0]);
  const from = pick(placed.start);
  const to = pick(placed.end);
  return Math.hypot(to.x - from.x, to.y - from.y) < 12 ? null : { from, to };
}

export type Glyph = 'barbell' | 'dumbbell' | 'kettlebell' | 'plate' | 'band' | 'suspension' | 'cable' | 'machine' | 'bar' | 'bodyweight' | 'rope' | 'wheel' | 'bike' | 'ball' | 'none';
const NAME_GLYPHS: Array<[RegExp, Glyph]> = [
  [/\b(barbell|ez bar|ez-bar|smith)\b/i, 'barbell'],
  [/\bdumbbell\b/i, 'dumbbell'],
  [/\bkettlebell\b/i, 'kettlebell'],
  [/\bplate\b/i, 'plate'],
  [/\b(band|resistance)\b/i, 'band'],
  [/\bsuspension\b/i, 'suspension'],
  [/\bcable\b/i, 'cable'],
];
/** Glyph order from MOVEMENT_PATTERN_NOTES: (1) words in the name, (2) machine category, (3) pattern default. */
export function glyphFor(exerciseName: string, machineCategory: string | undefined, patternGlyph: string): Glyph {
  for (const [re, g] of NAME_GLYPHS) if (re.test(exerciseName)) return g;
  if (machineCategory === 'strength_machine') return 'machine';
  if (machineCategory === 'cable') return 'cable';
  return (patternGlyph as Glyph) || 'none';
}

// ---------- fitting to the 4:3 frame ----------

export const FRAME = { w: 400, h: 300, pad: 26 } as const;
export interface Fit {
  scale: number;
  /** screen = (x * scale + ox, oy - y * scale) */
  ox: number;
  oy: number;
  floorY: number | null;
}
function points(s: Skeleton): Pt[] {
  return [s.hip, s.shoulder, s.head, ...s.shoulderJ, ...s.hipJ, ...s.elbow, ...s.wrist, ...s.knee, ...s.ankle, ...s.toe];
}
/** One scale and offset for both poses, so start and end line up. Side view floor = lowest point; none for a hang. */
export function fitFrame(pattern: MovementPattern, placed: PlacedPair, sex: MovementSex): Fit {
  const all = [...points(placed.start), ...points(placed.end)];
  const head = PROPORTIONS[sex].head;
  const minX = Math.min(...all.map((p) => p.x)) - head;
  const maxX = Math.max(...all.map((p) => p.x)) + head;
  const minY = Math.min(...all.map((p) => p.y)) - 6;
  const maxY = Math.max(...all.map((p) => p.y)) + head;
  const w = FRAME.w - FRAME.pad * 2;
  const h = FRAME.h - FRAME.pad * 2;
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY), 2.2);
  const ox = FRAME.pad + (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = FRAME.pad + (h - (maxY - minY) * scale) / 2 + maxY * scale;
  return { scale, ox, oy, floorY: pattern.anchor === 'hang' ? null : oy - minY * scale };
}
export const toScreen = (fit: Fit, p: Pt): Pt => ({ x: round2(p.x * fit.scale + fit.ox), y: round2(fit.oy - p.y * fit.scale) });

/** Linear blend of two poses (t 0..1), used by the animation only. */
export function lerpPose(a: Readonly<Pose>, b: Readonly<Pose>, t: number): Pose {
  const out = {} as Pose;
  for (const j of JOINT_NAMES) out[j] = a[j] + (b[j] - a[j]) * t;
  return out;
}

/** Everything the figure draws, as plain numbers (fixtures test this). */
export interface FigureModel {
  view: MovementView;
  poses: ResolvedPoses;
  placed: PlacedPair;
  fit: Fit;
  arcs: ArcSpec[];
  arrow: ArrowSpec | null;
  glyph: Glyph;
  /** Twin sentences: start, end, then the width sentence key when a width param is set. */
  twin: { start: string; end: string; widthKey: ReturnType<typeof widthKey> };
}
export function buildFigure(pattern: MovementPattern, exerciseParam: string | undefined, opts: { sex?: MovementSex; setupParams?: Params; name?: string; machineCategory?: string } = {}): FigureModel {
  const sex = opts.sex ?? 'male';
  const poses = resolvePoses(pattern, exerciseParam, opts.setupParams);
  const placed = placePair(pattern, poses, sex);
  return {
    view: pattern.view,
    poses,
    placed,
    fit: fitFrame(pattern, placed, sex),
    arcs: arcsFor(poses, placed),
    arrow: pathArrow(pattern.pathHint, placed),
    glyph: glyphFor(opts.name ?? '', opts.machineCategory, pattern.glyph),
    twin: { start: pattern.twinStart, end: pattern.twinEnd, widthKey: widthKey(poses.params) },
  };
}

/** Joint labels for the angle legend: `mm.joint.<name>` keys. */
export const ARC_JOINT_KEYS: readonly ArcJoint[] = ['shoulder', 'elbow', 'hip', 'knee', 'ankle', 'neck', 'torso'];
