// Saves: this device's copy (always, instant, offline-proof) and, when the
// cloud is set up, the player's account and its cloud copy. SaveManager
// decides at the start which copy to play (see policy.ts), asks the player
// when both moved on, then keeps the cloud up to date (see sync.ts).
import { SAVE_VERSION } from "../engine/state";
import type { GameState } from "../types";
import { LocalStore } from "./local";
import { decideStart, summarize, trustedLastActive, type SaveSummary } from "./policy";
import { migrate } from "./serialize";
import { SupabaseBackend } from "./supabase";
import { CloudSync, type SyncInfo } from "./sync";
import type { Account, AuthResult, CloudBackend, CloudCopy, LocalCopy, Profile } from "./types";

export type { Account, AuthResult, CloudBackend, CloudCopy, LocalCopy, Profile, SaveAdapter, SavePayload } from "./types";
export type { SaveSummary } from "./policy";
export { summarize } from "./policy";
export type { SyncInfo, SyncStatus } from "./sync";
export { encodeSave, decodeSave, migrate } from "./serialize";

/** Set by logging out: the next start asks to sign in instead of making a new guest. */
export const SIGNED_OUT_KEY = "idle-car-empire:signed-out";

export interface StartHooks {
  /** Both copies hold progress the other has not: the player keeps one. */
  choose(local: SaveSummary, cloud: SaveSummary, reason: "both-changed" | "different-games"): Promise<"local" | "cloud">;
  /** The player logged out: wait for them to sign in or play as a guest. */
  signIn(): Promise<"guest">;
}

export interface StartResult {
  /** The game to play (null: a new company). */
  state: GameState | null;
  /** The cloud's save comes from a newer version of the game: reload before playing. */
  outdated?: boolean;
  /** Where the game is saved: this device only, or the account too. */
  mode: "local" | "cloud";
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

function flag(key: string, on?: boolean): boolean {
  try {
    if (on === undefined) return localStorage.getItem(key) === "1";
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
    return on;
  } catch {
    return false;
  }
}

/** "Windows · Chrome": which device saved, shown when two saves differ. */
export function deviceLabel(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ").slice(0, 64) || "device";
}

export function cloudBackendFromEnv(): CloudBackend | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseBackend(url, key) : null;
}

export class SaveManager {
  readonly backend: CloudBackend | null;
  readonly local: LocalStore;
  account: Account | null = null;
  sync: CloudSync | null = null;
  private onSync: (info: SyncInfo) => void;
  private device: string;
  /** Logged out or switching account: this page saves nothing more (it reloads next). */
  private closed = false;

  constructor(opts: { backend?: CloudBackend | null; local?: LocalStore; onSync?: (info: SyncInfo) => void; device?: string } = {}) {
    this.backend = opts.backend === undefined ? cloudBackendFromEnv() : opts.backend;
    this.local = opts.local ?? new LocalStore();
    this.onSync = opts.onSync ?? (() => {});
    this.device = opts.device ?? deviceLabel();
  }

  get backendName(): string {
    return this.backend ? (this.account ? "localStorage + cloud" : "localStorage (cloud offline)") : "localStorage";
  }

  /** A save as the game can play it, or null when it is damaged. */
  private read(raw: unknown, now: number): GameState | null {
    try {
      return raw && typeof raw === "object" ? migrate(raw, now) : null;
    } catch {
      return null;
    }
  }

  /** The save from before accounts now lives in the account: kept as a backup, removed from its old place. */
  private retireLegacy(legacy: LocalCopy | null) {
    if (!legacy) return;
    this.local.backup({ state: legacy.state, savedAt: legacy.savedAt }, "device");
    this.local.remove(null);
  }

