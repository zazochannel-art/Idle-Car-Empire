// Race cars on the Racing District's circuit. A live race is replayed from
// its record (the same replay as the race viewer, mapped onto the island's
// circuit); after a race the top three park in front of the paddock for a
// while; between races the team's cars do practice laps.
import * as THREE from "three";
import { CAR_BY_ID } from "@/game/config/cars";
import { RACING_AREA, WORLD_MAP } from "@/game/city/layout";
import { atTrack, liveryOf, raceDuration } from "@/game/engine/racing";
import { distanceAt } from "@/game/racing/tracks";
import type { GameState } from "@/game/types";
import { HOME, RaceReplay } from "../../racing/race-replay";
import { carGeometry } from "./scenery";
import type { Ground } from "./terrain";

/** How long the top three stay in front of the paddock (real seconds). */
const PODIUM_TIME = 30;
const MAX = 16;
const SCALE = 1.25;

export class RaceCars {
  readonly mesh: THREE.InstancedMesh;
  private replay: RaceReplay | null = null;
  private stamp = { clock: 0, at: 0 };
  private pts = WORLD_MAP.circuit;
  private acc: number[] = [0];
  private len = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3(SCALE, SCALE, SCALE);
  private col = new THREE.Color();
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    private ground: Ground,
    material: THREE.Material,
  ) {
    for (let i = 1; i < this.pts.length; i++) this.acc.push(this.acc[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    this.len = this.acc[this.acc.length - 1];
    this.mesh = new THREE.InstancedMesh(carGeometry(), material, MAX);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** A point on the circuit at a share of the lap, `lat` across the track. */
  private on(frac: number, lat: number) {
    const s = (((frac % 1) + 1) % 1) * this.len;
    let i = 1;
    while (i < this.acc.length - 1 && this.acc[i] < s) i++;
    const a = this.pts[i - 1];
    const b = this.pts[i];
    const seg = this.acc[i] - this.acc[i - 1] || 1;
    const f = (s - this.acc[i - 1]) / seg;
    const tx = (b[0] - a[0]) / seg;
    const tz = (b[1] - a[1]) / seg;
    const x = a[0] + (b[0] - a[0]) * f - tz * lat;
    const z = a[1] + (b[1] - a[1]) * f + tx * lat;
    return { x, z, yaw: Math.atan2(-tz, tx) };
  }

  private put(i: number, x: number, z: number, yaw: number, color: string) {
    this.q.setFromAxisAngle(this.yAxis, yaw);
    this.m4.compose(this.v.set(x, this.ground.at(x, z) + 0.02, z), this.q, this.sc);
    this.mesh.setMatrixAt(i, this.m4);
    this.mesh.setColorAt(i, this.col.set(color));
  }

  update(s: GameState, t: number) {
    const R = s.racing;
    let n = 0;
    if (R.unlocked) {
      // the racing clock ticks 10× a second: smooth it with the frame clock
      const now = performance.now();
      if (R.clock !== this.stamp.clock) this.stamp = { clock: R.clock, at: now };
      const clock = R.clock + Math.min(0.15, (now - this.stamp.at) / 1000);
      const last = R.last;
      if (R.live) {
        if (this.replay?.rec.id !== R.live.id) this.replay = new RaceReplay(R.live);
        const { cars, views } = this.replay.frame(clock - R.live.startT);
        cars.forEach((c, i) => {
          if (n >= MAX) return;
          const v = views[i];
          const q = this.on((c.s - HOME.startS) / HOME.length, ((c.grid % 3) - 1) * 0.18);
          this.put(n++, q.x, q.z, q.yaw, v?.color ?? "#ef4444");
        });
      } else if (last && clock >= last.startT && clock - (last.startT + raceDuration(last)) < PODIUM_TIME) {
        // the top three in front of the paddock
        const pd = RACING_AREA.paddock;
        const fx = Math.sin(pd.rot);
        const fz = Math.cos(pd.rot);
        last.order.slice(0, 3).forEach((id, i) => {
          const e = last.entrants.find((x) => x.id === id);
          if (!e) return;
          const side = [0, -0.9, 0.9][i];
          const x = pd.x + fx * (pd.d / 2 - 0.9) + fz * side;
          const z = pd.y + fz * (pd.d / 2 - 0.9) - fx * side;
          this.put(n++, x, z, pd.rot + Math.PI / 2 + (t * 0.4 + i) * (i === 0 ? 1 : 0), e.color);
        });
      } else {
        // practice: the team's cars at the paddock lap on their own
        R.cars.filter(atTrack).slice(0, 3).forEach((rc, i) => {
          const sp = distanceAt(HOME, ((t * 0.55 + i * 23) % HOME.lapT) + HOME.lapT * 3) - HOME.length * 3;
          const q = this.on((sp - HOME.startS) / HOME.length, i * 0.15 - 0.15);
          this.put(n++, q.x, q.z, q.yaw, liveryOf(s, rc).color || CAR_BY_ID[rc.car].color);
        });
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
