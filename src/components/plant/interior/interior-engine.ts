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
import { isSaving, shouldDraw } from "@/lib/power";
import { attachControls, Camera } from "../../map/camera";
import { mix, Painter, raceFont, shade, sx, sy, toTile } from "../../map/iso";
import { skyAt, worldClock, type TimeMode } from "../../map/lighting";
import { drawModel, drawTruck, type CarModel } from "../../map/vehicles";
import { sprites3d, tierFor, type SpriteSize } from "../../three/sprites";
import type { WorkerRole } from "../../three/interior-models";
import { bat, brick, bunting, christmasTree, cobweb, flowerPot, garland, parasol, planks, pumpkin, stringLights, tiles } from "./hall-art";
import type { Season } from "@/game/engine/season";
import { hallLook, type HallLook } from "./theme";
import { interiorLayout, lineStops, recipeFor, type Interior, type InteriorSpec, type Line, type PartKind, type PlacedStation, type PropKind, type StationDef, type StationId, type StationUpgrade } from "./layout";

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
  /** Words painted on the floor (Body Works shop floor and stops), and the cheer of an upgrade. */
  words?: { noOperator: string; build: string; noRaw: string; full: string; upgraded?: string; repaired?: string; tapRepair?: string };
  /** The shop floor: which machine of the first line is broken (its place among the machines, -1 none), seconds of boost left, the crew's morale. */
  brokenSlot?: number;
  boost?: number;
  morale?: number;
  /** The plant's speed and quality tiers: a step up is celebrated at the stations they stand for. */
  tiers?: { speed: number; grade: number };
  /** The halls' style the player picked (absent: the one the level brings). */
  skin?: import("@/game/config/collection").SkinId;
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
  /** Halloween or winter decorations, and the time of day the map is showing. */
  season?: Season | null;
  timeMode?: TimeMode;
}

export interface StationPick {
  line: number;
  id: StationId;
}

