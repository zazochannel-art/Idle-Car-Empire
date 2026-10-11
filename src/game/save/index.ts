import type { GameState } from "../types";
import { LocalStorageAdapter } from "./local";
import { migrate } from "./serialize";
import { SupabaseAdapter } from "./supabase";
import type { CloudAccount, SaveAdapter, SavePayload } from "./types";

export type { CloudAccount, SaveAdapter, SavePayload } from "./types";
export { encodeSave, decodeSave, migrate } from "./serialize";

const REMOTE_INTERVAL_MS = 30_000;
/** Set when the player asks for a sign-in link: the next load takes the cloud's copy, even if this device's is newer. */
export const PREFER_CLOUD_KEY = "idle-car-empire:prefer-cloud";

/**
 * Local save is always on (instant, works offline). When Supabase env vars
 * are present, saves are mirrored to the cloud at most every 30s, and on load
 * the newer of the two copies wins.
 */
export class SaveManager {
  private local: SaveAdapter;
  private remote: (SaveAdapter & Partial<CloudAccount>) | null = null;
  private lastRemote = 0;

  constructor(adapters?: { local: SaveAdapter; remote: (SaveAdapter & Partial<CloudAccount>) | null }) {
    this.local = adapters?.local ?? new LocalStorageAdapter();
    if (adapters) this.remote = adapters.remote;
    else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) this.remote = new SupabaseAdapter(url, key);
    }
  }

  /** The cloud account, when saves go to the cloud. */
  get cloud(): CloudAccount | null {
    const r = this.remote;
    return r && r.account && r.linkEmail && r.signIn ? (r as CloudAccount) : null;
  }

  get backend(): string {
    return this.remote ? `${this.local.name} + ${this.remote.name}` : this.local.name;
  }

  async load(now: number): Promise<GameState | null> {
    const [local, remote] = await Promise.all([
      this.local.load(),
      this.remote ? this.remote.load().catch(() => null) : Promise.resolve(null),
    ]);
    // just signed in from an email link: the account's save wins
    const preferCloud = readFlag();
    if (preferCloud) clearFlag();
    const best = preferCloud && remote ? remote : pickNewest(local, remote);
    return best ? migrate(best.state, now) : null;
  }

  async save(state: GameState, opts: { force?: boolean } = {}): Promise<void> {
    const payload: SavePayload = { state, savedAt: Date.now() };
    await this.local.save(payload);
    if (this.remote && (opts.force || payload.savedAt - this.lastRemote > REMOTE_INTERVAL_MS)) {
      this.lastRemote = payload.savedAt;
      this.remote.save(payload).catch(() => {
        // Cloud is best-effort; the local copy is authoritative until the next sync.
      });
    }
  }

  async clear(): Promise<void> {
    await Promise.all([this.local.clear(), this.remote?.clear().catch(() => undefined)]);
  }
}

function readFlag(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(PREFER_CLOUD_KEY) === "1";
  } catch {
    return false;
  }
}

function clearFlag() {
  try {
    localStorage.removeItem(PREFER_CLOUD_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}

function pickNewest(a: SavePayload | null, b: SavePayload | null): SavePayload | null {
  if (!a) return b;
  if (!b) return a;
  return b.savedAt > a.savedAt ? b : a;
}
