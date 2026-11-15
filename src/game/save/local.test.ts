// The device's saves: a damaged write falls back to the last good copy; removing a save removes that too.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../engine/state";
import { LASTGOOD_EVERY_MS, LocalStore, memoryStorage } from "./local";
import type { LocalCopy } from "./types";

const T0 = Date.UTC(2026, 0, 1);
const copy = (cash: number, at: number, extra: Partial<LocalCopy> = {}): LocalCopy => {
  const state = createInitialState(T0);
  state.cash = cash;
  return { state, savedAt: at, owner: "u1", base: 3, dirty: false, ...extra };
};
const KEY = "idle-car-empire:save:u:u1";

describe("LocalStore last good copy", () => {
  it("reads what was written", () => {
    const local = new LocalStore(memoryStorage());
    local.write(copy(10, T0));
    expect(local.read("u1")?.state.cash).toBe(10);
  });

  it("falls back to the last good copy when the save is cut short, and says it may hold unsaved progress", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + LASTGOOD_EVERY_MS + 1)); // the first one becomes the last good copy
    mem.setItem(KEY, mem.getItem(KEY)!.slice(0, 40)); // a crash cut the next write short
    const back = local.read("u1");
    expect(back?.state.cash).toBe(10);
    expect(back?.dirty).toBe(true);
    expect(back?.base).toBe(3);
    expect(back?.owner).toBe("u1");
  });

  it("keeps the last good copy for a while: a quick run of saves doesn't replace it", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + 5_000));
    local.write(copy(30, T0 + 10_000));
    mem.setItem(KEY, "{broken");
    // the copy kept when the second save replaced the first (cash 10) is still the one held
    expect(local.read("u1")?.state.cash).toBe(10);
    // once it is old enough, the next save moves it on to the one before it
    local.write(copy(30, T0 + 10_000));
    local.write(copy(40, T0 + LASTGOOD_EVERY_MS + 1));
    mem.setItem(KEY, "{broken");
    expect(local.read("u1")?.state.cash).toBe(30);
  });

  it("never lets a damaged save replace the last good copy", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + LASTGOOD_EVERY_MS + 1)); // last good: 10
    mem.setItem(KEY, "{broken");
    local.write(copy(30, T0 + 3 * LASTGOOD_EVERY_MS)); // a write over damage: the damaged copy isn't kept
    mem.setItem(KEY, "{broken again");
    expect(local.read("u1")?.state.cash).toBe(10);
  });

  it("a missing save is missing, not damage: nothing comes back from the last good copy", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + LASTGOOD_EVERY_MS + 1));
    mem.removeItem(KEY);
    expect(local.read("u1")).toBeNull();
  });

  it("damaged with no last good copy is treated as missing", () => {
    const mem = memoryStorage();
    mem.setItem(KEY, "{broken");
    expect(new LocalStore(mem).read("u1")).toBeNull();
  });

  it("a clock set back doesn't freeze the last good copy", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0 + 10 * LASTGOOD_EVERY_MS));
    local.write(copy(20, T0)); // the clock went back
    local.write(copy(30, T0 + 10)); // still going: the last good copy moves on, not frozen at the old time
    local.write(copy(40, T0 + 20));
    mem.setItem(KEY, "{broken");
    expect(local.read("u1")?.state.cash).toBe(20);
  });

  it("removing a save removes its last good copy (logout, deleted account)", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + LASTGOOD_EVERY_MS + 1));
    local.remove("u1");
    const keys = Array.from({ length: mem.length }, (_, i) => mem.key(i));
    expect(keys.filter((k) => k?.includes("u1"))).toEqual([]);
  });

  it("the last good copy is not an account, a save key, or a backup", () => {
    const mem = memoryStorage();
    const local = new LocalStore(mem);
    local.write(copy(10, T0));
    local.write(copy(20, T0 + LASTGOOD_EVERY_MS + 1));
    expect(local.owners()).toEqual(["u1"]);
    expect(local.backups()).toEqual([]);
  });
});
