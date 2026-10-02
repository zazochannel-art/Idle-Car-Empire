// The factory floor: an isometric hall with the plant's production line.
// Raw material comes in at one end, every station transforms the unit, the
// finished goods stack up by the loading dock where the trucks wait. On the
// assembly plant the car body travels through nine stations and gains its
// engine, wheels and paint on the way.
import { attachControls, Camera } from "../map/camera";
import { Painter, sx, sy } from "../map/iso";
import { forklift, robotArm, tireStack } from "../map/props";
import { drawModel, drawTruck, type CarModel } from "../map/vehicles";
import { drawRoom, WALL_H } from "../garage/interior";

export interface FloorScene {
  type: string;
  level: number;
  automation: number;
  /** Progress of the current batch 0..1, and whether the line is moving. */
  progress: number;
  running: boolean;
  steps: string[];
  /** Fill levels 0..1 of raw material and finished goods. */
  raw: number;
  out: number;
  /** Trucks at the dock (loading) and away on the road. */
  docked: number;
  color: string;
  item: string;
  /** Assembly: the model and its paint colour. */
  model?: CarModel;
  paint?: string;
  accent: string;
}

const MODEL_COLOR = "#cbd5e1";

export class FloorEngine {
  readonly cam = new Camera({ minX: -800, maxX: 800, minY: -300, maxY: 900 });
  private ctx: CanvasRenderingContext2D;
  private p: Painter;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private t = 0;
  /** Smoothed conveyor position so the line glides between ticks. */
  private belt = 0;
  private scene: FloorScene | null = null;
  private size: [number, number] = [12, 8];
  private detach: () => void;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.p = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.detach = attachControls(canvas, this.cam, { onTap: () => {} });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cam.w = Math.max(1, r.width);
    this.cam.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cam.w * this.dpr);
    this.canvas.height = Math.round(this.cam.h * this.dpr);
    this.fit();
  }

  private fit() {
    const [gw, gd] = this.size;
    const width = (gw + gd) * 32 + 60;
    const height = (gw + gd) * 16 + WALL_H + 60;
    const zoom = Math.min(this.cam.w / width, this.cam.h / height) * 0.96;
    this.cam.minZoom = Math.max(0.2, zoom * 0.7);
    this.cam.maxZoom = Math.max(2.5, zoom * 3);
    this.cam.bounds = { minX: sx(0, gd), maxX: sx(gw, 0), minY: sy(0, 0, WALL_H), maxY: sy(gw, gd) };
    this.cam.x = (sx(0, gd) + sx(gw, 0)) / 2;
    this.cam.y = (sy(0, 0, WALL_H) + sy(gw, gd)) / 2;
    this.cam.zoom = zoom;
  }

  setScene(s: FloorScene) {
    const stations = s.steps.length;
    const size: [number, number] = [Math.max(10, stations * 2 + 4), 7 + Math.min(4, Math.floor(s.level / 2))];
    const grew = size[0] !== this.size[0] || size[1] !== this.size[1];
    this.size = size;
    if (!this.scene) this.belt = s.progress;
    this.scene = s;
    if (grew) this.fit();
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

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.detach();
    this.ro.disconnect();
  }

  private render(dt: number) {
    this.t += dt;
    const { ctx, p, cam } = this;
    cam.update(dt);
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.zoom = cam.zoom;
    p.night = 0;
    p.lights.length = 0;
    const s = this.scene;
    if (!s) return;
    const [gw, gd] = this.size;
    drawRoom(p, gw, gd, s.accent, this.t);

    // the belt follows the batch progress, wrapping at each new unit
    let target = s.progress;
    if (target < this.belt - 0.5) target += 1;
    if (s.running) this.belt += (target - this.belt) * Math.min(1, dt * 6);
    if (this.belt >= 1) this.belt -= 1;

    const n = s.steps.length;
    const y0 = gd / 2 - 0.5;
    const x0 = 2;
    const span = gw - 4;
    const stationX = (i: number) => x0 + (i + 0.5) * (span / n);

    // raw material bay at the back left, finished goods by the dock (front right)
    for (let i = 0; i < Math.round(s.raw * 8); i++) {
      const bx = 0.3 + (i % 2) * 0.6;
      const by = 0.4 + Math.floor(i / 2) * 0.55;
      p.box(bx, by, 0.5, 0.45, 0, 7, s.type === "tireFactory" ? "#57534e" : "#a8a29e");
    }
    // conveyor
    p.box(x0, y0, span, 1, 0, 5, "#374151", "#1f2937");
    const c = ctx;
    c.strokeStyle = "rgba(250,204,21,0.55)";
    c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k < span * 3; k++) {
      const u = x0 + ((k / 3 + (s.running ? this.t * 0.6 : 0)) % span);
      c.moveTo(sx(u, y0), sy(u, y0, 5));
      c.lineTo(sx(u, y0 + 1), sy(u, y0 + 1, 5));
    }
    c.stroke();

    // stations: machines behind the belt, arms or workers in front
    const robots = s.automation;
    for (let i = 0; i < n; i++) {
      const x = stationX(i);
      const active = s.running && Math.floor(this.belt * n) === i;
      p.box(x - 0.45, y0 - 1.25, 0.9, 0.8, 0, 16 + (i % 2) * 4, i === n - 1 ? "#0f766e" : "#475569", "#64748b");
      p.onLeft(x - 0.45, y0 - 0.45, 0, 0.15, 0.75, 8, 13, active ? "#38bdf8" : "#1e293b");
      if (active) p.light(sx(x, y0 - 0.45), sy(x, y0 - 0.45, 10), 18, "#7dd3fc", 0.6);
      if (i < robots + 1 && i % 2 === 0) robotArm(p, x - 0.3, y0 + 1.3, this.t + i, active);
      else p.person(x + 0.1, y0 + 1.5, i % 3 ? "#f59e0b" : "#3b82f6", this.t * 3 + i);
      p.tag(s.steps[i], x, y0 - 0.9, 28, { size: 9, bg: active ? "rgba(14,165,233,0.92)" : "rgba(15,23,42,0.8)" });
    }

    // the units on the belt: one per station, each a step further along
    for (let i = 0; i < n; i++) {
      const u = (i + this.belt) / n;
      const x = x0 + u * span;
      const stage = Math.min(n - 1, Math.floor(u * n));
      this.drawUnit(s, x, y0 + 0.5, stage, n);
    }

    // finished goods racks next to the dock
    const fx = gw - 1.6;
    for (let i = 0; i < Math.round(s.out * 10); i++) {
      const bx = fx + (i % 2) * 0.6;
      const by = gd - 1.2 - Math.floor(i / 2) * 0.55;
      if (s.type === "assemblyPlant") continue;
      if (s.type === "tireFactory") tireStack(p, bx + 0.25, by + 0.2, 3);
      else p.box(bx, by, 0.5, 0.45, 0, 8, s.color, undefined);
    }
    if (s.type === "assemblyPlant") {
      for (let i = 0; i < Math.min(4, Math.round(s.out * 4)); i++) drawModel(p, gw - 1.2, gd - 1 - i * 1.1, 2, s.model ?? "sedan", s.paint ?? "#ef4444", 1);
    }
    // a forklift shuttles finished goods to the dock
    forklift(p, gw - 2.6, 1.2, gw - 2.6, gd - 1.5, this.t * 0.25, 3);
    // trucks waiting at the dock outside the front wall
    for (let i = 0; i < Math.min(2, s.docked); i++) drawTruck(p, gw + 0.9, gd - 1.2 - i * 1.6, 1, s.color, 1);

    if (!s.running) {
      // warning beacon over the line
      const on = Math.sin(this.t * 6) > 0;
      p.box(x0 + span / 2 - 0.15, y0 - 0.15, 0.3, 0.3, 22, 4, on ? "#f59e0b" : "#78350f");
      if (on) p.light(sx(x0 + span / 2, y0), sy(x0 + span / 2, y0, 24), 40, "#f59e0b", 0.7);
    }
    ctx.globalCompositeOperation = "lighter";
    for (const l of p.lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, l.color + "88");
      g.addColorStop(1, l.color + "00");
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** One unit on the line, drawn as it looks after `stage` of `n` steps. */
  private drawUnit(s: FloorScene, x: number, y: number, stage: number, n: number) {
    const p = this.p;
    const k = stage / (n - 1);
    if (s.type === "assemblyPlant") {
      // primer shell → painted car (station 7 of 9 is the paint shop)
      const painted = stage >= 6;
      drawModel(p, x, y, 0, s.model ?? "sedan", painted ? (s.paint ?? "#ef4444") : MODEL_COLOR, 1, { lift: 5, noShadow: true });
      if (stage >= 8) p.light(sx(x, y), sy(x, y, 10), 22, "#facc15", 0.5);
      return;
    }
    const z = 5;
    switch (s.type) {
      case "bodyWorks":
        if (stage === 0) p.box(x - 0.35, y - 0.3, 0.7, 0.6, z, 1.5, "#9ca3af");
        else if (stage < n - 1) p.box(x - 0.4, y - 0.3, 0.8, 0.6, z, 2 + stage * 2, "#b6bec9", "#d1d5db");
        else drawModel(p, x, y, 0, "sedan", "#9aa4b2", 0.8, { lift: z, noShadow: true });
        if (stage === 2 && Math.sin(this.t * 20) > 0.3) p.light(sx(x, y), sy(x, y, 10), 14, "#fde68a", 0.9);
        break;
      case "engineFactory":
        p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 4 + k * 5, stage === n - 1 ? "#b91c1c" : "#78716c", "#a8a29e");
        if (stage >= 2) for (let c = 0; c < 3; c++) p.box(x - 0.2 + c * 0.17, y - 0.1, 0.1, 0.2, z + 9, 2, "#d6d3d1");
        break;
      case "interiorFactory":
        p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 3, stage === 0 ? "#d6d3d1" : "#a16207");
        if (stage >= 2) p.box(x - 0.3, y - 0.25, 0.15, 0.5, z + 3, 7, "#78350f");
        break;
      case "glassFactory":
        p.box(x - 0.4, y - 0.05, 0.8, 0.1, z, 2 + k * 7, stage === 1 ? "#fb923c" : "#bae6fd", "#e0f2fe", false);
        if (stage === 1) p.light(sx(x, y), sy(x, y, 8), 18, "#fb923c", 0.8);
        break;
      case "tireFactory":
        p.ellipse(x, y, z + 2, 6 + k * 3, stage === 0 ? "#57534e" : "#111827", 0.5);
        if (stage === n - 1) p.ellipse(x, y, z + 2.5, 3, "#9ca3af", 0.5);
        break;
      case "paintFactory":
        p.box(x - 0.2, y - 0.2, 0.4, 0.4, z, 3 + k * 5, stage === n - 1 ? s.color : mixCan(k), "#e5e7eb");
        break;
      default:
        p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 2 + k * 3, stage === n - 1 ? s.color : "#64748b", "#94a3b8");
        if (stage >= 2) p.box(x - 0.2, y - 0.15, 0.4, 0.3, z + 2 + k * 3, 1, "#22c55e");
    }
  }
}

function mixCan(k: number) {
  const colors = ["#e5e7eb", "#f472b6", "#a855f7", "#3b82f6"];
  return colors[Math.min(colors.length - 1, Math.floor(k * colors.length))];
}
