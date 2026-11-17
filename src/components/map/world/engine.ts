// Runs the Empire Map in 3D: the island (terrain, sea, scenery), the
// player's lots, the traffic and the race cars, a camera that pans, pinches,
// twists and flies, taps turned into selections, labels over the lots and
// the HTML cards pinned over the districts. React feeds it the game state
// and listens to its callbacks; it loads its world files on its own.
import * as THREE from "three";
import { diagFrame, registerDiagSource, type Quality } from "@/lib/diagnostics";
import { isSaving, shouldDraw } from "@/lib/power";
import { Governor, TIERS, profileLadder, type GraphicsProfile, type Step } from "../quality";
import { deviceFacts, textureBudget, type TextureBudget } from "@/lib/gpu-budget";
import { loadTile } from "./tiles";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DEPOT, MARKET, RACING_AREA, STARTER_PLOT, WORLD_MAP, type Plot } from "@/game/city/layout";
import { type TerritoryId } from "@/game/config/city";
import { seasonAt } from "@/game/engine/season";
import { type PlotStatus } from "@/game/engine/construction";
import type { EconomySnapshot } from "@/game/engine/economy";
import { unlockedAreas } from "@/game/engine/territory";
import type { GameState, StructureType, ZoneId } from "@/game/types";
import { skyAt, worldClock, type TimeMode } from "../lighting";
import { weatherAt, type Weather } from "../weather";
import type { MapArea, MapNames, MapTarget, ZoomTier } from "../map-types";
import type { CarModel } from "../vehicles";
import { LOCK, freezeStatic, mapMaterials, splitSharedMaterials, type MapMaterials } from "./kit";
import { PlotLayer, plotViews, type PlotView } from "./plots";
import { RaceCars } from "./race";
import { buildRoads } from "./roads";
import { roundabouts } from "./junctions";
import { Scenery, type BillboardAd } from "./scenery";
import type { CityLife } from "./city-life";
import { Ground, NTX, NTY, buildTerrain, type TerrainParts, type WorldJson } from "./terrain";
import { Traffic3D } from "./traffic";
import { Pedestrians } from "./pedestrians";
import { Signals } from "./signals";
import { Headlights, SignalLamps } from "./street-lights";
import { BonusLayer } from "./bonus";
import { Fx } from "./fx";
import { Movers } from "./movers";
import { WeatherFx } from "./weather-fx";
import { aimSun, applySky, sunNow } from "./engine-sun";
import { attachControls, onPlane } from "./engine-controls";
import { drawLabels, placeCards } from "./engine-overlays";
import { AREA_IDS, CLOSE_VIEW, DIST1, FOV, TIER_ZOOM, readLevel, smoothstep, writeLevel } from "./engine-shared";
import { CameraRig } from "./engine-camera";
import { TrafficFacade, loadImage, blur, lampPools, lampGlows } from "./engine-support";

export { ZOOM_TIERS, type ZoomTier } from "../map-types";
export { CameraRig };

interface Pop {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
}

export interface Live {
  state: GameState;
  snap: EconomySnapshot;
}

export interface EngineOptions {
  /** This device's graphics profile (lib/graphics-profile.ts). */
  profile: GraphicsProfile;
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
  /**
   * While a clip of the map is recorded (engine-clip.ts): runs after the camera's own update each
   * frame (the clip's camera path), and after the frame is drawn (to copy it); every frame is
   * drawn then, battery saver or not, so the clip is smooth.
   */
  clip: { camera: (dt: number) => void; frame: () => void } | null = null;
  names: MapNames | null = null;

