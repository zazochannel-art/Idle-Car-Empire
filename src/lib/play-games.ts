// Google Play Games Services, as the game's screens see them: whether this build has it and the
// player is signed in, and what to send (achievements, the cars leaderboard). Safe to load
// anywhere: the plugin itself (lib/native-play-games.ts) is loaded only inside the Android app.
import { useSyncExternalStore } from "react";
import { PLAY_GAMES_ACHIEVEMENTS, PLAY_GAMES_LEADERBOARD_CARS } from "@/game/config/play-games";
import type { GameState } from "@/game/types";

export interface PlayGamesStatus {
  /** The build has its Play Games project id and the plugin answered. */
  configured: boolean;
  signedIn: boolean;
}

/** What the Android app's code does for the game. */
export interface PlayGamesDriver {
  signIn(): Promise<boolean>;
  showAchievements(): Promise<void>;
  showLeaderboard(id: string): Promise<void>;
}

let status: PlayGamesStatus = { configured: false, signedIn: false };
let driver: PlayGamesDriver | null = null;
const listeners = new Set<() => void>();

export function setPlayGamesStatus(next: PlayGamesStatus) {
  if (next.configured === status.configured && next.signedIn === status.signedIn) return;
  status = next;
  for (const l of listeners) l();
}

export function registerPlayGamesDriver(d: PlayGamesDriver) {
  driver = d;
}

export function usePlayGames(): PlayGamesStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

export async function playGamesSignIn(): Promise<boolean> {
  return (await driver?.signIn().catch(() => false)) ?? false;
}
export async function playGamesAchievements(): Promise<void> {
  await driver?.showAchievements().catch(() => {});
}
/** Opens the cars leaderboard (false: the build has none set up). */
export async function playGamesLeaderboard(): Promise<boolean> {
  if (!PLAY_GAMES_LEADERBOARD_CARS || !driver) return false;
  await driver.showLeaderboard(PLAY_GAMES_LEADERBOARD_CARS).catch(() => {});
  return true;
}

/** Play Games ids of the achievements the player has and Play Games has not been told about yet. */
export function pendingUnlocks(owned: readonly string[], told: ReadonlySet<string>, map: Record<string, string> = PLAY_GAMES_ACHIEVEMENTS): { game: string; play: string }[] {
  const out: { game: string; play: string }[] = [];
  for (const id of owned) {
    const play = map[id];
    if (play && !told.has(id)) out.push({ game: id, play });
  }
  return out;
}

/** The leaderboard score: cars built, a whole number (never more than a long can hold). */
export function carsScore(s: GameState): number {
  const n = Math.floor(s.lifetime.carsProduced);
  return Number.isFinite(n) && n > 0 ? Math.min(n, Number.MAX_SAFE_INTEGER) : 0;
}
