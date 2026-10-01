import { ACHIEVEMENTS, type Condition } from "../config/achievements";
import { FACTORIES } from "../config/factories";
import {
  DAILY_COUNT,
  DAILY_REWARD_SECONDS,
  DAILY_TEMPLATES,
  MILESTONES,
  type MilestoneMission,
} from "../config/missions";
import { RESEARCH } from "../config/research";
import type { GameState, MetricId, MissionState, Reward } from "../types";
import { passiveIncome, snapshot, unlockedCarIds, type EconomySnapshot } from "./economy";
import { formatMoney, formatNumber } from "../format";

export function metric(s: GameState, id: MetricId, snap?: EconomySnapshot): number {
  switch (id) {
    case "carsProduced":
      return s.lifetime.carsProduced;
    case "moneyEarned":
      return s.lifetime.moneyEarned;
    case "levelsBought":
      return s.lifetime.levelsBought;
    case "upgradesBought":
      return s.lifetime.upgradesBought;
    case "researchDone":
      return s.lifetime.researchDone;
    case "managersHired":
      return s.lifetime.managersHired;
    case "prestigeCount":
      return s.prestigeCount;
    case "factoriesOwned":
      return FACTORIES.filter((f) => s.factories[f.id].owned).length;
    case "dealersOwned":
      return Object.values(s.dealers).filter((d) => d.owned).length;
    case "maxFactoryLevel":
      return Math.max(...FACTORIES.filter((f) => s.factories[f.id].owned).map((f) => s.factories[f.id].level));
    case "carsUnlocked":
      return unlockedCarIds(s, (snap ?? snapshot(s)).gm).size;
  }
}

export function conditionProgress(s: GameState, c: Condition, snap: EconomySnapshot): { value: number; target: number } {
  switch (c.type) {
    case "metric":
      return { value: metric(s, c.metric, snap), target: c.target };
    case "carType":
      return { value: s.lifetime.carsByType[c.car], target: c.target };
    case "continents": {
      const set = new Set(FACTORIES.filter((f) => s.factories[f.id].owned).map((f) => f.continent));
      return { value: set.size, target: c.target };
    }
    case "income":
      return { value: snap.incomePerSec, target: c.target };
    case "empirePoints":
      return { value: s.empirePoints, target: c.target };
  }
}

/** Cash value of a reward right now (incomeSeconds scales with production). */
export function rewardCash(r: Reward, snap: EconomySnapshot): number {
  const income = Math.max(passiveIncome(snap), 5);
  return (r.cash ?? 0) + (r.incomeSeconds ?? 0) * income;
}

/** Rewards go straight to the wallet; they are not "earned" (no prestige credit). */
export function grantReward(s: GameState, r: Reward, snap: EconomySnapshot) {
  s.cash += rewardCash(r, snap);
  if (r.rp) s.rp += r.rp;
}

/** Unlocks every achievement whose condition is met and pays its reward. */
export function checkAchievements(s: GameState, snap?: EconomySnapshot): string[] {
  const eco = snap ?? snapshot(s);
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    const p = conditionProgress(s, a.condition, eco);
    if (p.value >= p.target) {
      s.achievements.push(a.id);
      grantReward(s, a.reward, eco);
      fresh.push(a.id);
    }
  }
  return fresh;
}

// ───────────────────────────── missions ─────────────────────────────

export function dateKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Rounds to 2 significant digits so targets read nicely (12,345 → 12,000). */
export function niceNumber(n: number): number {
  if (n < 100) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / p) * p;
}

export function generateDaily(s: GameState, now: number, snap?: EconomySnapshot): MissionState[] {
  const eco = snap ?? snapshot(s);
  const key = dateKey(now);
  const rand = seeded(`${key}:${s.createdAt}`);
  const researchLeft = RESEARCH.some((r) => !s.research.includes(r.id));
  const pool = DAILY_TEMPLATES.filter((t) => t.metric !== "researchDone" || researchLeft);
  const picked: typeof pool = [];
  while (picked.length < Math.min(DAILY_COUNT, pool.length)) {
    const t = pool[Math.floor(rand() * pool.length)];
    if (!picked.includes(t)) picked.push(t);
  }
  const income = Math.max(passiveIncome(eco), 5);
  return picked.map((t, i) => {
    let target: number;
    if ("seconds" in t) {
      const rate = t.metric === "carsProduced" ? Math.max(eco.carsPerSec, 0.1) : income;
      target = niceNumber(Math.max(t.min, rate * t.seconds));
    } else {
      target = t.amount;
    }
    const title = t.title.replace("{n}", t.metric === "moneyEarned" ? formatMoney(target) : formatNumber(target));
    return {
      id: `daily_${key}_${i}`,
      title,
      metric: t.metric,
      target,
      start: metric(s, t.metric, eco),
      reward: { incomeSeconds: DAILY_REWARD_SECONDS, rp: Math.max(5, Math.round(eco.rpPerSec * 300)) },
      claimed: false,
    };
  });
}

/** Hands out a fresh set of daily missions when the local date changes. */
export function refreshDaily(s: GameState, now: number, snap?: EconomySnapshot): boolean {
  const key = dateKey(now);
  if (s.missions.dailyDate === key && s.missions.daily.length > 0) return false;
  s.missions.dailyDate = key;
  s.missions.daily = generateDaily(s, now, snap);
  return true;
}

export function dailyProgress(s: GameState, m: MissionState, snap?: EconomySnapshot): number {
  return Math.max(0, metric(s, m.metric, snap) - m.start);
}

export function claimDaily(s: GameState, id: string): boolean {
  const m = s.missions.daily.find((d) => d.id === id);
  if (!m || m.claimed) return false;
  const snap = snapshot(s);
  if (dailyProgress(s, m, snap) < m.target) return false;
  m.claimed = true;
  grantReward(s, m.reward, snap);
  return true;
}

/** Next milestone missions to show: the unclaimed ones, in order. */
export function openMilestones(s: GameState, count = 3): MilestoneMission[] {
  return MILESTONES.filter((m) => !s.missions.milestonesClaimed.includes(m.id)).slice(0, count);
}

export function claimMilestone(s: GameState, id: string): boolean {
  const m = MILESTONES.find((x) => x.id === id);
  if (!m || s.missions.milestonesClaimed.includes(id)) return false;
  const snap = snapshot(s);
  if (metric(s, m.metric, snap) < m.target) return false;
  s.missions.milestonesClaimed.push(id);
  grantReward(s, m.reward, snap);
  return true;
}

/** Count of rewards waiting to be claimed — drives the nav badge. */
export function claimableCount(s: GameState, snap?: EconomySnapshot): number {
  const eco = snap ?? snapshot(s);
  const daily = s.missions.daily.filter((m) => !m.claimed && dailyProgress(s, m, eco) >= m.target).length;
  const miles = openMilestones(s, MILESTONES.length).filter((m) => metric(s, m.metric, eco) >= m.target).length;
  return daily + miles;
}
