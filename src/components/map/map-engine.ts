// Runs the Empire Map: owns the canvas, camera, scene and traffic, renders
// every animation frame and turns taps into selections. React only feeds it
// state and listens to its callbacks.
import { networkTraffic } from "./highway";
import type { PlotStatus } from "@/game/engine/construction";
import { LEGACY_OFFSET } from "@/game/config/city";
import { ROAD_STEP as STEP_TILES, territoryCenterTile } from "@/game/city/layout";
import type { TerritoryId } from "@/game/config/city";
/** The first map sits this many tiles in from the corner of the region. */
const LEGACY_TILES = LEGACY_OFFSET * STEP_TILES;
import { RaceLayer } from "./race-layer";
import { RACING_CENTER, drawRacingGround } from "./racing-district";
import { seasonAt } from "@/game/engine/season";
import { ROAD_STEP, WORLD, WORLD_MAP, zoneOfBlock, type Plot } from "@/game/city/layout";
import type { ZoneId } from "@/game/types";
import { attachControls, Camera } from "./camera";
import { Painter, raceFont, sx, sy, toTile } from "./iso";
import { BUILD_ANIM, drawConstruction, drawFog, drawGround, drawPreview, hitBox, WORLD_BOUNDS, zoneCenter, type Drawable, type DrawInfo } from "./scene";
import type { StructureType } from "@/game/types";
import { applyLighting, skyAt, type TimeMode } from "./lighting";
import { Traffic, type TrafficWorld, type VehiclePick } from "./traffic";
import type { CarModel } from "./vehicles";

