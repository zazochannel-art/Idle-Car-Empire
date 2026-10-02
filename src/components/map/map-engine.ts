// Runs the Empire Map: owns the canvas, camera, scene and traffic, renders
// every animation frame and turns taps into selections. React only feeds it
// state and listens to its callbacks.
import { ROAD_STEP, WORLD, WORLD_MAP, zoneOfBlock, type Plot } from "@/game/city/layout";
import type { ZoneId } from "@/game/types";
import { attachControls, Camera } from "./camera";
import { Painter, sx, sy, toTile } from "./iso";
import { drawFog, drawGround, hitBox, WORLD_BOUNDS, zoneCenter, type Drawable, type DrawInfo } from "./scene";
import { Traffic, type TrafficWorld } from "./traffic";

export type MapTarget = { kind: "plot"; id: string } | { kind: "zone"; id: ZoneId } | null;

interface Pop {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
}

export class MapEngine {
  readonly cam = new Camera(WORLD_BOUNDS);
  private ctx: CanvasRenderingContext2D;
  private painter: Painter;
  private dpr = 1;
  private scene: Drawable[] = [];
  private unlocked = new Set<ZoneId>();
  readonly traffic = new Traffic();
  private pops: Pop[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private running = false;
  private detach: () => void;
  private ro: ResizeObserver;
  /** Garage income per plot, for the floating "+$" while they work. */
  private earners: { plot: Plot; perSec: number; acc: number; every: number }[] = [];
  selected: string | null = null;
  money: (n: number) => string = (n) => `$${Math.round(n)}`;
  /** Container whose [data-zone] children are pinned to zone centres (lock cards). */
  overlay: HTMLElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private onTap: (t: MapTarget) => void,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.painter = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    const [hx, hy] = this.homeTile();
    this.cam.zoom = this.defaultZoom();
    this.cam.x = sx(hx, hy);
    this.cam.y = sy(hx, hy);
    this.detach = attachControls(canvas, this.cam, { onTap: (x, y) => this.tap(x, y), onHover: (x, y) => this.hover(x, y) });
    this.traffic.onArrive = (kind, site) => {
      if (kind === "carrier") this.burst(site.id, "🚗", "#93c5fd");
    };
  }

  defaultZoom() {
    return Math.max(0.85, Math.min(1.35, this.cam.w / 1000 + 0.3));
  }

