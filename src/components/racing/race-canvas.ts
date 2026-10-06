// The race viewer's renderer: a circuit in the map's isometric style with
// scenery for its theme (pine forests and rocks in the mountains, sand and
// cacti in the desert, the sea on the coast, lit towers in the night city),
// the race replayed car by car, tyre smoke and dust, three camera modes and
// a podium for the top three. Driven by requestAnimationFrame; the React
// overlay reads positions back for the timing tower.
import { TRACK_BY_ID, type TrackId, type TrackTheme } from "@/game/config/racing";
import { pointAt, trackOf, type CarOnTrack, type Track } from "@/game/racing/tracks";
import type { RaceRecord } from "@/game/types";
import { applyLighting } from "../map/lighting";
import { Painter, rand, sx, sy } from "../map/iso";
import { billboard, lightPole, tireStack } from "../map/props";
import { RaceReplay, drawRaceCar, type RaceCarView } from "./race-replay";
import { podium } from "./podium";
import { CAR_MODEL_FOR, drawModel } from "../map/vehicles";
import { DEFAULT_LOOK, paintTrack, type TrackLook } from "./track-paint";

export type CameraMode = "iso" | "follow" | "overhead";

interface Theme {
  ground: string;
  stripe?: string;
  look: TrackLook;
  night: number;
  dust?: string;
}

const THEMES: Record<TrackTheme, Theme> = {
  home: { ground: "#5fae52", stripe: "#67b85a", look: DEFAULT_LOOK, night: 0 },
  industrial: { ground: "#8b8f87", stripe: "#868a82", look: { ...DEFAULT_LOOK, verge: "#6b7280", runoff: "#a8a29e" }, night: 0.15 },
  mountain: { ground: "#4d7c43", stripe: "#538849", look: { ...DEFAULT_LOOK, runoff: "#9ca3af" }, night: 0.1 },
  coastal: { ground: "#6cb35a", stripe: "#72bb60", look: { ...DEFAULT_LOOK, runoff: "#f1dfa6" }, night: 0 },
  desert: { ground: "#d9b778", stripe: "#d3b072", look: { ...DEFAULT_LOOK, asphalt: "#4b4f57", runoff: "#c2a165", verge: "#e5cf9b", kerbB: "#fde68a" }, night: 0.05, dust: "rgba(214,180,120," },
  night: { ground: "#2c3340", stripe: "#303846", look: { ...DEFAULT_LOOK, asphalt: "#2b3038", verge: "#475569", runoff: "#3f4652" }, night: 0.85 },
  gp: { ground: "#4fa14a", stripe: "#58aa52", look: { ...DEFAULT_LOOK, kerbA: "#16a34a" }, night: 0 },
  international: { ground: "#57a64f", stripe: "#5fae57", look: { ...DEFAULT_LOOK, kerbA: "#2563eb" }, night: 0.45 },
};

interface Prop {
  x: number;
  y: number;
  depth: number;
  draw: (p: Painter, t: number) => void;
}

/** Distance from a point to the nearest point of the track's centre line. */
function distToTrack(tr: Track, x: number, y: number) {
  let best = Infinity;
  for (let i = 0; i < tr.samples.length; i += 3) {
    const s = tr.samples[i];
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < best) best = d;
  }
  return best;
}

