import { afterEach, describe, expect, it, vi } from "vitest";
import { buyProduct, IAP_IDS, iapConfigured, restorePurchases } from "./iap";

afterEach(() => vi.unstubAllEnvs());

describe("in-app purchases, off by default", () => {
  it("a build without product ids sells nothing", async () => {
    expect(IAP_IDS).toEqual({ starter: "", adFree: "" });
    expect(iapConfigured()).toBe(false);
    expect(await buyProduct("starter")).toBe("failed");
    expect(await restorePurchases()).toBe(0);
  });

  it("a product id Google Play wouldn't accept is ignored", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_IAP_STARTER_ID", "Starter Pack!");
    vi.stubEnv("NEXT_PUBLIC_IAP_ADFREE_ID", "ad_free.rewards");
    const m = await import("./iap");
    expect(m.IAP_IDS).toEqual({ starter: "", adFree: "ad_free.rewards" });
  });
});