/** A scrap of confetti: where it is (tiles, height in px), how it falls and turns. */
interface Confetti {
  x: number;
  y: number;
  z: number;
  vz: number;
  vx: number;
  rot: number;
  vr: number;
  color: string;
  w: number;
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
/** A pallet of the plant's stock, stacked along the walls. */
const STACK_SIZE: SpriteSize = { w: 76, h: 84, ax: 38, ay: 58 };
/** How many poses each animated machine has. */
const POSES: Record<string, number> = { laserCutter: 4, press: 3, bodyJig: 2, furnace: 2, cnc: 4, curing: 2, filler: 4 };
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
  /** When the last frame was drawn (battery saver: lib/power.ts). */
  private lastDraw = 0;
  /**
   * The hall's still layer (floor, markings, walls, windows, daylight), drawn
   * once around the view and reused until the camera leaves it or zooms.
   */
  private hall: { canvas: HTMLCanvasElement; key: string; scale: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  private vig: { w: number; h: number; g: CanvasGradient } | null = null;
  /** The lamps' cones of light, one gradient per kind of lamp. */
  private cones = new Map<string, CanvasGradient>();
  /** How this plant's hall looks (its era and trade). */
  private look: HallLook = hallLook("bodyWorks", 5);
  /** 0 noon … 0.5 golden hour … 1 night (the map's own clock). */
  private skyDark = 0;
  private season: Season | null = null;
  /** Finished units rising over each line's store ("+5 ⚙️"), and when the last ones went up. */
  private pops: { line: number; n: number; t0: number; bump: number }[] = [];
  private popAt = -99;
  /** Units made on a fast line, not shown yet. */
  private made = 0;
  private lastProgress = -1;
  /** The ring that spreads from a machine you tap. */
  private ripple: { pick: StationPick; t0: number } | null = null;
  /** An upgrade being celebrated: confetti over the stations it changed, a flash, the crew jumping. */
  private party: { t0: number; lines: Set<number>; stations: StationPick[]; bits: Confetti[]; word?: "upgraded" | "repaired" } | null = null;
  private tiers: { speed: number; grade: number } | null = null;
  /** The camera tours the plant by itself until the player touches it. */
  private touring = false;
  private tourLeg = 0;
  onTourEnd: () => void = () => {};
  /** Tapping the broken machine: fixes it (returns true when it did). */
  onRepair: () => boolean = () => false;
  private interrupt = () => {
    if (!this.touring) return;
    this.touring = false;
    this.onTourEnd();
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.p = new Painter(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.detach = attachControls(canvas, this.cam, { onTap: (x, y) => this.tap(x, y) });
    // touching the view ends the tour
    canvas.addEventListener("pointerdown", this.interrupt);
    canvas.addEventListener("wheel", this.interrupt, { passive: true });
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
    // a step up in speed or quality: the stations that stand for it celebrate
    const before = this.layout;
    const was = this.scene?.spec;
    const ups: StationUpgrade[] = [];
    if (s.tiers && this.tiers && before) {
      if (s.tiers.speed > this.tiers.speed) ups.push("speed");
      if (s.tiers.grade > this.tiers.grade) ups.push("grade");
    }
    this.tiers = s.tiers ? { ...s.tiers } : null;
    this.scene = s;
    this.sceneAt = performance.now();
    this.season = s.season ?? null;
    const f = s.spec.floor;
    const key = `${s.type}|${s.spec.level}|${s.spec.automation}|${s.spec.manager}|${f ? `${f.machines}/${f.workers}` : ""}|${s.skin ?? ""}`;
    let changed: StationPick[] = [];
    if (key !== this.layoutKey) {
      const grew = this.layout !== null;
      this.look = hallLook(s.type, s.spec.level, s.skin);
      this.layout = interiorLayout(s.spec, recipeFor(s.type));
      // what an upgrade changed: a new hall, a machine built or manned, robots in
      if (before && was && before.lines.length <= this.layout.lines.length) {
        if (s.spec.level > was.level) ups.push("level");
        if (s.spec.automation > was.automation) ups.push("automation");
        changed = this.layout.lines.flatMap((line) =>
          line.stations
            .filter((st) => {
              const old = before.lines[line.index]?.stations.find((x) => x.def.id === st.def.id);
              return st.mode !== "planned" && (!old || old.mode !== st.mode || old.staffed !== st.staffed);
            })
            .map((st) => ({ line: line.index, id: st.def.id })),
        );
      }
      this.layoutKey = key;
      this.frame(grew);
    }
    if (ups.length || changed.length) this.celebrate(changed, ups);
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
      this.raf = requestAnimationFrame(loop);
      // low graphics: ~30 FPS; battery saver: 30 FPS while playing, a few frames a second when idle
      if (document.hidden || !shouldDraw(now, this.lastDraw, this.low)) return;
      this.lastDraw = now;
      const dt = Math.min(isSaving() ? 0.25 : 0.1, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    this.canvas.removeEventListener("pointerdown", this.interrupt);
    this.canvas.removeEventListener("wheel", this.interrupt);
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
    // the broken machine: a tap fixes it
    const broken = this.brokenStation();
    const picked = hit as StationPick | null;
    if (picked && broken && picked.line === 0 && picked.id === broken.def.id && this.onRepair()) {
      this.celebrate([picked], [], "repaired");
      return;
    }
    this.selected = hit;
    if (hit) this.ripple = { pick: hit, t0: this.t };
    this.onSelect(hit);
  }

  /** The broken machine of the first line, if one is down. */
  private brokenStation(): PlacedStation | undefined {
    const k = this.scene?.brokenSlot ?? -1;
    if (k < 0 || !this.layout?.lines[0]) return undefined;
    const machines = this.layout.lines[0].stations.filter((st) => st.slot !== undefined && st.mode !== "planned");
    return machines.length ? machines[k % machines.length] : undefined;
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
    if (s?.running) this.work += dt * ((s.boost ?? 0) > 0 ? 2 : 1);
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
    // the tour moves on to its next shot when the camera gets there
    if (this.touring && !cam.animating) this.nextLeg();
    this.updateParty(dt);
    // the time of day runs on through the factory, as on the map
    worldClock.t += dt;
    this.skyDark = skyAt(s?.timeMode ?? "auto", worldClock.t).dark;
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
    this.drawBackDecor(L);
    // the line in the middle of the view gets the full station names, the others their icons
    const ty = toTile(cam.x, cam.y + 20).y;
    let focus = 0;
    for (const line of L.lines) if (Math.abs(line.belt - ty) < Math.abs(L.lines[focus].belt - ty)) focus = line.index;
    for (const line of L.lines) this.drawLine(s, L, line, line.index === focus);
    this.drawAisle(s, L);
    if (L.crane) this.drawCrane(L);
    this.drawLamps(L);
    this.drawSeasonHigh(L);
    this.drawSelection(L);
    this.nightfall();
    this.drawLights();
    this.drawParty(s, L);
    this.drawPops(L);
    this.vignette();
  }

  /** Starts (or stops) the camera's tour of the plant: along every line, the break corner, the dock, the whole hall. */
  tour(on: boolean) {
    this.touring = on;
    this.tourLeg = 0;
    if (on) this.nextLeg();
    else this.cam.stop();
  }

  private nextLeg() {
    const L = this.layout;
    if (!L) return;
    const at = (x: number, y: number, z: number) => [sx(x, y), sy(x, y, z)] as const;
    const near = Math.min(this.cam.maxZoom, Math.max(1.3, this.cam.w / 260));
    const legs: { p: readonly [number, number]; zoom: number; dur: number }[] = [];
    for (const line of L.lines) {
      legs.push({ p: at(2.4, line.belt, 18), zoom: near, dur: 2.8 });
      legs.push({ p: at(L.w - 2.8, line.belt, 18), zoom: near, dur: 10 });
    }
    legs.push({ p: at(4.2, L.aisle.y + 1.2, 12), zoom: near * 1.15, dur: 4 });
    legs.push({ p: at(L.w - 4.5, L.aisle.y + 0.6, 12), zoom: near, dur: 7 });
    legs.push({ p: at(L.w * 0.5, L.d * 0.45, 30), zoom: this.cam.minZoom * 1.15, dur: 4.5 });
    legs.push({ p: at(L.w * 0.52, L.d * 0.45, 30), zoom: this.cam.minZoom * 1.2, dur: 3 });
    const leg = legs[this.tourLeg % legs.length];
    this.tourLeg++;
    this.cam.flyTo(leg.p[0], leg.p[1], leg.zoom, leg.dur);
  }

  /** Celebrates an upgrade: confetti over the stations it changed (or stands for), a flash, the crew jumping. */
  private celebrate(changed: StationPick[], ups: StationUpgrade[], word: "upgraded" | "repaired" = "upgraded") {
    const L = this.layout;
    if (!L) return;
    const picks = [...changed];
    for (const line of L.lines)
      for (const st of line.stations)
        if (st.mode !== "planned" && ups.includes(st.def.upgrade) && !picks.some((q) => q.line === line.index && q.id === st.def.id)) picks.push({ line: line.index, id: st.def.id });
    if (!picks.length) return;
    const colors = ["#facc15", "#22d3ee", "#f472b6", "#4ade80", "#fb923c", "#a78bfa"];
    const bits: Confetti[] = [];
    const per = Math.max(4, Math.min(16, Math.floor(220 / picks.length)));
    for (const q of picks) {
      const st = this.find(q);
      const line = L.lines[q.line];
      if (!st || !line) continue;
      for (let i = 0; i < per; i++)
        bits.push({
          x: st.x + Math.random() * st.w,
          y: line.belt - 0.8 + Math.random() * 1.6,
          z: 60 + Math.random() * 50,
          vz: 20 + Math.random() * 50,
          vx: (Math.random() - 0.5) * 0.8,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 12,
          color: colors[(i + q.line) % colors.length],
          w: 2 + Math.random() * 2.5,
        });
    }
    this.party = { t0: this.t, lines: new Set(picks.map((q) => q.line)), stations: picks, bits, word };
  }

  private updateParty(dt: number) {
    const party = this.party;
    if (!party) return;
    if (this.t - party.t0 > 3.4) {
      this.party = null;
      return;
    }
    for (const b of party.bits) {
      b.vz = Math.max(-42, b.vz - 130 * dt);
      b.z += b.vz * dt;
      b.x += (b.vx + Math.sin(b.rot) * 0.25) * dt;
      b.rot += b.vr * dt;
    }
    party.bits = party.bits.filter((b) => b.z > 0);
  }

  /** How high the crew of a line jumps while their upgrade is celebrated (px). */
  private cheer(line: number) {
    const party = this.party;
    if (!party || !party.lines.has(line)) return 0;
    const age = this.t - party.t0;
    return age < 1.5 ? Math.abs(Math.sin(age * 11)) * 6 * (1 - age / 1.5) : 0;
  }

  /** The celebration: the changed stations flash gold, confetti flutters down, a cheer rises over them. */
  private drawParty(s: InteriorScene, L: Interior) {
    const party = this.party;
    if (!party) return;
    const c = this.ctx;
    const age = this.t - party.t0;
    if (age < 1.8) {
      const a = (1 - age / 1.8) * (0.6 + 0.4 * Math.sin(age * 14));
      for (const q of party.stations) {
        const st = this.find(q);
        const line = L.lines[q.line];
        if (!st || !line) continue;
        this.p.quadStroke(st.x - 0.05, line.belt - 1.1, st.w + 0.1, 2.2, `rgba(250,204,21,${a.toFixed(3)})`, 3);
        c.globalCompositeOperation = "lighter";
        const [gx, gy] = [sx(st.stop.x, st.stop.y), sy(st.stop.x, st.stop.y, 20)];
        const g = c.createRadialGradient(gx, gy, 0, gx, gy, 60);
        g.addColorStop(0, `rgba(253,224,71,${(0.35 * a).toFixed(3)})`);
        g.addColorStop(1, "rgba(253,224,71,0)");
        c.fillStyle = g;
        c.fillRect(gx - 60, gy - 60, 120, 120);
        c.globalCompositeOperation = "source-over";
      }
    }
    for (const b of party.bits) {
      c.save();
      c.translate(sx(b.x, b.y), sy(b.x, b.y, b.z));
      c.rotate(b.rot);
      c.fillStyle = b.color;
      c.fillRect(-b.w / 2, -1, b.w, 1 + Math.abs(Math.cos(b.rot * 1.3)) * 2.2);
      c.restore();
    }
    // the cheer, over the first station it celebrates
    const first = party.stations[0] && this.find(party.stations[0]);
    const word = party.word === "repaired" ? s.words?.repaired : s.words?.upgraded;
    if (first && word && age < 2.4) {
      const line = L.lines[party.stations[0].line];
      const pop = age < 0.25 ? backOut(age / 0.25) : 1;
      const alpha = age > 1.9 ? (2.4 - age) / 0.5 : 1;
      const text = `⬆ ${word}`;
      c.save();
      c.globalAlpha = Math.max(0, alpha);
      c.translate(sx(first.stop.x, line.belt), sy(first.stop.x, line.belt, 70 + age * 18));
      c.scale(pop, pop);
      c.font = raceFont(900, 17);
      const w = c.measureText(text).width + 22;
      c.beginPath();
      c.roundRect(-w / 2, -15, w, 30, 15);
      const g = c.createLinearGradient(0, -15, 0, 15);
      g.addColorStop(0, "#fde047");
      g.addColorStop(1, "#f59e0b");
      c.fillStyle = g;
      c.shadowColor = "rgba(0,0,0,0.35)";
      c.shadowBlur = 8;
      c.shadowOffsetY = 2;
      c.fill();
      c.shadowColor = "transparent";
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "#1f2937";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 0, 1);
      c.restore();
    }
  }

  /** After dark the hall is lit by its lamps alone: everything a little dimmer and bluer (the lamps' pools are added after). */
  private nightfall() {
    const dark = this.skyDark;
    if (dark < 0.05) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = mix("#ffffff", "#8796c4", Math.min(1, dark) * 0.42);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /** Whether a box of world pixels (left, top, right, bottom) shows in the view: what doesn't, isn't drawn. */
  private seen(x0: number, y0: number, x1: number, y1: number) {
    const { cam } = this;
    const hw = cam.w / 2 / cam.zoom;
    const hh = cam.h / 2 / cam.zoom;
    return x1 >= cam.x - hw && x0 <= cam.x + hw && y1 >= cam.y - hh && y0 <= cam.y + hh;
  }

  /** Pallets of the plant's stock along the back wall, and the season by the columns. */
  private drawBackDecor(L: Interior) {
    if (!this.seen(sx(0, 2), sy(0, 0, 70), sx(L.w, 0), sy(L.w, 2, 0))) return;
    const k = tierCap(this.cam.zoom * this.dpr);
    const kinds = this.look.decor;
    [6.1, 12.9, 19.7].forEach((x, i) => this.stack(kinds[i % kinds.length], x, 0.85, k));
    const front = L.lines[0] ? L.lines[0].y0 + 0.45 : 1.85;
    if (this.season === "halloween") for (const x of [4.55, 11.65, 18.75]) pumpkin(this.p, x, front, 0.9, this.t);
    else if (this.season === "spring" || this.season === "summer") for (const x of [4.55, 11.65, 18.75]) flowerPot(this.p, x, front, 0.9, this.t, this.season);
  }

  /** The season up under the roof: strings of lights along the walls, bats. */
  private drawSeasonHigh(L: Interior) {
    // up along the walls, under the roof
    if (!this.season || !this.seen(sx(0, L.d), sy(0, 0, 92), sx(L.w, 0), sy(L.w, 1, 60))) return;
    const c = this.ctx;
    if (this.season === "halloween") {
      stringLights(this.p, L.w, L.d, 82, this.t, ["#f97316", "#a855f7"]);
      if (this.low) return;
      for (let i = 0; i < 4; i++) {
        const u = (this.t * (0.05 + i * 0.012) + i * 0.27) % 1;
        const x = 1 + u * (L.w - 2);
        const y = 2 + i * 4.5 + Math.sin(this.t * 0.7 + i) * 1.2;
        bat(c, sx(x, y), sy(x, y, 74 + Math.sin(this.t * 2 + i) * 6), this.t + i, 0.9);
      }
    } else if (this.season === "spring") stringLights(this.p, L.w, L.d, 82, this.t, ["#f9a8d4", "#fde68a", "#bbf7d0", "#c4b5fd"]);
    else if (this.season === "summer") stringLights(this.p, L.w, L.d, 82, this.t, ["#fbbf24", "#fb923c", "#f472b6", "#38bdf8"]);
    else stringLights(this.p, L.w, L.d, 82, this.t, ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#f472b6"]);
  }

  /** A pallet of the plant's own stock (coils, tyres, drums, reels…) stacked two high. */
  private stack(kind: PartKind, x: number, y: number, k: number) {
    const color = this.scene?.color ?? "#94a3b8";
    const spr = sprites3d.get(
      `istack|${kind}|${color}`,
      STACK_SIZE,
      k,
      (T, { interior }) => {
        const g = new T.Group();
        const pallet = new T.Mesh(new T.BoxGeometry(0.8, 0.05, 0.55), new T.MeshStandardMaterial({ color: "#a16207", roughness: 0.85 }));
        pallet.position.y = 0.025;
        g.add(pallet);
        let y0 = 0.05;
        for (let lv = 0; lv < 2; lv++) {
          let top = 0;
          for (const dx of [-0.2, 0.2]) {
            const part = interior.buildPart(T, kind, color);
            part.position.set(dx, y0, 0);
            g.add(part);
            top = Math.max(top, new T.Box3().setFromObject(part).max.y - y0);
          }
          y0 += Math.min(0.3, Math.max(0.05, top));
        }
        return g;
      },
      true,
      "indoor",
    );
    if (!spr) return;
    this.ctx.drawImage(spr.img, sx(x, y) - STACK_SIZE.ax, sy(x, y) - STACK_SIZE.ay, STACK_SIZE.w, STACK_SIZE.h);
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
    const day = this.daylight();
    if (this.low || this.cam.zoom < 0.6 || day < 0.05) return;
    const [wz0, wz1] = this.windowZ();
    const c = this.ctx;
    c.globalCompositeOperation = "lighter";
    let i = 0;
    for (let x = 1; x < L.w - 1; x += 3)
      for (let m = 0; m < 5; m++, i++) {
        // somewhere in the shaft: across it (u), down it (v), from the window's height (z)
        const u = (hash(i * 3 + 1) + Math.sin(this.t * 0.11 + i) * 0.08 + 1) % 1;
        const v = (hash(i * 3 + 2) + this.t * (0.012 + hash(i) * 0.01)) % 1;
        const z = wz0 + 2 + hash(i * 3 + 3) * (wz1 - wz0 - 4);
        const wx = x + u * 2.2 + z * 0.012 * v;
        const wy = z * 0.05 * v + 0.05;
        const tw = 0.3 + 0.3 * Math.sin(this.t * (1.3 + hash(i + 9)) + i * 2.1);
        const a = tw * day * Math.min(1, v * 6, (1 - v) * 4);
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
    // the trade's own air: the heat of a foundry, the cool light of a cleanroom
    if (this.look.haze) {
      ctx.fillStyle = this.look.haze;
      ctx.fillRect(0, 0, W, H);
    }
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
    // the windows show the time of day (in eighths), and the season decorates the walls
    const sky = Math.round(this.skyDark * 8);
    const key = `${this.layoutKey}|${s.accent}|${s.title}|${s.icon}|${fonts}|${sky}|${this.season}|${scale}|${detail}`;
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
    const look = this.look;
    const { w, d } = L;
    p.box(-0.4, -0.4, w + 0.8, d + 0.8, -16, 16, "#2a3240", "#353e4c", false);
    this.drawFloor(L);
    // hall floors: each line's bay (resin, or worn boards in the old workshop),
    // with a painted walkway in front
    for (const line of L.lines) {
      if (look.planks) {
        p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, "#8f6a45");
        p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, planks(c) ?? "#8f6a45");
      } else {
        const g = c.createLinearGradient(sx(w / 2, line.y0 + 0.2), sy(w / 2, line.y0 + 0.2), sx(w / 2, line.y0 + 4.8), sy(w / 2, line.y0 + 4.8));
        g.addColorStop(0, look.bay[0]);
        g.addColorStop(1, look.bay[1]);
        p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, g);
        p.quad(0.3, line.y0 + 0.2, w - 0.6, 4.6, look.era === "hightech" ? (tiles(c) ?? "rgba(0,0,0,0)") : floorGrain(c));
      }
      p.quadStroke(0.3, line.y0 + 0.2, w - 0.6, 4.6, "rgba(15,23,42,0.18)", 1);
      p.quad(0.3, line.belt + 1.55, w - 0.6, 0.55, look.walkway);
      p.line(0.3, line.belt + 1.55, w - 0.3, line.belt + 1.55, look.lines, 1.4);
      p.line(0.3, line.belt + 2.1, w - 0.3, line.belt + 2.1, look.lines, 1.4);
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
    p.line(0.2, ay - 0.6, w - 0.2, ay - 0.6, look.lines, 2);
    p.line(0.2, ay + 0.6, w - 0.2, ay + 0.6, look.lines, 2);
    for (let x = 2; x < w - 2; x += 2.5) p.line(x, ay, x + 1.2, ay, "rgba(255,255,255,0.75)", 2, 0, [6, 6]);
    this.drawWalls(s, L);
    this.drawSunlight(L);
    if (look.glossy) this.reflections(L);
  }

  /** The floor between the bays: concrete (or rubber, resin…), its joints and the marks of the trade. */
  private drawFloor(L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const look = this.look;
    const { w, d } = L;
    p.quad(0, 0, w, d, look.floor);
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
    // the marks of the trade: oil, rubber, paint, dust (the same ones every visit)
    if (look.stains.length)
      for (let i = 0; i < look.stainCount; i++) {
        const x = 0.8 + hash(i * 3 + 1) * (w - 1.6);
        const y = 0.8 + hash(i * 3 + 2) * (d - 1.6);
        p.ellipse(x, y, 0, 6 + hash(i * 3 + 3) * 18, look.stains[i % look.stains.length], 0.5);
      }
  }

  /** The back walls: brick or cladding or white panels, windows, pipes, panels, the gate and the season's decorations. */
  private drawWalls(s: InteriorScene, L: Interior) {
    const p = this.p;
    const c = this.ctx;
    const look = this.look;
    const { w, d } = L;
    const ay = L.aisle.y;
    const WH = 92;
    p.box(-0.35, -0.35, w + 0.35, 0.35, 0, WH, look.wall[0], "#9aa4b0");
    p.box(-0.35, 0, 0.35, d, 0, WH, look.wall[1], "#9aa4b0");
    if (look.brick) {
      // old brick, darker and sootier toward the floor
      p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, WH, brick(c, "left") ?? look.wall[0]);
      p.onRight(0, 0, 0, 0, d, 0, WH, brick(c, "right") ?? look.wall[1]);
      p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, 18, "rgba(40,22,14,0.28)");
      p.onRight(0, 0, 0, 0, d, 0, 18, "rgba(40,22,14,0.28)");
      // a wooden skirting board
      p.onLeft(-0.35, 0, 0, 0.35, w + 0.35, 0, 3, "#5b3a24");
      p.onRight(0, 0, 0, 0, d, 0, 3, "#5b3a24");
    } else {
      // sandwich-panel ribs (fine seams on the high-tech panels)
      c.strokeStyle = look.era === "hightech" ? "rgba(15,23,42,0.05)" : "rgba(15,23,42,0.07)";
      c.lineWidth = 1;
      c.beginPath();
      const rib = look.era === "hightech" ? 1.5 : 0.5;
      for (let x = rib; x < w; x += rib) {
        c.moveTo(sx(x, 0), sy(x, 0, 24));
        c.lineTo(sx(x, 0), sy(x, 0, WH));
      }
      for (let y = rib; y < d; y += rib) {
        c.moveTo(sx(0, y), sy(0, y, 24));
        c.lineTo(sx(0, y), sy(0, y, WH));
      }
      c.stroke();
      // the lower wall, its cap, and a yellow-black kick band (a lit LED strip in the high-tech plant)
      p.onLeft(-0.35, 0, 0, 0.35, w, 0, 24, look.dado[0]);
      p.onRight(0, 0, 0, 0, d, 0, 24, look.dado[1]);
      p.onLeft(-0.35, 0, 0, 0.35, w, 23, 24.5, shade(look.dado[0], -0.18));
      p.onRight(0, 0, 0, 0, d, 23, 24.5, shade(look.dado[1], -0.18));
      if (look.era === "hightech") {
        p.onLeft(-0.35, 0, 0, 0.35, w, 24.5, 25.5, look.lines);
        p.onRight(0, 0, 0, 0, d, 24.5, 25.5, look.lines);
      } else this.kickBand(L);
    }
    // the accent band under the roof
    p.onLeft(-0.35, 0, 0, 0.35, w, WH - 12, WH - 6, p.col(s.accent));
    p.onRight(0, 0, 0, 0, d, WH - 12, WH - 6, p.col(s.accent));
    // windows: small panes in the workshop, a band of windows, or a glass curtain wall
    for (const [x0, x1] of this.windowSpans(w)) this.windowLeft(x0, x1 - x0);
    if (look.windows === "curtain") this.windowRight(0.8, d - 5.6);
    else for (let y = 1; y < d - 4; y += 3) this.windowRight(y, 2.2);
    // pipes along the walls: an old rusty main, the air lines and the red sprinkler main, or cable trays
    const pipes: [number, string][] =
      look.era === "workshop" ? [[36, "#7c4a2a"]] : look.era === "hightech" ? [[38, "#cbd5e1"], [WH - 16, "#e2e8f0"]] : [[34, "#6b7684"], [38, "#7c8795"], [WH - 16, "#dc2626"]];
    for (const [z, col] of pipes) {
      p.onLeft(-0.35, 0, 0, 0.35, w, z, z + 2.2, col);
      p.onRight(0, 0, 0, 0, d, z, z + 2.2, col);
    }
    for (let x = 1.5; x < w; x += 2) p.onLeft(-0.35, 0, 0, x, x + 0.06, 32, 41, "#475569");
    for (let y = 1.5; y < d; y += 2) p.onRight(0, 0, 0, y, y + 0.06, 32, 41, "#475569");
    // electrical panels and fire points along the back wall, clear of the columns
    for (const x of [2.2, 8.4, 14.6, 21.4]) {
      if (x > w - 1.5) continue;
      p.box(x, 0, 0.8, 0.22, 0, 30, look.era === "workshop" ? "#6b705c" : "#c7ced6", look.era === "workshop" ? "#7d8270" : "#dfe4ea");
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
    // the season, on the walls: cobwebs in the corners, or a garland
    if (this.season === "halloween") {
      cobweb(c, 0, 0, WH - 1, 34);
      cobweb(c, w, 0, WH - 1, 30, true);
      for (const [x0] of this.windowSpans(w).filter((_, i) => i % 3 === 1)) cobweb(c, x0, 0, 78, 14);
    } else if (this.season === "winter") garland(p, w, WH - 18);
    else if (this.season === "spring") bunting(p, w, WH - 16, ["#f9a8d4", "#fde68a", "#86efac", "#c4b5fd", "#f8fafc"]);
    else if (this.season === "summer") bunting(p, w, WH - 16, ["#ef4444", "#facc15", "#3b82f6", "#22c55e", "#fb923c"]);
  }

  /** Where the windows of the back wall are (x from, x to). */
  private windowSpans(w: number): [number, number][] {
    if (this.look.windows === "curtain") return [[0.8, w - 0.8]];
    const out: [number, number][] = [];
    for (let x = 1; x < w - 1; x += 3) out.push([x, x + 2.2]);
    return out;
  }

  /** The heights of the windows' glass (from, to). */
  private windowZ(): [number, number] {
    return this.look.windows === "small" ? [46, 72] : this.look.windows === "curtain" ? [30, 84] : [52, 76];
  }

  /** The sky through the glass: blue by day, gold in the evening, dark with stars at night. */
  private skyGradient(y0: number, y1: number): CanvasGradient {
    const dark = this.skyDark;
    const keys: [string, string, string][] = [
      ["#b9dcfb", "#e3f1fd", "#cfe5f8"],
      ["#7fa6d6", "#ffcf9e", "#ffad75"],
      ["#0b1430", "#16234a", "#22325c"],
    ];
    const a = dark <= 0.5 ? keys[0] : keys[1];
    const b = dark <= 0.5 ? keys[1] : keys[2];
    const k = dark <= 0.5 ? dark / 0.5 : (dark - 0.5) / 0.5;
    const g = this.ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, mix(a[0], b[0], k));
    g.addColorStop(0.6, mix(a[1], b[1], k));
    g.addColorStop(1, mix(a[2], b[2], k));
    return g;
  }

  /** A window (or the glass curtain) on the back wall (plane y = 0): frame, sky, mullions, transom. */
  private windowLeft(x: number, w: number) {
    const p = this.p;
    const look = this.look;
    const [z0, z1] = this.windowZ();
    const frame = look.windows === "small" ? "#2f3d36" : look.windows === "curtain" ? "#94a3b8" : "#475569";
    const bar = look.windows === "small" ? "#2f3d36" : "#64748b";
    p.onLeft(-0.35, 0, 0, x - 0.08 + 0.35, x + w + 0.08 + 0.35, z0 - 2, z1 + 2, frame);
    p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, z0, z1, this.skyGradient(sy(x, 0, z1), sy(x, 0, z0)));
    if (this.skyDark > 0.6) this.stars(x, w, z0, z1, true);
    // the glass catches the hall's light: a few diagonal glints on the curtain wall
    if (look.windows === "curtain") for (let u = 1; u < w; u += 3.1) p.onLeft(-0.35, 0, 0, x + u + 0.35, x + u + 0.65, z0 + 4, z1 - 4, "rgba(255,255,255,0.12)");
    const step = look.windows === "small" ? 0.37 : look.windows === "curtain" ? 1.3 : 0.55;
    for (let u = step; u < w; u += step) p.onLeft(-0.35, 0, 0, x + u + 0.33, x + u + 0.37, z0, z1, bar);
    const rows = look.windows === "small" ? [z0 + 6.5, z0 + 13, z0 + 19.5] : [(z0 + z1) / 2];
    for (const z of rows) p.onLeft(-0.35, 0, 0, x + 0.35, x + w + 0.35, z - 0.5, z + 0.5, bar);
    // a stone sill (with snow on it in winter)
    p.onLeft(-0.35, 0, 0, x + 0.25, x + w + 0.45, z0 - 3, z0 - 1.5, look.era === "workshop" ? "#c8bfb0" : "#94a3b8");
    if (this.season === "winter") p.onLeft(-0.35, 0, 0, x + 0.3, x + w + 0.4, z0 - 1.5, z0 + 1.2, "#f8fafc");
  }

