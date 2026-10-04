// Raw materials: the market (prices, suppliers, volume discounts), each
// plant's warehouse, buying (a depot truck brings the order), automatic
// restocking, and the ledger that records where every dollar goes.
// All numbers come from config/economy.ts.
import {
  AUTO_BUY,
  BULK_DISCOUNT,
  COMPONENT_RECIPE,
  DELIVERY_FEE,
  GRADE_MATERIAL,
  MATERIAL_BY_ID,
  MATERIAL_IDS,
  PRICE_DRIFT,
  SUPPLIERS,
  WAREHOUSE_CAP,
  WAREHOUSE_COST,
  POWER_SYSTEM,
  type MaterialId,
  type SupplierConfig,
} from "../config/economy";
import { DOCK_TIME, PLANT_BY_ID, ROAD_SPEED, TRAFFIC_ALLOWANCE, isPlantType } from "../config/chain";
import { DEPOT, plotOf, roadRoute } from "../city/layout";
import type { BuildingState, GameState, Ledger, LedgerKey, LedgerValues, MaterialStock, PlantData, PlantType } from "../types";

// ───────────────────────────── ledger ─────────────────────────────

export const LEDGER_KEYS: LedgerKey[] = ["carSales", "partSales", "services", "materials", "labor", "energy", "maintenance", "logistics", "dealerFees", "tax"];
export const REVENUE_KEYS: LedgerKey[] = ["carSales", "partSales", "services"];
export const emptyLedgerValues = (): LedgerValues => Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0])) as LedgerValues;
export const createLedger = (): Ledger => ({ rate: emptyLedgerValues(), run: emptyLedgerValues(), pending: emptyLedgerValues() });

/** Net of a set of ledger values: revenue minus every cost. */
export function ledgerNet(v: LedgerValues): number {
  let n = 0;
  for (const k of LEDGER_KEYS) n += REVENUE_KEYS.includes(k) ? v[k] : -v[k];
  return n;
}

/** Books revenue or a cost; the next tick folds it into the rates and run totals. */
export function book(s: GameState, key: LedgerKey, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.chain.ledger.pending[key] += amount;
}

/** Folds everything booked since the last call into the smoothed $/s rates and the run totals. */
export function settleLedger(s: GameState, dt: number, window = 60) {
  const L = s.chain.ledger;
  const k = Math.min(1, dt / window);
  for (const key of LEDGER_KEYS) {
    const v = L.pending[key];
    L.run[key] += v;
    L.rate[key] += (v / dt - L.rate[key]) * k;
    L.pending[key] = 0;
  }
}

// ───────────────────────────── prices ─────────────────────────────

/** Today's market price of a material (before supplier and bulk discounts): a slow, gentle drift. */
export function marketPrice(s: GameState, m: MaterialId): number {
  const i = MATERIAL_IDS.indexOf(m);
  const span = PRICE_DRIFT.maxPeriod - PRICE_DRIFT.minPeriod;
  const period = PRICE_DRIFT.minPeriod + ((i * 7919) % 97) / 97 * span;
  const phase = i * 1.7;
  return MATERIAL_BY_ID[m].price * (1 + PRICE_DRIFT.amp * Math.sin((2 * Math.PI * s.market.t) / period + phase));
}

/** The best supplier the company has unlocked (by material bought so far). */
export function supplierOf(s: GameState): SupplierConfig {
  let best = SUPPLIERS[0];
  for (const sp of SUPPLIERS) if (s.market.bought >= sp.unlockBought) best = sp;
  return best;
}

export function bulkDiscount(qty: number): number {
  for (const [n, d] of BULK_DISCOUNT) if (qty >= n) return d;
  return 0;
}

/** What an order costs: units × price after the supplier and volume discounts, plus delivery. */
export function orderCost(s: GameState, m: MaterialId, qty: number): number {
  if (!(qty > 0)) return 0;
  const sp = supplierOf(s);
  const unit = marketPrice(s, m) * (1 - sp.discount) * (1 - bulkDiscount(qty));
  return qty * (unit + DELIVERY_FEE);
}

// ───────────────────────────── recipes ─────────────────────────────

/** Materials one finished unit of this plant uses (empty for the assembly plant). */
export function unitMaterials(type: PlantType, grade: number): MaterialStock {
  const item = PLANT_BY_ID[type].item;
  if (!item) return {};
  const mult = GRADE_MATERIAL[Math.max(0, Math.min(GRADE_MATERIAL.length - 1, grade - 1))];
  const out: MaterialStock = {};
  for (const [m, n] of Object.entries(COMPONENT_RECIPE[item]) as [MaterialId, number][]) out[m] = Math.ceil(n * mult);
  return out;
}

