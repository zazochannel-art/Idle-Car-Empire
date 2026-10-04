// Race cars on the Empire Map's circuit. A live race is replayed from its
// lap times (the engine already decided it): cars brake into the corners,
// pull out to overtake, take the flag, then roll into the pit lane. Between
// races the team's cars do practice laps; after a race the top three stand
// on the podium for a while.
import { CAR_BY_ID } from "@/game/config/cars";
import { RACE_COUNTDOWN } from "@/game/config/racing";
import { atTrack, liveryOf, raceCar, raceDuration } from "@/game/engine/racing";
import { carLook as lookOf } from "@/game/engine/car-dna";
import { distanceAt, pointAt, raceState, type CarOnTrack } from "@/game/racing/tracks";
import type { GameState, RaceRecord } from "@/game/types";
import { pitBox } from "../racing/track-paint";
import { sx, sy, type Painter } from "./iso";
import { HOME, OX, OY, PODIUM_SPOTS } from "./racing-district";
import { CAR_MODEL_FOR, drawModel, type CarModel } from "./vehicles";

export interface MovingDrawable {
  depth: number;
  x: number;
  y: number;
  draw: (p: Painter) => void;
}

/** How long the top three stay on the podium (real seconds). */
const PODIUM_TIME = 30;
/** Half the room a car has across the track. */
const MAX_LAT = 0.3;

export interface RaceCarView {
  id: string;
  x: number;
  y: number;
  yaw: number;
  model: CarModel;
  color: string;
  braking: boolean;
  steer: number;
  alpha: number;
  odo: number;
  /** The player's car as it was built (rims, brakes, wing, carbon...). */
  build?: import("../three/car-models").BuildLook;
}

/**
 * Turns a race record into car positions on a track, frame after frame,
 * with lateral moves for overtaking (shared by the map and the race viewer).
 */
export class RaceReplay {
  private lat = new Map<string, number>();
  private prevS = new Map<string, number>();
  private lastT = 0;

  constructor(
    readonly rec: RaceRecord,
    private track = HOME,
  ) {}

  frame(elapsed: number): { cars: CarOnTrack[]; views: RaceCarView[] } {
    const tr = this.track;
    const dt = Math.max(0, Math.min(0.2, elapsed - this.lastT));
    this.lastT = elapsed;
    const cars = raceState(this.rec, tr, elapsed);
    const bySpeed = new Map(cars.map((c) => [c.id, c.s - (this.prevS.get(c.id) ?? c.s)]));
    const sorted = [...cars].sort((a, b) => b.s - a.s);
    const views: RaceCarView[] = [];
    const finishedAt = elapsed - RACE_COUNTDOWN;
    for (const c of cars) {
      const e = this.rec.entrants.find((x) => x.id === c.id)!;
      // on the grid: staggered left/right; racing: the line, or around the car ahead
      let target = c.lap === 0 && c.v === 0 ? (c.grid % 2 ? -0.22 : 0.22) : (c.grid % 3) * 0.05 - 0.05;
      if (!c.finished) {
        const ahead = sorted.find((o) => o.id !== c.id && !o.finished && o.s > c.s && o.s - c.s < 1.1);
        const closing = (bySpeed.get(c.id) ?? 0) >= (bySpeed.get(ahead?.id ?? "") ?? 0) - 1e-4;
        if (ahead && closing) {
          const al = this.lat.get(ahead.id) ?? 0;
          target = al > 0 ? al - 0.36 : al + 0.36;
        }
      }
      const cur = this.lat.get(c.id) ?? target;
      const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, cur + (target - cur) * Math.min(1, dt * 2.5)));
      this.lat.set(c.id, lat);
      this.prevS.set(c.id, c.s);
      let x: number;
      let y: number;
      let yaw: number;
      let alpha = 1;
      let k = 0;
      if (c.finished && c.v === 0) {
        // parked in its pit box, nose out
        const box = pitBox(tr, this.rec.order.indexOf(c.id));
        [x, y, yaw] = [box.x, box.y, box.yaw];
        alpha = Math.min(1, Math.max(0, finishedAt - c.time / 3) * 0.5 + 0.4);
      } else {
        const q = pointAt(tr, c.s, lat);
        [x, y, yaw, k] = [q.x, q.y, q.yaw, q.k];
      }
      views.push({
        id: c.id,
        x,
        y,
        yaw,
        model: CAR_MODEL_FOR[e.model],
        color: e.color,
        braking: c.braking,
        steer: Math.abs(k) > 0.25 ? -Math.sign(k) : 0,
        alpha,
        odo: c.s,
      });
    }
    return { cars, views };
  }
}

