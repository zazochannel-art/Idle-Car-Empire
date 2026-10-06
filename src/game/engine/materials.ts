// Raw materials: the market (prices, suppliers, volume discounts), each
// plant's warehouse, buying (a depot truck brings the order), automatic
// restocking, and the ledger that records where every dollar goes.
// All numbers come from config/economy.ts.
import { materialTrendMult } from "./market";
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

// Every dollar is booked once, under one key, and every key belongs to exactly
// one group. Each figure the game shows (HUD profit, dashboard, stats, the
// Welcome Back report) is a sum over these groups — never a formula that adds
// a category and takes it out again.

/** The manufacturing business: plants, trucks, dealers, the Parts Market, export and the truck & bus line. */
export const CHAIN_REVENUE_KEYS: LedgerKey[] = ["carSales", "partSales"];
export const CHAIN_COST_KEYS: LedgerKey[] = ["materials", "labor", "energy", "maintenance", "logistics", "dealerFees", "tax"];
/** The side businesses: garages (services) earn, the racing team earns prizes and pays entry fees and repairs. */
export const SIDE_REVENUE_KEYS: LedgerKey[] = ["services", "racing"];
export const SIDE_COST_KEYS: LedgerKey[] = ["repairs"];
/** Not earned by running the business: mission, achievement, event and contract rewards. Below the line. */
export const OTHER_KEYS: LedgerKey[] = ["rewards"];

export const REVENUE_KEYS: LedgerKey[] = [...CHAIN_REVENUE_KEYS, ...SIDE_REVENUE_KEYS];
export const COST_KEYS: LedgerKey[] = [...CHAIN_COST_KEYS, ...SIDE_COST_KEYS];
export const LEDGER_KEYS: LedgerKey[] = [...REVENUE_KEYS, ...COST_KEYS, ...OTHER_KEYS];
export const emptyLedgerValues = (): LedgerValues => Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0])) as LedgerValues;
export const createLedger = (): Ledger => ({ rate: emptyLedgerValues(), run: emptyLedgerValues(), pending: emptyLedgerValues() });

const sumOf = (v: LedgerValues, keys: LedgerKey[]) => keys.reduce((a, k) => a + (v[k] ?? 0), 0);

/** Operating revenue: car and part sales, services, racing. */
export const ledgerRevenue = (v: LedgerValues) => sumOf(v, REVENUE_KEYS);
/** Operating costs: everything the plants, trucks, dealers and the racing team cost. */
export const ledgerCosts = (v: LedgerValues) => sumOf(v, COST_KEYS);

/** Operating net profit: revenue minus costs (the manufacturing chain plus the side businesses). */
export function ledgerNet(v: LedgerValues): number {
  return ledgerRevenue(v) - ledgerCosts(v);
}

/** Net of the manufacturing chain alone. */
export function chainNet(v: LedgerValues): number {
  return sumOf(v, CHAIN_REVENUE_KEYS) - sumOf(v, CHAIN_COST_KEYS);
}

