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
import { sprites3d, tierFor, type SpriteSize } from "../three/sprites";
import { STATION_MACHINES } from "../three/industrial-models";

const MACHINE_SIZE: SpriteSize = { w: 84, h: 110, ax: 42, ay: 84 };
const ROBOT_SIZE: SpriteSize = { w: 70, h: 80, ax: 35, ay: 60 };

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
    ctx.fillStyle = "#2b2b2e";
    ctx.fillRect(0, 0, W, H);
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.zoom = cam.zoom;
    p.dpr = this.dpr;
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
    // the floor grows with the plant's level: 1 worker at a workbench, 2 workers,
    // a conveyor belt (3), more machines (4), automation (5), robots (6),
    // a second line (7), heavy machinery (8), a smart factory (9), Auto City (10)
    const L = s.level;
    const belts = L >= 7 ? [y0, y0 + 2.4] : [y0];

    // stations: the machine of each step stands behind the belt (every other one until Level 4)
    const kinds = STATION_MACHINES[s.type] ?? [];
    for (let i = 0; i < n; i++) {
      const x = stationX(i);
      const active = s.running && Math.floor(this.belt * n) === i;
      const kind = kinds[i % Math.max(1, kinds.length)];
      if (L < 4 && i % 2 === 1) {
        // a simple workbench where a machine will stand later
        p.box(x - 0.35, y0 - 1.0, 0.7, 0.5, 0, 6, "#7c5a3a", "#5b4129");
        continue;
      }
      if (!kind || !this.machine(kind, x, y0 - 0.85, active ? Math.floor(this.t * 5) % 4 : 0, s.accent)) {
        p.box(x - 0.45, y0 - 1.25, 0.9, 0.8, 0, 16 + (i % 2) * 4, i === n - 1 ? "#0f766e" : "#475569", "#64748b");
        p.onLeft(x - 0.45, y0 - 0.45, 0, 0.15, 0.75, 8, 13, active ? "#38bdf8" : "#1e293b");
      }
      if (active) p.light(sx(x, y0 - 0.45), sy(x, y0 - 0.45, 10), 18, "#7dd3fc", 0.6);
    }

    const c = ctx;
    // robots: one per automation tier (every other station), on every other station from Level 6
    const robots = L >= 6 ? n : s.automation * 2;
    // workers: 1 at Level 1, 2 at Level 2, then one per station without a robot
    const crew = L === 1 ? 1 : L === 2 ? 2 : n;
    belts.forEach((by, line) => {
      if (L >= 3) {
        // conveyor belt with moving slats
        p.box(x0, by, span, 1, 0, 5, "#374151", "#1f2937");
        c.strokeStyle = "rgba(250,204,21,0.55)";
        c.lineWidth = 1;
        c.beginPath();
        for (let k = 0; k < span * 3; k++) {
          const u = x0 + ((k / 3 + (s.running ? this.t * 0.6 : 0)) % span);
          c.moveTo(sx(u, by), sy(u, by, 5));
          c.lineTo(sx(u, by + 1), sy(u, by + 1, 5));
        }
        c.stroke();
        // Level 10: lit guide strips along the line
        if (L >= 10) p.light(sx(x0 + span / 2, by + 1.1), sy(x0 + span / 2, by + 1.1, 1), 60, "#22d3ee", 0.25);
      } else {
        // before the belt: units are carried from bench to bench
        for (let i = 0; i < n; i++) p.box(stationX(i) - 0.4, by + 0.05, 0.8, 0.9, 0, 4, "#8b6a48", "#6b5136");
      }

      // the units on the line: one per station, each a step further along
      const phase = line === 0 ? this.belt : (this.belt + 0.5) % 1;
      for (let i = 0; i < n; i++) {
        const u = (i + phase) / n;
        const x = x0 + u * span;
        const stage = Math.min(n - 1, Math.floor(u * n));
        this.drawUnit(s, x, by + 0.5, stage, n);
      }

      // in front of the line: robot arms on automated stations, workers on the others
      let staffed = 0;
      for (let i = 0; i < n; i++) {
        const x = stationX(i);
        const active = s.running && Math.floor(phase * n) === i;
        if (i < robots && i % 2 === 0) {
          if (!this.robot(x - 0.3, by + 1.3, active ? Math.floor(this.t * 5 + i) % 4 : 0, i)) robotArm(p, x - 0.3, by + 1.3, this.t + i, active);
        } else if (staffed < crew) {
          staffed++;
          p.person(x + 0.1, by + 1.5, i % 3 ? "#f59e0b" : "#3b82f6", this.t * 3 + i + line);
        }
      }
    });
    for (let i = 0; i < n; i++) {
      const active = s.running && Math.floor(this.belt * n) === i;
      p.tag(s.steps[i], stationX(i), y0 - 0.9, 34, { size: 9, bg: active ? "rgba(14,165,233,0.92)" : "rgba(15,23,42,0.8)" });
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

  /** A station's 3D machine; false until its sprite is ready. */
  private machine(kind: string, x: number, y: number, pose: number, accent: string) {
    const k = tierFor(this.cam.zoom * this.dpr);
    const spr = sprites3d.get(`mach|${kind}|${pose}|${accent}`, MACHINE_SIZE, k, (T, { kit, industrial }) =>
      industrial.buildMachine(T, kit, kind as Parameters<typeof industrial.buildMachine>[2], pose, accent),
    );
    if (!spr) return false;
    this.ctx.drawImage(spr.img, sx(x, y) - MACHINE_SIZE.ax, sy(x, y, 0) - MACHINE_SIZE.ay, MACHINE_SIZE.w, MACHINE_SIZE.h);
    return true;
  }

  /** A six-axis robot reaching over the belt; false until its sprite is ready. */
  private robot(x: number, y: number, pose: number, i: number) {
    const k = tierFor(this.cam.zoom * this.dpr);
    const tool = (["torch", "gripper", "suction", "spray"] as const)[i % 4];
    const spr = sprites3d.get(`robot|${pose}|${tool}`, ROBOT_SIZE, k, (T, { kit, industrial }) => {
      const r = industrial.buildRobot(T, kit, pose, "#f59e0b", tool);
      r.rotation.y = Math.PI / 2;
      return r;
    });
    if (!spr) return false;
    this.ctx.drawImage(spr.img, sx(x, y) - ROBOT_SIZE.ax, sy(x, y, 0) - ROBOT_SIZE.ay, ROBOT_SIZE.w, ROBOT_SIZE.h);
    return true;
  }

  /** One unit on the line, with station-by-station visual assembly detail. */
  private drawUnit(s: FloorScene, x: number, y: number, stage: number, n: number) {
    const p = this.p;
    const k = n <= 1 ? 1 : stage / (n - 1);
    const z = 5;

    if (s.type === "assemblyPlant") {
      const model = s.model ?? "sedan";
      const painted = stage >= 6;
      drawModel(
        p,
        x,
        y,
        0,
        model,
        painted ? (s.paint ?? "#ef4444") : MODEL_COLOR,
        1,
        { lift: 5, noShadow: true, stage, odo: x },
      );

      // Stage-specific work happening on the actual car.
      if (stage === 0) {
        // Bare body: welding points and a moving welding torch.
        p.light(sx(x - 0.35, y), sy(x - 0.35, y, 14), 13, "#fde68a", 0.75);
        p.light(sx(x + 0.28, y + 0.08), sy(x + 0.28, y + 0.08, 12), 9, "#fbbf24", 0.55);
        if (Math.sin(this.t * 28 + x) > 0.15) {
          p.light(sx(x + 0.15, y - 0.1), sy(x + 0.15, y - 0.1, 18), 20, "#fff7ed", 0.95);
        }
      } else if (stage === 1) {
        // Engine installation: animated lift beam above the engine bay.
        const lift = 13 + Math.sin(this.t * 3) * 2;
        p.box(x - 0.05, y - 0.15, 0.1, 0.1, lift, 3, "#f59e0b");
        p.light(sx(x, y), sy(x, y, lift), 12, "#fbbf24", 0.45);
      } else if (stage === 2) {
        // Suspension: visible hubs/struts.
        p.ellipse(x - 0.42, y + 0.22, 8, 3.2, "#475569", 0.75);
        p.ellipse(x + 0.42, y + 0.22, 8, 3.2, "#475569", 0.75);
      } else if (stage === 3) {
        // Interior: seats appear as two warm blocks.
        p.box(x - 0.24, y - 0.04, 0.2, 0.24, 9, 5, "#78350f", "#a16207");
        p.box(x + 0.04, y - 0.04, 0.2, 0.24, 9, 5, "#78350f", "#a16207");
      } else if (stage === 4) {
        // Glass installation: blue panes slide into position.
        p.box(x - 0.3, y - 0.32, 0.6, 0.08, 12, 5, "#7dd3fc", "#e0f2fe", false);
        p.light(sx(x, y), sy(x, y, 12), 16, "#7dd3fc", 0.3);
      } else if (stage === 5) {
        // Wheels: four rotating wheel silhouettes.
        const spin = Math.sin(this.t * 8) * 0.08;
        p.ellipse(x - 0.48, y + 0.22, 7, 2.8 + spin, "#111827", 0.8);
        p.ellipse(x + 0.48, y + 0.22, 7, 2.8 - spin, "#111827", 0.8);
      } else if (stage === 6) {
        // Paint booth: spray mist follows the car.
        for (let i = 0; i < 5; i++) {
          const a = this.t * 2 + i * 1.2;
          p.light(sx(x + Math.sin(a) * 0.35, y - 0.15), sy(x + Math.sin(a) * 0.35, y - 0.15, 11 + i), 7, s.paint ?? s.color, 0.28);
        }
        p.light(sx(x, y), sy(x, y, 13), 18, s.paint ?? s.color, 0.35);
      } else if (stage === 7) {
        // Final assembly: headlights/taillights come alive.
        p.light(sx(x - 0.36, y - 0.03), sy(x - 0.36, y - 0.03, 11), 8, "#fef3c7", 0.8);
        p.light(sx(x + 0.36, y - 0.03), sy(x + 0.36, y - 0.03, 11), 8, "#fef3c7", 0.8);
      } else {
        // Quality control: scanning beam and green confirmation.
        const scan = (Math.sin(this.t * 4) + 1) * 0.5;
        p.light(sx(x - 0.45 + scan * 0.9, y), sy(x - 0.45 + scan * 0.9, y, 16), 12, "#22c55e", 0.7);
        p.light(sx(x, y), sy(x, y, 13), 10, "#4ade80", 0.45);
      }
      return;
    }

    switch (s.type) {
      case "bodyWorks":
        if (stage === 0) p.box(x - 0.35, y - 0.3, 0.7, 0.6, z, 1.5, "#9ca3af");
        else if (stage < n - 1) p.box(x - 0.4, y - 0.3, 0.8, 0.6, z, 2 + stage * 2, "#b6bec9", "#d1d5db");
        else drawModel(p, x, y, 0, "sedan", "#9aa4b2", 0.8, { lift: z, noShadow: true, stage: 1 });
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
