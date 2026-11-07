// The save format's versions: every format from the supply chain on has its step to the next,
// older economies start over, and a save from a newer game is never read (its new parts would
// be dropped and the loss saved).
import { describe, expect, it } from "vitest";
import { FIRST_CHAIN_SAVE, MAP_VERSION, SAVE_VERSION, createInitialState } from "../engine/state";
import { NewerSaveError, SAVE_STEPS, migrate, newerSave } from "./serialize";

const T0 = Date.UTC(2026, 10, 1);
const raw = (over: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify({ ...createInitialState(T0), cash: 5e12 })), ...over });

describe("save versions", () => {
  it("every format from the supply chain to this one has its step", () => {
    for (let v = FIRST_CHAIN_SAVE; v < SAVE_VERSION; v++) expect(typeof SAVE_STEPS[v], `step ${v}→${v + 1}`).toBe("function");
  });

  it("each older supply-chain format reads with its progress", () => {
    for (let v = FIRST_CHAIN_SAVE; v <= SAVE_VERSION; v++) {
      const s = migrate(raw({ version: v }), T0);
      expect(s.cash, `v${v}`).toBe(5e12);
      expect(s.version).toBe(SAVE_VERSION);
    }
  });

  it("a save from before the supply chain starts a new company", () => {
    expect(migrate(raw({ version: FIRST_CHAIN_SAVE - 1 }), T0).cash).not.toBe(5e12);
  });

  it("a newer format, world map or city is never read", () => {
    for (const over of [{ version: SAVE_VERSION + 1 }, { mapVersion: MAP_VERSION + 1 }, { activeCity: "a-city-to-come" }]) {
      expect(newerSave(raw(over))).toBe(true);
      expect(() => migrate(raw(over), T0)).toThrow(NewerSaveError);
    }
    // the cloud's own record of the format counts too
    expect(newerSave(raw(), SAVE_VERSION + 1)).toBe(true);
    expect(newerSave(raw())).toBe(false);
    // a save from before the cities has no activeCity: the first city's
    expect(newerSave(raw({ activeCity: undefined }))).toBe(false);
  });

  it("the steps never change the caller's save", () => {
    const r = raw({ version: FIRST_CHAIN_SAVE });
    migrate(r, T0);
    expect(r.version).toBe(FIRST_CHAIN_SAVE);
  });
});
