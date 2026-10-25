// The race viewer in 3D: the circuit, its scenery and sky, the race replayed with the game's own
// car models (each in its team's paint), tyre smoke and desert dust, brake and head lights, the
// start gantry counting down, three cameras (the TV camera on the pack, a chase camera behind
// the player's car, the whole circuit from above) and the podium. Same interface as the 2D
// RaceCanvas, which stays the fallback where there is no WebGL.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RACE_COUNTDOWN, RACE_TIME_SCALE, TRACK_BY_ID, type TrackId, type TrackTheme } from "@/game/config/racing";
import { pointAt, trackOf, type CarOnTrack, type Track } from "@/game/racing/tracks";
import type { RaceRecord } from "@/game/types";
import { isSaving, shouldDraw } from "@/lib/power";
import { carGeometry } from "../../map/world/scenery";
import { buildCar, loadHeroes } from "../../three/car-models";
import type { CameraMode } from "../race-canvas";
import { RaceReplay, type RaceCarView } from "../race-replay";
import { buildCircuit, type Circuit, type CircuitLook } from "./circuit";
import { buildDecor, type Decor } from "./decor";
import { GROUND, U, edgeDepth, farGround, groundMesh, groundTexture, heightOf, labelTexture, seaMesh, skyDome, type Height } from "./ground";

interface Look {
  circuit: CircuitLook;
  sky: [string, string];
  /** 0 day … 1 night. */
  night: number;
  sun: string;
  dust?: string;
}

/**
 * The finish-line shot: from this long before a car takes the flag until this long after (race
 * seconds), from this far past the line, this far out from the middle beyond the asphalt's edge
 * (the gantry's post stands at 0.55) and this high (m).
 */
const FLAG_SHOT = { before: 1.8, after: 0.9, past: 2.4, out: 0.3, high: 2.2 };
/** The TV camera's sides of the car: its usual one, a quarter turn either way, the opposite one. */
const TV_TURNS = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
const UP = new THREE.Vector3(0, 1, 0);

const KERB = { asphalt: "#3b414b", kerbA: "#dc2626", kerbB: "#f8fafc", gravel: "#d6c08c", shoulder: "#9ca3af", walls: false };
const LOOKS: Record<TrackTheme, Look> = {
  home: { circuit: KERB, sky: ["#4f9fe0", "#cfe9f7"], night: 0, sun: "#fff4e0" },
  industrial: { circuit: { ...KERB, shoulder: "#6b7280", gravel: "#a8a29e", walls: true }, sky: ["#7d9bb5", "#d9dee3"], night: 0.12, sun: "#fff1d6" },
  mountain: { circuit: { ...KERB, gravel: "#b9b2a4" }, sky: ["#3f8fd8", "#d6ecf7"], night: 0.05, sun: "#fff6e8" },
  coastal: { circuit: { ...KERB, gravel: "#f1dfa6" }, sky: ["#2f95e0", "#d4f0fb"], night: 0, sun: "#fff8e6" },
  desert: { circuit: { ...KERB, asphalt: "#4b4f57", gravel: "#c2a165", shoulder: "#e5cf9b", kerbB: "#fde68a" }, sky: ["#5aa0d8", "#f6e3bf"], night: 0.04, sun: "#ffefc9", dust: "#d6b478" },
  night: { circuit: { ...KERB, asphalt: "#2b3038", shoulder: "#475569", gravel: "#5b616b", walls: true }, sky: ["#050816", "#1e2747"], night: 0.9, sun: "#8aa4ff" },
  gp: { circuit: { ...KERB, kerbA: "#16a34a" }, sky: ["#4a9be0", "#d3ecf8"], night: 0, sun: "#fff4e0" },
  international: { circuit: { ...KERB, kerbA: "#2563eb" }, sky: ["#2d3d78", "#f2a76b"], night: 0.45, sun: "#ffc48a" },
};

interface CarRig {
  root: THREE.Group;
  body: THREE.Object3D;
  real: boolean;
  view: RaceCarView;
}

