import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefs = new Map<string, string>();
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
    keys: async () => ({ keys: [...prefs.keys()] }),
  },
}));

import { LocalStore, memoryStorage, setSaveMirror } from "@/game/save/local";
import { flushSaveMirror, restoreSaveMirror, startSaveMirror } from "./save-mirror";
import { createInitialState } from "@/game/engine/state";

describe("the app's copy of the saves", () => {
  beforeEach(async () => {
    await flushSaveMirror();
    prefs.clear();
    vi.useFakeTimers();
    startSaveMirror();
  });
  afterEach(() => {
    setSaveMirror(null);
    vi.useRealTimers();
  });

  it("copies a save after a while (or when the app leaves) and brings it back once the WebView lost it", async () => {
    const web = memoryStorage();
    const local = new LocalStore(web);
    local.write({ state: createInitialState(1), savedAt: 1, owner: "acc", base: 0, dirty: false });
    expect(prefs.size).toBe(0);
    await flushSaveMirror();
    expect([...prefs.keys()]).toEqual(["idle-car-empire:save:u:acc"]);

    const wiped = memoryStorage();
    expect(await restoreSaveMirror(wiped)).toBe(1);
    expect(new LocalStore(wiped).read("acc")?.savedAt).toBe(1);
  });

  it("never overwrites a save the WebView still has", async () => {
    const web = memoryStorage();
    new LocalStore(web).write({ state: createInitialState(1), savedAt: 1 });
    await flushSaveMirror();
    const newer = memoryStorage();
    new LocalStore(newer).write({ state: createInitialState(2), savedAt: 2 });
    expect(await restoreSaveMirror(newer)).toBe(0);
    expect(new LocalStore(newer).read(null)?.savedAt).toBe(2);
  });

  it("removes a removed save at once, and copies no backups", async () => {
    const local = new LocalStore(memoryStorage());
    local.write({ state: createInitialState(1), savedAt: 1, owner: "acc", base: 0, dirty: false });
    await flushSaveMirror();
    local.backup({ state: createInitialState(1), savedAt: 1 }, "device");
    local.remove("acc");
    await vi.advanceTimersByTimeAsync(0);
    expect([...prefs.keys()]).toEqual([]);
  });
});
