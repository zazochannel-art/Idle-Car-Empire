// What the game's team sends one player from the dashboard (supabase/migrations/0020): money,
// ⭐ Stars, the company's name, a message, or one of the player's cloud backups to play again.
// The server hands each command out once (save/social.ts claimCommands); the game carries it
// out here, shows it, and saves. The save lives on the player's phone, so this is the only way a
// change from the team reaches it without the two copies of the game disagreeing.
import { CITY_IDS } from "../config/cities";
import type { CityId, GameState } from "../types";
import { ownsCity, withWallet } from "./cities";
import { payReward } from "./materials";

/** The kinds this game knows: the server hands out only these (a newer kind waits for a newer game). */
export const TEAM_KINDS = ["cash", "stars", "company", "restore", "message"] as const;

/** Largest amount a command may carry (the server's limit too). */
const MAX = 1e30;

export type TeamCommand =
  | { id: number; kind: "cash"; mode: "add" | "set"; amount: number; city: CityId | "here"; note: string }
  | { id: number; kind: "stars"; mode: "add" | "set"; amount: number; note: string }
  | { id: number; kind: "company"; name: string; note: string }
  | { id: number; kind: "restore"; backup: number; madeAt: number; note: string }
  | { id: number; kind: "message"; note: string };

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The server's rows, checked: a row of an unknown kind or with a broken payload is left out. Oldest first. */
export function parseTeamCommands(rows: unknown): TeamCommand[] {
  if (!Array.isArray(rows)) return [];
  const out: TeamCommand[] = [];
  for (const raw of rows.slice(0, 20)) {
    const r = obj(raw);
    const id = num(r.id);
    const p = obj(r.payload);
    const note = typeof r.note === "string" ? r.note.trim().slice(0, 200) : "";
    if (!Number.isFinite(id)) continue;
    const mode = p.mode === "add" || p.mode === "set" ? p.mode : null;
    const amount = num(p.amount);
    switch (r.kind) {
      case "cash": {
        const city = p.city === "here" || p.city === undefined ? "here" : (CITY_IDS as readonly unknown[]).includes(p.city) ? (p.city as CityId) : null;
        if (mode && Number.isFinite(amount) && Math.abs(amount) <= MAX && city) out.push({ id, kind: "cash", mode, amount, city, note });
        break;
      }
      case "stars":
        if (mode && Number.isInteger(amount) && Math.abs(amount) <= MAX) out.push({ id, kind: "stars", mode, amount, note });
        break;
      case "company": {
        const name = typeof p.name === "string" ? p.name.trim().slice(0, 24) : "";
        if (name) out.push({ id, kind: "company", name, note });
        break;
      }
      case "restore": {
        const backup = num(p.backup);
        const madeAt = typeof p.made_at === "string" ? Date.parse(p.made_at) : NaN;
        if (Number.isFinite(backup)) out.push({ id, kind: "restore", backup, madeAt: Number.isFinite(madeAt) ? madeAt : 0, note });
        break;
      }
      case "message":
        if (note) out.push({ id, kind: "message", note });
        break;
    }
  }
  return out.sort((a, b) => a.id - b.id);
}

/** The wallet a money command goes to: the city it names when the player has it, else the one being played. */
export function teamWallet(s: GameState, c: Extract<TeamCommand, { kind: "cash" }>): CityId {
  return c.city !== "here" && ownsCity(s, c.city) ? c.city : s.activeCity;
}

/**
 * Carries out a command on the game (all but "restore", which replaces the game: game-store.ts).
 * Money never goes below 0, nor Stars; money added is booked as a reward. False: nothing to do.
 */
export function applyTeamCommand(s: GameState, c: TeamCommand): boolean {
  switch (c.kind) {
    case "cash":
      withWallet(s, teamWallet(s, c), () => {
        if (c.mode === "set") s.cash = Math.max(0, c.amount);
        else if (c.amount > 0) payReward(s, c.amount);
        else s.cash = Math.max(0, s.cash + c.amount);
      });
      return true;
    case "stars":
      s.stars = Math.max(0, Math.round(c.mode === "set" ? c.amount : s.stars + c.amount));
      return true;
    case "company":
      s.brand.name = c.name;
      return true;
    case "message":
      return true;
    case "restore":
      return false;
  }
}
