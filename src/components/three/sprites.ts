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
}

interface Job {
  key: string;
  size: SpriteSize;
  k: number;
  shadow: boolean;
  build: Build;
}

class SpriteFactory {
  private T: Three | null = null;
  private renderer: THREE_NS.WebGLRenderer | null = null;
  private scene: THREE_NS.Scene | null = null;
  private camera: THREE_NS.OrthographicCamera | null = null;
  private ground: THREE_NS.Mesh | null = null;
  private pad: THREE_NS.Mesh | null = null;
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
  private order: string[] = [];
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
  get(key: string, size: SpriteSize, k: number, build: Build, shadow = true): Sprite | null {
    if (this.failed || typeof document === "undefined") return null;
    const full = `${key}|${k}|${shadow ? 1 : 0}`;
    const hit = this.cache.get(full);
    if (hit) return hit;
    if (hit === null) return null; // queued
    this.cache.set(full, null);
    this.queue.push({ key: full, size, k, shadow, build });
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
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const models = await import("./car-models");
      const industrial = await import("./industrial-models");
      const buildings = await import("./building-models");
      const canvas = document.createElement("canvas");
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.NeutralToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;

      const scene = new T.Scene();
      const pmrem = new T.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 1.0;

      // the map's sun: from the upper left, shadows fall to the lower right
      const sun = new T.DirectionalLight("#fff4e2", 2.4);
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
      scene.add(new T.HemisphereLight("#cfe6ff", "#5b6470", 0.9));

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
      this.ctx = { kit, models, industrial, buildings };
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

    const obj = job.build(T, this.ctx!);
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
      m.geometry.dispose();
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (!this.keep.has(mm) && !mm.userData.keep) mm.dispose();
    });

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    out.getContext("2d")!.drawImage(r.domElement, 0, 0);
    this.cache.set(job.key, { img: out, size: job.size, k: job.k });
    this.bytes += W * H * 4;
    this.order.push(job.key);
    // forget the oldest sprites when over budget (they are re-made on demand)
    while (this.bytes > SpriteFactory.MAX_BYTES && this.order.length > 1) {
      const old = this.order.shift()!;
      const s = this.cache.get(old);
      if (s) this.bytes -= s.img.width * s.img.height * 4;
      this.cache.delete(old);
    }
  }
}

export const sprites3d = new SpriteFactory();

/** Picks the sprite resolution for how big it will appear on screen. */
export function tierFor(scale: number): number {
  return scale <= 1.4 ? 2 : scale <= 2.8 ? 4 : 6;
}
