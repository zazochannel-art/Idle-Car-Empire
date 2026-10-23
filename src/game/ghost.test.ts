import { describe, expect, it } from "vitest";
import { snapshot } from "./engine/economy";
import { DUEL, duel, duelBlock, duelsLeft, ghostOf, ghostRating, parseGhost, type Ghost } from "./engine/ghost";
import { receiveRaceCar } from "./engine/racing";
import { cloneState, createInitialState } from "./engine/state";
import type { GameState } from "./types";

const T0 = Date.UTC(2026, 9, 12, 12);
const DAY = 86_400_000;

function racer(): GameState {
  const s = createInitialState(T0);
  s.racing.unlocked = true;
  receiveRaceCar(s, "city");
  return s;
}

const ghost = (v: number, model: Ghost["model"] = "sports"): Ghost => ({
  model,
  color: "#ff0000",
  accent: "#000000",
  stats: { speed: v, accel: v, handling: v, braking: v, aero: v, reliability: v, hp: 300, weight: 1300 },
});

describe("ghosts", () => {
  it("publishes the best car at the track, unworn, and nothing without one", () => {
    const s = createInitialState(T0);
    expect(ghostOf(s)).toBeNull();
    s.racing.unlocked = true;
    const city = receiveRaceCar(s, "city");
    city.wear.engine = 0.2;
    const g = ghostOf(s)!;
    expect(g.model).toBe("city");
    for (const k of ["speed", "accel", "handling", "braking", "aero", "reliability"] as const) {
      expect(g.stats[k]).toBeGreaterThanOrEqual(0);
      expect(g.stats[k]).toBeLessThanOrEqual(100);
    }
    // wear doesn't show
    city.wear.engine = 1;
    expect(ghostOf(s)).toEqual(g);
    // a car still at the factory isn't raced
    const s2 = createInitialState(T0);
    s2.racing.unlocked = true;
    receiveRaceCar(s2, "sports", "factory");
    expect(ghostOf(s2)).toBeNull();
  });

  it("reads a ghost from the server only when valid, keeping numbers in range", () => {
    expect(parseGhost(null)).toBeNull();
    expect(parseGhost({ model: "tank", stats: {} })).toBeNull();
    const g = parseGhost({ model: "sports", color: "javascript:", accent: "#00ff00", stats: { speed: 900, accel: -5, handling: "x", braking: 50, aero: 20, reliability: 70, hp: 1e9, weight: 1 } })!;
    expect(g.model).toBe("sports");
    expect(g.color).toBe("#ffffff");
    expect(g.accent).toBe("#00ff00");
    expect(g.stats).toMatchObject({ speed: 100, accel: 0, handling: 0, braking: 50, hp: 5000, weight: 300 });
    expect(parseGhost(JSON.parse(JSON.stringify(ghost(60))))).toEqual(ghost(60));
  });
});

describe("duels", () => {
  it("needs racing and a car at the track", () => {
    const s = createInitialState(T0);
    expect(duelBlock(s, "rival", T0)).toBe("racing");
    s.racing.unlocked = true;
    expect(duelBlock(s, "rival", T0)).toBe("noCar");
    receiveRaceCar(s, "city");
    expect(duelBlock(s, "rival", T0)).toBeNull();
  });

  it("pays more for a win than a loss, once per rival a day, a few a day", () => {
    const s = racer();
    const snap = snapshot(s);
    const cash = s.cash;
    const rep = s.racing.rep;
    const lost = duel(s, "strong", ghost(100, "hypercar"), snap, T0)!;
    expect(lost.won).toBe(false);
    expect(s.cash).toBeCloseTo(cash + lost.money);
    expect(s.racing.rep).toBe(rep + DUEL.loss.rep);
    expect(duel(s, "strong", ghost(100), snap, T0)).toBeNull();
    expect(duelBlock(s, "strong", T0)).toBe("raced");
    const won = duel(s, "weak", ghost(1, "city"), snap, T0)!;
    expect(won.won).toBe(true);
    expect(won.money).toBeGreaterThan(lost.money);
    expect(won.mine).toHaveLength(DUEL.laps);
    expect(won.margin).toBeGreaterThan(0);
    for (let i = 0; i < DUEL.perDay - 2; i++) expect(duel(s, `r${i}`, ghost(50), snap, T0)).not.toBeNull();
    expect(duelsLeft(s, T0)).toBe(0);
    expect(duelBlock(s, "another", T0)).toBe("limit");
    // a new day
    expect(duelBlock(s, "strong", T0 + DAY)).toBeNull();
    expect(duelsLeft(s, T0 + DAY)).toBe(DUEL.perDay);
  });

  it("is the same race all day for the same pair (no rerolls)", () => {
    const s = racer();
    const snap = snapshot(s);
    const a = duel(cloneState(s), "rival", ghost(40), snap, T0)!;
    const b = duel(cloneState(s), "rival", ghost(40), snap, T0 + 3_600_000)!;
    expect(b.mine).toEqual(a.mine);
    expect(b.theirs).toEqual(a.theirs);
    expect(ghostRating(ghost(80))).toBeGreaterThan(ghostRating(ghost(40)));
  });
});
