// Runs the Empire Map in 3D: the island (terrain, sea, scenery), the
// player's lots, the traffic and the race cars, a camera that pans, pinches,
// twists and flies, taps turned into selections, labels over the lots and
// the HTML cards pinned over the districts. React feeds it the game state
// and listens to its callbacks; it loads its world files on its own.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DEPOT, MARKET, RACING_AREA, STARTER_PLOT, WORLD_MAP, type Plot } from "@/game/city/layout";
import { SPEC_BY_ID, STRUCTURE_BY_ID, ZONES, type TerritoryId } from "@/game/config/city";
import { COMPONENT_BY_ID } from "@/game/config/chain";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { plotStatus, type PlotStatus } from "@/game/engine/construction";
import type { EconomySnapshot } from "@/game/engine/economy";
import { unlockedAreas } from "@/game/engine/territory";
import type { ComponentId, GameState, StructureType, ZoneId } from "@/game/types";
import { skyAt, type TimeMode } from "../lighting";
import type { MapArea, MapNames, MapTarget, ShipView, Site, ZoomTier } from "../map-types";
import type { CarModel } from "../vehicles";
import { LOCK, mapMaterials, type MapMaterials } from "./kit";
import { banner, pop, tag } from "./labels";
import { PlotLayer, plotViews, type PlotView } from "./plots";
import { RaceCars } from "./race";
import { buildRoads } from "./roads";
import { Scenery } from "./scenery";
import { Ground, NTX, NTY, buildTerrain, type TerrainParts, type WorldJson } from "./terrain";
import { Traffic3D } from "./traffic";

export { ZOOM_TIERS, type ZoomTier } from "../map-types";

/** Camera distance (world units) at zoom 1: about ten lots across. */
const DIST1 = 30;
/** Zoom of each tier ("region" is the minimum zoom, "buildings" the default zoom). */
const TIER_ZOOM = { region: 0, districts: 0.42, buildings: 1, detail: 2.6 };
/** Below this zoom the district names are shown over the map. */
const LABEL_ZOOM = 0.55;
const FOV = 40;
/** Game area ids in the order of the areas raster (id = index + 1; 0 = sea). */
const AREA_IDS = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global", "mountain", "port", "raw", "suburbs", "boulevard", "airport", "campus", "racing"];
const ZONE_IDS = new Set<string>(ZONES.map((z) => z.id));

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * The camera: a point on the ground it looks at, a zoom (camera distance
 * DIST1 / zoom), and a heading. Far out it looks almost straight down; close
 * in it tilts toward the horizon.
 */
export class CameraRig {
  x = 0;
  z = 0;
  zoom = 1;
  /** Heading: 0 looks north. */
  az = 0;
  minZoom = 0.08;
  maxZoom = 4;
  private flight: { x0: number; z0: number; l0: number; x1: number; z1: number; l1: number; t: number; dur: number } | null = null;
  /** Pan velocity (world units/s) carried on after a drag. */
  vx = 0;
  vz = 0;

  constructor(private half: [number, number]) {}

  /** The map's y is the scene's z. */
  get y() {
    return this.z;
  }

  get dist() {
    return DIST1 / this.zoom;
  }

  /** Angle of the camera from the vertical. */
  get polar() {
    return 0.3 + 0.62 * smoothstep(Math.log(0.12), Math.log(1.6), Math.log(this.zoom));
  }

  flyTo(x: number, y: number, zoom: number, dur = 0.6) {
    zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.vx = this.vz = 0;
    if (dur <= 0) {
      this.x = x;
      this.z = y;
      this.zoom = zoom;
      this.flight = null;
      this.clamp();
      return;
    }
    this.flight = { x0: this.x, z0: this.z, l0: Math.log(this.zoom), x1: x, z1: y, l1: Math.log(zoom), t: 0, dur };
  }

  stop() {
    this.flight = null;
    this.vx = this.vz = 0;
  }

  get flying() {
    return this.flight !== null;
  }

  update(dt: number) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const k = ease(Math.min(1, f.t / f.dur));
      this.x = f.x0 + (f.x1 - f.x0) * k;
      this.z = f.z0 + (f.z1 - f.z0) * k;
      this.zoom = Math.exp(f.l0 + (f.l1 - f.l0) * k);
      if (f.t >= f.dur) this.flight = null;
    } else if (Math.abs(this.vx) + Math.abs(this.vz) > 1e-3) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const d = Math.exp(-dt * 5);
      this.vx *= d;
      this.vz *= d;
    }
    this.clamp();
  }

  clamp() {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.x = Math.max(-this.half[0], Math.min(this.half[0], this.x));
    this.z = Math.max(-this.half[1], Math.min(this.half[1], this.z));
  }
}

interface Pop {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
}

interface Live {
  state: GameState;
  snap: EconomySnapshot;
}

export interface EngineOptions {
  /** Where the world files are served (the site's base path). */
  base: string;
  low: boolean;
}

