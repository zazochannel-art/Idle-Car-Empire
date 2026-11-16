// Advancing the chain: production, trucks, the market, assembly, dealers and customers.
import type { BuildingState, CarId, ComponentId, DealerId, GameEvent, GameState, ItemId, MaterialStock, PlantData, PlantType, Shipment } from "../../types";
import { CAR_BY_ID } from "../../config/cars";
import { CAR_WAIT, HEADWAY, MAKER, MAX_WAIT, PARTS_DEMAND, PLANT_BY_ID, RATE_WINDOW, WHOLESALE } from "../../config/chain";
import { CLASS_DEMAND, CLASS_MARGIN, DEALER_FEE, DEBT, type MaterialId, RESCUE, SALES_TAX, TRIP_FEE } from "../../config/economy";
import { type ChainSnapshot, dealerMatches } from "./stats";
import { DEALER_SPECIALTY } from "../../config/dealerships";
import { DEPOT, MARKET, RACING } from "../../city/layout";
import type { ExportMarketId } from "../../config/expansion";
import { addStock, autoRestock, emergencyCost, emergencyMaterials, orderCost, shortfall, spendMaterials, unitMaterials, unitsInStock } from "../materials";
import { book, chainNet, debtLimit, payOrOwe, repay, settleLedger } from "../ledger";
import { carDemandMult, carPriceMult, defectRate, onCarBuilt, qualityOf, qualityTick } from "../market";
import { carStdCost, componentStdCost } from "../costs";
import { deliverySlowdown } from "../map-bonus";
import { destOf } from "./road";
import { dockCars, exportTick, fleetTick, isExportRoute, portPlot } from "../expansion";
import { emptyDealerStock } from "./state";
import { floorPace, floorTick } from "../floor";
import { incoming, legTime, ship } from "./travel";
import { landmarkSale, landmarkTick } from "../landmarks";
import { lineWaitsOnSupplier, orderParts, recipe } from "./cars";
import { logisticsMods } from "../logistics";
import { plantsOf } from "../plants";
import { receiveRaceCar } from "../racing";
import { vipBuilt } from "../live";

// ───────────────────────────── tick ─────────────────────────────

export interface ChainTickOut {
  earned: number;
  spent: number;
  components: number;
  cars: number;
  deliveries: number;
  rp: number;
  /** Cars sold wholesale (dealers were full). */
  wholesale: number;
  carsSold: number;
  /** Material units used. */
  materials: number;
}

/** Where a finished load from this plant should go now, or null to wait. */
function destination(s: GameState, snap: ChainSnapshot, id: string, b: BuildingState & { plant: PlantData }): { to: string; room: number; market?: ExportMarketId } | null {
  const cfg = PLANT_BY_ID[b.type as PlantType];
  // motorized chassis are sold at the market
  if (snap.plants[id]?.combine) return { to: MARKET, room: Infinity };
  if (!cfg.item) {
    // cars: by the plant's route: the dealer that pays most for this model (its speciality first),
    // the one that will sell it soonest, or a chosen dealer first; always one with room
    const car = snap.plants[id]?.car?.id;
    const route = b.plant.carRoute ?? "price";
    // overseas: to the port, while the market is open
    if (isExportRoute(route)) {
      const port = portPlot(s);
      const market = route.slice(7) as ExportMarketId;
      if (port && s.export.open.includes(market)) return { to: port, room: Infinity, market };
    }
    let best: { to: string; room: number; score: number } | null = null;
    for (const d of Object.values(snap.dealers)) {
      if (!d) continue;
      const to = `d:${d.id}`;
      const stock = s.chain.dealers[d.id]?.cars ?? 0;
      const queued = stock + incoming(s, to, "car");
      const room = d.stockCap - queued;
      if (room <= 0) continue;
      const match = !!car && dealerMatches(d.id, car);
      const markup = d.markup + (match ? DEALER_SPECIALTY.price : 0);
      // soonest sale: fewer cars ahead of it and quicker customers for this model
      const wait = ((queued + 1) * d.interval) / ((match ? DEALER_SPECIALTY.speed : 1) * (car ? CLASS_DEMAND[CAR_BY_ID[car].class] : 1));
      const score = route === "fast" ? -wait : route !== "price" && route === d.id ? 1e9 + markup : markup;
      if (!best || score > best.score) best = { to, room, score };
    }
    // every dealer is full: the cars wait in the plant's car storage
    return best;
  }
  // parts go to the assembly plant that needs them most; the rest is sold
  let best: { to: string; room: number } | null = null;
  for (const [id, other] of plantsOf(s)) {
    if (other.type !== "assemblyPlant") continue;
    const ost = snap.plants[id];
    if (!ost?.car || !recipe(ost.car).includes(cfg.item) || lineWaitsOnSupplier(s, id, other.plant)) continue;
    const room = ost.inCap - (other.plant.inputs[cfg.item] ?? 0) - incoming(s, id, cfg.item);
    if (room > 0 && (!best || room > best.room)) best = { to: id, room };
  }
  // before assembly: bodies go to engine factories that make motorized chassis
  if (!best && cfg.item === "body")
    for (const [id, other] of plantsOf(s)) {
      const ost = snap.plants[id];
      if (!ost?.combine) continue;
      const room = ost.inCap - (other.plant.inputs.body ?? 0) - incoming(s, id, "body");
      if (room > 0 && (!best || room > best.room)) best = { to: id, room };
    }
  return best ?? { to: MARKET, room: Infinity };
}