/** Materials this plant type buys. */
export const plantMaterials = (type: PlantType): MaterialId[] => {
  const item = PLANT_BY_ID[type].item;
  return item ? (Object.keys(COMPONENT_RECIPE[item]) as MaterialId[]) : [];
};

/** Materials the company uses at all (unlocked as new plants are built). */
export function usedMaterials(s: GameState): MaterialId[] {
  const set = new Set<MaterialId>();
  for (const b of Object.values(s.city.buildings)) if (b.plant && isPlantType(b.type)) for (const m of plantMaterials(b.type)) set.add(m);
  return MATERIAL_IDS.filter((m) => set.has(m));
}

// ───────────────────────────── warehouse ─────────────────────────────

export const warehouseCap = (p: PlantData) => WAREHOUSE_CAP[Math.max(0, Math.min(WAREHOUSE_CAP.length - 1, p.warehouse - 1))];
export const stockTotal = (st: MaterialStock) => Object.values(st).reduce<number>((a, v) => a + (v ?? 0), 0);

/** Material on its way to a plant (bought, on a depot truck). */
export function incomingMaterials(s: GameState, plotId: string): MaterialStock {
  const out: MaterialStock = {};
  for (const sh of s.chain.shipments)
    if (!sh.back && sh.to === plotId && sh.materials) for (const [m, n] of Object.entries(sh.materials) as [MaterialId, number][]) out[m] = (out[m] ?? 0) + n;
  return out;
}

/** Free warehouse space, counting what is already on the road. */
export function warehouseRoom(s: GameState, plotId: string): number {
  const p = s.city.buildings[plotId]?.plant;
  if (!p) return 0;
  return Math.max(0, warehouseCap(p) - stockTotal(p.stock) - stockTotal(incomingMaterials(s, plotId)));
}

export function warehouseCost(b: BuildingState, costMult = 1): number | null {
  const p = b.plant;
  if (!p || !PLANT_BY_ID[b.type as PlantType]?.item || p.warehouse >= WAREHOUSE_CAP.length) return null;
  return PLANT_BY_ID[b.type as PlantType].cost * WAREHOUSE_COST.base * Math.pow(WAREHOUSE_COST.growth, p.warehouse - 1) * costMult;
}

export function powerCost(b: BuildingState, costMult = 1): number | null {
  const p = b.plant;
  if (!p || p.power >= POWER_SYSTEM.max) return null;
  return PLANT_BY_ID[b.type as PlantType].cost * POWER_SYSTEM.costBase * Math.pow(POWER_SYSTEM.growth, p.power) * costMult;
}

/** How many whole units the warehouse can make right now, and the first material that limits it. */
export function unitsInStock(p: PlantData, need: MaterialStock): { n: number; short?: MaterialId } {
  let n = Infinity;
  let short: MaterialId | undefined;
  for (const [m, per] of Object.entries(need) as [MaterialId, number][]) {
    if (per <= 0) continue;
    const k = Math.floor((p.stock[m] ?? 0) / per);
    if (k < n) {
      n = k;
      short = m;
    }
  }
  return n === Infinity ? { n: Infinity } : { n, short: n === 0 ? short : undefined };
}

// ───────────────────────────── buying ─────────────────────────────

function depotTrip(to: string) {
  const a = plotOf(DEPOT)?.entry;
  const b = plotOf(to)?.entry;
  const tiles = a && b ? roadRoute(a, b).length : 20;
  return DOCK_TIME + (tiles / ROAD_SPEED) * (1 + TRAFFIC_ALLOWANCE);
}

export type BuyResult = { ok: true; cost: number; qty: number } | { ok: false; why: "plant" | "material" | "qty" | "room" | "cash" };

/**
 * Buys `qty` units of a material for a plant: paid now, delivered by a depot
 * truck into the plant's warehouse. Only materials the plant uses, only
 * whole units, never more than the warehouse can take or the supplier sells
 * in one order, never more than the cash on hand.
 */
