import { LOGIN_REWARDS } from "../config/login";
import { RIVALS, RIVAL_DAILY_GROWTH, type Rival } from "../config/rivals";
import type { GameState } from "../types";
import type { EconomySnapshot } from "./economy";
import { dateKey, grantReward } from "./progress";

// ───────────────────────────── daily login ─────────────────────────────

/** Moves the streak on when a new day starts. Returns true on a new day. */
export function updateLogin(s: GameState, now: number): boolean {
  const today = dateKey(now);
  const l = s.login;
  if (l.day === today) return false;
  const yesterday = dateKey(now - 86_400_000);
  l.streak = l.day === yesterday ? (l.streak % LOGIN_REWARDS.length) + 1 : 1;
  l.day = today;
  l.claimed = false;
  return true;
}

export function loginReward(s: GameState) {
  return LOGIN_REWARDS[Math.max(0, s.login.streak - 1) % LOGIN_REWARDS.length];
}

export function claimLogin(s: GameState, snap: EconomySnapshot): boolean {
  if (s.login.claimed || !s.login.day) return false;
  grantReward(s, loginReward(s), snap);
  s.login.claimed = true;
  return true;
}

// ───────────────────────────── rivals ─────────────────────────────

/** Rivals stop growing after ten years (1.05^3650 is still a finite number). */
const RIVAL_MAX_DAYS = 3650;

/** A rival's lifetime earnings: they keep growing a little every day. */
export function rivalEarned(r: Rival, s: GameState, now: number): number {
  // capped so a save with a broken start date can't grow rivals to Infinity
  const days = Math.min(RIVAL_MAX_DAYS, Math.max(0, (now - s.createdAt) / 86_400_000));
  return r.earned * Math.pow(1 + RIVAL_DAILY_GROWTH, days);
}

/** The earnings table, highest first, with the player in it. */
export function leaderboard(s: GameState, now: number) {
  const rows = [
    ...RIVALS.map((r) => ({ id: r.id as string, emoji: r.emoji, name: r.name, earned: rivalEarned(r, s, now), you: false })),
    { id: "you", emoji: "👑", name: "", earned: s.lifetime.moneyEarned, you: true },
  ];
  return rows.sort((a, b) => b.earned - a.earned);
}

/** Pays ⭐ for every rival the player has just overtaken. */
export function checkRivals(s: GameState, now: number): Rival[] {
  const beaten: Rival[] = [];
  for (const r of RIVALS) {
    if (s.rivalsBeaten.includes(r.id) || s.lifetime.moneyEarned < rivalEarned(r, s, now)) continue;
    s.rivalsBeaten.push(r.id);
    s.stars += r.stars;
    beaten.push(r);
  }
  return beaten;
}
