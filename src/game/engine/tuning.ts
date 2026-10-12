// The tuning garage (config/tuning.ts): paint, rims and a spoiler for a race
// car. A part is paid for once per car; fitting it again later is free. A
// respray is paid every time (back to the livery is free).
import { PAINTS, PAINT_COST, RIMS, SPOILERS, type RimId, type SpoilerId } from "../config/tuning";
import type { GameState, RaceCarState } from "../types";
import { book } from "./materials";
import { carWorth, raceCar } from "./racing";

export type TuneChoice = { kind: "rims"; id: RimId } | { kind: "spoiler"; id: SpoilerId } | { kind: "paint"; id: string };

/** What a car wears now. */
export function tuningOf(rc: RaceCarState): { paint: string; rims: RimId; spoiler: SpoilerId } {
  return { paint: rc.tuning?.paint ?? "", rims: rc.tuning?.rims ?? "standard", spoiler: rc.tuning?.spoiler ?? "none" };
}

const ownedKey = (c: TuneChoice) => `${c.kind}:${c.id}`;

/** The price of a choice (0: free), or null when the car already wears it or it doesn't exist. */
export function tuneCost(rc: RaceCarState, c: TuneChoice): number | null {
  const now = tuningOf(rc);
  if (c.kind === "paint") {
    if (c.id === now.paint) return null;
    if (c.id === "") return 0;
    return PAINTS.includes(c.id) ? Math.round(carWorth(rc) * PAINT_COST) : null;
  }
  const part = c.kind === "rims" ? RIMS[c.id] : SPOILERS[c.id];
  if (!part || c.id === now[c.kind]) return null;
  if (!part.cost || rc.tuning?.owned?.includes(ownedKey(c))) return 0;
  return Math.round(carWorth(rc) * part.cost);
}

/** Fits a choice on a race car (not while it races); pays for it. */
export function tune(s: GameState, carId: number, c: TuneChoice): boolean {
  const rc = raceCar(s, carId);
  if (!rc || s.racing.live?.car === carId) return false;
  const cost = tuneCost(rc, c);
  if (cost === null || s.cash < cost) return false;
  s.cash -= cost;
  book(s, "repairs", cost);
  const owned = rc.tuning?.owned ?? [];
  rc.tuning = { ...rc.tuning, [c.kind]: c.id, owned: c.kind !== "paint" && cost > 0 ? [...owned, ownedKey(c)] : owned };
  if (c.kind === "paint" && !c.id) delete rc.tuning.paint;
  return true;
}