/**
 * Advances the chain by `dt` seconds. `speedMult` slows production (offline
 * efficiency); trucks always drive at full speed.
 */
export function chainTick(
  s: GameState,
  dt: number,
  snap: ChainSnapshot,
  credit: (amount: number) => void,
  events?: GameEvent[],
  offline = false,
): ChainTickOut {
  const out: ChainTickOut = { earned: 0, spent: 0, components: 0, cars: 0, deliveries: 0, rp: 0, wholesale: 0, carsSold: 0, materials: 0 };
  const lm = logisticsMods(s);
  s.market.t += dt;
  accountTick(s, dt, snap, events);
  rescue(s, events);
  qualityTick(s, dt);
  const earn = (amount: number) => {
    credit(amount);
    out.earned += amount;
  };

  // the plants with a manager (a lookup per plant below, not a search)
  const managedPlots = new Set<string>();
  for (const m of Object.values(s.managers)) if (m.hired && m.assignedTo) managedPlots.add(m.assignedTo);

  // the trucks each plant has on the road (counted once, then kept up as trucks leave)
  const busy = new Map<string, number>();
  // …and the plants a material order is bound for (it is the same walk over the trucks; the restock below asks about its own plant only)
  const inbound = new Set<string>();
  for (const sh of s.chain.shipments) {
    busy.set(sh.from, (busy.get(sh.from) ?? 0) + 1);
    if (!sh.back && sh.materials) inbound.add(sh.to);
  }
  const busyTrucks = (from: string) => busy.get(from) ?? 0;
  const plants = plantsOf(s);
  // each part maker's quality modes, in plant order (for the cars built in this step; looked up once)
  let modesByMaker: Map<PlantType, ReturnType<typeof qualityOf>[]> | null = null;
  const modesOf = (type: PlantType) => {
    if (!modesByMaker) {
      modesByMaker = new Map();
      for (const [, o] of plants) {
        const list = modesByMaker.get(o.type) ?? [];
        list.push(qualityOf(o.plant));
        modesByMaker.set(o.type, list);
      }
    }
    return modesByMaker.get(type) ?? [];
  };

  for (const [id, b] of plants) {
    const st = snap.plants[id];
    if (!st) continue;
    const cfg = PLANT_BY_ID[b.type];
    const p = b.plant;

    // 1. materials: restock automatically when the plant is set to (Wholesale supplier and up)
    if (cfg.item && p.autoBuy) autoRestock(s, id, st.unitsPerSec, inbound);

    // 1b. finished parts the company doesn't make yet come from an outside supplier:
    // ordered and paid up front, delivered by truck (see orderParts)
    if (!cfg.item && st.car) for (const c of recipe(st.car)) out.spent += orderParts(s, id, p, st, c);

    // 2. production
    const canMake = () => {
      let n = Math.min(st.lines, Math.floor(st.outCap - p.out));
      if (n <= 0) return { n: 0, why: "full" as const };
      if (cfg.item) {
        const inStock = unitsInStock(p, st.need);
        if (inStock.n < n) {
          n = inStock.n;
          if (n <= 0) p.short = inStock.short;
        }
        if (n > 0 && st.combine) {
          // a motorized chassis needs a body from the Body Works
          const bodies = Math.floor(p.inputs.body ?? 0);
          if (bodies < 1) {
            p.missing = "body";
            return { n: 0, why: "noParts" as const };
          }
          n = Math.min(n, bodies);
        }
        return { n, why: "noRaw" as const };
      }
      if (!st.car) return { n: 0, why: "noModel" as const };
      let missing: ComponentId | undefined;
      for (const c of recipe(st.car)) {
        const have = Math.floor(p.inputs[c] ?? 0);
        if (have < n) {
          n = have;
          if (have === 0 && !missing) missing = c;
        }
      }
      p.missing = missing;
      return { n, why: "noParts" as const };
    };
    let can = canMake();
    // the floor: a boost, a broken machine, the crew's morale
    const managed = managedPlots.has(id);
    if (floorTick(id, p, dt, { running: p.status === "ok", offline, managed, crew: s.maintenance?.level ?? 0 })) events?.push({ type: "breakdown", plot: id });
    const speed = (offline ? st.offline : 1) * floorPace(p);
    // running the plant costs wages, energy and maintenance for every second it works
    // (whatever pace the floor keeps)
    const runSpeed = offline ? st.offline : 1;
    const run = st.opPerSec * dt * runSpeed;
    if (can.n <= 0) {
      p.status = can.why;
    } else if (s.chain.suspended) {
      // over the account's limit: the plant stands still until sales have paid it down
      p.status = "suspended";
    } else {
      p.status = "ok";
      p.missing = undefined;
      p.short = undefined;
      payOrOwe(s, run);
      out.spent += run;
      const k = run / Math.max(1e-9, st.opPerSec * dt * runSpeed);
      book(s, "labor", st.op.labor * dt * runSpeed * k);
      book(s, "energy", st.op.energy * dt * runSpeed * k);
      book(s, "maintenance", st.op.maintenance * dt * runSpeed * k);
      p.progress += (dt * speed) / st.cycle;
      // the part plants' quality modes, for the cars built in this step (looked up once)
      let partModes: ReturnType<typeof qualityOf>[] | undefined;
      while (p.progress >= 1) {
        can = canMake();
        if (can.n <= 0) {
          p.status = can.why;
          p.progress = 0.999;
          break;
        }
        p.progress -= 1;
        const n = can.n;
        if (cfg.item) {
          out.materials += spendMaterials(s, p, st.need, n);
          if (st.combine) p.inputs.body = (p.inputs.body ?? 0) - n;
          p.out += n;
          p.outValue += n * st.unitValue;
          out.components += n;
          s.run.parts[cfg.item] += n;
          s.lifetime.parts[cfg.item] += n;
        } else if (st.car) {
          for (const c of recipe(st.car)) p.inputs[c] = (p.inputs[c] ?? 0) - n;
          p.out += n;
          p.outValue += n * st.unitValue;
          out.cars += n;
          s.run.carsProduced += n;
          s.lifetime.carsProduced += n;
          s.run.carsByType[st.car.id] += n;
          s.lifetime.carsByType[st.car.id] += n;
          const first = !s.chain.firstCar;
          s.chain.firstCar = true;
          // the first car opens the Local Dealer, so cars start selling right away
          if (first && !s.dealers.local.owned) {
            s.dealers.local.owned = true;
            s.chain.dealers.local = emptyDealerStock();
          }
          events?.push({ type: "carBuilt", plot: id, car: st.car.id, first });
          partModes ??= recipe(st.car).flatMap((c) => modesOf(MAKER[c]));
          for (let k = 0; k < n; k++) onCarBuilt(s, st.car.id, defectRate(s, p, partModes), qualityOf(p));
          vipBuilt(s, st.car.id, n, qualityOf(p));
        }
        p.made += n;
        out.rp += n * st.rp;
      }
    }

    // 3a. a car the company keeps (My Cars): before the Racing District it stays at the factory lot
    if (!cfg.item && st.car && p.out >= 1 && !s.racing.unlocked && s.racing.orders.includes(st.car.id)) {
      const value = p.outValue / p.out;
      s.racing.orders.splice(s.racing.orders.indexOf(st.car.id), 1);
      p.out -= 1;
      p.outValue -= value;
      receiveRaceCar(s, st.car.id, "factory").home = id;
    }
    // …with it, the car leaves for the paddock on its own transporter
    if (!cfg.item && st.car && p.out >= 1 && s.racing.unlocked && s.racing.orders.includes(st.car.id) && busyTrucks(id) < st.trucks) {
      const value = p.outValue / p.out;
      payOrOwe(s, TRIP_FEE.carrier);
      out.spent += TRIP_FEE.carrier;
      book(s, "logistics", TRIP_FEE.carrier);
      ship(s, { from: id, to: RACING, item: "car", qty: 1, value, dur: legTime(id, RACING, st.pace, st.load), vehicle: "carrier", models: [st.car.id] });
      busy.set(id, busyTrucks(id) + 1);
      s.racing.orders.splice(s.racing.orders.indexOf(st.car.id), 1);
      p.out -= 1;
      p.outValue -= value;
    }

    // 3. loading dock: send a truck when there is a full load (or it waited long enough)
    if (p.out >= 1 && busyTrucks(id) < st.trucks) {
      p.wait += dt;
      // finished cars leave for the dealers straight away (no waiting for a full load);
      // other goods wait for a full truck or MAX_WAIT
      // HEADWAY: the next truck waits a moment so two never leave nose to tail on top of each other
      // finished cars wait only a few seconds to fill the transporter
      const maxWait = cfg.item ? MAX_WAIT : CAR_WAIT;
      if (p.wait >= HEADWAY && (p.out >= st.capacity || p.wait >= maxWait * st.dock)) {
        const dest = destination(s, snap, id, b);
        if (dest) {
          const qty = Math.min(Math.floor(p.out), st.capacity, dest.room);
          // every trip costs fuel and a driver (on account when the cash is not there yet)
          const fee = TRIP_FEE[st.vehicle];
          if (qty >= 1) {
            payOrOwe(s, fee);
            out.spent += fee;
            book(s, "logistics", fee);
            const value = (p.outValue / p.out) * qty;
            const models = cfg.item ? undefined : (new Array(qty).fill(st.car?.id ?? "city") as CarId[]);
            ship(s, { from: id, to: dest.to, item: cfg.item ? (st.combine ? "chassis" : cfg.item) : "car", qty, value, dur: legTime(id, dest.to, st.pace, st.load), vehicle: st.vehicle, models, ...(dest.market ? { market: dest.market } : {}) });
            busy.set(id, busyTrucks(id) + 1);
            p.out -= qty;
            p.outValue -= value;
            p.wait = 0;
          }
        }
      }
    } else if (p.out < 1) {
      p.wait = 0;
    }
  }

  // 4. trucks on the road (slower while a truck is broken down on the map; never while away)
  const keep: Shipment[] = [];
  const pace = offline ? 1 : deliverySlowdown(s);
  for (const sh of s.chain.shipments) {
    sh.t += dt * pace;
    if (sh.t < sh.dur) {
      keep.push(sh);
      continue;
    }
    if (sh.back) continue; // home again
    out.wholesale += arrive(s, sh, snap, earn, events);
    if (sh.item !== "raw") {
      out.deliveries += sh.qty;
      s.run.deliveries += sh.qty;
      s.lifetime.deliveries += sh.qty;
    }
    // drive back empty (the leftover time counts on the way back)
    sh.back = true;
    sh.t = Math.min(sh.t - sh.dur, sh.dur);
    keep.push(sh);
  }
  s.chain.shipments = keep;

  // 4b. ships to the export markets, and the truck & bus division's line
  out.earned += exportTick(s, dt);
  // rent from leased minivans and rides of the robotaxi fleet (the landmark works)
  out.earned += landmarkTick(s, dt, credit);
  out.earned += fleetTick(s, dt, offline ? snap.plants[Object.keys(snap.plants)[0]]?.offline ?? 0.5 : 1);

  // 5. customers at the dealerships
  for (const d of Object.values(snap.dealers)) {
    if (!d) continue;
    const stock = (s.chain.dealers[d.id] ??= emptyDealerStock());
    // while away fewer customers come, as fewer cars are made: away earns the offline share of
    // play even when the dealers, not the plants, set the pace (else it paid as much as playing)
    stock.next -= offline ? dt * snap.offline : dt;
    while (stock.next <= 0) {
      if (stock.cars < 1) {
        stock.next = Math.max(stock.next, 0);
        break;
      }
      const each = stock.value / stock.cars;
      const model = stock.models.shift();
      const match = !!model && dealerMatches(d.id, model);
      // export (top transport tier) sells every car for more
      const price = each * (1 + d.markup + (match ? DEALER_SPECIALTY.price : 0)) * (1 + lm.cars) * carPriceMult(s, model);
      stock.cars -= 1;
      stock.value -= each;
      stock.sold += 1;
      s.run.carsSold += 1;
      s.lifetime.carsSold += 1;
      s.run.carRevenue += price;
      s.lifetime.carRevenue += price;
      earn(price);
      book(s, "carSales", price);
      // a minivan starts a lease, a shuttle joins the robotaxi fleet (the landmark works)
      landmarkSale(s, model, price);
      // the dealer keeps its fee and the state its tax
      const fee = price * DEALER_FEE;
      const tax = price * SALES_TAX;
      s.cash -= fee + tax;
      out.spent += fee + tax;
      book(s, "dealerFees", fee);
      book(s, "tax", tax);
      out.carsSold += 1;
      events?.push({ type: "sale", plot: `d:${d.id}`, item: "car", count: 1, amount: price - fee - tax });
      // the next customer: popular classes sell faster than exotic ones
      const demand = (model ? CLASS_DEMAND[CAR_BY_ID[model].class] : 1) * carDemandMult(s, model);
      stock.next += d.interval / ((match ? DEALER_SPECIALTY.speed : 1) * demand);
    }
  }

  s.rp += out.rp;
  // a share of every sale pays the account back, so it shrinks with each car or load sold
  if (s.chain.owed > 0) {
    const P = s.chain.ledger.pending;
    const proceeds = P.carSales + P.partSales - P.dealerFees - P.tax;
    if (proceeds > 0) repay(s, DEBT.share * proceeds);
  }
  // net income: revenue minus every cost (materials count when a plant uses them), plus what the
  // parts and cars made but not sold yet are worth at their cost (see goodsValue); an absence
  // keeps the rates of the session, so it is measured once when it ends (simulateChain)
  const goods = offline ? (s.chain.goods ?? 0) : goodsValue(s);
  const madeNotSold = offline ? 0 : goods - (s.chain.goods ?? goods);
  s.chain.goods = goods;
  const net = chainNet(s.chain.ledger.pending) + madeNotSold; // garages and racing are counted on their own
  s.chain.steady = (s.chain.steady ?? s.chain.rate) + (net / dt - (s.chain.steady ?? s.chain.rate)) * Math.min(1, dt / STEADY_WINDOW);
  // the same average without the boosts that only last a while: what rewards are sized on
  const base = net / dt / Math.max(1e-9, snap.tempIncome ?? 1);
  s.chain.steadyBase = (s.chain.steadyBase ?? s.chain.steady) + (base - (s.chain.steadyBase ?? s.chain.steady)) * Math.min(1, dt / STEADY_WINDOW);
  settleLedger(s, dt, RATE_WINDOW);
  s.chain.goodsRate = (s.chain.goodsRate ?? 0) + (madeNotSold / dt - (s.chain.goodsRate ?? 0)) * Math.min(1, dt / RATE_WINDOW);
  // the chain's income rate is read off the ledger (and the stock change), never smoothed on its own
  s.chain.rate = chainNet(s.chain.ledger.rate) + s.chain.goodsRate;
  s.chain.wholesale += (out.wholesale / dt - s.chain.wholesale) * Math.min(1, dt / 120);
  // the Parts Market forgets what it bought, over its window (more slowly while away, like the
  // dealers' customers: a full market pays the same whatever is sent, so it must not pay more then)
  if (s.chain.demand) {
    const k = Math.exp(-(offline ? dt * snap.offline : dt) / PARTS_DEMAND.window);
    for (const key of Object.keys(s.chain.demand) as ItemId[]) {
      const v = (s.chain.demand[key] ?? 0) * k;
      if (v < 0.01) delete s.chain.demand[key];
      else s.chain.demand[key] = v;
    }
  }
  return out;
}

