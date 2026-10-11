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

/** The player's cloud account: a guest on this device until an email is linked. */
export interface CloudAccount {
  /** Who is signed in (null: no connection to the cloud). */
  account(): Promise<{ email: string | null } | null>;
  /** Keeps the guest's save under an email (a confirmation link is sent). */
  linkEmail(email: string, redirectTo: string): Promise<{ ok: boolean; error?: string }>;
  /** Sends a sign-in link, to continue a save linked to that email on this device. */
  signIn(email: string, redirectTo: string): Promise<{ ok: boolean; error?: string }>;
}