export type MapTarget = { kind: "plot"; id: string } | { kind: "zone"; id: ZoneId } | { kind: "vehicle"; v: VehiclePick } | null;

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
  /** Lowered automatically when the device can't hold a smooth frame rate. */
  private maxDpr = 2;
  /** Battery saver: 1× resolution, 30 FPS, half the traffic, no clouds or sea shimmer. */
  private low = false;
  private skip = 0;
  private slow = { frames: 0, time: 0 };
  private scene: Drawable[] = [];
  private unlocked = new Set<string>();
  readonly traffic = new Traffic();
  /** Race cars on the circuit (set by the map component, which knows the state). */
  race: RaceLayer | null = null;
  /** Whether the Racing District is built (it is drawn faded until then). */
  racingOpen = false;
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
  /** Day, evening, night or the automatic cycle. */
  timeMode: TimeMode = "auto";
  /** BUILD mode: plots to highlight and how (green / yellow / red). */
  /** BUILD mode: every building plot coloured by its status. */
  buildInfo: Map<string, PlotStatus> | null = null;
  /** A building being previewed on a plot before it is bought. */
  preview: { plot: string; type: StructureType } | null = null;
  private sigs = new Map<string, string>();
  private anims = new Map<string, { start: number; upgrade: boolean; announce?: string }>();
  private banners: { x: number; y: number; text: string; age: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private onTap: (t: MapTarget) => void,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.painter = new Painter(this.ctx);
    this.painter.season = seasonAt(Date.now());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    const [hx, hy] = this.homeTile();
    // close enough to read the cars' details (sprites are re-rendered sharper)
    this.cam.maxZoom = 4;
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

  /** Where the camera starts: the body works between the depot and the market. */
  private homeTile(): [number, number] {
    return this.cam.w < 700 ? [23 + LEGACY_TILES, 9 + LEGACY_TILES] : [25 + LEGACY_TILES, 8 + LEGACY_TILES];
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.cam.w = Math.max(1, r.width);
    this.cam.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cam.w * this.dpr);
    this.canvas.height = Math.round(this.cam.h * this.dpr);
    this.cam.minZoom = Math.max(0.09, Math.min(this.cam.w / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX), 0.5) * 0.9);
    if (!this.running) this.render(0);
  }

  setScene(scene: Drawable[], unlocked: Set<string>, world: TrafficWorld) {
    // anything that changed on a plot gets a construction animation
    const first = this.sigs.size === 0;
    for (const d of scene) {
      if (!d.pickId || !d.sig) continue;
      const old = this.sigs.get(d.pickId);
      if (!first && old !== undefined && old !== d.sig && d.sig !== "lot") {
        // a finished site only loses its scaffolding: animate it like an upgrade
        const upgrade = old !== "lot" && (old.startsWith("site:") || old.split(":")[0] === d.sig.split(":")[0]);
        this.anims.set(d.pickId, { start: this.t, upgrade, announce: d.announce });
      }
      this.sigs.set(d.pickId, d.sig);
    }
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
      // low graphics: draw every other frame (~30 FPS)
      if (this.low && (this.skip = this.skip ^ 1)) {
        this.raf = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
      this.adaptQuality(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setLowGraphics(on: boolean) {
    if (this.low === on) return;
    this.low = on;
    this.traffic.density = on ? 0.5 : 1;
    this.maxDpr = on ? 1 : 2;
    this.resize();
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

  private followUntil = 0;
  /** The vehicle in the showcase: the camera glides after it until the player pans. */
  private tracked: { ref: object; x: number; y: number; zoom: number } | null = null;

  /** Starts (or, with null, stops) following a vehicle with a close-up camera. */
  track(ref: object | null) {
    this.tracked = ref ? { ref, x: NaN, y: NaN, zoom: NaN } : null;
  }

  /**
   * FIRST CAR COMPLETED: zoom in on the assembly plant and follow the car as
   * it rolls out for `seconds`.
   */
  celebrateFirstCar(plotId: string, model: CarModel, color: string, seconds = 6) {
    const plot = WORLD_MAP.plotById[plotId];
    if (!plot) return;
    this.traffic.rollOut({ id: plotId, entry: plot.entry, weight: 1 }, model, color);
    this.focusPlot(plotId, { x: 0, y: 0 }, 2.2, 0.9);
    this.followUntil = this.t + seconds;
  }

  pop(plotId: string, text: string, color = "#fde047") {
    const p = WORLD_MAP.plotById[plotId];
    if (!p) return;
    // above the building's label
    this.pops.push({ x: p.x + p.w / 2, y: p.y + p.d / 2, z: p.big ? 130 : 95, text, color, age: 0 });
    if (this.pops.length > 40) this.pops.shift();
  }

  private burst(plotId: string, text: string, color: string) {
    this.pop(plotId, text, color);
  }

  // ───────────────────────── input ─────────────────────────

  private pick(px: number, py: number): MapTarget {
    const [wx, wy] = this.cam.toWorld(px, py);
    // vehicles first: they drive in front of the buildings
    const v = this.traffic.pickVehicle(wx, wy, Math.max(9, 14 / this.cam.zoom));
    if (v) return { kind: "vehicle", v };
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
    if (avg > 1 / 45) {
      this.maxDpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    }
  }

  private render(dt: number) {
    const { ctx, painter: p, cam } = this;
    this.t += dt;
    cam.update(dt);
    this.traffic.update(dt);
    const hero = this.traffic.hero;
    if (hero && this.t < this.followUntil && this.t > this.followUntil - 5.2) {
      // ease the camera along with the first car
      const k = Math.min(1, dt * 2.5);
      cam.x += (sx(hero.rx, hero.ry) - cam.x) * k;
      cam.y += (sy(hero.rx, hero.ry, 10) - cam.y) * k;
    }

    const tr = this.tracked;
    if (tr) {
      const pos = this.traffic.positionOf(tr.ref);
      // the player dragged or zoomed: let go, but keep the showcase open
      const moved = !Number.isNaN(tr.x) && (Math.abs(cam.x - tr.x) > 1 || Math.abs(cam.y - tr.y) > 1 || Math.abs(cam.zoom - tr.zoom) > 0.001);
      if (!pos || moved) this.tracked = null;
      else {
        cam.stop();
        const k = Math.min(1, dt * 3);
        cam.x += (sx(pos[0], pos[1]) - cam.x) * k;
        // on phones the showroom card covers the lower half: keep the car above it
        const lift = cam.w < 768 ? (cam.h * 0.2) / cam.zoom : 0;
        cam.y += (sy(pos[0], pos[1], 6) + lift - cam.y) * k;
        cam.zoom *= Math.pow(Math.min(cam.maxZoom, 3) / cam.zoom, Math.min(1, dt * 1.6));
        cam.clamp();
        tr.x = cam.x;
        tr.y = cam.y;
        tr.zoom = cam.zoom;
      }
    }

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
    // bright cartoon sea
    bg.addColorStop(0, "#2aa7e0");
    bg.addColorStop(1, "#1781c4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.proj = null;
    const sky = skyAt(this.timeMode, this.t);
    p.night = sky.dark;
    p.zoom = cam.zoom;
    p.dpr = this.dpr;
    p.lights.length = 0;

    // sea shimmer around the island
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    const view = cam.view();
    for (let i = 0; i < (this.low ? 0 : 18); i++) {
      const wx = view[0] + ((i * 397 + this.t * 8) % (view[2] - view[0] + 1));
      const wy = view[1] + ((i * 211) % (view[3] - view[1] + 1));
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 26, wy);
      ctx.stroke();
    }

    this.drawShips();
    drawGround(p, this.unlocked, view, this.t);
    drawRacingGround(p, this.racingOpen);

    const info: DrawInfo = { zoom: cam.zoom, selected: this.selected, t: this.t };
    const inView = (b: [number, number, number, number]) => b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3];

    // merge static scene with moving traffic, both sorted by depth
    const moving = [...this.traffic.drawables(), ...networkTraffic(this.t, this.unlocked, this.traffic.density, this.cam.zoom), ...(this.race?.drawables(this.t) ?? [])].sort((a, b) => a.depth - b.depth);
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
      const anim = d.pickId ? this.anims.get(d.pickId) : undefined;
      if (anim) {
        const age = this.t - anim.start;
        if (age >= BUILD_ANIM) {
          this.anims.delete(d.pickId!);
          const plot = WORLD_MAP.plotById[d.pickId!];
          if (anim.announce && plot) this.banners.push({ x: plot.x + plot.w / 2, y: plot.y + plot.d / 2, text: anim.announce, age: 0 });
          d.draw(p, info);
        } else drawConstruction(p, d.pickId!, age, anim.upgrade, () => d.draw(p, info), d.bbox);
      } else d.draw(p, info);
      if (this.preview && this.preview.plot === d.pickId) drawPreview(p, this.preview.plot, this.preview.type, this.t);
      visible.push(d);
    }
    drawMoving(Infinity);
    p.dim = false;
    applyLighting(ctx, sky, p.lights, view);

    // BUILD mode: dim the city, light up the plots by availability
    if (this.buildInfo) {
      // subtle: a light veil, then each plot tinted by its status
      ctx.fillStyle = "rgba(2,6,23,0.3)";
      ctx.fillRect(view[0] - 10, view[1] - 10, view[2] - view[0] + 20, view[3] - view[1] + 20);
      const pulse = 0.5 + 0.15 * Math.sin(this.t * 2.5);
      const fills: Record<PlotStatus, string> = {
        available: `rgba(74,222,128,${pulse * 0.45})`,
        owned: "rgba(56,189,248,0.3)",
        construction: "rgba(250,204,21,0.28)",
        operational: "rgba(255,255,255,0.06)",
        locked: "rgba(100,116,139,0.22)",
      };
      const lines: Record<PlotStatus, string> = { available: "#86efac", owned: "#7dd3fc", construction: "#fde047", operational: "rgba(255,255,255,0.35)", locked: "rgba(148,163,184,0.5)" };
      for (const [id, st] of this.buildInfo) {
        const pl = WORLD_MAP.plotById[id];
        if (!pl) continue;
        p.quad(pl.x + 0.3, pl.y + 0.3, pl.w - 0.6, pl.d - 0.6, fills[st]);
        p.quadStroke(pl.x + 0.3, pl.y + 0.3, pl.w - 0.6, pl.d - 0.6, lines[st], st === "operational" ? 1 : 1.6, st === "locked" ? [5, 5] : undefined);
      }
    }
    drawFog(p, this.unlocked, this.t);
    if (!this.low) this.drawClouds();

    // labels and pops in screen pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    p.proj = (x, y, zz) => cam.toScreen(sx(x, y), sy(x, y, zz));
    for (const d of visible) d.label?.(p, info);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = raceFont(900, 16);
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

    // "Garage #01 · Lv 4" banners when a construction finishes
    for (const b of this.banners) {
      b.age += dt;
      const k = b.age / 2.6;
      if (k >= 1) continue;
      const [px, py0] = p.at(b.x, b.y, 90);
      const py = py0 - k * 26;
      const scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.45 : k < 0.2 ? 1.05 - ((k - 0.12) / 0.08) * 0.05 : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      ctx.translate(px, py);
      ctx.scale(scale, scale);
      ctx.font = raceFont(900, 17);
      const text = `★ ${b.text}`;
      const tw = ctx.measureText(text).width + 28;
      const g = ctx.createLinearGradient(0, -16, 0, 16);
      g.addColorStop(0, "#fde68a");
      g.addColorStop(1, "#d97706");
      ctx.beginPath();
      ctx.roundRect(-tw / 2, -16, tw, 32, 16);
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(251,191,36,0.8)";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1c1917";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 1);
      ctx.restore();
    }
    this.banners = this.banners.filter((b) => b.age < 2.6);
    p.proj = null;

    // HTML cards over locked zones
    const cards = this.overlay?.children ?? [];
    for (const node of cards) {
      const el = node as HTMLElement;
      const id = el.dataset.zone as ZoneId | "racing" | `t:${TerritoryId}` | undefined;
      if (!id) continue;
      const c = id === "racing" ? RACING_CENTER : id.startsWith("t:") ? territoryCenterTile(id.slice(2) as TerritoryId) : zoneCenter(id as ZoneId);
      const [px, py] = cam.toScreen(sx(c.x, c.y), sy(c.x, c.y));
      const off = px < -200 || py < -200 || px > cam.w + 200 || py > cam.h + 200;
      // far out, the cards shrink so the whole region stays readable
      const k = Math.max(0.5, Math.min(1, cam.zoom * 2.4));
      el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -50%) scale(${k.toFixed(2)})`;
      el.style.visibility = off ? "hidden" : "visible";
    }
  }
}
