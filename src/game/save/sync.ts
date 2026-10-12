// Keeps the cloud copy of one account's game up to date while it is played.
//
// - The local copy is written on every save (instant, offline-proof); the
//   cloud gets the latest state at most every `interval`, or `debounce`
//   after an important action, and at once when the game goes to the
//   background.
// - One request at a time: a newer state waits for the one in flight, so an
//   older save can never land after a newer one.
// - Every request names the revision it builds on. If another session saved
//   in between, the server refuses and the sync stops in "conflict" until
//   the player chooses which progress to keep.
// - A failed request (network, server) is retried with growing pauses; the
//   game never waits for any of it.
import type { GameState } from "../types";
import type { LocalStore } from "./local";
import type { CloudBackend, CloudCopy } from "./types";

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "offline" | "conflict";

export interface SyncInfo {
  status: SyncStatus;
  /** Server time of the last save that reached the cloud. */
  lastSaved: number | null;
  revision: number;
}

export interface SyncOptions {
  version: number;
  device: string;
  /** Pause between two cloud saves while playing (ms). */
  interval?: number;
  /** Wait after an important action before saving (ms), to group several. */
  debounce?: number;
  /** Retry pauses after failures (ms). */
  retries?: number[];
  /** Give up on a request after this long (ms). */
  timeout?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

const DEFAULTS = { interval: 30_000, debounce: 2_000, retries: [5_000, 15_000, 30_000, 60_000], timeout: 20_000 };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export class CloudSync {
  private info: SyncInfo;
  private latest: GameState | null = null;
  private seq = 0;
  private sentSeq = 0;
  private inFlight: Promise<void> | null = null;
  private timer: unknown = null;
  private due = Infinity;
  private lastSent = 0;
  private failures = 0;
  private stopped = false;
  private readonly o: Required<Omit<SyncOptions, "version" | "device">> & Pick<SyncOptions, "version" | "device">;

  constructor(
    private backend: CloudBackend,
    private local: LocalStore,
    private owner: string,
    revision: number,
    private onChange: (info: SyncInfo) => void,
    opts: SyncOptions,
  ) {
    this.o = {
      ...DEFAULTS,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      ...opts,
    };
    this.info = { status: "idle", lastSaved: null, revision };
  }

  get state(): SyncInfo {
    return this.info;
  }

  private set(p: Partial<SyncInfo>) {
    this.info = { ...this.info, ...p };
    this.onChange(this.info);
  }

  /** A new state to keep: written to this device now, to the cloud soon. */
  save(state: GameState, important = false) {
    // stopped (logout, another account): nothing more is written for this account, not even here
    if (this.stopped) return;
    this.latest = state;
    this.seq++;
    this.writeLocal(state, true);
    if (this.stopped || this.info.status === "conflict") return;
    const now = this.o.now();
    const wait = important ? this.o.debounce : Math.max(0, this.lastSent + this.o.interval - now);
    this.schedule(wait);
  }

  /** Sends what there is now (the game goes to the background, or "save now"). */
  flush(): Promise<void> {
    if (this.stopped || this.info.status === "conflict" || this.seq === this.sentSeq) return this.inFlight ?? Promise.resolve();
    // now, and wait for it: a logout or a page going away must not leave the last state behind
    this.clear();
    return this.run();
  }

  /** Stops saving to the cloud (logout, or another account). Local saves go on in the store. */
  stop() {
    this.stopped = true;
    this.clear();
  }

  private writeLocal(state: GameState, dirty: boolean) {
    this.local.write({ state, savedAt: this.o.now(), owner: this.owner, base: this.info.revision, dirty });
  }

  private clear() {
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
    this.due = Infinity;
  }

  private schedule(ms: number) {
    const at = this.o.now() + ms;
    if (this.timer !== null && this.due <= at) return;
    this.clear();
    this.due = at;
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      this.due = Infinity;
      void this.run();
    }, ms);
  }

  private run(): Promise<void> {
    if (this.inFlight) {
      // a newer state waits for the request in flight
      return this.inFlight.then(() => (this.seq !== this.sentSeq ? this.run() : undefined));
    }
    if (this.stopped || !this.latest || this.seq === this.sentSeq || this.info.status === "conflict") return Promise.resolve();
    const state = this.latest;
    const seq = this.seq;
    const base = this.info.revision;
    this.set({ status: "saving" });
    this.lastSent = this.o.now();
    this.inFlight = (async () => {
      try {
        const res = await withTimeout(this.backend.save(state, this.o.version, base, this.o.device), this.o.timeout);
        if (!res.ok) {
          // another session saved in between (or the cloud holds a newer game version)
          this.set({ status: "conflict", revision: res.revision || base });
          this.clear();
          return;
        }
        this.failures = 0;
        this.sentSeq = seq;
        this.set({ status: "saved", revision: res.revision, lastSaved: res.updatedAt });
        // this device's copy now matches the cloud (unless the game moved on meanwhile)
        if (this.seq === seq) this.writeLocal(state, false);
        else this.writeLocal(this.latest!, true);
      } catch {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        this.set({ status: offline ? "offline" : "error" });
        const pause = this.o.retries[Math.min(this.failures, this.o.retries.length - 1)];
        this.failures++;
        this.schedule(pause);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight.then(() => {
      // the game moved on while saving: the next save at the usual pace
      if (this.seq !== this.sentSeq && this.info.status === "saved") this.schedule(Math.max(0, this.lastSent + this.o.interval - this.o.now()));
    });
  }

  /** Back online: try again now instead of waiting out the pause. */
  retryNow() {
    if (this.info.status === "error" || this.info.status === "offline") {
      this.failures = 0;
      this.schedule(0);
    }
  }

  /**
   * Ends a conflict. "local": this device's game replaces the cloud's (the
   * cloud's is kept as a backup on this device). "cloud": the cloud's game
   * is returned to be played (this device's is kept as a backup).
   */
  async resolve(keep: "local" | "cloud"): Promise<{ cloud: CloudCopy } | null> {
    const cloud = await this.backend.load();
    if (keep === "cloud") {
      if (this.latest) this.local.backup({ state: this.latest, savedAt: this.o.now() }, "device");
      this.latest = null;
      this.sentSeq = this.seq;
      this.set({ status: "saved", revision: cloud.revision, lastSaved: cloud.updatedAt || null });
      return { cloud };
    }
    if (cloud.revision > 0 && cloud.state && typeof cloud.state === "object") this.local.backup({ state: cloud.state as GameState, savedAt: cloud.updatedAt }, "cloud");
    this.set({ status: "idle", revision: cloud.revision });
    this.sentSeq = this.seq - 1;
    await this.run();
    return null;
  }
}
