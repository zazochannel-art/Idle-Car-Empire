// Read-only helpers that explain the game to the player: what to aim for next
// and why something is locked. They return data, not text — the UI words it
// in the player's language. Never mutate state.
import { atTrack, racingCost } from "./racing";
import { LOW_STOCK_UNITS, MATERIAL_BY_ID, RESERVE_UNITS, RESTOCK_UNITS, WAREHOUSE_MINUTES, type MaterialId } from "../config/economy";
import { buyPlan, plantMaterials, restockPlan, stockTotal, supplierOf, unitsInStock, warehouseCap, warehouseCost } from "./materials";
import { CARS } from "../config/cars";
import { MAKER, PLANTS, PLANT_BY_ID } from "../config/chain";
import { DEALERS } from "../config/dealerships";
import { MANAGERS } from "../config/managers";
import { ZONE_BY_ID } from "../config/city";
import { WORLD_MAP, dealerPlot } from "../city/layout";
import type { CarId, ComponentId, DealerId, GameState, ManagerId, MaterialStock, PlantType, ZoneId } from "../types";
import { canOpenDealers, isManagerUnlocked } from "./actions";
import { bestGrade, carLock, carTrip, gradeCost, hasPlant, levelCost, plantBuildCost, plantLock, plantsOf, speedCost } from "./chain";
import { isPlotUnlocked, nextZone, zoneBlocker } from "./city";
import { dealerUpgradeCost, type EconomySnapshot } from "./economy";
import { PRESTIGE } from "../config/prestige";
import { canPrestige, pendingPoints } from "./prestige";

export type Requirement =
  | { kind: "research"; research: string }
  | { kind: "plant"; plant: PlantType }
  | { kind: "grade"; plant: PlantType; grade: number }
  | { kind: "zone"; zone: ZoneId }
  | { kind: "firstCar" }
  | { kind: "made"; item: ComponentId; n: number; have: number }
  | { kind: "unavailable" };

export type Goal =
  | { kind: "plant"; icon: string; cost: number; plant: PlantType; /** Cash to keep for materials after building. */ reserve: number }
  | { kind: "upgrade"; icon: string; cost: number; plot: string; what: "speed" | "level" }
  /** cost/what: the cheapest upgrade on the maker plot, bought by tapping the goal. */
  | { kind: "shortage"; icon: string; plot: string; component: ComponentId; cost?: number; what?: "speed" | "level" }
  | { kind: "dealer"; icon: string; cost: number; dealer: DealerId }
  /** Every dealer is full and cars wait at the plants: the cheapest way to sell more (perMin: cars waiting). */
  | { kind: "dealerFull"; icon: string; cost: number; dealer: DealerId; open: boolean; perMin: number }
  /** A plant is out of (or low on) material and nothing is on the way: buy for up to 10 units (`units`: what fits and is affordable). */
  | { kind: "materials"; icon: string; plot: string; material: MaterialId; cost: number; units: number }
  | { kind: "autoBuy"; icon: string; plots: string[] }
  | { kind: "warehouse"; icon: string; plot: string; cost: number; minutes: number }
  /** The Racing District: build it, send it a car, enter the first race. */
  | { kind: "racing"; icon: string; cost: number }
  | { kind: "raceCar"; icon: string }
  | { kind: "sendCar"; icon: string; car: number; cost: number }
  | { kind: "firstRace"; icon: string }
  | { kind: "car"; icon: string; cost?: number; car: CarId; plot: string | null; requirement: Requirement | null }
  | { kind: "manager"; icon: string; cost: number; manager: ManagerId }
  /** gain: extra income share the points add; stalled: income stopped growing. */
  | { kind: "prestige"; icon: string; points: number; gain: number; stalled: boolean }
  | { kind: "facility"; icon: string; plot: string }
  | { kind: "worker"; icon: string; plot: string; idle: number }
  | { kind: "zone"; icon: string; cost: number; zone: ZoneId }
  | { kind: "made"; icon: string; plant: PlantType; item: ComponentId; n: number; have: number; plot: string | null };

export function dealerRequirement(s: GameState, id: DealerId): Requirement | null {
  if (!canOpenDealers(s)) return { kind: "firstCar" };
  const plot = dealerPlot(id);
  return plot && !isPlotUnlocked(s, plot) ? { kind: "zone", zone: plot.zone } : null;
}

/**
 * One tap for every plant running low (fewest units first, while the cash
 * lasts), so the materials goal doesn't come back plant after plant.
 * Returns how many plants were restocked.
 */