  private renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 2000);
  sun = new THREE.DirectionalLight("#fff3df", 3.3);
  hemi = new THREE.HemisphereLight("#d6ecff", "#6f7d5c", 0.6);
  /** Towards the sun (or the moon) now, and the shadow camera's frame worked out from it. */
  sunDir = new THREE.Vector3(-0.45, 1, -0.3).normalize();
  private sunNext = new THREE.Vector3();
  sunFrame = new THREE.OrthographicCamera();
  sunPts = Array.from({ length: 8 }, () => new THREE.Vector3());
  ctx: CanvasRenderingContext2D;
  w = 1;
  h = 1;
  dpr = 1;
  private maxDpr = 2;
  private profile: GraphicsProfile;
  private low: boolean;
  /** How big the textures may be on this device (lib/gpu-budget.ts). */
  private budget: TextureBudget;
  /** When the last frame was drawn, frames drawn so far (battery saver: lib/power.ts), and whether the saver was on. */
  private lastDraw = 0;
  frames = 0;
  private saving = false;
  /** The quality ladder (map/quality.ts): the step now, the rungs for this screen, and what decides when to move. */
  private steps: Step[] = [];
  private level = 0;
  private gov!: Governor;
  /** The tier in force (quality.ts) and the shadow map's redraw rhythm it asks for. */
  private tier = 0;
  private shadowEvery = 2;
  /** What the camera sees (trucks outside it are left out of the batches). */
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  /** Removes this view from the diagnostic panel (lib/diagnostics.ts). */
  private diagOff: (() => void) | null = null;

  ground: Ground | null = null;
  private terrain: TerrainParts | null = null;
  private scenery: Scenery | null = null;
  /** Shadows are drawn (close enough), and the frame parity for redrawing them. */
  private shadowLive = false;
  private shadowTick = 0;
  /** Frames since shared materials were last split (splitSharedMaterials). */
  private splitTick = 0;
  /** Bumped whenever the camera moves; the HTML cards are placed again only then (or now and then). */
  viewVersion = 0;
  cardsAt = { version: -1, frame: 0 };
  cardStyle = new WeakMap<HTMLElement, { vis: string; tf: string }>();
  plots: PlotLayer | null = null;
  readonly traffic: TrafficFacade;
  trafficLayer: Traffic3D | null = null;
  private signals: Signals | null = null;
  private signalLamps: SignalLamps | null = null;
  private peds: Pedestrians | null = null;
  private headlights: Headlights | null = null;
  private race: RaceCars | null = null;
  private mats: MapMaterials | null = null;
  private fx: Fx | null = null;
  weather: WeatherFx | null = null;
  bonus: BonusLayer | null = null;
  private movers: Movers | null = null;
  /** The weather to show instead of the forecast (tests and screenshots). */
  weatherOverride: Weather | null = null;
  /** The flow view: lines from every plant to where its loads go, coloured by how they run. */
  flow = false;
  /** Another player's empire is on the map (engine/visit.ts): no hints meant for the player. */
  visiting = false;
  /** Dealerships with no car to sell, and since when (s): "out of stock" after a while. */
  emptySince = new Map<string, number>();
  /** Where the arrow to an off-screen bonus is drawn (CSS px), to tap it. */
  bonusArrow: [number, number] | null = null;
  glows: THREE.Points | null = null;
  pools: THREE.InstancedMesh | null = null;
  private roadMarks: THREE.Group | null = null;
  private areaIds: Uint8Array | null = null;
  private areaSize: [number, number] = [1, 1];
  private lockTex: THREE.DataTexture | null = null;
  private lockKey = "";

  unlocked: Set<string> = new Set(["town"]);
  private views: Map<string, PlotView> | null = null;
  _selected: string | null = null;
  private _buildInfo: Map<string, PlotStatus> | null = null;
  private _preview: { plot: string; type: StructureType } | null = null;

  pops: Pop[] = [];
  banners: { plot: Plot; text: string; age: number }[] = [];
  private earners: { plot: Plot; perSec: number; acc: number; every: number }[] = [];
  followUntil = 0;
  tracked: { ref: object } | null = null;
  private raf = 0;
  private last = 0;
  t = 0;
  private lastLabelsAt = 0;
  private running = false;
  private ro: ResizeObserver;
  ty = 0;
  private cameraDirty = true;
  private lastCamera = { x: NaN, z: NaN, zoom: NaN, az: NaN, ty: NaN };
  private detach: () => void;
  private destroyed = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private labels: HTMLCanvasElement,
    readonly onTap: (t: MapTarget) => void,
    private opt: EngineOptions,
  ) {
    this.profile = opt.profile;
    this.low = opt.profile === "low";
    this.cam = new CameraRig([WORLD_MAP.size[0] / 2, WORLD_MAP.size[1] / 2]);
    // low graphics (battery saver, weak phones): no multisampling, and the GPU's power-saving mode
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: this.low ? "low-power" : "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // the size of the ground pictures, the filtering and the shadow map follow what the device can hold
    const caps = this.renderer.capabilities;
    this.budget = textureBudget({ low: this.low, ultra: this.profile === "ultra", maxTextureSize: caps.maxTextureSize, maxAnisotropy: caps.getMaxAnisotropy(), ...deviceFacts() });
    // Khronos PBR Neutral keeps the colours' saturation (ACES washed the map's greens and blues out)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // redrawn on demand (see render): every other frame, and whenever the view moves
    this.renderer.shadowMap.autoUpdate = false;
    this.ctx = labels.getContext("2d")!;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.45;
    this.scene.background = new THREE.Color("#8fd0f7");
    this.scene.fog = new THREE.Fog("#8fd0f7", 350, 1500);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.budget.shadowMap, this.budget.shadowMap);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.camera);
    this.traffic = new TrafficFacade(() => this.trafficLayer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.setLadder(this.low ? 0 : readLevel(this.profile));
    this.resize();
    this.home(0);
    this.detach = attachControls(this);
    this.ready = this.load();
    this.ready.catch((e) => console.error("map: could not load the world", e));  }

  // ───────────────────────── loading ─────────────────────────

  private async load() {
    const base = WORLD_MAP.assets;
    const [data, heights, areas] = await Promise.all([
      fetch(`${base}/world.json`).then((r) => r.json() as Promise<WorldJson>),
      fetch(`${base}/heights.bin`).then((r) => r.arrayBuffer()),
      loadImage(`${base}/areas.png`),
    ]);
    if (this.destroyed) return;
    const { tile, aniso } = this.budget;
    const tiles = await Promise.all(Array.from({ length: NTX * NTY }, (_, i) => loadTile(`${base}/t/${i % NTX}_${Math.floor(i / NTX)}.webp`, tile, aniso)));
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
    // the landmark works' lots came after the map: their ground is levelled here
    ground.level(WORLD_MAP.plots.filter((p) => p.territory));
    this.ground = ground;
    this.ty = ground.at(this.cam.x, this.cam.z);
    this.mats = mapMaterials(aniso);
    this.terrain = buildTerrain(ground, tiles, data);
    this.scene.add(...this.terrain.tiles, this.terrain.sea, this.terrain.floor);
    // the junctions that are roundabouts: the scenery keeps off them, the roads draw them, the traffic drives round them
    const rings = roundabouts(WORLD_MAP, data.cladiri);
    const ringLots = [...rings.values()].map((r) => ({ x: r.x, y: r.z, w: 2 * r.outer + 0.3, d: 2 * r.outer + 0.3, rot: 0 }));
    this.scenery = new Scenery(data, ground, this.mats, { low: this.low, lots: [...WORLD_MAP.plots.map((p) => ({ x: p.x, y: p.y, w: p.w, d: p.d, rot: p.rot, clear: !!p.territory })), ...ringLots] });
    this.scene.add(this.scenery.root);
    this.scenery.setClose(this.cam.dist < CLOSE_VIEW);
    // traffic lights at the plain junctions and crossings with lights along the long streets
    const mapRoads = this.scenery.roads;
    this.signals = new Signals(WORLD_MAP, rings, (i) => {
      const r = mapRoads[i];
      return { urban: !!r?.urban, ring: !!r?.ring, decks: (r?.decks ?? []).map(([a, b]) => [a / r.L, b / r.L] as [number, number]) };
    });
    const roads = buildRoads(data, ground, this.scenery.roads, aniso, rings, this.signals.crossings);
    this.roadMarks = roads.markings;
    this.scene.add(roads.root);
    this.glows = lampGlows(this.scenery.lamps);
    this.scene.add(this.glows);
    this.pools = lampPools(this.scenery.lamps);
    this.scene.add(this.pools);
    this.plots = new PlotLayer(ground);
    this.plots.onFinished = (plot, text) => this.banners.push({ plot, text, age: 0 });
    this.scene.add(this.plots.root);
    this.trafficLayer = new Traffic3D(ground, this.scenery.roads, this.mats.car, rings, this.signals);
    this.trafficLayer.density = this.low ? 0.5 : 1;
    const tl = this.trafficLayer;
    this.peds = new Pedestrians(ground, this.scenery.roads, rings, this.signals, (a, b, r) => tl.busyNear(a, b, r));
    this.peds.density = this.low ? 0.5 : 1;
    this.peds.setFar(this.cam.dist >= CLOSE_VIEW);
    const peds = this.peds;
    this.trafficLayer.obstacles = () => peds.bodies();
    this.signalLamps = new SignalLamps(ground, this.signals);
    this.headlights = new Headlights();
    this.headlights.low = this.low;
    this.scene.add(this.peds.root, this.signalLamps.root, this.headlights.root);
    this.trafficLayer.onArrive = (id) => this.pop(id, "🚗", "#93c5fd");
    this.scene.add(this.trafficLayer.root);
    this.trafficLayer.setFar(this.cam.dist >= CLOSE_VIEW);
    this.race = new RaceCars(ground, this.mats.car);
    this.scene.add(this.race.mesh);
    this.fx = new Fx();
    this.fx.low = this.low;
    this.fx.setViewHeight(this.h * this.dpr);
    if (this.trafficLayer) this.trafficLayer.fx = this.fx;
    this.weather = new WeatherFx(this.low);
    this.bonus = new BonusLayer(ground, this.trafficLayer, this.mats, this.fx);
    this.movers = new Movers(ground, this.mats, [WORLD_MAP.size[0] / 2, WORLD_MAP.size[1] / 2], { low: this.low, lines: this.scenery.lines });
    this.scene.add(this.fx.root, this.weather.root, this.bonus.root, this.movers.root);
    this.traffic.flush();
    this.applyTier();
    this.applyState();
    this.applyLife();
    this.plots.setSelected(this._selected);
    this.plots.setBuildInfo(this._buildInfo);
    this.plots.setPreview(this._preview);
    // the island, its scenery and roads never move (but the rotors, pumps and cable cars)
    for (const t of [...this.terrain.tiles, this.terrain.sea, this.terrain.floor]) freezeStatic(t);
    freezeStatic(this.scenery.root, this.scenery.movingParts());
    freezeStatic(roads.root);
    freezeStatic(this.movers.root, this.movers.movingParts());
    splitSharedMaterials(this.scene);
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
    this.peds?.setOpen(this.unlocked);
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

  /** The town and the company: its cars in the traffic, its ad on the billboards. */
  setCityLife(life: CityLife, ad: BillboardAd | null) {
    this.life = { life, ad };
    this.applyLife();
  }

  private life: { life: CityLife; ad: BillboardAd | null } | null = null;
  private applyLife() {
    if (!this.life) return;
    this.trafficLayer?.setOwn(this.life.life.own, this.life.life.share);
    this.scenery?.setAd(this.life.ad);
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
    this.diagOff ??= registerDiagSource("map", { renderer: this.renderer, quality: () => this.diagQuality() });
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // Browsers already throttle hidden tabs, but skipping the work entirely avoids
      // simulation, label projection and WebGL submission while the game is backgrounded.
      if (document.hidden) {
        this.last = now;
        return;
      }
      // low graphics: ~30 FPS; battery saver: 30 FPS while playing, a few frames a second when nobody touches the screen
      if (!this.clip && !shouldDraw(now, this.lastDraw, this.low)) return;
      this.lastDraw = now;
      const saving = isSaving();
      if (saving !== this.saving) {
        this.saving = saving;
        this.setLadder(0);
        this.resize();
      }
      const gap = now - this.last;
      const dt = Math.min(saving ? 0.25 : 0.1, gap / 1000);
      this.last = now;
      this.render(dt);
      this.frames++;
      diagFrame("map");
      // the real time between frames (the simulation's step above is capped, the verdict on the frames is not)
      if (!saving) this.adaptQuality(Math.min(1000, gap));
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** The quality this view runs at, for the diagnostic panel (lib/diagnostics.ts). */
  private diagQuality(): Quality {
    const shadows = this.renderer.shadowMap.enabled && this.shadowEvery > 0;
    const mode = this.low ? "low graphics" : this.saving ? "battery saver" : "adaptive";
    return {
      label: `${mode} · step ${this.level}/${Math.max(0, this.steps.length - 1)} · tier ${this.tier}`,
      dpr: this.dpr,
      shadows,
      notes: {
        "max dpr": this.maxDpr,
        canvas: `${this.canvas.width}x${this.canvas.height}`,
        "shadow map": shadows ? this.sun.shadow.mapSize.x : 0,
        "shadow redraw": this.shadowEvery > 0 ? `every ${this.shadowEvery} frames` : "never",
      },
    };
  }

  /** The player chose another graphics profile for this device (the ground tiles and the shadow map's size are set when the map opens). */
  setProfile(p: GraphicsProfile) {
    if (this.profile === p) return;
    this.profile = p;
    this.low = p === "low";
    this.setLadder(this.low ? 0 : readLevel(p));
    this.applyTier();
    this.resize();
  }

  /** The rungs of the quality ladder for this screen and mode (low graphics: resolution 1x, no climbing), and the one to stand on. */
  private setLadder(level: number) {
    const device = window.devicePixelRatio || 1;
    this.steps = profileLadder(this.profile, device, this.saving);
    this.gov = new Governor(this.steps.length, this.low ? 0 : level, performance.now());
    this.level = this.gov.level;
    this.maxDpr = this.steps[this.level].dpr;
    this.tier = this.steps[this.level].tier;
  }

  /** The step the quality ladder stands on now (0 is the fullest). */
  get qualityLevel() {
    return this.level;
  }

  /** The tier in force (map/quality.ts): 0 the fullest, 4 the lightest. */
  get qualityTier() {
    return this.tier;
  }

  /** How many steps the ladder has on this screen. */
  get qualitySteps() {
    return this.steps.length;
  }

  /** Stands on this step of the ladder (the frame watcher does it itself; this is for tests and benchmarks). */
  setQualityLevel(level: number) {
    this.gov = new Governor(this.steps.length, level, performance.now());
    this.moveTo(this.gov.level);
  }

  private moveTo(level: number) {
    const was = this.steps[this.level];
    this.level = level;
    const now = this.steps[level];
    this.maxDpr = now.dpr;
    this.tier = now.tier;
    if (now.tier !== was.tier) this.applyTier();
    if (now.dpr !== was.dpr) this.resize();
    if (!this.low) writeLevel(level, this.profile);
  }

  /** Whether the shadow map is in use (switching it recompiles the materials once). */
  private shadowsOn = true;

  /** What the tier in force asks for: the shadows, the share of traffic and crowd, the particles (quality.ts). */
  private applyTier() {
    const T = TIERS[this.tier];
    const low = this.low;
    this.shadowEvery = low ? 0 : T.shadowEvery;
    const shadows = this.shadowEvery > 0;
    if (shadows !== this.shadowsOn) {
      this.shadowsOn = shadows;
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
      if (shadows) this.renderer.shadowMap.needsUpdate = true;
    }
    this.scenery?.setShadows(!low && T.sceneryShadows);
    this.scenery?.setFarShare(low ? 1 : T.farShare);
    if (this.trafficLayer) this.trafficLayer.density = (low ? 0.5 : 1) * T.traffic;
    if (this.peds) this.peds.density = (low ? 0.5 : 1) * T.crowd;
    if (this.headlights) this.headlights.low = low || T.lean;
    if (this.fx) this.fx.low = low || T.lean;
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.diagOff?.();
    this.diagOff = null;
    this.detach();
    this.ro.disconnect();
    this.trafficLayer?.dispose();
    this.trafficLayer = null;
    this.peds?.dispose();
    this.signalLamps?.dispose();
    this.headlights?.dispose();
    this.race?.dispose();
    this.race = null;
    this.fx?.dispose();
    this.weather?.dispose();
    this.bonus?.dispose();
    // everything else in the scene (ground tiles, terrain, buildings, scenery, roads, lots) and
    // the lighting environment: the map is built again for each city, so nothing may stay behind
    // in the GPU's memory (a geometry or material shared with the next map is sent again when used)
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(x)) if (v instanceof THREE.Texture) textures.add(v);
        x.dispose();
      }
    });
    if (this.scene.environment) textures.add(this.scene.environment);
    for (const t of textures) t.dispose();
    this.scene.clear();
    this.renderer.dispose();
    // the WebGL context goes now, not whenever the browser collects it (phones allow only a few at once)
    this.renderer.forceContextLoss();
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
    this.fx?.setViewHeight(this.h * this.dpr);
    this.camera.aspect = this.w / this.h;
    // far out, the whole island fits on the screen
    const span = 2 * Math.tan(((FOV / 2) * Math.PI) / 180);
    const fit = Math.max(WORLD_MAP.size[0] / (span * this.camera.aspect), WORLD_MAP.size[1] / span) * 0.92;
    this.cam.minZoom = DIST1 / fit;
    this.cam.clamp();
    this.cameraDirty = true;
    if (!this.running) this.render(0);
  }

  /** Gives up detail step by step while frames stay slow, and wins it back after a long steady stretch (quality.ts). */
  private adaptQuality(ms: number) {
    if (this.low || document.hidden) return;
    const to = this.gov.frame(ms, performance.now());
    if (to !== null) this.moveTo(to);
  }

  /**
   * Puts the camera where the rig says (and the sun's shadow box around what
   * it sees). The level it looks at follows the ground over `dt` seconds
   * (0 snaps it there; a negative dt keeps it, so a drag stays steady).
   */
  place(dt: number) {
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
    // close up: the scenery's small cells (culled out of view) and the real car models
    const close = d < CLOSE_VIEW;
    this.scenery?.setClose(close);
    this.trafficLayer?.setFar(!close);
    this.peds?.setFar(!close);
    // road lines only shimmer from far away
    if (this.roadMarks) this.roadMarks.visible = d < 150;
    this.shadowLive = near;
    // the shadow box moved with the view: redraw the shadows this frame
    if (near) this.renderer.shadowMap.needsUpdate = true;
    this.sun.shadow.intensity = smoothstep(110, 80, d);
    aimSun(this);
    this.lastCamera.x = c.x;
    this.lastCamera.z = c.z;
    this.lastCamera.zoom = c.zoom;
    this.lastCamera.az = c.az;
    this.lastCamera.ty = this.ty;
    this.cameraDirty = false;
    this.viewVersion++;
  }

  private steamAcc = 0;
  /** Steam over the plants' roofs and welding sparks inside active factories. */
  private steam(dt: number) {
    if (!this.fx || !this.plots || this.cam.dist > CLOSE_VIEW * 1.3) return;
    this.steamAcc += dt;
    if (this.steamAcc < (this.low ? 0.6 : 0.3)) return;
    this.steamAcc = 0;
    const reach = this.cam.dist * 0.9;
    let n = 0;
    for (const v of this.plots.vents()) {
      if (Math.hypot(v.x - this.cam.x, v.z - this.cam.z) > reach || n++ >= 12) continue;
      this.fx.chimneySteam(v.x, v.y + 0.03, v.z);
      if (Math.random() < 0.6) {
        this.fx.weldingSpark(v.x, v.y + 0.12, v.z, 2);
      }
    }
  }

  private render(dt: number) {
    this.t += dt;
    const live = this.live();
    const cam = this.cam;
    cam.update(dt);
    this.clip?.camera(dt);

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
    // vehicles far from the middle of the view draw as the simple shape on the lower tiers
    this.trafficLayer?.setLod(cam.x, cam.z, TIERS[this.tier].detailRange * cam.dist);
    this.pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.trafficLayer?.setFrustum(this.frustum);

    // time of day
    worldClock.t += dt;
    LOCK.uniforms.uWind.value = this.t;
    const sky = skyAt(this.timeMode, worldClock.t);
    applySky(this, sky.dark);
    // the sun moves on (its shadows with it) once it has turned a little
    if (sunNow(this, this.sunNext).dot(this.sunDir) < 0.99999) {
      this.sunDir.copy(this.sunNext);
      aimSun(this);
      if (this.shadowLive) this.renderer.shadowMap.needsUpdate = true;
    }

    if (this.ground && live) {
      for (const e of this.earners) {
        e.acc += dt;
        if (e.acc >= e.every && e.perSec > 0) {
          this.pop(e.plot.id, `+${this.money(e.perSec * e.acc)}`);
          e.acc = 0;
        }
      }
      this.plots!.frame(this.t, live.state);
      this.steam(dt);
      // in steps of at most 0.1 s, as at full speed: the saver's rarer frames keep the same yielding and turns
      for (let left = dt; left > 1e-6; left -= 0.1) {
        const step = Math.min(0.1, left);
        this.trafficLayer!.update(step);
        this.peds!.update(step, sky.dark);
        this.signals!.update(step);
      }
      this.signalLamps!.update(sky.dark);
      this.headlights!.update(this.trafficLayer!.lamps(), sky.dark, this.cam.dist >= CLOSE_VIEW);
      this.race!.update(live.state, this.t);
      this.scenery!.animate(dt, this.t);
      this.bonus!.set(live.state.mapBonus.active);
      this.bonus!.update(dt, this.t);
      this.movers!.setTier(live.state.logistics.tier);
      this.movers!.update(dt);
      const waves = this.terrain!.waves;
      waves.offset.x = (waves.offset.x + dt * 0.004) % 1;
      waves.offset.y = (waves.offset.y + dt * 0.0025) % 1;
      this.terrain!.seaTime.value = this.t;
    }
    if (this.fx && this.weather) {
      this.fx.update(dt);
      const now = Date.now();
      this.weather.update(this.weatherOverride ?? weatherAt(now, seasonAt(now)), dt, this.t, cam.x, this.ty, cam.z, cam.dist, this.h * this.dpr);
    }
    // the shadows of moving cars and trucks follow at 30 FPS: the shadow pass
    // (about half the draw calls up close) runs every other frame
    if (this.shadowLive && this.shadowEvery > 0 && ++this.shadowTick >= this.shadowEvery) {
      this.shadowTick = 0;
      this.renderer.shadowMap.needsUpdate = true;
    }
    // lots and traffic add meshes as the game goes: give them their own materials too (kit.ts)
    if (++this.splitTick >= 60) {
      this.splitTick = 0;
      splitSharedMaterials(this.scene);
    }
    this.renderer.render(this.scene, this.camera);
    this.clip?.frame();
    // HTML cards remain frame-accurate; the heavier canvas labels only need ~30 FPS.
    const labelDt = this.t - this.lastLabelsAt;
    if (labelDt >= 1 / 30) {
      this.lastLabelsAt = this.t;
      drawLabels(this, labelDt, live);
    }
    placeCards(this);
  }

  skyCol = new THREE.Color();
  readonly skyDay = new THREE.Color("#8fd0f7");
  readonly skyDusk = new THREE.Color("#f3c39b");
  readonly skyNight = new THREE.Color("#0d1a33");
  readonly skyGrey = new THREE.Color("#b7c0c9");
  readonly fogGrey = new THREE.Color("#dfe4e8");
  readonly sunWarm = new THREE.Color("#fff3df");
  readonly sunNight = new THREE.Color("#ffb070");
  readonly hemiDay = new THREE.Color("#d6ecff");
  readonly hemiNight = new THREE.Color("#5d6fae");

  // ───────────────────────── labels ─────────────────────────

  v3 = new THREE.Vector3();
  /** World point → CSS px on screen; null behind the camera. */
  project(x: number, y: number, z: number): [number, number] | null {
    const v = this.v3.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }

  onScreen(p: [number, number] | null, m = 60): p is [number, number] {
    return !!p && p[0] > -m && p[1] > -m && p[0] < this.w + m && p[1] < this.h + m;
  }

  /** The bonus was taken (its money): coins over it, and it leaves. */
  bonusTaken(cash: number) {
    const p = this.bonus?.position();
    if (p) {
      this.pops.push({ x: p.x, y: p.y + 0.9, z: p.z, text: `+${this.money(cash)}`, color: "#fde047", age: 0 });
      this.bonus!.taken();
    }
  }

  /** Fireworks over a plot, a district or territory ("t:port"), or what the camera looks at. */
  fireworks(target: { plot?: string; area?: string; big?: boolean }) {
    const g = this.ground;
    if (!this.fx || !g) return;
    let x = this.cam.x;
    let z = this.cam.z;
    if (target.plot) {
      const p = WORLD_MAP.plotById[target.plot];
      if (!p) return;
      x = p.x;
      z = p.y;
    } else if (target.area) {
      const c = this.areaCenter(target.area as MapArea);
      x = c.x;
      z = c.y;
    }
    this.fx.fireworks(x, g.at(x, z), z, target.big ? 7 : 4, !!target.big, this.cam.dist / 30);
  }

  cardCount = -1;

  areaCenter(id: MapArea): { x: number; y: number } {
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
    if (text.includes("💰") || text.includes("$")) {
      this.fx?.coins(p.x, p.y + lot.top, p.z);
    } else {
      this.fx?.sparkle(p.x, p.y + lot.top, p.z, 2, color);
    }
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
    const lot = this.plots?.lots.get(plotId);
    if (lot) {
      const p = lot.root.position;
      this.fx?.fireworks(p.x, p.y + lot.top, p.z, 6, true, this.cam.dist / 30);
    }
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
      const p = onPlane(this, px, py, this.ty) ?? onPlane(this, px, Math.max(py, this.h * 0.3), this.ty);
      return p ? [p.x, p.z] : [this.cam.x, this.cam.z];
    });
  }

  // ───────────────────────── input ─────────────────────────

  ray = new THREE.Raycaster();
  ndc = new THREE.Vector2();

}

