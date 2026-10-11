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
import { Painter, raceFont, sx, sy, toTile } from "../../map/iso";
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
  /** Units one batch makes, and their icon: they rise over the finished stores when it is done. */
  batch?: number;
  icon?: string;
  /** The plant's name, on the sign over the halls. */
  title?: string;
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
/** Polished concrete, a touch warm. */
const FLOOR = "#a0a6ac";
/** At most one "+N" per line this often (fast lines sum their units up). */
const POP_EVERY = 1.4;
/** How long a "+N" rises before it is gone. */
const POP_LIFE = 1.7;

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
  /**
   * The hall's still layer (floor, markings, walls, windows, daylight), drawn
   * once around the view and reused until the camera leaves it or zooms.
   */
  private hall: { canvas: HTMLCanvasElement; key: string; scale: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  private vig: { w: number; h: number; g: CanvasGradient } | null = null;
  private cone: CanvasGradient | null = null;
  /** Finished units rising over each line's store ("+5 ⚙️"), and when the last ones went up. */
  private pops: { line: number; n: number; t0: number; bump: number }[] = [];
  private popAt = -99;
  /** Units made on a fast line, not shown yet. */
  private made = 0;
  private lastProgress = -1;
  /** The ring that spreads from a machine you tap. */
  private ripple: { pick: StationPick; t0: number } | null = null;

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
    // a batch done (its progress starts over): its units rise over the stores;
    // fast lines are summed up as they run (see render)
    const prog = s.progress ?? -1;
    if (s.running && this.lastProgress >= 0 && prog >= 0 && prog < this.lastProgress - 0.3 && (s.cycle ?? 0) >= POP_EVERY) this.reward(s.batch ?? 0);
    this.lastProgress = prog;
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
    if (hit) this.ripple = { pick: hit, t0: this.t };
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
    // a fast line: the units it makes go up together every POP_EVERY seconds
    if (s?.running && s.batch && s.cycle && s.cycle < POP_EVERY) {
      this.made += (dt * s.batch) / s.cycle;
      if (this.t - this.popAt >= POP_EVERY && this.made >= 1) {
        const n = Math.floor(this.made);
        this.made -= n;
        this.reward(n);
      }
    }
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
    // indoors the lamps are always on: every glow (lamp pools, the laser,
    // furnaces, sparks, stack lights) is drawn
    p.night = 1;
    p.dim = false;
    p.lights.length = 0;

    this.drawBuilding(s, L);
    this.drawDust(L);
    // the line in the middle of the view gets the full station names, the others their icons
    const ty = toTile(cam.x, cam.y + 20).y;
    let focus = 0;
    for (const line of L.lines) if (Math.abs(line.belt - ty) < Math.abs(L.lines[focus].belt - ty)) focus = line.index;
    for (const line of L.lines) this.drawLine(s, L, line, line.index === focus);
    this.drawAisle(s, L);
    if (L.crane) this.drawCrane(L);
    this.drawLamps(L);
    this.drawSelection(L);
    this.drawLights();
    this.drawPops(L);
    this.vignette();
  }

  /** Shares `n` finished units out over the lines, each rising from its own store. */
  private reward(n: number) {
    const L = this.layout;
    if (!L || n < 1) return;
    const k = L.lines.length;
    for (let i = 0; i < k; i++) {
      const share = Math.floor(n / k) + (i < n % k ? 1 : 0);
      if (share <= 0) continue;
      // batches done back to back (a truck freed the store) add up on the label still rising
      const young = this.pops.find((q) => q.line === i && this.t - q.t0 < 0.9);
      if (young) {
        young.n += share;
        young.bump = this.t;
      } else this.pops.push({ line: i, n: share, t0: this.t + i * 0.12, bump: -99 });
    }
    this.popAt = this.t;
    this.pops = this.pops.filter((q) => this.t - q.t0 < POP_LIFE);
  }

  /** "+5 ⚙️" rising from each line's finished store, with a burst of sparkles and a flash. */
  private drawPops(L: Interior) {
    const s = this.scene;
    if (!s || !this.pops.length) return;
    const c = this.ctx;
    for (const q of this.pops) {
      const age = this.t - q.t0;
      if (age < 0 || age > POP_LIFE) continue;
      const line = L.lines[q.line];
      if (!line) continue;
      const stops = lineStops(line);
      const fin = stops[stops.length - 1].stop;
      const [bx, by] = [sx(fin.x, fin.y), sy(fin.x, fin.y, 30)];
      // the flash and the sparkles
      if (age < 0.6) {
        const f = 1 - age / 0.6;
        c.globalCompositeOperation = "lighter";
        const g = c.createRadialGradient(bx, by, 0, bx, by, 46);
        g.addColorStop(0, `rgba(253,224,71,${0.45 * f})`);
        g.addColorStop(1, "rgba(253,224,71,0)");
        c.fillStyle = g;
        c.fillRect(bx - 46, by - 46, 92, 92);
        c.fillStyle = `rgba(255,244,190,${f})`;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + q.line;
          const r = 8 + age * 70;
          const [px, py] = [bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.6 - age * 18];
          const d = 2.2 * f + 0.6;
          c.fillRect(px - d, py - 0.5, d * 2, 1);
          c.fillRect(px - 0.5, py - d, 1, d * 2);
        }
        c.globalCompositeOperation = "source-over";
      }
      // the label: pops in, rises, fades
      const pop = (age < 0.2 ? backOut(age / 0.2) : 1) * (1 + 0.2 * Math.max(0, 1 - (this.t - q.bump) / 0.25));
      const alpha = age > POP_LIFE - 0.5 ? (POP_LIFE - age) / 0.5 : 1;
      const text = `+${q.n} ${s.icon ?? ""}`.trim();
      c.save();
      c.globalAlpha = Math.max(0, alpha);
      c.translate(bx, by - 14 - age * 26);
      c.scale(pop, pop);
      c.font = raceFont(900, 15);
      const w = c.measureText(text).width + 16;
      c.beginPath();
      c.roundRect(-w / 2, -12, w, 24, 12);
      c.fillStyle = "rgba(250,204,21,0.96)";
      c.shadowColor = "rgba(0,0,0,0.35)";
      c.shadowBlur = 6;
      c.shadowOffsetY = 2;
      c.fill();
      c.shadowColor = "transparent";
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "#1f2937";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 0, 1);
      c.restore();
    }
  }

  /** Motes of dust drifting and glinting in the daylight from the back windows. */
  private drawDust(L: Interior) {
    if (this.low || this.cam.zoom < 0.6) return;
    const c = this.ctx;
    c.globalCompositeOperation = "lighter";
    let i = 0;
    for (let x = 1; x < L.w - 1; x += 3)
      for (let m = 0; m < 5; m++, i++) {
        // somewhere in the shaft: across it (u), down it (v), from the window's height (z)
        const u = (hash(i * 3 + 1) + Math.sin(this.t * 0.11 + i) * 0.08 + 1) % 1;
        const v = (hash(i * 3 + 2) + this.t * (0.012 + hash(i) * 0.01)) % 1;
        const z = 54 + hash(i * 3 + 3) * 20;
        const wx = x + u * 2.2 + z * 0.012 * v;
        const wy = z * 0.05 * v + 0.05;
        const tw = 0.3 + 0.3 * Math.sin(this.t * (1.3 + hash(i + 9)) + i * 2.1);
        const a = tw * Math.min(1, v * 6, (1 - v) * 4);
        if (a <= 0.02) continue;
        c.fillStyle = `rgba(255,246,214,${a.toFixed(3)})`;
        c.beginPath();
        c.arc(sx(wx, wy), sy(wx, wy, z * (1 - v)), (1 + hash(i + 5) * 0.7) / Math.max(1, this.cam.zoom * 0.8), 0, Math.PI * 2);
        c.fill();
      }
    c.globalCompositeOperation = "source-over";
  }

  /** A soft darkening toward the corners of the screen: the eye goes to the line. */
  private vignette() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.vig?.w !== W || this.vig.h !== H) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, "rgba(8,10,16,0)");
      g.addColorStop(1, "rgba(8,10,16,0.32)");
      this.vig = { w: W, h: H, g };
    }
    ctx.fillStyle = this.vig.g;
    ctx.fillRect(0, 0, W, H);
  }

  /** The hall (from its cached still layer when it can), then what changes on it. */
  private drawBuilding(s: InteriorScene, L: Interior) {
    const p = this.p;
    if (!this.blitHall(s, L)) this.drawHall(s, L);
    // the raw material gate lights up while a delivery comes in
    const ay = L.aisle.y;
    if (s.inbound) p.onRight(0, 0, 0, ay - 0.9, ay + 0.9, 0, 30, "rgba(253,230,138,0.85)");
    for (const lk of L.locked) p.tag(s.lockedLabel(L.lines.length + L.locked.indexOf(lk), lk.level), L.w / 2, lk.y0 + 2.5, 2, { size: 13, bg: "rgba(15,23,42,0.85)", icon: "🔒" });
  }

  /**
   * Draws the hall's still layer into an offscreen canvas covering the view
   * (plus a margin to pan into) at the current zoom, and blits it. Redrawn
   * only when the view leaves it or the zoom moves a quarter octave. False
   * when the area would be too big to keep (then the hall is drawn live).
   */
  private blitHall(s: InteriorScene, L: Interior): boolean {
    const { cam, p } = this;
    const scale = 2 ** (Math.ceil(Math.log2(cam.zoom * this.dpr) * 4) / 4);
    const detail = p.zoom > 0.6 ? 2 : p.zoom > 0.45 ? 1 : 0;
    // the sign's lettering needs the game font: drawn again once it has loaded
    const fonts = typeof document !== "undefined" ? document.fonts?.status : "";
    const key = `${this.layoutKey}|${s.accent}|${s.title}|${s.icon}|${fonts}|${scale}|${detail}`;
    // the hall's extent in world px: slab, and the walls up to the roof
    const bx0 = sx(-0.4, L.d + 0.4) - 8;
    const bx1 = sx(L.w + 0.4, -0.4) + 8;
    const by0 = sy(-0.4, -0.4, 100);
    const by1 = sy(L.w + 0.4, L.d + 0.4, -16) + 8;
    const hw = cam.w / 2 / cam.zoom;
    const hh = cam.h / 2 / cam.zoom;
    const vx0 = Math.max(bx0, cam.x - hw);
    const vx1 = Math.min(bx1, cam.x + hw);
    const vy0 = Math.max(by0, cam.y - hh);
    const vy1 = Math.min(by1, cam.y + hh);
    if (vx1 <= vx0 || vy1 <= vy0) return true; // the hall is off screen
    let h = this.hall;
    if (!h || h.key !== key || vx0 < h.x0 || vy0 < h.y0 || vx1 > h.x1 || vy1 > h.y1) {
      const m = 200 / cam.zoom;
      const x0 = Math.max(bx0, vx0 - m);
      const x1 = Math.min(bx1, vx1 + m);
      const y0 = Math.max(by0, vy0 - m);
      const y1 = Math.min(by1, vy1 + m);
      const cw = Math.ceil((x1 - x0) * scale);
      const ch = Math.ceil((y1 - y0) * scale);
      if (cw > 6000 || ch > 6000 || cw * ch > 12e6) return false;
      const canvas = h?.canvas ?? document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const c = canvas.getContext("2d");
      if (!c) return false;
      c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
      const main = this.ctx;
      this.ctx = c;
      p.ctx = c;
      try {
        this.drawHall(s, L);
      } finally {
        this.ctx = main;
        p.ctx = main;
      }
      h = this.hall = { canvas, key, scale, x0, y0, x1, y1 };
    }
    this.ctx.drawImage(h.canvas, h.x0, h.y0, h.canvas.width / h.scale, h.canvas.height / h.scale);
    return true;
  }

  /** Slab, floor, markings, locked halls, walls with windows and gates: everything that stays still. */
  private drawHall(s: InteriorScene, L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const { w, d } = L;
    p.box(-0.4, -0.4, w + 0.8, d + 0.8, -16, 16, "#2a3240", "#353e4c", false);
    this.drawFloor(L);
    // hall floors: each line's bay is a glossy epoxy floor (it catches the
    // window light at the back), with a green walkway in front
    for (const line of L.lines) {
      const g = c.createLinearGradient(sx(w / 2, line.y0 + 0.2), sy(w / 2, line.y0 + 0.2), sx(w / 2, line.y0 + 4.8), sy(w / 2, line.y0 + 4.8));
      g.addColorStop(0, "#98a1ab");
      g.addColorStop(0.55, "#8a939d");
      g.addColorStop(1, "#838c96");
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, g);
      p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, floorGrain(c));
      p.quadStroke(0.3, line.y0 + 0.2, w - 0.6, 4.6, "rgba(15,23,42,0.18)", 1);
      p.quad(0.3, line.belt + 1.55, w - 0.6, 0.55, "rgba(34,197,94,0.32)");
      p.line(0.3, line.belt + 1.55, w - 0.3, line.belt + 1.55, "#facc15", 1.4);
      p.line(0.3, line.belt + 2.1, w - 0.3, line.belt + 2.1, "#facc15", 1.4);
      // painted walking arrows along the walkway
      for (let x = 2; x < w - 1; x += 5) this.chevron(x, line.belt + 1.82, "rgba(255,255,255,0.55)");
      // keep-clear hatching at both ends of the line
      this.hatch(0.3, line.y0 + 0.2, 0.45, 4.6);
      this.hatch(w - 0.75, line.y0 + 0.2, 0.45, 4.6);
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
    }
    // aisle: lane markings, arrows and the tyre marks of the forklifts
    const ay = L.aisle.y;
    c.strokeStyle = "rgba(30,30,32,0.07)";
    c.lineWidth = 3;
    c.beginPath();
    for (const off of [-0.32, -0.12, 0.14, 0.34]) {
      c.moveTo(sx(0.5, ay + off), sy(0.5, ay + off));
      c.lineTo(sx(w - 0.5, ay + off), sy(w - 0.5, ay + off));
    }
    c.stroke();
    p.line(0.2, ay - 0.6, w - 0.2, ay - 0.6, "#facc15", 2);
    p.line(0.2, ay + 0.6, w - 0.2, ay + 0.6, "#facc15", 2);
    for (let x = 2; x < w - 2; x += 2.5) p.line(x, ay, x + 1.2, ay, "rgba(255,255,255,0.75)", 2, 0, [6, 6]);
    this.drawWalls(s, L);
    this.drawSunlight(L);
  }

  /** Polished concrete: power-floated grain, saw-cut joints, a few stains. */
  private drawFloor(L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const { w, d } = L;
    p.quad(0, 0, w, d, FLOOR);
    p.quad(0, 0, w, d, floorGrain(c));
    // a darker band along the walls (the floor nobody walks on, and the shade of the walls)
    for (let k = 0; k < 4; k++) {
      p.quad(0, 0, w, 0.25 - k * 0.05, "rgba(15,23,42,0.05)");
      p.quad(0, 0, 0.25 - k * 0.05, d, "rgba(15,23,42,0.05)");
    }
    // saw-cut joints every four tiles: a dark groove and a lit edge
    c.lineWidth = 1.2;
    c.strokeStyle = "rgba(20,24,30,0.16)";
    c.beginPath();
    for (let x = 4; x < w; x += 4) {
      c.moveTo(sx(x, 0), sy(x, 0));
      c.lineTo(sx(x, d), sy(x, d));
    }
    for (let y = 4; y < d; y += 4) {
      c.moveTo(sx(0, y), sy(0, y));
      c.lineTo(sx(w, y), sy(w, y));
    }
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(255,255,255,0.08)";
    c.beginPath();
    for (let x = 4; x < w; x += 4) {
      c.moveTo(sx(x + 0.05, 0), sy(x + 0.05, 0));
      c.lineTo(sx(x + 0.05, d), sy(x + 0.05, d));
    }
    for (let y = 4; y < d; y += 4) {
      c.moveTo(sx(0, y + 0.05), sy(0, y + 0.05));
      c.lineTo(sx(w, y + 0.05), sy(w, y + 0.05));
    }
    c.stroke();
    // oil and water stains (the same ones every visit)
    for (let i = 0; i < 22; i++) {
      const x = 0.8 + hash(i * 3 + 1) * (w - 1.6);
      const y = 0.8 + hash(i * 3 + 2) * (d - 1.6);
      p.ellipse(x, y, 0, 6 + hash(i * 3 + 3) * 18, `rgba(48,44,40,${0.04 + hash(i * 7) * 0.05})`, 0.5);
    }
  }

  /** The back walls: cladding, a painted dado, windows, pipes, panels and the gate. */
  private drawWalls(s: InteriorScene, L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const { w, d } = L;
    const ay = L.aisle.y;
    const WH = 92;
    p.box(-0.35, -0.35, w + 0.35, 0.35, 0, WH, "#cfd6de", "#9aa4b0");
    p.box(-0.35, 0, 0.35, d, 0, WH, "#dde3ea", "#9aa4b0");
    // sandwich-panel ribs
    c.strokeStyle = "rgba(15,23,42,0.07)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0.5; x < w; x += 0.5) {
      c.moveTo(sx(x, 0), sy(x, 0, 24));
      c.lineTo(sx(x, 0), sy(x, 0, WH));
    }
    for (let y = 0.5; y < d; y += 0.5) {
      c.moveTo(sx(0, y), sy(0, y, 24));
      c.lineTo(sx(0, y), sy(0, y, WH));
    }
    c.stroke();
    // the lower wall: a painted dado and a yellow-black kick band
    p.onLeft(-0.35, 0, 0, 0.35, w, 0, 24, "#7d8896");
    p.onRight(0, 0, 0, 0, d, 0, 24, "#8a95a2");
    p.onLeft(-0.35, 0, 0, 0.35, w, 23, 24.5, "#5f6976");
    p.onRight(0, 0, 0, 0, d, 23, 24.5, "#68727f");
    this.kickBand(L);
    // the accent band under the roof
    p.onLeft(-0.35, 0, 0, 0.35, w, WH - 12, WH - 6, p.col(s.accent));
    p.onRight(0, 0, 0, 0, d, WH - 12, WH - 6, p.col(s.accent));
    // clerestory windows: frame, sky, mullions and a transom
    for (let x = 1; x < w - 1; x += 3) this.windowLeft(x, 2.2);
    for (let y = 1; y < d - 4; y += 3) this.windowRight(y, 2.2);
    // pipes along the walls (compressed air, and the red sprinkler main under the roof)
    for (const [z, col] of [[34, "#6b7684"], [38, "#7c8795"], [WH - 16, "#dc2626"]] as const) {
      p.onLeft(-0.35, 0, 0, 0.35, w, z, z + 2.2, col);
      p.onRight(0, 0, 0, 0, d, z, z + 2.2, col);
    }
    for (let x = 1.5; x < w; x += 2) p.onLeft(-0.35, 0, 0, x, x + 0.06, 32, 41, "#475569");
    for (let y = 1.5; y < d; y += 2) p.onRight(0, 0, 0, y, y + 0.06, 32, 41, "#475569");
    // electrical panels and fire points along the back wall, clear of the columns
    for (const x of [2.2, 8.4, 14.6, 21.4]) {
      if (x > w - 1.5) continue;
      p.box(x, 0, 0.8, 0.22, 0, 30, "#c7ced6", "#dfe4ea");
      p.onLeft(x, 0.22, 0, 0.08, 0.36, 12, 26, "#9aa4b0");
      p.onLeft(x, 0.22, 0, 0.44, 0.72, 12, 26, "#9aa4b0");
      p.onLeft(x, 0.22, 0, 0.62, 0.68, 27, 29, "#22c55e");
      // the fire point: an extinguisher on a red board
      p.onLeft(-0.35, 0, 0, x + 1.25 + 0.35, x + 1.55 + 0.35, 14, 30, "#dc2626");
      p.box(x + 1.33, 0.02, 0.1, 0.1, 0, 11, "#ef4444", "#f87171");
    }
    // the raw material gate on the side wall, by the aisle: a roller door in a striped frame
    p.onRight(0, 0, 0, ay - 1.12, ay + 1.12, 0, 44, "#facc15");
    for (let k = 0; k < 6; k++) p.onRight(0, 0, 0, ay - 1.12 + k * 0.4, ay - 0.92 + k * 0.4, 0, 44, "#111827");
    p.onRight(0, 0, 0, ay - 1, ay + 1, 0, 40, "#4b5563");
    for (let z = 3; z < 40; z += 3) p.onRight(0, 0, 0, ay - 1, ay + 1, z, z + 0.8, "#374151");
    if (s.title) this.sign(s, w);
  }

  /** The plant's sign, hung in front of the back wall: its icon and name in its own colour. */
  private sign(s: InteriorScene, w: number) {
    const p = this.p;
    const c = this.ctx;
    const text = `${s.icon ?? ""} ${(s.title ?? "").toUpperCase()}`.trim();
    // as wide as the name needs (within reason), centred over the halls
    c.font = raceFont(900, 14 * 1.1, false);
    const size = Math.min(14, (14 * 250) / Math.max(1, c.measureText(text).width));
    c.font = raceFont(900, size * 1.1, false);
    const half = Math.min(4.6, (c.measureText(text).width + 36) / 64);
    const [x0, x1, y] = [w / 2 - half, w / 2 + half, 0.45];
    // the cables to the roof
    c.strokeStyle = "#334155";
    c.lineWidth = 1;
    c.beginPath();
    for (const x of [x0 + 0.4, x1 - 0.4]) {
      c.moveTo(sx(x, y), sy(x, y, 80));
      c.lineTo(sx(x, y), sy(x, y, 92));
    }
    c.stroke();
    // the board: a white rim, the plant's colour, a lit top edge
    p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#f8fafc");
    p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 59.5, 78.5, p.col(s.accent));
    p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 76.5, 78.5, "rgba(255,255,255,0.25)");
    p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#ffffff", 900);
  }

  /** A window high on the back wall (plane y = 0): frame, sky, mullions, transom. */
  private windowLeft(x: number, w: number) {
    const p = this.p;
    const c = this.ctx;
    p.onLeft(-0.35, 0, 0, x - 0.08 + 0.35, x + w + 0.08 + 0.35, 50, 78, "#475569");
    const g = c.createLinearGradient(0, sy(x, 0, 76), 0, sy(x, 0, 52));
    g.addColorStop(0, "#b9dcfb");
    g.addColorStop(0.6, "#e3f1fd");
    g.addColorStop(1, "#cfe5f8");
    p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, 52, 76, g);
    for (let u = 0.55; u < w; u += 0.55) p.onLeft(-0.35, 0, 0, x + u + 0.33, x + u + 0.37, 52, 76, "#64748b");
    p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, 63.5, 64.5, "#64748b");
  }

  /** A window high on the side wall (plane x = 0). */
  private windowRight(y: number, w: number) {
    const p = this.p;
    const c = this.ctx;
    p.onRight(0, 0, 0, y - 0.08, y + w + 0.08, 50, 78, "#475569");
    const g = c.createLinearGradient(0, sy(0, y, 76), 0, sy(0, y, 52));
    g.addColorStop(0, "#b4d6f5");
    g.addColorStop(0.6, "#dcecfa");
    g.addColorStop(1, "#c6ddf2");
    p.onRight(0, 0, 0, y, y + w, 52, 76, g);
    for (let u = 0.55; u < w; u += 0.55) p.onRight(0, 0, 0, y + u - 0.02, y + u + 0.02, 52, 76, "#64748b");
    p.onRight(0, 0, 0, y, y + w, 63.5, 64.5, "#64748b");
  }

  /** A yellow-black safety band along the foot of both walls. */
  private kickBand(L: Interior) {
    const p = this.p;
    p.onLeft(-0.35, 0, 0, 0.35, L.w, 0, 4, "#facc15");
    p.onRight(0, 0, 0, 0, L.d, 0, 4, "#facc15");
    for (let u = 0.35; u < L.w; u += 0.5) p.onLeft(-0.35, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
    for (let u = 0; u < L.d; u += 0.5) p.onRight(0, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
  }

  /** Daylight from the back windows, falling across the floor in soft shafts. */
  private drawSunlight(L: Interior) {
    const c = this.ctx;
    // where light through a point of the back wall (height z) meets the floor
    const fx = (x: number, z: number) => x + z * 0.012;
    const fy = (z: number) => z * 0.05;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let x = 1; x < L.w - 1; x += 3) {
      const x0 = x;
      const x1 = x + 2.2;
      // the patch of light on the floor
      c.beginPath();
      c.moveTo(sx(fx(x0, 76), fy(76)), sy(fx(x0, 76), fy(76)));
      c.lineTo(sx(fx(x1, 76), fy(76)), sy(fx(x1, 76), fy(76)));
      c.lineTo(sx(fx(x1, 52), fy(52)), sy(fx(x1, 52), fy(52)));
      c.lineTo(sx(fx(x0, 52), fy(52)), sy(fx(x0, 52), fy(52)));
      c.closePath();
      c.fillStyle = "rgba(255,244,214,0.10)";
      c.fill();
      // the beam itself, fading toward the floor
      const top = [sx(x0, 0), sy(x0, 0, 76)];
      const bot = [sx(fx(x0, 76), fy(76)), sy(fx(x0, 76), fy(76))];
      const g = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
      g.addColorStop(0, "rgba(255,246,222,0.10)");
      g.addColorStop(1, "rgba(255,246,222,0.01)");
      c.beginPath();
      c.moveTo(sx(x0, 0), sy(x0, 0, 76));
      c.lineTo(sx(x1, 0), sy(x1, 0, 76));
      c.lineTo(sx(fx(x1, 76), fy(76)), sy(fx(x1, 76), fy(76)));
      c.lineTo(sx(fx(x1, 52), fy(52)), sy(fx(x1, 52), fy(52)));
      c.lineTo(sx(fx(x0, 52), fy(52)), sy(fx(x0, 52), fy(52)));
      c.lineTo(sx(x0, 0), sy(x0, 0, 52));
      c.closePath();
      c.fillStyle = g;
      c.fill();
    }
    c.restore();
  }

  /** High-bay lamps over the lines: a housing, its glow and a faint cone of light. */
  private drawLamps(L: Interior) {
    const c = this.ctx;
    const Z = 86;
    c.save();
    for (const line of L.lines)
      for (let x = 2.5; x < L.w - 1; x += 4) {
        const y = line.belt - 0.4;
        const [lx, ly] = [sx(x, y), sy(x, y, Z)];
        const [fx, fy] = [sx(x, y), sy(x, y, 0)];
        // the cone is the same for every lamp: one gradient, moved to each
        if (!this.cone) {
          this.cone = c.createLinearGradient(0, 0, 0, Z);
          this.cone.addColorStop(0, "rgba(255,248,226,0.08)");
          this.cone.addColorStop(0.7, "rgba(255,248,226,0.03)");
          this.cone.addColorStop(1, "rgba(255,248,226,0)");
        }
        c.globalCompositeOperation = "lighter";
        c.translate(lx, ly);
        c.fillStyle = this.cone;
        c.beginPath();
        c.moveTo(-5, 0);
        c.lineTo(5, 0);
        c.lineTo(40, Z);
        c.lineTo(-40, Z);
        c.closePath();
        c.fill();
        c.translate(-lx, -ly);
        c.globalCompositeOperation = "source-over";
        // the housing and its hot lens
        c.fillStyle = "#2b3038";
        c.beginPath();
        c.moveTo(lx - 7, ly + 1);
        c.lineTo(lx - 4, ly - 5);
        c.lineTo(lx + 4, ly - 5);
        c.lineTo(lx + 7, ly + 1);
        c.closePath();
        c.fill();
        c.fillStyle = "#fffaf0";
        c.beginPath();
        c.ellipse(lx, ly + 1, 6.5, 2, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "rgba(43,48,56,0.6)";
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(lx, ly - 5);
        c.lineTo(lx, ly - 22);
        c.stroke();
        // the pool of light on the floor (lit after the scene)
        this.p.light(fx, fy, 78, "#fff4dc", 0.32);
      }
    c.restore();
  }

  /** A painted walking arrow (pointing along +x). */
  private chevron(x: number, y: number, color: string) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx(x - 0.15, y - 0.12), sy(x - 0.15, y - 0.12));
    c.lineTo(sx(x + 0.1, y), sy(x + 0.1, y));
    c.lineTo(sx(x - 0.15, y + 0.12), sy(x - 0.15, y + 0.12));
    c.stroke();
  }

  /** Yellow-black hatching on the floor (keep clear). */
  private hatch(x: number, y: number, w: number, d: number) {
    const c = this.ctx;
    const p = this.p;
    c.save();
    c.beginPath();
    c.moveTo(sx(x, y), sy(x, y));
    c.lineTo(sx(x + w, y), sy(x + w, y));
    c.lineTo(sx(x + w, y + d), sy(x + w, y + d));
    c.lineTo(sx(x, y + d), sy(x, y + d));
    c.closePath();
    c.clip();
    p.quad(x, y, w, d, "rgba(250,204,21,0.55)");
    c.strokeStyle = "rgba(17,24,39,0.6)";
    c.lineWidth = 4;
    c.beginPath();
    for (let k = -w; k < d + w; k += 0.35) {
      c.moveTo(sx(x, y + k), sy(x, y + k));
      c.lineTo(sx(x + w, y + k + w), sy(x + w, y + k + w));
    }
    c.stroke();
    c.restore();
  }

  /** A soft dark patch on the floor under a machine (ambient occlusion). */
  private contactShade(x: number, y: number, rx: number, a = 0.22) {
    const c = this.ctx;
    const [px, py] = [sx(x, y), sy(x, y)];
    c.save();
    c.translate(px, py);
    c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    g.addColorStop(0, `rgba(10,14,20,${a})`);
    g.addColorStop(1, "rgba(10,14,20,0)");
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }

  private drawLine(s: InteriorScene, L: Interior, line: Line, focus: boolean) {
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

    // machines sit on the floor: a soft shade around their feet
    for (const st of stops) if (st.def.staff > 0 || st.def.machine === "sheetRack" || st.def.machine === "bodyRack") this.contactShade(st.stop.x, st.stop.y - 0.45, st.w * 30, 0.2);

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
          if (near && !this.low) this.steam(x - 0.3, y - 0.6);
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
    // a stack light on every machine: green working, amber blinking without its operator;
    // while the line waits (the reason is tagged where it is) they glow a calm amber: standby
    for (const st of stops) {
      if (st.def.staff === 0) continue;
      const [on, off] = !s.running ? ["#f59e0b", "#b45309"] : st.staffed ? ["#22c55e", "#22c55e"] : ["#f59e0b", "#78350f"];
      const lit = s.running ? st.staffed || Math.sin(this.t * 2.5) > 0 : Math.sin(this.t * 1.2 + st.x * 0.3) > -0.3;
      p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
      p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? on : off);
      if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), 18, on, s.running ? 0.45 : 0.3);
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
      // waiting people still shift from foot to foot
      const pose = busy ? Math.floor(this.t * 4 + i) % 4 : Math.floor(this.t * (s.running ? 1.5 : 0.7) + i) % 2;
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
    // station names on the floor in front of each station (with its operator on the shop floor);
    // the lines away from the middle of the view just show their icons, so the hall stays calm
    if (near)
      for (const st of stops) {
        const sel = this.selected?.line === line.index && this.selected.id === st.def.id;
        const crew = floor && st.slot !== undefined && st.staffed ? ` · 👷${st.slot + 1}` : "";
        if (focus || sel) p.tag(`${st.def.icon} ${s.labels[st.def.id] ?? st.def.id}${crew}`, st.x + st.w / 2, line.belt + 1.3, 1, { size: 9, bg: sel ? "rgba(14,165,233,0.95)" : "rgba(15,23,42,0.78)" });
        else p.tag(st.def.icon, st.x + st.w / 2, line.belt + 1.3, 1, { size: 8, bg: "rgba(15,23,42,0.5)" });
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
    // a ring spreading from the machine you tapped
    const r = this.ripple;
    if (r) {
      const age = this.t - r.t0;
      const st = this.find(r.pick);
      const line = L.lines[r.pick.line];
      if (age > 0.6 || !st || !line) this.ripple = null;
      else {
        const g = 0.15 + age * 1.2;
        this.p.quadStroke(st.x - g, line.belt - 1.1 - g, st.w + g * 2, 2.2 + g * 2, `rgba(125,211,252,${(1 - age / 0.6) * 0.9})`, 2.5);
      }
    }
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
      // each glow at its own strength
      g.addColorStop(0, l.color + Math.round(Math.max(0, Math.min(1, l.a)) * 0xaa).toString(16).padStart(2, "0"));
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
    const spr = sprites3d.get(key, STATION_SIZE, k, (T, { kit, interior }) => interior.buildStation(T, kit, model, pose, s.accent, robots, part, variant, s.color), part === "back", "indoor");
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
    const spr = sprites3d.get(`ipart|${kind}|${color}`, PART_SIZE, k, (T, { interior }) => interior.buildPart(T, kind, color), false, "indoor");
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
    const spr = sprites3d.get(`iprop|${kind}|${accent}|${color}`, PROP_SIZE, k, (T, { interior }) => interior.buildProp(T, kind, accent, color), true, "indoor");
    if (!spr) return;
    this.ctx.drawImage(spr.img, sx(x, y) - PROP_SIZE.ax, sy(x, y) - PROP_SIZE.ay, PROP_SIZE.w, PROP_SIZE.h);
  }

  private person(x: number, y: number, role: WorkerRole, pose: number, i: number, k: number) {
    if (this.cam.zoom < 0.45) {
      this.p.person(x, y, role === "worker" ? "#f97316" : "#2563eb", this.t * 3 + i);
      return;
    }
    const tone = i % 4;
    const spr = sprites3d.get(`iman|${role}|${pose}|${tone}`, PERSON_SIZE, Math.min(4, k + 1), (T, { interior }) => interior.buildWorker(T, role, pose, tone), true, "indoor");
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
    }, true, "indoor");
    if (!spr) return;
    this.ctx.drawImage(spr.img, sx(x, y) - ROBOT_SIZE.ax, sy(x, y) - ROBOT_SIZE.ay, ROBOT_SIZE.w, ROBOT_SIZE.h);
  }

  private vehicle(key: string, x: number, y: number, k: number, build: Parameters<typeof sprites3d.get>[3]) {
    const spr = sprites3d.get(`iveh|${key}`, VEHICLE_SIZE, k, build, true, "indoor");
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

  /** Soft puffs of steam rising off a hot machine and fading out. */
  private steam(x: number, y: number) {
    const c = this.ctx;
    const [bx, by] = [sx(x, y), sy(x, y, 34)];
    for (let i = 0; i < 3; i++) {
      const u = (this.t * 0.35 + i / 3 + x * 0.17) % 1;
      const r = 6 + u * 16;
      c.fillStyle = `rgba(241,245,249,${(0.34 * (1 - u) * Math.min(1, u * 5)).toFixed(3)})`;
      c.beginPath();
      c.arc(bx + Math.sin(u * 4 + i) * 4 + u * 6, by - u * 42, r, 0, Math.PI * 2);
      c.fill();
    }
  }
}

const smooth = (u: number) => u * u * (3 - 2 * u);
/** Overshoots a little, then settles (a label popping in). */
const backOut = (u: number) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
/** A fixed pseudo-random number in [0, 1) for an index (stains stay put). */
const hash = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The grain of power-floated concrete: fine speckle and soft clouds, as a repeating pattern. */
const grains = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
function floorGrain(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  let pat = grains.get(ctx);
  if (pat) return pat;
  const N = 160;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d");
  if (!g) return "rgba(0,0,0,0)";
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = hash(i + 7);
    const dark = v < 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = dark ? 40 : 255;
    img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 18);
  }
  g.putImageData(img, 0, 0);
  // soft lighter and darker clouds (trowel marks)
  for (let k = 0; k < 14; k++) {
    const x = hash(k * 5 + 1) * N;
    const y = hash(k * 5 + 2) * N;
    const r = 20 + hash(k * 5 + 3) * 40;
    const light = k % 2 === 0;
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      rg.addColorStop(0, light ? "rgba(255,255,255,0.06)" : "rgba(30,30,30,0.05)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  pat = ctx.createPattern(cv, "repeat") ?? undefined;
  if (!pat) return "rgba(0,0,0,0)";
  grains.set(ctx, pat);
  return pat;
}
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
