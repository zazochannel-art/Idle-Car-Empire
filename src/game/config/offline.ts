export const OFFLINE = {
  /** Base offline limit in hours. */
  baseCapHours: 12,
  /** Share of normal production earned while away (before bonuses). */
  baseEfficiency: 0.6,
  /**
   * The offline bonuses (research, Stars, managers, automation) count in full up to this share of
   * live production; past it each counts for less and less, so the share comes ever nearer to the
   * game played but never passes it (engine/modifiers.ts offlineShare).
   */
  softFrom: 0.8,
  /**
   * Away times shorter than this are credited without the report (a phone switching apps for a
   * minute shouldn't stop the game with a full-screen popup); from a minute on, a toast says how much.
   */
  minReportSeconds: 300,
  minToastSeconds: 60,
};