/** Draws one race car (3D sprite in its own colours, vector car while loading). */
export function drawRaceCar(p: Painter, v: RaceCarView, ox: number, oy: number, scale = 1) {
  const c = p.ctx;
  if (v.alpha < 1) c.globalAlpha = Math.max(0, v.alpha);
  drawModel(p, v.x + ox, v.y + oy, 0, v.model, v.color, scale, { yaw: v.yaw, brake: v.braking, steer: v.steer, odo: v.odo, paint: true, lights: p.night > 0.35, build: v.build });
  c.globalAlpha = 1;
}

/** The map's race cars: live race, podium, or practice laps. */
export class RaceLayer {
  private replay: RaceReplay | null = null;
  private stamp = { clock: 0, at: 0 };

  constructor(private live: () => GameState) {}

  drawables(t: number): MovingDrawable[] {
    const s = this.live();
    const R = s.racing;
    if (!R.unlocked) return [];
    // the racing clock ticks 10× a second: smooth it with the frame clock
    const now = performance.now();
    if (R.clock !== this.stamp.clock) this.stamp = { clock: R.clock, at: now };
    const clock = R.clock + Math.min(0.15, (now - this.stamp.at) / 1000);
    const out: MovingDrawable[] = [];
    const push = (v: RaceCarView) =>
      out.push({ depth: v.x + OX + v.y + OY, x: v.x + OX, y: v.y + OY, draw: (p) => drawRaceCar(p, v, OX, OY) });

    if (R.live) {
      if (this.replay?.rec.id !== R.live.id) this.replay = new RaceReplay(R.live);
      const { views } = this.replay.frame(clock - R.live.startT);
      const mine = raceCar(s, R.live.car);
      const build = mine ? lookOf(s, mine) : undefined;
      views.forEach((v) => push(v.id === "player" ? { ...v, build } : v));
      return out;
    }
    // the podium after a race
    const last = R.last;
    if (last && clock - (last.startT + raceDuration(last)) < PODIUM_TIME && clock >= last.startT) {
      last.order.slice(0, 3).forEach((id, i) => {
        const e = last.entrants.find((x) => x.id === id);
        if (!e) return;
        const [x, y, z] = PODIUM_SPOTS[i];
        out.push({
          depth: x + y + 0.5,
          x,
          y,
          draw: (p) => {
            drawModel(p, x, y, 0, CAR_MODEL_FOR[e.model], e.color, 0.9, { yaw: Math.PI * 0.75, lift: z, paint: true, noShadow: true });
            if (i === 0) confetti(p, x, y, t);
          },
        });
      });
      return out;
    }
    // practice: the team's cars lapping on their own
    // (only the cars at the paddock: the others are at the factory, in a showroom or on a transporter)
    R.cars.filter(atTrack).slice(0, 3).forEach((rc, i) => {
      const look = liveryOf(s, rc);
      const sp = distanceAt(HOME, ((t * 0.55 + i * 23) % HOME.lapT) + HOME.lapT * 3) - HOME.length * 3;
      const q = pointAt(HOME, sp, i * 0.12 - 0.12);
      push({ id: `p${rc.id}`, x: q.x, y: q.y, yaw: q.yaw, model: CAR_MODEL_FOR[rc.car], color: look.color || CAR_BY_ID[rc.car].color, braking: false, steer: Math.abs(q.k) > 0.25 ? -Math.sign(q.k) : 0, alpha: 1, odo: sp, build: lookOf(s, rc) });
    });
    return out;
  }
}

/** Paper confetti raining over the winner. */
function confetti(p: Painter, x: number, y: number, t: number) {
  if (p.dim) return;
  const c = p.ctx;
  const cols = ["#facc15", "#ef4444", "#22c55e", "#3b82f6", "#f8fafc", "#ec4899"];
  for (let i = 0; i < 26; i++) {
    const ph = (t * 0.6 + i * 0.137) % 1;
    const px = sx(x, y) + Math.sin(i * 12.9 + t * 2) * 26;
    const py = sy(x, y, 70) + ph * 80;
    c.fillStyle = cols[i % cols.length];
    c.globalAlpha = 1 - ph;
    c.fillRect(px, py, 2.5, 1.6);
  }
  c.globalAlpha = 1;
}