/** A soft round sprite (smoke, lights, shadows). */
function softDot(inner: string, outer: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** Smoke and dust: a pool of particles that rise, grow and fade. */
class Puffs {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private age: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private next = 0;
  constructor(
    private n: number,
    color: string,
  ) {
    this.pos = new Float32Array(n * 3).fill(-1e4);
    this.age = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aAge", new THREE.BufferAttribute(this.age, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot("rgba(255,255,255,1)", "rgba(255,255,255,0)") }, color: { value: new THREE.Color(color) }, scale: { value: 300 } },
      vertexShader: `attribute float aAge; attribute float aSize; uniform float scale; varying float vA;
        void main(){ vA = aAge; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (1.0 + aAge * 2.5) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * 0.32 * (1.0 - vA)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([(Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8], i * 3);
    this.age[i] = 0;
    this.size[i] = size;
  }
  update(dt: number, life: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / life);
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.age[i] >= 1) this.pos[i * 3 + 1] = -1e4;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
  setScale(pxPerUnit: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = pxPerUnit;
  }
}

export interface RaceSceneOptions {
  /** Low graphics (Settings): no shadows, less scenery, 1× resolution. */
  low: boolean;
}

/** Renders one race (or the circuit alone, before it) into a canvas, in 3D. */
export class RaceScene3D {
  mode: CameraMode = "iso";
  onFrame: ((cars: CarOnTrack[], views: RaceCarView[]) => void) | null = null;
  elapsed: () => number = () => 0;
  podium: RaceRecord | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4000);
  private world = new THREE.Group();
  private track: Track;
  private theme: TrackTheme;
  private look: Look;
  private H: Height;
  private circuit: Circuit;
  private decor: Decor;
  private replay: RaceReplay | null = null;
  private cars = new Map<string, CarRig>();
  private heroes = false;
  private puffs: Puffs;
  private brake: THREE.Points;
  private head: THREE.Points;
  private blobs: THREE.InstancedMesh;
  private marker: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private sea: { mesh: THREE.Mesh; tex: THREE.CanvasTexture } | null = null;
  private podiumScene: { group: THREE.Group; confetti: THREE.InstancedMesh; spin: { m: THREE.Object3D; y: number }[] } | null = null;
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private t = 0;
  private dpr = 1;
  private size = { w: 0, h: 0 };
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  private shadowTick = 0;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    trackId: TrackId,
    private rec: RaceRecord | null,
    private opt: RaceSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opt.low, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.track = trackOf(trackId);
    this.theme = TRACK_BY_ID[trackId].theme;
    this.look = LOOKS[this.theme];
    this.H = heightOf(this.track, this.theme);
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const night = this.look.night;
    const shadows = !opt.low && night < 0.7;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    // light and air
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.45 * (1 - night * 0.7);
    const L = this.track.layout;
    const R = Math.hypot(L.w, L.d) * U * 0.5;
    // the haze starts beyond the circuit and hides the land's far edge
    this.scene.fog = new THREE.Fog(this.look.sky[1], R * 2.2, R * 2.2 + 1600);
    this.scene.background = new THREE.Color(this.look.sky[1]);
    this.scene.add(skyDome(this.look.sky[0], this.look.sky[1], night));
    const hemi = new THREE.HemisphereLight(night > 0.5 ? "#6b7fc4" : "#cfe4f5", night > 0.5 ? "#1a1f2e" : "#4b5a3a", 0.85 - night * 0.5);
    this.sun = new THREE.DirectionalLight(this.look.sun, 2.3 * (1 - night * 0.8));
    const cx = (L.w / 2) * U;
    const cz = (L.d / 2) * U;
    this.sun.position.set(cx - R * 0.8, R * 1.2, cz - R * 0.5);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.castShadow = shadows;
    const sm = window.innerWidth < 700 ? 1536 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -R * 1.05;
    sc.right = sc.top = R * 1.05;
    sc.near = 1;
    sc.far = R * 4;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(hemi, this.sun, this.sun.target);

    // the place
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(GROUND[this.theme], aniso), roughness: 0.95 });
    this.world.add(groundMesh(this.track, this.H, groundMat, (L.hills ?? 0) > 0 || this.theme === "coastal"));
    this.world.add(farGround(this.track, groundMat, edgeDepth(this.track, this.theme)));
    this.circuit = buildCircuit(this.track, this.H, this.look.circuit, aniso, opt.low);
    this.world.add(this.circuit.root);
    this.decor = buildDecor(this.track, this.H, this.theme, aniso, opt.low, night);
    this.world.add(this.decor.root);
    if (this.theme === "coastal") {
      this.sea = seaMesh(this.track, aniso);
      this.world.add(this.sea.mesh);
    }
    // nothing on the island moves: fixed matrices
    this.world.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    this.world.updateMatrixWorld(true);
    // the scenery taller than a car's camera height is worth checking: stands, the pit building
    this.decor.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const box = new THREE.Box3().setFromObject(m);
      if (box.max.y - box.min.y >= 6) this.tall.push(m);
    });
    this.scene.add(this.world);

    // the cars' extras: shadows under them, brake and head lights, smoke, the player's marker
    const blobTex = softDot("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
    const blobGeo = new THREE.PlaneGeometry(6.2, 3.4);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), 16);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.scene.add(this.blobs);
    const glow = (color: string, size: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(32 * 3).fill(-1e4), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot(color, "rgba(0,0,0,0)"), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      p.frustumCulled = false;
      this.scene.add(p);
      return p;
    };
    this.brake = glow("rgba(255,40,30,1)", 1.4);
    this.head = glow("rgba(255,250,225,1)", night > 0.3 ? 2.6 : 0.01);
    this.puffs = new Puffs(opt.low ? 120 : 260, this.look.dust ?? "#e5e7eb");
    this.scene.add(this.puffs.points);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4), new THREE.MeshStandardMaterial({ color: "#f5c451", emissive: "#f5a524", emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.scene.add(this.marker);

    if (rec) this.replay = new RaceReplay(rec, this.track);
    // in development the scene on screen is reachable from the console (camera checks), as the map is
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __race: this, __THREE: THREE });
    void loadHeroes(THREE).then(() => {
      if (this.disposed) return;
      this.heroes = true;
      for (const rig of this.cars.values()) this.dress(rig);
    });
  }

  // ───────────────────────── interface (as RaceCanvas) ─────────────────────────

  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      if (!shouldDraw(now, this.lastDraw, this.opt.low)) return;
      this.lastDraw = now;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.t += dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stops drawing and frees the GPU (the viewer makes a new scene per race). */
  stop() {
    cancelAnimationFrame(this.raf);
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.keep) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (mat.userData.keep) continue;
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  configure(mode: CameraMode, podium: RaceRecord | null) {
    if (mode !== this.mode) this.cam.init = false;
    this.mode = mode;
    this.podium = podium;
  }

  setRace(rec: RaceRecord) {
    if (this.rec?.id === rec.id) return;
    this.rec = rec;
    this.replay = new RaceReplay(rec, this.track);
    for (const rig of this.cars.values()) this.scene.remove(rig.root);
    this.cars.clear();
  }

  // ───────────────────────── frame ─────────────────────────

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(this.opt.low ? 1 : isSaving() ? 1.25 : 2, window.devicePixelRatio || 1);
    if (w === this.size.w && h === this.size.h && dpr === this.dpr) return;
    this.size = { w, h };
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // the view offset follows the new size at the next frame
    this.lift = -1;
    this.puffs.setScale((h * dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  private frame(dt: number) {
    this.resize();
    if (this.podium) {
      this.drawPodium(dt);
      return;
    }
    if (this.podiumScene) this.podiumScene.group.visible = false;
    this.world.visible = true;
    const elapsed = this.elapsed();
    const fr = this.replay ? this.replay.frame(elapsed) : null;
    const views = fr?.views ?? [];
    const cars = fr?.cars ?? [];
    this.onFrame?.(cars, views);
    this.placeCars(views, dt);
    this.startLights(elapsed);
    this.decor.animate(this.t);
    if (this.sea) {
      this.sea.tex.offset.x = (this.sea.tex.offset.x + dt * 0.006) % 1;
      this.sea.tex.offset.y = (this.sea.tex.offset.y + dt * 0.003) % 1;
    }
    this.aim(views, cars, dt, elapsed);
    // the cars' shadows at 30 FPS: the shadow pass runs every other frame
    if (this.renderer.shadowMap.enabled && (this.shadowTick ^= 1)) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  /** The five lights: one more lit every fifth of the countdown, all out at the start. */
  private startLights(elapsed: number) {
    const on = this.rec && elapsed < RACE_COUNTDOWN ? Math.min(5, Math.floor((elapsed / RACE_COUNTDOWN) * 5) + 1) : 0;
    this.circuit.lamps.forEach((m, i) => {
      const k = i < on ? 3 : 0;
      if (m.emissiveIntensity !== k) m.emissiveIntensity = k;
    });
  }

  /** A car's body: the real model once the models have loaded, a simple shape until then. */
  private dress(rig: CarRig) {
    if (rig.real || !this.heroes) return;
    const v = rig.view;
    const car = buildCar(THREE, { model: v.model, color: v.color, finish: "gloss", build: { ...v.build, color: v.build?.color ?? v.color } });
    if (!car.children.length) return;
    rig.root.remove(rig.body);
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = !this.opt.low;
    });
    rig.root.add(car);
    rig.body = car;
    rig.real = true;
  }

  private rig(v: RaceCarView): CarRig {
    let rig = this.cars.get(v.id);
    if (rig) {
      rig.view = v;
      return rig;
    }
    const root = new THREE.Group();
    const body = new THREE.Mesh(carGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, color: v.color, roughness: 0.35, metalness: 0.35 }));
    body.scale.setScalar(8);
    root.add(body);
    this.scene.add(root);
    rig = { root, body, real: false, view: v };
    this.cars.set(v.id, rig);
    this.dress(rig);
    return rig;
  }

  private placeCars(views: RaceCarView[], dt: number) {
    const H = this.H;
    const surf = this.circuit.surface;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const brakes: number[] = [];
    const heads: number[] = [];
    let b = 0;
    for (const v of views) {
      const rig = this.rig(v);
      const x = v.x * U;
      const z = v.y * U;
      const fx = Math.cos(v.yaw);
      const fz = Math.sin(v.yaw);
      // stands on the ground: pitched by the slope under it
      const h = H(v.x, v.y) + surf;
      const hf = H(v.x + fx * 0.2, v.y + fz * 0.2);
      const hb = H(v.x - fx * 0.2, v.y - fz * 0.2);
      const pitch = Math.atan2(hf - hb, 4);
      rig.root.position.set(x, h, z);
      e.set(0, -v.yaw, pitch, "YXZ");
      rig.root.quaternion.setFromEuler(e);
      rig.root.visible = v.alpha > 0.08;
      if (!rig.root.visible) continue;
      m4.compose(new THREE.Vector3(x, h - surf + 0.14, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -v.yaw), new THREE.Vector3(1, 1, 1));
      this.blobs.setMatrixAt(b++, m4);
      // brake lights at the tail, head lights at the nose
      const sx = -fz;
      const sz = fx;
      if (v.braking) for (const side of [-0.75, 0.75]) brakes.push(x - fx * 2.25 + sx * side, h + 0.8, z - fz * 2.25 + sz * side);
      if (this.look.night > 0.3) for (const side of [-0.7, 0.7]) heads.push(x + fx * 2.3 + sx * side, h + 0.65, z + fz * 2.3 + sz * side);
      // smoke when sliding through a corner under braking; dust in the desert
      const slide = v.braking && v.steer !== 0;
      const dusty = !!this.look.dust;
      if ((slide && Math.random() < 0.6) || (dusty && Math.random() < dt * 14)) this.puffs.emit(x - fx * 2.2 + (Math.random() - 0.5), h + 0.3, z - fz * 2.2 + (Math.random() - 0.5), dusty ? 3.0 : 1.9);
      if (v.id === "player") {
        // behind the car (follow) it is the one in front of the camera: no marker over it
        this.marker.visible = this.mode !== "follow";
        this.marker.position.set(x, h + 3.6 + Math.sin(this.t * 3) * 0.25, z);
        this.marker.rotation.y += dt * 2;
      }
    }
    if (!views.some((v) => v.id === "player")) this.marker.visible = false;
    this.blobs.count = b;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.setPoints(this.brake, brakes);
    this.setPoints(this.head, heads);
    this.puffs.update(dt, this.look.dust ? 1.6 : 1.1);
  }

  private setPoints(p: THREE.Points, xyz: number[]) {
    const a = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    arr.fill(-1e4);
    arr.set(xyz.slice(0, arr.length));
    a.needsUpdate = true;
  }

  // ───────────────────────── cameras ─────────────────────────

  private aim(views: RaceCarView[], cars: CarOnTrack[], dt: number, elapsed: number) {
    const L = this.track.layout;
    const R = Math.hypot(L.w, L.d) * U * 0.5;
    const centre = new THREE.Vector3((L.w / 2) * U, 0, (L.d / 2) * U);
    const me = views.find((v) => v.id === "player");
    const at = (v: RaceCarView) => new THREE.Vector3(v.x * U, this.H(v.x, v.y), v.y * U);
    // how much the screen shows across and up (a phone held upright is narrow: the app is portrait)
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanV * this.camera.aspect;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let k = Math.min(1, dt * 2.5);
    /** How fast the eye follows (the camera's position glides at `k`). */
    let kLook: number | undefined;
    if (this.mode === "overhead" || !me) {
      // the whole circuit; before a race it turns slowly round. On a narrow screen it looks
      // along the circuit's long side (and only sways), from as far as it takes to fit it all.
      const narrow = this.camera.aspect < 1;
      const along = L.w >= L.d ? Math.PI / 2 : 0;
      const a = narrow ? along + (this.rec ? 0 : Math.sin(this.t * 0.25) * 0.18) : this.rec ? 0.6 : 0.6 + this.t * 0.05;
      const hx = (L.w / 2) * U * 1.08;
      const hz = (L.d / 2) * U * 1.08;
      const across = Math.abs(Math.cos(a)) * hx + Math.abs(Math.sin(a)) * hz;
      const deep = Math.abs(Math.sin(a)) * hx + Math.abs(Math.cos(a)) * hz;
      const dir = new THREE.Vector3(Math.sin(a) * 0.85, 1.05, Math.cos(a) * 0.85).normalize();
      const D = Math.max(R * 1.351, across / tanH, (deep * dir.y) / tanV);
      pos = centre.clone().addScaledVector(dir, D);
      look = centre.clone().setY(-R * 0.05);
    } else if (this.mode === "follow") {
      const p = at(me);
      const f = new THREE.Vector3(Math.cos(me.yaw), 0, Math.sin(me.yaw));
      pos = p.clone().addScaledVector(f, -12).setY(p.y + 4.6);
      look = p.clone().addScaledVector(f, 9).setY(p.y + 1.2);
      k = Math.min(1, dt * 4.5);
    } else {
      // the TV camera: high to one side of the pack, between the player and the leader on a
      // wide screen; on a narrow one there is no room for both, and it keeps to the player
      const lead = [...cars].sort((a, b) => b.s - a.s)[0];
      const lv = views.find((v) => v.id === lead?.id) ?? me;
      const w = Math.max(0, Math.min(1, (this.camera.aspect - 0.8) / 0.6)) / 3;
      const p = at(me).lerp(at(lv), w);
      const spread = Math.min(90, at(me).distanceTo(at(lv)));
      const d = 46 + spread * 0.7 * w * 3;
      // a grandstand or the pit building between it and the player's car: it goes round to another side
      const off = (turn: number) => new THREE.Vector3(-d * 0.62, d * 0.72, -d * 0.48).applyAxisAngle(UP, TV_TURNS[turn]);
      if (this.t - this.tv.at > 0.3) {
        this.tv.at = this.t;
        const car = at(me).add(new THREE.Vector3(0, 1, 0));
        const clear = (turn: number) => !this.hidden(p.clone().add(off(turn)), car);
        if (!clear(this.tv.turn)) {
          const free = TV_TURNS.findIndex((_, i) => i !== this.tv.turn && clear(i));
          if (free >= 0) this.tv.turn = free;
        }
      }
      pos = p.clone().add(off(this.tv.turn));
      look = p;
      // a narrow picture has no room for the camera to lag behind a fast car: it keeps its eye
      // on the car (only its position glides)
      if (w === 0) kLook = Math.min(1, dt * 12);
    }
    // the winner, then the player, about to take the flag: a cut to the line, low by the track,
    // a moment before (a cut both ways: a camera flying down to the line looked lost on the way).
    // It stands past the line on the track's edge, inside the gantry's post (which hid the cars
    // from just outside it), and turns with the car taking the flag.
    const rec = this.rec;
    let shot: string | null = null;
    if (rec && this.mode !== "overhead") {
      // both close together (the player just behind the winner): the one still to cross
      const due = [rec.order[0], "player"]
        .map((id) => {
          const e = rec.entrants.find((x) => x.id === id);
          return { id, flag: e ? RACE_COUNTDOWN + e.total / RACE_TIME_SCALE : -1 };
        })
        .filter((c) => c.flag > 0 && elapsed > c.flag - FLAG_SHOT.before && elapsed < c.flag + FLAG_SHOT.after);
      shot = (due.find((c) => elapsed < c.flag) ?? due[0])?.id ?? null;
      const car = shot ? views.find((v) => v.id === shot) : undefined;
      if (car) {
        const side = pointAt(this.track, this.track.startS + FLAG_SHOT.past, L.width / 2 + FLAG_SHOT.out);
        pos = new THREE.Vector3(side.x * U, this.H(side.x, side.y) + FLAG_SHOT.high, side.y * U);
        look = at(car).add(new THREE.Vector3(0, 0.9, 0));
        k = 1;
        kLook = Math.min(1, dt * 10);
      } else shot = null;
    }
    if (shot !== this.shot) {
      this.shot = shot;
      this.cam.init = false;
    }
    if (!this.cam.init) {
      this.cam.pos.copy(pos);
      this.cam.look.copy(look);
      this.cam.init = true;
    }
    this.cam.pos.lerp(pos, k);
    this.cam.look.lerp(look, kLook ?? k);
    this.camera.position.copy(this.cam.pos);
    this.camera.lookAt(this.cam.look);
    // before the race the panel of entrants covers the lower half: the circuit shows above it
    this.setLift(this.rec ? 0 : 0.24);
  }
  private lift = -1;
  /** The finish-line shot on screen (whose flag), or null. */
  private shot: string | null = null;
  /** The TV camera's side of the car (TV_TURNS), and when it last looked for a clear view. */
  private tv = { turn: 0, at: -1 };
  /** Tall scenery (grandstands, the pit building and its tower) that can hide a car from the TV camera. */
  private tall: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();

  /** Whether tall scenery stands between `from` and `to`. */
  private hidden(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = to.clone().sub(from);
    const far = dir.length() - 2;
    if (far <= 0) return false;
    this.ray.set(from, dir.normalize());
    this.ray.far = far;
    return this.ray.intersectObjects(this.tall, false).length > 0;
  }

  /** Moves the picture up by a share of the screen (a panel covers the lower part). */
  private setLift(lift: number) {
    if (lift === this.lift) return;
    this.lift = lift;
    const { w, h } = this.size;
    if (lift) this.camera.setViewOffset(w, h, 0, h * lift, w, h);
    else this.camera.clearViewOffset();
  }

  // ───────────────────────── podium ─────────────────────────

  private drawPodium(dt: number) {
    const rec = this.podium!;
    if (!this.podiumScene || this.podiumScene.group.userData.race !== rec.id) this.buildPodium(rec);
    const ps = this.podiumScene!;
    // the podium stands on the straight: the circuit stays, the race cars leave it
    for (const rig of this.cars.values()) rig.root.visible = false;
    this.marker.visible = false;
    this.blobs.count = 0;
    this.setPoints(this.brake, []);
    this.setPoints(this.head, []);
    ps.group.visible = true;
    // the cars rise onto their steps, the confetti falls
    for (const s of ps.spin) s.m.rotation.y += dt * 0.35;
    const m4 = new THREE.Matrix4();
    const n = ps.confetti.count;
    for (let i = 0; i < n; i++) {
      const ph = (this.t * 0.18 + i * 0.0617) % 1;
      const x = Math.sin(i * 7.7 + this.t * 0.6) * 9 + ((i * 37) % 18) - 9;
      const y = 22 - ph * 22;
      const z = Math.cos(i * 3.1) * 6;
      m4.makeRotationFromEuler(new THREE.Euler(this.t * 3 + i, this.t * 2 + i * 0.5, 0));
      m4.setPosition(x, y, z);
      ps.confetti.setMatrixAt(i, m4);
    }
    ps.confetti.instanceMatrix.needsUpdate = true;
    // from the pit side, the stand full of people behind the podium, swaying gently. A narrow
    // screen needs to be far back for all three steps: from there it looks down over the pit
    // building and its control tower, and the podium sits above the results covering the lower half.
    ps.group.updateMatrixWorld(true);
    const narrow = this.camera.aspect < 1;
    const a = Math.sin(this.t * 0.3) * (narrow ? 0.3 : 0.55);
    if (narrow) {
      const d = 10 / (Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
      const up = Math.PI / 4;
      this.setLift(0.22);
      this.camera.position.copy(ps.group.localToWorld(new THREE.Vector3(Math.sin(a) * d * Math.cos(up), 3 + d * Math.sin(up), Math.cos(a) * d * Math.cos(up))));
    } else {
      this.setLift(0);
      this.camera.position.copy(ps.group.localToWorld(new THREE.Vector3(Math.sin(a) * 15, 6.5, Math.cos(a) * 15)));
    }
    this.camera.lookAt(ps.group.localToWorld(new THREE.Vector3(0, 3, 0)));
    this.cam.init = false;
    this.renderer.render(this.scene, this.camera);
  }

  private buildPodium(rec: RaceRecord) {
    if (this.podiumScene) {
      this.scene.remove(this.podiumScene.group);
      this.podiumScene.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const g = new THREE.Group();
    g.userData.race = rec.id;
    // on the main straight at the line, its back (−z) to the grandstand, its steps toward the pits
    // (30 m past the line: clear of the start gantry)
    const p = pointAt(this.track, this.track.startS + 3, 0);
    g.position.set(p.x * U, this.H(p.x, p.y) + this.circuit.surface, p.y * U);
    g.rotation.y = -p.yaw;
    const step = (x: number, h: number, color: string, n: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.2, h, 5.2), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 }));
      m.position.set(x, h / 2, 0);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: labelTexture(String(n), "rgba(0,0,0,0)", "#ffffff", 128, 96, "900 80px system-ui, sans-serif"), transparent: true }));
      num.position.set(x, h * 0.55, 2.61);
      g.add(num);
    };
    step(0, 3.2, "#facc15", 1);
    step(-5.6, 2.1, "#cbd5e1", 2);
    step(5.6, 1.3, "#d97706", 3);
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), new THREE.MeshStandardMaterial({ map: labelTexture("🏆  PODIUM", "#0f172a", "#facc15", 1024, 256, "900 150px system-ui, sans-serif"), roughness: 0.8 }));
    backdrop.position.set(0, 6, -6);
    g.add(backdrop);
    const spin: { m: THREE.Object3D; y: number }[] = [];
    const tops = [3.2, 2.1, 1.3];
    const xs = [0, -5.6, 5.6];
    rec.order.slice(0, 3).forEach((id, i) => {
      const e = rec.entrants.find((x) => x.id === id);
      if (!e) return;
      const rig = this.cars.get(id);
      const model = rig?.view.model ?? "sports";
      const color = e.color;
      const car = this.heroes ? buildCar(THREE, { model, color, finish: "gloss", build: { color, ...(id === "player" && e.wing !== "none" ? { wing: e.wing } : {}) } }) : new THREE.Mesh(carGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, color }));
      if (!this.heroes) car.scale.setScalar(8);
      car.position.set(xs[i], tops[i], 0);
      car.rotation.y = Math.PI * 0.75;
      car.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      g.add(car);
      spin.push({ m: car, y: tops[i] });
    });
    const cols = ["#facc15", "#ef4444", "#22c55e", "#3b82f6", "#f8fafc", "#ec4899"];
    const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.16), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 160);
    for (let i = 0; i < 160; i++) confetti.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    confetti.frustumCulled = false;
    // the confetti belongs to the podium (its frame): hidden with it
    g.add(confetti);
    this.scene.add(g);
    this.podiumScene = { group: g, confetti, spin };
  }
}
