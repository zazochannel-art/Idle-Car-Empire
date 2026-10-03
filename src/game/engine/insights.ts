// Read-only helpers that explain the game to the player: what to aim for next
// and why something is locked. They return data, not text — the UI words it
// in the player's language. Never mutate state.
import { CARS } from "../config/cars";
import { MAKER, PLANTS, PLANT_BY_ID } from "../config/chain";
import { DEALERS } from "../config/dealerships";
import { MANAGERS } from "../config/managers";
import { ZONE_BY_ID } from "../config/city";
import { WORLD_MAP, dealerPlot } from "../city/layout";
import type { CarId, ComponentId, DealerId, GameState, ManagerId, PlantType, ZoneId } from "../types";
import { canOpenDealers, isManagerUnlocked } from "./actions";
import { bestGrade, carLock, gradeCost, hasPlant, levelCost, plantBuildCost, plantLock, plantsOf, speedCost } from "./chain";
import { isPlotUnlocked, nextZone, zoneBlocker } from "./city";
import type { EconomySnapshot } from "./economy";
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
  | { kind: "plant"; icon: string; cost: number; plant: PlantType }
  | { kind: "upgrade"; icon: string; cost: number; plot: string; what: "speed" | "level" }
  /** cost/what: the cheapest upgrade on the maker plot, bought by tapping the goal. */
  | { kind: "shortage"; icon: string; plot: string; component: ComponentId; cost?: number; what?: "speed" | "level" }
  | { kind: "dealer"; icon: string; cost: number; dealer: DealerId }
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

  // An assembly line starved of parts is the most urgent thing on the map.
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
    if (freePlot(s)) goals.push({ kind: "plant", icon: next.emoji, cost: plantBuildCost(s, next.id), plant: next.id });
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
  let best: Extract<Goal, { kind: "upgrade" }> | null = null;
  for (const [id, b] of plantsOf(s)) {
    for (const what of ["speed", "level"] as const) {
      const cost = what === "speed" ? speedCost(b, gm) : levelCost(b, gm);
      if (cost !== null && (!best || cost < best.cost)) best = { kind: "upgrade", icon: what === "speed" ? "⚡" : "⬆️", cost, plot: id, what };
    }
  }
  const plantGoal = goals.find((g) => g.kind === "plant");
  if (best && best.cost <= s.cash && (!plantGoal || ("cost" in plantGoal && plantGoal.cost > s.cash * 3))) {
    const urgent = goals[0]?.kind === "shortage" || goals[0]?.kind === "dealer" ? 1 : 0;
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

  const nextManager = MANAGERS.find((m) => !s.managers[m.id].hired && isManagerUnlocked(s, m.id));
  if (nextManager) goals.push({ kind: "manager", icon: nextManager.avatar, cost: nextManager.cost, manager: nextManager.id });

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
