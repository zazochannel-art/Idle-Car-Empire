import { afterEach, describe, expect, it, vi } from "vitest";
import { createReporter, engineOf, MAX_PER_SESSION, placeOf, scrub } from "./errors";

afterEach(() => vi.unstubAllGlobals());

/** A reporter that collects what it would send. */
function collect(allowed: () => boolean | null = () => true, screen = "map") {
  const sent: { kind: string; message: string; place: string; platform: string; engine: string }[] = [];
  const r = createReporter({ allowed, screen: () => screen, send: async (x) => void sent.push(x) });
  return { sent, ...r };
}

const STACK = `TypeError: Cannot read properties of undefined (reading 'level')
    at upgradeCost (https://localhost/_next/static/chunks/0a1b2c3d.js:1:16728)
    at onClick (https://localhost/_next/static/chunks/0a1b2c3d.js:1:20301)
    at Object.Sb (https://localhost/_next/static/chunks/framework-9f.js:2:9988)
    at Tb (https://localhost/_next/static/chunks/framework-9f.js:2:10142)
    at Ub (https://localhost/_next/static/chunks/framework-9f.js:2:10199)`;

describe("error reports", () => {
  it("takes out what could name a player", () => {
    const s = scrub(
      "Sign-in failed for ana.pop+test@gmail.com at https://orffhhsogoymalyogfzl.supabase.co/auth/v1/token?x=1 " +
        "user 3f2b8c1e-1d2a-4b5c-9d8e-112233445566 token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_1 id 123456789",
    );
    expect(s).not.toMatch(/ana|gmail|orffhh|3f2b8c1e|eyJ|123456789/);
    expect(s).toContain("<email>");
    expect(s).toContain("<url>");
    expect(s).toContain("<id>");
    expect(s).toContain("<token>");
    expect(s).toContain("<n>");
    // short numbers (a level, a count) stay: they help to read the error
    expect(scrub("Level 12 of 15")).toBe("Level 12 of 15");
    expect(scrub("x".repeat(1000))).toHaveLength(300);
    expect(scrub("  many\n\n  lines\t here ")).toBe("many lines here");
  });

  it("keeps only the file names and positions of the top frames", () => {
    expect(placeOf(STACK)).toBe("upgradeCost 0a1b2c3d.js:1:16728 < onClick 0a1b2c3d.js:1:20301 < Object.Sb framework-9f.js:2:9988 < Tb framework-9f.js:2:10142");
    expect(placeOf(STACK)).not.toContain("localhost");
    // Safari's and Firefox's way of writing a stack
    expect(placeOf("buy@capacitor://localhost/_next/static/chunks/aa.js:3:44\n@capacitor://localhost/_next/static/chunks/bb.js:1:2")).toBe("buy aa.js:3:44 < bb.js:1:2");
    expect(placeOf(undefined)).toBe("");
    expect(placeOf("no frames here")).toBe("");
  });

  it("reads the system and web engine from the user agent", () => {
    expect(engineOf("Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36")).toBe(
      "Android 14 · Chrome 129",
    );
    expect(engineOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("iOS 17.5 · Safari 17.5");
    // the phone's model is not part of it
    expect(engineOf("Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36")).not.toContain("SM-A536B");
    expect(engineOf("")).toBe("");
  });

  it("sends each different error once, and only a few per session", () => {
    const { sent, report } = collect();
    const e = Object.assign(new TypeError("Cannot read properties of undefined (reading 'level')"), { stack: STACK });
    report(e, "error");
    report(e, "error");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "error", message: "TypeError: Cannot read properties of undefined (reading 'level')", platform: "web" });
    expect(sent[0].place).toMatch(/^\[map\] upgradeCost 0a1b2c3d\.js:1:16728/);
    for (let i = 0; i < 20; i++) report(new Error(`problem ${i}`), "rejection");
    expect(sent).toHaveLength(MAX_PER_SESSION);
  });

  it("names the screen it happened on", () => {
    const { sent, report } = collect(() => true, "research");
    report({ message: "boom" }, "screen");
    expect(sent[0]).toMatchObject({ kind: "screen", message: "boom" });
    // no stack (an error from outside the game's files): the screen alone
    expect(sent[0].place).toBe("[research]");
  });

  it("sends nothing when the player switched statistics off, or the browser asks not to be tracked", () => {
    const off = collect(() => false);
    off.report(new Error("boom"), "error");
    expect(off.sent).toHaveLength(0);

    vi.stubGlobal("navigator", { doNotTrack: "1", userAgent: "" });
    const dnt = collect(() => true);
    dnt.report(new Error("boom"), "error");
    expect(dnt.sent).toHaveLength(0);
  });

  it("holds errors from the start until the player's choice is known", () => {
    let choice: boolean | null = null;
    const a = collect(() => choice);
    a.report(new Error("at the start"), "error");
    expect(a.sent).toHaveLength(0);
    choice = true;
    a.flush();
    expect(a.sent.map((x) => x.message)).toEqual(["at the start"]);

    // the save says no: what was held is dropped, and never sent later
    choice = null;
    const b = collect(() => choice);
    b.report(new Error("at the start"), "error");
    choice = false;
    b.flush();
    choice = true;
    b.flush();
    expect(b.sent).toHaveLength(0);
  });

  it("leaves out errors that say nothing about the game", () => {
    const { sent, report } = collect();
    report(new Error("Script error."), "error");
    report(new Error("ResizeObserver loop completed with undelivered notifications."), "error");
    report(undefined, "rejection");
    report("", "rejection");
    expect(sent).toHaveLength(0);
    // a rejection with a plain value still says something
    report("network down", "rejection");
    expect(sent.map((x) => x.message)).toEqual(["network down"]);
  });
});
