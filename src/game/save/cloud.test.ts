// Cloud saves end to end against an in-memory server that applies the same
// rules as the database (supabase/migrations): one save per account, written
// only on top of the revision the client names, server timestamps.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_VERSION, createInitialState } from "../engine/state";
import type { GameState } from "../types";
import { SIGNED_OUT_KEY, SaveManager, type StartHooks } from "./index";
import { LocalStore, LOCAL_SAVE_KEY, memoryStorage, type KeyValue } from "./local";
import { decideStart, summarize, trustedLastActive } from "./policy";
import { CloudSync, type SyncInfo } from "./sync";
import { storedAccount } from "./supabase";
import type { Account, AuthResult, CloudBackend, CloudBackup, CloudCopy, LocalCopy, Profile } from "./types";

const T0 = Date.UTC(2026, 0, 1);

function game(cash: number, createdAt = T0): GameState {
  const s = createInitialState(createdAt);
  s.cash = cash;
  s.lastActiveAt = createdAt;
  return s;
}

// ───────────────────────── the in-memory server ─────────────────────────

class Server {
  rows = new Map<string, { data: unknown; version: number; revision: number; updatedAt: number }>();
  users = new Map<string, { email: string | null; password: string | null; pending?: string }>();
  profiles = new Map<string, Profile>();
  /** Older copies of each save, as migration 0011 keeps them (newest last). */
  backups: { id: number; user: string; data: unknown; version: number; reason: CloudBackup["reason"]; at: number }[] = [];
  clock = T0 + 1_000_000;
  next = 1;
  requests = 0;
}

class FakeCloud implements CloudBackend {
  user: string | null = null;
  fail = 0;
  /** No connection: nothing reaches the server (a session kept on the device still answers). */
  offline = false;
  /** The project confirms emails by link: a registration stays a guest with a pending email until then. */
  confirmByLink = false;
  /** A slow connection: the save arrives this many ms after it was asked for. */
  slowLoad = 0;
  constructor(public server: Server) {}

