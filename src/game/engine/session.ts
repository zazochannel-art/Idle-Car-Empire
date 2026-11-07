// One step of a game being played (audit P3): the simulation (engine/tick.ts) and every
// subsystem that moves with the clock while the player is in the game (dividends, auto-upgrades,
// contracts, VIP and fleet orders, the season, the pass, festivals, the story…), in one place and
// in one order. It changes the state and returns what happened as news; the store only turns the
// news into toasts and screens (store/news.ts). Scripts (bench-tick) run the same step.
import { OPENABLE_CITIES } from "../config/cities";
import type { CarId, CityId, GameEvent, GameState } from "../types";
import * as Ap from "./autopilot";
import * as Ch from "./chain";
import * as Cy from "./cities";
import * as Cl from "./classics";
import * as Cn from "./collection";
import * as K from "./contracts";
import { refreshSponsors } from "./sponsors";
import { refreshUsedLot } from "./used-cars";
import type { EconomySnapshot } from "./economy";
import { activeEvent } from "./events";
import * as Ex from "./expansion";
import * as Fe from "./festival";
import * as Lm from "./landmarks";
import * as Lv from "./live";
import * as Mb from "./map-bonus";
import * as Mk from "./market";
import * as Ps from "./pass";
import { recordHistory, refreshDaily } from "./progress";
import * as R from "./retention";
import * as St from "./stock";
import * as Sy from "./story";
import { tick as engineTick } from "./tick";
import * as Wt from "./winter";

/** The news of one step, in the order it happened. */
export type News =
  | { kind: "tick"; event: GameEvent }
  | { kind: "recall"; result: NonNullable<ReturnType<typeof Ap.autoRecall>> }
  | { kind: "rival"; rival: ReturnType<typeof R.checkRivals>[number] }
  | { kind: "contract"; what: "offer" | "expired" }
  | { kind: "sponsor"; what: "offer" | "expired" }
  | { kind: "usedLot" }
  | { kind: "eventStarted"; event: NonNullable<ReturnType<typeof activeEvent>>["event"] }
  | { kind: "daily" }
  | { kind: "vip"; what: "autoAccepted"; client: string }
  | { kind: "vip"; what: "offer"; client: string }
  | { kind: "vip"; what: "failed" }
  | { kind: "seasonOver"; rank: number }
  | { kind: "classicRestored"; id: NonNullable<ReturnType<typeof Cl.classicsTick>> }
  | { kind: "engineer"; what: "candidate"; id: string }
  | { kind: "engineer"; what: "lost" }
  | { kind: "passLeftover"; n: number }
  | { kind: "passSeason"; n: number }
  | { kind: "winter" }
  | { kind: "festival"; which: NonNullable<ReturnType<typeof Fe.festivalTick>> }
  | { kind: "landmarkFirstCar"; car: ReturnType<typeof Lm.landmarkNews>["firstCar"][number] }
  | { kind: "landmarkLevel"; up: ReturnType<typeof Lm.landmarkNews>["levelUp"][number] }
  | { kind: "cityReady"; city: CityId }
  | { kind: "fleet"; what: "autoAccepted" | "offer" | "failed" }
  | { kind: "edition"; edition: NonNullable<ReturnType<typeof Cn.editionTick>>; car: CarId | null }
  | { kind: "story"; what: "offer"; id: NonNullable<GameState["story"]["pending"]>["id"]; plot: string }
  | { kind: "story"; what: "expired" | "chapter" }
  | { kind: "protoStageDone" }
  | { kind: "trend"; hot: NonNullable<ReturnType<typeof Mk.trendOf>["hot"]> }
  | { kind: "collected"; got: ReturnType<typeof Ap.autoCollect> };

export interface SessionOptions {
  /** The Empire Map is on screen: its bonuses come and go only then. */
  mapOnScreen: boolean;
  /** What the plants' auto-upgrades may still spend (Ch.autoBudget), carried from step to step. */
  autoMoney: number;
}

/**
 * Plays `dt` seconds of the game in `s` (a copy of `prev`, the state before the step), at `now`.
 * Returns the news and what the auto-upgrades may still spend.
 */
