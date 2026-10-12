export const OFFLINE = {
  /** Base offline limit in hours. */
  baseCapHours: 12,
  /** Share of normal production earned while away (before bonuses). */
  baseEfficiency: 0.6,
  /** Away times shorter than this are simulated silently, without a popup. */
  minReportSeconds: 60,
};