  private acc(id: string): Account {
    const u = this.server.users.get(id)!;
    return { id, email: u.email, guest: !u.email, pendingEmail: u.pending ?? null };
  }
  async session() {
    return this.user ? this.acc(this.user) : null;
  }
  async signInGuest() {
    if (this.offline) throw new Error("network");
    const id = `user-${this.server.next++}`;
    this.server.users.set(id, { email: null, password: null });
    this.server.profiles.set(id, { id, username: `Player-${id}`, avatar: "🧑‍🔧" });
    this.user = id;
    return this.acc(id);
  }
  async register(email: string, password: string): Promise<AuthResult> {
    if ([...this.server.users.values()].some((u) => u.email === email)) return { ok: false, error: "taken" };
    if (this.confirmByLink) {
      this.server.users.set(this.user!, { email: null, password: null, pending: email });
      return { ok: true, pending: true };
    }
    this.server.users.set(this.user!, { email, password });
    return { ok: true };
  }
  async login(email: string, password: string): Promise<AuthResult> {
    const hit = [...this.server.users.entries()].find(([, u]) => u.email === email && u.password === password);
    if (!hit) return { ok: false, error: "credentials" };
    this.user = hit[0];
    return { ok: true };
  }
  async setPassword(password: string): Promise<AuthResult> {
    this.server.users.get(this.user!)!.password = password;
    return { ok: true };
  }
  async logout() {
    this.user = null;
  }
  async deleteAccount(): Promise<AuthResult> {
    if (this.fail > 0) {
      this.fail--;
      return { ok: false, error: "network" };
    }
    const id = this.user!;
    this.server.users.delete(id);
    this.server.profiles.delete(id);
    this.server.rows.delete(id);
    this.user = null;
    return { ok: true };
  }
  async refreshAccount() {
    return this.session();
  }
  async profile() {
    return this.server.profiles.get(this.user!) ?? null;
  }
  async updateProfile(p: { username?: string; avatar?: string; listed?: boolean }): Promise<AuthResult> {
    if (p.username && [...this.server.profiles.values()].some((x) => x.id !== this.user && x.username.toLowerCase() === p.username!.toLowerCase())) return { ok: false, error: "taken" };
    this.server.profiles.set(this.user!, { ...this.server.profiles.get(this.user!)!, ...p });
    return { ok: true };
  }
  async load(): Promise<CloudCopy> {
    if (this.offline) throw new Error("network");
    if (this.slowLoad) await new Promise((r) => setTimeout(r, this.slowLoad));
    if (this.fail > 0) {
      this.fail--;
      throw new Error("network");
    }
    if (!this.user) throw new Error("not signed in");
    const row = this.server.rows.get(this.user);
    return row
      ? { state: JSON.parse(JSON.stringify(row.data)), version: row.version, revision: row.revision, updatedAt: row.updatedAt, serverNow: this.server.clock }
      : { state: null, version: 0, revision: 0, updatedAt: 0, serverNow: this.server.clock };
  }
  async save(state: GameState, version: number, base: number) {
    if (this.offline) throw new Error("network");
    this.server.requests++;
    if (this.fail > 0) {
      this.fail--;
      throw new Error("network");
    }
    if (!this.user) throw new Error("not signed in");
    this.server.clock += 1_000;
    const row = this.server.rows.get(this.user);
    const ok = base === 0 ? !row : !!row && row.revision === base && row.version <= version;
    if (!ok) return { ok: false, revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? 0 };
    const next = { data: JSON.parse(JSON.stringify(state)), version, revision: (row?.revision ?? 0) + 1, updatedAt: this.server.clock };
    if (row) this.keepOnWrite(row, next.data as GameState);
    this.server.rows.set(this.user, next);
    return { ok: true, revision: next.revision, updatedAt: next.updatedAt };
  }
  // the database's backup rules (0011): every 3 hours, before a save with less than half the progress
  private keepOnWrite(old: { data: unknown; version: number }, next: GameState) {
    const autos = this.server.backups.filter((b) => b.user === this.user && b.reason === "auto");
    const earned = (old.data as GameState).lifetime?.moneyEarned ?? 0;
    const reason = !autos.length || this.server.clock - autos.at(-1)!.at > 3 * 3_600_000 ? "auto" : earned > 0 && next.lifetime.moneyEarned < earned / 2 ? "drop" : null;
    if (reason) this.keep(old, reason);
  }
  private keep(old: { data: unknown; version: number }, reason: CloudBackup["reason"], spare?: number) {
    this.server.backups.push({ id: this.server.next++, user: this.user!, data: JSON.parse(JSON.stringify(old.data)), version: old.version, reason, at: this.server.clock });
    const mine = this.server.backups.filter((b) => b.user === this.user && b.id !== spare);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - 12)).map((b) => b.id));
    this.server.backups = this.server.backups.filter((b) => !drop.has(b.id));
  }
  async backups(): Promise<CloudBackup[]> {
    if (this.offline) throw new Error("network");
    return this.server.backups
      .filter((b) => b.user === this.user)
      .reverse()
      .map((b) => {
        const s = summarize(b.data);
        return { id: b.id, at: b.at, reason: b.reason, device: "test", version: b.version, company: s.company, cash: s.cash, earned: s.earned, cars: s.cars, plants: s.plants, lastPlayed: s.lastPlayed };
      });
  }
  async takeBackup(id: number) {
    if (this.offline) throw new Error("network");
    const b = this.server.backups.find((x) => x.id === id && x.user === this.user);
    if (!b) return null;
    const row = this.server.rows.get(this.user!);
    if (row) this.keep(row, "restore", id);
    return { state: JSON.parse(JSON.stringify(b.data)), version: b.version };
  }
}

/** A browser: its own storage and its own session on the shared server. */
function device(server: Server, storage: KeyValue = memoryStorage()) {
  const cloud = new FakeCloud(server);
  const infos: SyncInfo[] = [];
  const saves = new SaveManager({ backend: cloud, local: new LocalStore(storage), onSync: (i) => infos.push(i), device: "test" });
  return { cloud, saves, storage, infos };
}

const hooks = (over: Partial<StartHooks> = {}): StartHooks => ({
  choose: over.choose ?? (async () => "cloud"),
  // a start that shows the welcome page when the test expects none fails
  signIn:
    over.signIn ??
    (async () => {
      throw new Error("the welcome page was not expected");
    }),
});

let players = 0;
/** The welcome page as a new player fills it in: a name, an email and a password. */
function registers(d: { saves: SaveManager }, name = `Player${++players}`, email = `${name.toLowerCase()}@test.dev`): StartHooks {
  return hooks({
    signIn: async () => {
      expect(await d.saves.welcomeRegister(name, email, "secret1", "")).toMatchObject({ ok: true });
    },
  });
}