  /** A window (or the glass curtain) on the side wall (plane x = 0). */
  private windowRight(y: number, w: number) {
    const p = this.p;
    const look = this.look;
    const [z0, z1] = this.windowZ();
    const frame = look.windows === "small" ? "#2f3d36" : look.windows === "curtain" ? "#94a3b8" : "#475569";
    const bar = look.windows === "small" ? "#2f3d36" : "#64748b";
    p.onRight(0, 0, 0, y - 0.08, y + w + 0.08, z0 - 2, z1 + 2, frame);
    p.onRight(0, 0, 0, y, y + w, z0, z1, this.skyGradient(sy(0, y, z1), sy(0, y, z0)));
    if (this.skyDark > 0.6) this.stars(y, w, z0, z1, false);
    const step = look.windows === "small" ? 0.37 : look.windows === "curtain" ? 1.3 : 0.55;
    for (let u = step; u < w; u += step) p.onRight(0, 0, 0, y + u - 0.02, y + u + 0.02, z0, z1, bar);
    const rows = look.windows === "small" ? [z0 + 6.5, z0 + 13, z0 + 19.5] : [(z0 + z1) / 2];
    for (const z of rows) p.onRight(0, 0, 0, y, y + w, z - 0.5, z + 0.5, bar);
    if (this.season === "winter") p.onRight(0, 0, 0, y, y + w, z0 - 1.5, z0 + 1.2, "#f8fafc");
  }

