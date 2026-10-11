import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../engine/state";
import type { GameState } from "../types";
import { PREFER_CLOUD_KEY, SaveManager } from "./index";
import type { CloudAccount, SaveAdapter, SavePayload } from "./types";

const T0 = Date.UTC(2026, 0, 1);

/** A save that remembers what it was given. */
function memory(name: string, payload: SavePayload | null): SaveAdapter & { saved: SavePayload[] } {
  const saved: SavePayload[] = [];
  return {
    name,
    saved,
    load: async () => payload,
    save: async (p) => {
      saved.push(p);
    },
    clear: async () => {},
  };
}

function withCash(cash: number): GameState {
  const s = createInitialState(T0);
  s.cash = cash;
  return s;
}

const account: CloudAccount = {
  account: async () => ({ email: null }),
  linkEmail: async () => ({ ok: true }),
  signIn: async () => ({ ok: true }),
};

/** localStorage for the node test run. */
function fakeStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe("cloud saves", () => {
  it("loads the newer of this device's and the cloud's copies", async () => {
    const saves = new SaveManager({ local: memory("local", { state: withCash(10), savedAt: 2000 }), remote: memory("cloud", { state: withCash(20), savedAt: 1000 }) });
    expect((await saves.load(T0))?.cash).toBe(10);
  });

  it("after a sign-in link, takes the account's save even when this device's is newer, once", async () => {
    const store = fakeStorage();
    store.set(PREFER_CLOUD_KEY, "1");
    const saves = new SaveManager({ local: memory("local", { state: withCash(10), savedAt: 2000 }), remote: memory("cloud", { state: withCash(20), savedAt: 1000 }) });
    expect((await saves.load(T0))?.cash).toBe(20);
    expect(store.has(PREFER_CLOUD_KEY)).toBe(false);
    expect((await saves.load(T0))?.cash).toBe(10);
  });

  it("keeps the local copy when the account has no save yet", async () => {
    fakeStorage().set(PREFER_CLOUD_KEY, "1");
    const saves = new SaveManager({ local: memory("local", { state: withCash(10), savedAt: 2000 }), remote: memory("cloud", null) });
    expect((await saves.load(T0))?.cash).toBe(10);
  });

  it("offers the account only when the cloud backend has one", () => {
    expect(new SaveManager({ local: memory("local", null), remote: null }).cloud).toBeNull();
    expect(new SaveManager({ local: memory("local", null), remote: memory("cloud", null) }).cloud).toBeNull();
    expect(new SaveManager({ local: memory("local", null), remote: { ...memory("cloud", null), ...account } }).cloud).not.toBeNull();
  });

  it("mirrors a forced save to the cloud at once", async () => {
    const remote = memory("cloud", null);
    const saves = new SaveManager({ local: memory("local", null), remote });
    await saves.save(withCash(5), { force: true });
    expect(remote.saved.length).toBe(1);
  });
});
