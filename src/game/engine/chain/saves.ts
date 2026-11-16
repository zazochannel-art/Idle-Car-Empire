// Old saves brought up to date.
import { AUTOMATION, COMPONENT_BY_ID, MAX_GRADE, MAX_TRUCKS, PLANT_BY_ID, SPEED } from "../../config/chain";
import { CAR_BY_ID } from "../../config/cars";
import type { CarId, CarRoute, ChainState, ComponentId, GameState, ItemId, MaterialStock, PlantData, PlantType, Shipment } from "../../types";
import { DEALERS, DEALER_BY_ID } from "../../config/dealerships";
import { EXPORT_BY_ID, type ExportMarketId } from "../../config/expansion";
import type { GlobalMods } from "../modifiers";
import { MORALE } from "../floor";
import { type MaterialId, POWER_SYSTEM, WAREHOUSE_CAP } from "../../config/economy";
import { type PlantStats, stockValue } from "./stats";
import { SKIN_BY_ID, type SkinId } from "../../config/collection";
import { levelCost, speedCost, workshopOf } from "./unlocks";
import { createChain, newPlant } from "./state";
import { isExportRoute } from "../expansion";
import { migrateCostBasis, migrateLedger, migrateStock, unitMaterials } from "../materials";
import { netOfSale } from "../costs";
import { plantsOf } from "../plants";
import { plotOf } from "../../city/layout";
import { upgradePlantLevel, upgradePlantSpeed } from "./actions";

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, dflt = 0) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : dflt;

export function migratePlant(type: PlantType, raw: unknown): PlantData {
  const p = newPlant();
  if (!isObj(raw)) return p;
  p.speed = int(raw.speed, 0, SPEED.max, 0);
  p.automation = int(raw.automation, 0, AUTOMATION.length - 1, 0);
  p.fleet = int(raw.fleet, 1, MAX_TRUCKS, 1);
  p.grade = int(raw.grade, 1, MAX_GRADE, 1);
  // routing is automatic now: parts go where they are needed
  p.route = "use";
  if (raw.combine === true) p.combine = true;
  if (raw.auto === true) p.auto = true;
  // the machines built and operators hired on the shop floor (bought, so never lost on load)
  if (isObj(raw.workshop)) p.workshop = workshopOf({ ...p, workshop: { machines: num(raw.workshop.machines) || 1, workers: num(raw.workshop.workers) || 1 } });
  p.progress = Math.min(0.999, num(raw.progress));
  p.stock = migrateStock(raw.stock);
  p.warehouse = int(raw.warehouse, 1, WAREHOUSE_CAP.length, 1);
  p.power = int(raw.power, 0, POWER_SYSTEM.max, 0);
  if (raw.autoBuy === true) p.autoBuy = true;
  if (raw.backup === true) p.backup = true;
  if (typeof raw.short === "string") p.short = raw.short as MaterialId;
  // saves from before the materials market: the old raw yard becomes a starter stock
  if (raw.stock === undefined && PLANT_BY_ID[type].item) p.stock = starterStock(type, p.grade, 6);
  // saves from before materials were costed on use: value the stock at list price
  p.stockCost = typeof raw.stockCost === "number" && Number.isFinite(raw.stockCost) && raw.stockCost >= 0 ? raw.stockCost : stockValue(p.stock);
  // each material's own cost; saves from before it split their total by list price
  p.stockCostBy = migrateCostBasis(raw.stockCostBy, p);
  p.out = num(raw.out);
  p.outValue = num(raw.outValue);
  p.made = num(raw.made);
  p.wait = num(raw.wait);
  if (raw.status === "noRaw" || raw.status === "full" || raw.status === "noParts" || raw.status === "noModel" || raw.status === "noCash" || raw.status === "suspended") p.status = raw.status;
  if (typeof raw.missing === "string" && raw.missing in COMPONENT_BY_ID) p.missing = raw.missing as ComponentId;
  p.car = typeof raw.car === "string" && raw.car in CAR_BY_ID ? (raw.car as CarId) : null;
  if (raw.mode === "fast" || raw.mode === "premium") p.mode = raw.mode;
  if (raw.carRoute === "fast" || (typeof raw.carRoute === "string" && (raw.carRoute in DEALER_BY_ID || isExportRoute(raw.carRoute)))) p.carRoute = raw.carRoute as CarRoute;
  if (isObj(raw.inputs)) for (const c of Object.keys(COMPONENT_BY_ID) as ComponentId[]) if (raw.inputs[c] !== undefined) p.inputs[c] = num(raw.inputs[c]);
  // the shop floor: the crew's morale, a boost or a breakdown in progress, the machines' wear
  if (raw.morale !== undefined) p.morale = Math.min(100, num(raw.morale, MORALE.base));
  for (const k of ["boost", "boostCd", "broken", "wear", "breaks"] as const) if (raw[k] !== undefined) p[k] = num(raw[k]);
  if (typeof raw.skin === "string" && raw.skin in SKIN_BY_ID && raw.skin !== "auto") p.skin = raw.skin as SkinId;
  return p;
}

