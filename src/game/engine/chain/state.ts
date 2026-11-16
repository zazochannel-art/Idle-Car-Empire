// The chain's state: a new chain, a new plant, an empty dealer.
import type { ChainState, DealerStock, GameState, PlantData } from "../../types";
import { createLedger } from "../ledger";
import { plantsOf } from "../plants";

// ───────────────────────────── state ─────────────────────────────

/** A new plant: no upgrades, an empty warehouse (materials are bought at the market). */
export function newPlant(): PlantData {
  return {
    workshop: { machines: 1, workers: 1 },
    speed: 0,
    automation: 0,
    fleet: 1,
    grade: 1,
    route: "use",
    progress: 0,
    // the warehouse starts empty: materials are bought at the market
    stock: {},
    stockCost: 0,
    stockCostBy: {},
    warehouse: 1,
    power: 0,
    inputs: {},
    out: 0,
    outValue: 0,
    car: null,
    wait: 0,
    made: 0,
    status: "ok",
  };
}

export function createChain(): ChainState {
  return { shipments: [], nextShip: 1, dealers: {}, rate: 0, firstCar: false, wholesale: 0, ledger: createLedger(), owed: 0 };
}

export function emptyDealerStock(): DealerStock {
  return { cars: 0, value: 0, models: [], next: 0, sold: 0 };
}


/** Plants are numbered per type in build order: Engine Factory #2… */
export function plantNumber(s: GameState, plotId: string): number {
  const b = s.city.buildings[plotId];
  if (!b) return 0;
  return plantsOf(s).filter(([, o]) => o.type === b.type).findIndex(([id]) => id === plotId) + 1;
}
