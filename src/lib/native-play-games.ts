// Google Play Games on Android (the game's own plugin: android/.../PlayGamesPlugin.java). Loaded
// only inside the app (lib/native.ts). Nothing happens unless the build has its Play Games project
// id (PLAY_GAMES_APP_ID) and the ids of config/play-games.ts are filled in.
import { registerPlugin } from "@capacitor/core";
import { PLAY_GAMES_LEADERBOARD_CARS, PLAY_GAMES_SCORE_EVERY_MS } from "@/game/config/play-games";
import { useGame } from "@/store/game-store";
import { carsScore, pendingUnlocks, registerPlayGamesDriver, setPlayGamesStatus } from "./play-games";
import { platform } from "./platform";

interface PlayGamesPlugin {
  status(): Promise<{ configured: boolean; signedIn: boolean }>;
  signIn(): Promise<{ configured: boolean; signedIn: boolean }>;
  unlock(o: { id: string }): Promise<void>;
  submitScore(o: { id: string; score: number }): Promise<void>;
  showAchievements(): Promise<void>;
  showLeaderboard(o: { id: string }): Promise<void>;
}

const TOLD_KEY = "idle-car-empire:pgs-told";

function readTold(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(TOLD_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeTold(told: Set<string>) {
  try {
    localStorage.setItem(TOLD_KEY, JSON.stringify([...told]));
  } catch {
    // storage off: they are sent again next time, which Play Games ignores
  }
}

let started = false;

export async function startPlayGames() {
  if (started || platform() !== "android") return;
  started = true;
  const pg = registerPlugin<PlayGamesPlugin>("PlayGames");
  let st = await pg.status().catch(() => ({ configured: false, signedIn: false }));
  setPlayGamesStatus(st);
  if (!st.configured) return;
  registerPlayGamesDriver({
    signIn: async () => {
      st = await pg.signIn().catch(() => st);
      setPlayGamesStatus(st);
      if (st.signedIn) void sync();
      return st.signedIn;
    },
    showAchievements: () => pg.showAchievements(),
    showLeaderboard: (id) => pg.showLeaderboard({ id }),
  });
  const told = readTold();
  let lastScore = 0;
  let lastScoreAt = 0;
  async function sync() {
    if (!st.signedIn) return;
    const g = useGame.getState();
    if (!g.ready) return;
    const pending = pendingUnlocks(g.state.achievements, told);
    for (const p of pending) {
      await pg.unlock({ id: p.play }).catch(() => {});
      told.add(p.game);
    }
    if (pending.length) writeTold(told);
    const score = carsScore(g.state);
    const now = Date.now();
    if (PLAY_GAMES_LEADERBOARD_CARS && score > lastScore && now - lastScoreAt >= PLAY_GAMES_SCORE_EVERY_MS) {
      lastScore = score;
      lastScoreAt = now;
      await pg.submitScore({ id: PLAY_GAMES_LEADERBOARD_CARS, score }).catch(() => {});
    }
  }
  // play games signs the player in by itself when the game starts; ask again a little later, then at each new achievement
  if (!st.signedIn) {
    for (const wait of [3000, 10000]) {
      await new Promise((r) => setTimeout(r, wait));
      st = await pg.status().catch(() => st);
      setPlayGamesStatus(st);
      if (st.signedIn) break;
    }
  }
  void sync();
  let count = useGame.getState().state.achievements.length;
  useGame.subscribe((g) => {
    if (g.state.achievements.length !== count) {
      count = g.state.achievements.length;
      void sync();
    }
  });
  setInterval(() => void sync(), PLAY_GAMES_SCORE_EVERY_MS);
}
