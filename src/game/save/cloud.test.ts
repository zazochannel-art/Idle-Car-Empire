// Cloud saves end to end against an in-memory server that applies the same
// rules as the database (supabase/migrations): one save per account, written
// only on top of the revision the client names, server timestamps.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_VERSION, createInitialState } from "../engine/state";
import type { GameState } from "../types";
import { SIGNED_OUT_KEY, SaveManager, WELCOMED_KEY, type StartHooks } from "./index";
import { LocalStore, LOCAL_SAVE_KEY, memoryStorage, type KeyValue } from "./local";
import { decideStart, summarize, trustedLastActive } from "./policy";
import { CloudSync, type SyncInfo } from "./sync";
import type { Account, AuthResult, CloudBackend, CloudCopy, LocalCopy, Profile } from "./types";

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
  users = new Map<string, { email: string | null; password: string | null }>();
  profiles = new Map<string, Profile>();
  clock = T0 + 1_000_000;
  next = 1;
  requests = 0;
}

class FakeCloud implements CloudBackend {
  user: string | null = null;
  fail = 0;
  constructor(public server: Server) {}

  private acc(id: string): Account {
    const u = this.server.users.get(id)!;
    return { id, email: u.email, guest: !u.email };
  }
  async session() {
    return this.user ? this.acc(this.user) : null;
  }
  async signInGuest() {
    const id = `user-${this.server.next++}`;
    this.server.users.set(id, { email: null, password: null });
    this.server.profiles.set(id, { id, username: `Player-${id}`, avatar: "🧑‍🔧" });
    this.user = id;
    return this.acc(id);
  }
  async register(email: string, password: string): Promise<AuthResult> {
    if ([...this.server.users.values()].some((u) => u.email === email)) return { ok: false, error: "taken" };
    this.server.users.set(this.user!, { email, password });
    return { ok: true };
  }
  async login(email: string, password: string): Promise<AuthResult> {
    const hit = [...this.server.users.entries()].find(([, u]) => u.email === email && u.password === password);
    if (!hit) return { ok: false, error: "credentials" };
    this.user = hit[0];
    return { ok: true };
  }
  async sendLink(): Promise<AuthResult> {
    return { ok: true };
  }
  async setPassword(password: string): Promise<AuthResult> {
    this.server.users.get(this.user!)!.password = password;
    return { ok: true };
  }
  async logout() {
    this.user = null;
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
    this.server.rows.set(this.user, next);
    return { ok: true, revision: next.revision, updatedAt: next.updatedAt };
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
  signIn: over.signIn ?? (async () => "guest"),
});

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
    await alice.saves.start(T0, hooks());
    await alice.saves.updateProfile({ username: "Alice" });

    const pc = device(server);
    const signIn = vi.fn(async (returning: boolean) => {
      expect(returning).toBe(false);
      // a name that is taken: nothing else happens, and the next try goes on with the same account
      expect(await pc.saves.welcomeRegister("alice", "b@test.dev", "secret1", "")).toMatchObject({ ok: false, error: "taken", field: "name" });
      const first = pc.cloud.user;
      expect(await pc.saves.welcomeRegister("Bob", "b@test.dev", "secret1", "")).toEqual({ ok: true });
      expect(pc.cloud.user).toBe(first);
      return "account" as const;
    });
    const res = await pc.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledOnce();
    expect(res.mode).toBe("cloud");
    expect(pc.saves.account).toMatchObject({ guest: false, email: "b@test.dev" });
    expect(server.profiles.get(pc.cloud.user!)?.username).toBe("Bob");
    expect(server.users.size).toBe(2); // Alice and Bob: no stray account

    // the next visit on this device goes straight into the game
    pc.saves.save(game(7), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const again = device(server, pc.storage);
    again.cloud.user = pc.cloud.user;
    const notAgain = vi.fn(async () => "guest" as const);
    expect((await again.saves.start(T0 + 60_000, hooks({ signIn: notAgain }))).state?.cash).toBe(7);
    expect(notAgain).not.toHaveBeenCalled();
  });

  it("signing in on the welcome page plays the account's game (and makes no guest account)", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, hooks());
    pc.saves.save(game(321), true);
    await vi.advanceTimersByTimeAsync(2_100);
    await pc.saves.register("a@test.dev", "secret1", "");

    const phone = device(server);
    const signIn = vi.fn(async () => {
      expect(await phone.saves.welcomeLogin("a@test.dev", "wrong")).toMatchObject({ ok: false, error: "credentials" });
      expect(await phone.saves.welcomeLogin("a@test.dev", "secret1")).toEqual({ ok: true });
      return "account" as const;
    });
    const res = await phone.saves.start(T0 + 60_000, hooks({ signIn }));
    expect(res.state?.cash).toBe(321);
    expect(phone.cloud.user).toBe(pc.cloud.user);
    expect(server.users.size).toBe(1);
  });

  it("shows again for a guest that left it while registering; a guest with a game goes straight in", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.cloud.signInGuest(); // the account made by a registration that was never finished
    const id = pc.cloud.user;
    const signIn = vi.fn(async () => "guest" as const);
    const res = await pc.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledExactlyOnceWith(false);
    expect(res.mode).toBe("cloud");
    expect(pc.cloud.user).toBe(id); // playing without an account keeps that guest, no new one
    pc.saves.save(game(5), true);
    await vi.advanceTimersByTimeAsync(2_100);

    // a guest who already plays on this device (as before the welcome page existed): no page
    flags.removeItem(WELCOMED_KEY);
    const again = device(server, pc.storage);
    again.cloud.user = id;
    const notAgain = vi.fn(async () => "guest" as const);
    expect((await again.saves.start(T0 + 60_000, hooks({ signIn: notAgain }))).state?.cash).toBe(5);
    expect(notAgain).not.toHaveBeenCalled();
  });
});