/** Net of the side businesses (garages and racing). ledgerNet = chainNet + sideNet. */
export function sideNet(v: LedgerValues): number {
  return sumOf(v, SIDE_REVENUE_KEYS) - sumOf(v, SIDE_COST_KEYS);
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

/**
 * Pays a running cost now, or puts what the cash can't cover on the
 * company's account (paid first from the next revenue). Every cost that may
 * run on account goes through here, so a cost is never booked without being
 * either paid or owed.
 */
export function payOrOwe(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const now = Math.min(amount, Math.max(0, s.cash));
  s.cash -= now;
  s.chain.owed += amount - now;
}

/** A cash reward (missions, achievements, events, contracts…): paid in and booked below the line. */
export function payReward(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  book(s, "rewards", amount);
}

// ───────────────────────────── prices ─────────────────────────────

/** Today's market price of a material (before supplier and bulk discounts): a slow, gentle drift. */
export function marketPrice(s: GameState, m: MaterialId): number {
  const i = MATERIAL_IDS.indexOf(m);
  const span = PRICE_DRIFT.maxPeriod - PRICE_DRIFT.minPeriod;
  const period = PRICE_DRIFT.minPeriod + ((i * 7919) % 97) / 97 * span;
  const phase = i * 1.7;
  return MATERIAL_BY_ID[m].price * (1 + PRICE_DRIFT.amp * Math.sin((2 * Math.PI * s.market.t) / period + phase)) * materialTrendMult(s, m);
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

/** A free delivery (supplier credit): sent like an order, but nothing is paid or booked. */
export function grantMaterials(s: GameState, plotId: string, stock: MaterialStock) {
  const qty = stockTotal(stock);
  if (qty <= 0) return;
  s.chain.shipments.push({ id: s.chain.nextShip++, from: DEPOT, to: plotId, item: "raw", qty, value: 0, t: 0, dur: depotTrip(plotId), back: false, vehicle: qty > 600 ? "semi" : "truck", materials: { ...stock } });
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
  // booked as a cost when the plant uses the material (see spendMaterials)
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

export interface RestockPlan {
  /** Finished units the order is for (0 when not even one fits or is affordable). */
  units: number;
  want: MaterialStock;
  cost: number;
}

/**
 * The biggest "buy for N units" order (up to `maxUnits`) that fits the
 * warehouse, the supplier's limit and — unless `ignoreCash` — the cash.
 * Materials in stock or on the way count. With nothing possible it plans one
 * unit, so the UI can show what the next unit costs.
 */
export function restockPlan(s: GameState, plotId: string, need: MaterialStock, maxUnits: number, ignoreCash = false): RestockPlan {
  const p = s.city.buildings[plotId]?.plant;
  if (!p) return { units: 0, want: {}, cost: 0 };
  const coming = incomingMaterials(s, plotId);
  const room = Math.max(0, warehouseCap(p) - stockTotal(p.stock) - stockTotal(coming));
  const maxQty = supplierOf(s).maxOrder;
  const plan = (n: number): RestockPlan => {
    const want: MaterialStock = {};
    for (const [m, per] of Object.entries(need) as [MaterialId, number][]) {
      const q = Math.ceil(per * n - (p.stock[m] ?? 0) - (coming[m] ?? 0));
      if (q > 0) want[m] = q;
    }
    const cost = (Object.entries(want) as [MaterialId, number][]).reduce((a, [m, q]) => a + orderCost(s, m, q), 0);
    return { units: n, want, cost };
  };
  const ok = (r: RestockPlan) => stockTotal(r.want) <= room && Object.values(r.want).every((q) => (q ?? 0) <= maxQty) && (ignoreCash || r.cost <= s.cash);
  for (let n = Math.max(1, Math.floor(maxUnits)); n >= 1; n--) {
    const r = plan(n);
    if (ok(r)) return r;
  }
  return { ...plan(1), units: 0 };
}

/** Places the orders of a restock plan; true if every order went through. */
export function buyPlan(s: GameState, plotId: string, r: RestockPlan): boolean {
  if (r.units < 1) return false;
  let all = true;
  for (const [m, q] of Object.entries(r.want) as [MaterialId, number][]) all = buyMaterial(s, plotId, m, q).ok && all;
  return all;
}

/**
 * Automatic restocking (from the Wholesale supplier on, when switched on):
 * a material that would last less than AUTO_BUY.belowMin minutes at the
 * plant's pace is topped up to AUTO_BUY.upToMin minutes (within its share of
 * the warehouse), if the cash allows. One delivery at a time per plant.
 */
export function autoRestock(s: GameState, plotId: string, unitsPerSec: number) {
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
    const low = Math.min(share, n * Math.max(1, unitsPerSec * 60 * AUTO_BUY.belowMin));
    const high = Math.min(share, n * Math.max(AUTO_BUY.minUnits, unitsPerSec * 60 * AUTO_BUY.upToMin));
    const have = p.stock[m] ?? 0;
    if (have >= low) continue;
    let qty = Math.floor(Math.min(high - have, supplierOf(s).maxOrder, warehouseRoom(s, plotId)));
    while (qty >= 1 && orderCost(s, m, qty) > s.cash) qty = Math.floor(qty / 2);
    if (qty >= 1) buyMaterial(s, plotId, m, qty);
  }
}

// ───────────────────────────── cost basis ─────────────────────────────

/** List-price weight of a set of materials (how a delivery's price is shared out when it carries several). */
function listValue(st: MaterialStock): number {
  let v = 0;
  for (const [m, n] of Object.entries(st) as [MaterialId, number][]) v += (n ?? 0) * MATERIAL_BY_ID[m].price;
  return v;
}

/**
 * Each material's cost basis, for plants whose state has only the total
 * (saves from before per-material costs): the total is shared out by list
 * price × quantity, so the stock keeps exactly what was paid for it.
 */
function basisOf(p: PlantData): MaterialStock {
  if (p.stockCostBy) return p.stockCostBy;
  const total = Math.max(0, p.stockCost ?? 0);
  const weight = listValue(p.stock);
  const by: MaterialStock = {};
  if (total > 0 && weight > 0) for (const [m, n] of Object.entries(p.stock) as [MaterialId, number][]) if ((n ?? 0) > 0) by[m] = (total * n * MATERIAL_BY_ID[m].price) / weight;
  return by;
}

/** The plant's cost basis, created from its total the first time it is changed. */
function costBasis(p: PlantData): MaterialStock {
  return (p.stockCostBy ??= basisOf(p));
}

/** Only materials that cost something carry a basis (a free or used-up one has none). */
function setBasis(by: MaterialStock, m: MaterialId, v: number) {
  if (v > 1e-9 && Number.isFinite(v)) by[m] = v;
  else delete by[m];
}

const sumStock = (st: MaterialStock) => Object.values(st).reduce<number>((a, v) => a + (v ?? 0), 0);

/** Puts a delivery into the warehouse: `value` is what it cost (shared by list price when it carries several materials). */
export function addStock(p: PlantData, materials: MaterialStock, value: number) {
  const by = costBasis(p);
  const weight = listValue(materials);
  const paid = Number.isFinite(value) && value > 0 ? value : 0;
  for (const [m, n] of Object.entries(materials) as [MaterialId, number][]) {
    if (!((n ?? 0) > 0)) continue;
    p.stock[m] = (p.stock[m] ?? 0) + n;
    setBasis(by, m, (by[m] ?? 0) + (weight > 0 ? (paid * n * MATERIAL_BY_ID[m].price) / weight : 0));
  }
  p.stockCost = sumStock(by);
}

/** What one unit of a material in this warehouse cost (its weighted average), or null with none in stock. */
export function unitCostOf(p: PlantData, m: MaterialId): number | null {
  const n = p.stock[m] ?? 0;
  return n > 0 ? (basisOf(p)[m] ?? 0) / n : null;
}

/** What the materials in a warehouse cost (their cost basis). */
export function inventoryValue(p: PlantData): number {
  return sumStock(basisOf(p));
}


/**
 * Takes the materials for `units` finished units out of the warehouse and
 * books what they cost: for each material, the quantity used × that
 * material's own unit cost (never an average over the whole warehouse).
 * Returns the material units used.
 */
export function spendMaterials(s: GameState, p: PlantData, need: MaterialStock, units: number): number {
  const by = costBasis(p);
  let used = 0;
  let cost = 0;
  for (const [m, per] of Object.entries(need) as [MaterialId, number][]) {
    const have = p.stock[m] ?? 0;
    const q = Math.min(have, per * units);
    if (!(q > 0)) continue;
    const basis = by[m] ?? 0;
    const c = q >= have ? basis : (basis * q) / have;
    cost += c;
    used += q;
    const left = have - q > 1e-9 ? have - q : 0;
    p.stock[m] = left;
    setBasis(by, m, left > 0 ? basis - c : 0);
  }
  p.stockCost = sumStock(by);
  if (cost > 0) book(s, "materials", cost);
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

/** A save's per-material cost basis; missing or broken values fall back to the plant's total, shared by list price. */
export function migrateCostBasis(raw: unknown, p: PlantData): MaterialStock {
  if (typeof raw === "object" && raw !== null) {
    // kept when every value is a valid amount and together they add up to the plant's total
    // (a material missing from it cost nothing: a free delivery)
    const by: MaterialStock = {};
    let ok = true;
    for (const m of Object.keys(p.stock) as MaterialId[]) {
      const v = (raw as Record<string, unknown>)[m];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        if (v > 0) by[m] = v;
      } else if (v !== undefined) ok = false;
    }
    const total = Math.max(0, p.stockCost ?? 0);
    if (ok && Math.abs(sumStock(by) - total) <= 0.01 * Math.max(1, total)) {
      p.stockCost = sumStock(by);
      return by;
    }
  }
  delete p.stockCostBy;
  return basisOf(p);
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
