import { ACHIEVEMENTS, type Condition } from "../config/achievements";
import {
  DAILY_CHEST,
  DAILY_COUNT,
  DAILY_REWARD_SECONDS,
  DAILY_TEMPLATES,
  MILESTONES,
  type MilestoneMission,
} from "../config/missions";
import { CARS } from "../config/cars";
import { RESEARCH } from "../config/research";
import type { GameState, MetricId, MissionState, Reward } from "../types";
import { hasPlant, plantsOf } from "./plants";
import { passiveIncome, snapshot, unlockedCarIds, type EconomySnapshot } from "./economy";
import { formatMoney, formatNumber } from "../format";
import { ledgerNet } from "./ledger";
import { isMoneyMetric } from "../config/missions";
import { PASS } from "../config/pass";
import { addPassXp, passTick } from "./pass";
import { plantsEverywhere } from "./cities";
import { dateKey, yesterdayKey } from "./calendar";
import { grantReward } from "./rewards";
export { grantReward, rewardCash } from "./rewards";
export { dateKey, yesterdayKey } from "./calendar";

export { isMoneyMetric };

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
    case "factoriesOwned":
      // the plants of every city
      return plantsEverywhere(s);
    case "dealersOwned":
      return Object.values(s.dealers).filter((d) => d.owned).length;
    case "maxFactoryLevel":
      return Math.max(0, ...plantsOf(s).map(([, b]) => b.level));
    case "carsUnlocked":
      return unlockedCarIds(s, (snap ?? snapshot(s)).gm).size;
    case "bodiesProduced":
      return s.lifetime.parts.body;
    case "enginesProduced":
      return s.lifetime.parts.engine;
    case "componentsProduced":
      return Object.values(s.lifetime.parts).reduce((a, b) => a + b, 0);
    case "deliveries":
      return s.lifetime.deliveries;
    case "carsSold":
      return s.lifetime.carsSold;
    case "plantTypes":
      return new Set(plantsOf(s).map(([, b]) => b.type)).size;
    case "carRevenue":
      return s.lifetime.carRevenue;
    case "netProfit":
      return ledgerNet(s.chain.ledger.run);
    case "carsShipped":
      return s.lifetime.carsShipped ?? 0;
    case "fullChain":
      return (["bodyWorks", "engineFactory", "tireFactory", "assemblyPlant"] as const).every((t) => hasPlant(s, t)) && s.lifetime.carsProduced > 0 ? 1 : 0;
    case "mapEvents":
      return s.lifetime.mapEvents;
    case "sportUnlocked": {
      const ids = unlockedCarIds(s, (snap ?? snapshot(s)).gm);
      return CARS.some((c) => c.class === "sport" && ids.has(c.id)) ? 1 : 0;
    }
  }
}

