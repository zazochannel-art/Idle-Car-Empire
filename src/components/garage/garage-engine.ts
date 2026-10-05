// Runs the garage interior canvas: camera, facilities, mechanics, cars
// cycling through the stations, and the placement ghost.
import { FACILITY_BY_ID } from "@/game/config/city";
import { footprint, type StationStats } from "@/game/engine/city";
import type { FacilityType, PlacedFacility } from "@/game/types";
import { attachControls, Camera } from "../map/camera";
import { Painter, raceFont, sx, sy, toTile } from "../map/iso";
import { carColorFor, drawFacility, drawRoom, workerSpot, WALL_H, type FacilityDraw } from "./interior";

export interface Ghost {
  type: FacilityType;
  x: number;
  y: number;
  rot: 0 | 1;
  valid: boolean;
  /** Moving an existing facility rather than building a new one. */
  uid?: number;
}

export interface GarageScene {
  grid: [number, number];
  facilities: PlacedFacility[];
  stations: StationStats[];
  accent: string;
}

export interface GarageHandlers {
  onTapTile: (x: number, y: number) => void;
  onTapFacility: (uid: number) => void;
  onGhostDrag: (x: number, y: number) => void;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  age: number;
}

export class GarageEngine {
  readonly cam = new Camera({ minX: -600, maxX: 600, minY: -200, maxY: 800 });
  private ctx: CanvasRenderingContext2D;
  private p: Painter;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private t = 0;
  private scene: GarageScene = { grid: [8, 8], facilities: [], stations: [], accent: "#3b82f6" };
  private ghost: Ghost | null = null;
  private selected: number | null = null;
  private hoverTile: { x: number; y: number } | null = null;
  private pops: Pop[] = [];
  private cycles = new Map<number, number>();
  private offsets = new Map<number, number>();
  private detach: () => void;
  private ro: ResizeObserver;
  money: (n: number) => string = (n) => `$${Math.round(n)}`;

