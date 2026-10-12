"use client";

// The player's account and the cloud save, as the interface shows them:
// who is signed in, their profile, how the last save went, and what the start
// of the game may ask for (the welcome page to register or sign in, which save
// to keep when two differ).
import { create } from "zustand";
import type { Account, Profile, SaveSummary, SyncInfo } from "@/game/save";

export interface StartChoice {
  local: SaveSummary;
  cloud: SaveSummary;
  reason: "both-changed" | "different-games";
}

interface CloudStore {
  /** The cloud is set up for this build. */
  enabled: boolean;
  /** Where the game is saved right now. */
  mode: "local" | "cloud";
  account: Account | null;
  profile: Profile | null;
  sync: SyncInfo;
  /** At the start: which save to keep. */
  startChoice: StartChoice | null;
  /** The welcome page (register or sign in): a "new" player, or "returning" after a logout. */
  welcome: "new" | "returning" | null;
  /** The cloud save comes from a newer version of the game. */
  outdated: boolean;
  /** What the loading screen is doing. */
  phase: "account" | "save" | "ready";
}

export const useCloud = create<CloudStore>(() => ({
  enabled: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  mode: "local",
  account: null,
  profile: null,
  sync: { status: "idle", lastSaved: null, revision: 0 },
  startChoice: null,
  welcome: null,
  outdated: false,
  phase: "account",
}));

let choose: ((keep: "local" | "cloud") => void) | null = null;
let entered: ((how: "account" | "guest") => void) | null = null;

/** Asks the player which save to keep (the loading screen shows the choice). */
export function askStartChoice(c: StartChoice): Promise<"local" | "cloud"> {
  useCloud.setState({ startChoice: c });
  return new Promise((resolve) => {
    choose = resolve;
  });
}

export function answerStartChoice(keep: "local" | "cloud") {
  useCloud.setState({ startChoice: null });
  choose?.(keep);
  choose = null;
}

/** Shows the welcome page; resolves once the player registered or signed in ("account"), or plays without an account. */
export function askWelcome(returning: boolean): Promise<"account" | "guest"> {
  useCloud.setState({ welcome: returning ? "returning" : "new" });
  return new Promise((resolve) => {
    entered = resolve;
  });
}

/** Leaves the welcome page into the game. */
export function enterGame(how: "account" | "guest") {
  useCloud.setState({ welcome: null });
  entered?.(how);
  entered = null;
}
