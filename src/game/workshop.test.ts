import { describe, expect, it } from "vitest";
import { STARTER_PLOT } from "./city/layout";
import { BODY_WORKSHOP } from "./config/chain";
import * as Ch from "./engine/chain";
import { snapshot } from "./engine/economy";
import { createInitialState } from "./engine/state";
import { decodeSave, encodeSave } from "./save/serialize";

const start = () => {
  const s = createInitialState(0);
  s.cash = 1e6;
  return s;
};

describe("Body Works shop floor", () => {
  it("starts with one machine and one operator, at the plant's base speed", () => {
    const s = start();
    const b = s.city.buildings[STARTER_PLOT];
    expect(b?.type).toBe("bodyWorks");
    expect(Ch.workshopOf(b!.plant!)).toEqual({ machines: 1, workers: 1 });
    expect(snapshot(s).chain.plants[STARTER_PLOT].workshopSpeed).toBe(1);
  });

  it("each machine adds its share, and its operator more; the cycle shrinks by exactly that", () => {
    const s = start();
    const before = snapshot(s).chain.plants[STARTER_PLOT];
    expect(Ch.buyBodyMachine(s, STARTER_PLOT)).toBe(true);
    const machine = snapshot(s).chain.plants[STARTER_PLOT];
    expect(machine.workshopSpeed).toBeCloseTo(1 + BODY_WORKSHOP.machine);
    expect(machine.cycle).toBeCloseTo(before.cycle / (1 + BODY_WORKSHOP.machine));
    expect(Ch.hireBodyWorker(s, STARTER_PLOT)).toBe(true);
    const staffed = snapshot(s).chain.plants[STARTER_PLOT];
    expect(staffed.workshopSpeed).toBeCloseTo(1 + BODY_WORKSHOP.machine + BODY_WORKSHOP.operator);
    // the breakdown the machine card shows adds up to the speed the engine uses
    const parts = Ch.workshopMachines(Ch.workshopOf(s.city.buildings[STARTER_PLOT]!.plant!));
    expect(1 + parts.reduce((a, m) => a + m.bonus, 0)).toBeCloseTo(staffed.workshopSpeed);
    expect(parts.map((m) => [m.installed, m.staffed])).toEqual([[true, true], [true, true], [false, false], [false, false], [false, false]]);
  });

  it("charges the shown price, never hires more operators than machines, and stops at the line's size", () => {
    const s = start();
    expect(Ch.bodyWorkerCost(s, STARTER_PLOT)).toBeNull();
    expect(Ch.hireBodyWorker(s, STARTER_PLOT)).toBe(false);
    for (let i = 1; i < BODY_WORKSHOP.max; i++) {
      const cost = Ch.bodyMachineCost(s, STARTER_PLOT)!;
      const cash = s.cash;
      expect(Ch.buyBodyMachine(s, STARTER_PLOT)).toBe(true);
      expect(cash - s.cash).toBe(cost);
    }
    expect(Ch.bodyMachineCost(s, STARTER_PLOT)).toBeNull();
    expect(Ch.buyBodyMachine(s, STARTER_PLOT)).toBe(false);
    while (Ch.bodyWorkerCost(s, STARTER_PLOT) !== null) {
      const cost = Ch.bodyWorkerCost(s, STARTER_PLOT)!;
      const cash = s.cash;
      expect(Ch.hireBodyWorker(s, STARTER_PLOT)).toBe(true);
      expect(cash - s.cash).toBe(cost);
    }
    expect(Ch.workshopOf(s.city.buildings[STARTER_PLOT]!.plant!)).toEqual({ machines: BODY_WORKSHOP.max, workers: BODY_WORKSHOP.max });
    expect(snapshot(s).chain.plants[STARTER_PLOT].workshopSpeed).toBeCloseTo(1 + (BODY_WORKSHOP.max - 1) * (BODY_WORKSHOP.machine + BODY_WORKSHOP.operator));
  });

  it("can't buy without the cash", () => {
    const s = start();
    s.cash = 10;
    expect(Ch.buyBodyMachine(s, STARTER_PLOT)).toBe(false);
    expect(Ch.workshopOf(s.city.buildings[STARTER_PLOT]!.plant!).machines).toBe(1);
  });

  it("keeps the machines and operators through a save, and repairs impossible values", () => {
    const s = start();
    Ch.buyBodyMachine(s, STARTER_PLOT);
    Ch.buyBodyMachine(s, STARTER_PLOT);
    Ch.hireBodyWorker(s, STARTER_PLOT);
    const back = decodeSave(encodeSave(s), 1);
    expect(back.city.buildings[STARTER_PLOT]?.plant?.workshop).toEqual({ machines: 3, workers: 2 });
    // more operators than machines, or out of range, from a hand-edited or corrupt save
    const raw = JSON.parse(JSON.stringify(s));
    raw.city.buildings[STARTER_PLOT].plant.workshop = { machines: 99, workers: 120 };
    const fixed = decodeSave(JSON.stringify(raw), 1);
    expect(fixed.city.buildings[STARTER_PLOT]?.plant?.workshop).toEqual({ machines: BODY_WORKSHOP.max, workers: BODY_WORKSHOP.max });
    raw.city.buildings[STARTER_PLOT].plant.workshop = { machines: 2, workers: 7 };
    expect(decodeSave(JSON.stringify(raw), 1).city.buildings[STARTER_PLOT]?.plant?.workshop).toEqual({ machines: 2, workers: 2 });
    // a save from before the shop floor: one machine, one operator
    delete raw.city.buildings[STARTER_PLOT].plant.workshop;
    expect(Ch.workshopOf(decodeSave(JSON.stringify(raw), 1).city.buildings[STARTER_PLOT]!.plant!)).toEqual({ machines: 1, workers: 1 });
  });

  it("only the Body Works has a shop floor that changes its speed", () => {
    expect(Ch.workshopSpeed("engineFactory", { machines: 5, workers: 5 })).toBe(1);
  });
});