let flags: KeyValue;
beforeEach(() => {
  flags = memoryStorage();
  vi.stubGlobal("localStorage", flags);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ───────────────────────── which save to play ─────────────────────────

describe("choosing the save at the start", () => {
  const cloud = (cash: number, revision: number, createdAt = T0): CloudCopy => ({ state: game(cash, createdAt), version: SAVE_VERSION, revision, updatedAt: T0, serverNow: T0 });
  const copy = (cash: number, extra: Partial<LocalCopy> = {}): LocalCopy => ({ state: game(cash), savedAt: T0, ...extra });

  it("starts a new company when there is no save anywhere", () => {
    expect(decideStart(null, null, cloud(0, 0), SAVE_VERSION).use).toBe("new");
  });

  it("plays this device's copy when the cloud is where it left it, and uploads unsaved progress", () => {
    expect(decideStart(copy(50, { owner: "a", base: 4, dirty: true }), null, cloud(10, 4), SAVE_VERSION)).toMatchObject({ use: "local", upload: true, base: 4 });
    expect(decideStart(copy(50, { owner: "a", base: 4, dirty: false }), null, cloud(10, 4), SAVE_VERSION)).toMatchObject({ use: "local", upload: false });
  });

  it("takes the cloud when another device moved it on and this one has nothing new", () => {
    expect(decideStart(copy(50, { owner: "a", base: 3, dirty: false }), null, cloud(90, 5), SAVE_VERSION).use).toBe("cloud");
  });

  it("asks when both moved on, instead of overwriting either", () => {
    expect(decideStart(copy(50, { owner: "a", base: 3, dirty: true }), null, cloud(90, 5), SAVE_VERSION)).toMatchObject({ use: "ask", reason: "both-changed" });
  });

  it("moves a save from before accounts into an empty account", () => {
    expect(decideStart(null, copy(70), cloud(0, 0), SAVE_VERSION)).toMatchObject({ use: "local", upload: true, base: 0 });
  });

  it("continues the same company from whichever copy was played last, and asks for a different game", () => {
    const old = copy(70);
    old.state.lastActiveAt = T0 + 5_000;
    const c = cloud(20, 2);
    (c.state as GameState).lastActiveAt = T0 + 1_000;
    expect(decideStart(null, old, c, SAVE_VERSION)).toMatchObject({ use: "local", base: 2 });
    (c.state as GameState).lastActiveAt = T0 + 9_000;
    expect(decideStart(null, old, c, SAVE_VERSION).use).toBe("cloud");
    expect(decideStart(null, old, cloud(20, 2, T0 + 777), SAVE_VERSION)).toMatchObject({ use: "ask", reason: "different-games" });
  });

  it("plays this device's copy offline, and refuses a save from a newer game version", () => {
    expect(decideStart(copy(50, { owner: "a", base: 3 }), null, null, SAVE_VERSION)).toMatchObject({ use: "local", base: 3 });
    expect(decideStart(null, null, { ...cloud(1, 3), version: SAVE_VERSION + 1 }, SAVE_VERSION).use).toBe("outdated");
  });

  it("counts time away on the server's clock", () => {
    const c: CloudCopy = { state: null, version: SAVE_VERSION, revision: 2, updatedAt: 1_000_000, serverNow: 1_000_000 + 3_600_000 };
    // the device claims 10 hours away; the server saw 1 hour
    const now = T0 + 36_000_000;
    expect(trustedLastActive(T0, c, now)).toBe(now - 3_600_000);
    // less time than the server saw: the device's own figure stands
    expect(trustedLastActive(now - 60_000, c, now)).toBe(now - 60_000);
    expect(summarize(game(123)).cash).toBe(123);
  });
});

// ───────────────────────── saving while playing ─────────────────────────

describe("saving while playing", () => {
  function syncFor(server: Server, base = 0) {
    const cloud = new FakeCloud(server);
    cloud.user = "user-a";
    server.users.set("user-a", { email: null, password: null });
    const local = new LocalStore(memoryStorage());
    const infos: SyncInfo[] = [];
    const sync = new CloudSync(cloud, local, "user-a", base, (i) => infos.push(i), { version: SAVE_VERSION, device: "pc", interval: 30_000, debounce: 2_000 });
    return { cloud, local, sync, infos };
  }

  it("groups saves: one request per interval, a few seconds after an important action", async () => {
    const server = new Server();
    const { sync, local } = syncFor(server);
    sync.save(game(1), true);
    sync.save(game(2));
    sync.save(game(3));
    expect(local.read("user-a")).toMatchObject({ dirty: true });
    await vi.advanceTimersByTimeAsync(2_100);
    expect(server.requests).toBe(1);
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(3);
    for (let i = 4; i < 20; i++) sync.save(game(i));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(server.requests).toBe(2);
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(19);
    expect(local.read("user-a")).toMatchObject({ dirty: false, base: 2 });
  });

  it("never lets an older save land after a newer one", async () => {
    const server = new Server();
    const { sync } = syncFor(server);
    sync.save(game(1), true);
    await vi.advanceTimersByTimeAsync(2_100);
    sync.save(game(2));
    const first = sync.flush();
    sync.save(game(3));
    void sync.flush();
    await first;
    await vi.advanceTimersByTimeAsync(31_000);
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(3);
    expect(sync.state.revision).toBe(server.rows.get("user-a")!.revision);
  });

  it("retries after a network failure, then catches up", async () => {
    const server = new Server();
    const { sync, cloud, infos } = syncFor(server);
    cloud.fail = 2;
    sync.save(game(5), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(infos.at(-1)!.status).toBe("error");
    await vi.advanceTimersByTimeAsync(5_100);
    expect(infos.at(-1)!.status).toBe("error");
    await vi.advanceTimersByTimeAsync(15_100);
    expect(infos.at(-1)!.status).toBe("saved");
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(5);
  });

  it("stops at a conflict, and the player's choice decides (the other copy kept as a backup)", async () => {
    const server = new Server();
    server.rows.set("user-a", { data: game(10), version: SAVE_VERSION, revision: 1, updatedAt: T0 });
    const { sync, local, infos } = syncFor(server, 1);
    // another device saves meanwhile
    server.rows.set("user-a", { data: game(77), version: SAVE_VERSION, revision: 2, updatedAt: T0 + 1 });
    sync.save(game(20), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(infos.at(-1)!.status).toBe("conflict");
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(77);
    // no more cloud saves until it is resolved
    sync.save(game(21), true);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(server.rows.get("user-a")!.revision).toBe(2);

    const kept = await sync.resolve("local");
    expect(kept).toBeNull();
    expect((server.rows.get("user-a")!.data as GameState).cash).toBe(21);
    expect(local.backupKeys().length).toBe(1);

    server.rows.set("user-a", { data: game(500), version: SAVE_VERSION, revision: 9, updatedAt: T0 + 2 });
    sync.save(game(22), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(infos.at(-1)!.status).toBe("conflict");
    const taken = await sync.resolve("cloud");
    expect((taken!.cloud.state as GameState).cash).toBe(500);
    expect(local.backupKeys().length).toBe(2);
  });
});

// ───────────────────────── the welcome page ─────────────────────────

describe("the welcome page before the game", () => {
  it("a new player creates an account (name, email, password) and the game starts with it", async () => {
    const server = new Server();
    const alice = device(server);
    await alice.saves.start(T0, registers(alice, "Alice"));

    const pc = device(server);
    const signIn = vi.fn(async (returning: boolean, guestGame: boolean) => {
      expect([returning, guestGame]).toEqual([false, false]);
      // a name that is taken: nothing else happens, and the next try goes on with the same account
      expect(await pc.saves.welcomeRegister("alice", "b@test.dev", "secret1", "")).toMatchObject({ ok: false, error: "taken", field: "name" });
      const first = pc.cloud.user;
      expect(await pc.saves.welcomeRegister("Bob", "b@test.dev", "secret1", "")).toEqual({ ok: true });
      expect(pc.cloud.user).toBe(first);
    });
    const res = await pc.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(res.mode).toBe("cloud");
    expect(pc.saves.account).toMatchObject({ guest: false, email: "b@test.dev" });
    expect(server.profiles.get(pc.cloud.user!)?.username).toBe("Bob");
    expect(server.users.size).toBe(2); // Alice and Bob: no stray account

    // the next visit on this device goes straight into the game (hooks() fails on a welcome page)
    pc.saves.save(game(7), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const again = device(server, pc.storage);
    again.cloud.user = pc.cloud.user;
    expect((await again.saves.start(T0 + 60_000, hooks())).state?.cash).toBe(7);
  });

  it("signing in on the welcome page plays the account's game (and makes no guest account)", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc, "Ann", "a@test.dev"));
    pc.saves.save(game(321), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const phone = device(server);
    const signIn = vi.fn(async () => {
      expect(await phone.saves.welcomeLogin("a@test.dev", "wrong")).toMatchObject({ ok: false, error: "credentials" });
      expect(await phone.saves.welcomeLogin("a@test.dev", "secret1")).toEqual({ ok: true });
    });
    const res = await phone.saves.start(T0 + 60_000, hooks({ signIn }));
    expect(res.state?.cash).toBe(321);
    expect(phone.cloud.user).toBe(pc.cloud.user);
    expect(server.users.size).toBe(1);
  });

  it("nobody plays without an account: the welcome page stays until there is one", async () => {
    const server = new Server();
    const phone = device(server);
    phone.cloud.offline = true;
    const signIn = vi.fn(async () => {
      if (signIn.mock.calls.length === 1) {
        // no connection: the account can't be made (the page says so and stays)
        expect(await phone.saves.welcomeRegister("Dan", "d@test.dev", "secret1", "")).toEqual({ ok: false, error: "network" });
        return; // the page never lets a failed attempt in: neither does the start
      }
      phone.cloud.offline = false;
      expect(await phone.saves.welcomeRegister("Dan", "d@test.dev", "secret1", "")).toEqual({ ok: true });
    });
    const res = await phone.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(res.mode).toBe("cloud");
    expect(phone.saves.account).toMatchObject({ guest: false, email: "d@test.dev" });
    expect(server.users.size).toBe(1);
  });

  it("a registration whose email is still to be confirmed plays, and goes straight in next time", async () => {
    const server = new Server();
    const pc = device(server);
    pc.cloud.confirmByLink = true;
    const signIn = vi.fn(async () => {
      expect(await pc.saves.welcomeRegister("Ivy", "i@test.dev", "secret1", "")).toEqual({ ok: true, pending: true });
    });
    expect((await pc.saves.start(T0, hooks({ signIn }))).mode).toBe("cloud");
    expect(pc.saves.account).toMatchObject({ guest: true, pendingEmail: "i@test.dev" });
    pc.saves.save(game(3), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const again = device(server, pc.storage);
    again.cloud.user = pc.cloud.user;
    expect((await again.saves.start(T0 + 60_000, hooks())).state?.cash).toBe(3);
  });

  it("a guest from before (who played without an account) creates one and keeps its game", async () => {
    const server = new Server();
    const pc = device(server);
    // the game used to let players in as guests: an anonymous account with a game
    await pc.cloud.signInGuest();
    const id = pc.cloud.user!;
    server.rows.set(id, { data: game(5), version: SAVE_VERSION, revision: 1, updatedAt: T0 });
    pc.saves.local.write({ state: game(5), savedAt: T0, owner: id, base: 1, dirty: false });

    const signIn = vi.fn(async (returning: boolean, guestGame: boolean) => {
      expect([returning, guestGame]).toEqual([false, true]);
      expect(await pc.saves.welcomeRegister("Gus", "g@test.dev", "secret1", "")).toEqual({ ok: true });
    });
    const res = await pc.saves.start(T0 + 60_000, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(res.state?.cash).toBe(5);
    // the same account, now with an email and a password
    expect(pc.saves.account).toMatchObject({ id, guest: false, email: "g@test.dev" });
    expect(server.users.size).toBe(1);
  });

  it("a guest from before who signs in to another account: its game stays on this device as a backup", async () => {
    const server = new Server();
    const other = device(server);
    await other.saves.start(T0, registers(other, "Hal", "h@test.dev"));
    other.saves.save(game(900), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const pc = device(server);
    await pc.cloud.signInGuest();
    pc.saves.local.write({ state: game(5), savedAt: T0, owner: pc.cloud.user!, base: 0, dirty: true });
    const signIn = vi.fn(async () => {
      expect(await pc.saves.welcomeLogin("h@test.dev", "secret1")).toEqual({ ok: true });
    });
    const res = await pc.saves.start(T0 + 60_000, hooks({ signIn }));
    expect(res.state?.cash).toBe(900);
    expect(pc.saves.backups().map((b) => b.summary.cash)).toEqual([5]);
  });

  it("a signed-in player who starts without a connection plays their own copy, uploaded once back online", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(10), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const id = pc.cloud.user!;

    // offline: the session kept on the device still says who plays (supabase.ts storedAccount)
    const plane = device(server, pc.storage);
    plane.cloud.user = id;
    plane.cloud.offline = true;
    expect(await plane.saves.start(T0 + 3_600_000, hooks())).toMatchObject({ state: { cash: 10 }, mode: "cloud" });
    plane.saves.save(game(15), true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(plane.saves.local.read(id)).toMatchObject({ state: { cash: 15 }, dirty: true });

    plane.cloud.offline = false;
    plane.saves.sync?.retryNow();
    await vi.advanceTimersByTimeAsync(3_000);
    expect((server.rows.get(id)!.data as GameState).cash).toBe(15);
  });

  it("without a session but with an account's copy here, the welcome page asks to sign in again", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc, "Eve", "e@test.dev"));
    pc.saves.save(game(10), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const lost = device(server, pc.storage); // the session is gone (not a logout)
    const signIn = vi.fn(async () => {
      expect(await lost.saves.welcomeLogin("e@test.dev", "secret1")).toEqual({ ok: true });
    });
    expect((await lost.saves.start(T0 + 60_000, hooks({ signIn }))).state?.cash).toBe(10);
    expect(signIn).toHaveBeenCalledOnce();
  });
});

// ───────────────────────── players and devices ─────────────────────────

describe("players and devices", () => {
  it("player A: registers, plays, closes, returns, and continues on another device", async () => {
    const server = new Server();
    const pc = device(server);
    const a = await pc.saves.start(T0, registers(pc, "Ann", "a@test.dev"));
    expect(a.state).toBeNull();
    expect(pc.saves.account).toMatchObject({ guest: false, email: "a@test.dev" });
    pc.saves.save(game(1_000), true);
    await vi.advanceTimersByTimeAsync(2_100);

    // closes and returns on the same device
    const again = device(server, pc.storage);
    again.cloud.user = pc.cloud.user;
    const back = await again.saves.start(T0 + 60_000, hooks());
    expect(back.state?.cash).toBe(1_000);

    // another device: signs in to A and gets the same progress
    const phone = device(server);
    expect(await phone.cloud.login("a@test.dev", "secret1")).toEqual({ ok: true });
    const onPhone = await phone.saves.start(T0 + 120_000, hooks());
    expect(onPhone.state?.cash).toBe(1_000);
  });

  it("player B: a separate account starts empty and can't reach A's save", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(1_000), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const aId = pc.cloud.user!;

    const other = device(server);
    const b = await other.saves.start(T0, registers(other));
    expect(b.state).toBeNull();
    expect(other.cloud.user).not.toBe(aId);
    other.saves.save(game(5), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(aId)!.data as GameState).cash).toBe(1_000);
    expect((server.rows.get(other.cloud.user!)!.data as GameState).cash).toBe(5);
    // B can't take A's name either
    await pc.saves.updateProfile({ username: "Alice" });
    expect(await other.saves.updateProfile({ username: "alice" })).toMatchObject({ ok: false, error: "taken" });
  });

  it("an existing player's save from before accounts moves into the account (and stays as a backup)", async () => {
    const server = new Server();
    const storage = memoryStorage();
    storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ state: game(4_242), savedAt: T0 }));
    const pc = device(server, storage);
    const start = await pc.saves.start(T0 + 1_000, registers(pc));
    expect(start.state?.cash).toBe(4_242);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(pc.cloud.user!)!.data as GameState).cash).toBe(4_242);
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
    expect(pc.saves.local.backupKeys().length).toBe(1);
  });

  it("asks before replacing an account's save with a different game from this device", async () => {
    const server = new Server();
    const first = device(server);
    await first.saves.start(T0, registers(first));
    first.saves.save(game(900, T0), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const storage = memoryStorage();
    storage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ state: game(33, T0 + 5), savedAt: T0 }));
    const second = device(server, storage);
    second.cloud.user = first.cloud.user;
    const choose = vi.fn(async () => "cloud" as const);
    const res = await second.saves.start(T0 + 10_000, hooks({ choose }));
    expect(choose).toHaveBeenCalledOnce();
    expect(res.state?.cash).toBe(900);
    // the device's game is kept as a backup, the cloud untouched
    expect(second.saves.local.backupKeys().length).toBe(1);
    expect((server.rows.get(first.cloud.user!)!.data as GameState).cash).toBe(900);

    // the player changes their mind: the backup is played again, the game it replaces becomes a backup
    await vi.advanceTimersByTimeAsync(5_000);
    const [kept] = second.saves.backups();
    expect(kept.summary.cash).toBe(33);
    const now = T0 + 99_000;
    const restored = second.saves.restoreBackup(kept.key, res.state!, now)!;
    expect(restored.cash).toBe(33);
    expect(restored.lastActiveAt).toBe(now); // no offline earnings for the time it spent as a backup
    expect(second.saves.backups().map((b) => b.summary.cash)).toEqual([900, 33]);
    second.saves.save(restored, true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(first.cloud.user!)!.data as GameState).cash).toBe(33);
    expect(second.saves.restoreBackup("idle-car-empire:backup:0:gone", restored, now)).toBeNull();
  });

  it("the server keeps older copies of a player's save; a backup plays again, and what it replaces is kept", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    const early = game(1_000);
    early.lifetime.moneyEarned = 5_000;
    pc.saves.save(early, true);
    await vi.advanceTimersByTimeAsync(2_100);
    const later = game(80_000);
    later.lifetime.moneyEarned = 90_000;
    pc.saves.save(later, true);
    await vi.advanceTimersByTimeAsync(2_100);
    // the first write's copy became the first backup
    const list = (await pc.saves.cloudBackups())!;
    expect(list.map((b) => [b.reason, b.cash, b.earned])).toEqual([["auto", 1_000, 5_000]]);

    // played again: the cloud save it replaces is kept there, the game here kept on this device
    const now = T0 + 500_000;
    const restored = await pc.saves.restoreCloudBackup(list[0].id, later, now);
    if (!restored || restored === "newer") throw new Error("not restored");
    expect(restored.cash).toBe(1_000);
    expect(restored.lastActiveAt).toBe(now); // no offline earnings for the time it spent as a backup
    expect(pc.saves.backups().map((b) => [b.reason, b.summary.cash])).toEqual([["replaced", 80_000]]);
    expect((await pc.saves.cloudBackups())!.map((b) => [b.reason, b.cash])).toEqual([
      ["restore", 80_000],
      ["auto", 1_000],
    ]);
    pc.saves.save(restored, true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(pc.cloud.user!)!.data as GameState).cash).toBe(1_000);
    // a save that lost most of the progress keeps the one it replaced too
    const lost = game(10);
    pc.saves.save(lost, true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((await pc.saves.cloudBackups())![0]).toMatchObject({ reason: "drop", cash: 1_000 });
  });

  it("a player sees and restores only their own cloud backups", async () => {
    const server = new Server();
    const a = device(server);
    await a.saves.start(T0, registers(a));
    a.saves.save(game(1_000), true);
    await vi.advanceTimersByTimeAsync(2_100);
    a.saves.save(game(2_000), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const [mine] = (await a.saves.cloudBackups())!;

    const b = device(server);
    await b.saves.start(T0, registers(b));
    b.saves.save(game(5), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(await b.saves.cloudBackups()).toEqual([]);
    expect(await b.saves.restoreCloudBackup(mine.id, game(5), T0)).toBeNull();
    expect(await b.cloud.takeBackup(mine.id)).toBeNull();
    expect((server.rows.get(a.cloud.user!)!.data as GameState).cash).toBe(2_000);
  });

  it("a cloud backup from a newer version of the game is not played here", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(1_000), true);
    await vi.advanceTimersByTimeAsync(2_100);
    server.backups.push({ id: 999, user: pc.cloud.user!, data: game(7), version: SAVE_VERSION + 1, reason: "auto", at: server.clock });
    expect(await pc.saves.restoreCloudBackup(999, game(1_000), T0)).toBe("newer");
    expect(server.backups.filter((x) => x.reason === "restore")).toEqual([]);
    expect(await pc.saves.restoreCloudBackup(12345, game(1_000), T0)).toBeNull();
  });

  it("after a logout the next start waits for a sign-in, and this device forgets the account's copy", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc, "Lou", "l@test.dev"));
    pc.saves.save(game(10), true);
    const id = pc.cloud.user!;
    await pc.saves.logout();
    expect(server.rows.get(id)).toBeDefined();
    expect(flags.getItem(SIGNED_OUT_KEY)).toBe("1");
    expect(pc.saves.local.read(id)).toBeNull();
    // the page's last saves while it unloads write nothing: not this account's copy, not a device save
    pc.saves.save(game(11), true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pc.saves.local.read(id)).toBeNull();
    expect(pc.storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
    expect((server.rows.get(id)!.data as GameState).cash).toBe(10);

    const next = device(server, pc.storage);
    const signIn = vi.fn(async (returning: boolean) => {
      expect(returning).toBe(true); // the welcome page, opened on "sign in"
      expect(await next.saves.welcomeLogin("l@test.dev", "secret1")).toEqual({ ok: true });
    });
    const back = await next.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(next.cloud.user).toBe(id);
    expect(back.state?.cash).toBe(10);
    expect(flags.getItem(SIGNED_OUT_KEY)).toBeNull();
  });

  it("deleting the account removes it from the server and this device, and saves nothing after", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(10), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const id = pc.cloud.user!;
    expect(server.rows.get(id)).toBeDefined();

    // the server can't be reached: nothing changes, the game goes on saving
    pc.cloud.fail = 1;
    expect(await pc.saves.deleteAccount()).toEqual({ ok: false, error: "network" });
    pc.saves.save(game(12), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(id)!.data as GameState).cash).toBe(12);

    expect(await pc.saves.deleteAccount()).toEqual({ ok: true });
    expect(server.users.has(id)).toBe(false);
    expect(server.rows.has(id)).toBe(false);
    expect(server.profiles.has(id)).toBe(false);
    expect(pc.saves.local.read(id)).toBeNull();
    expect(flags.getItem(SIGNED_OUT_KEY)).toBe("1");
    // the page's last saves while it reloads write nothing anywhere
    pc.saves.save(game(13), true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(server.rows.size).toBe(0);
    expect(pc.saves.local.read(id)).toBeNull();
    expect(pc.storage.getItem(LOCAL_SAVE_KEY)).toBeNull();

    // the next start is a new player's, with a new account
    const next = device(server, pc.storage);
    const signIn = vi.fn(async () => {
      expect(await next.saves.welcomeRegister("Newcomer", "n@test.dev", "secret1", "")).toEqual({ ok: true });
    });
    await next.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(next.cloud.user).not.toBe(id);
  });

  it("plays this device's copy when the cloud can't be reached, and repairs a damaged cloud save", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(64), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const offline = device(server, pc.storage);
    offline.cloud.user = pc.cloud.user;
    offline.cloud.fail = 1;
    expect((await offline.saves.start(T0, hooks())).state?.cash).toBe(64);

    // the cloud's row is damaged: this device's copy takes over and is uploaded
    const row = server.rows.get(pc.cloud.user!)!;
    server.rows.set(pc.cloud.user!, { ...row, revision: row.revision + 1, data: "garbage" });
    const repair = device(server, pc.storage);
    repair.cloud.user = pc.cloud.user;
    expect((await repair.saves.start(T0, hooks())).state?.cash).toBe(64);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(pc.cloud.user!)!.data as GameState).cash).toBe(64);
  });
});

