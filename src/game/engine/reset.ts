import { createExport, createFleet } from "./expansion";
import type { GameState } from "../types";
import { createChain } from "./chain";
import { createCity } from "./city";
import { resetDesignLevels } from "./design";
import { createLogistics } from "./logistics";
import { createStock } from "./stock";
import { createDealers, createStats, emptyCarCounts } from "./state";

/**
 * Clears the current run (the old Reset Imperium; collecting ⭐ Stars no longer
 * calls it, see imperium.ts): cash, plants, the map, dealers,
 * car models, ports and the fleet division. The racing team, managers
 * (unassigned), launched models, engineers and lifetime stats stay.
 */
export function resetRun(s: GameState, now: number) {
  s.cash = 0;
  s.dealers = createDealers();
  // the charging stations stood at the old dealers
  s.ev = { chargers: {} };
  s.carModels = emptyCarCounts();
  resetDesignLevels(s);
  s.logistics = createLogistics();
  s.city = { ...createCity(), carsServiced: s.city.carsServiced };
  s.chain = createChain();
  // the racing team stays (cars, reputation, trophies); what was on its way from the old plants is gone
  s.racing.orders = [];
  s.racing.arrivals = [];
  // the old transporters and showrooms are gone: cars on the road or on display are back at the lot
  for (const rc of s.racing.cars) {
    if (rc.location === "transit" || rc.location === "showroom") rc.location = "factory";
    delete rc.listing;
    delete rc.home;
  }
  s.run = createStats();
  s.runStartedAt = now;
  s.pendingOffline = null;
  s.unlocks = [];
  // new ports and a new division (the engineers and launched models stay)
  s.export = createExport();
  s.fleet = createFleet();
  s.proto.active = null;
  for (const m of Object.values(s.managers)) m.assignedTo = null;
  // a new company, with all its shares (the maintenance crew stays)
  s.stock = createStock();
}