export function conditionProgress(s: GameState, c: Condition, snap: EconomySnapshot): { value: number; target: number } {
  switch (c.type) {
    case "metric":
      return { value: metric(s, c.metric, snap), target: c.target };
    case "carType":
      return { value: s.lifetime.carsByType[c.car], target: c.target };
    case "income":
      return { value: snap.incomePerSec, target: c.target };
  }
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
  // research needs RP, which only cars make
  const pool = DAILY_TEMPLATES.filter((t) => (t.metric !== "researchDone" || (researchLeft && eco.carsPerSec > 0)) && ((t.metric !== "carsProduced" && t.metric !== "carsSold") || eco.carsPerSec > 0) && (t.metric !== "mapEvents" || s.chain.firstCar || s.lifetime.carsProduced > 0));
  const picked: typeof pool = [];
  while (picked.length < Math.min(DAILY_COUNT, pool.length)) {
    const t = pool[Math.floor(rand() * pool.length)];
    if (!picked.includes(t)) picked.push(t);
  }
  const income = Math.max(passiveIncome(eco), 5);
  return picked.map((t, i) => {
    let target: number;
    if ("seconds" in t) {
      const parts = Object.values(eco.chain.plants).reduce((a, p) => (p.type === "assemblyPlant" ? a : a + p.unitsPerSec), 0);
      const rate = t.metric === "carsProduced" ? eco.carsPerSec : t.metric === "carsSold" ? eco.carsPerSec * 0.5 : t.metric === "moneyEarned" || t.metric === "netProfit" ? income : Math.max(parts, 0.05) * 0.6;
      target = niceNumber(Math.max(t.min, rate * t.seconds));
    } else if (t.metric === "levelsBought") {
      // a new player with one plant gets a reachable number of upgrades
      target = Math.min(t.amount, Math.max(5, 5 * Object.keys(eco.chain.plants).length));
    } else {
      target = t.amount;
    }
    const title = t.title.replace("{n}", isMoneyMetric(t.metric) ? formatMoney(target) : formatNumber(target));
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
  // every daily mission taken counts toward the season pass
  passTick(s, snap, s.lastActiveAt);
  addPassXp(s, PASS.xp.daily);
  return true;
}

// ───────────────────────────── the daily chest ─────────────────────────────


/** Days in a row the chest will have been opened if it is opened today. */
export function chestStreakToday(s: GameState, now: number): number {
  const m = s.missions;
  if (m.chestDate === dateKey(now)) return m.chestStreak;
  return m.chestDate === yesterdayKey(now) ? m.chestStreak + 1 : 1;
}

/** Whether today's chest waits: every daily mission taken, the chest not yet opened today. */
export function dailyChestReady(s: GameState, now: number): boolean {
  const m = s.missions;
  return m.daily.length > 0 && m.dailyDate === dateKey(now) && m.daily.every((d) => d.claimed) && m.chestDate !== dateKey(now);
}

/** What today's chest holds: income growing with the days in a row, RP, a star every few days in a row. */
export function dailyChestReward(s: GameState, now: number, snap?: EconomySnapshot): Reward {
  const eco = snap ?? snapshot(s);
  const streak = chestStreakToday(s, now);
  const mult = 1 + DAILY_CHEST.streakStep * (Math.min(streak, DAILY_CHEST.streakMax) - 1);
  const r: Reward = { incomeSeconds: Math.round(DAILY_CHEST.incomeSeconds * mult), rp: Math.max(10, Math.round(eco.rpPerSec * DAILY_CHEST.rpSeconds)) };
  if (streak % DAILY_CHEST.starEvery === 0) r.stars = 1;
  return r;
}

/** Opens today's chest (when it waits): its reward, or null. */
export function claimDailyChest(s: GameState, now: number): Reward | null {
  if (!dailyChestReady(s, now)) return null;
  const snap = snapshot(s);
  const r = dailyChestReward(s, now, snap);
  s.missions.chestStreak = chestStreakToday(s, now);
  s.missions.chestDate = dateKey(now);
  grantReward(s, r, snap);
  return r;
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
export function claimableCount(s: GameState, snap?: EconomySnapshot, now: number = s.lastActiveAt): number {
  const eco = snap ?? snapshot(s);
  const chest = dailyChestReady(s, now) ? 1 : 0;
  const daily = s.missions.daily.filter((m) => !m.claimed && dailyProgress(s, m, eco) >= m.target).length;
  const miles = openMilestones(s, MILESTONES.length).filter((m) => metric(s, m.metric, eco) >= m.target).length;
  return daily + miles + chest;
}

export const HISTORY_EVERY_MS = 60_000;
export const HISTORY_MAX = 240;

/** Samples income once a minute for the Statistics chart and the stall hint. */
export function recordHistory(s: GameState, now: number, income: number): boolean {
  const last = s.history[s.history.length - 1];
  if (last && now - last.t < HISTORY_EVERY_MS) return false;
  s.history.push({ t: now, income });
  if (s.history.length > HISTORY_MAX) s.history.splice(0, s.history.length - HISTORY_MAX);
  return true;
}
