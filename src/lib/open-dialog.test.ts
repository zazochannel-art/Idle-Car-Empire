import { afterEach, describe, expect, it, vi } from "vitest";
import { modalOnScreen, openDialog } from "./open-dialog";

// A page whose querySelector answers for the selectors it knows.
function page(found: (selector: string) => boolean) {
  vi.stubGlobal("document", { querySelector: (sel: string) => (sel.split(",").some((s) => found(s.trim())) ? {} : null) });
}

afterEach(() => vi.unstubAllGlobals());

describe("a dialog on screen", () => {
  it("nothing open: no dialog, a full-screen ad may show", () => {
    page(() => false);
    expect(openDialog()).toBeNull();
    expect(modalOnScreen()).toBe(false);
  });

  it("a dialog (not one already closing) counts for Back and for the ads", () => {
    page((s) => s === '[role="dialog"]:not([data-state="closed"])');
    expect(openDialog()).not.toBeNull();
    expect(modalOnScreen()).toBe(true);
  });

  it("a card without a dialog role (the company name) holds the ads back, and Back keeps its old answer", () => {
    page((s) => s === "[data-modal]");
    expect(openDialog()).toBeNull();
    expect(modalOnScreen()).toBe(true);
  });

  it("outside a browser: nothing", () => {
    vi.stubGlobal("document", undefined);
    expect(openDialog()).toBeNull();
    expect(modalOnScreen()).toBe(false);
  });
});