// ───────────────────────── players and devices ─────────────────────────

describe("players and devices", () => {
  it("player A: new game as a guest, registers, closes, returns, and continues on another device", async () => {
    const server = new Server();
    const pc = device(server);
    const a = await pc.saves.start(T0, hooks());
    expect(a.state).toBeNull();
    const s = game(1_000);
    pc.saves.save(s, true);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(await pc.saves.register("a@test.dev", "secret1", "")).toEqual({ ok: true });
    expect(pc.saves.account).toMatchObject({ guest: false, email: "a@test.dev" });

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
    await pc.saves.start(T0, hooks());
    pc.saves.save(game(1_000), true);
    await vi.advanceTimersByTimeAsync(2_100);
    const aId = pc.cloud.user!;

    const other = device(server);
    const b = await other.saves.start(T0, hooks());
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
    const start = await pc.saves.start(T0 + 1_000, hooks());
    expect(start.state?.cash).toBe(4_242);
    await vi.advanceTimersByTimeAsync(2_100);
    expect((server.rows.get(pc.cloud.user!)!.data as GameState).cash).toBe(4_242);
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
    expect(pc.saves.local.backupKeys().length).toBe(1);
  });

  it("asks before replacing an account's save with a different game from this device", async () => {
    const server = new Server();
    const first = device(server);
    await first.saves.start(T0, hooks());
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

  it("after a logout the next start waits for a sign-in, and this device forgets the account's copy", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, hooks());
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
    const signIn = vi.fn(async () => "guest" as const);
    await next.saves.start(T0, hooks({ signIn }));
    expect(signIn).toHaveBeenCalledExactlyOnceWith(true); // the welcome page, opened on "sign in"
    expect(next.cloud.user).not.toBe(id);
  });

  it("plays this device's copy when the cloud can't be reached, and repairs a damaged cloud save", async () => {
    const server = new Server();
    const pc = device(server);
    await pc.saves.start(T0, hooks());
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