/** Seconds the steady income averages over. */
const STEADY_WINDOW = 600;

/** Units of an item the Parts Market takes at full price per window: PARTS_DEMAND.depth per level of the plants making it (+1). */
export function partsDepth(s: GameState, item: ItemId): number {
  const maker = item === "chassis" ? "engineFactory" : item === "car" ? null : MAKER[item];
  let levels = 0;
  for (const [, b] of plantsOf(s)) if (b.type === maker) levels += b.level;
  return PARTS_DEMAND.depth * (1 + levels);
}

/**
 * What share of the price the Parts Market pays for `qty` more units of an
 * item now: 1 while recent sales stay within its depth, then depth ÷ volume
 * (at the middle of the load), never below PARTS_DEMAND.floor.
 */
export function partsPriceMult(s: GameState, item: ItemId, qty = 1): number {
  const v = (s.chain.demand?.[item] ?? 0) + qty / 2;
  const d = partsDepth(s, item);
  return v <= d ? 1 : Math.max(PARTS_DEMAND.floor, d / v);
}

// Standard costs never change (list prices, a Level 1 plant): worked out once each.
const CAR_COSTS = new Map<CarId, number>();
const PART_COSTS = new Map<string, number>();
function stdCarCost(id: CarId): number {
  let c = CAR_COSTS.get(id);
  if (c === undefined) CAR_COSTS.set(id, (c = carStdCost(CAR_BY_ID[id], recipe(CAR_BY_ID[id]))));
  return c;
}
function stdItemCost(item: ItemId, grade: number): number {
  if (item === "car") return 0;
  if (item === "chassis") return stdItemCost("body", grade) + stdItemCost("engine", grade);
  const key = `${item}:${grade}`;
  let c = PART_COSTS.get(key);
  if (c === undefined) PART_COSTS.set(key, (c = componentStdCost(item, grade)));
  return c;
}
/** The share of a car's sale value that is its cost: its class margin, the dealer's fee and the tax taken off. */
const carCostShare = (id: CarId | null | undefined) => (1 - DEALER_FEE - SALES_TAX) / (1 + CLASS_MARGIN[id ? CAR_BY_ID[id].class : "economy"]);

