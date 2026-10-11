// Renders 3D models into isometric sprites for the 2D map. The camera is an
// orthographic camera locked to the map's projection (2:1 dimetric: 30°
// elevation, 45° yaw), so a model drawn at a tile position lines up exactly
// with the roads and plots. Sprites are rendered lazily in the background
// (a few per frame), cached, and drawn with drawImage — fast on any device.
// Until a sprite exists, or where WebGL is missing, callers fall back to the
// vector drawings.
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;

/** Screen pixels per tile along a map axis at zoom 1 (32 px across, 16 down). */
export const PX_PER_TILE = 32 * Math.SQRT2;
/** Screen pixels per tile of height (vertical scale of the 30° camera). */
export const PX_PER_TILE_UP = PX_PER_TILE * Math.cos(Math.PI / 6);

export interface SpriteSize {
  /** Logical sprite size in screen px at zoom 1, and where the model's origin lands. */
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface Sprite {
  img: HTMLCanvasElement;
  size: SpriteSize;
  k: number;
}

type Build = (T: Three, ctx: BuildCtx) => THREE_NS.Object3D;

export interface BuildCtx {
  kit: import("./car-models").MaterialKit;
  models: typeof import("./car-models");
  industrial: typeof import("./industrial-models");
  buildings: typeof import("./building-models");
  homes: typeof import("./home-models");
  interior: typeof import("./interior-models");
}

/**
 * How a sprite is lit: "map" is the island in the sun (flat-shaded, matte
 * low-poly look); "indoor" is a factory hall (lamps overhead, steel that
 * reflects the hall, smooth shading).
 */
export type SpriteLook = "map" | "indoor";

interface Job {
  key: string;
  size: SpriteSize;
  k: number;
  shadow: boolean;
  build: Build;
  look: SpriteLook;
}

/**
 * An outdoor sky for reflections: blue zenith, a bright hazy horizon, darker
 * ground, and a hot sun where the map's sun is. Paint and glass then mirror a
 * real sky (the horizon line on car flanks, the sky in office glass) instead
 * of a studio.
 */
function outdoorEnvironment(T: Three) {
  const env = new T.Scene();
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, "#3f7fc4");
  sky.addColorStop(0.32, "#8dbbe6");
  sky.addColorStop(0.49, "#eef4f8");
  sky.addColorStop(0.51, "#8d8a7c");
  sky.addColorStop(0.62, "#5f6656");
  sky.addColorStop(1, "#3b4036");
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);
  // a few soft clouds
  for (let i = 0; i < 14; i++) {
    const x = ((i * 97) % 256) + 8;
    const y = 18 + ((i * 37) % 36);
    const r = 10 + ((i * 53) % 18);
    const cl = g.createRadialGradient(x, y, 1, x, y, r);
    cl.addColorStop(0, "rgba(255,255,255,0.55)");
    cl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = cl;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const dome = new T.Mesh(new T.SphereGeometry(10, 48, 24), new T.MeshBasicMaterial({ map: tex, side: T.BackSide }));
  env.add(dome);
  // the sun (HDR: far brighter than the sky) and a broad skylight overhead
  const sun = new T.Mesh(new T.SphereGeometry(0.7, 16, 8), new T.MeshBasicMaterial());
  sun.material.color.setScalar(40);
  sun.position.set(-3, 5, 2.2).normalize().multiplyScalar(9);
  env.add(sun);
  const panel = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({ side: T.DoubleSide }));
  panel.material.color.setScalar(1.6);
  panel.rotation.x = Math.PI / 2;
  panel.position.y = 8;
  env.add(panel);
  return env;
}

/**
 * A factory hall for reflections: polished concrete below, grey cladding
 * around, a bright roof with rows of strip lamps and a band of windows on
 * one side. Steel, paint and glass then mirror a real workshop (lamp
 * streaks across a press, a cool window glint on glass) instead of a sky.
 */
