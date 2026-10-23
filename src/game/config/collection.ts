// Things to collect and show off: a style for each plant's halls, and the
// limited editions that roll off the assembly lines now and then.

/** A plant's hall style: "auto" follows its level (workshop, factory, high-tech). */
export type SkinId = "auto" | "retro" | "modern" | "hightech" | "neon" | "industrial" | "chrome" | "gold";

export interface SkinConfig {
  id: SkinId;
  icon: string;
  /** What opens it (none: always open). */
  unlock?: { type: "achievements"; n: number } | { type: "chapters"; n: number } | { type: "pass" };
}

export const SKINS: SkinConfig[] = [
  { id: "auto", icon: "✨" },
  { id: "retro", icon: "🧱" },
  { id: "modern", icon: "🏭" },
  { id: "hightech", icon: "🔬" },
  { id: "industrial", icon: "⚙️", unlock: { type: "chapters", n: 2 } },
  { id: "neon", icon: "🌃", unlock: { type: "achievements", n: 15 } },
  // won on the season pass (config/pass.ts)
  { id: "chrome", icon: "🪞", unlock: { type: "pass" } },
  { id: "gold", icon: "🥇", unlock: { type: "pass" } },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((k) => [k.id, k])) as Record<SkinId, SkinConfig>;

/** A limited edition: a finish only a few cars ever get. */
export interface EditionConfig {
  id: "gold" | "carbon" | "pearl" | "midnight" | "racing" | "chrome" | "camo" | "sunset" | "arctic" | "royal" | "mint" | "copper";
  icon: string;
  /** The finish: its base colour and its sheen. */
  color: string;
  shine: string;
}

/** In the order they come off the line. */
export const EDITIONS: EditionConfig[] = [
  { id: "racing", icon: "🏁", color: "#dc2626", shine: "#fef2f2" },
  { id: "pearl", icon: "🦪", color: "#e2e8f0", shine: "#ffffff" },
  { id: "midnight", icon: "🌙", color: "#1e3a8a", shine: "#93c5fd" },
  { id: "sunset", icon: "🌅", color: "#f97316", shine: "#fde68a" },
  { id: "carbon", icon: "🕸️", color: "#1f2937", shine: "#6b7280" },
  { id: "mint", icon: "🍃", color: "#34d399", shine: "#d1fae5" },
  { id: "copper", icon: "🥉", color: "#b45309", shine: "#fcd34d" },
  { id: "arctic", icon: "❄️", color: "#7dd3fc", shine: "#f0f9ff" },
  { id: "camo", icon: "🪖", color: "#4d5d3a", shine: "#a3b18a" },
  { id: "royal", icon: "👑", color: "#6d28d9", shine: "#ddd6fe" },
  { id: "chrome", icon: "🪞", color: "#94a3b8", shine: "#f8fafc" },
  { id: "gold", icon: "🥇", color: "#ca8a04", shine: "#fef08a" },
];

export const EDITION_BY_ID = Object.fromEntries(EDITIONS.map((e) => [e.id, e])) as Record<EditionConfig["id"], EditionConfig>;

export const EDITION = {
  /** Play time (s) before the first one… */
  first: 20 * 60,
  /** …then one every 30–60 minutes of play, as long as cars are being built. */
  every: 30 * 60,
  spread: 30 * 60,
  /** Each edition in the collection: +1% income for good (kept through every reset); the full set adds 5% more. */
  income: 0.01,
  fullSet: 0.05,
} as const;
