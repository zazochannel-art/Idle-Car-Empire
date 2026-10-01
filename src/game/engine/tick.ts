import { FACTORIES } from "../config/factories";
import type { CarId, GameEvent, GameState } from "../types";
import { snapshot, type EconomySnapshot } from "./economy";

/** Adds money to the wallet and to the earnings stats. */
export function credit(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  s.run.moneyEarned += amount;
  s.lifetime.moneyEarned += amount;
}

export function recordCars(s: GameState, car: CarId, count: number) {
  if (count <= 0) return;
  s.run.carsProduced += count;
  s.lifetime.carsProduced += count;
  s.run.carsByType[car] += count;
  s.lifetime.carsByType[car] += count;
}

/** Large batches use the expected number of premium sales instead of rolling each car. */
const ROLL_LIMIT = 50;

/**
 * Advances the simulation by `dt` seconds. Works for any dt: it counts whole
 * batches analytically, so a throttled background tab catches up correctly.
 * Mutates `s` and returns what happened, for the UI.
 */
export function tick(s: GameState, dt: number, rng: () => number = Math.random, snap?: EconomySnapshot): GameEvent[] {
  if (!(dt > 0)) return [];
  const eco = snap ?? snapshot(s);
  const events: GameEvent[] = [];

  for (const cfg of FACTORIES) {
    const f = s.factories[cfg.id];
    const st = eco.factories[cfg.id];
    if (!f.owned || !st) continue;
    if (!st.automated && !f.running) continue;

    const total = f.progress + dt / st.cycleTime;
    let batches = Math.floor(total);
    if (st.automated) {
      f.progress = total - batches;
    } else if (batches >= 1) {
      batches = 1;
      f.progress = 0;
      f.running = false;
    } else {
      f.progress = total;
    }
    if (batches <= 0) continue;

    const count = batches * st.carsPerCycle;
    let premium: number;
    if (count <= ROLL_LIMIT) {
      premium = 0;
      for (let i = 0; i < count; i++) if (rng() < st.premiumChance) premium++;
    } else {
      premium = count * st.premiumChance;
    }
    const amount = (count + premium) * st.valuePerCar * eco.dealers.multiplier;
    credit(s, amount);
    recordCars(s, st.car.id, count);
    f.produced += count;
    s.rp += count * st.car.rp * eco.gm.rp;
    events.push({ type: "sale", factory: cfg.id, car: st.car.id, count, amount, premium: premium >= 1 });
  }

  s.run.playTime += dt;
  s.lifetime.playTime += dt;
  if (eco.incomePerSec > s.run.highestIncome) s.run.highestIncome = eco.incomePerSec;
  if (eco.incomePerSec > s.lifetime.highestIncome) s.lifetime.highestIncome = eco.incomePerSec;
  return events;
}