describe("a slow connection at the start", () => {
  it("plays this device's copy after a short wait, and a newer cloud save still asks at the first save", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(64), true);
    await vi.advanceTimersByTimeAsync(2_100);

    // the same device, the cloud answering after 10 s: the game starts from the copy here
    const slow = device(server, pc.storage);
    slow.cloud.user = pc.cloud.user;
    slow.cloud.slowLoad = 10_000;
    let started: Awaited<ReturnType<typeof slow.saves.start>> | null = null;
    void slow.saves.start(T0, hooks()).then((r) => (started = r));
    await vi.advanceTimersByTimeAsync(3_100);
    expect(started!.state?.cash).toBe(64);

    // meanwhile another device moved the cloud on: this one's next save is not allowed over it
    const row = server.rows.get(pc.cloud.user!)!;
    server.rows.set(pc.cloud.user!, { ...row, revision: row.revision + 1, data: { ...(row.data as GameState), cash: 999 } });
    slow.saves.save(game(70), true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(pc.cloud.user!)!.data as GameState).cash).toBe(999);
  });

  it("with no copy on this device, waits for the cloud's save rather than starting a new company", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, registers(pc));
    pc.saves.save(game(64), true);
    await vi.advanceTimersByTimeAsync(2_100);

    const phone = device(server);
    phone.cloud.user = pc.cloud.user;
    phone.cloud.slowLoad = 8_000;
    let started: Awaited<ReturnType<typeof phone.saves.start>> | null = null;
    void phone.saves.start(T0, hooks()).then((r) => (started = r));
    await vi.advanceTimersByTimeAsync(3_100);
    expect(started).toBeNull();
    await vi.advanceTimersByTimeAsync(5_100);
    expect(started!.state?.cash).toBe(64);
  });
});

describe("the session kept on the device", () => {
  it("names the signed-in player without the network, and nothing else", () => {
    const user = { id: "u1", email: "a@test.dev", is_anonymous: false, new_email: null };
    expect(storedAccount(JSON.stringify({ access_token: "x", refresh_token: "r", expires_at: 1, user }))).toEqual({ id: "u1", email: "a@test.dev", guest: false, pendingEmail: null });
    expect(storedAccount(JSON.stringify({ refresh_token: "r", user: { id: "g", email: "", is_anonymous: true } }))).toMatchObject({ id: "g", guest: true });
    expect(storedAccount(JSON.stringify({ user }))).toBeNull();
    expect(storedAccount("not json")).toBeNull();
    expect(storedAccount(null)).toBeNull();
  });
});
