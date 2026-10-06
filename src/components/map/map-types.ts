// Types shared by the Empire Map's React side and its 3D engine (which is
// loaded on demand, so nothing here may pull in three.js).
import type { Entry } from "@/game/city/layout";
import type { TerritoryId } from "@/game/config/city";
import type { DealerId, StructureType, ZoneId } from "@/game/types";
import type { CarModel } from "./vehicles";

export type ZoomTier = "region" | "districts" | "buildings" | "detail";
export const ZOOM_TIERS: ZoomTier[] = ["region", "districts", "buildings", "detail"];

/** A district, a territory ("t:port") or the Racing District. */
export type MapArea = ZoneId | "racing" | `t:${TerritoryId}`;

/** A vehicle the player tapped on the map, for the showcase. */
export interface VehiclePick {
  /** The live vehicle, to follow it with the camera. */
  ref: object;
  kind: "car" | "van" | "truck" | "semi" | "trailer" | "carrier";
  model: CarModel;
  color: string;
  models?: CarModel[];
  item?: string;
  empty?: boolean;
}

export type MapTarget = { kind: "plot"; id: string } | { kind: "zone"; id: ZoneId } | { kind: "vehicle"; v: VehiclePick } | null;

/** A lot vehicles drive to or from. */
export interface Site {
  id: string;
  entry: Entry;
  /** Relative attractiveness (garage income, factory output…). */
  weight: number;
}

/** A real shipment of the supply chain, as the map draws it. */
export interface ShipView {
  id: number;
  from: Site;
  to: Site;
  /** Seconds travelled on the current leg, and the leg's length. */
  t: number;
  dur: number;
  back: boolean;
  vehicle: "van" | "truck" | "semi" | "trailer" | "carrier";
  /** Cargo colour (component). */
  color: string;
  /** What it carries: a component id, "raw" or "car". */
  item?: string;
  /** Car models on a transporter. */
  models?: CarModel[];
}

/** Names the map writes on its labels (in the player's language). */
export interface MapNames {
  garage: (no: number) => string;
  plant: (plotId: string) => string;
  market: string;
  depot: string;
  dealer: (id: DealerId) => string;
  structure: (type: StructureType) => string;
  level: (lv: number) => string;
  money: (v: number) => string;
  racing: string;
}
