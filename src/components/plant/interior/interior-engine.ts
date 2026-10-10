// Renders a plant's interior: the halls, the production lines with their
// stations, the parts travelling down the belt, people and robots at work,
// forklifts in the aisle and trucks at the gates. Static geometry is drawn
// as vector shapes; machines, robots, people and vehicles are cached 3D
// sprites (a few dozen per frame), so it stays light on phones.
//
// The line works like a real transfer line: all parts move one station
// forward together, then each station works on its part (the press strokes,
// the laser sweeps, the welding robots spark). The transfers follow the
// plant's real batch: a part walks the whole line in one production cycle,
// and the line stands still whenever the plant does.
import { liveryOf } from "../../three/livery";
import { attachControls, Camera } from "../../map/camera";
import { Painter, sx, sy, toTile } from "../../map/iso";
import { drawModel, drawTruck, type CarModel } from "../../map/vehicles";
import { sprites3d, tierFor, type SpriteSize } from "../../three/sprites";
import type { WorkerRole } from "../../three/interior-models";
import { interiorLayout, lineStops, recipeFor, type Interior, type InteriorSpec, type Line, type PartKind, type PlacedStation, type PropKind, type StationDef, type StationId } from "./layout";

export interface InteriorScene {
  /** The plant type: picks its line (machines, parts) from the recipes. */
  type: string;
  spec: InteriorSpec;
  /** The line is moving (materials in, room for the output). */
  running: boolean;
  /** The plant's real batch: progress 0..1 and seconds per batch (absent: a steady demo pace). */
  progress?: number;
  cycle?: number;
  /** Why the line stands, shown at the stage it concerns. */
  stop?: "noRaw" | "full";
  /** Words painted on the floor (Body Works shop floor and stops). */
  words?: { noOperator: string; build: string; noRaw: string; full: string };
  /** Fill levels 0..1 of raw material and finished goods. */
  raw: number;
  out: number;
  /** A truck is loading at the gate / bringing raw material. */
  docked: boolean;
  inbound: boolean;
  accent: string;
  /** Colour of the finished goods (and of the truck's cargo). */
  color: string;
  /** Station names painted on the floor. */
  labels: Partial<Record<StationId, string>>;
  /** Text for locked halls ("Hall 2 · Level 5"), by hall index. */
  lockedLabel: (hall: number, level: number) => string;
  model?: CarModel;
  /** The parts the cars on this line get (paint, rims, engine, brakes). */
  build?: import("../../three/car-models").BuildLook;
}

export interface StationPick {
  line: number;
  id: StationId;
}

/** Seconds per transfer without a real batch to follow; the parts glide for about MOVE, then the stations work. */
const CYCLE = 2.8;
const MOVE = 0.9;
/** Faster transfers than this are unreadable: the line then runs at this pace (and no longer follows the batch). */
const MIN_TRANSFER = 0.7;
const STATION_SIZE: SpriteSize = { w: 230, h: 230, ax: 115, ay: 150 };
const PERSON_SIZE: SpriteSize = { w: 34, h: 44, ax: 17, ay: 36 };
const PROP_SIZE: SpriteSize = { w: 56, h: 50, ax: 28, ay: 32 };
const VEHICLE_SIZE: SpriteSize = { w: 44, h: 40, ax: 22, ay: 26 };
const PART_SIZE: SpriteSize = { w: 40, h: 30, ax: 20, ay: 18 };
const ROBOT_SIZE: SpriteSize = { w: 90, h: 100, ax: 45, ay: 76 };
/** How many poses each animated machine has. */
const POSES: Record<string, number> = { laserCutter: 4, press: 3, bodyJig: 2, furnace: 2, cnc: 4, curing: 2, filler: 4 };
const FLOOR = "#9ba4ae";

