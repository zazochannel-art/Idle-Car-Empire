"use client";

// The player's account and the cloud save, as the interface shows them:
// who is signed in, their profile, how the last save went, and the choices
// the start of the game may ask for (sign in after a logout, which save to
// keep when two differ).
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
  /** At the start: which save to keep, a sign-in after a logout, a save from a newer game version. */
  startChoice: StartChoice | null;
  needSignIn: boolean;
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
  needSignIn: false,
  outdated: false,
  phase: "account",
}));

let choose: ((keep: "local" | "cloud") => void) | null = null;
let guest: ((v: "guest") => void) | null = null;

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

/** After a logout: waits on the sign-in screen (signing in reloads the page; "guest" goes on). */
export function askSignIn(): Promise<"guest"> {
  useCloud.setState({ needSignIn: true });
  return new Promise((resolve) => {
    guest = resolve;
  });
}

export function continueAsGuest() {
  useCloud.setState({ needSignIn: false });
  guest?.("guest");
  guest = null;
}
