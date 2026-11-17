import { describe, expect, it } from "vitest";
import { WORLD_MAP } from "./city/layout";
import { CAR_BY_ID } from "./config/cars";
import { MAKER, PLANT_BY_ID } from "./config/chain";
import { COMPONENT_RECIPE, COMPONENT_TIME } from "./config/economy";
import { RESEARCH_BY_ID } from "./config/research";
import { plotUses } from "./engine/construction";

describe("the hydrogen line", () => {
  it("is researched after solid-state batteries: the works first, then the car", () => {
    expect(RESEARCH_BY_ID.fuel_cells.requires).toContain("solid_state");
    expect(RESEARCH_BY_ID.fuel_cells.effects).toContainEqual({ kind: "unlockPlant", plant: "hydrogenWorks" });
    expect(RESEARCH_BY_ID.hydrogen_cars.requires).toContain("fuel_cells");
    expect(RESEARCH_BY_ID.hydrogen_cars.effects).toContainEqual({ kind: "unlockCar", car: "hydrogen" });
  });

  it("makes fuel cells in the Hydrogen Works, out of materials the market sells", () => {
    expect(MAKER.fuelcell).toBe("hydrogenWorks");
    expect(PLANT_BY_ID.hydrogenWorks.requires).toBe("batteryFactory");
    expect(Object.keys(COMPONENT_RECIPE.fuelcell).length).toBeGreaterThan(0);
    expect(COMPONENT_TIME.fuelcell).toBeGreaterThan(0);
  });

  it("puts fuel cells, not batteries or software, in the Hydrogen Cruiser", () => {
    const car = CAR_BY_ID.hydrogen;
    expect(car.extras).toContain("fuelcell");
    expect(car.extras).not.toContain("battery");
    expect(car.requiresResearch).toBe("hydrogen_cars");
  });

  it("builds on the Battery Factory's plots, so no saved map changes", () => {
    const lot = WORLD_MAP.plots.find((p) => p.use === "batteryFactory");
    expect(lot).toBeTruthy();
    expect(plotUses(lot!.id)).toEqual(["batteryFactory", "hydrogenWorks"]);
  });
});