  /** Where the camera starts: the first garage and its neighbours. */
  private homeTile(): [number, number] {
    // around Garage #01 in the Small Town
    return this.cam.w < 700 ? [24, 17] : [25, 18];
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cam.w = Math.max(1, r.width);
    this.cam.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cam.w * this.dpr);
    this.canvas.height = Math.round(this.cam.h * this.dpr);
    this.cam.minZoom = Math.max(0.18, Math.min(this.cam.w / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX), 0.5) * 0.9);
    if (!this.running) this.render(0);
  }

  setScene(scene: Drawable[], unlocked: Set<ZoneId>, world: TrafficWorld) {
    this.scene = scene;
    this.unlocked = unlocked;
    this.traffic.setWorld(world);
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

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.detach();
    this.ro.disconnect();
  }

  // ───────────────────────── camera helpers ─────────────────────────

  /**
   * Flies to a plot. `offset` (screen px) keeps it clear of a panel covering
   * the right side or the bottom of the map.
   */
  focusPlot(id: string, offset: { x: number; y: number } = { x: 0, y: 0 }, zoom = Math.max(this.cam.zoom, 1.15), dur = 0.6) {
    const p = WORLD_MAP.plotById[id];
    if (!p) return;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.d / 2;
    const z = Math.min(this.cam.maxZoom, zoom);
    this.cam.flyTo(sx(cx, cy) + offset.x / 2 / z, sy(cx, cy, 30) + offset.y / 2 / z, z, dur);
  }

  focusZone(id: ZoneId, offset: { x: number; y: number } = { x: 0, y: 0 }) {
    const c = zoneCenter(id);
    const z = Math.max(this.cam.minZoom, Math.min(this.cam.zoom, 0.6));
    this.cam.flyTo(sx(c.x, c.y) + offset.x / 2 / z, sy(c.x, c.y) + offset.y / 2 / z, z, 0.8);
  }

  /** Centre the camera on a tile position given as a fraction of the world. */
  lookAt(tx: number, ty: number) {
    this.cam.flyTo(sx(tx, ty), sy(tx, ty), this.cam.zoom, 0.45);
  }

  zoomBy(f: number) {
    this.cam.flyTo(this.cam.x, this.cam.y, this.cam.zoom * f, 0.25);
  }

  home() {
    const [hx, hy] = this.homeTile();
    this.cam.flyTo(sx(hx, hy), sy(hx, hy), this.defaultZoom(), 0.7);
  }

  /** Viewport outline in tile coordinates (for the minimap). */
  viewTiles() {
    const [x0, y0, x1, y1] = this.cam.view();
    return [toTile(x0, y0), toTile(x1, y0), toTile(x1, y1), toTile(x0, y1)];
  }

  // ───────────────────────── effects ─────────────────────────

  pop(plotId: string, text: string, color = "#fde047") {
    const p = WORLD_MAP.plotById[plotId];
    if (!p) return;
    // above the building's label
    this.pops.push({ x: p.x + p.w / 2, y: p.y + p.d / 2, z: p.kind === "factory" ? (p.w > 3 ? 130 : 80) : 95, text, color, age: 0 });
    if (this.pops.length > 40) this.pops.shift();
  }

  private burst(plotId: string, text: string, color: string) {
    this.pop(plotId, text, color);
  }

  // ───────────────────────── input ─────────────────────────

  private pick(px: number, py: number): MapTarget {
    const [wx, wy] = this.cam.toWorld(px, py);
    // Front-most building whose silhouette contains the point.
    for (let i = this.scene.length - 1; i >= 0; i--) {
      const d = this.scene[i];
      if (!d.pickId || !d.hit) continue;
      if (hitBox(d.hit, wx, wy)) {
        const plot = WORLD_MAP.plotById[d.pickId];
        if (plot && !this.unlocked.has(plot.zone)) return { kind: "zone", id: plot.zone };
        return { kind: "plot", id: d.pickId };
      }
    }
    const tile = toTile(wx, wy);
    const zone = zoneOfBlock(Math.floor(tile.x / ROAD_STEP), Math.floor(tile.y / ROAD_STEP));
    if (zone && !this.unlocked.has(zone)) return { kind: "zone", id: zone };
    return null;
  }

  private tap(px: number, py: number) {
    this.onTap(this.pick(px, py));
  }

  private hover(px: number, py: number) {
    const t = this.pick(px, py);
    this.canvas.style.cursor = t ? "pointer" : "grab";
  }

  // ───────────────────────── rendering ─────────────────────────

  /** Cargo ships and boats sailing around the island. */
  private drawShips() {
    const p = this.painter;
    const routes: { x0: number; y0: number; x1: number; y1: number; speed: number; color: string; big: boolean }[] = [
      { x0: 80, y0: WORLD + 6, x1: -20, y1: WORLD + 6, speed: 0.9, color: "#b91c1c", big: true },
      { x0: -7, y0: -10, x1: -7, y1: WORLD + 14, speed: 0.7, color: "#1d4ed8", big: true },
      { x0: -16, y0: WORLD + 14, x1: 80, y1: WORLD + 14, speed: 1.4, color: "#f8fafc", big: false },
      { x0: WORLD + 8, y0: 80, x1: WORLD + 8, y1: -16, speed: 1.1, color: "#0f766e", big: true },
    ];
    for (const [i, r] of routes.entries()) {
      const len = Math.abs(r.x1 - r.x0) + Math.abs(r.y1 - r.y0);
      const k = ((this.t * r.speed + i * 37) % len) / len;
      const x = r.x0 + (r.x1 - r.x0) * k;
      const y = r.y0 + (r.y1 - r.y0) * k;
      const alongX = r.y0 === r.y1;
      const L = r.big ? 4.2 : 1.4;
      const Wd = r.big ? 1.1 : 0.6;
      const w = alongX ? L : Wd;
      const d = alongX ? Wd : L;
      // wake
      const back = alongX ? Math.sign(r.x1 - r.x0) * -1 : Math.sign(r.y1 - r.y0) * -1;
      for (let s = 1; s <= 4; s++) {
        const wx = alongX ? x + back * (L / 2 + s * 0.9) : x;
        const wy = alongX ? y : y + back * (L / 2 + s * 0.9);
        p.ellipse(wx, wy, 0, 6 + s * 4, `rgba(255,255,255,${0.22 - s * 0.045})`, 0.5);
      }
      p.box(x - w / 2, y - d / 2, w, d, -2, r.big ? 7 : 4, r.color, "#475569");
      if (r.big) {
        // containers and the bridge
        const colors = ["#f59e0b", "#2563eb", "#16a34a", "#dc2626"];
        for (let c = 0; c < 4; c++) {
          const cx = alongX ? x - w / 2 + 0.35 + c * 0.75 : x - w / 2 + 0.15;
          const cy = alongX ? y - d / 2 + 0.15 : y - d / 2 + 0.35 + c * 0.75;
          p.box(cx, cy, alongX ? 0.65 : w - 0.3, alongX ? d - 0.3 : 0.65, 5, 6, colors[(c + i) % 4]);
        }
        const bx = alongX ? x + (back > 0 ? w / 2 - 0.7 : -w / 2 + 0.2) : x - w / 2 + 0.2;
        const by = alongX ? y - d / 2 + 0.2 : y + (back > 0 ? d / 2 - 0.7 : -d / 2 + 0.2);
        p.box(bx, by, alongX ? 0.5 : w - 0.4, alongX ? d - 0.4 : 0.5, 5, 12, "#f8fafc");
      } else {
        p.box(x - w / 4, y - d / 4, w / 2, d / 2, 2, 4, "#e2e8f0");
      }
    }
  }

  /** Soft cloud shadows drifting over the map. */
  private drawClouds() {
    const c = this.ctx;
    for (let i = 0; i < 5; i++) {
      const tx = ((this.t * (0.5 + i * 0.12) + i * 23) % (WORLD + 50)) - 25;
      const ty = (i * 17 + 9) % WORLD;
      const px = sx(tx, ty);
      const py = sy(tx, ty);
      const r = 160 + i * 30;
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(15,23,42,0.13)");
      g.addColorStop(1, "rgba(15,23,42,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private render(dt: number) {
    const { ctx, painter: p, cam } = this;
    this.t += dt;
    cam.update(dt);
    this.traffic.update(dt);

    for (const e of this.earners) {
      e.acc += dt;
      if (e.acc >= e.every && e.perSec > 0) {
        this.pop(e.plot.id, `+${this.money(e.perSec * e.acc)}`);
        e.acc = 0;
      }
    }

    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0f4f7a");
    bg.addColorStop(1, "#0a3352");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.proj = null;

    // sea shimmer around the island
    ctx.strokeStyle = "rgba(125,211,252,0.12)";
    ctx.lineWidth = 2;
    const view = cam.view();
    for (let i = 0; i < 18; i++) {
      const wx = view[0] + ((i * 397 + this.t * 8) % (view[2] - view[0] + 1));
      const wy = view[1] + ((i * 211) % (view[3] - view[1] + 1));
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 26, wy);
      ctx.stroke();
    }

    this.drawShips();
    drawGround(p, this.unlocked, view, this.t);

    const info: DrawInfo = { zoom: cam.zoom, selected: this.selected, t: this.t };
    const inView = (b: [number, number, number, number]) => b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3];

    // merge static scene with moving traffic, both sorted by depth
    const moving = this.traffic.drawables().sort((a, b) => a.depth - b.depth);
    let mi = 0;
    const visible: Drawable[] = [];
    const drawMoving = (upTo: number) => {
      while (mi < moving.length && moving[mi].depth <= upTo) {
        const m = moving[mi++];
        const mx = sx(m.x, m.y);
        const my = sy(m.x, m.y);
        if (mx < view[0] - 40 || mx > view[2] + 40 || my < view[1] - 40 || my > view[3] + 60) continue;
        p.dim = false;
        m.draw(p);
      }
    };
    for (const d of this.scene) {
      drawMoving(d.depth);
      if (!inView(d.bbox)) continue;
      p.dim = d.zone !== null && !this.unlocked.has(d.zone);
      d.draw(p, info);
      visible.push(d);
    }
    drawMoving(Infinity);
    p.dim = false;
    drawFog(p, this.unlocked, this.t);
    this.drawClouds();

    // labels and pops in screen pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    p.proj = (x, y, zz) => cam.toScreen(sx(x, y), sy(x, y, zz));
    for (const d of visible) d.label?.(p, info);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
    ctx.lineJoin = "round";
    for (const pop of this.pops) {
      pop.age += dt;
      const k = pop.age / 1.6;
      if (k >= 1) continue;
      const [px, py] = p.at(pop.x, pop.y, pop.z);
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 3;
      ctx.strokeText(pop.text, px, py - k * 34);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, px, py - k * 34);
    }
    ctx.globalAlpha = 1;
    this.pops = this.pops.filter((q) => q.age < 1.6);
    p.proj = null;

    // HTML cards over locked zones
    const cards = this.overlay?.children ?? [];
    for (const node of cards) {
      const el = node as HTMLElement;
      const id = el.dataset.zone as ZoneId | undefined;
      if (!id) continue;
      const c = zoneCenter(id);
      const [px, py] = cam.toScreen(sx(c.x, c.y), sy(c.x, c.y));
      const off = px < -200 || py < -200 || px > cam.w + 200 || py > cam.h + 200;
      el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -50%)`;
      el.style.visibility = off ? "hidden" : "visible";
    }
  }
}
