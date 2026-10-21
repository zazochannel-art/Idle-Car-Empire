// Saves: this device's copy (always, instant, offline-proof) and, when the
// cloud is set up, the player's account and its cloud copy. SaveManager
// decides at the start which copy to play (see policy.ts), asks the player
// when both moved on, then keeps the cloud up to date (see sync.ts).
import { captchaFailed, captchaOn } from "../../lib/captcha";
import { isCleanName } from "../engine/names";
import { SAVE_VERSION } from "../engine/state";
import type { GameState } from "../types";
import { LocalStore } from "./local";
import { decideStart, summarize, trustedLastActive, type SaveSummary } from "./policy";
import { migrate } from "./serialize";
import { SupabaseBackend } from "./supabase";
import type { Social } from "./social";
import { CloudSync, type SyncInfo } from "./sync";
import type { Account, AuthResult, CloudBackend, CloudBackup, CloudCopy, LocalCopy, Profile } from "./types";

export type { Account, AuthResult, CloudBackend, CloudBackup, CloudCopy, LocalCopy, Profile, SaveAdapter, SavePayload } from "./types";
export type { SaveSummary } from "./policy";
export { summarize } from "./policy";
export type { SyncInfo, SyncStatus } from "./sync";
export type { AllianceMember, AllianceSummary, BoardKind, BoardRow, ClaimTierResult, CreateAllianceResult, CupPlace, CupRow, CupSubmitResult, EmpireCard, GiftResult, JoinAllianceResult, MyAlliance, MyInvite, RedeemInviteResult, ReportReason, ReportResult } from "./social";
export { GIFTS_PER_DAY, REPORT_REASONS } from "./social";
export { encodeSave, decodeSave, migrate } from "./serialize";

/** Set by logging out: the welcome page opens on "sign in" instead of "create account". */
export const SIGNED_OUT_KEY = "idle-car-empire:signed-out";

export interface StartHooks {
  /** Both copies hold progress the other has not: the player keeps one. */
  choose(local: SaveSummary, cloud: SaveSummary, reason: "both-changed" | "different-games"): Promise<"local" | "cloud">;
  /**
   * The welcome page: no account is signed in on this device (a new player, after a logout, or
   * a guest from when the game could be played without an account, `guestGame` when its game is
   * here). Resolves once the player registered or signed in.
   */
  signIn(returning: boolean, guestGame: boolean): Promise<void>;
}

/**
 * Who may play: an account with an email and a password, or one just registered whose email is
 * still to be confirmed. A guest (an anonymous account, from when the game could be played
 * without an account) registers first, keeping its game.
 */
export const registered = (a: Account): boolean => !a.guest || !!a.pendingEmail;

export interface StartResult {
  /** The game to play (null: a new company). */
  state: GameState | null;
  /** The cloud's save comes from a newer version of the game: reload before playing. */
  outdated?: boolean;
  /** Where the game is saved: this device only, or the account too. */
  mode: "local" | "cloud";
}

/** How long the start waits for the cloud's save: with no copy on this device, and with one (ms). */
const CLOUD_WAIT = 12_000;
const CLOUD_WAIT_WITH_COPY = 3_000;

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

/** "iPhone", "Android": which device saved, shown when two saves differ (a development browser adds its name). */
export function deviceLabel(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  // the apps' web views (Android's says "wv"; iOS's names no browser) are just the phone
  const br = /; wv\)/.test(ua) ? "" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ").slice(0, 64) || "device";
}

export function cloudBackendFromEnv(): CloudBackend | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseBackend(url, key) : null;
}

