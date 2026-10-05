import type { GameEvent, GameState } from "../types";
import { chainTick } from "./chain";
import { cityTick } from "./city";
import { constructionTick } from "./construction";
import { snapshot, type EconomySnapshot } from "./economy";
import { book } from "./materials";
import { racingTick } from "./racing";
import { showroomTick } from "./showroom";
import { eventGoalTick } from "./events";

/** Adds money to the wallet and to the earnings stats. */
export function credit(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  s.run.moneyEarned += amount;
  s.lifetime.moneyEarned += amount;
}

/** Longest step simulated at once; longer gaps are split so trucks and stocks stay consistent. */
const MAX_STEP = 2;

/**
 * Advances the simulation by `dt` seconds: plants produce, trucks drive,
 * customers buy, garages service cars. Mutates `s` and returns what happened,
 * for the UI.
 */
export function tick(s: GameState, dt: number, snap?: EconomySnapshot): GameEvent[] {
  if (!(dt > 0)) return [];
  const eco = snap ?? snapshot(s);
  const events: GameEvent[] = [];
  const steps = Math.ceil(dt / MAX_STEP);
  for (let i = 0; i < steps; i++) chainTick(s, dt / steps, eco.chain, (amount) => credit(s, amount), events);

  cityTick(s, dt, eco.city, (amount) => {
    credit(s, amount);
    book(s, "services", amount);
  });

  // building sites and upgrades in progress
  constructionTick(s, dt, events);

  const race = racingTick(s, dt);
  if (race) events.push({ type: "raceFinished", race: race.id });
  showroomTick(s, dt, events);
  eventGoalTick(s, s.lastActiveAt);

  s.run.playTime += dt;
  s.lifetime.playTime += dt;
  if (eco.incomePerSec > s.run.highestIncome) s.run.highestIncome = eco.incomePerSec;
  if (eco.incomePerSec > s.lifetime.highestIncome) s.lifetime.highestIncome = eco.incomePerSec;
  return events;
}