/**
 * What the parts and cars made but not sold yet cost to make (at standard
 * cost): at the plants, on the road, at the dealers and at the export port.
 * The ledger books materials and wages when a plant makes something and the
 * revenue when it sells, so while stock builds up it shows a loss that isn't
 * one: the profit shown adds the change of this value (the change in
 * inventories of an income statement). Materials in the warehouses aren't in
 * it — they are booked only when used.
 */
export function goodsValue(s: GameState): number {
  const grade: Partial<Record<ComponentId, number>> = {};
  const plants = plantsOf(s);
  for (const [, b] of plants) {
    const item = PLANT_BY_ID[b.type].item;
    if (item) grade[item] = Math.max(grade[item] ?? 1, b.plant.grade);
  }
  const gradeOf = (item: ItemId) => (item === "car" || item === "chassis" ? (grade.body ?? 1) : (grade[item] ?? 1));
  let v = 0;
  for (const [, b] of plants) {
    const p = b.plant;
    const item = PLANT_BY_ID[b.type].item;
    for (const [c, n] of Object.entries(p.inputs) as [ComponentId, number][]) if (n > 0) v += n * stdItemCost(c, gradeOf(c));
    if (p.out > 0) v += item ? p.out * stdItemCost(item, p.grade) : p.outValue * carCostShare(p.car);
  }
  for (const sh of s.chain.shipments) {
    if (sh.back || sh.fleet || sh.item === "raw") continue;
    if (sh.item !== "car") v += sh.qty * stdItemCost(sh.item, gradeOf(sh.item));
    else if (sh.models?.length) for (const m of sh.models) v += stdCarCost(m);
    else v += sh.value * carCostShare(null);
  }
  for (const d of Object.values(s.chain.dealers)) {
    if (!d) continue;
    for (const m of d.models) v += stdCarCost(m);
    // cars from older saves without their models: by their value
    const rest = Math.floor(d.cars) - d.models.length;
    if (rest > 0 && d.cars > 0) v += (d.value / d.cars) * rest * carCostShare(null);
  }
  for (const d of Object.values(s.export.dock)) if (d) for (const m of d.cars) v += stdCarCost(m);
  for (const sh of s.export.ships) for (const m of sh.cars) v += stdCarCost(m);
  return v;
}

