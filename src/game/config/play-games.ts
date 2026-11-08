// Google Play Games Services (docs/android/play-games.md): which Play Games achievement and
// leaderboard each of the game's own is. The ids come from Play Console > Play Games Services >
// Achievements / Leaderboards (they look like "CgkI…"); until they are filled in here, and the
// build has its PLAY_GAMES_APP_ID, Play Games does nothing. Not secrets: they are in every
// player's app.

/** The game's achievement id (config/achievements.ts) → the Play Games achievement id. */
export const PLAY_GAMES_ACHIEVEMENTS: Record<string, string> = {
  first_body: "CgkIvNeqv9IIEAIQGw",
  panel_beater: "CgkIvNeqv9IIEAIQEA",
  second_factory: "CgkIvNeqv9IIEAIQCw",
  first_engine: "CgkIvNeqv9IIEAIQFw",
  first_hire: "CgkIvNeqv9IIEAIQCg",
  logistics: "CgkIvNeqv9IIEAIQCQ",
  scientist: "CgkIvNeqv9IIEAIQEg",
  millionaire: "CgkIvNeqv9IIEAIQGA",
  supply_chain: "CgkIvNeqv9IIEAIQEw",
  first_car: "CgkIvNeqv9IIEAIQEQ",
  first_customer: "CgkIvNeqv9IIEAIQAg",
  showroom: "CgkIvNeqv9IIEAIQFA",
  mega_factory: "CgkIvNeqv9IIEAIQFQ",
  dealer_network: "CgkIvNeqv9IIEAIQHA",
  ten_factories: "CgkIvNeqv9IIEAIQAA",
  tycoon: "CgkIvNeqv9IIEAIQDw",
  mass_production: "CgkIvNeqv9IIEAIQFg",
  sports_debut: "CgkIvNeqv9IIEAIQBA",
  luxury_debut: "CgkIvNeqv9IIEAIQCA",
  supercar_maker: "CgkIvNeqv9IIEAIQGQ",
  money_printer: "CgkIvNeqv9IIEAIQDA",
  hypercar_first: "CgkIvNeqv9IIEAIQAw",
  beyond_limits: "CgkIvNeqv9IIEAIQBQ",
  automotive_empire: "CgkIvNeqv9IIEAIQBw",
  trillionaire: "CgkIvNeqv9IIEAIQAQ",
  electric_era: "CgkIvNeqv9IIEAIQDg",
  autonomous_era: "CgkIvNeqv9IIEAIQGg",
  hypercar_legend: "CgkIvNeqv9IIEAIQDQ",
  flagship: "CgkIvNeqv9IIEAIQBg",
};

/** Play Games leaderboard of the cars a company has built (a whole number, higher is better). */
export const PLAY_GAMES_LEADERBOARD_CARS = "CgkIvNeqv9IIEAIQHQ";

/** At most this often a better score is sent (ms). */
export const PLAY_GAMES_SCORE_EVERY_MS = 5 * 60_000;