export class MapEngine {
  readonly cam: CameraRig;
  /** Resolves once the world is loaded and drawn. */
  readonly ready: Promise<void>;
  money: (n: number) => string = (n) => `$${Math.round(n)}`;
  /** Container whose [data-zone] children are pinned over the areas (lock cards, names). */
  overlay: HTMLElement | null = null;
  /** Day, evening, night or the automatic cycle. */
  timeMode: TimeMode = "auto";
  /** The game state and economy now (labels, sites, race cars read it every frame). */
  live: () => Live | null = () => null;
  names: MapNames | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 2000);
  private sun = new THREE.DirectionalLight("#fff3df", 2.6);
  private hemi = new THREE.HemisphereLight("#d6ecff", "#6f7d5c", 1.15);
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private maxDpr = 2;
  private low: boolean;
  private skip = 0;
  private slow = { frames: 0, time: 0 };
  private lastAdaptiveAt = 0;

  private ground: Ground | null = null;
  private terrain: TerrainParts | null = null;
  private scenery: Scenery | null = null;
  private plots: PlotLayer | null = null;
  readonly traffic: TrafficFacade;
  private trafficLayer: Traffic3D | null = null;
  private race: RaceCars | null = null;
  private mats: MapMaterials | null = null;
  private glows: THREE.Points | null = null;
  private roadMarks: THREE.Group | null = null;
  private areaIds: Uint8Array | null = null;
  private areaSize: [number, number] = [1, 1];
  private lockTex: THREE.DataTexture | null = null;
  private lockKey = "";

  private unlocked: Set<string> = new Set(["town"]);
  private views: Map<string, PlotView> | null = null;
  private _selected: string | null = null;
  private _buildInfo: Map<string, PlotStatus> | null = null;
  private _preview: { plot: string; type: StructureType } | null = null;

  private pops: Pop[] = [];
  private banners: { plot: Plot; text: string; age: number }[] = [];
  private earners: { plot: Plot; perSec: number; acc: number; every: number }[] = [];
  private followUntil = 0;
  private tracked: { ref: object } | null = null;
  private raf = 0;
  private last = 0;
  private t = 0;
  private lastLabelsAt = -Infinity;
  private running = false;
  private ro: ResizeObserver;
  private ty = 0;
  private cameraDirty = true;
  private lastCamera = { x: NaN, z: NaN, zoom: NaN, az: NaN, ty: NaN };
  private detach: () => void;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private labels: HTMLCanvasElement,
    private onTap: (t: MapTarget) => void,
    private opt: EngineOptions,
  ) {
    this.low = opt.low;
    this.cam = new CameraRig([WORLD_MAP.size[0] / 2, WORLD_MAP.size[1] / 2]);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.ctx = labels.getContext("2d")!;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color("#bfe3f7");
    this.scene.fog = new THREE.Fog("#bfe3f7", 400, 1600);
    this.sun.castShadow = true;
    const sm = this.low ? 1024 : window.innerWidth < 700 ? 1536 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.camera);
    this.traffic = new TrafficFacade(() => this.trafficLayer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.home(0);
    this.detach = this.attachControls();
    this.ready = this.load();
    this.ready.catch((e) => console.error("map: could not load the world", e));
  }

  // ───────────────────────── loading ─────────────────────────

  private async load() {
    const base = `${this.opt.base}/world`;
    const [data, heights, areas] = await Promise.all([
      fetch(`${base}/world.json`).then((r) => r.json() as Promise<WorldJson>),
      fetch(`${base}/heights.bin`).then((r) => r.arrayBuffer()),
      loadImage(`${base}/areas.png`),
    ]);
    if (this.destroyed) return;
    const loader = new THREE.TextureLoader();
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tiles = await Promise.all(
      Array.from({ length: NTX * NTY }, (_, i) =>
        loader.loadAsync(`${base}/t/${i % NTX}_${Math.floor(i / NTX)}.webp`).then((loaded) => {
          let tex: THREE.Texture = loaded;
          // phones in battery-saver mode get half-size ground textures
          const img = loaded.image as HTMLImageElement;
          if (this.low && img.width > 1024) {
            const cv = document.createElement("canvas");
            cv.width = cv.height = 1024;
            cv.getContext("2d")!.drawImage(img, 0, 0, 1024, 1024);
            loaded.dispose();
            tex = new THREE.CanvasTexture(cv);
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = aniso;
          return tex;
        }),
      ),
    );
    if (this.destroyed) return;
    // the areas raster: which district or territory every spot belongs to
    const cv = document.createElement("canvas");
    cv.width = areas.width;
    cv.height = areas.height;
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(areas, 0, 0);
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    this.areaIds = new Uint8Array(cv.width * cv.height);
    for (let i = 0; i < this.areaIds.length; i++) this.areaIds[i] = px[i * 4];
    this.areaSize = [cv.width, cv.height];

    const ground = new Ground(data, heights);
    this.ground = ground;
    this.ty = ground.at(this.cam.x, this.cam.z);
    this.mats = mapMaterials(aniso);
    this.terrain = buildTerrain(ground, tiles);
    this.scene.add(...this.terrain.tiles, this.terrain.sea, this.terrain.floor);
    this.scenery = new Scenery(data, ground, this.mats, { low: this.low, lots: WORLD_MAP.plots.map((p) => ({ x: p.x, y: p.y, w: p.w, d: p.d, rot: p.rot })) });
    this.scene.add(this.scenery.root);
    const roads = buildRoads(data, ground, this.scenery.roads, aniso);
    this.roadMarks = roads.markings;
    this.scene.add(roads.root);
    this.glows = lampGlows(this.scenery.lamps);
    this.scene.add(this.glows);
    this.plots = new PlotLayer(ground);
    this.plots.onFinished = (plot, text) => this.banners.push({ plot, text, age: 0 });
    this.scene.add(this.plots.root);
    this.trafficLayer = new Traffic3D(ground, this.scenery.roads, this.mats.car);
    this.trafficLayer.density = this.low ? 0.5 : 1;
    this.trafficLayer.onArrive = (id) => this.pop(id, "🚗", "#93c5fd");
    this.scene.add(this.trafficLayer.root);
    this.race = new RaceCars(ground, this.mats.car);
    this.scene.add(this.race.mesh);
    this.traffic.flush();
    this.applyState();
    this.plots.setSelected(this._selected);
    this.plots.setBuildInfo(this._buildInfo);
    this.plots.setPreview(this._preview);
    // compile everything once, before the first frame
    this.place(0);
    if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
    else this.renderer.compile(this.scene, this.camera);
    if (!this.running) this.render(0);
  }

  // ───────────────────────── state ─────────────────────────

  /** New game state: lots, open roads and the locked-land haze follow it. */
  setState(state: GameState, names: MapNames) {
    this.names = names;
    this.views = plotViews(state, names);
    this.unlocked = unlockedAreas(state);
    this.applyState();
  }

  private applyState() {
    if (!this.plots || !this.views) return;
    this.plots.update(this.views, this.t);
    this.trafficLayer?.setOpen(this.unlocked);
    this.updateLock();
  }

  get selected() {
    return this._selected;
  }
  set selected(id: string | null) {
    this._selected = id;
    this.plots?.setSelected(id);
  }

  /** BUILD mode: every building plot coloured by its status. */
  get buildInfo() {
    return this._buildInfo;
  }
  set buildInfo(info: Map<string, PlotStatus> | null) {
    this._buildInfo = info;
    this.plots?.setBuildInfo(info);
  }

  /** A building being previewed on a plot before it is bought. */
  get preview() {
    return this._preview;
  }
  set preview(p: { plot: string; type: StructureType } | null) {
    this._preview = p;
    this.plots?.setPreview(p);
  }

  setEarners(earners: { plotId: string; perSec: number }[]) {
    const prev = new Map(this.earners.map((e) => [e.plot.id, e]));
    this.earners = earners
      .map(({ plotId, perSec }) => {
        const plot = WORLD_MAP.plotById[plotId];
        const old = prev.get(plotId);
        return plot ? { plot, perSec, acc: old?.acc ?? Math.random() * 2, every: old?.every ?? 2.2 + Math.random() * 1.6 } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }

  /** The locked-land haze: soft-edged, from the areas raster and what is open. */
  private updateLock() {
    const ids = this.areaIds;
    if (!ids) return;
    const key = [...this.unlocked].sort().join();
    if (key === this.lockKey) return;
    this.lockKey = key;
    const [W, H] = this.areaSize;
    const locked = AREA_IDS.map((a) => !this.unlocked.has(a));
    let a: Float32Array = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = ids[i] > 0 && locked[ids[i] - 1] ? 1 : 0;
    a = blur(blur(a, W, H, 3), W, H, 2);
    const data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(a[i] * 255);
    if (!this.lockTex) {
      this.lockTex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
      this.lockTex.magFilter = THREE.LinearFilter;
      this.lockTex.minFilter = THREE.LinearFilter;
    } else this.lockTex.image.data = data;
    this.lockTex.needsUpdate = true;
    LOCK.map = this.lockTex;
    LOCK.uniforms.uLockMap.value = this.lockTex;
    LOCK.uniforms.uLockOn.value = 1;
    LOCK.uniforms.uLockSize.value.set(WORLD_MAP.size[0], WORLD_MAP.size[1]);
  }

  /** The district or territory at a point of the map (null on the sea). */
  areaAt(x: number, z: number): string | null {
    const ids = this.areaIds;
    if (!ids) return null;
    const [W, H] = this.areaSize;
    const i = Math.floor((x / WORLD_MAP.size[0] + 0.5) * W);
    const j = Math.floor((z / WORLD_MAP.size[1] + 0.5) * H);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const id = ids[j * W + i];
    return id ? AREA_IDS[id - 1] : null;
  }

  // ───────────────────────── loop ─────────────────────────

  start() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // Browsers already throttle hidden tabs, but skipping the work entirely avoids
      // simulation, label projection and WebGL submission while the game is backgrounded.
      if (document.hidden) {
        this.last = now;
        return;
      }
      // battery saver: draw every other frame (~30 FPS)
      if (this.low && (this.skip ^= 1)) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
      this.adaptQuality(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setLowGraphics(on: boolean) {
    if (this.low === on) return;
    this.low = on;
    if (this.trafficLayer) this.trafficLayer.density = on ? 0.5 : 1;
    this.maxDpr = on ? 1 : 2;
    this.renderer.shadowMap.enabled = !on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.resize();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.detach();
    this.ro.disconnect();
    this.renderer.dispose();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.labels.width = Math.round(this.w * this.dpr);
    this.labels.height = Math.round(this.h * this.dpr);
    this.camera.aspect = this.w / this.h;
    // far out, the whole island fits on the screen
    const span = 2 * Math.tan(((FOV / 2) * Math.PI) / 180);
    const fit = Math.max(WORLD_MAP.size[0] / (span * this.camera.aspect), WORLD_MAP.size[1] / span) * 0.92;
    this.cam.minZoom = DIST1 / fit;
    this.cam.clamp();
    this.cameraDirty = true;
    if (!this.running) this.render(0);
  }

  /** Drops render resolution step by step while frames stay slow (< ~45 FPS). */
  private adaptQuality(dt: number) {
    if (this.low || this.dpr <= 1 || document.hidden) return;
    const s = this.slow;
    s.frames++;
    s.time += dt;
    if (s.frames < 120) return;
    const avg = s.time / s.frames;
    s.frames = 0;
    s.time = 0;
    const elapsed = performance.now() - this.lastAdaptiveAt;
    const deviceDpr = window.devicePixelRatio || 1;
    if (avg > 1 / 45 && this.dpr > 1 && elapsed > 5000) {
      this.lastAdaptiveAt = performance.now();
      this.maxDpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    } else if (avg < 1 / 58 && this.dpr < deviceDpr && elapsed > 12000) {
      // Recover one step only after sustained headroom; this prevents quality oscillation.
      this.lastAdaptiveAt = performance.now();
      this.maxDpr = Math.min(deviceDpr, this.dpr + 0.25);
      this.resize();
    }
  }

  /**
   * Puts the camera where the rig says (and the sun's shadow box around what
   * it sees). The level it looks at follows the ground over `dt` seconds
   * (0 snaps it there; a negative dt keeps it, so a drag stays steady).
   */
  private place(dt: number) {
    const c = this.cam;
    const g = this.ground;
    const want = g ? g.at(c.x, c.z) : 0;
    const nextTy = dt >= 0 ? this.ty + (want - this.ty) * (dt > 0 ? Math.min(1, dt * 4) : 1) : this.ty;
    if (Math.abs(nextTy - this.ty) > 1e-5) {
      this.ty = nextTy;
      this.cameraDirty = true;
    }
    const changed = this.cameraDirty || c.x !== this.lastCamera.x || c.z !== this.lastCamera.z || c.zoom !== this.lastCamera.zoom || c.az !== this.lastCamera.az || this.ty !== this.lastCamera.ty;
    if (!changed) return;
    const d = c.dist;
    const p = c.polar;
    const cx = c.x + Math.sin(p) * Math.sin(c.az) * d;
    const cz = c.z + Math.sin(p) * Math.cos(c.az) * d;
    let cy = this.ty + Math.cos(p) * d;
    if (g) cy = Math.max(cy, g.at(cx, cz) + 1.2);
    this.camera.position.set(cx, cy, cz);
    this.camera.near = Math.max(0.2, d * 0.03);
    this.camera.far = d * 5 + 600;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(c.x, this.ty, c.z);
    this.camera.updateMatrixWorld();
    // the shadow box follows the view; far out (a whole region in view) shadows fade
    // away and stop being redrawn, which saves the most work on phones
    const near = d < 110;
    // road lines only shimmer from far away
    if (this.roadMarks) this.roadMarks.visible = d < 150;
    this.renderer.shadowMap.autoUpdate = near;
    this.sun.shadow.intensity = smoothstep(110, 80, d);
    const ext = Math.max(10, Math.min(110, d * 1.1));
    const sh = this.sun.shadow.camera;
    sh.left = sh.bottom = -ext;
    sh.right = sh.top = ext;
    sh.near = 1;
    sh.far = ext * 4 + 200;
    sh.updateProjectionMatrix();
    this.sun.target.position.set(c.x, this.ty, c.z);
    this.sun.position.set(c.x - 0.45 * (ext * 2 + 60), this.ty + ext * 2 + 60, c.z - 0.3 * (ext * 2 + 60));
    this.lastCamera.x = c.x;
    this.lastCamera.z = c.z;
    this.lastCamera.zoom = c.zoom;
    this.lastCamera.az = c.az;
    this.lastCamera.ty = this.ty;
    this.cameraDirty = false;
  }

  private render(dt: number) {
    this.t += dt;
    const live = this.live();
    const cam = this.cam;
    cam.update(dt);

    // the first car rolling out, and the vehicle in the showroom
    const hero = this.trafficLayer?.hero;
    if (hero && this.t < this.followUntil && this.t > this.followUntil - 5.2) {
      const k = Math.min(1, dt * 2.5);
      cam.x += (hero.x - cam.x) * k;
      cam.z += (hero.z - cam.z) * k;
    }
    if (this.tracked) {
      const pos = this.trafficLayer?.positionOf(this.tracked.ref);
      if (!pos) this.tracked = null;
      else {
        cam.stop();
        const k = Math.min(1, dt * 3);
        // on phones the showroom card covers the lower half: keep the vehicle above it
        const lift = this.w < 768 ? cam.dist * 0.18 : 0;
        cam.x += (pos[0] + Math.sin(cam.az) * lift - cam.x) * k;
        cam.z += (pos[2] + Math.cos(cam.az) * lift - cam.z) * k;
        cam.zoom *= Math.pow(Math.min(cam.maxZoom, 3) / cam.zoom, Math.min(1, dt * 1.6));
        cam.clamp();
      }
    }
    this.place(dt);

    // time of day
    const sky = skyAt(this.timeMode, this.t);
    this.applySky(sky.dark);

    if (this.ground && live) {
      for (const e of this.earners) {
        e.acc += dt;
        if (e.acc >= e.every && e.perSec > 0) {
          this.pop(e.plot.id, `+${this.money(e.perSec * e.acc)}`);
          e.acc = 0;
        }
      }
      this.plots!.frame(this.t, live.state);
      this.trafficLayer!.update(dt);
      this.race!.update(live.state, this.t);
      this.scenery!.animate(dt, this.t);
      const waves = this.terrain!.waves;
      waves.offset.x = (waves.offset.x + dt * 0.004) % 1;
      waves.offset.y = (waves.offset.y + dt * 0.0025) % 1;
    }
    this.renderer.render(this.scene, this.camera);
    // HTML cards remain frame-accurate; the heavier canvas labels only need ~30 FPS.
    if (this.t - this.lastLabelsAt >= 1 / 30) {
      this.lastLabelsAt = this.t;
      this.drawLabels(dt, live);
    }
    this.placeCards();
  }

  private skyCol = new THREE.Color();
  private readonly skyDay = new THREE.Color("#bfe3f7");
  private readonly skyDusk = new THREE.Color("#f3c39b");
  private readonly skyNight = new THREE.Color("#0d1a33");
  private readonly sunWarm = new THREE.Color("#fff3df");
  private readonly sunNight = new THREE.Color("#ffb070");
  private readonly hemiDay = new THREE.Color("#d6ecff");
  private readonly hemiNight = new THREE.Color("#5d6fae");
  private applySky(dark: number) {
    const day = this.skyDay;
    const dusk = this.skyDusk;
    const night = this.skyNight;
    const c = this.skyCol;
    if (dark <= 0.5) c.copy(day).lerp(dusk, dark / 0.5);
    else c.copy(dusk).lerp(night, (dark - 0.5) / 0.5);
    (this.scene.background as THREE.Color).copy(c);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(c);
    const d = this.cam.dist;
    fog.near = d * 2.2 + 60;
    fog.far = d * 6 + 400;
    this.sun.intensity = 2.6 * (1 - dark * 0.9);
    this.sun.color.copy(this.sunWarm).lerp(this.sunNight, Math.min(1, dark * 1.4) * 0.6);
    this.hemi.intensity = 1.15 - dark * 0.8;
    this.hemi.color.copy(this.hemiDay).lerp(this.hemiNight, dark);
    this.scene.environmentIntensity = 0.55 * (1 - dark * 0.6);
    if (this.glows) {
      const k = smoothstep(0.55, 0.9, dark);
      (this.glows.material as THREE.PointsMaterial).opacity = k;
      this.glows.visible = k > 0.01;
    }
  }

  // ───────────────────────── labels ─────────────────────────

  private v3 = new THREE.Vector3();
  /** World point → CSS px on screen; null behind the camera. */
  private project(x: number, y: number, z: number): [number, number] | null {
    const v = this.v3.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }

  private onScreen(p: [number, number] | null, m = 60): p is [number, number] {
    return !!p && p[0] > -m && p[1] > -m && p[0] < this.w + m && p[1] < this.h + m;
  }

  private drawLabels(dt: number, live: Live | null) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const plots = this.plots;
    const names = this.names;
    if (!plots || !live || !names) return;
    const s = live.state;
    const zoom = this.cam.zoom;
    const anyCar = s.chain.firstCar || s.lifetime.carsProduced > 0;
    for (const lot of plots.lots.values()) {
      const plot = lot.plot;
      const isOpen = this.unlocked.has(plot.zone);
      if (!isOpen && plot.kind !== "racing") continue;
      const pos = lot.root.position;
      const top = this.project(pos.x, pos.y + lot.top + 0.12, pos.z);
      if (!this.onScreen(top)) continue;
      const [x, y] = top;
      const v = lot.view;
      if (!v) continue;
      const sel = this._selected === plot.id;
      switch (v.look.kind) {
        case "market":
        case "depot": {
          if (zoom < 0.5) break;
          const m = v.look.kind === "market";
          tag(c, m ? names.market : names.depot, x, y, { icon: m ? "💰" : "🏗️", bg: m ? "rgba(21,128,61,0.9)" : "rgba(146,64,14,0.9)" });
          break;
        }
        case "paddock":
          if (zoom >= 0.5 && v.look.open) tag(c, names.racing, x, y, { icon: "🏁", bg: "rgba(185,28,28,0.9)" });
          break;
        case "dealer": {
          if (zoom < 0.75) break;
          const id = plot.dealer!;
          const dl = s.dealers[id];
          if (dl?.owned) tag(c, `${names.dealer(id)} · ${names.level(dl.level)}`, x, y, { icon: DEALER_BY_ID[id].emoji });
          else if (anyCar) tag(c, names.money(DEALER_BY_ID[id].cost), x, y, { icon: "🏪", bg: "rgba(120,53,15,0.85)", fg: "#fde68a" });
          else if (zoom >= 0.9) tag(c, "🔒", x, y, { bg: "rgba(15,23,42,0.75)", size: 10 });
          break;
        }
        case "site": {
          const st = s.city.sites[plot.id];
          if (st && zoom >= 0.3) tag(c, `${Math.floor((st.t / st.dur) * 100)}%`, x, y, { icon: "🏗️", bg: "rgba(120,53,15,0.88)", fg: "#fde68a", size: 10 });
          break;
        }
        case "empty": {
          if (zoom < 0.38 || !plot.use) break;
          const st = plotStatus(s, plot.id);
          const bob = st === "available" ? Math.sin(this.t * 2.4 + lot.seed * 6) * 2 : 0;
          const bg = sel ? "rgba(245,158,11,0.95)" : st === "owned" ? "rgba(37,99,235,0.9)" : st === "available" ? "rgba(21,128,61,0.88)" : "rgba(30,41,59,0.75)";
          const mark = st === "owned" ? "🟦" : st === "locked" ? "🔒" : "+";
          tag(c, zoom >= 0.85 ? `${mark} ${names.structure(plot.use)}` : mark, x, y - bob, { icon: STRUCTURE_BY_ID[plot.use].emoji, bg, size: 9 });
          break;
        }
        case "plant": {
          if (zoom < 0.32) break;
          const b = s.city.buildings[plot.id];
          if (!b) break;
          tag(c, zoom < 0.9 ? names.level(b.level) : `${names.plant(plot.id)} · ${names.level(b.level)}`, x, y, { icon: STRUCTURE_BY_ID[b.type].emoji, bg: "rgba(15,23,42,0.85)" });
          const pl = b.plant;
          if (pl && pl.status !== "ok") {
            const icon = pl.status === "noParts" && pl.missing ? COMPONENT_BY_ID[pl.missing as ComponentId].emoji : pl.status === "noRaw" ? "🪨" : pl.status === "full" ? "📦" : "⚠️";
            tag(c, zoom < 0.6 ? "!" : `⚠️ ${icon}`, x + 22, y - 22 + Math.sin(this.t * 4) * 2, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
          }
          break;
        }
        case "garage": {
          if (zoom < 0.32) break;
          const b = s.city.buildings[plot.id];
          if (!b) break;
          const active = (live.snap.city.garages[plot.id]?.incomePerSec ?? 0) > 0;
          const no = b.garage?.no ?? 1;
          tag(c, zoom < 0.9 ? `#${String(no).padStart(2, "0")} · ${names.level(b.level)}` : `${names.garage(no)} · ${names.level(b.level)}`, x, y, { icon: SPEC_BY_ID[b.garage?.spec ?? "repair"].emoji, bg: active ? "rgba(29,78,216,0.9)" : "rgba(8,12,20,0.8)" });
          if (!active && zoom >= 0.5) tag(c, "!", x + 26, y - 22, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
          break;
        }
        case "structure":
          if (zoom >= 0.85) tag(c, names.level(v.look.level), x, y, { icon: STRUCTURE_BY_ID[v.look.type].emoji });
          break;
      }
      // an upgrade under way: its progress over the crane
      const w = v.works ? s.city.buildings[plot.id]?.works : undefined;
      if (w && zoom >= 0.3) tag(c, `${Math.floor((w.t / w.dur) * 100)}%`, x, y - 24, { icon: "⬆️", bg: "rgba(120,53,15,0.88)", fg: "#fde68a", size: 10 });
    }

    for (const p of this.pops) {
      p.age += dt;
      const k = p.age / 1.6;
      if (k >= 1) continue;
      const at = this.project(p.x, p.y, p.z);
      if (this.onScreen(at)) pop(c, p.text, p.color, at[0], at[1], k);
    }
    this.pops = this.pops.filter((q) => q.age < 1.6);

    for (const b of this.banners) {
      b.age += dt;
      const k = b.age / 2.6;
      const lot = plots.lots.get(b.plot.id);
      if (k >= 1 || !lot) continue;
      const at = this.project(lot.root.position.x, lot.root.position.y + lot.top + 0.6, lot.root.position.z);
      if (this.onScreen(at)) banner(c, b.text, at[0], at[1], k);
    }
    this.banners = this.banners.filter((b) => b.age < 2.6);
  }

  /**
   * HTML over the areas follows the camera: names (data-far: only from far
   * away, shrinking with the zoom), padlocks (data-fixed: always the same
   * size) and the card a padlock opens (data-anchor="above": over its
   * padlock, kept on the screen).
   */
  private placeCards() {
    const cards = this.overlay?.children ?? [];
    const k = Math.max(0.5, Math.min(1, this.cam.zoom * 2.4));
    for (const node of cards) {
      const el = node as HTMLElement;
      const id = el.dataset.zone as MapArea | undefined;
      if (!id) continue;
      const c = this.areaCenter(id);
      const p = this.project(c.x, this.ground ? this.ground.at(c.x, c.y) + 0.5 : 0.5, c.y);
      const far = el.dataset.far !== undefined;
      const above = el.dataset.anchor === "above";
      const off = !this.onScreen(p, above ? 0 : 200) || (far && this.cam.zoom > LABEL_ZOOM);
      el.style.visibility = off ? "hidden" : "visible";
      if (!p || off) continue;
      if (above) {
        // the card sits over its padlock, or under it when there is no room above
        const hw = el.offsetWidth / 2;
        const x = Math.max(hw + 8, Math.min(this.w - hw - 8, p[0]));
        const up = p[1] - el.offsetHeight - 26 > 8;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(p[1])}px) translate(-50%, ${up ? "calc(-100% - 22px)" : "22px"})`;
      } else {
        const s = el.dataset.fixed !== undefined ? 1 : k;
        el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      }
    }
  }

  private areaCenter(id: MapArea): { x: number; y: number } {
    if (id === "racing") {
      const p = RACING_AREA.paddock;
      return { x: p.x, y: p.y };
    }
    const a = WORLD_MAP.areas[(id.startsWith("t:") ? id.slice(2) : id) as ZoneId | TerritoryId];
    return a ? { x: a.c[0], y: a.c[1] } : { x: 0, y: 0 };
  }

  // ───────────────────────── effects ─────────────────────────

  pop(plotId: string, text: string, color = "#fde047") {
    const lot = this.plots?.lots.get(plotId);
    if (!lot) return;
    const p = lot.root.position;
    this.pops.push({ x: p.x, y: p.y + lot.top + 0.7, z: p.z, text, color, age: 0 });
    if (this.pops.length > 40) this.pops.shift();
  }

  /** Starts (or, with null, stops) following a vehicle with a close-up camera. */
  track(ref: object | null) {
    this.tracked = ref ? { ref } : null;
  }

  /** FIRST CAR COMPLETED: zoom in on the plant and follow the car as it rolls out. */
  celebrateFirstCar(plotId: string, model: CarModel, color: string, seconds = 6) {
    const plot = WORLD_MAP.plotById[plotId];
    if (!plot) return;
    this.traffic.rollOut({ id: plotId, entry: plot.entry, weight: 1 }, model, color);
    this.focusPlot(plotId, { x: 0, y: 0 }, 2.2, 0.9);
    this.followUntil = this.t + seconds;
  }

  // ───────────────────────── camera helpers ─────────────────────────

  defaultZoom() {
    return Math.max(0.85, Math.min(1.35, this.w / 1000 + 0.3));
  }

  /** World units per CSS pixel at the camera's target. */
  private unitsPerPx() {
    return (2 * this.cam.dist * Math.tan(((FOV / 2) * Math.PI) / 180)) / this.h;
  }

  /**
   * Flies to a plot. `offset` (screen px) keeps it clear of a panel covering
   * the right side or the bottom of the map.
   */
  focusPlot(id: string, offset: { x: number; y: number } = { x: 0, y: 0 }, zoom = Math.max(this.cam.zoom, 1.15), dur = 0.6) {
    const p = WORLD_MAP.plotById[id];
    if (!p) return;
    const z = Math.min(this.cam.maxZoom, zoom);
    const [ox, oz] = this.screenShift(offset, z);
    this.cam.flyTo(p.x + ox, p.y + oz, z, dur);
  }

  /** Half a panel's size in screen px, as a shift of the camera's target at a zoom. */
  private screenShift(offset: { x: number; y: number }, zoom: number): [number, number] {
    const upp = (2 * (DIST1 / zoom) * Math.tan(((FOV / 2) * Math.PI) / 180)) / this.h;
    const a = this.cam.az;
    // screen right and screen up, on the ground
    const rx = Math.cos(a);
    const rz = -Math.sin(a);
    const ux = -Math.sin(a);
    const uz = -Math.cos(a);
    const sx = (offset.x / 2) * upp;
    const sy = (-offset.y / 2) * upp;
    return [rx * sx + ux * sy, rz * sx + uz * sy];
  }

  focusZone(id: ZoneId, offset: { x: number; y: number } = { x: 0, y: 0 }) {
    const c = this.areaCenter(id);
    const z = Math.max(this.cam.minZoom, Math.min(this.cam.zoom, 0.6));
    const [ox, oz] = this.screenShift(offset, z);
    this.cam.flyTo(c.x + ox, c.y + oz, z, 0.8);
  }

  /** Centres the camera on a map position. */
  lookAt(x: number, y: number) {
    this.cam.flyTo(x, y, this.cam.zoom, 0.45);
  }

  /** The zoom tier the camera is in: the whole region, districts, buildings or factory detail. */
  zoomTier(): ZoomTier {
    const z = this.cam.zoom;
    return z < TIER_ZOOM.districts * 0.75 ? "region" : z < (TIER_ZOOM.districts + this.defaultZoom()) / 2 ? "districts" : z < 1.8 ? "buildings" : "detail";
  }

  /** Glides to a zoom tier, keeping the same spot in the middle. */
  setTier(tier: ZoomTier) {
    const z = tier === "region" ? this.cam.minZoom : tier === "buildings" ? this.defaultZoom() : TIER_ZOOM[tier];
    this.cam.flyTo(tier === "region" ? 0 : this.cam.x, tier === "region" ? 0 : this.cam.z, z, 0.7);
  }

  /** Flies to a district, a territory ("t:port") or the racing district, framing the whole area. */
  flyToArea(id: MapArea) {
    const c = this.areaCenter(id);
    let zoom = TIER_ZOOM.districts * 1.4;
    if (id !== "racing") {
      const a = WORLD_MAP.areas[(id.startsWith("t:") ? id.slice(2) : id) as ZoneId | TerritoryId];
      if (a) {
        const span = 2 * Math.tan(((FOV / 2) * Math.PI) / 180);
        const fit = Math.max((a.max[0] - a.min[0]) / (span * this.camera.aspect), (a.max[1] - a.min[1]) / span) * 1.15;
        zoom = Math.min(1, DIST1 / Math.max(10, fit));
      }
    }
    this.cam.flyTo(c.x, c.y, Math.max(this.cam.minZoom, zoom), 0.9);
  }

  zoomBy(f: number) {
    this.cam.flyTo(this.cam.x, this.cam.z, this.cam.zoom * f, 0.25);
  }

  /** Where the camera starts: the first plant, between the depot and the market. */
  home(dur = 0.7) {
    const ps = [STARTER_PLOT, DEPOT, MARKET].map((id) => WORLD_MAP.plotById[id]).filter(Boolean);
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const z = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    this.cam.flyTo(x, z, this.defaultZoom(), dur);
  }

  /** The part of the map in view (four ground points, for the minimap). */
  viewQuad(): [number, number][] {
    return [
      [0, 0],
      [this.w, 0],
      [this.w, this.h],
      [0, this.h],
    ].map(([px, py]) => {
      const p = this.onPlane(px, py, this.ty) ?? this.onPlane(px, Math.max(py, this.h * 0.3), this.ty);
      return p ? [p.x, p.z] : [this.cam.x, this.cam.z];
    });
  }

  // ───────────────────────── input ─────────────────────────

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private rayAt(px: number, py: number) {
    this.ndc.set((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray;
  }

  /** Where the ray through a screen point meets the level y. */
  private onPlane(px: number, py: number, y: number): THREE.Vector3 | null {
    const r = this.rayAt(px, py);
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (y - r.origin.y) / r.direction.y;
    if (t <= 0 || t > 1e5) return null;
    return r.origin.clone().addScaledVector(r.direction, t);
  }

  /** Where the ray through a screen point meets the ground (marching over the heights). */
  private onGround(px: number, py: number): THREE.Vector3 | null {
    const g = this.ground;
    if (!g) return this.onPlane(px, py, 0);
    const r = this.rayAt(px, py);
    const o = r.origin;
    const d = r.direction;
    let prev = 0;
    for (let t = 0, i = 0; i < 800 && t < this.camera.far; i++) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (y <= g.at(x, z)) {
        // refine between the last two steps
        let a = prev;
        let b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= g.at(o.x + d.x * m, o.z + d.z * m)) b = m;
          else a = m;
        }
        return o.clone().addScaledVector(d, b);
      }
      prev = t;
      t += Math.max(0.15, t * 0.01);
    }
    return null;
  }

  private pick(px: number, py: number): MapTarget {
    if (!this.plots) return null;
    // vehicles first: they drive in front of the buildings
    const tl = this.trafficLayer;
    if (tl) {
      const radius = Math.max(16, Math.min(34, 22 * this.cam.zoom));
      let best: MapTarget = null;
      let bestD = radius;
      for (const [x, y, z, v] of tl.pickables()) {
        const p = this.project(x, y, z);
        if (!p) continue;
        const d = Math.hypot(p[0] - px, p[1] - py);
        if (d < bestD) {
          bestD = d;
          best = { kind: "vehicle", v };
        }
      }
      if (best) return best;
    }
    const id = this.plots.pick(this.rayAt(px, py));
    if (id) {
      const plot = WORLD_MAP.plotById[id];
      if (plot && plot.kind !== "racing" && !this.unlocked.has(plot.zone)) return { kind: "zone", id: plot.zone };
      return { kind: "plot", id };
    }
    const hit = this.onGround(px, py);
    const area = hit ? this.areaAt(hit.x, hit.z) : null;
    if (area && ZONE_IDS.has(area) && !this.unlocked.has(area)) return { kind: "zone", id: area as ZoneId };
    return null;
  }

  private attachControls(): () => void {
    const el = this.canvas;
    const pts = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number; moved: boolean; button: number } | null = null;
    let lastMove = 0;
    let hoverAt = 0;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const userMoved = () => {
      this.cam.stop();
      this.tracked = null;
      this.followUntil = 0;
    };
    /** Shifts the camera so the ground under screen point a lands under b. */
    const drag = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const pa = this.onPlane(a.x, a.y, this.ty);
      const pb = this.onPlane(b.x, b.y, this.ty);
      if (!pa || !pb) return [0, 0];
      const dx = pa.x - pb.x;
      const dz = pa.z - pb.z;
      // never fling the camera across the map when a ray grazes the horizon
      const lim = this.cam.dist * 0.6;
      const k = Math.min(1, lim / Math.max(1e-6, Math.hypot(dx, dz)));
      this.cam.x += dx * k;
      this.cam.z += dz * k;
      this.cam.clamp();
      this.place(-1);
      return [dx * k, dz * k];
    };
    /** Zooms by f keeping the ground under screen point c in place. */
    const zoomAt = (c: { x: number; y: number }, f: number) => {
      const before = this.onPlane(c.x, c.y, this.ty);
      this.cam.zoom *= f;
      this.cam.clamp();
      this.place(-1);
      const after = this.onPlane(c.x, c.y, this.ty);
      if (before && after) {
        this.cam.x += before.x - after.x;
        this.cam.z += before.z - after.z;
        this.cam.clamp();
        this.place(-1);
      }
    };
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    let prevPair: ReturnType<typeof pair> | null = null;

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) down = { ...p, t: performance.now(), moved: false, button: e.button };
      else if (down) down.moved = true;
      if (pts.size === 2) prevPair = pair();
      this.cam.vx = this.cam.vz = 0;
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const old = pts.get(e.pointerId);
      if (!old) {
        // hovering with a mouse: a pointer over things that can be tapped
        if (e.pointerType === "mouse" && performance.now() - hoverAt > 90) {
          hoverAt = performance.now();
          el.style.cursor = this.pick(p.x, p.y) ? "pointer" : "grab";
        }
        return;
      }
      if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 7) {
        down.moved = true;
        userMoved();
      }
      if (!down?.moved) return;
      if (pts.size === 1) {
        if (down.button === 2 || e.ctrlKey || e.shiftKey) {
          // turn the view
          this.cam.az -= (p.x - old.x) * 0.006;
        } else {
          const now = performance.now();
          const [dx, dz] = drag(old, p);
          const dt = Math.max(0.008, (now - lastMove) / 1000);
          lastMove = now;
          this.cam.vx = this.cam.vx * 0.5 + (dx / dt) * 0.5;
          this.cam.vz = this.cam.vz * 0.5 + (dz / dt) * 0.5;
        }
        pts.set(e.pointerId, p);
      } else if (pts.size === 2) {
        pts.set(e.pointerId, p);
        const q = pair();
        if (prevPair) {
          drag({ x: prevPair.cx, y: prevPair.cy }, { x: q.cx, y: q.cy });
          if (prevPair.d > 10) zoomAt({ x: q.cx, y: q.cy }, q.d / prevPair.d);
          let da = q.ang - prevPair.ang;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          this.cam.az += da;
        }
        prevPair = q;
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = local(e);
      const was = pts.size;
      pts.delete(e.pointerId);
      if (pts.size < 2) prevPair = null;
      if (was === 1 && down && !down.moved && performance.now() - down.t < 600 && down.button !== 2) this.onTap(this.pick(p.x, p.y));
      if (performance.now() - lastMove > 80) this.cam.vx = this.cam.vz = 0;
      if (pts.size === 0) down = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved();
      zoomAt(local(e), Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
    };
    const onMenu = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onMenu);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onMenu);
    };
  }
}

/**
 * The traffic as the map component sees it: shipments and buyers can be
 * handed over before the world has loaded (they wait until it has).
 */
class TrafficFacade {
  private ships: ShipView[] | null = null;
  constructor(private layer: () => Traffic3D | null) {}

  setShipments(list: ShipView[]) {
    const l = this.layer();
    if (l) l.setShipments(list);
    else this.ships = list;
  }

  spawnBuyer(site: Site, model: CarModel) {
    this.layer()?.spawnBuyer(site, model);
  }

  rollOut(site: Site, model: CarModel, color: string) {
    this.layer()?.rollOut(site, model, color);
  }

  /** The world has loaded: hand over what arrived before. */
  flush() {
    if (this.ships) this.layer()?.setShipments(this.ships);
    this.ships = null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Box blur of a W×H field (one pass across, one down). */
function blur(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      acc += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / n;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/** Warm glows over the street lamps (shown at night). */
function lampGlows(lamps: [number, number, number, number][]) {
  const pos = new Float32Array(lamps.length * 3);
  lamps.forEach(([x, z, a, y], i) => {
    pos[3 * i] = x - 0.18 * Math.cos(a);
    pos[3 * i + 1] = y + 0.6;
    pos[3 * i + 2] = z + 0.18 * Math.sin(a);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,236,180,1)");
  grad.addColorStop(0.25, "rgba(255,214,140,0.6)");
  grad.addColorStop(1, "rgba(255,200,120,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.PointsMaterial({ map: tex, size: 1.1, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.visible = false;
  p.renderOrder = 5;
  return p;
}