/** Goods the company still has to sell: on the road, at a plant's dock, at a dealer or on a ship. */
function goodsInPipeline(s: GameState): boolean {
  if (s.chain.shipments.some((sh) => !sh.back && sh.item !== "raw" && sh.from !== DEPOT)) return true;
  if (Object.values(s.chain.dealers).some((d) => (d?.cars ?? 0) >= 1)) return true;
  if (plantsOf(s).some(([, b]) => b.plant.out >= 1)) return true;
  return s.export.ships.length > 0 || Object.values(s.export.dock).some((d) => (d?.cars.length ?? 0) > 0);
}

/**
 * The company's account (DEBT): its limit follows what the plants cost to
 * run; it is paid back from every sale (see the end of chainTick) and out of
 * profit (DEBT.repay of the average net income), and cash that covers it
 * twice over (or at all, while suspended) settles it. Over the limit nothing
 * more is bought on credit (canOwe) while the plants keep making what pays it
 * back; only past DEBT.halt × the limit is every plant suspended, until it is
 * paid down to DEBT.resume of that line — or until nothing is left to sell
 * (then only producing again can pay it back).
 */
function accountTick(s: GameState, dt: number, snap: ChainSnapshot, events?: GameEvent[]) {
  const C = s.chain;
  const run = Object.values(snap.plants).reduce((a, st) => a + st.opPerSec, 0);
  C.runCost = run;
  C.debtLimit = Math.max(DEBT.min, run * DEBT.seconds);
  if (C.owed > 0) {
    // cash that covers it settles it; otherwise it is paid out of profit
    if (s.cash >= 2 * C.owed || (C.suspended && s.cash >= C.owed)) repay(s, C.owed);
    else repay(s, DEBT.repay * Math.max(0, C.steady ?? C.rate) * dt);
  }
  const was = !!C.suspended;
  if (C.owed >= C.debtLimit * DEBT.halt) C.suspended = true;
  if (C.suspended && (C.owed <= C.debtLimit * DEBT.halt * DEBT.resume || !goodsInPipeline(s))) delete C.suspended;
  if (C.suspended && !was) events?.push({ type: "suspended" });
}

