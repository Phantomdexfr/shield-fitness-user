// Phase 91: Anatomy View, the three.js scene. With the page, the only file that imports `three` for this view; the page loads it
// with a dynamic import(), so it is a lazy chunk. Turn, zoom, tap, highlight, isolate, explode, focus, themes: all from the lab.
import * as THREE from 'three';
import { SYSTEMS, THEMES, planar16, partGeometry, type Meta, type Quality, type ThemeKey } from './logic';

export interface AnatomySceneOptions {
  host: HTMLElement;
  meta: Meta;
  /** The gzip bytes of mesh.bin. */
  mesh: ArrayBuffer;
  theme: ThemeKey;
  dim: number;
  beam: boolean;
  quality: Quality;
  spin: boolean;
  visible: boolean[];
  onPick: (index: number) => void;
  onProgress: (done: number, total: number) => void;
  onContextLost: () => void;
  signal: AbortSignal;
}

export interface AnatomyScene {
  setVisible: (visible: boolean[]) => void;
  /** Highlight these parts (empty clears). */
  highlight: (ids: number[]) => void;
  focus: (on: boolean) => void;
  isolate: (on: boolean) => void;
  setSpin: (on: boolean) => void;
  setExplode: (v: number) => void;
  setBrightness: (v: number) => void;
  setBeam: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setTheme: (k: ThemeKey) => void;
  reset: () => void;
  dispose: () => void;
}

