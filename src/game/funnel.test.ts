import { afterEach, describe, expect, it, vi } from "vitest";
import { FUNNEL_LEGACY, FUNNEL_STEPS } from "./config/funnel";
import * as Ch from "./engine/chain";
import { funnelDue, funnelMinutes, migrateFunnel } from "./engine/funnel";
import { createInitialState } from "./engine/state";
import { browserOptOut, sendStep, trackGate } from "./save/funnel";
import { migrate } from "./save/serialize";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const T0 = at(2026, 9, 12);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("anonymous new-player funnel", () => {
  it("a new company reaches the steps in order, each one once", () => {
    const s = createInitialState(T0);
    expect(funnelDue(s, T0)).toEqual(["start"]);
    s.funnel.push("start");
    expect(funnelDue(s, T0)).toEqual([]);
    s.lifetime.parts.body = 3;
    s.city.buildings["x:engine"] = { type: "engineFactory", level: 1, plant: Ch.newPlant() };
    s.chain.firstCar = true;
    s.lifetime.playTime = 45 * 60;
    expect(funnelDue(s, T0)).toEqual(["firstBody", "engineFactory", "firstCar", "min30"]);
    expect(funnelMinutes(s)).toBe(45);
    // coming back on another day, then a week later
    expect(funnelDue(s, at(2026, 9, 13))).toContain("day1");
    expect(funnelDue(s, at(2026, 9, 13))).not.toContain("day7");
    expect(funnelDue(s, at(2026, 9, 19))).toContain("day7");
    // the list the server knows, in the same order
    expect(FUNNEL_STEPS[0]).toBe("gate");
  });

  it("a company from before the funnel is never counted; the list survives a save", () => {
    const s = createInitialState(T0);
    s.chain.firstCar = true;
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.funnel;
    const old = migrate(raw, T0);
    expect(old.funnel).toEqual([FUNNEL_LEGACY]);
    expect(funnelDue(old, T0)).toEqual([]);
    s.funnel = ["start", "firstCar"];
    expect(migrate(JSON.parse(JSON.stringify(s)), T0).funnel).toEqual(["start", "firstCar"]);
    expect(migrateFunnel(["start", "start", "nope", 3, "legacy"])).toEqual(["start", "legacy"]);
  });

  it("sends the step's name and minutes only, with the public key and no session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
    const calls: { url: string; init: RequestInit }[] = [];
    let answer: unknown = "ok";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    expect(await sendStep("firstCar", 12.7)).toBe(true);
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/rpc/track_step");
    expect(calls[0].init.headers).toEqual({ apikey: "sb_publishable_test", "Content-Type": "application/json" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_step: "firstCar", p_minutes: 12 });
    // a name the server doesn't know is not retried; a busy server is
    answer = "unknown";
    expect(await sendStep("start", 0)).toBe(true);
    answer = "busy";
    expect(await sendStep("start", 0)).toBe(false);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    expect(await sendStep("start", 0)).toBe(false);
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await sendStep("start", 0)).toBe(false);
    // no project configured: nothing is sent
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await sendStep("start", 0)).toBe(false);
  });

  it("counts the welcome page once per browser, and never when the browser asks not to be tracked", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    });
    let sent = 0;
    vi.stubGlobal("fetch", async () => {
      sent++;
      return new Response('"ok"', { status: 200 });
    });
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(browserOptOut()).toBe(true);
    trackGate();
    expect(sent).toBe(0);
    vi.stubGlobal("navigator", { doNotTrack: null, globalPrivacyControl: false });
    expect(browserOptOut()).toBe(false);
    // a game already saved in this browser: a player from before accounts, not a new visitor
    store.set("idle-car-empire:save:v1", "{}");
    trackGate();
    expect(sent).toBe(0);
    store.delete("idle-car-empire:save:v1");
    trackGate();
    trackGate();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toBe(1);
  });
});
