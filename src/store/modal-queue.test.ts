import { describe, expect, it } from "vitest";
import { modalOnTop, otherModalWaiting, useModalQueue } from "./modal-queue";

describe("one popup at a time", () => {
  it("the time-away report first, then decisions, then rewards, then questions", () => {
    expect(modalOnTop([])).toBeNull();
    expect(modalOnTop(["unlock", "recall"])).toBe("recall");
    expect(modalOnTop(["login", "unlock", "offline"])).toBe("offline");
    expect(modalOnTop(["whatsNew", "login"])).toBe("login");
    expect(modalOnTop(["poach", "unlock"])).toBe("poach");
  });

  it("the company-name question waits while anything else is waiting", () => {
    useModalQueue.setState({ waiting: [] });
    expect(otherModalWaiting("companyName")).toBe(false);
    useModalQueue.setState({ waiting: ["unlock"] });
    expect(otherModalWaiting("companyName")).toBe(true);
    useModalQueue.setState({ waiting: [] });
  });
});
