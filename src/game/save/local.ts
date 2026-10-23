// This device's saves, in localStorage: one copy per account (so two players
// sharing a browser never see each other's game), the save from before
// accounts (or of a game played without the cloud), and a few backups kept
// whenever a choice replaces a save.
import type { LocalCopy, SavePayload } from "./types";

/** The save from before accounts, and the game when there is no cloud. */
export const LOCAL_SAVE_KEY = "idle-car-empire:save:v1";
const OWNER_PREFIX = "idle-car-empire:save:u:";
const BACKUP_PREFIX = "idle-car-empire:backup:";
/** Backups kept (the oldest go first). */
const BACKUPS = 3;

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(i: number): string | null;
  readonly length: number;
}

function browserStorage(): KeyValue | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface Backup {
  key: string;
  /** When it was kept (device time). */
  at: number;
  /** Where it came from: "device", "cloud", or "replaced" (the game before a restore). */
  reason: string;
  payload: SavePayload;
}

const keyFor = (owner: string | null) => (owner ? `${OWNER_PREFIX}${owner}` : LOCAL_SAVE_KEY);

export class LocalStore {
  constructor(private store: KeyValue | null = browserStorage()) {}

  /** The copy of an account (null: the save from before accounts). */
  read(owner: string | null): LocalCopy | null {
    try {
      const raw = this.store?.getItem(keyFor(owner));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocalCopy;
      if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.state !== "object") return null;
      // a copy found under an account's key belongs to that account
      return owner ? { ...parsed, owner } : parsed;
    } catch {
      // damaged: treated as missing (the cloud copy, if any, takes over)
      return null;
    }
  }

  write(copy: LocalCopy): boolean {
    try {
      this.store?.setItem(keyFor(copy.owner ?? null), JSON.stringify(copy));
      return true;
    } catch {
      // storage full or blocked (private mode): the game keeps running in memory
      return false;
    }
  }

  remove(owner: string | null) {
    try {
      this.store?.removeItem(keyFor(owner));
    } catch {
      // blocked: nothing to remove
    }
  }

  /** Keeps a copy of a save about to be replaced, so a wrong choice can be undone. */
  backup(payload: SavePayload, reason: string): string | null {
    const s = this.store;
    if (!s) return null;
    const key = `${BACKUP_PREFIX}${Date.now()}:${reason}`;
    try {
      s.setItem(key, JSON.stringify(payload));
    } catch {
      return null;
    }
    const keys = this.backupKeys();
    for (const old of keys.slice(0, Math.max(0, keys.length - BACKUPS))) s.removeItem(old);
    return key;
  }

  /** The backups that can still be read, newest first. */
  backups(): Backup[] {
    const s = this.store;
    if (!s) return [];
    const out: Backup[] = [];
    for (const key of this.backupKeys().reverse()) {
      try {
        const payload = JSON.parse(s.getItem(key) ?? "null") as SavePayload | null;
        if (!payload?.state || typeof payload.state !== "object") continue;
        const [at, reason = ""] = key.slice(BACKUP_PREFIX.length).split(":");
        out.push({ key, at: Number(at), reason, payload });
      } catch {
        // damaged: not offered
      }
    }
    return out;
  }

  /** The accounts that have a copy on this device. */
  owners(): string[] {
    const s = this.store;
    if (!s) return [];
    const out: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(OWNER_PREFIX)) out.push(k.slice(OWNER_PREFIX.length));
      }
    } catch {
      return [];
    }
    return out;
  }

  /** Backups, oldest first. */
  backupKeys(): string[] {
    const s = this.store;
    if (!s) return [];
    const out: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(BACKUP_PREFIX)) out.push(k);
      }
    } catch {
      return [];
    }
    return out.sort((a, b) => Number(a.slice(BACKUP_PREFIX.length).split(":")[0]) - Number(b.slice(BACKUP_PREFIX.length).split(":")[0]));
  }
}

/** An in-memory store (tests, and browsers that block storage). */
export function memoryStorage(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