export function migrateChain(raw: unknown, s: GameState): ChainState {
  const chain = createChain();
  if (!isObj(raw)) return chain;
  chain.rate = typeof raw.rate === "number" && Number.isFinite(raw.rate) ? raw.rate : 0;
  chain.firstCar = raw.firstCar === true;
  chain.wholesale = 0;
  chain.ledger = migrateLedger(raw.ledger);
  chain.owed = num(raw.owed);
  if (typeof raw.debtLimit === "number" && Number.isFinite(raw.debtLimit) && raw.debtLimit > 0) chain.debtLimit = raw.debtLimit;
  if (raw.suspended === true) chain.suspended = true;
  if (isObj(raw.demand))
    for (const [k, v] of Object.entries(raw.demand))
      if ((k in COMPONENT_BY_ID || k === "chassis") && typeof v === "number" && Number.isFinite(v) && v > 0) (chain.demand ??= {})[k as ItemId] = v;
  if (typeof raw.steady === "number" && Number.isFinite(raw.steady)) chain.steady = raw.steady;
  if (typeof raw.steadyBase === "number" && Number.isFinite(raw.steadyBase)) chain.steadyBase = raw.steadyBase;
  if (typeof raw.goods === "number" && Number.isFinite(raw.goods) && raw.goods >= 0) chain.goods = raw.goods;
  if (typeof raw.goodsRate === "number" && Number.isFinite(raw.goodsRate)) chain.goodsRate = raw.goodsRate;
  if (typeof raw.rescueT === "number" && Number.isFinite(raw.rescueT)) chain.rescueT = raw.rescueT;
  if (typeof raw.restructuredT === "number" && Number.isFinite(raw.restructuredT)) chain.restructuredT = raw.restructuredT;
  chain.nextShip = int(raw.nextShip, 1, 1e12, 1);
  if (Array.isArray(raw.shipments)) {
    for (const sh of raw.shipments) {
      if (!isObj(sh) || typeof sh.from !== "string" || typeof sh.to !== "string" || typeof sh.item !== "string") continue;
      if (!plotOf(sh.from) || !plotOf(sh.to)) continue;
      chain.shipments.push({
        id: chain.nextShip++,
        from: sh.from,
        to: sh.to,
        item: sh.item as Shipment["item"],
        qty: num(sh.qty),
        value: num(sh.value),
        t: num(sh.t),
        dur: Math.max(1, num(sh.dur, 10)),
        back: sh.back === true,
        vehicle: (["van", "truck", "semi", "trailer", "carrier"].includes(sh.vehicle as string) ? sh.vehicle : "truck") as Shipment["vehicle"],
        models: Array.isArray(sh.models) ? (sh.models.filter((m) => typeof m === "string" && m in CAR_BY_ID) as CarId[]) : undefined,
        materials: isObj(sh.materials) ? migrateStock(sh.materials) : undefined,
        ...(isObj(sh.costs) ? { costs: migrateStock(sh.costs) } : {}),
        ...(typeof sh.market === "string" && sh.market in EXPORT_BY_ID ? { market: sh.market as ExportMarketId } : {}),
        ...(Array.isArray(sh.fleet) ? { fleet: sh.fleet.filter((n): n is number => typeof n === "number") } : {}),
      });
    }
  }
  if (isObj(raw.dealers)) {
    for (const d of DEALERS) {
      const v = raw.dealers[d.id];
      if (!isObj(v) || !s.dealers[d.id].owned) continue;
      chain.dealers[d.id] = {
        cars: num(v.cars),
        value: num(v.value),
        models: Array.isArray(v.models) ? (v.models.filter((m) => typeof m === "string" && m in CAR_BY_ID) as CarId[]) : [],
        next: num(v.next),
        sold: num(v.sold),
      };
    }
  }
  return chain;
}