  /** Stars in a window at night (always the same ones). */
  private stars(u0: number, w: number, z0: number, z1: number, left: boolean) {
    const c = this.ctx;
    const a = Math.min(1, (this.skyDark - 0.6) / 0.3);
    c.fillStyle = `rgba(255,255,255,${(0.85 * a).toFixed(2)})`;
    for (let i = 0; i < w * 3; i++) {
      const u = u0 + hash(i * 2 + u0 * 13) * w;
      const z = z0 + 2 + hash(i * 2 + 1 + u0 * 7) * (z1 - z0 - 4);
      const [px, py] = left ? [sx(u, 0), sy(u, 0, z)] : [sx(0, u), sy(0, u, z)];
      c.fillRect(px, py, 0.9, 0.9);
    }
  }

  /** The plant's sign, hung in front of the back wall: a painted board, an enamel sign, or a backlit glass panel. */
  private sign(s: InteriorScene, w: number) {
    const p = this.p;
    const c = this.ctx;
    const era = this.look.era;
    const text = `${s.icon ?? ""} ${(s.title ?? "").toUpperCase()}`.trim();
    // as wide as the name needs (within reason), centred over the halls
    c.font = raceFont(900, 14 * 1.1, false);
    const size = Math.min(14, (14 * 250) / Math.max(1, c.measureText(text).width));
    c.font = raceFont(900, size * 1.1, false);
    const half = Math.min(4.6, (c.measureText(text).width + 36) / 64);
    const [x0, x1, y] = [w / 2 - half, w / 2 + half, 0.45];
    // the cables (or chains) to the roof
    c.strokeStyle = era === "workshop" ? "#5b3a24" : "#334155";
    c.lineWidth = 1;
    c.beginPath();
    for (const x of [x0 + 0.4, x1 - 0.4]) {
      c.moveTo(sx(x, y), sy(x, y, 80));
      c.lineTo(sx(x, y), sy(x, y, 92));
    }
    c.stroke();
    if (era === "workshop") {
      p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#5b3520");
      p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 59.5, 78.5, "#7c4a2a");
      for (const z of [64, 70, 76]) p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, z, z + 0.4, "rgba(40,20,10,0.35)");
      p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#f5e6c8", 900);
    } else if (era === "hightech") {
      p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#0f172a");
      p.onLeft(x0, y, 0, 0, x1 - x0, 78.6, 80, p.col(s.accent));
      p.onLeft(x0, y, 0, 0, x1 - x0, 58, 59.4, p.col(s.accent));
      p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#f8fafc", 900);
    } else {
      p.onLeft(x0, y, 0, 0, x1 - x0, 58, 80, "#f8fafc");
      p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 59.5, 78.5, p.col(s.accent));
      p.onLeft(x0, y, 0, 0.1, x1 - x0 - 0.1, 76.5, 78.5, "rgba(255,255,255,0.25)");
      p.textLeft(text, (x0 + x1) / 2, y, 68.5, size, "#ffffff", 900);
    }
  }

  /** A yellow-black safety band along the foot of both walls. */
  private kickBand(L: Interior) {
    const p = this.p;
    p.onLeft(-0.35, 0, 0, 0.35, L.w, 0, 4, "#facc15");
    p.onRight(0, 0, 0, 0, L.d, 0, 4, "#facc15");
    for (let u = 0.35; u < L.w; u += 0.5) p.onLeft(-0.35, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
    for (let u = 0; u < L.d; u += 0.5) p.onRight(0, 0, 0, u, u + 0.22, 0, 4, "#1f2937");
  }

  /** Daylight from the back windows, falling across the floor in soft shafts (fading in the evening, gone at night). */
  private drawSunlight(L: Interior) {
    const day = this.daylight();
    if (day <= 0.02) return;
    const c = this.ctx;
    const [z0, z1] = this.windowZ();
    // where light through a point of the back wall (height z) meets the floor
    const fx = (x: number, z: number) => x + z * 0.012;
    const fy = (z: number) => z * 0.05;
    // the evening sun is golden
    const warm = mix("#fff4d6", "#ffc98f", Math.min(1, this.skyDark * 2));
    const [r, g, b] = [parseInt(warm.slice(1, 3), 16), parseInt(warm.slice(3, 5), 16), parseInt(warm.slice(5, 7), 16)];
    c.save();
    c.globalCompositeOperation = "lighter";
    const spans: [number, number][] = this.look.windows === "curtain" ? Array.from({ length: Math.floor((L.w - 2) / 2.6) }, (_, i) => [1.2 + i * 2.6, 2.5 + i * 2.6]) : this.windowSpans(L.w);
    for (const [x0, x1] of spans) {
      // the patch of light on the floor
      c.beginPath();
      c.moveTo(sx(fx(x0, z1), fy(z1)), sy(fx(x0, z1), fy(z1)));
      c.lineTo(sx(fx(x1, z1), fy(z1)), sy(fx(x1, z1), fy(z1)));
      c.lineTo(sx(fx(x1, z0), fy(z0)), sy(fx(x1, z0), fy(z0)));
      c.lineTo(sx(fx(x0, z0), fy(z0)), sy(fx(x0, z0), fy(z0)));
      c.closePath();
      c.fillStyle = `rgba(${r},${g},${b},${(0.1 * day).toFixed(3)})`;
      c.fill();
      // the shaft itself, fading toward the floor
      const top = [sx(x0, 0), sy(x0, 0, z1)];
      const bot = [sx(fx(x0, z1), fy(z1)), sy(fx(x0, z1), fy(z1))];
      const gr = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
      gr.addColorStop(0, `rgba(${r},${g},${b},${(0.1 * day).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},${(0.01 * day).toFixed(3)})`);
      c.beginPath();
      c.moveTo(sx(x0, 0), sy(x0, 0, z1));
      c.lineTo(sx(x1, 0), sy(x1, 0, z1));
      c.lineTo(sx(fx(x1, z1), fy(z1)), sy(fx(x1, z1), fy(z1)));
      c.lineTo(sx(fx(x1, z0), fy(z0)), sy(fx(x1, z0), fy(z0)));
      c.lineTo(sx(fx(x0, z0), fy(z0)), sy(fx(x0, z0), fy(z0)));
      c.lineTo(sx(x0, 0), sy(x0, 0, z0));
      c.closePath();
      c.fillStyle = gr;
      c.fill();
    }
    c.restore();
  }

  /** A polished floor mirrors the lamps: soft bright streaks under each one. */
  private reflections(L: Interior) {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const line of L.lines)
      for (let x = 2.5; x < L.w - 1; x += 4) {
        const [fx, fy] = [sx(x, line.belt - 0.4), sy(x, line.belt - 0.4)];
        const g = c.createLinearGradient(fx, fy - 6, fx, fy + 34);
        g.addColorStop(0, "rgba(255,255,255,0.1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(fx - 14, fy - 6, 28, 40);
      }
    c.restore();
  }

  /** How much daylight comes in: full by day, a little in the evening, none at night. */
  private daylight() {
    return Math.max(0, 1 - this.skyDark * 1.6);
  }

  /** The lamps over the lines: bare bulbs, high-bay domes or LED panels, each with its cone and pool of light. */
  private drawLamps(L: Interior) {
    const c = this.ctx;
    const look = this.look;
    const kind = look.lamps;
    const Z = kind === "bulb" ? 66 : kind === "led" ? 84 : 86;
    // stronger at night, when they light the hall alone
    const strength = look.lampStrength * (1 + this.skyDark * 0.6);
    const [half, spread] = kind === "bulb" ? [3, 28] : kind === "led" ? [26, 56] : [5, 40];
    let cone = this.cones.get(kind);
    if (!cone) {
      const col = kind === "bulb" ? "255,214,150" : kind === "led" ? "226,240,255" : "255,248,226";
      cone = c.createLinearGradient(0, 0, 0, Z);
      cone.addColorStop(0, `rgba(${col},${kind === "led" ? 0.06 : 0.08})`);
      cone.addColorStop(0.7, `rgba(${col},0.03)`);
      cone.addColorStop(1, `rgba(${col},0)`);
      this.cones.set(kind, cone);
    }
    c.save();
    for (const line of L.lines)
      for (let x = 2.5; x < L.w - 1; x += 4) {
        const y = line.belt - 0.4;
        const [lx, ly] = [sx(x, y), sy(x, y, Z)];
        const [fx, fy] = [sx(x, y), sy(x, y, 0)];
        // the cone is the same for every lamp: one gradient, moved to each
        c.globalCompositeOperation = "lighter";
        c.translate(lx, ly);
        c.fillStyle = cone;
        c.beginPath();
        c.moveTo(-half, 0);
        c.lineTo(half, 0);
        c.lineTo(spread, Z);
        c.lineTo(-spread, Z);
        c.closePath();
        c.fill();
        c.translate(-lx, -ly);
        c.globalCompositeOperation = "source-over";
        c.strokeStyle = "rgba(43,48,56,0.6)";
        c.lineWidth = 0.8;
        c.beginPath();
        if (kind === "bulb") {
          // a cable from the roof, an enamel shade and the hot bulb
          c.moveTo(lx, ly - 4);
          c.lineTo(lx, sy(x, y, 92));
          c.stroke();
          c.fillStyle = "#2f4f3f";
          c.beginPath();
          c.moveTo(lx - 5, ly + 1);
          c.lineTo(lx - 2, ly - 4);
          c.lineTo(lx + 2, ly - 4);
          c.lineTo(lx + 5, ly + 1);
          c.closePath();
          c.fill();
          c.fillStyle = "#fff1c7";
          c.beginPath();
          c.arc(lx, ly + 1.5, 2, 0, Math.PI * 2);
          c.fill();
          this.p.light(fx, fy, 64, look.lampColor, strength);
          this.p.light(lx, ly + 1.5, 10, "#ffd9a0", 0.6);
        } else if (kind === "led") {
          // a long slim panel along the line, two hangers
          for (const dx of [-18, 18]) {
            c.moveTo(lx + dx, ly - 2);
            c.lineTo(lx + dx, sy(x, y, 92) + dx * 0.5);
          }
          c.stroke();
          c.fillStyle = "#cbd5e1";
          c.beginPath();
          c.moveTo(lx - 26, ly - 13);
          c.lineTo(lx + 26, ly + 13);
          c.lineTo(lx + 26, ly + 15);
          c.lineTo(lx - 26, ly - 11);
          c.closePath();
          c.fill();
          c.strokeStyle = "#f8fbff";
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(lx - 25, ly - 11);
          c.lineTo(lx + 25, ly + 14);
          c.stroke();
          this.p.light(sx(x - 0.6, y), sy(x - 0.6, y), 56, look.lampColor, strength);
          this.p.light(sx(x + 0.6, y), sy(x + 0.6, y), 56, look.lampColor, strength);
        } else {
          // the high-bay dome and its hot lens
          c.moveTo(lx, ly - 5);
          c.lineTo(lx, ly - 22);
          c.stroke();
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
          this.p.light(fx, fy, 78, look.lampColor, strength);
        }
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
      const [col, top] = this.look.column;
      p.box(cx - 0.12, line.y0 + 0.05, 0.24, 0.24, 0, 88, col, top);
      if (this.look.era === "hightech") p.box(cx - 0.15, line.y0 + 0.02, 0.3, 0.3, 4, 1.5, this.look.lines);
      else if (this.look.era === "factory") p.box(cx - 0.17, line.y0, 0.34, 0.34, 0, 6, "#facc15", "#fde047");
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
    const down = line.index === 0 ? this.brokenStation() : undefined;
    for (const st of stops) {
      if (st.def.staff === 0) continue;
      if (st === down) {
        const lit = Math.sin(this.t * 8) > 0;
        p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
        p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? "#ef4444" : "#7f1d1d");
        if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), 26, "#ef4444", 0.7);
        continue;
      }
      const [on, off] = !s.running ? ["#f59e0b", "#b45309"] : st.staffed ? ["#22c55e", "#22c55e"] : ["#f59e0b", "#78350f"];
      const lit = s.running ? st.staffed || Math.sin(this.t * 2.5) > 0 : Math.sin(this.t * 1.2 + st.x * 0.3) > -0.3;
      p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
      p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? on : off);
      if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), 18, on, s.running ? 0.45 : 0.3);
    }

    // the broken machine: dark smoke, a red glow, and the call to fix it
    if (down) {
      this.smoke(down.stop.x, down.stop.y - 0.5);
      p.light(sx(down.stop.x, down.stop.y), sy(down.stop.x, down.stop.y, 14), 46 + Math.sin(this.t * 6) * 6, "#ef4444", 0.35);
      if (s.words?.tapRepair) p.tag(`🔧 ${s.words.tapRepair}`, down.stop.x, line.belt - 0.4, 48 + Math.sin(this.t * 4) * 3, { size: 10, bg: "rgba(220,38,38,0.95)" });
    }
    // a boost: the belt hums with light
    if ((s.boost ?? 0) > 0 && line.conveyor && stops.length) {
      const x0b = stops[0].stop.x - 0.5;
      const x1b = stops[stops.length - 1].stop.x + 0.5;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = "rgba(34,211,238,0.85)";
      c.lineWidth = 1.6;
      c.setLineDash([10, 14]);
      c.lineDashOffset = -this.t * 120;
      for (const dy of [-0.34, 0.34]) {
        c.beginPath();
        c.moveTo(sx(x0b, line.belt + dy), sy(x0b, line.belt + dy, 4.5));
        c.lineTo(sx(x1b, line.belt + dy), sy(x1b, line.belt + dy, 4.5));
        c.stroke();
      }
      c.restore();
      for (const st of stops) if (st.def.staff > 0) p.light(sx(st.stop.x, st.stop.y), sy(st.stop.x, st.stop.y, 6), 30, "#22d3ee", 0.3);
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
    const lift = this.cheer(line.index);
    for (const [i, h] of L.people.entries()) {
      if (h.line !== line.index) continue;
      if (h.role === "supervisor" && !this.low) {
        // supervisors walk up and down their cells with the clipboard
        const ph = this.t * 0.45 + i * 1.7;
        const v = Math.cos(ph);
        const walking = Math.abs(v) > 0.25;
        this.person(h.x + Math.sin(ph) * 0.9, h.y, "supervisor", walking ? Math.floor(this.t * 6 + i) % 4 : 0, i % 2, k, v > 0 ? 0 : 2, lift);
        continue;
      }
      const busy = working && h.station !== undefined;
      // waiting people still shift from foot to foot
      const pose = busy ? Math.floor(this.t * 4 + i) % 4 : Math.floor(this.t * (s.running ? 1.5 : 0.7) + i) % 2;
      this.person(h.x, h.y, h.role, pose, i, k, 0, lift);
      // now and then someone shows how they feel
      if (near && s.morale !== undefined) {
        const ph = (this.t / 9 + i * 0.37) % 1;
        if (ph < 0.22) this.mood(h.x, h.y, s.morale, ph / 0.22);
      }
      if (h.role === "welder" && working && near) this.sparks(h.x + 0.1, h.y - 0.6);
    }
    // people walking along the walkway, between the stations
    if (!this.low && near) {
      const walkers = L.lines.length >= 3 ? 2 : 1;
      for (let j = 0; j < walkers; j++) {
        const span = L.w - 3;
        const u = (this.t * (0.32 + j * 0.07)) / span + j * 0.5 + line.index * 0.31;
        const tri = Math.abs(((u % 2) + 2) % 2 - 1);
        const forward = ((u % 2) + 2) % 2 < 1;
        // (a few looks only: every pose and heading is a sprite to make)
        this.person(1.5 + (1 - tri) * span, line.belt + 1.82 + (j ? 0.12 : -0.08), j % 2 ? "inspector" : "worker", Math.floor(this.t * 6 + j) % 4, j, k, forward ? 0 : 2, lift);
      }
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
      this.person(h.x + walk, h.y, "manager", Math.floor(this.t * 3) % 4, i, k, Math.cos(this.t * 0.4) > 0 ? 0 : 2);
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
    this.drawFront(L, k);
  }

  /** The front of the hall: a break corner with coffee, pallets of stock, and the season (a tree, pumpkins). */
  private drawFront(L: Interior, k: number) {
    const p = this.p;
    const fy = L.aisle.y + 1.35;
    if (!this.seen(sx(0, fy + 0.7), sy(0, fy - 0.7, 70), sx(L.w, fy - 0.7), sy(L.w, fy + 0.7, 0))) return;
    // behind the table: one of the crew, facing us
    this.person(2.8, fy - 0.45, "worker", Math.floor(this.t * 0.8) % 2, 41, k, 1);
    // the coffee machine (its light on), the vending machine (lit), a table with cups, and a plant
    p.box(1.0, fy - 0.2, 0.3, 0.26, 0, 14, "#1f2937", "#374151");
    p.onLeft(1.0, fy + 0.06, 0, 0.07, 0.23, 5, 10, "#0f172a");
    p.box(1.08, fy + 0.04, 0.05, 0.04, 11.5, 0.8, "#ef4444");
    p.light(sx(1.1, fy + 0.06), sy(1.1, fy + 0.06, 12), 7, "#ef4444", 0.7);
    p.box(4.5, fy - 0.25, 0.42, 0.34, 0, 20, "#1e3a8a", "#1d4ed8");
    p.onLeft(4.5, fy + 0.09, 0, 0.05, 0.37, 4, 18, "rgba(191,219,254,0.9)");
    for (let z = 7; z < 18; z += 3.5) p.onLeft(4.5, fy + 0.09, 0, 0.08, 0.34, z, z + 0.5, "rgba(30,64,175,0.6)");
    p.light(sx(4.7, fy + 0.09), sy(4.7, fy + 0.09, 11), 16, "#93c5fd", 0.35);
    p.box(2.75, fy - 0.03, 0.06, 0.06, 0, 5, "#78350f");
    p.box(2.4, fy - 0.2, 0.8, 0.42, 5, 1, "#b45309", "#d97706");
    p.box(2.55, fy - 0.08, 0.05, 0.05, 6, 1.3, "#f8fafc");
    p.box(3.0, fy - 0.02, 0.05, 0.05, 6, 1.3, "#f8fafc");
    p.box(5.3, fy - 0.05, 0.18, 0.18, 0, 4, "#9a3412", "#c2410c");
    p.circle(5.39, fy + 0.04, 8.5, 4.5, "#15803d");
    p.circle(5.33, fy, 11, 3.2, "#22c55e");
    // the crew on their break, chatting
    this.person(3.0, fy + 0.4, "worker", Math.floor(this.t * 0.8 + 1.3) % 2, 42, k, 3);
    if (L.lines.length >= 3) this.person(2.15, fy + 0.22, "inspector", Math.floor(this.t * 0.7 + 2.1) % 2, 43, k, 0);
    // pallets of the plant's stock
    const kinds = this.look.decor;
    [8.6, 10.7, 15.2].forEach((x, i) => this.stack(kinds[(i + 1) % kinds.length], x, fy, k));
    // the season
    if (this.season === "winter") christmasTree(p, 18.3, fy + 0.1, this.t);
    else if (this.season === "halloween") for (const [x, dy] of [[7.3, 0.3], [12.9, 0.35], [17.4, 0.2], [18.1, 0.45]]) pumpkin(p, x, fy + dy, 1, this.t);
    else if (this.season === "spring") for (const [x, dy] of [[7.3, 0.3], [12.9, 0.35], [17.6, 0.25]]) flowerPot(p, x, fy + dy, 1, this.t, "spring");
    else if (this.season === "summer") {
      parasol(p, 17.9, fy + 0.2, this.t);
      flowerPot(p, 7.3, fy + 0.3, 1, this.t, "summer");
    }
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
      // one pre-drawn glow per colour, scaled and faded to each light's size and strength
      ctx.globalAlpha = Math.max(0, Math.min(1, l.a)) * (0xaa / 0xff);
      ctx.drawImage(glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalAlpha = 1;
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
    // the stores show the plant's real stock: raw material in, finished goods out
    const fill = (v: number, places: number) => Math.max(0, Math.min(places, Math.ceil(v * places - 0.001)));
    const variant =
      model === "rawRack" ? `${st.def.variant ?? ""}|${fill(s.raw, 9)}` : model === "goodsRack" ? `|${fill(s.out, 6)}` : (st.def.variant ?? "");
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

  /** A person, facing along +x (yaw 0) or turned in quarter turns, lifted off the floor when they jump for joy. */
  private person(x: number, y: number, role: WorkerRole, pose: number, i: number, k: number, yaw = 0, lift = 0) {
    if (this.cam.zoom < 0.45) {
      this.p.person(x, y, role === "worker" ? "#f97316" : "#2563eb", this.t * 3 + i);
      return;
    }
    const tone = i % 4;
    const spr = sprites3d.get(
      `iman|${role}|${pose}|${tone}${yaw ? `|y${yaw}` : ""}`,
      PERSON_SIZE,
      Math.min(4, k + 1),
      (T, { interior }) => {
        const w = interior.buildWorker(T, role, pose, tone);
        w.rotation.y = (-yaw * Math.PI) / 2;
        return w;
      },
      true,
      "indoor",
    );
    if (!spr) {
      this.p.person(x, y, "#f97316", this.t * 3 + i);
      return;
    }
    this.ctx.drawImage(spr.img, sx(x, y) - PERSON_SIZE.ax, sy(x, y, lift) - PERSON_SIZE.ay, PERSON_SIZE.w, PERSON_SIZE.h);
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

  /** Dark smoke rising off a broken machine. */
  private smoke(x: number, y: number) {
    const c = this.ctx;
    const [bx, by] = [sx(x, y), sy(x, y, 26)];
    for (let i = 0; i < 4; i++) {
      const u = (this.t * 0.45 + i / 4) % 1;
      c.fillStyle = `rgba(55,60,68,${(0.5 * (1 - u) * Math.min(1, u * 6)).toFixed(3)})`;
      c.beginPath();
      c.arc(bx + Math.sin(u * 5 + i) * 5 + u * 8, by - u * 52, 5 + u * 15, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** A little bubble over a worker's head with how they feel (the crew's morale). */
  private mood(x: number, y: number, morale: number, u: number) {
    const c = this.ctx;
    const face = morale >= 85 ? "😄" : morale >= 70 ? "🙂" : morale >= 50 ? "😐" : morale >= 30 ? "😟" : "😫";
    const a = Math.min(1, u * 5, (1 - u) * 5);
    const [px, py] = [sx(x, y), sy(x, y, 30 + u * 4)];
    c.save();
    c.globalAlpha = a;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    c.arc(px, py, 6.5, 0, Math.PI * 2);
    c.fill();
    c.font = "8px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(face, px, py + 0.5);
    c.restore();
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
/** A soft round glow in one colour (drawn once, then scaled for every light of that colour). */
const glows = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string): HTMLCanvasElement {
  let cv = glows.get(color);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glows.set(color, cv);
  }
  return cv;
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