export class InteriorEngine {
  readonly cam = new Camera({ minX: -2000, maxX: 2000, minY: -400, maxY: 1600 });
  private ctx: CanvasRenderingContext2D;
  private p: Painter;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private t = 0;
  /** Production clock: only advances while the line runs. */
  private work = 0;
  /** Transfers done (fractional), locked to the plant's batch progress. */
  private beat = 0;
  private sceneAt = 0;
  private scene: InteriorScene | null = null;
  private layout: Interior | null = null;
  private layoutKey = "";
  private detach: () => void;
  private ro: ResizeObserver;
  private fitted = false;
  selected: StationPick | null = null;
  onSelect: (s: StationPick | null) => void = () => {};
  /** Low graphics: fewer frames, no people animation. */
  low = false;
  private skip = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.p = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.detach = attachControls(canvas, this.cam, { onTap: (x, y) => this.tap(x, y) });
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cam.w = Math.max(1, r.width);
    this.cam.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cam.w * this.dpr);
    this.canvas.height = Math.round(this.cam.h * this.dpr);
    if (this.layout) this.frame(false);
  }

  setScene(s: InteriorScene) {
    this.scene = s;
    this.sceneAt = performance.now();
    const f = s.spec.floor;
    const key = `${s.type}|${s.spec.level}|${s.spec.automation}|${s.spec.manager}|${f ? `${f.machines}/${f.workers}` : ""}`;
    if (key !== this.layoutKey) {
      const grew = this.layout !== null;
      this.layout = interiorLayout(s.spec, recipeFor(s.type));
      this.layoutKey = key;
      this.frame(grew);
    }
  }

  /** Camera limits and the opening view: the first line, close enough to see it work. */
  private frame(keepView: boolean) {
    const L = this.layout!;
    const lastY = (L.lines[L.lines.length - 1]?.y0 ?? 0) + 5;
    this.cam.bounds = { minX: sx(0, L.d), maxX: sx(L.w, 0), minY: sy(0, 0, 80), maxY: sy(L.w, L.d) };
    const fitAll = Math.min(this.cam.w / ((L.w + lastY) * 32 + 80), this.cam.h / ((L.w + lastY) * 16 + 160));
    this.cam.minZoom = Math.max(0.15, fitAll * 0.9);
    this.cam.maxZoom = 3;
    if (keepView && this.fitted) return;
    const line = L.lines[0];
    const target = Math.max(0.8, Math.min(1.5, this.cam.w / 290));
    const cx = L.w * 0.42;
    const cy = line.belt;
    // fly in from further out: the camera "walks into" the hall
    this.cam.zoom = target * 0.55;
    this.cam.x = sx(cx, cy);
    this.cam.y = sy(cx, cy, 20);
    this.cam.flyTo(sx(cx, cy), sy(cx, cy, 20), target, 0.9);
    this.fitted = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // low graphics: every other frame
      if (!this.low || (this.skip = this.skip ^ 1)) this.render(dt * (this.low ? 2 : 1));
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

  /** Flies the camera to a station (when picked from the UI). */
  focus(pick: StationPick) {
    const st = this.find(pick);
    if (!st) return;
    this.cam.flyTo(sx(st.stop.x, st.stop.y), sy(st.stop.x, st.stop.y, 20), Math.max(this.cam.zoom, 1.2), 0.5);
  }

  private find(pick: StationPick): PlacedStation | undefined {
    return this.layout?.lines[pick.line]?.stations.find((s) => s.def.id === pick.id);
  }

  private tap(px: number, py: number) {
    const L = this.layout;
    if (!L) return;
    const [wx, wy] = this.cam.toWorld(px, py);
    // try the ground and a little above it (machines are tall)
    let hit: StationPick | null = null;
    for (const lift of [0, 20, 40]) {
      const { x: tx, y: ty } = toTile(wx, wy + lift);
      for (const line of L.lines)
        for (const st of line.stations)
          if (this.pickable(st) && tx >= st.x - 0.1 && tx <= st.x + st.w + 0.1 && ty >= line.belt - 1.2 && ty <= line.belt + 1.1) hit = { line: line.index, id: st.def.id };
      if (hit) break;
    }
    this.selected = hit;
    this.onSelect(hit);
  }

  /** Built stations can be tapped; on the Body Works shop floor, so can the empty machine bays (to build them). */
  private pickable(st: PlacedStation) {
    return st.mode !== "planned" || (!!this.scene?.spec.floor && st.slot !== undefined);
  }

  /** Moves the line on: one transfer per station per batch, caught up with the plant's real progress. */
  private advance(s: InteriorScene, L: Interior, dt: number) {
    if (!s.running) return;
    const steps = Math.max(1, lineStops(L.lines[0]).length - 1);
    const per = s.cycle && s.cycle > 0 ? s.cycle / steps : CYCLE;
    if (s.progress === undefined || per < MIN_TRANSFER) {
      this.beat += dt / Math.max(MIN_TRANSFER, per);
      return;
    }
    // where the batch is now (the store ticks ten times a second; fill in between)
    const since = Math.min(0.15, (performance.now() - this.sceneAt) / 1000);
    const target = Math.min(1, s.progress + since / (s.cycle ?? CYCLE)) * steps;
    let err = target - (((this.beat % steps) + steps) % steps);
    if (err > steps / 2) err -= steps;
    if (err < -steps / 2) err += steps;
    // forward at the real pace, closing the gap smoothly; never backwards
    this.beat += Math.max(0, dt / per + err * Math.min(1, dt * 4));
  }

  // ───────────────────────── rendering ─────────────────────────

  private render(dt: number) {
    this.t += dt;
    const s = this.scene;
    const L = this.layout;
    if (s?.running) this.work += dt;
    if (s && L) this.advance(s, L, dt);
    const { ctx, p, cam } = this;
    cam.update(dt);
    const W = this.canvas.width;
    const Hh = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#2b2b2e";
    ctx.fillRect(0, 0, W, Hh);
    if (!s || !L) return;
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (cam.w / 2 - cam.x * cam.zoom), this.dpr * (cam.h / 2 - cam.y * cam.zoom));
    p.t = this.t;
    p.zoom = cam.zoom;
    p.dpr = this.dpr;
    p.night = 0;
    p.dim = false;
    p.lights.length = 0;

    this.drawBuilding(s, L);
    for (const line of L.lines) this.drawLine(s, L, line);
    this.drawAisle(s, L);
    if (L.crane) this.drawCrane(L);
    this.drawSelection(L);
    this.drawLights();
  }

  /** Slab, floor, markings, locked halls, walls with windows and gates, ceiling lamps. */
  private drawBuilding(s: InteriorScene, L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const { w, d } = L;
    p.box(-0.4, -0.4, w + 0.8, d + 0.8, -16, 16, "#2a3240", "#353e4c", false);
    p.quad(0, 0, w, d, FLOOR);
    // polished concrete: large slabs and a soft sheen
    c.strokeStyle = "rgba(255,255,255,0.08)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 2; x < w; x += 2) {
      c.moveTo(sx(x, 0), sy(x, 0));
      c.lineTo(sx(x, d), sy(x, d));
    }
    for (let y = 2; y < d; y += 2) {
      c.moveTo(sx(0, y), sy(0, y));
      c.lineTo(sx(w, y), sy(w, y));
    }
    c.stroke();
    // hall floors: each line's bay is a slightly darker epoxy floor with a green walkway in front
    for (const line of L.lines) {
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, "#8a939e");
      p.quad(0.3, line.belt + 1.55, w - 0.6, 0.55, "rgba(34,197,94,0.32)");
      p.line(0.3, line.belt + 1.55, w - 0.3, line.belt + 1.55, "#facc15", 1.4);
      p.line(0.3, line.belt + 2.1, w - 0.3, line.belt + 2.1, "#facc15", 1.4);
    }
    // locked halls: bare, hatched, with the level that builds them
    for (const lk of L.locked) {
      p.quad(0.3, lk.y0 + 0.2, w - 0.6, 4.6, "#6b7280");
      c.save();
      c.strokeStyle = "rgba(15,23,42,0.25)";
      c.lineWidth = 3;
      c.beginPath();
      for (let k = 0; k < w + 5; k += 1.2) {
        c.moveTo(sx(0.3 + k, lk.y0 + 0.2), sy(0.3 + k, lk.y0 + 0.2));
        c.lineTo(sx(0.3 + k - 4.6, lk.y0 + 4.8), sy(0.3 + k - 4.6, lk.y0 + 4.8));
      }
      c.rect(-1e5, -1e5, 0, 0);
      c.stroke();
      c.restore();
      p.quadStroke(0.3, lk.y0 + 0.2, w - 0.6, 4.6, "rgba(250,204,21,0.8)", 2, [10, 8]);
      p.tag(s.lockedLabel(L.lines.length + L.locked.indexOf(lk), lk.level), w / 2, lk.y0 + 2.5, 2, { size: 13, bg: "rgba(15,23,42,0.85)", icon: "🔒" });
    }
    // aisle: lane markings and arrows
    const ay = L.aisle.y;
    p.line(0.2, ay - 0.6, w - 0.2, ay - 0.6, "#facc15", 2);
    p.line(0.2, ay + 0.6, w - 0.2, ay + 0.6, "#facc15", 2);
    for (let x = 2; x < w - 2; x += 2.5) p.line(x, ay, x + 1.2, ay, "rgba(255,255,255,0.75)", 2, 0, [6, 6]);

    // back walls (the camera looks in from the open front)
    const WH = 92;
    p.box(-0.35, -0.35, w + 0.35, 0.35, 0, WH, "#cfd6de", "#9aa4b0");
    p.box(-0.35, 0, 0.35, d, 0, WH, "#dde3ea", "#9aa4b0");
    // sandwich-panel ribs and an accent band
    c.strokeStyle = "rgba(15,23,42,0.07)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0.5; x < w; x += 0.5) {
      c.moveTo(sx(x, 0), sy(x, 0, 0));
      c.lineTo(sx(x, 0), sy(x, 0, WH));
    }
    for (let y = 0.5; y < d; y += 0.5) {
      c.moveTo(sx(0, y), sy(0, y, 0));
      c.lineTo(sx(0, y), sy(0, y, WH));
    }
    c.stroke();
    p.onLeft(-0.35, 0, 0, 0.35, w, WH - 12, WH - 6, p.col(s.accent));
    p.onRight(0, 0, 0, 0, d, WH - 12, WH - 6, p.col(s.accent));
    // clerestory windows
    for (let x = 1; x < w - 1; x += 3) p.onLeft(-0.35, 0, 0, x, x + 2.2, 52, 76, "#93c5fd");
    for (let y = 1; y < d - 4; y += 3) p.onRight(0, 0, 0, y, y + 2.2, 52, 76, "#a5d4fd");
    // the raw material gate on the side wall, by the aisle
    p.onRight(0, 0, 0, ay - 1, ay + 1, 0, 40, "#374151");
    if (s.inbound) p.onRight(0, 0, 0, ay - 0.9, ay + 0.9, 0, 38, "#fde68a");
    for (let k = 0; k < 8; k++) p.onRight(0, 0, 0, ay - 1, ay + 1, 40 + k * 0.01, 40 + k * 0.01, "#111");
    // ceiling lamps over every hall (light pools on the floor)
    for (const line of L.lines)
      for (let x = 2; x < w; x += 4) {
        p.light(sx(x, line.belt), sy(x, line.belt, 0), 70, "#fff7e0", 0.18);
      }
  }

  private drawLine(s: InteriorScene, L: Interior, line: Line) {
    const p = this.p;
    const c = this.ctx;
    const stops = lineStops(line);
    const n = stops.length;
    // phase of the transfer (lines are a little out of step with each other)
    const clock = this.beat + line.index * 0.25;
    const ph = clock - Math.floor(clock);
    const steps = Math.max(1, n - 1);
    const per = s.cycle && s.cycle > 0 ? Math.max(MIN_TRANSFER, s.cycle / steps) : CYCLE;
    // the glide takes about MOVE seconds, the rest of the transfer is work
    const glide = Math.max(0.15, Math.min(0.45, MOVE / per));
    const moving = s.running && ph < glide;
    const mk = moving ? smooth(ph / glide) : 1;
    const working = s.running && !moving;
    const k = tierCap(this.cam.zoom * this.dpr);
    const near = this.cam.zoom > 0.5;
    const floor = s.spec.floor;

    // planned bays: just the painted outline and the station's name; on the
    // shop floor the next one to build is marked out in green
    for (const st of line.stations) {
      if (st.mode === "planned") {
        const next = !!floor && st.slot === floor.machines;
        p.quadStroke(st.x, line.belt - 1, st.w, 2, next ? "rgba(74,222,128,0.9)" : "rgba(255,255,255,0.55)", next ? 2 : 1.5, [6, 6]);
        if (next) p.quad(st.x, line.belt - 1, st.w, 2, `rgba(74,222,128,${0.1 + Math.sin(this.t * 3) * 0.05})`);
      } else {
        p.quad(st.x, line.belt - 1.05, st.w, 2.1, "rgba(30,41,59,0.18)");
        p.quadStroke(st.x, line.belt - 1.05, st.w, 2.1, "rgba(250,204,21,0.75)", 1.2);
      }
    }

    // 0. the back of each bay: steel columns, and pallets, dies and cages by the machines
    for (const st of line.stations) {
      const props = st.mode === "planned" ? [] : (st.def.props ?? []);
      props.forEach((kind, j) => this.prop(kind, st.x + 0.65 + j * 1.6, line.y0 + 0.75, s, k));
    }
    // columns stand along the back wall only, so they never hide a hall behind them
    if (line.index === 0) for (const cx of [4.1, 11.2, 18.3]) {
      p.box(cx - 0.12, line.y0 + 0.05, 0.24, 0.24, 0, 88, "#64748b", "#94a3b8");
      p.box(cx - 0.17, line.y0, 0.34, 0.34, 0, 6, "#facc15", "#fde047");
    }

    // work lamps: a lit machine is a manned, working one
    for (const st of stops)
      if (s.running && st.def.staff > 0 && st.staffed) p.light(sx(st.stop.x, st.stop.y - 0.4), sy(st.stop.x, st.stop.y - 0.4, 2), 48, "#fff3c4", 0.2);

    // 1. what stands behind the belt
    for (const st of stops) this.station(s, st, "back", working, k);

    // 2. the belt (or benches before the conveyor)
    const x0 = stops[0].stop.x;
    const x1 = stops[n - 1].stop.x;
    if (line.conveyor) {
      p.box(x0 - 0.5, line.belt - 0.32, x1 - x0 + 1, 0.64, 0, 4, "#3a4350", "#2a313b");
      if (near) {
        c.strokeStyle = "rgba(148,163,184,0.55)";
        c.lineWidth = 1;
        c.beginPath();
        const off = s.running ? (this.work * 0.9) % 0.3 : 0;
        for (let u = x0 - 0.5 + off; u < x1 + 0.5; u += 0.3) {
          c.moveTo(sx(u, line.belt - 0.3), sy(u, line.belt - 0.3, 4));
          c.lineTo(sx(u, line.belt + 0.3), sy(u, line.belt + 0.3, 4));
        }
        c.stroke();
      }
      // guard rails
      p.line(x0 - 0.5, line.belt + 0.34, x1 + 0.5, line.belt + 0.34, "#facc15", 1.5, 7);
    } else {
      // Levels 1-2: parts wait on trolleys and benches, pushed by hand
      for (const st of stops) p.box(st.stop.x - 0.4, line.belt - 0.3, 0.8, 0.6, 0, 3, "#7c5a3a", "#8b6a48");
    }

    // 3. parts on the line: one per station, each a step further along.
    // While moving, a part shows what the station it left made of it; at a
    // station it changes into the station's product halfway through the work.
    const late = working && ph > glide + (1 - glide) * 0.5;
    for (let i = 0; i < n; i++) {
      if (moving) {
        if (i === n - 1) continue; // the last one went onto the rack
        const a = stops[i];
        const b = stops[i + 1];
        this.part(s, a.def, a.stop.x + (b.stop.x - a.stop.x) * mk, line.belt, line.conveyor ? 4 : 3, k);
      } else {
        const st = stops[i];
        const shown = i === 0 || late ? st.def : stops[i - 1].def;
        this.part(s, shown, st.stop.x, line.belt, line.conveyor ? 4 : 3, k);
      }
    }
    // the finished store fills with the plant's real stock (cars and bodies on the racks)
    const fin = stops[n - 1];
    if (fin.def.part === "car") {
      const racked = Math.min(6, Math.round(s.out * 6));
      for (let r = 0; r < racked; r++) {
        const rx = fin.x + 0.6 + (r % 3) * 0.95;
        const lv = Math.floor(r / 3);
        this.car(s, fin.def.stage ?? 0, rx, line.belt - 0.62, 18 + lv * 20);
      }
    }

    // 4. what stands in front of the belt
    for (const st of stops) this.station(s, st, "front", working, k);

    // effects: sparks, laser, heat, paint mist, the QC scan (a machine without
    // its operator works in fits and starts)
    for (const st of stops) {
      if (!working || (!st.staffed && Math.sin(this.t * 2 + st.x) < 0)) continue;
      const { x, y } = st.stop;
      switch (st.def.fx) {
        case "sparks":
          if (st.mode === "robot" || st.def.role === "welder") this.sparks(x, y);
          break;
        case "laser":
          p.light(sx(x, y), sy(x, y, 8), 18, "#ff6a3d", 0.6);
          break;
        case "heat":
          p.light(sx(x - 0.4, y - 0.5), sy(x - 0.4, y - 0.5, 10), 34 + Math.sin(this.t * 3 + x) * 4, "#ff8a3d", 0.55);
          break;
        case "spray":
          for (let i = 0; i < 3; i++) p.light(sx(x - 0.6 + i * 0.6, y - 0.2), sy(x - 0.6 + i * 0.6, y - 0.2, 12), 16 + ((this.t * 40 + i * 7) % 8), s.color, 0.45);
          break;
        case "scan": {
          const u = st.x + 0.4 + ((this.t * 0.8) % 1) * (st.w - 0.8);
          p.line(u, line.belt - 0.6, u, line.belt + 0.6, "rgba(56,189,248,0.9)", 2, 14);
          p.light(sx(u, line.belt), sy(u, line.belt, 14), 22, "#38bdf8", 0.5);
          break;
        }
      }
    }
    // a stack light on every machine: green working, amber without its operator, red blinking when the line stands
    const blink = Math.sin(this.t * 6) > 0;
    for (const st of stops) {
      if (st.def.staff === 0) continue;
      const [on, off] = !s.running ? ["#ef4444", "#7f1d1d"] : st.staffed ? ["#22c55e", "#22c55e"] : ["#f59e0b", "#78350f"];
      const lit = s.running ? st.staffed || Math.sin(this.t * 2.5) > 0 : blink;
      p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
      p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? on : off);
      if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), s.running ? 18 : 30, on, s.running ? 0.45 : 0.7);
    }

    // 5. robots and people in front of the line (robots in a cell without its operator at half pace)
    const pace = (id: StationId) => (line.stations.find((x) => x.def.id === id)?.staffed === false ? 0.5 : 1);
    for (const r of L.robots) {
      if (r.line !== line.index || r.reach) continue;
      this.robot(r.x, r.y, working ? Math.floor(this.t * 4 * pace(r.station) + r.x) % 4 : 0, r.tool, k);
    }
    for (const r of L.robots) {
      if (r.line !== line.index || !r.reach) continue;
      // welding, framing and assembly robots reach over the part from the front
      this.robot(r.x, line.belt + 0.75, working ? Math.floor(this.t * 5 * pace(r.station) + r.x * 3) % 4 : 0, r.tool, k);
    }
    for (const [i, h] of L.people.entries()) {
      if (h.line !== line.index) continue;
      const busy = working && h.station !== undefined && h.role !== "supervisor";
      const pose = busy ? Math.floor(this.t * 4 + i) % 4 : s.running ? Math.floor(this.t * 1.5 + i) % 2 : 0;
      this.person(h.x, h.y, h.role, pose, i, k);
      if (h.role === "welder" && working && near) this.sparks(h.x + 0.1, h.y - 0.6);
    }
    // empty bays keep their name (the next one to build on the shop floor says so), above the belt
    if (near)
      for (const st of line.stations) {
        if (st.mode !== "planned") continue;
        const lab = s.labels[st.def.id] ?? st.def.id;
        const next = !!floor && st.slot === floor.machines;
        p.tag(next && s.words ? `＋ ${s.words.build} · ${lab}` : `${st.def.icon} ${lab}`, st.x + st.w / 2, line.belt, line.conveyor ? 8 : 2, { size: 9, bg: next ? "rgba(21,128,61,0.9)" : "rgba(15,23,42,0.6)" });
      }
    // station names on the floor in front of each station (with its operator on the shop floor)
    if (near)
      for (const st of stops) {
        const sel = this.selected?.line === line.index && this.selected.id === st.def.id;
        const crew = floor && st.slot !== undefined && st.staffed ? ` · 👷${st.slot + 1}` : "";
        p.tag(`${st.def.icon} ${s.labels[st.def.id] ?? st.def.id}${crew}`, st.x + st.w / 2, line.belt + 1.3, 1, { size: 9, bg: sel ? "rgba(14,165,233,0.95)" : "rgba(15,23,42,0.78)" });
      }
    // what holds a machine back, at that machine: no operator, no material in, no room out
    if (near && s.words) {
      const w = s.words;
      for (const st of stops)
        if (st.def.staff > 0 && !st.staffed) p.tag(`⚠ ${w.noOperator}`, st.x + st.w / 2, line.belt - 0.4, 34, { size: 9, bg: "rgba(217,119,6,0.92)" });
      const at = s.stop === "noRaw" ? stops[0] : s.stop === "full" ? stops[n - 1] : undefined;
      if (at) p.tag(`⛔ ${s.stop === "noRaw" ? w.noRaw : w.full}`, at.x + at.w / 2, line.belt - 0.4, 34, { size: 10, bg: "rgba(220,38,38,0.92)" });
    }
  }

  /** Forklifts (or robot carts) shuttling between the gates and the stores; the office; trucks. */
  private drawAisle(s: InteriorScene, L: Interior) {
    const p = this.p;
    const k = tierCap(this.cam.zoom * this.dpr);
    const ay = L.aisle.y;
    // the office with the manager
    const o = L.office;
    p.box(o.x, o.y, o.w, o.d, 0, 26, "#e2e8f0", "#cbd5e1");
    p.onLeft(o.x, o.y + o.d, 0, 0.2, o.w - 0.2, 6, 22, "#93c5fd");
    p.onRight(o.x + o.w, o.y, 0, 0.2, o.d - 0.2, 6, 22, "#7fb8ea");
    p.box(o.x - 0.05, o.y - 0.05, o.w + 0.1, o.d + 0.1, 26, 3, p.col(s.accent));
    for (const [i, h] of L.people.entries()) {
      if (h.role !== "manager") continue;
      const walk = Math.sin(this.t * 0.4) * 1.6;
      this.person(h.x + walk, h.y, "manager", Math.floor(this.t * 3) % 4, i, k);
    }
    // shuttles: raw material from the side gate to each line's store, finished goods to the dock
    const n = L.aisle.vehicles;
    for (let v = 0; v < n; v++) {
      const line = L.lines[v % L.lines.length];
      const inbound = v % 2 === 0;
      const xs = inbound ? 0.45 : L.w - 0.45;
      const period = 14 + v * 2.3;
      const u = ((this.t + v * 5.1) % period) / period;
      // gate → along the aisle → up the side lane to the line → back
      const legA = inbound ? [0.8, ay] : [L.w - 1.6, ay];
      const pts: [number, number][] = [legA as [number, number], [xs, ay], [xs, line.belt], [xs, ay], legA as [number, number]];
      const [x, y, yaw, loaded] = along(pts, u, inbound);
      const cargo = inbound ? "#9aa4b0" : s.color;
      if (L.aisle.agv) this.vehicle(`agv|${yaw}|${loaded ? 1 : 0}|${cargo}`, x, y, k, (T, { interior }) => interior.buildAGV(T, yaw, loaded, cargo));
      else this.vehicle(`fork|${yaw}|${loaded ? 1 : 0}|${cargo}`, x, y, k, (T, { kit, interior }) => interior.buildForklift(T, kit, yaw, loaded, cargo));
    }
    // a truck at the dock while goods are waiting
    if (s.docked) drawTruck(p, L.w + 1.1, ay, 1, s.color, 1);
  }

  /** Big plants: an overhead crane over the stores, travelling across the halls. */
  private drawCrane(L: Interior) {
    const p = this.p;
    const span = (L.lines[L.lines.length - 1].y0 + 5 - 1) / 1;
    const y = 1 + ((Math.sin(this.t * 0.15) + 1) / 2) * (span - 2);
    p.box(0.2, 0.2, 0.25, L.d - 4, 78, 3, "#f59e0b");
    p.box(3.6, 0.2, 0.25, L.d - 4, 78, 3, "#f59e0b");
    p.box(0.2, y, 3.65, 0.35, 76, 6, "#f5b301", "#fcd34d");
    p.box(1.8, y + 0.05, 0.4, 0.25, 70, 6, "#1f2937");
    p.line(2, y + 0.17, 2, y + 0.17, "#111827", 1, 30);
  }

  private drawSelection(L: Interior) {
    if (!this.selected) return;
    const st = this.find(this.selected);
    if (!st) return;
    const line = L.lines[this.selected.line];
    const a = 0.55 + Math.sin(this.t * 5) * 0.3;
    this.p.quadStroke(st.x - 0.05, line.belt - 1.1, st.w + 0.1, 2.2, `rgba(56,189,248,${a})`, 3);
  }

  private drawLights() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    for (const l of this.p.lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, l.color + "88");
      g.addColorStop(1, l.color + "00");
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ───────────────────────── sprites ─────────────────────────

  private station(s: InteriorScene, st: PlacedStation, part: "back" | "front", working: boolean, k: number) {
    const model = st.def.machine;
    const poses = POSES[model] ?? 1;
    // without its operator a machine runs at half pace
    const pace = (model === "press" ? 3 : 4) * (st.staffed ? 1 : 0.5);
    const pose = working && poses > 1 ? Math.floor(this.t * pace) % poses : 0;
    const robots = st.mode === "robot";
    const variant = st.def.variant ?? "";
    const key = `ist|${model}|${variant}|${pose}|${robots ? 1 : 0}|${part}|${s.accent}|${s.color}`;
    const spr = sprites3d.get(key, STATION_SIZE, k, (T, { kit, interior }) => interior.buildStation(T, kit, model, pose, s.accent, robots, part, variant, s.color), part === "back");
    if (!spr) {
      // until the 3D model is ready: a simple block
      if (part === "back") this.p.box(st.x + 0.2, st.stop.y - 0.9, st.w - 0.4, 0.6, 0, 22, "#64748b", "#94a3b8");
      return;
    }
    const { x, y } = st.stop;
    this.ctx.drawImage(spr.img, sx(x, y) - STATION_SIZE.ax, sy(x, y) - STATION_SIZE.ay, STATION_SIZE.w, STATION_SIZE.h);
  }

  /** A part on the belt, as it looks after station `after`. */
  private part(s: InteriorScene, after: StationDef, x: number, y: number, z: number, k: number) {
    if (after.part === "car") {
      this.car(s, after.stage ?? 0, x, y, z);
      return;
    }
    const kind: PartKind = after.part;
    const color = s.color;
    const spr = sprites3d.get(`ipart|${kind}|${color}`, PART_SIZE, k, (T, { interior }) => interior.buildPart(T, kind, color), false);
    if (!spr) {
      this.p.box(x - 0.25, y - 0.18, 0.5, 0.36, z, 2, "#aeb6c1");
      return;
    }
    this.ctx.drawImage(spr.img, sx(x, y) - PART_SIZE.ax, sy(x, y, z) - PART_SIZE.ay, PART_SIZE.w, PART_SIZE.h);
  }

  /** A car on the line at an assembly stage (0: a body in white … 8: finished). */
  private car(s: InteriorScene, stage: number, x: number, y: number, z: number) {
    // primer grey until the paint shop, then the model's own paint
    const paint = stage >= 6 ? s.build?.color || (s.model ? liveryOf(s.model).color : "#ef4444") : "#c3cad3";
    drawModel(this.p, x, y, 0, s.model ?? "sedan", paint, 1.1, { lift: z, noShadow: true, stage, build: s.build });
  }

  private prop(kind: PropKind, x: number, y: number, s: InteriorScene, k: number) {
    const { accent, color } = s;
    const spr = sprites3d.get(`iprop|${kind}|${accent}|${color}`, PROP_SIZE, k, (T, { interior }) => interior.buildProp(T, kind, accent, color));
    if (!spr) return;
    this.ctx.drawImage(spr.img, sx(x, y) - PROP_SIZE.ax, sy(x, y) - PROP_SIZE.ay, PROP_SIZE.w, PROP_SIZE.h);
  }

  private person(x: number, y: number, role: WorkerRole, pose: number, i: number, k: number) {
    if (this.cam.zoom < 0.45) {
      this.p.person(x, y, role === "worker" ? "#f97316" : "#2563eb", this.t * 3 + i);
      return;
    }
    const tone = i % 4;
    const spr = sprites3d.get(`iman|${role}|${pose}|${tone}`, PERSON_SIZE, Math.min(4, k + 1), (T, { interior }) => interior.buildWorker(T, role, pose, tone));
    if (!spr) {
      this.p.person(x, y, "#f97316", this.t * 3 + i);
      return;
    }
    this.ctx.drawImage(spr.img, sx(x, y) - PERSON_SIZE.ax, sy(x, y) - PERSON_SIZE.ay, PERSON_SIZE.w, PERSON_SIZE.h);
  }

  private robot(x: number, y: number, pose: number, tool: "torch" | "gripper" | "suction" | "spray", k: number) {
    const spr = sprites3d.get(`irobot|${pose}|${tool}`, ROBOT_SIZE, k, (T, { kit, industrial }) => {
      const r = industrial.buildRobot(T, kit, pose, "#f59e0b", tool);
      r.scale.setScalar(1.5);
      r.rotation.y = Math.PI / 2;
      return r;
    });
    if (!spr) return;
    this.ctx.drawImage(spr.img, sx(x, y) - ROBOT_SIZE.ax, sy(x, y) - ROBOT_SIZE.ay, ROBOT_SIZE.w, ROBOT_SIZE.h);
  }

  private vehicle(key: string, x: number, y: number, k: number, build: Parameters<typeof sprites3d.get>[3]) {
    const spr = sprites3d.get(`iveh|${key}`, VEHICLE_SIZE, k, build);
    if (!spr) {
      this.p.box(x - 0.15, y - 0.1, 0.3, 0.2, 0, 6, "#f59e0b");
      return;
    }
    this.ctx.drawImage(spr.img, sx(x, y) - VEHICLE_SIZE.ax, sy(x, y) - VEHICLE_SIZE.ay, VEHICLE_SIZE.w, VEHICLE_SIZE.h);
  }

  /** Welding sparks: short bright streaks and a flash. */
  private sparks(x: number, y: number) {
    const p = this.p;
    if (Math.sin(this.t * 23 + x) < -0.2) return;
    const c = this.ctx;
    const [px, py] = [sx(x, y), sy(x, y, 9)];
    c.strokeStyle = "rgba(253,224,71,0.95)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (this.t * 37 + i * 1.7) % (Math.PI * 2);
      const r = 3 + ((this.t * 50 + i * 13) % 7);
      c.moveTo(px, py);
      c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.6 + 2);
    }
    c.stroke();
    p.light(px, py, 22, "#fde68a", 0.9);
  }
}

const smooth = (u: number) => u * u * (3 - 2 * u);
/** Interior sprites are big: cap their resolution (memory on phones). */
const tierCap = (scale: number) => Math.min(3, tierFor(scale));

/** Position along a closed route at u (0..1), its heading in quarter turns, and whether it carries a load. */
function along(pts: [number, number][], u: number, inbound: boolean): [number, number, number, boolean] {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  let d = u * total;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.abs(bx - ax) + Math.abs(by - ay);
    if (d <= len || i === pts.length - 1) {
      const t = len ? Math.min(1, d / len) : 0;
      const yaw = bx > ax ? 0 : bx < ax ? 2 : by > ay ? 1 : 3;
      // loaded on the way in (raw material to the line) or out (goods to the dock)
      const half = i <= 2;
      return [ax + (bx - ax) * t, ay + (by - ay) * t, yaw, inbound ? half : !half];
    }
    d -= len;
  }
  return [pts[0][0], pts[0][1], 0, false];
}