export function restockLow(s: GameState, snap: EconomySnapshot): number {
  const low: { id: string; n: number; need: MaterialStock }[] = [];
  for (const [id, b] of plantsOf(s)) {
    const st = snap.chain.plants[id];
    if (!st || !Object.keys(st.need).length) continue;
    if (s.chain.shipments.some((sh) => !sh.back && sh.to === id && sh.materials)) continue;
    const n = unitsInStock(b.plant, st.need).n;
    if (n < LOW_STOCK_UNITS || b.plant.status === "noRaw") low.push({ id, n, need: st.need });
  }
  low.sort((a, b) => a.n - b.n);
  let done = 0;
  for (const l of low) if (buyPlan(s, l.id, restockPlan(s, l.id, l.need, RESTOCK_UNITS))) done++;
  return done;
}

/** A free plot in an unlocked district, if there is one. */
export function freePlot(s: GameState): string | null {
  const p = WORLD_MAP.plots.find((pl) => pl.kind === "plot" && isPlotUnlocked(s, pl) && !s.city.buildings[pl.id]);
  return p?.id ?? null;
}

/** The plot of the plant that makes a component (the slowest one if there are several). */
function makerPlot(s: GameState, snap: EconomySnapshot, c: ComponentId): string | null {
  let best: string | null = null;
  let rate = Infinity;
  for (const [id, b] of plantsOf(s)) {
    if (b.type !== MAKER[c]) continue;
    const r = snap.chain.plants[id]?.unitsPerSec ?? 0;
    if (r < rate) {
      rate = r;
      best = id;
    }
  }
  return best;
}

