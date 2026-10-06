// Race replays: a race record turned into car positions on a circuit,
// frame after frame (the engine already decided the race from its lap
// times): cars brake into the corners, pull out to overtake, take the flag,
// then roll into their pit boxes. Shared by the race viewer and the map.
import { RACE_COUNTDOWN } from "@/game/config/racing";
import { pointAt, raceState, trackOf, type CarOnTrack } from "@/game/racing/tracks";
import type { RaceRecord } from "@/game/types";
import type { Painter } from "../map/iso";
import { CAR_MODEL_FOR, drawModel, type CarModel } from "../map/vehicles";
import { pitBox } from "./track-paint";

/** The home circuit (the Racing District's track). */
export const HOME = trackOf("small");
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