export function buyMaterial(s: GameState, plotId: string, m: MaterialId, qty: number): BuyResult {
  const b = s.city.buildings[plotId];
  if (!b?.plant || !isPlantType(b.type)) return { ok: false, why: "plant" };
  if (!plantMaterials(b.type).includes(m)) return { ok: false, why: "material" };
  qty = Math.floor(qty);
  if (!(qty >= 1) || qty > supplierOf(s).maxOrder) return { ok: false, why: "qty" };
  if (qty > warehouseRoom(s, plotId)) return { ok: false, why: "room" };
  const cost = orderCost(s, m, qty);
  if (!Number.isFinite(cost) || cost > s.cash) return { ok: false, why: "cash" };
  s.cash -= cost;
  s.market.bought += qty;
  book(s, "materials", cost);
  s.chain.shipments.push({ id: s.chain.nextShip++, from: DEPOT, to: plotId, item: "raw", qty, value: cost, t: 0, dur: depotTrip(plotId), back: false, vehicle: qty > 600 ? "semi" : "truck", materials: { [m]: qty } });
  return { ok: true, cost, qty };
}

/** The most of a material the player could order right now (room, supplier limit, cash). */
export function maxOrder(s: GameState, plotId: string, m: MaterialId): number {
  const room = Math.min(warehouseRoom(s, plotId), supplierOf(s).maxOrder);
  if (room <= 0) return 0;
  // cash: discounts only grow with quantity, so the unit price at `room` is a lower bound
  let lo = 0;
  let hi = room;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (orderCost(s, m, mid) <= s.cash) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Enough of every material for `units` finished units (what a "buy for N units" button orders). */
export function shortfall(p: PlantData, need: MaterialStock, units: number): MaterialStock {
  const out: MaterialStock = {};
  for (const [m, per] of Object.entries(need) as [MaterialId, number][]) {
    const want = per * units - (p.stock[m] ?? 0);
    if (want > 0) out[m] = Math.ceil(want);
  }
  return out;
}

/**
 * Automatic restocking (from the Wholesale supplier on, when switched on):
 * a material below AUTO_BUY.below of its share of the warehouse is topped up
 * to AUTO_BUY.upTo, if the cash allows. One delivery at a time per plant.
 */
export function autoRestock(s: GameState, plotId: string) {
  const b = s.city.buildings[plotId];
  const p = b?.plant;
  if (!p?.autoBuy || !b || !isPlantType(b.type) || !supplierOf(s).autoBuy) return;
  if (s.chain.shipments.some((sh) => !sh.back && sh.to === plotId && sh.materials)) return;
  const need = unitMaterials(b.type, p.grade);
  const per = stockTotal(need);
  if (per <= 0) return;
  const cap = warehouseCap(p);
  for (const [m, n] of Object.entries(need) as [MaterialId, number][]) {
    // each material's share of the warehouse follows the recipe
    const share = (cap * n) / per;
    const have = p.stock[m] ?? 0;
    if (have >= share * AUTO_BUY.below) continue;
    let qty = Math.floor(Math.min(share * AUTO_BUY.upTo - have, supplierOf(s).maxOrder, warehouseRoom(s, plotId)));
    while (qty >= 1 && orderCost(s, m, qty) > s.cash) qty = Math.floor(qty / 2);
    if (qty >= 1) buyMaterial(s, plotId, m, qty);
  }
}

/** Takes the materials for `units` finished units out of the warehouse. */
export function consume(p: PlantData, need: MaterialStock, units: number): number {
  let used = 0;
  for (const [m, per] of Object.entries(need) as [MaterialId, number][]) {
    p.stock[m] = Math.max(0, (p.stock[m] ?? 0) - per * units);
    used += per * units;
  }
  return used;
}

// ───────────────────────────── saves ─────────────────────────────

export function migrateStock(raw: unknown): MaterialStock {
  const out: MaterialStock = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const m of MATERIAL_IDS) {
    const v = (raw as Record<string, unknown>)[m];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[m] = v;
  }
  return out;
}

export function migrateLedger(raw: unknown): Ledger {
  const L = createLedger();
  if (typeof raw !== "object" || raw === null) return L;
  const r = raw as { rate?: Record<string, unknown>; run?: Record<string, unknown> };
  // pending bookings are transient: a save never carries them
  for (const k of LEDGER_KEYS) {
    const a = r.rate?.[k];
    const b = r.run?.[k];
    if (typeof a === "number" && Number.isFinite(a)) L.rate[k] = a;
    if (typeof b === "number" && Number.isFinite(b) && b >= 0) L.run[k] = b;
  }
  return L;
}