  constructor(
    private canvas: HTMLCanvasElement,
    private h: GarageHandlers,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.p = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.detach = attachControls(canvas, this.cam, {
      onTap: (x, y) => this.tap(x, y),
      onHover: (x, y) => this.hover(x, y),
      onDragStart: (x, y) => this.dragStart(x, y),
      onDragMove: (x, y) => this.dragMove(x, y),
    });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cam.w = Math.max(1, r.width);
    this.cam.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cam.w * this.dpr);
    this.canvas.height = Math.round(this.cam.h * this.dpr);
    this.fit(false);
  }

  /** Frames the whole room. */
  fit(animate = true) {
    const [gw, gd] = this.scene.grid;
    const width = (gw + gd) * 32 + 80;
    const height = (gw + gd) * 16 + WALL_H + 80;
    const zoom = Math.min(this.cam.w / width, this.cam.h / height) * 0.98;
    const cx = (sx(0, gd) + sx(gw, 0)) / 2;
    const cy = (sy(0, 0, WALL_H) + sy(gw, gd)) / 2;
    this.cam.minZoom = Math.max(0.2, zoom * 0.7);
    this.cam.maxZoom = Math.max(2.5, zoom * 3);
    this.cam.bounds = { minX: sx(0, gd), maxX: sx(gw, 0), minY: sy(0, 0, WALL_H), maxY: sy(gw, gd) };
    if (animate) this.cam.flyTo(cx, cy, zoom, 0.5);
    else {
      this.cam.x = cx;
      this.cam.y = cy;
      this.cam.zoom = zoom;
    }
  }

  setScene(scene: GarageScene) {
    const grew = scene.grid[0] !== this.scene.grid[0] || scene.grid[1] !== this.scene.grid[1];
    this.scene = scene;
    if (grew) this.fit(true);
  }

  setGhost(g: Ghost | null) {
    this.ghost = g;
  }

  setSelected(uid: number | null) {
    this.selected = uid;
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

  // ───────────────────────── input ─────────────────────────

  private tileAt(px: number, py: number) {
    const [wx, wy] = this.cam.toWorld(px, py);
    const t = toTile(wx, wy);
    return { x: Math.floor(t.x), y: Math.floor(t.y), fx: t.x, fy: t.y };
  }

  private facilityAt(px: number, py: number): PlacedFacility | null {
    const [wx, wy] = this.cam.toWorld(px, py);
    // front-most first, testing the footprint lifted by a typical height
    const list = [...this.scene.facilities].sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const lift of [0, 14, 28]) {
      const t = toTile(wx, wy + lift);
      for (const f of list) {
        const fp = footprint(f.type, f.rot);
        if (t.x >= f.x && t.x < f.x + fp.w && t.y >= f.y && t.y < f.y + fp.d) return f;
      }
    }
    return null;
  }

  private tap(px: number, py: number) {
    const tile = this.tileAt(px, py);
    if (this.ghost) {
      this.h.onTapTile(tile.x, tile.y);
      return;
    }
    const f = this.facilityAt(px, py);
    if (f) this.h.onTapFacility(f.uid);
    else this.h.onTapTile(tile.x, tile.y);
  }

  private hover(px: number, py: number) {
    const tile = this.tileAt(px, py);
    this.hoverTile = { x: tile.x, y: tile.y };
    if (this.ghost) this.h.onGhostDrag(tile.x, tile.y);
    this.canvas.style.cursor = this.ghost ? "crosshair" : this.facilityAt(px, py) ? "pointer" : "grab";
  }

  private dragStart(px: number, py: number): boolean {
    const g = this.ghost;
    if (!g) return false;
    const tile = this.tileAt(px, py);
    const fp = footprint(g.type, g.rot);
    return tile.fx >= g.x - 0.5 && tile.fx < g.x + fp.w + 0.5 && tile.fy >= g.y - 0.5 && tile.fy < g.y + fp.d + 0.5;
  }

  private dragMove(px: number, py: number) {
    const tile = this.tileAt(px, py);
    this.h.onGhostDrag(tile.x, tile.y);
  }

  // ───────────────────────── rendering ─────────────────────────

  private render(dt: number) {
    const { ctx, p, cam } = this;
    this.t += dt;
    cam.update(dt);
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, Math.max(W, H) * 0.8);
    bg.addColorStop(0, "#1b2433");
    bg.addColorStop(1, "#070a10");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.zoom = cam.zoom;
    p.dpr = this.dpr;
    p.proj = null;

    const [gw, gd] = this.scene.grid;
    drawRoom(p, gw, gd, this.scene.accent, this.t);

    // hovered tile
    if (this.hoverTile && !this.ghost && this.hoverTile.x >= 0 && this.hoverTile.y >= 0 && this.hoverTile.x < gw && this.hoverTile.y < gd) {
      p.quad(this.hoverTile.x, this.hoverTile.y, 1, 1, "rgba(96,165,250,0.18)");
    }

    // Station progress drives the animations and the "+$" pops.
    const stationBy = new Map(this.scene.stations.map((s) => [s.uid, s]));
    const items: { depth: number; draw: () => void }[] = [];
    for (const f of this.scene.facilities) {
      if (this.ghost?.uid === f.uid) continue;
      const fp = footprint(f.type, f.rot);
      const st = stationBy.get(f.uid);
      let progress = 0;
      let cycle = 0;
      if (st?.staffed) {
        if (!this.offsets.has(f.uid)) this.offsets.set(f.uid, Math.random() * st.time);
        const raw = (this.t + this.offsets.get(f.uid)!) / st.time;
        cycle = Math.floor(raw);
        progress = raw - cycle;
        const prev = this.cycles.get(f.uid);
        if (prev !== undefined && cycle > prev) this.pops.push({ x: f.x + fp.w / 2, y: f.y + fp.d / 2, text: `+${this.money(st.perCar)}`, age: 0 });
        this.cycles.set(f.uid, cycle);
      }
      const fd: FacilityDraw = {
        uid: f.uid,
        type: f.type,
        x: f.x,
        y: f.y,
        w: fp.w,
        d: fp.d,
        staffed: FACILITY_BY_ID[f.type].fee ? !!st?.staffed : true,
        workstation: !!FACILITY_BY_ID[f.type].fee,
        progress,
        car: carColorFor(f.uid, cycle),
        door: [gw / 2, gd + 0.6],
      };
      const sel = this.selected === f.uid;
      items.push({
        depth: f.x + fp.w / 2 + f.y + fp.d / 2,
        draw: () => {
          if (sel) p.quad(f.x - 0.05, f.y - 0.05, fp.w + 0.1, fp.d + 0.1, "rgba(251,191,36,0.35)");
          drawFacility(p, fd, this.t);
          if (sel) p.quadStroke(f.x, f.y, fp.w, fp.d, "#fbbf24", 2.5);
        },
      });
      if (fd.workstation && fd.staffed) {
        const spot = workerSpot(fd, this.t);
        items.push({ depth: spot.x + spot.y, draw: () => mechanic(p, spot.x, spot.y, spot.phase) });
      }
      if (st?.staffed) {
        items.push({ depth: 1e6, draw: () => ring(p, f.x + fp.w / 2, f.y + fp.d / 2, progress, st.boosted) });
      }
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // ceiling lamps hanging over the floor
    for (let i = 2; i < gw; i += 4)
      for (let j = 2; j < gd; j += 4) {
        const lx = sx(i, j);
        const ly = sy(i, j, WALL_H + 8);
        ctx.strokeStyle = "rgba(148,163,184,0.5)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(lx, ly - 18);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = "#334155";
        ctx.beginPath();
        ctx.moveTo(lx - 7, ly + 4);
        ctx.lineTo(lx - 3, ly);
        ctx.lineTo(lx + 3, ly);
        ctx.lineTo(lx + 7, ly + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,247,214,0.95)";
        ctx.beginPath();
        ctx.ellipse(lx, ly + 4, 6, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

    // placement ghost
    const g = this.ghost;
    if (g) {
      const fp = footprint(g.type, g.rot);
      const ok = g.valid;
      p.quad(g.x, g.y, fp.w, fp.d, ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.38)");
      ctx.globalAlpha = 0.72;
      drawFacility(p, { uid: -1, type: g.type, x: g.x, y: g.y, w: fp.w, d: fp.d, staffed: true, workstation: false, progress: 0.5, car: "#94a3b8" }, this.t);
      ctx.globalAlpha = 1;
      p.quadStroke(g.x, g.y, fp.w, fp.d, ok ? "#4ade80" : "#f87171", 2.5);
      // snap grid around the ghost
      for (let i = 0; i <= fp.w; i++) p.line(g.x + i, g.y, g.x + i, g.y + fp.d, ok ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)", 1);
      for (let j = 0; j <= fp.d; j++) p.line(g.x, g.y + j, g.x + fp.w, g.y + j, ok ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)", 1);
    }

    // pops in screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = raceFont(800, 16);
    ctx.lineJoin = "round";
    for (const pop of this.pops) {
      pop.age += dt;
      const k = pop.age / 1.5;
      if (k >= 1) continue;
      const [px, py] = cam.toScreen(sx(pop.x, pop.y), sy(pop.x, pop.y, 50));
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(pop.text, px, py - k * 40);
      ctx.fillStyle = "#fde047";
      ctx.fillText(pop.text, px, py - k * 40);
    }
    ctx.globalAlpha = 1;
    this.pops = this.pops.filter((q) => q.age < 1.5);
  }
}

function mechanic(p: Painter, x: number, y: number, phase: number) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y);
  const bob = Math.abs(Math.sin(phase)) * 1.2;
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(px, py, 6, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1e3a8a";
  c.fillRect(px - 3.2, py - 9 - bob, 2.6, 9);
  c.fillRect(px + 0.6, py - 9 + bob * 0.5, 2.6, 9);
  c.fillStyle = "#2563eb";
  c.fillRect(px - 4, py - 19 - bob, 8, 11);
  c.fillStyle = "#f97316";
  c.fillRect(px - 4, py - 15 - bob, 8, 1.6);
  c.fillStyle = "#f1c27d";
  c.beginPath();
  c.arc(px, py - 22.5 - bob, 3.6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#facc15";
  c.beginPath();
  c.arc(px, py - 23.5 - bob, 3.8, Math.PI, 0);
  c.fill();
}

function ring(p: Painter, x: number, y: number, k: number, boosted: boolean) {
  const c = p.ctx;
  const px = sx(x, y);
  const py = sy(x, y, 64);
  c.beginPath();
  c.arc(px, py, 9, 0, Math.PI * 2);
  c.fillStyle = "rgba(8,12,20,0.75)";
  c.fill();
  c.beginPath();
  c.arc(px, py, 7, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  c.strokeStyle = boosted ? "#fbbf24" : "#4ade80";
  c.lineWidth = 3;
  c.stroke();
}
