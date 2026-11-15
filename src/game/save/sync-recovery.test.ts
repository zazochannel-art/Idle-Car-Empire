// CloudSync when the network misbehaves: a save whose reply is lost, a cloud that can't be read, a
// phone that goes offline for a long time, and two devices. The server here applies the rules of
// save_game (supabase/migrations/0002): written only on top of the revision named.
import { describe, expect, it } from "vitest";
import { SAVE_VERSION, createInitialState } from "../engine/state";
import type { GameState } from "../types";
import { LocalStore, memoryStorage } from "./local";
import { decideStart } from "./policy";
import { CloudSync, sameSave, type SyncInfo } from "./sync";
import type { CloudBackend, CloudCopy } from "./types";

const T0 = Date.UTC(2026, 0, 1);
const game = (cash: number, at = T0): GameState => {
  const s = createInitialState(T0);
  s.cash = cash;
  s.lastActiveAt = at;
  return s;
};

class Cloud {
  row: { data: unknown; revision: number } | null = { data: null, revision: 1 };
  writes = 0;
  /** Replies to lose after the write (the server commits, the phone never hears). */
  loseReplies = 0;
  /** Requests that never reach the server. */
  dropRequests = 0;
  failLoads = 0;
  loads = 0;
  /** No connection: every request fails until it is set back. */
  down = false;
  readonly backend = {
    save: async (state: GameState, _v: number, base: number) => {
      if (this.down || this.dropRequests > 0) {
        if (!this.down) this.dropRequests--;
        throw new Error("network");
      }
      let res: { ok: boolean; revision: number; updatedAt: number };
      if (this.row && this.row.revision === base) {
        // the server adds the app version, and its jsonb doesn't keep the key order
        const data = JSON.parse(JSON.stringify({ appVersion: "9.9.9", ...state }));
        this.row = { data, revision: base + 1 };
        this.writes++;
        res = { ok: true, revision: base + 1, updatedAt: 1000 + base };
      } else res = { ok: false, revision: this.row?.revision ?? 0, updatedAt: 1000 };
      if (this.loseReplies > 0 && res.ok) {
        this.loseReplies--;
        throw new Error("timeout");
      }
      return res;
    },
    load: async (): Promise<CloudCopy> => {
      this.loads++;
      if (this.failLoads > 0) {
        this.failLoads--;
        throw new Error("network");
      }
      return { state: this.row?.data ?? null, version: SAVE_VERSION, revision: this.row?.revision ?? 0, updatedAt: 1000, serverNow: 2000 };
    },
  } as unknown as CloudBackend;
  /** Another device saves. */
  otherDevice(state: GameState) {
    this.row = { data: JSON.parse(JSON.stringify(state)), revision: (this.row?.revision ?? 0) + 1 };
  }
}

function setup(cloud: Cloud, revision = 1) {
  const infos: SyncInfo[] = [];
  const local = new LocalStore(memoryStorage());
  const sync = new CloudSync(cloud.backend, local, "u", revision, (i) => infos.push(i), { version: SAVE_VERSION, device: "t", retries: [1], interval: 0, debounce: 0, timeout: 50 });
  return { sync, infos, local, statuses: () => infos.map((i) => i.status).join(">") };
}
const settle = () => new Promise((r) => setTimeout(r, 40));

