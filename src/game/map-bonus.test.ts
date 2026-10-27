import { describe, expect, it } from "vitest";
import { STARTER_PLOT, MARKET } from "./city/layout";
import { MAP_BONUS, MAP_BONUS_BY_KIND } from "./config/map-bonus";
import { chainTick } from "./engine/chain";
import { snapshot } from "./engine/economy";
import * as Mb from "./engine/map-bonus";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const T0 = Date.UTC(2026, 9, 24, 12);

/** A company that has built its first car (bonuses come from then on). */
function started() {
  const s = createInitialState(T0);
  s.chain.firstCar = true;
  return s;
}

/** A fixed sequence of "random" numbers, repeated. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("map bonuses", () => {
  it("come only after the first car, after the wait", () => {
    const s = createInitialState(T0);
    expect(Mb.mapBonusTick(s, 1000, T0)).toBeNull();
    expect(s.mapBonus.active).toBeNull();
    s.chain.firstCar = true;
    expect(Mb.mapBonusTick(s, MAP_BONUS.first - 1, T0, seq(0))).toBeNull();
    expect(Mb.mapBonusTick(s, 2, T0, seq(0))).toBe("spawned");
    expect(s.mapBonus.active?.kind).toBe("golden");
    expect(s.mapBonus.active?.id).toBe(1);
  });

  it("drops the drone's crate on one of the company's plants", () => {
    const s = started();
    // with no truck nor dealership: golden 4, drone 3 — a draw past 4/7 is the drone
    expect(Mb.mapBonusTick(s, MAP_BONUS.first, T0, seq(0.7, 0))).toBe("spawned");
    expect(s.mapBonus.active).toMatchObject({ kind: "drone", plot: STARTER_PLOT });
  });

  it("never sends a breakdown with no truck on the road, nor a VIP without a dealership", () => {
    for (let k = 0; k < 40; k++) {
      const s = started();
      expect(Mb.mapBonusTick(s, MAP_BONUS.first, T0, seq(k / 40, 0.5))).toBe("spawned");
      const kind = s.mapBonus.active!.kind;
      expect(kind === "breakdown" || kind === "vip").toBe(false);
    }
  });

  it("runs out after its stay, then the next one waits", () => {
    const s = started();
    Mb.mapBonusTick(s, MAP_BONUS.first, T0, seq(0));
    const stay = MAP_BONUS_BY_KIND.golden.stay;
    expect(Mb.mapBonusTick(s, stay - 1, T0)).toBeNull();
    expect(Mb.mapBonusTick(s, 2, T0, seq(0))).toBe("expired");
    expect(s.mapBonus.active).toBeNull();
    expect(s.mapBonus.wait).toBe(MAP_BONUS.gap[0]);
    // gone: it can't be taken any more
    expect(Mb.claimMapBonus(s, 1, T0)).toBeNull();
  });

  it("pays seconds of steady income once, never less than the floor", () => {
    const s = started();
    s.chain.steady = 1_000;
    Mb.mapBonusTick(s, MAP_BONUS.first, T0, seq(0));
    const cash = s.cash;
    expect(Mb.claimMapBonus(s, 2, T0)).toBeNull();
    expect(Mb.claimMapBonus(s, 1, T0)).toBe(1_000 * MAP_BONUS_BY_KIND.golden.incomeSeconds);
    expect(s.cash).toBe(cash + 1_000 * MAP_BONUS_BY_KIND.golden.incomeSeconds);
    expect(Mb.claimMapBonus(s, 1, T0)).toBeNull();
    expect(Mb.bonusesToday(s, T0)).toBe(1);
    s.chain.steady = 0;
    expect(Mb.mapBonusReward(s, "golden")).toBe(MAP_BONUS.minReward);
  });

  it("stops for the day after the daily number", () => {
    const s = started();
    for (let i = 0; i < MAP_BONUS.perDay; i++) {
      expect(Mb.mapBonusTick(s, MAP_BONUS.gap[1], T0, seq(0))).toBe("spawned");
      expect(Mb.claimMapBonus(s, s.mapBonus.active!.id, T0)).not.toBeNull();
    }
    expect(Mb.mapBonusTick(s, MAP_BONUS.gap[1], T0, seq(0))).toBeNull();
    // the next day they come again
    expect(Mb.mapBonusTick(s, MAP_BONUS.gap[1], T0 + 86_400_000, seq(0))).toBe("spawned");
  });

  it("a broken-down truck slows every delivery, but not the time away", () => {
    const s = started();
    s.chain.shipments.push({ id: 99, from: STARTER_PLOT, to: MARKET, item: "body", qty: 1, value: 10, t: 0, dur: 100, back: false, vehicle: "van" });
    const snap = snapshot(s).chain;
    chainTick(s, 10, snap, () => {});
    expect(s.chain.shipments.find((x) => x.id === 99)!.t).toBeCloseTo(10);
    s.mapBonus.active = { id: 1, kind: "breakdown", left: 60 };
    chainTick(s, 10, snap, () => {});
    expect(s.chain.shipments.find((x) => x.id === 99)!.t).toBeCloseTo(10 + 10 * MAP_BONUS.breakdownSlow);
    chainTick(s, 10, snap, () => {}, undefined, true);
    expect(s.chain.shipments.find((x) => x.id === 99)!.t).toBeCloseTo(20 + 10 * MAP_BONUS.breakdownSlow);
  });

  it("a reopened game finds no bonus waiting, and not at once", () => {
    const s = started();
    Mb.mapBonusTick(s, MAP_BONUS.first, T0, seq(0));
    s.mapBonus.wait = 1;
    s.mapBonus.taken = 3;
    s.mapBonus.day = "2026-10-24";
    const back = decodeSave(encodeSave(s), T0)!;
    expect(back.mapBonus.active).toBeNull();
    expect(back.mapBonus.wait).toBe(MAP_BONUS.first);
    expect(back.mapBonus.taken).toBe(3);
    expect(back.mapBonus.seq).toBe(1);
    // a save from before the bonuses gets the defaults
    expect(Mb.migrateMapBonus(Mb.createMapBonus())).toEqual(Mb.createMapBonus());
  });
});