  async start(now: number, hooks: StartHooks): Promise<StartResult> {
    const legacy = this.local.read(null);
    if (!this.backend) return { state: legacy ? this.read(legacy.state, now) : null, mode: "local" };

    // who plays: the session on this device, a sign-in after a logout, or a new guest
    let account: Account | null = null;
    try {
      account = await timeout(this.backend.session(), 8_000);
    } catch {
      account = null;
    }
    if (!account && flag(SIGNED_OUT_KEY)) {
      await hooks.signIn();
      flag(SIGNED_OUT_KEY, false);
    }
    if (!account) {
      try {
        account = await timeout(this.backend.signInGuest(), 10_000);
      } catch {
        // no cloud right now: this device's game, saved here; the cloud comes back at the next start
        return { state: legacy ? this.read(legacy.state, now) : null, mode: "local" };
      }
    }
    this.account = account;

    let cloud: CloudCopy | null = null;
    try {
      cloud = await timeout(this.backend.load(), 12_000);
    } catch {
      cloud = null;
    }
    const own = this.local.read(account.id);
    // a damaged cloud save is never offered: this device's copy (if any) takes over and repairs it
    if (cloud && cloud.revision > 0 && cloud.version <= SAVE_VERSION && !this.read(cloud.state, now)) {
      const fallback = own ?? legacy;
      const state = fallback ? this.read(fallback.state, now) : null;
      if (state) state.lastActiveAt = trustedLastActive(state.lastActiveAt, cloud, now);
      this.sync = new CloudSync(this.backend, this.local, account.id, cloud.revision, this.onSync, { version: SAVE_VERSION, device: this.device });
      if (state) this.sync.save(state, true);
      if (legacy && fallback === legacy) this.retireLegacy(legacy);
      return { state, mode: "cloud" };
    }
    const decision = decideStart(own, own ? null : legacy, cloud, SAVE_VERSION);

    let state: GameState | null = null;
    let base = cloud?.revision ?? own?.base ?? 0;
    let upload = false;

    if (decision.use === "outdated") return { state: null, outdated: true, mode: "cloud" };

    if (decision.use === "ask" && cloud) {
      const keep = await hooks.choose(summarize(decision.copy.state), summarize(cloud.state), decision.reason);
      if (keep === "local") {
        this.local.backup({ state: cloud.state as GameState, savedAt: cloud.updatedAt }, "cloud");
        state = this.read(decision.copy.state, now);
        upload = true;
      } else {
        this.local.backup({ state: decision.copy.state, savedAt: decision.copy.savedAt }, "device");
        state = this.read(cloud.state, now);
      }
      base = cloud.revision;
      if (decision.copy === legacy) this.retireLegacy(legacy);
    } else if (decision.use === "local") {
      state = this.read(decision.copy.state, now);
      upload = decision.upload;
      base = decision.base;
      if (decision.copy === legacy && cloud) this.retireLegacy(legacy);
    } else if (decision.use === "cloud" && cloud) {
      state = this.read(cloud.state, now);
      // a damaged cloud save: this device's copy, if there is one, takes over (and repairs the cloud)
      if (!state) {
        const fallback = own ?? legacy;
        state = fallback ? this.read(fallback.state, now) : null;
        upload = !!state;
      }
      if (legacy && !own) this.retireLegacy(legacy);
    }

    // time away counts on the server's clock
    if (state) state.lastActiveAt = trustedLastActive(state.lastActiveAt, cloud, now);

    this.sync = new CloudSync(this.backend, this.local, account.id, base, this.onSync, { version: SAVE_VERSION, device: this.device });
    if (state) {
      if (upload) this.sync.save(state, true);
      else this.local.write({ state, savedAt: now, owner: account.id, base, dirty: false });
    }
    return { state, mode: "cloud" };
  }

  /** Keeps a new state: this device now, the cloud soon (`important`: within seconds). */
  save(state: GameState, important = false) {
    if (this.closed) return;
    if (this.sync) this.sync.save(state, important);
    else this.local.write({ state, savedAt: Date.now() });
  }

  flush(): Promise<void> {
    return this.sync?.flush() ?? Promise.resolve();
  }

