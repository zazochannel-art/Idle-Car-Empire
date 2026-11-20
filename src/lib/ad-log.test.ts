import { describe, expect, it } from "vitest";
import { adLogLine, maskUnit } from "./ad-log";

describe("the ad log", () => {
  it("writes the event, the format, the unit's last digits only, the place and the time", () => {
    const line = adLogLine("AD_SHOW_REQUESTED", "rewarded", { unit: "ca-app-pub-1234567890123456/9876543210", place: "offline" }, Date.UTC(2026, 10, 19, 8, 0, 0));
    expect(line).toBe("AD_SHOW_REQUESTED format=rewarded unit=…3210 place=offline t=2026-11-19T08:00:00.000Z");
    expect(line).not.toContain("1234567890123456");
  });

  it("a failed request carries the SDK's code and message (quoted when it has spaces)", () => {
    const line = adLogLine("AD_FAILED_TO_LOAD", "interstitial", { code: 3, message: "No fill." }, 0);
    expect(line).toBe('AD_FAILED_TO_LOAD format=interstitial code=3 message="No fill." t=1970-01-01T00:00:00.000Z');
  });

  it("what decides whether ads may be requested at all has its own lines (the consent, the SDK)", () => {
    expect(adLogLine("CONSENT_INFO", "consent", { place: "start", note: "status=REQUIRED,canRequestAds=false" }, 0)).toBe(
      "CONSENT_INFO format=consent place=start note=status=REQUIRED,canRequestAds=false t=1970-01-01T00:00:00.000Z",
    );
    expect(adLogLine("SDK_INIT_FAILED", "sdk", { message: "no view" }, 0)).toBe('SDK_INIT_FAILED format=sdk message="no view" t=1970-01-01T00:00:00.000Z');
  });

  it("masks a unit to its last 4 characters", () => {
    expect(maskUnit("ca-app-pub-0000/5914852757")).toBe("…2757");
    expect(maskUnit("")).toBe("");
  });
});
