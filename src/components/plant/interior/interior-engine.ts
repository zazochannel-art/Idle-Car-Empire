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

import { diagFrame, registerDiagSource } from "@/lib/diagnostics";
import { isSaving, shouldDraw } from "@/lib/power";
import { ResolutionWatch } from "../../map/quality";
import { attachControls, Camera } from "../../map/camera";
import { mix, Painter, raceFont, sx, sy, toTile } from "../../map/iso";
import { skyAt, worldClock, type TimeMode } from "../../map/lighting";
import { type CarModel } from "../../map/vehicles";
import { sprites3d } from "../../three/sprites";
import { bat, flowerPot, pumpkin, stringLights } from "./hall-art";
import type { Season } from "@/game/engine/season";
import { hallLook, type HallLook } from "./theme";
import { interiorLayout, lineStops, recipeFor, type Interior, type InteriorSpec, type PartKind, type PlacedStation, type StationId, type StationUpgrade } from "./layout";
import { daylight, drawBuilding, drawLamps, windowZ } from "./interior-hall";
import { drawAisle, drawCrane, drawLights, drawLine, drawSelection } from "./interior-line";
import { CYCLE, MIN_TRANSFER, POP_EVERY, POP_LIFE, STACK_SIZE, backOut, hash, tierCap } from "./interior-shared";

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
export class InteriorEngine {
  readonly cam = new Camera({ minX: -2000, maxX: 2000, minY: -400, maxY: 1600 });
  ctx: CanvasRenderingContext2D;
  p: Painter;
  dpr = 1;
  /** The highest resolution now allowed: lowered while frames stay slow (map/quality.ts). */
  private maxDpr = 2;
  private watch = new ResolutionWatch(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 0);
  private raf = 0;
  private diagOff: (() => void) | null = null;
  private running = false;
  private last = 0;
  t = 0;
  /** Production clock: only advances while the line runs. */
  work = 0;
  /** Transfers done (fractional), locked to the plant's batch progress. */
  beat = 0;
  private sceneAt = 0;
  private scene: InteriorScene | null = null;
  private layout: Interior | null = null;
  layoutKey = "";
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
  hall: { canvas: HTMLCanvasElement; key: string; scale: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  private vig: { w: number; h: number; g: CanvasGradient } | null = null;
  /** The lamps' cones of light, one gradient per kind of lamp. */
  cones = new Map<string, CanvasGradient>();
  /** How this plant's hall looks (its era and trade). */
  look: HallLook = hallLook("bodyWorks", 5);
  /** 0 noon … 0.5 golden hour … 1 night (the map's own clock). */
  skyDark = 0;
  season: Season | null = null;
  /** Finished units rising over each line's store ("+5 ⚙️"), and when the last ones went up. */
  private pops: { line: number; n: number; t0: number; bump: number }[] = [];
  private popAt = -99;
  /** Units made on a fast line, not shown yet. */
  private made = 0;
  private lastProgress = -1;
  /** The ring that spreads from a machine you tap. */
  ripple: { pick: StationPick; t0: number } | null = null;
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
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
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
    this.diagOff ??= registerDiagSource("factory interior", { quality: () => ({ label: this.low ? "low graphics" : isSaving() ? "battery saver" : "adaptive resolution", dpr: this.dpr, notes: { "max dpr": this.maxDpr } }) });
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      // low graphics: ~30 FPS; battery saver: 30 FPS while playing, a few frames a second when idle
      if (document.hidden || !shouldDraw(now, this.lastDraw, this.low)) return;
      this.lastDraw = now;
      const gap = now - this.last;
      const saving = isSaving();
      const dt = Math.min(saving ? 0.25 : 0.1, gap / 1000);
      this.last = now;
      this.render(dt);
      diagFrame("factory interior");
      if (saving || this.low) return;
      const next = this.watch.frame(Math.min(1000, gap), performance.now());
      if (next !== null) {
        this.maxDpr = next;
        this.resize();
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    this.diagOff?.();
    this.diagOff = null;
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

  find(pick: StationPick): PlacedStation | undefined {
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
  brokenStation(): PlacedStation | undefined {
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

    drawBuilding(this, s, L);
    this.drawDust(L);
    this.drawBackDecor(L);
    // the line in the middle of the view gets the full station names, the others their icons
    const ty = toTile(cam.x, cam.y + 20).y;
    let focus = 0;
    for (const line of L.lines) if (Math.abs(line.belt - ty) < Math.abs(L.lines[focus].belt - ty)) focus = line.index;
    for (const line of L.lines) drawLine(this, s, L, line, line.index === focus);
    drawAisle(this, s, L);
    if (L.crane) drawCrane(this, L);
    drawLamps(this, L);
    this.drawSeasonHigh(L);
    drawSelection(this, L);
    this.nightfall();
    drawLights(this);
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
  cheer(line: number) {
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
  seen(x0: number, y0: number, x1: number, y1: number) {
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
  stack(kind: PartKind, x: number, y: number, k: number) {
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
    const day = daylight(this);
    if (this.low || this.cam.zoom < 0.6 || day < 0.05) return;
    const [wz0, wz1] = windowZ(this);
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

  // ───────────────────────── sprites ─────────────────────────

}
