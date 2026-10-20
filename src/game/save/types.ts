import type { GameState } from "../types";

export interface SavePayload {
  state: GameState;
  savedAt: number;
}

/**
 * Where saves live. The game only talks to this interface, so a backend can
 * be added without touching the engine or the UI.
 */
export interface SaveAdapter {
  readonly name: string;
  load(): Promise<SavePayload | null>;
  save(payload: SavePayload): Promise<void>;
  clear(): Promise<void>;
}

/**
 * This device's copy of a player's game. `base` is the cloud revision it
 * started from and `dirty` whether it has changes the cloud has not seen:
 * together they tell, at the next start, whether this copy or the cloud's is
 * the newer one, or whether both moved on (a conflict).
 */
export interface LocalCopy extends SavePayload {
  /** The account it belongs to (absent: a save from before accounts). */
  owner?: string;
  base?: number;
  dirty?: boolean;
}

/** The cloud's copy, as the server sent it. Revision 0: there is none yet. */
export interface CloudCopy {
  state: unknown;
  version: number;
  revision: number;
  /** When it was saved, and the server's clock when it was read (ms, server time). */
  updatedAt: number;
  serverNow: number;
}

/** The signed-in player. */
export interface Account {
  id: string;
  email: string | null;
  /** A guest: signed in on this device only, until an email and password are added. */
  guest: boolean;
  /** An email change waiting for its confirmation link. */
  pendingEmail?: string | null;
}

export interface Profile {
  id: string;
  username: string;
  avatar: string;
  /** On the global leaderboard and visitable by other players (default). */
  listed?: boolean;
}

/** blocked: a name the terms of use don't allow (engine/names.ts). */
export type AuthError = "invalid" | "blocked" | "taken" | "weak" | "credentials" | "unconfirmed" | "rate" | "network" | "unknown";
export type AuthResult = { ok: true; pending?: boolean } | { ok: false; error: AuthError; detail?: string };

/** The cloud: accounts, profiles and revisioned saves. */
export interface CloudBackend {
  /** The session saved on this device (no network needed), or null. */
  session(): Promise<Account | null>;
  /** A new guest account (anonymous sign-in). */
  signInGuest(): Promise<Account>;
  /** Makes the guest permanent with an email and password (same account, same save). */
  register(email: string, password: string, redirectTo: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  setPassword(password: string): Promise<AuthResult>;
  /** Emails a link to choose a new password (the page at redirectTo sets it). */
  resetPassword?(email: string, redirectTo: string): Promise<AuthResult>;
  logout(): Promise<void>;
  /** Deletes the signed-in account and everything the server keeps of it (for good). */
  deleteAccount(): Promise<AuthResult>;
  /** The account as the server knows it now (email confirmed, guest or not). */
  refreshAccount(): Promise<Account | null>;
  profile(): Promise<Profile | null>;
  updateProfile(p: { username?: string; avatar?: string; listed?: boolean }): Promise<AuthResult>;
  load(): Promise<CloudCopy>;
  /** Saves if the cloud is still at baseRevision; otherwise ok is false and nothing changed. */
  save(state: GameState, version: number, baseRevision: number, device: string): Promise<{ ok: boolean; revision: number; updatedAt: number }>;
  /** The older copies of this account's save the server keeps (newest first). */
  backups?(): Promise<CloudBackup[]>;
  /** One of them to play again (the server first keeps the cloud save it will replace); null if it's gone. */
  takeBackup?(id: number): Promise<{ state: unknown; version: number } | null>;
}

/**
 * An older copy of the account's save, kept by the server (supabase/migrations/0011): every few
 * hours of play ("auto"), before a save with much less progress ("drop"), before a restore.
 */
export interface CloudBackup {
  id: number;
  at: number;
  reason: "auto" | "drop" | "restore";
  device: string;
  /** The save format: a newer one than this game reads can't be restored here. */
  version: number;
  company: string;
  cash: number;
  earned: number;
  cars: number;
  plants: number;
  lastPlayed: number;
}