export function sessionTick(s: GameState, prev: GameState, dt: number, now: number, snap: EconomySnapshot, opts: SessionOptions): { news: News[]; autoMoney: number } {
  const news: News[] = [];
  const cash = s.cash;
  const events = engineTick(s, dt, snap);
  s.lastActiveAt = now;
  recordHistory(s, now, snap.incomePerSec);
  // the shareholders take their part of what was just earned (engine/stock.ts)
  const earned = s.cash - cash;
  const dividends = St.payDividends(s, earned);
  St.stockTick(s, snap, now);
  // the auto-upgrades invest a share of what is left of it, never collected or reward money;
  // they buy quietly (the plant's panel shows its levels)
  let autoMoney = Ch.autoBudget(opts.autoMoney, earned - dividends, s.cash);
  const autoLog: { plot: string; cost: number }[] = [];
  Ch.autoUpgrade(s, snap.gm, autoLog, autoMoney);
  for (const p of autoLog) autoMoney -= p.cost;
  R.updateLogin(s, now);
  // a recall settled by the player's standing order: the dialog never shows
  const recall = Ap.autoRecall(s, snap);
  if (recall) news.push({ kind: "recall", result: recall });
  for (const rival of R.checkRivals(s, now)) news.push({ kind: "rival", rival });
  const deal = K.refreshContracts(s, now, snap);
  if (deal === "offer" || deal === "expired") news.push({ kind: "contract", what: deal });
  const sponsor = refreshSponsors(s, now);
  if (sponsor) news.push({ kind: "sponsor", what: sponsor });
  // the first lot comes in quietly; the later ones say so
  const hadLot = s.usedCars.lotAt > 0;
  if (refreshUsedLot(s, now, snap) && hadLot) news.push({ kind: "usedLot" });
  const ev = activeEvent(now);
  if (ev && !activeEvent(prev.lastActiveAt)) news.push({ kind: "eventStarted", event: ev.event });
  if (refreshDaily(s, now, snap)) news.push({ kind: "daily" });
  for (const event of events) news.push({ kind: "tick", event });
  const vip = Lv.vipTick(s, now, snap);
  // a VIP order the plants can already make, taken on by the standing order: one notice, not two
  const vipClient = s.vip.offer?.client;
  if (Ap.autoVip(s, now, snap)) news.push({ kind: "vip", what: "autoAccepted", client: vipClient! });
  else if (vip === "offer") news.push({ kind: "vip", what: "offer", client: s.vip.offer!.client });
  else if (vip === "failed") news.push({ kind: "vip", what: "failed" });
  if (Lv.seasonTick(s, now) && s.season.last && !s.season.last.claimed) news.push({ kind: "seasonOver", rank: s.season.last.rank });
  const restored = Cl.classicsTick(s, now);
  if (restored) news.push({ kind: "classicRestored", id: restored });
  const eng = Ex.engineersTick(s, now, dt);
  if (eng === "candidate") news.push({ kind: "engineer", what: "candidate", id: s.engineers.candidate!.id });
  else if (eng === "lost") news.push({ kind: "engineer", what: "lost" });
  // the season pass: a new season (paying what was left untaken), new weekly challenges
  const pass = Ps.passTick(s, snap, now);
  if (pass.leftover) news.push({ kind: "passLeftover", n: pass.leftover });
  if (pass.season && s.pass.season > 1 && s.lifetime.playTime > 600) news.push({ kind: "passSeason", n: s.pass.season });
  if (Wt.winterTick(s, snap, now)) news.push({ kind: "winter" });
  const fest = Fe.festivalTick(s, snap, now);
  if (fest) news.push({ kind: "festival", which: fest });
  if (opts.mapOnScreen) Mb.mapBonusTick(s, dt, now);
  // the landmark works: the first car of a territory's line, and its levels
  const lm = Lm.landmarkNews(s);
  for (const car of lm.firstCar) news.push({ kind: "landmarkFirstCar", car });
  for (const up of lm.levelUp) news.push({ kind: "landmarkLevel", up });
  // a new city can be opened (told once each)
  for (const city of OPENABLE_CITIES) {
    if (s.unlocks.includes(`notice:city:${city}`) || !Cy.cityUnlockStatus(s, city).ready) continue;
    s.unlocks.push(`notice:city:${city}`);
    news.push({ kind: "cityReady", city });
  }
  const fo = Ex.fleetOrderTick(s, now);
  if (Ap.autoFleet(s, now)) news.push({ kind: "fleet", what: "autoAccepted" });
  else if (fo === "offer" || fo === "failed") news.push({ kind: "fleet", what: fo });
  // now and then a car off the line is a limited edition
  const built = events.find((e) => e.type === "carBuilt");
  const car = built?.type === "carBuilt" ? built.car : null;
  const edition = Cn.editionTick(s, car, now);
  if (edition) news.push({ kind: "edition", edition, car });
  const story = Sy.storyTick(s, snap);
  if (story === "offer") news.push({ kind: "story", what: "offer", id: s.story.pending!.id, plot: s.story.pending!.plot });
  else if (story === "expired" || story === "chapter") news.push({ kind: "story", what: story });
  const pa = prev.proto.active;
  if (pa && prev.lastActiveAt < pa.until && now >= pa.until) news.push({ kind: "protoStageDone" });
  const trend = Mk.trendOf(s);
  if (trend.hot && trend.block !== Mk.trendOf(prev).block) news.push({ kind: "trend", hot: trend.hot });
  // finished orders and contracts cashed in by the standing order
  const got = Ap.autoCollect(s, now, snap);
  if (got.vip !== null || got.fleet || got.contract) news.push({ kind: "collected", got });
  return { news, autoMoney };
}
