// Google Play Games Services (docs/android/play-games.md): which Play Games achievement and
// leaderboard each of the game's own is. The ids come from Play Console > Play Games Services >
// Achievements / Leaderboards (they look like "CgkI…"); until they are filled in here, and the
// build has its PLAY_GAMES_APP_ID, Play Games does nothing. Not secrets: they are in every
// player's app.

/** The game's achievement id (config/achievements.ts) → the Play Games achievement id. */
export const PLAY_GAMES_ACHIEVEMENTS: Record<string, string> = {};

/** Play Games leaderboard of the cars a company has built (a whole number, higher is better). */
export const PLAY_GAMES_LEADERBOARD_CARS = "";

/** At most this often a better score is sent (ms). */
export const PLAY_GAMES_SCORE_EVERY_MS = 5 * 60_000;
