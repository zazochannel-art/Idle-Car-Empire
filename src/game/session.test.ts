// The game's step while it is played (engine/session.ts): what the store runs every tick.
import { describe, expect, it } from "vitest";
import { CITY_RULES } from "./config/cities";
import { BUYABLE_TERRITORIES } from "./config/city";
import { snapshot } from "./engine/economy";
import { sessionTick, type News } from "./engine/session";
import { cloneState, createInitialState } from "./engine/state";
import type { GameState } from "./types";

const T0 = new Date(2026, 10, 7, 12).getTime();

function play(s: GameState, steps: number, dt = 0.1, at = T0) {
  const news: News[] = [];
  let state = s;
  let autoMoney = 0;
  for (let i = 1; i <= steps; i++) {
    const next = cloneState(state);
    const step = sessionTick(next, state, dt, at + i * dt * 1000, snapshot(state), { mapOnScreen: false, autoMoney });
    autoMoney = step.autoMoney;
    news.push(...step.news);
    state = next;
  }
  return { state, news };
}

describe("a step of the game being played", () => {
  it("runs the simulation and marks the time", () => {
    const s = createInitialState(T0);
    s.lastActiveAt = T0;
    const { state } = play(s, 50);
    expect(state.lastActiveAt).toBe(T0 + 5_000);
    expect(state.lifetime.playTime).toBeGreaterThan(0);
  });

  it("tells once that a new city can be opened", () => {
    const s = createInitialState(T0);
    s.lastActiveAt = T0;
    s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
    s.cash = CITY_RULES.unlockCash * 2;
    const { state, news } = play(s, 5);
    expect(news.filter((n) => n.kind === "cityReady")).toHaveLength(1);
    expect(state.unlocks).toContain("notice:city:north");
  });

  it("changes nothing in the state it was given (only the copy)", () => {
    const s = createInitialState(T0);
    s.lastActiveAt = T0;
    const before = JSON.stringify(s);
    const next = cloneState(s);
    sessionTick(next, s, 0.1, T0 + 100, snapshot(s), { mapOnScreen: true, autoMoney: 0 });
    expect(JSON.stringify(s)).toBe(before);
  });
});