export function nextGoals(s: GameState, snap: EconomySnapshot, max = 3): Goal[] {
  const goals: Goal[] = [];
  const gm = snap.gm;

  // A plant out of material (or about to be), with nothing on the way, is the most urgent thing on the map.
  {
    const auto = supplierOf(s).autoBuy;
    let low: { id: string; units: number; material: MaterialId; need: MaterialStock } | null = null;
    for (const [id, b] of plantsOf(s)) {
      const st = snap.chain.plants[id];
      if (!st || !Object.keys(st.need).length) continue;
      if (s.chain.shipments.some((sh) => !sh.back && sh.to === id && sh.materials)) continue;
      const have = unitsInStock(b.plant, st.need);
      const out = b.plant.status === "noRaw";
      // auto-restock looks after a plant that is only running low
      if (!out && (have.n >= LOW_STOCK_UNITS || (auto && b.plant.autoBuy))) continue;
      const material = b.plant.short ?? have.short ?? (Object.keys(st.need)[0] as MaterialId);
      const units = out ? -1 : have.n;
      if (!low || units < low.units) low = { id, units, material, need: st.need };
    }
    if (low) {
      // the biggest order (up to 10 units) that fits the warehouse and the cash; else what one unit costs
      const plan = restockPlan(s, low.id, low.need, RESTOCK_UNITS);
      const shown = plan.units ? plan : restockPlan(s, low.id, low.need, 1, true);
      goals.push({ kind: "materials", icon: MATERIAL_BY_ID[low.material].emoji, plot: low.id, material: low.material, cost: shown.cost, units: Math.max(1, shown.units) });
    }
  }

  // Once the supplier delivers automatically, switch it on: no more buying by hand.
  if (supplierOf(s).autoBuy) {
    const off = plantsOf(s)
      .filter(([, b]) => !b.plant.autoBuy && plantMaterials(b.type as PlantType).length > 0)
      .map(([id]) => id);
    if (off.length) goals.push({ kind: "autoBuy", icon: "🔁", plots: off });
  }

  // A warehouse that holds only a few minutes of work keeps running dry: make it bigger.
  {
    let worst: Extract<Goal, { kind: "warehouse" }> | null = null;
    for (const [id, b] of plantsOf(s)) {
      const st = snap.chain.plants[id];
      const per = st ? stockTotal(st.need) : 0;
      if (!st || per <= 0 || st.unitsPerSec <= 0) continue;
      const minutes = warehouseCap(b.plant) / per / st.unitsPerSec / 60;
      const cost = warehouseCost(b, gm.costMult);
      if (minutes < WAREHOUSE_MINUTES && cost !== null && (!worst || minutes < worst.minutes)) worst = { kind: "warehouse", icon: "🏬", plot: id, cost, minutes };
    }
    if (worst) goals.push(worst);
  }

  // An assembly line starved of parts is next.
  for (const [id, b] of plantsOf(s)) {
    if (b.type === "assemblyPlant" && b.plant.status === "noParts" && b.plant.missing) {
      const plot = makerPlot(s, snap, b.plant.missing) ?? id;
      const maker = s.city.buildings[plot];
      const fix = maker?.plant ? cheapestUpgrade(maker, gm) : null;
      goals.push({ kind: "shortage", icon: "⚠️", plot, component: b.plant.missing, ...(fix ?? {}) });
      break;
    }
  }

  // The first car is built: open a dealership to sell it.
  if (canOpenDealers(s) && !DEALERS.some((d) => s.dealers[d.id].owned)) {
    const d = DEALERS[0];
    goals.push({ kind: "dealer", icon: d.emoji, cost: d.cost, dealer: d.id });
  }

  // Dealers can't keep up: finished cars are waiting at the plants.
  const waiting = plantsOf(s).reduce((a, [, b]) => (b.type === "assemblyPlant" && b.plant.status === "full" ? a + Math.floor(b.plant.out) : a), 0);
  if (waiting >= 1) {
    let best: Extract<Goal, { kind: "dealerFull" }> | null = null;
    for (const d of DEALERS) {
      const st = s.dealers[d.id];
      const open = !st.owned;
      if (open && dealerRequirement(s, d.id) !== null) continue;
      const cost = open ? d.cost : dealerUpgradeCost(s, d.id);
      if (!best || cost < best.cost) best = { kind: "dealerFull", icon: d.emoji, cost, dealer: d.id, open, perMin: waiting };
    }
    if (best) goals.push(best);
  }

  // A production milestone that unlocks the next plant (25 bodies → Engine Factory).
  for (const p of PLANTS) {
    const lock = hasPlant(s, p.id) ? null : plantLock(s, p.id);
    if (lock?.kind !== "made") continue;
    const plot = plantsOf(s).find(([, b]) => b.type === MAKER[lock.item])?.[0] ?? null;
    goals.push({ kind: "made", icon: PLANT_BY_ID[p.id].emoji, plant: p.id, item: lock.item, n: lock.n, have: lock.have, plot });
    break;
  }

  // The next plant in the chain.
  const next = PLANTS.find((p) => !hasPlant(s, p.id) && plantLock(s, p.id) === null);
  if (next) {
    if (freePlot(s)) goals.push({ kind: "plant", icon: next.emoji, cost: plantBuildCost(s, next.id), plant: next.id, reserve: workingCapital(s, snap) });
    else {
      const z = nextZone(s);
      if (z && !zoneBlocker(s, z.id)) goals.push({ kind: "zone", icon: "🗺️", cost: ZONE_BY_ID[z.id].cost, zone: z.id });
    }
  }

  // The next car model: usually a better component grade somewhere.
  if (hasPlant(s, "assemblyPlant")) {
    const car = CARS.find((c) => carLock(s, c, gm) !== null);
    if (car) {
      const lock = carLock(s, car, gm);
      if (lock?.kind === "grade") {
        const comp = (Object.keys(MAKER) as ComponentId[]).find((c) => MAKER[c] === lock.plant && bestGrade(s, c) < lock.grade);
        const plot = comp ? plantsOf(s).find(([, b]) => b.type === lock.plant)?.[0] ?? null : null;
        const b = plot ? s.city.buildings[plot] : null;
        goals.push({ kind: "car", icon: car.emoji, cost: b ? (gradeCost(b, gm) ?? undefined) : undefined, car: car.id, plot, requirement: lock });
      } else if (lock && lock.kind !== "plant") {
        goals.push({ kind: "car", icon: car.emoji, car: car.id, plot: null, requirement: lock });
      }
    }
  }

  // While saving up: the cheapest upgrade that makes more of something.
  // When it is affordable now and the next plant is still far away, it comes first.
  // Never at the cost of the materials: keep enough cash to restock every plant for a few units,
  // and don't speed up a plant that is waiting for material anyway.
  const reserve = workingCapital(s, snap);
  // While an assembly line is busy with every part it needs, it is the bottleneck: upgrade it first.
  const busyLine = plantsOf(s).some(([, b]) => b.type === "assemblyPlant" && b.plant.status === "ok");
  let best: Extract<Goal, { kind: "upgrade" }> | null = null;
  for (const [id, b] of plantsOf(s)) {
    if (b.plant.status === "noRaw") continue;
    if (busyLine && b.type !== "assemblyPlant") continue;
    for (const what of ["speed", "level"] as const) {
      const cost = what === "speed" ? speedCost(b, gm) : levelCost(b, gm);
      if (cost !== null && (!best || cost < best.cost)) best = { kind: "upgrade", icon: what === "speed" ? "⚡" : "⬆️", cost, plot: id, what };
    }
  }
  const plantGoal = goals.find((g) => g.kind === "plant");
  if (best && best.cost <= s.cash && best.cost + reserve > s.cash) best = null;
  // before the first car, everything goes towards the next plant of the chain (no detours)
  const firstCarFocus = !s.chain.firstCar && !!plantGoal;
  if (firstCarFocus) best = null;
  // the next plant is "far" when it takes more than ~10 minutes of income to save up for it
  const far = !plantGoal || ("cost" in plantGoal && plantGoal.cost - s.cash > Math.max(s.cash * 2, snap.incomePerSec * 600));
  if (best && best.cost <= s.cash && far) {
    const urgent = goals[0]?.kind === "shortage" || goals[0]?.kind === "dealer" || goals[0]?.kind === "materials" ? 1 : 0;
    goals.splice(urgent, 0, best);
  } else if (best && goals.length < max) goals.push(best);

  // Garages are a side business: keep them staffed.
  for (const [plot, st] of Object.entries(snap.city.garages)) {
    const g = s.city.buildings[plot]?.garage;
    if (g && g.facilities.length === 0) {
      goals.push({ kind: "facility", icon: "🛠️", plot });
      break;
    }
    if (st.workstations > st.staffed && st.workers < st.workerCap) {
      goals.push({ kind: "worker", icon: "👷", plot, idle: st.workstations - st.staffed });
      break;
    }
  }

  // the Racing District, once there is a car to race
  if (s.chain.firstCar) {
    const R = s.racing;
    if (!R.unlocked) goals.push({ kind: "racing", icon: "🏁", cost: racingCost(s) });
    else if (!R.cars.length && !R.orders.length && !R.arrivals.length) goals.push({ kind: "raceCar", icon: "🚛" });
    else if (R.cars.length && !R.cars.some((c) => atTrack(c) || c.location === "transit")) {
      // every car is at the factory lot: one has to make the trip to the paddock
      const rc = R.cars[0];
      const trip = carTrip(s, rc, "racing");
      if (trip) goals.push({ kind: "sendCar", icon: "🚚", car: rc.id, cost: trip.fee });
    }
    else if (R.cars.length && R.stats.races === 0 && !R.live) goals.push({ kind: "firstRace", icon: "🏎️" });
  }

  const nextManager = MANAGERS.find((m) => !s.managers[m.id].hired && isManagerUnlocked(s, m.id));
  if (nextManager && !firstCarFocus) goals.push({ kind: "manager", icon: nextManager.avatar, cost: nextManager.cost, manager: nextManager.id });

  if (canPrestige(s)) {
    const points = pendingPoints(s);
    const gain = (1 + (s.empirePoints + points) * PRESTIGE.incomePerPoint) / (1 + s.empirePoints * PRESTIGE.incomePerPoint) - 1;
    const stalled = incomeStalled(s);
    const g: Goal = { kind: "prestige", icon: "⭐", points, gain, stalled };
    // worth it now (growth stalled or a big jump) → first; otherwise a quiet option
    if (stalled || gain >= 0.5) goals.unshift(g);
    else goals.splice(Math.min(goals.length, max - 1), 0, g);
  }
  return goals.slice(0, max);
}