/** Where the game is saved (Settings). */
export type SaveWhere = "cloud" | "cloudOffline" | "local";

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

  /** Where the game is being saved, as Settings says it: on the phone, and in the cloud when signed in. */
  get saveWhere(): SaveWhere {
    return this.backend ? (this.account ? "cloud" : "cloudOffline") : "local";
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

  private async currentAccount(): Promise<Account | null> {
    try {
      return this.backend ? await timeout(this.backend.session(), 8_000) : null;
    } catch {
      return null;
    }
  }

  async start(now: number, hooks: StartHooks): Promise<StartResult> {
    const legacy = this.local.read(null);
    if (!this.backend) return { state: legacy ? this.read(legacy.state, now) : null, mode: "local" };

    // who plays: the account signed in on this device, or whoever registers or signs in on the
    // welcome page. Nobody plays without an account: the page stays until there is one.
    let account = await this.currentAccount();
    while (!account || !registered(account)) {
      const guestGame = !!account?.guest && !!this.local.read(account.id);
      await hooks.signIn(flag(SIGNED_OUT_KEY), guestGame);
      account = await this.currentAccount();
    }
    flag(SIGNED_OUT_KEY, false);
    this.account = account;

    const own = this.local.read(account.id);
    let cloud: CloudCopy | null = null;
    try {
      // with this account's copy here, a slow connection doesn't hold the game up for long: the
      // copy plays, and its first save is checked against the cloud (a newer one there asks)
      cloud = await timeout(this.backend.load(), own ? CLOUD_WAIT_WITH_COPY : CLOUD_WAIT);
    } catch {
      cloud = null;
    }
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

  /** The older copies of this account's save kept in the cloud (newest first); null without the cloud. */
  async cloudBackups(): Promise<CloudBackup[] | null> {
    if (!this.account || !this.backend?.backups) return null;
    return this.backend.backups();
  }

  /**
   * A cloud backup to play again, in place of `current`: the server keeps the cloud save it
   * replaces as a backup, and `current` is kept on this device too. The caller saves the result,
   * so it becomes the account's save (through the usual revision check). "newer" when the
   * backup was made by a newer version of the game; null when it is gone or can't be read.
   */
  async restoreCloudBackup(id: number, current: GameState, now: number): Promise<GameState | "newer" | null> {
    if (this.closed || !this.account || !this.backend?.takeBackup) return null;
    const backup = (await this.cloudBackups())?.find((b) => b.id === id);
    if (!backup) return null;
    if (backup.version > SAVE_VERSION) return "newer";
    const taken = await this.backend.takeBackup(id);
    const state = taken && taken.version <= SAVE_VERSION ? this.read(taken.state, now) : null;
    if (!state || this.closed) return null;
    this.local.backup({ state: current, savedAt: now }, "replaced");
    // the time since the backup was made is not time away: no offline earnings for it
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

  private socialApi: Social | null = null;
  /** The leaderboard, visits and gifts (null without the cloud, or before a player is signed in). */
  get social(): Social | null {
    if (!this.account || !this.backend || !("social" in this.backend)) return null;
    return (this.socialApi ??= (this.backend as SupabaseBackend).social());
  }

  /**
   * The welcome page's "create account": a new account with this name, email and password.
   * (It starts as a guest account that gets the email and password, so a confirmation link
   * the player hasn't clicked yet never blocks the game.) A failed attempt can be retried:
   * it goes on with the same account.
   */
  async welcomeRegister(username: string, email: string, password: string, redirectTo: string): Promise<AuthResult & { field?: "name" }> {
    // the server checks the name too; this answers at once, before an account is made
    if (!isCleanName(username)) return { ok: false, error: "blocked", field: "name" };
    if (!this.backend) return { ok: false, error: "network" };
    try {
      // the robot check may wait for the player's tap (lib/captcha.ts)
      if (!(await this.currentAccount())) await timeout(this.backend.signInGuest(), captchaOn() ? 120_000 : 10_000);
    } catch (e) {
      return { ok: false, error: captchaFailed(e) ? "captcha" : "network" };
    }
    const named = await this.backend.updateProfile({ username });
    if (!named.ok) return { ...named, field: "name" };
    return this.backend.register(email, password, redirectTo);
  }

  /**
   * The welcome page's "sign in" (the game then starts with this account's save). A guest's game
   * left behind by it is kept as a backup on this device, to be played again from the Profile.
   */
  async welcomeLogin(email: string, password: string): Promise<AuthResult> {
    if (!this.backend) return { ok: false, error: "network" };
    const before = await this.currentAccount();
    const res = await this.backend.login(email, password);
    const left = res.ok && before?.guest ? this.local.read(before.id) : null;
    if (left && (await this.currentAccount())?.id !== before!.id) this.local.backup({ state: left.state, savedAt: left.savedAt }, "device");
    return res;
  }

  async profile(): Promise<Profile | null> {
    return this.backend && this.account ? this.backend.profile() : null;
  }

  async updateProfile(p: { username?: string; avatar?: string; listed?: boolean }): Promise<AuthResult> {
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

  /** A forgotten password: an email with a link to choose a new one (the account itself never says whether it exists). */
  async resetPassword(email: string, redirectTo: string): Promise<AuthResult> {
    return this.backend?.resetPassword ? this.backend.resetPassword(email, redirectTo) : { ok: false, error: "network" };
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

  /**
   * Deletes the player's account on the server, with everything kept there (save, profile,
   * leaderboard entry, gifts, alliance seat), then forgets this device's copy of it. Nothing is
   * saved after it (the page reloads next and starts a new game). If the server says no, nothing
   * changed and the game goes on.
   */
  async deleteAccount(): Promise<AuthResult> {
    if (!this.backend || !this.account) return { ok: false, error: "network" };
    const id = this.account.id;
    const r = await this.backend.deleteAccount();
    if (!r.ok) return r;
    this.closed = true;
    this.sync?.stop();
    this.local.remove(id);
    this.account = null;
    flag(SIGNED_OUT_KEY, true);
    return r;
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
}
