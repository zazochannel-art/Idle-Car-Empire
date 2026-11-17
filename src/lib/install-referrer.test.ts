import { describe, expect, it } from "vitest";
import { referrerCode } from "./install-referrer";
import { shareUrl } from "./share-card";

describe("install referrer", () => {
  it("finds the friend's code in the referrer of a shared link", () => {
    const link = new URL(shareUrl("clip", "ab-23cd"));
    const referrer = link.searchParams.get("referrer")!;
    expect(referrer).toBe("utm_source=invite&utm_medium=clip&utm_campaign=player_share&utm_content=AB23CD");
    expect(referrerCode(referrer)).toBe("AB23CD");
  });

  it("ignores installs from anywhere else, and codes that can't be invite codes", () => {
    expect(referrerCode("")).toBeNull();
    expect(referrerCode("utm_source=google-play&utm_medium=organic")).toBeNull();
    expect(referrerCode("utm_source=invite&utm_medium=card")).toBeNull();
    expect(referrerCode("utm_source=invite&utm_content=AB10CD")).toBeNull();
    expect(referrerCode("utm_source=invite&utm_content=AB23CDE")).toBeNull();
  });

  it("leaves the code out of a link shared before the code is known", () => {
    expect(new URL(shareUrl("card")).searchParams.get("referrer")).not.toContain("utm_content");
  });
});
