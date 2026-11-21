// Phase 60: the three.js scene. This is the ONLY file that imports `three`; the page loads it with a dynamic import(),
// so three.js, the shader and OrbitControls are one lazy chunk that standalone users never download unless they open /atlas.
// Gold hologram: fresnel rim, scanlines, flicker, additive blend (an adaptation of the prototype's ideas, no cyan).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SceneSettings } from './logic';

export type ViewName = 'front' | 'back' | 'side';
interface Table { lo: number[]; scale: number[]; meshes: Array<{ id: string; k: string; s: string; v: number; t: number; po: number; io: number }> }

export interface SceneOptions {
  host: HTMLElement;
  /** Fetches a model file; the page owns progress and cancel. */
  fetchBuffer: (file: 'body.bin' | 'fit.bin') => Promise<ArrayBuffer>;
  meta: { body: Table; fit: Table };
  settings: SceneSettings;
  /** unit id -> mesh keys, from atlas.json. Meshes of a unit light up together. */
  units: Array<{ muscleId: string; meshKeys: string[] }>;
  onPick: (unitId: string | null) => void;
  onContextLost: () => void;
  signal: AbortSignal;
}
export interface AtlasScene {
  select: (unitId: string | null, fly?: boolean) => void;
  view: (v: ViewName | 'reset') => void;
  setSettings: (s: SceneSettings) => void;
  dispose: () => void;
}

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'gold';