/**
 * The emergency supplier. A company that is completely stuck — no plant can
 * work, it can't afford one unit of material anywhere, and nothing is made,
 * on the road or at a dealer — gets material for a couple of units at the
 * emergency price (RESCUE.markup), on its account. Nothing is written off,
 * material never cash, at most once per cooldown: a way out that costs,
 * never a free supply.
 */
function rescue(s: GameState, events?: GameEvent[]) {
  if (s.chain.shipments.length) return;
  if (s.chain.rescueT !== undefined && s.market.t - s.chain.rescueT < RESCUE.cooldown) return;
  for (const d of Object.values(s.chain.dealers)) if ((d?.cars ?? 0) >= 1) return;
  const short: [string, MaterialStock][] = [];
  for (const [id, b] of plantsOf(s)) {
    const p = b.plant;
    if (p.out >= 1 || p.status === "ok") return;
    if (!PLANT_BY_ID[b.type as PlantType]?.item) continue;
    const need = unitMaterials(b.type as PlantType, p.grade);
    if (unitsInStock(p, need).n >= 1) return;
    const missing = shortfall(p, need, RESCUE.units);
    if ((Object.entries(shortfall(p, need, 1)) as [MaterialId, number][]).reduce((a, [m, n]) => a + orderCost(s, m, n), 0) <= s.cash) return;
    short.push([id, missing]);
  }
  if (!short.length) return;
  // on the company's account, within an emergency line of twice its limit: never an endless hole
  const deliver = () => {
    let cost = 0;
    for (const [id, missing] of short) {
      const c = emergencyCost(s, missing);
      if (s.chain.owed + Math.max(0, c - Math.max(0, s.cash)) > 2 * debtLimit(s)) continue;
      cost += emergencyMaterials(s, id, missing);
    }
    return cost;
  };
  let cost = deliver();
  // the last resort: stuck with the emergency line full too, the creditors cut the account back
  // to its limit and the company pays with its reputation (never more than once an hour)
  const R = RESCUE.restructure;
  if (cost <= 0 && s.chain.owed > debtLimit(s) && (s.chain.restructuredT === undefined || s.market.t - s.chain.restructuredT >= R.cooldown)) {
    const cut = s.chain.owed - debtLimit(s);
    s.chain.owed = debtLimit(s);
    s.chain.restructuredT = s.market.t;
    s.quality.rep = Math.max(0, s.quality.rep - R.rep);
    events?.push({ type: "restructured", amount: cut });
    cost = deliver();
  }
  if (cost <= 0) return;
  s.chain.rescueT = s.market.t;
  events?.push({ type: "emergency", cost });
}