  /** A new game for this account: this device's copy goes (the cloud's is replaced at the next save). */
  clearLocal() {
    if (this.account) this.local.remove(this.account.id);
    else this.local.remove(null);
  }

  async resolveConflict(keep: "local" | "cloud", now: number): Promise<GameState | null> {
    if (!this.sync) return null;
    const res = await this.sync.resolve(keep);
    if (!res) return null;
    const state = this.read(res.cloud.state, now);
    if (state) state.lastActiveAt = trustedLastActive(state.lastActiveAt, res.cloud, now);
    return state;
  }

  /** The saves replaced by a choice, kept on this device (newest first). */
  backups(): { key: string; at: number; reason: string; summary: SaveSummary }[] {
    return this.local.backups().map((b) => ({ key: b.key, at: b.at, reason: b.reason, summary: summarize(b.payload.state) }));
  }

  /**
   * A backup to play again, in place of `current` (which is kept as a backup
   * itself). The caller saves it, so it replaces the account's save here and
   * in the cloud. Null when the backup is gone or can't be read.
   */
  restoreBackup(key: string, current: GameState, now: number): GameState | null {
    if (this.closed) return null;
    const backup = this.local.backups().find((b) => b.key === key);
    const state = backup ? this.read(backup.payload.state, now) : null;
    if (!state) return null;
    this.local.backup({ state: current, savedAt: now }, "replaced");
    // the time since the backup was kept is not time away: no offline earnings for it
    state.lastActiveAt = now;
    return state;
  }

  /** The cloud's copy, to show it next to this device's in a conflict. */
  async peekCloud(): Promise<CloudCopy | null> {
    try {
      return this.backend ? await this.backend.load() : null;
    } catch {
      return null;
    }
  }

  // ───────────────────────── account ─────────────────────────

  async profile(): Promise<Profile | null> {
    return this.backend && this.account ? this.backend.profile() : null;
  }

  async updateProfile(p: { username?: string; avatar?: string }): Promise<AuthResult> {
    if (!this.backend || !this.account) return { ok: false, error: "network" };
    return this.backend.updateProfile(p);
  }

  async register(email: string, password: string, redirectTo: string): Promise<AuthResult> {
    if (!this.backend) return { ok: false, error: "network" };
    const res = await this.backend.register(email, password, redirectTo);
    if (res.ok) this.account = (await this.backend.refreshAccount().catch(() => null)) ?? this.account;
    return res;
  }

  async setPassword(password: string): Promise<AuthResult> {
    return this.backend ? this.backend.setPassword(password) : { ok: false, error: "network" };
  }

  async refreshAccount(): Promise<Account | null> {
    if (!this.backend) return null;
    this.account = (await this.backend.refreshAccount().catch(() => null)) ?? this.account;
    return this.account;
  }

  /** Signs in to another account (the page reloads after it). The current game is saved first. */
  async login(email: string, password: string): Promise<AuthResult> {
    if (!this.backend) return { ok: false, error: "network" };
    await timeout(this.flush(), 6_000).catch(() => {});
    const res = await this.backend.login(email, password);
    if (res.ok) {
      // the page reloads into the other account: nothing more is saved for this one
      this.closed = true;
      this.sync?.stop();
      flag(SIGNED_OUT_KEY, false);
    }
    return res;
  }

  async sendLink(email: string, redirectTo: string): Promise<AuthResult> {
    return this.backend ? this.backend.sendLink(email, redirectTo) : { ok: false, error: "network" };
  }

  /** Saves, signs out on this device, and forgets this account's local copy (the page reloads after it). */
  async logout(): Promise<void> {
    if (!this.backend) return;
    await timeout(this.flush(), 6_000).catch(() => {});
    this.closed = true;
    this.sync?.stop();
    if (this.account) this.local.remove(this.account.id);
    await this.backend.logout().catch(() => {});
    flag(SIGNED_OUT_KEY, true);
  }

  /** After a logout: play as a new guest instead of signing in. */
  playAsGuest() {
    flag(SIGNED_OUT_KEY, false);
  }
}