const VS = 'varying vec3 vN;varying vec3 vW;void main(){vN=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
const FS = `uniform vec3 uCol;uniform vec3 uAcc;uniform float uHi;uniform float uT,uScan,uDim,uBeam,uLight;varying vec3 vN;varying vec3 vW;
void main(){vec3 n=normalize(vN);float d=max(dot(n,normalize(vec3(.35,.55,.75))),0.);float d2=max(dot(n,normalize(vec3(-.6,.2,.4))),0.)*.35;
float rim=pow(1.-abs(n.z),2.4);vec3 c=uCol*(.28+.72*d+d2);c=mix(c+uAcc*rim*.7,c*(1.-rim*.55),uLight);
float band=smoothstep(.05,0.,abs(vW.y-uScan));c+=mix(mix(uAcc,vec3(1.),.55),vec3(-.2,.25,.45),uLight)*band*.9*uBeam;
c*=.94+.06*sin(vW.y*260.+uT*3.)+.03*sin(uT*37.);
c=mix(c,mix(vec3(1.)*(.75+.25*sin(uT*6.)),vec3(0.,.55,.85),uLight),uHi*.6);gl_FragColor=vec4(c*uDim,1.);}`;

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Response(buf).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createAnatomyScene(o: AnatomySceneOptions): Promise<AnatomyScene> {
  const aborted = () => o.signal.aborted;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  let quality = o.quality;
  renderer.setPixelRatio(Math.min(quality, window.devicePixelRatio || 1));
  o.host.appendChild(renderer.domElement);
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.display = 'block';

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  pivot.add(inner);
  scene.add(pivot);

  const U = {
    t: { value: 0 },
    scan: { value: 0 },
    dim: { value: o.dim },
    beam: { value: o.beam ? 1 : 0 },
    light: { value: THEMES[o.theme].light },
    acc: { value: new THREE.Color(THEMES[o.theme].acc) },
  };
  const mk = (col: string, hi: number) =>
    new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uCol: { value: new THREE.Color(col) }, uHi: { value: hi }, uT: U.t, uScan: U.scan, uDim: U.dim, uBeam: U.beam, uLight: U.light, uAcc: U.acc },
    });
  const mats = SYSTEMS.map((s) => mk(s.color, 0));
  const matsHi = SYSTEMS.map((s) => mk(s.color, 1));

  const parts = o.meta.parts;
  const meshes: THREE.Mesh[] = [];
  const sel = new Set<number>();
  let visible = o.visible.slice();
  let iso = false;
  let spin = o.spin;
  let ex = 0;
  let yaw = 0.5;
  let pitch = 0.1;
  let dist = 3.4;
  let distG = 3.4;
  let base = 3.4;
  let focused = false;
  let ready = false;
  const center = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const disposables: Array<{ dispose: () => void }> = [renderer, ...mats, ...matsHi];

  /* decode the file and build the parts in small batches so the page stays responsive */
  const raw = await gunzip(o.mesh);
  if (aborted()) { renderer.dispose(); throw new DOMException('aborted', 'AbortError'); }
  const { P, I } = planar16(raw, o.meta.nP, o.meta.nI);
  const mn = [9, 9, 9];
  const mx = [-9, -9, -9];
  for (const p of parts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k]!, p[3][k]!); mx[k] = Math.max(mx[k]!, p[4][k]!); }
  center.set((mn[0]! + mx[0]!) / 2, (mn[1]! + mx[1]!) / 2, (mn[2]! + mx[2]!) / 2);
  inner.position.copy(center).multiplyScalar(-1);
  goal.copy(inner.position);

  let pv = 0;
  let iv = 0;
  let k = 0;
  await new Promise<void>((resolve, reject) => {
    const step = () => {
      if (aborted()) { reject(new DOMException('aborted', 'AbortError')); return; }
      const end = Math.min(parts.length, k + 40);
      for (; k < end; k++) {
        const part = parts[k]!;
        const { pos, idx } = partGeometry(P, I, part, pv, iv);
        pv += part[5] * 3;
        iv += part[6];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        disposables.push(g);
        const m = new THREE.Mesh(g, mats[part[1]]!);
        m.visible = !!visible[part[1]];
        m.userData = { k, s: part[1], c: new THREE.Vector3((part[3][0]! + part[4][0]!) / 2, (part[3][1]! + part[4][1]!) / 2, (part[3][2]! + part[4][2]!) / 2) };
        inner.add(m);
        meshes.push(m);
      }
      o.onProgress(k, parts.length);
      if (k < parts.length) setTimeout(step, 0);
      else resolve();
    };
    step();
  });

  /* rings under the feet */
  const rings = new THREE.Group();
  scene.add(rings);
  const ringY = mn[1]! - center.y;
  for (let r = 0.3; r < 1.3; r += 0.22) {
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 96; a++) pts.push(new THREE.Vector3(Math.cos((a / 96) * 6.2832) * r, ringY, Math.sin((a / 96) * 6.2832) * r));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 });
    disposables.push(geo, mat);
    rings.add(new THREE.LineLoop(geo, mat));
  }

  function applyTheme(key: ThemeKey) {
    const q = THEMES[key];
    U.light.value = q.light;
    U.acc.value.set(q.acc);
    rings.children.forEach((r, i) => {
      const mat = (r as THREE.LineLoop).material as THREE.LineBasicMaterial;
      mat.color.set(q.acc);
      mat.blending = q.light ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.opacity = q.light ? 0.6 - i * 0.08 : 0.55 - (0.3 + i * 0.22) * 0.3;
      mat.needsUpdate = true;
    });
  }
  applyTheme(o.theme);

  function fit() {
    const w = o.host.clientWidth;
    const h = o.host.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    base = Math.max(3.1, (1.95 / (2 * Math.tan((16 * Math.PI) / 180)) / Math.min(1, cam.aspect * 1.7)) * 1.12);
    if (!focused) distG = base;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(o.host);
  fit();
  dist = distG = base;

  function apply() {
    meshes.forEach((m, i) => { m.visible = !!visible[m.userData.s as number] && (!iso || sel.size === 0 || sel.has(i)); });
  }
  function bounds(): [number[], number[]] {
    const lo = [9, 9, 9];
    const hi = [-9, -9, -9];
    sel.forEach((i) => {
      const p = parts[i]!;
      const m = meshes[i]!;
      const off = [m.position.x, m.position.y, m.position.z];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p[3][a]! + off[a]!); hi[a] = Math.max(hi[a]!, p[4][a]! + off[a]!); }
    });
    return [lo, hi];
  }
  function setFocus(on: boolean) {
    focused = on && sel.size > 0;
    if (focused) {
      const [l, h] = bounds();
      goal.set(-(l[0]! + h[0]!) / 2, -(l[1]! + h[1]!) / 2, -(l[2]! + h[2]!) / 2);
      distG = Math.max(0.35, Math.min(base, Math.max(h[0]! - l[0]!, h[1]! - l[1]!, h[2]! - l[2]!) * 2.4 + 0.25));
    } else {
      goal.copy(center).multiplyScalar(-1);
      distG = base;
    }
  }

  /* turn, pinch, tap */
  const ptr = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pd = 0;
  const rc = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pd = Math.hypot(a!.x - b!.x, a!.y - b!.y); }
  };
  const onMove = (e: PointerEvent) => {
    const p = ptr.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptr.size === 1) {
      yaw += dx * 0.009;
      pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.006));
    } else if (ptr.size === 2) {
      const [a, b] = [...ptr.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pd) distG = Math.max(0.3, Math.min(8, (distG * pd) / d));
      pd = d;
    }
  };
  const onUp = (e: PointerEvent) => {
    const wasOne = ptr.size === 1;
    ptr.delete(e.pointerId);
    if (wasOne && moved < 8 && e.type === 'pointerup') {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, cam);
      const hit = rc.intersectObjects(meshes.filter((m) => m.visible), false)[0];
      o.onPick(hit ? meshes.indexOf(hit.object as THREE.Mesh) : -1);
    }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); distG = Math.max(0.3, Math.min(8, distG * (e.deltaY < 0 ? 0.92 : 1.08))); };
  const lost = (e: Event) => { e.preventDefault(); o.onContextLost(); };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('webglcontextlost', lost);

  /* frame loop */
  let raf = 0;
  let last = 0;
  let dead = false;
  const loop = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    const t = now / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (spin && !ptr.size) yaw += dt * 0.25;
    pivot.rotation.y = yaw;
    U.t.value = t;
    U.scan.value = -1 + ((t * 0.35) % 1.25) * 1.9;
    if (ready) {
      inner.position.lerp(goal, 0.14);
      dist += (distG - dist) * 0.14;
      rings.visible = !focused;
    }
    cam.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  };
  ready = true;
  raf = requestAnimationFrame(loop);

  return {
    setVisible(v) { visible = v.slice(); apply(); },
    highlight(ids) {
      sel.forEach((i) => { meshes[i]!.material = mats[meshes[i]!.userData.s as number]!; });
      sel.clear();
      ids.forEach((i) => { const m = meshes[i]; if (m) { sel.add(i); m.material = matsHi[m.userData.s as number]!; } });
      if (focused) setFocus(true);
      apply();
    },
    focus: setFocus,
    isolate(on) { iso = on; apply(); },
    setSpin(on) { spin = on; },
    setExplode(v) {
      ex = v;
      meshes.forEach((m) => m.position.copy(m.userData.c as THREE.Vector3).sub(center).multiplyScalar(ex * 1.3));
      if (focused) setFocus(true);
    },
    setBrightness(v) { U.dim.value = v; },
    setBeam(on) { U.beam.value = on ? 1 : 0; },
    setQuality(q) { quality = q; renderer.setPixelRatio(Math.min(q, window.devicePixelRatio || 1)); fit(); },
    setTheme: applyTheme,
    reset() {
      yaw = 0.5;
      pitch = 0.1;
      ex = 0;
      meshes.forEach((m) => m.position.set(0, 0, 0));
      sel.forEach((i) => { meshes[i]!.material = mats[meshes[i]!.userData.s as number]!; });
      sel.clear();
      iso = false;
      focused = false;
      goal.copy(center).multiplyScalar(-1);
      distG = base;
      apply();
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('webglcontextlost', lost);
      for (const d of disposables) d.dispose();
      el.remove();
    },
  };
}