/** Cash that should stay free to buy materials for the next few units of every plant. */
export function workingCapital(s: GameState, snap: EconomySnapshot): number {
  let c = 0;
  for (const [id] of plantsOf(s)) {
    const st = snap.chain.plants[id];
    if (st && Object.keys(st.need).length) c += restockPlan(s, id, st.need, RESERVE_UNITS, true).cost;
  }
  return c;
}

/** The cheaper of a plant's speed and level upgrades. */
function cheapestUpgrade(b: Parameters<typeof speedCost>[0], gm: EconomySnapshot["gm"]): { cost: number; what: "speed" | "level" } | null {
  const sp = speedCost(b, gm);
  const lv = levelCost(b, gm);
  if (sp === null && lv === null) return null;
  return lv === null || (sp !== null && sp <= lv) ? { cost: sp!, what: "speed" } : { cost: lv, what: "level" };
}

/** How many minutes of income history the stall check looks back over. */
export const STALL_WINDOW_MIN = 20;

/** Income has grown less than 15% over the last 20 minutes of play. */
export function incomeStalled(s: GameState): boolean {
  // only this run: an expansion resets income on purpose
  const h = s.history.filter((p) => p.t >= s.runStartedAt);
  if (h.length < 2) return false;
  const last = h[h.length - 1];
  const past = [...h].reverse().find((p) => last.t - p.t >= STALL_WINDOW_MIN * 60_000);
  return !!past && past.income > 0 && last.income < past.income * 1.15;
}
