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
  rawMaterial?: string;
  /** Interactive Body Works workshop inventory. */
  machineCount?: number;
  workers?: number;
  /** Localized station staffing badges. */
  staffedLabel?: string;
  vacantLabel?: string;
  cinematic?: boolean;
}

const MODEL_COLOR = "#cbd5e1";

export class FloorEngine {
  readonly cam = new Camera({ minX: -800, maxX: 800, minY: -300, maxY: 900 });
  private ctx: CanvasRenderingContext2D;
  private p: Painter;
  private dpr = 1;
  private maxDpr = 2;
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
  private perfFrames = 0;
  private perfTime = 0;
  private lastAdaptiveDpr = 0;
  private onMachineTap?: (index: number) => void;

  constructor(private canvas: HTMLCanvasElement, onMachineTap?: (index: number) => void) {
    this.onMachineTap = onMachineTap;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.p = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.detach = attachControls(canvas, this.cam, { onTap: (x, y) => this.selectMachineAt(x, y) });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
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

  private selectMachineAt(px: number, py: number) {
    const s = this.scene;
    if (!s || s.type !== "bodyWorks" || !s.machineCount || !this.onMachineTap) return;
    const n = s.steps.length;
    const [gw, gd] = this.size;
    const y0 = gd / 2 - 0.5;
    const span = gw - 4;
    const stationX = (i: number) => 2 + (i + 0.5) * (span / n);
    for (let i = 0; i < Math.min(s.machineCount, n); i++) {
      const x = stationX(i);
      const [sx0, sy0] = this.cam.toScreen(sx(x, y0 - 0.85), sy(x, y0 - 0.85) - 29);
      if (Math.abs(px - sx0) <= 42 * this.cam.zoom && Math.abs(py - sy0) <= 52 * this.cam.zoom) {
        this.onMachineTap(i);
        return;
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
      this.perfFrames++;
      this.perfTime += dt;
      if (this.perfFrames >= 90) {
        const avg = this.perfTime / this.perfFrames;
        this.perfFrames = 0;
        this.perfTime = 0;
        const nowDpr = this.dpr;
        const elapsed = performance.now() - this.lastAdaptiveDpr;
        if (avg > 1 / 42 && nowDpr > 1 && elapsed > 5000) {
          this.lastAdaptiveDpr = performance.now();
          this.maxDpr = Math.max(1, nowDpr - 0.25);
          this.resize();
        } else if (avg < 1 / 58 && nowDpr < (window.devicePixelRatio || 1) && elapsed > 12000) {
          // Restore detail only after sustained headroom, so quality can recover
          // when the factory becomes lighter without oscillating frame-to-frame.
          this.lastAdaptiveDpr = performance.now();
          this.maxDpr = Math.min(window.devicePixelRatio || 1, nowDpr + 0.25);
          this.resize();
        }
      }
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
    const s0 = this.scene;
    if (s0?.cinematic) {
      // Camera coordinates use the same isometric world units as the map, not
      // the factory grid coordinates. Convert the cinematic sweep through sx/sy
      // so the camera stays centered on the actual production floor.
      const pulse = (Math.sin(this.t * 0.22) + 1) * 0.5;
      const [gw, gd] = this.size;
      const targetX = sx(1 + pulse * Math.max(0, gw - 2), gd / 2);
      const targetY = sy(1 + pulse * Math.max(0, gw - 2), gd / 2, WALL_H * 0.35)
        + Math.sin(this.t * 0.16) * 8;
      cam.x += (targetX - cam.x) * Math.min(1, dt * 0.35);
      cam.y += (targetY - cam.y) * Math.min(1, dt * 0.3);
      cam.zoom += ((this.cam.minZoom * 1.35 + pulse * 0.25) - cam.zoom) * Math.min(1, dt * 0.25);
    }
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
    // A complete factory shift lasts about 45 seconds: day → evening → night.
    const shift = (this.t % 45) / 45;
    p.night = shift > 0.68 || shift < 0.08 ? 0.82 : shift > 0.52 ? 0.35 : 0;
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

    // Live logistics: pallets enter from the receiving dock, move toward the line,
    // while completed goods are staged and loaded for the next trip.
    const logisticsPhase = (this.t * 0.32) % 1;
    if (s.raw > 0.08) {
      for (let i = 0; i < 3; i++) {
        const u = (logisticsPhase + i / 3) % 1;
        const px = 0.7 + u * 2.2;
        const py = 0.55 + (i % 2) * 0.45;
        forklift(p, px, py, px + 0.8, py + 0.15, this.t * 0.7 + i, 2);
      }
    }

    // Receiving warehouse: racks, pallets and material-specific visual language.
    const rawColor = materialColor(s.rawMaterial, s.color);
    for (let r = 0; r < 3; r++) {
      p.box(0.15, 0.15 + r * 0.75, 1.05, 0.08, 6, 3, "#334155", "#64748b");
      p.box(0.18, 0.15 + r * 0.75, 0.06, 0.55, 6, 3, "#475569");
      p.box(1.1, 0.15 + r * 0.75, 0.06, 0.55, 6, 3, "#475569");
    }
    for (let i = 0; i < Math.round(s.raw * 8); i++) {
      const bx = 0.3 + (i % 2) * 0.6;
      const by = 0.4 + Math.floor(i / 2) * 0.55;
      p.box(bx, by, 0.5, 0.45, 0, 7, s.type === "tireFactory" ? "#57534e" : rawColor, "#d6d3d1");
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
      if (s.type === "bodyWorks" && i >= (s.machineCount ?? 1)) {
        p.box(x - 0.42, y0 - 1.0, 0.84, 0.55, 0, 6, "#374151", "#64748b");
        p.tag("BUILD", x, y0 - 0.9, 34, { size: 8, bg: "rgba(15,23,42,0.9)" });
        continue;
      }
      if (s.type === "bodyWorks") {
        // Each installed machine runs its own animation cycle instead of moving
        // only when the batch reaches that station. Staffing increases its cycle rate.
        const staffed = i < Math.min(s.workers ?? 1, s.machineCount ?? 1);
        const machineRate = staffed ? 5 : 2;
        const pose = s.running ? Math.floor(this.t * machineRate + i * 1.7) % 4 : 0;
        if (!kind || !this.machine(kind, x, y0 - 0.85, pose, s.accent)) {
          p.box(x - 0.45, y0 - 1.25, 0.9, 0.8, 0, 16, "#475569", "#64748b");
        }

        // A compact live cycle meter makes each station's independent activity
        // readable. It is a visual machine cycle, not the plant's economic timer.
        const cycleProgress = s.running ? (this.t * (staffed ? 0.18 : 0.07) + i * 0.23) % 1 : 0;
        p.box(x - 0.32, y0 - 0.2, 0.64, 0.1, 8, 1, "#111827", "#475569");
        if (cycleProgress > 0.01) {
          p.box(x - 0.31, y0 - 0.19, 0.62 * cycleProgress, 0.08, 9, 1,
            staffed ? "#22c55e" : "#f59e0b");
        }
        if (active) p.light(sx(x, y0 - 0.45), sy(x, y0 - 0.45, 10), 18, "#7dd3fc", 0.6);
        if (s.running && staffed && Math.sin(this.t * 9 + i) > 0.65) {
          p.light(sx(x, y0 - 0.55), sy(x, y0 - 0.55, 12), 10, "#4ade80", 0.35);
        }
        // Show staffing at the station itself so hiring has a visible, local effect.
        p.tag(staffed ? (s.staffedLabel ?? "STAFFED") : (s.vacantLabel ?? "HIRE"), x, y0 - 1.55, 34, {
          size: 7,
          bg: staffed ? "rgba(22,163,74,0.92)" : "rgba(180,83,9,0.9)",
        });
        continue;
      }
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
    const crew = s.type === "bodyWorks" ? Math.min(s.workers ?? 1, s.machineCount ?? 1) : L === 1 ? 1 : L === 2 ? 2 : n;
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
        if (s.type === "bodyWorks") {
          // In Body Works, each hired worker belongs to the matching numbered station.
          // Keep the on-floor worker aligned with the staffing badge shown above.
          if (i < crew) p.person(x + 0.1, by + 1.5, i % 3 ? "#f59e0b" : "#3b82f6", this.t * 3 + i + line);
        } else if (i < robots && i % 2 === 0) {
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
    // Loading animation: finished goods move onto the outbound dock before departure.
    if (s.out > 0.02) {
      const load = (Math.sin(this.t * 2.4) + 1) * 0.5;
      forklift(p, gw - 2.7 + load * 0.5, gd - 2.2, gw + 0.3, gd - 1.5, this.t * 0.45, 3);
      p.light(sx(gw - 1.7, gd - 1.1), sy(gw - 1.7, gd - 1.1, 8), 14, s.accent, 0.35);
    }

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
      case "bodyWorks": {
        // The body advances through five visibly different manufacturing stages.
        if (stage === 0) {
          // Incoming flat steel sheet on a pallet.
          p.box(x - 0.42, y - 0.28, 0.84, 0.56, z, 1.2, "#94a3b8", "#e2e8f0");
          p.box(x - 0.32, y - 0.2, 0.64, 0.4, z + 1.3, 0.35, "#cbd5e1", "#f1f5f9");
        } else if (stage === 1) {
          // Pressed floor pan and two stamped side panels.
          p.box(x - 0.42, y - 0.28, 0.84, 0.56, z, 1.8, "#9ca3af", "#d1d5db");
          p.box(x - 0.35, y - 0.24, 0.14, 0.48, z + 2, 2.2, "#cbd5e1", "#f8fafc");
          p.box(x + 0.21, y - 0.24, 0.14, 0.48, z + 2, 2.2, "#cbd5e1", "#f8fafc");
          p.light(sx(x, y), sy(x, y, 12 + Math.sin(this.t * 5) * 2), 10, "#fbbf24", 0.35);
        } else if (stage === 2) {
          // The shell takes shape while robotic welders join the panels.
          p.box(x - 0.4, y - 0.26, 0.8, 0.52, z, 3.2, "#9ca3af", "#d1d5db");
          p.box(x - 0.27, y - 0.18, 0.54, 0.36, z + 3.3, 1.2, "#64748b", "#cbd5e1", false);
          const spark = Math.sin(this.t * 20 + x) > 0.05;
          if (spark) {
            p.light(sx(x - 0.26, y), sy(x - 0.26, y, 12), 15, "#fde68a", 0.9);
            p.light(sx(x + 0.25, y + 0.08), sy(x + 0.25, y + 0.08, 11), 10, "#fb923c", 0.8);
          }
        } else if (stage === 3) {
          // Quality-control scan sweeps over the completed bare shell.
          drawModel(p, x, y, 0, "sedan", "#9aa4b2", 0.8, { lift: z, noShadow: true, stage: 1 });
          const scan = (Math.sin(this.t * 4) + 1) * 0.5;
          p.light(sx(x - 0.38 + scan * 0.76, y), sy(x - 0.38 + scan * 0.76, y, 17), 12, "#22d3ee", 0.85);
        } else {
          // Finished unpainted body shell, ready for storage and transport.
          drawModel(p, x, y, 0, "sedan", "#a8b3c2", 0.82, { lift: z, noShadow: true, stage: 1 });
          p.light(sx(x, y), sy(x, y, 13), 9, "#4ade80", 0.35);
        }
        break;
      }
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

function materialColor(raw: string | undefined, fallback: string) {
  switch (raw) {
    case "steel": return "#94a3b8";
    case "metal": return "#a8a29e";
    case "rubber": return "#27272a";
    case "fabric": return "#a16207";
    case "alloy": return "#64748b";
    case "sand": return "#d6b87c";
    case "pigment": return "#ec4899";
    case "chips": return "#22c55e";
    case "lithium": return "#84cc16";
    default: return fallback;
  }
}

function mixCan(k: number) {
  const colors = ["#e5e7eb", "#f472b6", "#a855f7", "#3b82f6"];
  return colors[Math.min(colors.length - 1, Math.floor(k * colors.length))];
}