const VS = `varying vec3 vW;varying vec3 vN;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const FS = `varying vec3 vW;varying vec3 vN;uniform float uT,uF,uI,uRim,uHatch,uPulse,uScan;uniform vec3 uC,uR;
void main(){vec3 V=normalize(cameraPosition-vW);vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
 float nv=abs(dot(N,V));float fr=pow(1.-nv,2.3);
 float scan=.5+.5*sin(vW.y*420.-uT*2.6*uF);
 float sweep=smoothstep(.985,1.,sin(vW.y*3.1-uT*.9*uF));
 float fl=1.-uF*(.07*sin(uT*41.)+.06*step(.985,fract(sin(floor(uT*9.)*91.3)*437.58)));
 float pul=1.+uPulse*uF*.35*sin(uT*4.2);
 float fill=uI*(.30+.70*scan)*(.55+.45*nv)*uScan+uI*.45*(1.-uScan);
 vec3 col=(uC*(fill+sweep*.35*uI)+uR*fr*uRim)*pul*fl;
 float h=step(.5,fract((gl_FragCoord.x+gl_FragCoord.y)/5.));col*=mix(1.,.28+.72*h,uHatch);
 gl_FragColor=vec4(col,1.);}`;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export async function createScene(o: SceneOptions): Promise<AtlasScene> {
  const gold = new THREE.Color(css('--gold-400'));
  const goldHi = new THREE.Color(css('--gold-200'));
  const ivory = new THREE.Color(css('--text'));
  const void_ = new THREE.Color(css('--bg-void'));

  const renderer = new THREE.WebGLRenderer({ antialias: o.settings.pixelRatio > 1, alpha: false });
  renderer.setClearColor(void_, 1);
  const el = renderer.domElement;
  el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  el.setAttribute('role', 'img');
  o.host.appendChild(el);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  camera.position.set(0, 0.95, 3.1);
  const controls = new OrbitControls(camera, el);
  controls.target.set(0, 0.9, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.5;
  controls.maxDistance = 5;
  controls.screenSpacePanning = true;
  let settings = o.settings;
  const applySettings = () => {
    renderer.setPixelRatio(settings.pixelRatio);
    controls.autoRotate = settings.autoRotate;
    controls.autoRotateSpeed = 0.7;
    UF.value = settings.flicker ? 1 : 0;
    resize();
  };

  const UT = { value: 0 };
  const UF = { value: settings.flicker ? 1 : 0 };
  const makeMat = () =>
    new THREE.ShaderMaterial({
      uniforms: { uT: UT, uF: UF, uC: { value: gold.clone() }, uR: { value: ivory.clone() }, uI: { value: 0.2 }, uRim: { value: 0.9 }, uHatch: { value: 0 }, uPulse: { value: 0 }, uScan: { value: 1 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });

  const group = new THREE.Group();
  scene.add(group);
  const byKey = new Map<string, THREE.Mesh[]>();
  const pickables: THREE.Mesh[] = [];
  const owners = new Map<string, string>();
  const keysOf = new Map<string, string[]>();
  for (const u of o.units) {
    keysOf.set(u.muscleId, u.meshKeys);
    for (const k of u.meshKeys) owners.set(k, u.muscleId);
  }
  const disposables: Array<{ dispose: () => void }> = [renderer, occMat];

  async function unpack(buf: ArrayBuffer, table: Table) {
    const raw = await gunzip(buf);
    const { lo, scale: sc } = table;
    for (const m of table.meshes) {
      const q = new Int16Array(raw, m.po, m.v * 3);
      const idx = new Uint16Array(raw, m.io, m.t);
      const p = new Float32Array(m.v * 3);
      for (let i = 0; i < m.v; i++) {
        p[i * 3] = (q[i * 3]! + 32767) * sc[0]! + lo[0]!;
        p[i * 3 + 1] = (q[i * 3 + 1]! + 32767) * sc[1]! + lo[1]!;
        p[i * 3 + 2] = (q[i * 3 + 2]! + 32767) * sc[2]! + lo[2]!;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      g.computeBoundingBox();
      disposables.push(g);
      const mesh = new THREE.Mesh(g, makeMat());
      disposables.push(mesh.material as THREE.Material);
      mesh.userData = { key: m.k, id: m.id, side: m.s };
      group.add(mesh);
      if (m.k === 'Skin') {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        u.uI!.value = 0.015;
        u.uRim!.value = 0.22;
        mesh.renderOrder = 0;
        mesh.raycast = () => {};
        continue;
      }
      mesh.renderOrder = 2;
      const oc = new THREE.Mesh(g, occMat);
      oc.renderOrder = 1;
      oc.raycast = () => {};
      group.add(oc);
      pickables.push(mesh);
      const list = byKey.get(m.k) ?? [];
      list.push(mesh);
      byKey.set(m.k, list);
    }
  }
  const [bodyBuf, fitBuf] = await Promise.all([o.fetchBuffer('body.bin'), o.fetchBuffer('fit.bin')]);
  if (o.signal.aborted) throw new DOMException('aborted', 'AbortError');
  await unpack(bodyBuf, o.meta.body);
  await unpack(fitBuf, o.meta.fit);
  if (o.signal.aborted) throw new DOMException('aborted', 'AbortError');

  /* projector base: rings, grid disc, soft cone (gold, additive) */
  const base = new THREE.Group();
  scene.add(base);
  const addMat = (c: THREE.Color, op: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    disposables.push(m);
    return m;
  };
  const ring = (r1: number, r2: number, op: number) => {
    const g = new THREE.RingGeometry(r1, r2, 96);
    disposables.push(g);
    const m = new THREE.Mesh(g, addMat(gold, op));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    base.add(m);
  };
  ring(0.74, 0.76, 0.9);
  ring(0.5, 0.505, 0.5);
  ring(0.97, 0.985, 0.35);
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.97, 1.9, 48, 1, true).translate(0, 0.95, 0),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uC: { value: gold.clone() } },
      vertexShader: 'varying float vY;void main(){vY=position.y/1.9;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying float vY;uniform vec3 uC;void main(){float a=pow(1.-vY,2.2)*.07;gl_FragColor=vec4(uC*a*2.,1.);}',
    }),
  );
  disposables.push(cone.geometry, cone.material as THREE.Material);
  base.add(cone);

  /* selection styling: the chosen unit glows gold-hi, everything else dims */
  let selected: Set<string> = new Set();
  const colHi = goldHi;
  function applyStyles(snap: boolean) {
    for (const [k, ms] of byKey) {
      const on = selected.has(k);
      const any = selected.size > 0;
      const i = on ? 0.62 : any ? 0.045 : 0.2;
      const r = on ? 2.1 : any ? 0.3 : 0.9;
      for (const m of ms) {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        const e = snap ? 1 : 0.22;
        u.uI!.value += (i - u.uI!.value) * e;
        u.uRim!.value += (r - u.uRim!.value) * e;
        u.uPulse!.value = on ? 1 : 0;
        (u.uC!.value as THREE.Color).copy(on ? colHi : gold);
        m.renderOrder = on ? 5 : 2;
        (m.material as THREE.ShaderMaterial).depthTest = !on;
      }
    }
  }

  /* camera tween */
  let tween: null | { t0: number; ms: number; p0: THREE.Vector3; p1: THREE.Vector3; g0: THREE.Vector3; g1: THREE.Vector3 } = null;
  const flyTo = (pos: THREE.Vector3, tgt: THREE.Vector3, ms = 700) => {
    tween = { t0: performance.now(), ms: settings.flicker || settings.autoRotate ? ms : 1, p0: camera.position.clone(), p1: pos, g0: controls.target.clone(), g1: tgt };
  };
  const view = (v: ViewName | 'reset') => {
    controls.autoRotate = false;
    const d = 3.1;
    const t = new THREE.Vector3(0, 0.9, 0);
    flyTo(v === 'back' ? new THREE.Vector3(0, 0.95, -d) : v === 'side' ? new THREE.Vector3(d, 0.95, 0) : new THREE.Vector3(0, 0.95, d), t);
  };
  const zBias = (keys: string[]) => {
    let s = 0, n = 0;
    for (const k of keys) for (const m of byKey.get(k) ?? []) { s += m.geometry.boundingBox!.getCenter(new THREE.Vector3()).z; n++; }
    return n ? s / n : 0;
  };
  function focus(keys: string[]) {
    const bb = new THREE.Box3();
    let any = false;
    for (const k of keys) for (const m of byKey.get(k) ?? []) { bb.union(m.geometry.boundingBox!); any = true; }
    if (!any) return;
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    const dist = Math.min(2.7, Math.max(0.8, Math.max(sz.x, sz.y, sz.z) * 2.4));
    const dir = camera.position.clone().sub(controls.target);
    dir.y *= 0.5;
    dir.normalize();
    const back = zBias(keys);
    if (back < 0 && dir.z > 0) dir.z = -dir.z;
    else if (back > 0 && dir.z < 0) dir.z = -dir.z;
    flyTo(c.clone().add(dir.multiplyScalar(dist)), c);
  }

  /* picking: a clean tap (little movement, short time) selects the unit under the finger */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(cx: number, cy: number): string | null {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false);
    if (!h.length) return null;
    let k = h[0]!.object.userData.key as string;
    if (k === 'External oblique') {
      const r2 = h.find((x) => x.object.userData.key === 'Rectus abdominis' && x.distance - h[0]!.distance < 0.04);
      if (r2) k = 'Rectus abdominis';
    }
    return owners.get(k) ?? null;
  }
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (mv < 7 && dt < 600) o.onPick(pick(e.clientX, e.clientY));
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; });
  const lost = (e: Event) => { e.preventDefault(); o.onContextLost(); };
  el.addEventListener('webglcontextlost', lost);

  /* size, pause when hidden or off screen */
  function resize() {
    const r = o.host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(o.host);
  let visible = true;
  let onScreen = true;
  const io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); kick(); });
  io.observe(o.host);
  const onVis = () => { visible = document.visibilityState !== 'hidden'; kick(); };
  document.addEventListener('visibilitychange', onVis);

  const clock = new THREE.Clock();
  let raf = 0;
  let dead = false;
  let frames = 0;
  function frame() {
    raf = 0;
    if (dead || !visible || !onScreen) return;
    raf = requestAnimationFrame(frame);
    UT.value = clock.getElapsedTime();
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.t0) / tween.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.g0, tween.g1, e);
      if (t >= 1) tween = null;
    }
    controls.update();
    applyStyles(false);
    renderer.render(scene, camera);
    frames++;
    (el as HTMLElement).dataset.frames = String(frames);
  }
  function kick() { if (!raf && !dead && visible && onScreen) raf = requestAnimationFrame(frame); }

  applySettings();
  applyStyles(true);
  kick();

  return {
    select(unitId, fly = true) {
      selected = new Set(unitId ? keysOf.get(unitId) ?? [] : []);
      if (unitId && fly) focus([...selected]);
      if (!unitId) view('front');
      applyStyles(false);
    },
    view,
    setSettings(s) { settings = s; applySettings(); },
    dispose() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('webglcontextlost', lost);
      controls.dispose();
      for (const d of disposables) d.dispose();
      el.remove();
    },
  };
}
