// The town takes notice of the company: the more cars it sells, the more of
// them drive the streets, and the billboards advertise its brand and its
// latest model.
import { CAR_BY_ID } from "@/game/config/cars";
import { plantsOf } from "@/game/engine/chain";
import type { EconomySnapshot } from "@/game/engine/economy";
import type { CarId, GameState } from "@/game/types";
import { CAR_MODEL_FOR, type CarModel } from "../vehicles";

export interface CityLife {
  /** The company's models on the lines, in their paint. */
  own: { model: CarModel; color: string; paint: boolean }[];
  /** Share of the town's traffic that drives the company's cars (0..0.6). */
  share: number;
  /** The billboard: brand, logo, colours and the model it shows (null: nothing to advertise yet). */
  ad: { name: string; logo: string; color: string; accent: string; car: CarId } | null;
}

/** Cars sold → how many of the town's cars are the company's: 10 sold ≈ 13%, 1,000 ≈ 38%, 100,000 and up 60%. */
export const ownShare = (sold: number) => Math.min(0.6, Math.log10(1 + Math.max(0, sold)) / 8);

/** The models on the assembly lines (newest plant last): the one set, or the one the line picked itself. */
function onLines(s: GameState, snap?: EconomySnapshot): CarId[] {
  const ids: CarId[] = [];
  for (const [id, b] of plantsOf(s)) {
    const car = snap?.chain.plants[id]?.car?.id ?? b.plant?.car;
    if (car && CAR_BY_ID[car] && !ids.includes(car)) ids.push(car);
  }
  return ids;
}

export function cityLife(s: GameState, snap?: EconomySnapshot): CityLife {
  const cars = onLines(s, snap);
  const brand = s.brand;
  const own = cars.map((id) => {
    const custom = s.designs[id]?.color || (brand?.name ? brand.color : "");
    return { model: CAR_MODEL_FOR[id] ?? "sedan", color: custom || CAR_BY_ID[id].color, paint: !!custom };
  });
  // the billboard shows the company's top model (the last one on the lines)
  const car = cars[cars.length - 1];
  return {
    own,
    share: own.length ? ownShare(s.lifetime.carsSold ?? 0) : 0,
    ad: car ? { name: brand?.name ?? "", logo: brand?.logo ?? "🚗", color: brand?.color ?? "#2563eb", accent: brand?.accent ?? "#0f172a", car } : null,
  };
}

/** What the map needs to redo when it changes (the share in steps of 5%). */
export function cityLifeKey(s: GameState, snap?: EconomySnapshot): string {
  const l = cityLife(s, snap);
  return `${l.own.map((o) => `${o.model}:${o.color}`).join(",")}|${Math.round(l.share * 20)}|${l.ad ? `${l.ad.name}|${l.ad.logo}|${l.ad.color}|${l.ad.accent}|${l.ad.car}` : ""}`;
}