/** Unloads a truck; returns how many cars it sold wholesale. */
function arrive(s: GameState, sh: Shipment, snap: ChainSnapshot, earn: (n: number) => void, events?: GameEvent[]): number {
  if (sh.fleet) {
    // a car of the collection unloaded at the paddock or back at its factory lot
    for (const id of sh.fleet) {
      const rc = s.racing.cars.find((c) => c.id === id);
      if (rc) rc.location = destOf(sh.to);
    }
    return 0;
  }
  if (sh.to === MARKET) {
    if (sh.item === "car") {
      // the dealers were full: a wholesale buyer takes the whole load, below dealer price
      // (older saves only: cars no longer go to the wholesale buyer)
      const amount = sh.value * WHOLESALE;
      earn(amount);
      book(s, "carSales", amount);
      s.run.carsSold += sh.qty;
      s.lifetime.carsSold += sh.qty;
      s.run.carRevenue += amount;
      s.lifetime.carRevenue += amount;
      events?.push({ type: "sale", plot: MARKET, item: "car", count: sh.qty, amount });
      return sh.qty;
    }
    // a port sells components for more abroad; the market's appetite is limited; tax is due on every sale
    const item = sh.item as ItemId;
    const amount = sh.value * (1 + logisticsMods(s).market) * partsPriceMult(s, item, sh.qty);
    const sold = (s.chain.demand ??= {});
    sold[item] = (sold[item] ?? 0) + sh.qty;
    earn(amount);
    book(s, "partSales", amount);
    const tax = amount * SALES_TAX;
    s.cash -= tax;
    book(s, "tax", tax);
    events?.push({ type: "sale", plot: MARKET, item: sh.item as ItemId, count: sh.qty, amount: amount - tax });
    return 0;
  }
  if (sh.to.startsWith("d:")) {
    const id = sh.to.slice(2) as DealerId;
    const stock = (s.chain.dealers[id] ??= emptyDealerStock());
    if (stock.cars < 1) stock.next = Math.max(stock.next, (snap.dealers[id]?.interval ?? 10) * 0.4);
    stock.cars += sh.qty;
    stock.value += sh.value;
    stock.models.push(...(sh.models ?? []));
    s.run.carsShipped = (s.run.carsShipped ?? 0) + sh.qty;
    s.lifetime.carsShipped = (s.lifetime.carsShipped ?? 0) + sh.qty;
    return 0;
  }
  if (sh.item === "car" && sh.market) {
    // at the port: onto the next ship to that market
    dockCars(s, sh.market, sh.models ?? [], sh.value);
    return 0;
  }
  if (sh.to === RACING) {
    // a car for the racing team: the paddock unloads it
    for (const m of sh.models ?? []) s.racing.arrivals.push(m);
    return 0;
  }
  const p = s.city.buildings[sh.to]?.plant;
  if (!p) return 0;
  if (sh.item === "raw") {
    // a materials delivery: into the warehouse, each material at what it cost
    addStock(p, sh.materials ?? {}, sh.value, sh.costs);
  }
  else if (sh.item !== "car" && sh.item !== "chassis") p.inputs[sh.item] = (p.inputs[sh.item] ?? 0) + sh.qty;
  return 0;
}