function indoorEnvironment(T: Three) {
  const env = new T.Scene();
  const wall = new T.Mesh(new T.BoxGeometry(18, 8, 18), new T.MeshBasicMaterial({ color: "#6f7782", side: T.BackSide }));
  wall.position.y = 3;
  env.add(wall);
  const floor = new T.Mesh(new T.PlaneGeometry(18, 18), new T.MeshBasicMaterial({ color: "#5a5f66" }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  env.add(floor);
  // the roof: light panels, then rows of hot strip lamps
  const roof = new T.Mesh(new T.PlaneGeometry(18, 18), new T.MeshBasicMaterial({ color: "#c9cfd6", side: T.DoubleSide }));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = 6.9;
  env.add(roof);
  const lampM = new T.MeshBasicMaterial({ side: T.DoubleSide });
  lampM.color.setRGB(9, 8.6, 7.8);
  for (let i = -3; i <= 3; i++) {
    const lamp = new T.Mesh(new T.PlaneGeometry(10, 0.35), lampM);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 6.8, i * 2.2);
    env.add(lamp);
  }
  // a band of windows on the left wall: cool daylight
  const win = new T.Mesh(new T.PlaneGeometry(14, 1.6), new T.MeshBasicMaterial({ side: T.DoubleSide }));
  win.material.color.setRGB(2.2, 2.6, 3.2);
  win.rotation.y = Math.PI / 2;
  win.position.set(-8.9, 4.4, 0);
  env.add(win);
  return env;
}

class SpriteFactory {
  private T: Three | null = null;
  private renderer: THREE_NS.WebGLRenderer | null = null;
  private scene: THREE_NS.Scene | null = null;
  private camera: THREE_NS.OrthographicCamera | null = null;
  private ground: THREE_NS.Mesh | null = null;
  private pad: THREE_NS.Mesh | null = null;
  /** The two lighting setups (map sun, factory hall), switched per sprite. */
  private looks: Record<SpriteLook, { lights: THREE_NS.Light[]; env: THREE_NS.Texture; envIntensity: number; exposure: number; shadow: number }> | null = null;
  private ctx: BuildCtx | null = null;
  private keep = new Set<THREE_NS.Material>();
  private loading = false;
  failed = false;
  private cache = new Map<string, Sprite | null>();
  private queue: Job[] = [];
  private scheduled = false;
  /** Listeners told when new sprites are ready (to redraw static views). */
  private listeners = new Set<() => void>();
  /** Total bytes of cached sprites, to stay within memory. */
  private bytes = 0;
  /** Use counter: each sprite remembers when it was last drawn (least recently used goes first). */
  private uses = 0;
  private lastUse = new Map<string, number>();
  private static MAX_BYTES = 96 * 1024 * 1024;

  get ready() {
    return !!this.renderer;
  }

  onReady(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * The sprite for `key`, or null while it is being made (call again next
   * frame). `k` is the resolution: sprite pixels per screen pixel at zoom 1.
   */
  /** A sprite only if it is already made (never queues one). */
  peek(key: string, k: number, shadow = true): Sprite | null {
    const full = `${key}|${k}|${shadow ? 1 : 0}`;
    const hit = this.cache.get(full) ?? null;
    if (hit) this.lastUse.set(full, ++this.uses);
    return hit;
  }

  get(key: string, size: SpriteSize, k: number, build: Build, shadow = true, look: SpriteLook = "map"): Sprite | null {
    if (this.failed || typeof document === "undefined") return null;
    // the same model lit for the hall is a different sprite
    const full = `${key}|${k}|${shadow ? 1 : 0}${look === "map" ? "" : `|${look}`}`;
    const hit = this.cache.get(full);
    if (hit) {
      this.lastUse.set(full, ++this.uses);
      return hit;
    }
    if (hit === null) return null; // queued
    this.cache.set(full, null);
    this.queue.push({ key: full, size, k, shadow, build, look });
    this.kick();
    return null;
  }

  private kick() {
    if (!this.T && !this.loading) {
      this.loading = true;
      void this.init();
      return;
    }
    if (this.renderer && !this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.pump());
    }
  }

  private async init() {
    try {
      const T = await import("three");
      const models = await import("./car-models");
      await models.loadShapes();
      // every car is a ready-made model: none is drawn before the files are in
      await models.loadHeroes(T);
      const industrial = await import("./industrial-models");
      const buildings = await import("./building-models");
      const homes = await import("./home-models");
      const interior = await import("./interior-models");
      const canvas = document.createElement("canvas");
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.NeutralToneMapping;
      // bright daylight over flat-shaded low-poly models (see lowPoly below)
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;

      const scene = new T.Scene();
      const pmrem = new T.PMREMGenerator(renderer);
      const outdoorEnv = pmrem.fromScene(outdoorEnvironment(T), 0.03).texture;
      const indoorEnv = pmrem.fromScene(indoorEnvironment(T), 0.04).texture;
      scene.environment = outdoorEnv;
      scene.environmentIntensity = 1.2;

      // the map's sun: from the upper left, shadows fall to the lower right
      const sun = new T.DirectionalLight("#fff4e0", 3.1);
      sun.position.set(-3, 5, 2.2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.radius = 4;
      sun.shadow.bias = -0.0008;
      const sc = sun.shadow.camera;
      sc.left = -2.5;
      sc.right = 2.5;
      sc.top = 2.5;
      sc.bottom = -2.5;
      sc.near = 0.1;
      sc.far = 20;
      scene.add(sun);
      const sky = new T.HemisphereLight("#cfe6ff", "#7d8a5c", 1.0);
      scene.add(sky);

      // the hall: high-bay lamps almost straight overhead (short shadows right
      // under the machines), light bouncing off the concrete, and a soft cool
      // fill from the windows so the sides facing the camera keep their shape
      const lamps = new T.DirectionalLight("#fff6e8", 2.5);
      lamps.position.set(-1.1, 6, 1.4);
      lamps.castShadow = true;
      lamps.shadow.mapSize.set(1024, 1024);
      lamps.shadow.radius = 6;
      lamps.shadow.bias = -0.0008;
      Object.assign(lamps.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.1, far: 20 });
      const bounce = new T.HemisphereLight("#eef3fa", "#8a8f96", 0.85);
      const windowFill = new T.DirectionalLight("#dbe8ff", 0.55);
      windowFill.position.set(4, 3, 3);
      for (const l of [lamps, bounce, windowFill]) {
        l.visible = false;
        scene.add(l);
      }
      this.looks = {
        map: { lights: [sun, sky], env: outdoorEnv, envIntensity: 1.2, exposure: 1.05, shadow: 0.32 },
        indoor: { lights: [lamps, bounce, windowFill], env: indoorEnv, envIntensity: 1.0, exposure: 1.0, shadow: 0.4 },
      };

      const ground = new T.Mesh(new T.PlaneGeometry(12, 12), new T.ShadowMaterial({ opacity: 0.32 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      // a soft contact shadow pad right under the model
      const padTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const g = c.getContext("2d")!;
        const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        grd.addColorStop(0, "rgba(0,0,0,0.55)");
        grd.addColorStop(0.6, "rgba(0,0,0,0.25)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        return new T.CanvasTexture(c);
      })();
      const pad = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.002;
      scene.add(pad);

      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      const el = Math.PI / 6;
      camera.position.set(Math.cos(el) * Math.SQRT1_2 * 40, Math.sin(el) * 40, Math.cos(el) * Math.SQRT1_2 * 40);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);

      this.T = T;
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.ground = ground;
      this.pad = pad;
      const kit = models.materialKit(T);
      // shared materials survive; everything a build creates is disposed after rendering
      this.keep = new Set(Object.values(kit).filter((m): m is THREE_NS.Material => m instanceof T.Material));
      this.ctx = { kit, models, industrial, buildings, homes, interior };
      this.kick();
    } catch {
      this.failed = true;
      this.queue.length = 0;
    }
  }

  private pump() {
    this.scheduled = false;
    const T = this.T;
    if (!T || !this.renderer || !this.scene || !this.camera || !this.ctx) return;
    const t0 = performance.now();
    let made = 0;
    while (this.queue.length && (made < 1 || performance.now() - t0 < 7)) {
      const job = this.queue.shift()!;
      try {
        this.render(job);
      } catch {
        this.cache.delete(job.key);
      }
      made++;
    }
    if (made) this.listeners.forEach((l) => l());
    if (this.queue.length) {
      this.scheduled = true;
      requestAnimationFrame(() => this.pump());
    }
  }

  /** Low-poly copies of the shared materials (made once, kept). */
  private flats = new Map<THREE_NS.Material, THREE_NS.Material>();

  /**
   * The racing-game look: every lit material is shaded per face (round
   * shapes show their facets), matte rather than glossy, a little more
   * saturated. Glass stays dark and shiny; paint keeps a soft sheen.
   */
  private lowPoly(obj: THREE_NS.Object3D) {
    const T = this.T!;
    const hsl = { h: 0, s: 0, l: 0 };
    const conv = (mat: THREE_NS.Material): THREE_NS.Material => {
      if (!(mat instanceof T.MeshStandardMaterial)) return mat;
      const hit = this.flats.get(mat);
      if (hit) return hit;
      const shared = this.keep.has(mat) || !!mat.userData.keep;
      const flat = mat.clone();
      flat.flatShading = true;
      const glass = mat.transparent && mat.opacity < 0.95;
      if (!glass) {
        flat.roughness = Math.max(0.5, mat.roughness);
        flat.metalness = Math.min(0.3, mat.metalness);
        flat.envMapIntensity = 0.55;
        flat.color.getHSL(hsl);
        flat.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l);
      }
      flat.needsUpdate = true;
      if (shared) {
        flat.userData.keep = true;
        this.flats.set(mat, flat);
      } else mat.dispose();
      return flat;
    };
    obj.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    });
  }

  private render(job: Job) {
    const T = this.T!;
    const r = this.renderer!;
    const cam = this.camera!;
    const { w, h, ax, ay } = job.size;
    const W = Math.round(w * job.k);
    const H = Math.round(h * job.k);
    r.setSize(W, H, false);
    // frustum in tiles: the model's origin lands at (ax, ay)
    cam.left = -ax / PX_PER_TILE;
    cam.right = (w - ax) / PX_PER_TILE;
    cam.top = ay / PX_PER_TILE;
    cam.bottom = -(h - ay) / PX_PER_TILE;
    cam.updateProjectionMatrix();

    // the look: the map's low-poly sunlight, or the factory hall's lamps
    const look = this.looks![job.look];
    for (const [name, l] of Object.entries(this.looks!)) for (const light of l.lights) light.visible = name === job.look;
    this.scene!.environment = look.env;
    this.scene!.environmentIntensity = look.envIntensity;
    r.toneMappingExposure = look.exposure;
    (this.ground!.material as THREE_NS.ShadowMaterial).opacity = look.shadow;

    const obj = job.build(T, this.ctx!);
    // indoors the models keep their own smooth, metallic materials
    if (job.look === "map") this.lowPoly(obj);
    this.scene!.add(obj);
    this.ground!.visible = job.shadow;
    this.pad!.visible = job.shadow;
    if (job.shadow) {
      const b = new T.Box3().setFromObject(obj);
      const sz = b.getSize(new T.Vector3());
      this.pad!.scale.set(sz.x * 1.15, sz.z * 1.3, 1);
      this.pad!.position.set((b.min.x + b.max.x) / 2, 0.002, (b.min.z + b.max.z) / 2);
      this.pad!.rotation.z = 0;
    }
    r.render(this.scene!, cam);
    this.scene!.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.userData.keep) m.geometry.dispose();
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (!this.keep.has(mm) && !mm.userData.keep) mm.dispose();
    });

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    out.getContext("2d")!.drawImage(r.domElement, 0, 0);
    this.cache.set(job.key, { img: out, size: job.size, k: job.k });
    this.bytes += W * H * 4;
    this.lastUse.set(job.key, ++this.uses);
    if (this.bytes > SpriteFactory.MAX_BYTES) this.evict(job.key);
  }

  /**
   * Over budget: forget the sprites drawn least recently (down to 85% of the
   * budget, so this runs rarely). Sprites on screen keep being used and stay;
   * the rest are re-made on demand.
   */
  private evict(keep: string) {
    const made = [...this.cache.entries()].filter((e): e is [string, Sprite] => e[1] !== null && e[0] !== keep);
    made.sort((a, b) => (this.lastUse.get(a[0]) ?? 0) - (this.lastUse.get(b[0]) ?? 0));
    for (const [k, sp] of made) {
      if (this.bytes <= SpriteFactory.MAX_BYTES * 0.85) break;
      this.bytes -= sp.img.width * sp.img.height * 4;
      this.cache.delete(k);
      this.lastUse.delete(k);
    }
  }
}

export const sprites3d = new SpriteFactory();

/** Picks the sprite resolution for how big it will appear on screen. */
export function tierFor(scale: number): number {
  return scale <= 1.4 ? 2 : scale <= 2.8 ? 4 : 6;
}
