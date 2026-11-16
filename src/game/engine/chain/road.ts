// My Cars on the road between the factory lot and the paddock.
import { CAR_BY_ID } from "../../config/cars";
import { DEALERS } from "../../config/dealerships";
import type { DealerId, GameState, RaceCarState } from "../../types";
import { RACING, plotOf } from "../../city/layout";
import { TRIP_FEE } from "../../config/economy";
import { book } from "../ledger";
import { legTime, ship } from "./travel";
import { plantsOf } from "../plants";

// ───────────────────────────── My Cars on the road ─────────────────────────────

/** The factory lot of a car in the collection: its own assembly plant, or any other one. */
export function lotOf(s: GameState, rc: RaceCarState): string | null {
  if (rc.home && s.city.buildings[rc.home]?.type === "assemblyPlant") return rc.home;
  return plantsOf(s).find(([, b]) => b.type === "assemblyPlant")?.[0] ?? null;
}

export type CarDestination = "factory" | "racing" | "showroom";

/** The company showroom for a car: the dealer of its class it owns, else any it owns. */
export function showroomFor(s: GameState, rc: RaceCarState): DealerId | null {
  const cls = CAR_BY_ID[rc.car].class;
  const owned = DEALERS.filter((d) => s.dealers[d.id]?.owned && plotOf(`d:${d.id}`));
  return (owned.find((d) => d.classes.includes(cls)) ?? owned[0])?.id ?? null;
}

/** Where a car of the collection is parked now (plot id), or null on the road. */
function parkedAt(s: GameState, rc: RaceCarState): string | null {
  const at = rc.location ?? "racing";
  if (at === "transit") return null;
  if (at === "racing") return RACING;
  if (at === "showroom") return rc.listing ? `d:${rc.listing.dealer}` : null;
  return lotOf(s, rc);
}

/** Driving time and fee of moving a car of the collection; null if it can't go there now. */
export function carTrip(s: GameState, rc: RaceCarState, to: CarDestination): { from: string; to: string; dur: number; fee: number } | null {
  const at = rc.location ?? "racing";
  if (at === "transit" || at === to || s.racing.live?.car === rc.id || rc.install) return null;
  if (to === "racing" && !s.racing.unlocked) return null;
  const from = parkedAt(s, rc);
  const dealer = to === "showroom" ? showroomFor(s, rc) : null;
  const dest = to === "racing" ? RACING : to === "showroom" ? (dealer ? `d:${dealer}` : null) : lotOf(s, rc);
  if (!from || !dest || from === dest) return null;
  return { from, to: dest, dur: legTime(from, dest, 1), fee: TRIP_FEE.carrier };
}

/** Loads a car of the collection onto its own transporter: to the paddock, a showroom or back to the factory lot. */
export function sendCar(s: GameState, id: number, to: CarDestination, price?: number): boolean {
  const rc = s.racing.cars.find((c) => c.id === id);
  const trip = rc && carTrip(s, rc, to);
  if (!rc || !trip || s.cash < trip.fee) return false;
  if (to === "showroom" && !(price && price > 0)) return false;
  s.cash -= trip.fee;
  book(s, "logistics", trip.fee);
  ship(s, { from: trip.from, to: trip.to, item: "car", qty: 1, value: 0, dur: trip.dur, vehicle: "carrier", models: [rc.car], fleet: [rc.id] });
  if (to === "factory" && !rc.home) rc.home = trip.to;
  if (to === "showroom") rc.listing = { price: price!, dealer: trip.to.slice(2) as DealerId, since: 0 };
  else delete rc.listing;
  rc.location = "transit";
  return true;
}

export const destOf = (to: string): CarDestination => (to === RACING ? "racing" : to.startsWith("d:") ? "showroom" : "factory");

/** Where a car on the road is going (null: not on the road). */
export function carEta(s: GameState, id: number): { to: CarDestination; left: number } | null {
  const sh = s.chain.shipments.find((x) => !x.back && x.fleet?.includes(id));
  return sh ? { to: destOf(sh.to), left: Math.max(0, sh.dur - sh.t) } : null;
}
