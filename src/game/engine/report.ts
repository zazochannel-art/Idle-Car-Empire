// The company's figures in one place: the Economy dashboard reads them from
// here, and every money figure comes from the ledger (the single source the
// HUD profit uses too) — no screen keeps a formula of its own.
import type { GameState } from "../types";
import { plantsOf } from "./chain";
import { debtLimit, inventoryValue, ledgerCosts, ledgerNet, ledgerRevenue } from "./materials";

export interface EconomyReport {
  cash: number;
  /** Operating revenue, costs and net per second (smoothed ledger rates). */
  revenuePerSec: number;
  costsPerSec: number;
  netPerSec: number;
  /** Net ÷ revenue (0 without revenue). */
  margin: number;
  /** This run's totals from the ledger. */
  runRevenue: number;
  runNet: number;
  carsProduced: number;
  carsSold: number;
  /** Finished cars not sold yet: at the plants' lots, on transporters to dealers and on dealers' lots. */
  carsInStorage: number;
  /** What the material in the warehouses cost, and what is paid for and on its way. */
  inventoryValue: number;
  inventoryIncoming: number;
  owed: number;
  debtLimit: number;
  suspended: boolean;
}

export function economyReport(s: GameState): EconomyReport {
  const L = s.chain.ledger;
  const revenue = ledgerRevenue(L.rate);
  const net = ledgerNet(L.rate);
  let stored = 0;
  let stock = 0;
  for (const [, b] of plantsOf(s)) {
    if (b.type === "assemblyPlant") stored += Math.floor(b.plant.out);
    stock += inventoryValue(b.plant);
  }
  for (const d of Object.values(s.chain.dealers)) stored += Math.floor(d?.cars ?? 0);
  // cars waiting at the port or at sea to an export market are not sold yet either
  for (const d of Object.values(s.export.dock)) stored += d?.cars.length ?? 0;
  for (const sh of s.export.ships) stored += sh.cars.length;
  let incoming = 0;
  for (const sh of s.chain.shipments) {
    if (sh.back) continue;
    if (sh.item === "car" && !sh.fleet) stored += sh.qty;
    else if (sh.item === "raw") incoming += sh.value;
  }
  return {
    cash: s.cash,
    revenuePerSec: revenue,
    costsPerSec: ledgerCosts(L.rate),
    netPerSec: net,
    margin: revenue > 0 ? net / revenue : 0,
    runRevenue: ledgerRevenue(L.run),
    runNet: ledgerNet(L.run),
    carsProduced: s.run.carsProduced,
    carsSold: s.run.carsSold,
    carsInStorage: stored,
    inventoryValue: stock,
    inventoryIncoming: incoming,
    owed: s.chain.owed,
    debtLimit: debtLimit(s),
    suspended: !!s.chain.suspended,
  };
}
