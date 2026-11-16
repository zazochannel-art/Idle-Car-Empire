import { describe, expect, it } from "vitest";
import { useGame } from "./game-store";
import { grantPurchase } from "@/game/engine/iap";

describe("starting over", () => {
  it("keeps the purchases: the store handing the starter pack back later finds it given already", async () => {
    const { state, snap } = useGame.getState();
    const next = structuredClone(state);
    expect(grantPurchase(next, "starter", "0123456789abcdef", snap)).toBe("granted");
    useGame.setState({ state: next });

    await useGame.getState().resetGame();

    const fresh = useGame.getState().state;
    expect(fresh.iap.owned).toContain("starter");
    expect(grantPurchase(fresh, "starter", "0123456789abcdef", useGame.getState().snap)).toBe("known");
  });
});