describe("a save whose reply is lost", () => {
  it("counts as saved: no conflict with its own save, and written once", async () => {
    const cloud = new Cloud();
    cloud.loseReplies = 1;
    const { sync, statuses, local } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush();
    await settle();
    expect(sync.state.status).toBe("saved");
    expect(sync.state.revision).toBe(2);
    expect(cloud.writes).toBe(1);
    expect(statuses()).not.toContain("conflict");
    // this device's copy matches the cloud: not unsaved, based on the cloud's revision
    expect(local.read("u")).toMatchObject({ dirty: false, base: 2 });
  });

  it("the game moved on meanwhile: the lost save counts, the newer state goes on top of it", async () => {
    const cloud = new Cloud();
    cloud.loseReplies = 1;
    const { sync } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush(); // lost reply
    sync.save(game(200), true); // the player kept playing before the retry
    await sync.flush();
    await settle();
    expect(sync.state.status).toBe("saved");
    expect(sync.state.revision).toBe(3);
    expect(cloud.writes).toBe(2);
    expect((cloud.row!.data as GameState).cash).toBe(200);
  });

  it("several replies lost in a row: still one conflict-free save", async () => {
    const cloud = new Cloud();
    cloud.loseReplies = 1;
    cloud.dropRequests = 0;
    const { sync } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush(); // lost; the retry is refused, recognised
    cloud.loseReplies = 0;
    await settle();
    expect(sync.state).toMatchObject({ status: "saved", revision: 2 });
    expect(cloud.writes).toBe(1);
  });

  it("another device saved after it landed: a real conflict", async () => {
    const cloud = new Cloud();
    cloud.loseReplies = 1;
    const { sync } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush(); // landed, reply lost
    cloud.otherDevice(game(500)); // the other device saved on top of it
    await settle();
    expect(sync.state.status).toBe("conflict");
  });

  it("the request never arrived and another device saved: a real conflict, nothing adopted", async () => {
    const cloud = new Cloud();
    cloud.dropRequests = 1;
    const { sync } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush(); // dropped
    cloud.otherDevice(game(500));
    await settle();
    expect(sync.state.status).toBe("conflict");
    expect(cloud.writes).toBe(0);
  });

  it("the cloud can't be read to tell: an error to retry, then saved", async () => {
    const cloud = new Cloud();
    cloud.loseReplies = 1;
    cloud.failLoads = 1;
    const { sync, statuses } = setup(cloud);
    sync.save(game(100), true);
    await sync.flush();
    await settle();
    await settle();
    expect(sync.state.status).toBe("saved");
    expect(statuses()).not.toContain("conflict");
    expect(cloud.writes).toBe(1);
  });
});

describe("offline for a long time, then back", () => {
  it("keeps only the latest state, sends it once, and saves it locally the whole time", async () => {
    const cloud = new Cloud();
    cloud.down = true;
    const { sync, local } = setup(cloud);
    for (let i = 1; i <= 5; i++) {
      sync.save(game(i * 10), true);
      await settle();
      // this device's copy is always the latest, unsaved
      expect(local.read("u")).toMatchObject({ dirty: true, base: 1 });
      expect((local.read("u")!.state as GameState).cash).toBe(i * 10);
    }
    cloud.down = false; // back online
    await settle();
    await settle();
    expect(sync.state.status).toBe("saved");
    expect(cloud.writes).toBe(1);
    expect((cloud.row!.data as GameState).cash).toBe(50);
  });

  it("another device moved on while this one was offline: a conflict, not an overwrite", async () => {
    const cloud = new Cloud();
    cloud.down = true;
    const { sync } = setup(cloud);
    sync.save(game(100), true);
    await settle();
    cloud.otherDevice(game(900));
    cloud.down = false;
    await settle();
    await settle();
    expect(sync.state.status).toBe("conflict");
    expect((cloud.row!.data as GameState).cash).toBe(900);
  });
});

describe("the app is killed during a sync", () => {
  it("the save had landed: the next start finds the same game on both sides and plays it without asking", () => {
    const state = game(100, T0 + 60_000);
    // this device's copy was written as unsaved just before the request; the cloud has the same state
    const own = { state, savedAt: T0 + 60_000, owner: "u", base: 1, dirty: true };
    const cloud: CloudCopy = { state: JSON.parse(JSON.stringify({ appVersion: "9.9.9", ...state })), version: SAVE_VERSION, revision: 2, updatedAt: 1000, serverNow: 2000 };
    const d = decideStart(own, null, cloud, SAVE_VERSION);
    expect(d.use).not.toBe("ask");
  });

  it("the save had not landed: this device's copy is uploaded on its base", () => {
    const own = { state: game(100, T0 + 60_000), savedAt: T0 + 60_000, owner: "u", base: 1, dirty: true };
    const cloud: CloudCopy = { state: game(50), version: SAVE_VERSION, revision: 1, updatedAt: 1000, serverNow: 2000 };
    expect(decideStart(own, null, cloud, SAVE_VERSION)).toMatchObject({ use: "local", upload: true, base: 1 });
  });
});

describe("sameSave", () => {
  it("ignores key order and the app version the backend adds, nothing else", () => {
    const s = game(100);
    const reordered = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(s))).reverse());
    expect(sameSave(s, { ...reordered, appVersion: "1.2.0" })).toBe(true);
    expect(sameSave(s, { ...reordered, cash: 101 })).toBe(false);
    expect(sameSave(s, null)).toBe(false);
    expect(sameSave(s, "x")).toBe(false);
  });
});