/** Scenery around a circuit, placed by a seeded scatter (never on the track). */
function sceneryFor(tr: Track, theme: TrackTheme): Prop[] {
  const out: Prop[] = [];
  const L = tr.layout;
  const W = L.w + 4;
  const D = L.d + 4;
  const clear = L.width / 2 + 1.2;
  const add = (x: number, y: number, draw: Prop["draw"]) => out.push({ x, y, depth: x + y, draw });
  const n = Math.round(W * D * 0.09);
  for (let i = 0; i < n; i++) {
    const x = rand(i, 11) * W - 2;
    const y = rand(i, 29) * D - 2;
    const dist = distToTrack(tr, x, y);
    if (dist < clear) continue;
    const r = rand(i, 3);
    switch (theme) {
      case "mountain":
        if (r < 0.25) add(x, y, (p) => rock(p, x, y, 0.5 + rand(i, 5)));
        else add(x, y, (p) => p.pine(x, y, 0.9 + rand(i, 7) * 0.5));
        break;
      case "desert":
        if (r < 0.3) add(x, y, (p) => cactus(p, x, y));
        else if (r < 0.45) add(x, y, (p) => rock(p, x, y, 0.4 + rand(i, 5) * 0.6, "#b8875a"));
        break;
      case "industrial":
        if (r < 0.12 && dist > clear + 1.5) add(x, y, (p) => warehouse(p, x, y, i));
        else if (r < 0.3) add(x, y, (p) => p.box(x, y, 0.9, 0.35, 0, 9, ["#dc2626", "#2563eb", "#16a34a", "#f59e0b"][i % 4]));
        break;
      case "night":
        if (r < 0.2 && dist > clear + 1.5) add(x, y, (p) => tower(p, x, y, i));
        else if (r < 0.32) add(x, y, (p) => lightPole(p, x, y));
        break;
      case "coastal":
        if (y > L.d * 0.72) continue; // the sea
        add(x, y, (p) => (r < 0.5 ? palm(p, x, y) : p.tree(x, y, 0.8, rand(i, 2))));
        break;
      default:
        if (r < 0.7) add(x, y, (p) => p.tree(x, y, 0.85 + rand(i, 8) * 0.4, rand(i, 2)));
    }
  }
  // the main straight: grandstands outside, a big screen and tyre walls
  const st = tr.startS;
  for (let k = -2; k <= 2; k++) {
    const q = pointAt(tr, st + k * 1.3, L.width / 2 + 0.9);
    const qx = q.x;
    const qy = q.y;
    add(qx, qy, (p, t) => stand(p, qx - 0.6, qy - 0.25, t, k));
  }
  const bq = pointAt(tr, st - 4, -(L.width / 2 + 1.1));
  add(bq.x, bq.y, (p) => billboard(p, bq.x, bq.y, "#b91c1c", `${TRACK_BY_ID[tr.id].emoji} RACE`));
  for (const f of [0.25, 0.5, 0.75]) {
    const q = pointAt(tr, st + tr.length * f, L.width / 2 + 0.9);
    add(q.x, q.y, (p) => {
      for (let j = 0; j < 3; j++) tireStack(p, q.x + j * 0.2, q.y, 2);
    });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

function rock(p: Painter, x: number, y: number, s: number, color = "#8b8f97") {
  const c = p.ctx;
  const X = sx(x, y);
  const Y = sy(x, y);
  c.fillStyle = p.col(color, -0.15);
  c.beginPath();
  c.moveTo(X - 14 * s, Y);
  c.lineTo(X - 4 * s, Y - 16 * s);
  c.lineTo(X + 6 * s, Y - 12 * s);
  c.lineTo(X + 14 * s, Y);
  c.closePath();
  c.fill();
  c.fillStyle = p.col(color, 0.08);
  c.beginPath();
  c.moveTo(X - 14 * s, Y);
  c.lineTo(X - 4 * s, Y - 16 * s);
  c.lineTo(X, Y);
  c.closePath();
  c.fill();
}

function cactus(p: Painter, x: number, y: number) {
  p.box(x, y, 0.12, 0.12, 0, 16, "#3f7d3a");
  p.box(x - 0.18, y, 0.08, 0.08, 6, 6, "#3f7d3a");
  p.box(x + 0.16, y, 0.08, 0.08, 8, 5, "#3f7d3a");
}

function palm(p: Painter, x: number, y: number) {
  const c = p.ctx;
  const X = sx(x, y);
  const Y = sy(x, y);
  c.strokeStyle = p.col("#8b5a2b");
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(X, Y);
  c.quadraticCurveTo(X + 3, Y - 12, X + 2, Y - 24);
  c.stroke();
  c.fillStyle = p.col("#2f9e44");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.beginPath();
    c.ellipse(X + 2 + Math.cos(a) * 6, Y - 24 + Math.sin(a) * 3, 7, 2.2, a, 0, Math.PI * 2);
    c.fill();
  }
}

function warehouse(p: Painter, x: number, y: number, i: number) {
  p.shadow(x, y, 2, 1.4, 18);
  p.box(x, y, 2, 1.4, 0, 18, i % 2 ? "#9ca3af" : "#a8a29e", "#6b7280");
  p.onLeft(x + 0.3, y + 1.4, 0, 0.05, 0.6, 0, 10, p.col("#475569"));
}

function tower(p: Painter, x: number, y: number, i: number) {
  const h = 40 + rand(i, 4) * 70;
  p.shadow(x, y, 1, 1, h);
  p.box(x, y, 1, 1, 0, h, "#1f2937", "#374151");
  p.windows(x, y, 1, 1, 0, h, Math.floor(h / 10), "#1f2937", 0.85);
  p.light(sx(x + 0.5, y + 0.5), sy(x + 0.5, y + 0.5, h), 24, ["#22d3ee", "#e879f9", "#facc15"][i % 3], 0.6);
}

/** A small grandstand facing the track, its crowd jumping. */
function stand(p: Painter, x: number, y: number, t: number, k: number) {
  p.box(x, y, 1.2, 0.5, 0, 6, "#94a3b8");
  p.box(x, y + 0.2, 1.2, 0.3, 6, 5, "#cbd5e1");
  if (p.zoom < 0.4) return;
  const c = p.ctx;
  for (let i = 0; i < 9; i++) {
    const px = x + 0.08 + i * 0.12;
    const jump = Math.max(0, Math.sin(t * 6 + i + k)) * 1.5;
    c.fillStyle = ["#ef4444", "#facc15", "#3b82f6", "#f8fafc", "#22c55e"][(i + k + 5) % 5];
    c.fillRect(sx(px, y + 0.3) - 1, sy(px, y + 0.3, 10) - 3 - jump, 2, 3);
  }
}

interface Puff {
  x: number;
  y: number;
  age: number;
  color: string;
  size: number;
}

/** Renders one race into a canvas. */
export class RaceCanvas {
  private ctx: CanvasRenderingContext2D;
  private painter: Painter;
  private track: Track;
  private theme: Theme;
  private props: Prop[];
  private replay: RaceReplay | null = null;
  private puffs: Puff[] = [];
  private raf = 0;
  private t = 0;
  private last = 0;
  private cam = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  mode: CameraMode = "iso";
  /** Called every frame with where the cars are (the HUD reads it). */
  onFrame: ((cars: CarOnTrack[], views: RaceCarView[]) => void) | null = null;
  /** Real seconds since the countdown began (from the game state). */
  elapsed: () => number = () => 0;
  /** Show the podium instead of the track. */
  podium: RaceRecord | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    trackId: TrackId,
    private rec: RaceRecord | null,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.painter = new Painter(this.ctx);
    this.track = trackOf(trackId);
    const th = TRACK_BY_ID[trackId].theme;
    this.theme = THEMES[th];
    this.props = sceneryFor(this.track, th);
    if (rec) this.replay = new RaceReplay(rec, this.track);
    const c = this.centre();
    this.cam = { x: c.x, y: c.y, zoom: this.fitZoom() };
  }

  start() {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.t += dt;
      this.draw(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** Camera mode, and the race whose podium to show (null: the race itself). */
  configure(mode: CameraMode, podium: RaceRecord | null) {
    this.mode = mode;
    this.podium = podium;
  }

  setRace(rec: RaceRecord) {
    if (this.rec?.id === rec.id) return;
    this.rec = rec;
    this.replay = new RaceReplay(rec, this.track);
  }

  private centre() {
    const L = this.track.layout;
    return { x: sx(L.w / 2, L.d / 2), y: sy(L.w / 2, L.d / 2) };
  }

  private size() {
    const r = this.canvas.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  /** Zoom that shows the whole circuit. */
  private fitZoom() {
    const L = this.track.layout;
    const { w, h } = this.size();
    const pw = sx(L.w, 0) - sx(0, L.d) + 80;
    const ph = sy(L.w, L.d) - sy(0, 0) + 140;
    return Math.min(w / pw, h / ph);
  }

  private draw(dt: number) {
    const { w, h } = this.size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    const c = this.ctx;
    const p = this.painter;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.podium) {
      this.drawPodium(w, h);
      return;
    }
    // where the race is
    const elapsed = this.elapsed();
    const frame = this.replay ? this.replay.frame(elapsed) : null;
    const views = frame?.views ?? [];
    this.onFrame?.(frame?.cars ?? [], views);
    this.aim(views, frame?.cars ?? [], dt, w, h);

    const bg = c.createLinearGradient(0, 0, 0, h * dpr);
    bg.addColorStop(0, this.theme.night > 0.5 ? "#0b1020" : "#7cc3e8");
    bg.addColorStop(1, this.theme.night > 0.5 ? "#151b2b" : "#bfe3f2");
    c.fillStyle = bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.cam.zoom * dpr;
    c.setTransform(z, 0, 0, z, dpr * (w / 2) - this.cam.x * z, dpr * (h / 2) - this.cam.y * z);
    p.t = this.t;
    p.zoom = this.cam.zoom;
    p.dpr = dpr;
    p.night = this.theme.night;
    p.lights.length = 0;
    p.dim = false;

    // ground
    const L = this.track.layout;
    const pad = 8;
    p.quad(-pad, -pad, L.w + pad * 2, L.d + pad * 2, this.theme.ground);
    if (this.theme.stripe) for (let i = -pad; i < L.d + pad; i += 2) p.quad(-pad, i, L.w + pad * 2, 1, this.theme.stripe);
    if (TRACK_BY_ID[this.track.id].theme === "coastal") {
      p.quad(-pad, L.d * 0.78, L.w + pad * 2, 0.8, "#f1dfa6");
      const sea = c.createLinearGradient(0, sy(0, L.d * 0.8), 0, sy(0, L.d + pad));
      sea.addColorStop(0, "#38bdf8");
      sea.addColorStop(1, "#0369a1");
      p.quad(-pad, L.d * 0.8 + 0.6, L.w + pad * 2, pad + 2, sea);
    }
    paintTrack(p, this.track, 0, 0, this.theme.look, false);

    // tyre smoke and dust
    for (const v of views) {
      const smoky = v.braking && Math.abs(v.steer) > 0;
      if ((smoky && rand(this.t * 60, v.x) < 0.5) || (this.theme.dust && rand(this.t * 30, v.y) < 0.35)) {
        const back = { x: v.x - Math.cos(v.yaw) * 0.3, y: v.y - Math.sin(v.yaw) * 0.3 };
        this.puffs.push({ ...back, age: 0, color: smoky && !this.theme.dust ? "rgba(226,232,240," : (this.theme.dust ?? "rgba(226,232,240,"), size: 3 });
      }
    }
    this.puffs = this.puffs.filter((f) => (f.age += dt) < 1.2).slice(-160);
    for (const f of this.puffs) {
      c.fillStyle = `${f.color}${(0.45 * (1 - f.age / 1.2)).toFixed(3)})`;
      c.beginPath();
      c.arc(sx(f.x, f.y), sy(f.x, f.y, 2 + f.age * 6), f.size + f.age * 10, 0, Math.PI * 2);
      c.fill();
    }

    // scenery and cars, back to front
    const cars = [...views].sort((a, b) => a.x + a.y - (b.x + b.y));
    let ci = 0;
    for (const pr of this.props) {
      while (ci < cars.length && cars[ci].x + cars[ci].y <= pr.depth) drawRaceCar(p, cars[ci++], 0, 0);
      pr.draw(p, this.t);
    }
    while (ci < cars.length) drawRaceCar(p, cars[ci++], 0, 0);
    // the player's marker
    const me = views.find((v) => v.id === "player");
    if (me) {
      const X = sx(me.x, me.y);
      const Y = sy(me.x, me.y, 26);
      c.fillStyle = "#f5c451";
      c.beginPath();
      c.moveTo(X, Y + 6);
      c.lineTo(X - 5, Y - 2);
      c.lineTo(X + 5, Y - 2);
      c.closePath();
      c.fill();
    }
    if (this.theme.night > 0) {
      const view: [number, number, number, number] = [this.cam.x - w / this.cam.zoom, this.cam.y - h / this.cam.zoom, this.cam.x + w / this.cam.zoom, this.cam.y + h / this.cam.zoom];
      applyLighting(c, { dark: this.theme.night, tint: this.theme.night > 0.5 ? "#4f5f9e" : "#ffc48f" }, p.lights, view);
    }
  }

  /** Points the camera: the whole track, the pack, or the player's car — with a short zoom at the finish. */
  private aim(views: RaceCarView[], cars: CarOnTrack[], dt: number, w: number, h: number) {
    const fit = this.fitZoom();
    let tx: number;
    let ty: number;
    let tz: number;
    const me = views.find((v) => v.id === "player");
    if (this.mode === "overhead" || !me) {
      const c = this.centre();
      [tx, ty, tz] = [c.x, c.y, fit];
    } else if (this.mode === "follow") {
      [tx, ty, tz] = [sx(me.x, me.y), sy(me.x, me.y), Math.max(fit * 2.4, 1.6)];
    } else {
      // the pack: between the player and the leader
      const lead = [...cars].sort((a, b) => b.s - a.s)[0];
      const lv = views.find((v) => v.id === lead?.id) ?? me;
      [tx, ty, tz] = [(sx(me.x, me.y) * 2 + sx(lv.x, lv.y)) / 3, (sy(me.x, me.y) * 2 + sy(lv.x, lv.y)) / 3, Math.max(fit * 1.5, 0.9)];
    }
    // cinematic: the leader is about to take the flag
    const rec = this.rec;
    if (rec && this.mode !== "overhead") {
      const end = this.track.startS + rec.laps * this.track.length;
      const near = cars.find((c) => !c.finished && end - c.s < 3 && end - c.s > 0);
      if (near) {
        const q = pointAt(this.track, this.track.startS);
        [tx, ty, tz] = [sx(q.x, q.y), sy(q.x, q.y), tz * 1.25];
      }
    }
    const k = Math.min(1, dt * 3);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, dt * 2);
    void w;
    void h;
  }

  /** The podium: the top three on their steps, confetti, spotlights. */
  private drawPodium(w: number, h: number) {
    const c = this.ctx;
    const p = this.painter;
    const dpr = this.dpr;
    const rec = this.podium!;
    const bg = c.createRadialGradient((w * dpr) / 2, (h * dpr) * 0.45, 10, (w * dpr) / 2, (h * dpr) * 0.45, Math.max(w, h) * dpr);
    bg.addColorStop(0, "#1e293b");
    bg.addColorStop(1, "#020617");
    c.fillStyle = bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = Math.min(w / 260, h / 260) * 2.2 * dpr;
    const cx = sx(0.8, 0.35);
    const cy = sy(0.8, 0.35, 10);
    c.setTransform(z, 0, 0, z, (dpr * w) / 2 - cx * z, dpr * h * 0.52 - cy * z);
    p.zoom = z / dpr;
    p.dpr = dpr;
    p.night = 0;
    p.dim = false;
    p.t = this.t;
    // spotlights
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const a = Math.sin(this.t * 0.8 + i * 2) * 30;
      const g = c.createLinearGradient(cx + a, cy - 160, cx, cy);
      g.addColorStop(0, "rgba(255,240,200,0)");
      g.addColorStop(1, "rgba(255,240,200,0.18)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(cx + a - 6, cy - 160);
      c.lineTo(cx + a + 6, cy - 160);
      c.lineTo(cx + 30, cy + 10);
      c.lineTo(cx - 30, cy + 10);
      c.closePath();
      c.fill();
    }
    c.restore();
    p.quad(-1.5, -1.5, 4.6, 3.6, "#0f172a");
    podium(p, 0, 0);
    const spots: [number, number, number][] = [
      [0.8, 0.35, 10],
      [0.3, 0.35, 7],
      [1.3, 0.35, 5],
    ];
    rec.order.slice(0, 3).forEach((id, i) => {
      const e = rec.entrants.find((x) => x.id === id);
      if (!e) return;
      const [x, y, lift] = spots[i];
      const pop = Math.min(1, Math.max(0, this.t * 1.5 - (2 - i) * 0.5));
      if (pop <= 0) return;
      drawModel(p, x, y, 0, CAR_MODEL_FOR[e.model], e.color, 0.5 * pop, { yaw: Math.PI * 0.75, lift, paint: true, noShadow: true });
    });
    // confetti
    const cols = ["#facc15", "#ef4444", "#22c55e", "#3b82f6", "#f8fafc", "#ec4899"];
    for (let i = 0; i < 60; i++) {
      const ph = (this.t * 0.35 + i * 0.0617) % 1;
      const X = cx + Math.sin(i * 7.7 + this.t) * 70 + ((i * 37) % 140) - 70;
      const Y = cy - 150 + ph * 190;
      c.fillStyle = cols[i % cols.length];
      c.globalAlpha = 1 - ph * 0.7;
      c.fillRect(X, Y, 2.2, 1.4);
    }
    c.globalAlpha = 1;
  }
}