/** Plants this automated can upgrade themselves. */
export const AUTO_UPGRADE_FROM = 2;
/**
 * The share of what the company earns in play that auto-upgrades may invest. The rest, and
 * money that is collected or given (time away, daily rewards, gifts), stays in the wallet.
 */
export const AUTO_UPGRADE_SHARE = 0.5;

/** What auto-upgrades may spend after a tick that earned `earned` (never more than the share of the cash). */
export function autoBudget(budget: number, earned: number, cash: number): number {
  return Math.max(0, Math.min(budget + Math.max(0, earned) * AUTO_UPGRADE_SHARE, cash * AUTO_UPGRADE_SHARE));
}

/**
 * Auto-upgrade: each switched-on plant buys its cheapest speed or level
 * upgrade, but only when it costs at most a quarter of the cash, so the
 * player can still save for new plants. One purchase per plant per call,
 * all of them together within `budget` (see autoBudget: before it, a
 * company with many plants spent a whole windfall in one tick).
 * `log` gets each purchase (the plant and what it paid), so the player can be told.
 */
export function autoUpgrade(s: GameState, gm: GlobalMods, log?: { plot: string; cost: number }[], budget = Infinity): number {
  let bought = 0;
  let left = budget;
  for (const [id, b] of plantsOf(s)) {
    if (!b.plant.auto || b.plant.automation < AUTO_UPGRADE_FROM) continue;
    const sp = speedCost(b, gm);
    const lv = levelCost(b, gm);
    const pickLevel = lv !== null && (sp === null || lv <= sp);
    const cost = pickLevel ? lv : sp;
    if (cost === null || cost > s.cash * 0.25 || cost > left) continue;
    const cash = s.cash;
    if (pickLevel ? upgradePlantLevel(s, id, gm) : upgradePlantSpeed(s, id, gm)) {
      bought++;
      left -= cash - s.cash;
      log?.push({ plot: id, cost: cash - s.cash });
    }
  }
  return bought;
}

/** What one finished unit costs the plant: materials (or a car's parts) and its running time. */
export function plantUnitCost(st: PlantStats, gm: GlobalMods): number {
  void gm;
  return st.unitCost;
}

/** What one unit brings in after the dealer's fee and tax (components: tax only). */
export function plantNetValue(st: PlantStats): number {
  return netOfSale(st.unitValue, !PLANT_BY_ID[st.type].item);
}

/** Profit per minute at full speed: units made × (net sale value − cost). */
export function plantProfitPerMin(st: PlantStats, gm: GlobalMods): number {
  return st.unitsPerSec * 60 * (plantNetValue(st) - plantUnitCost(st, gm));
}

/** Materials for `units` finished units (a new plant's starter stock, and old saves). */
export function starterStock(type: PlantType, grade: number, units: number): MaterialStock {
  const out: MaterialStock = {};
  for (const [m, n] of Object.entries(unitMaterials(type, grade)) as [MaterialId, number][]) out[m] = n * units;
  return out;
}
