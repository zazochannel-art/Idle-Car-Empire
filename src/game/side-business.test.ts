import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { snapshot } from "./engine/economy";
import * as Qc from "./engine/quality-check";
import * as Sp from "./engine/sponsors";
import { createInitialState } from "./engine/state";
import * as Uc from "./engine/used-cars";
import { decodeSave, encodeSave } from "./save/serialize";

const NOW = new Date(2026, 9, 12, 12).getTime();
const H = 3_600_000;

describe("sponsor deals", () => {
  it("are offered only once racing is open: three deals, harder ones pay more", () => {
    const s = createInitialState(NOW);
    s.racing.unlocked = false;
    expect(Sp.refreshSponsors(s, NOW)).toBeNull();
    s.racing.unlocked = true;
    expect(Sp.refreshSponsors(s, NOW)).toBe("offer");
    expect(s.sponsors.offers).toHaveLength(3);
    expect(new Set(s.sponsors.offers.map((o) => o.brand)).size).toBe(3);
    const [a, b, c] = s.sponsors.offers;
    expect(a.wins).toBeLessThan(b.wins);
    expect(b.wins).toBeLessThan(c.wins);
    expect(c.reward.incomeSeconds!).toBeGreaterThan(a.reward.incomeSeconds!);
    // a reload in the same minute brings the same offers
    const t = createInitialState(NOW);
    t.createdAt = s.createdAt;
    t.racing.unlocked = true;
    Sp.refreshSponsors(t, NOW);
    expect(t.sponsors.offers).toEqual(s.sponsors.offers);
  });

  it("count only the wins after signing and pay once, before the deadline", () => {
    const s = createInitialState(NOW);
    s.racing.unlocked = true;
    s.racing.stats.wins = 7;
    Sp.refreshSponsors(s, NOW);
    expect(Sp.signSponsor(s, 0, NOW)).toBe(true);
    const d = s.sponsors.active!;
    expect(s.sponsors.offers).toEqual([]);
    expect(d.deadline).toBe(NOW + d.hours * H);
    expect(Sp.sponsorProgress(s, d)).toBe(0);
    const snap = snapshot(s);
    expect(Sp.claimSponsor(s, snap, NOW)).toBeNull();
    s.racing.stats.wins += d.wins;
    expect(Sp.sponsorWaiting(s)).toBe(true);
    const cash = s.cash;
    const money = Sp.claimSponsor(s, snap, NOW + H);
    expect(money).toBeGreaterThan(0);
    expect(s.cash).toBeCloseTo(cash + money!);
    expect(s.sponsors.done).toBe(1);
    expect(Sp.claimSponsor(s, snap, NOW + H)).toBeNull();
    // the next offers come a little later
    expect(Sp.refreshSponsors(s, NOW + H)).toBeNull();
    expect(Sp.refreshSponsors(s, NOW + H + Sp.SPONSOR.afterDone)).toBe("offer");
  });

  it("run out if the wins don't come in time", () => {
    const s = createInitialState(NOW);
    s.racing.unlocked = true;
    Sp.refreshSponsors(s, NOW);
    Sp.signSponsor(s, 2, NOW);
    const d = s.sponsors.active!;
    expect(Sp.refreshSponsors(s, d.deadline! + 1)).toBe("expired");
    expect(s.sponsors.active).toBeNull();
    expect(Sp.refreshSponsors(s, d.deadline! + 2)).toBeNull();
  });

  it("can be turned down, and a save keeps them", () => {
    const s = createInitialState(NOW);
    s.racing.unlocked = true;
    Sp.refreshSponsors(s, NOW);
    expect(Sp.declineSponsors(s, NOW)).toBe(true);
    expect(s.sponsors.offers).toEqual([]);
    Sp.refreshSponsors(s, s.sponsors.nextAt);
    Sp.signSponsor(s, 1, s.sponsors.nextAt);
    const back = decodeSave(encodeSave(s), NOW);
    expect(back.sponsors).toEqual(s.sponsors);
    expect(Sp.migrateSponsors({ offers: [{ brand: "nope", wins: 3 }], active: "x", done: -2 })).toEqual(Sp.createSponsors());
  });
});

function earning() {
  const s = createInitialState(NOW);
  return { s, snap: snapshot(s) };
}

describe("the second-hand lot", () => {
  it("brings three worn cars every few hours, priced so a refurbished one sells at a profit", () => {
    const { s, snap } = earning();
    expect(Uc.refreshUsedLot(s, NOW, snap)).toBe(true);
    expect(s.usedCars.lot).toHaveLength(Uc.USED.cars);
    // a new company has no income yet: the floor price
    expect(Math.min(...s.usedCars.lot.map((c) => c.sell))).toBeGreaterThanOrEqual(Uc.USED.min * 0.8 * Uc.USED.sell - 1);
    for (const c of s.usedCars.lot) {
      expect(Object.hasOwn(CAR_BY_ID, c.car)).toBe(true);
      expect(c.cond).toBeGreaterThanOrEqual(0.3);
      expect(c.cond).toBeLessThanOrEqual(0.8);
      expect(c.sell).toBeGreaterThan(c.buy + c.fix);
    }
    expect(Uc.refreshUsedLot(s, NOW + H, snap)).toBe(false);
    expect(Uc.refreshUsedLot(s, NOW + Uc.USED.every, snap)).toBe(true);
  });

  it("buy, refurbish, wait, sell: one car in the bay at a time", () => {
    const { s, snap } = earning();
    Uc.refreshUsedLot(s, NOW, snap);
    const [c, d] = s.usedCars.lot;
    s.cash = 0;
    expect(Uc.buyBlock(s, c.id)).toBe("cash");
    s.cash = c.buy + c.fix + d.buy;
    expect(Uc.buyUsed(s, c.id)).toBe(true);
    expect(s.usedCars.lot.some((x) => x.id === c.id)).toBe(false);
    expect(Uc.buyBlock(s, d.id)).toBe("bay");
    expect(Uc.buyBlock(s, c.id)).toBe("gone");
    expect(Uc.sellUsed(s, NOW)).toBeNull();
    expect(Uc.refurbishUsed(s, NOW)).toBe(true);
    expect(Uc.usedReady(s, NOW + 60_000)).toBe(false);
    const done = NOW + c.minutes * 60_000;
    expect(Uc.usedReady(s, done)).toBe(true);
    const cash = s.cash;
    expect(Uc.sellUsed(s, done)).toBe(c.sell);
    expect(s.cash).toBe(cash + c.sell);
    expect(s.usedCars.bay).toBeNull();
    expect(s.usedCars.sold).toBe(1);
    expect(s.usedCars.profit).toBe(c.sell - c.buy - c.fix);
  });

  it("a save keeps the bay; an unknown model is dropped", () => {
    const { s, snap } = earning();
    Uc.refreshUsedLot(s, NOW, snap);
    s.cash = 1e12;
    Uc.buyUsed(s, s.usedCars.lot[0].id);
    const back = decodeSave(encodeSave(s), NOW);
    expect(back.usedCars).toEqual(s.usedCars);
    const m = Uc.migrateUsedCars({ lot: [{ ...s.usedCars.lot[0], car: "rocket" }], bay: { ...s.usedCars.bay!, car: "rocket" } }, (id) => Object.hasOwn(CAR_BY_ID, id));
    expect(m.lot).toEqual([]);
    expect(m.bay).toBeNull();
  });
});

describe("quality control", () => {
  it("rolls twelve cars with a few defects", () => {
    const s = createInitialState(NOW);
    const round = Qc.qcRound(s);
    expect(round).toHaveLength(Qc.QC.cars);
    const bad = round.filter(Boolean).length;
    expect(bad).toBeGreaterThanOrEqual(3);
    expect(bad).toBeLessThanOrEqual(5);
  });

  it("scores the catches, minus wrong taps", () => {
    expect(Qc.qcScore(4, 4, 0)).toBe(100);
    expect(Qc.qcScore(4, 2, 0)).toBe(50);
    expect(Qc.qcScore(4, 4, 2)).toBeLessThan(100);
    expect(Qc.qcScore(4, 0, 5)).toBe(0);
  });

  it("pays for a perfect run, raises the reputation, then waits", () => {
    const s = createInitialState(NOW);
    const snap = snapshot(s);
    // nothing to hand in before an inspection starts
    expect(Qc.finishQc(s, Qc.qcRound(s), [], snap, NOW)).toBeNull();
    const round = Qc.startQc(s, NOW)!;
    expect(round).toHaveLength(Qc.QC.cars);
    const bad = round.flatMap((d, i) => (d ? [i] : []));
    s.quality.rep = 50;
    const cash = s.cash;
    const out = Qc.finishQc(s, round, bad, snap, NOW + 15_000)!;
    expect(out.score).toBe(100);
    expect(out.money).toBeGreaterThan(0);
    expect(s.cash).toBeCloseTo(cash + out.money);
    expect(s.quality.rep).toBeCloseTo(50 + Qc.QC.rep);
    expect(s.qc.best).toBe(100);
    // handed in once; the break counts from the start
    expect(Qc.finishQc(s, round, bad, snap, NOW + 20_000)).toBeNull();
    expect(Qc.qcReady(s, NOW + 60_000)).toBe(false);
    expect(Qc.qcReady(s, NOW + Qc.QC.cooldown)).toBe(true);
  });

  it("an inspection left half-way is used up, and its round doesn't come back", () => {
    const s = createInitialState(NOW);
    const snap = snapshot(s);
    const first = Qc.startQc(s, NOW)!;
    // too late to hand it in
    expect(Qc.finishQc(s, first, [], snap, NOW + Qc.QC.cars * Qc.QC.carMs + Qc.QC.graceMs + 1)).toBeNull();
    expect(Qc.startQc(s, NOW + 60_000)).toBeNull();
    const next = Qc.startQc(s, NOW + Qc.QC.cooldown);
    expect(next).not.toBeNull();
  });

  it("a few inspections a day at most", () => {
    const s = createInitialState(NOW);
    let t = NOW;
    const day = new Date(NOW).getDate();
    let n = 0;
    while (new Date(t).getDate() === day && Qc.startQc(s, t)) {
      n++;
      t += Qc.QC.cooldown;
    }
    if (new Date(t).getDate() === day) {
      expect(n).toBe(Qc.QC.perDay);
      expect(Qc.qcBlock(s, t)).toBe("limit");
    }
    expect(Qc.qcReady(s, NOW + 2 * 86_400_000)).toBe(true);
    const back = migrateQcRoundTrip(s);
    expect(back).toEqual(s.qc);
  });

  it("tapping every car does not pay like a perfect run", () => {
    const s = createInitialState(NOW);
    const round = Qc.startQc(s, NOW)!;
    const out = Qc.finishQc(s, round, round.map((_, i) => i), snapshot(s), NOW + 1_000)!;
    expect(out.score).toBeLessThan(100);
  });
});

function migrateQcRoundTrip(s: ReturnType<typeof createInitialState>) {
  return Qc.migrateQc(JSON.parse(JSON.stringify(s.qc)));
}

describe("the economy's limits", () => {
  it("the partner deals pay one Star a day at most", () => {
    const s = createInitialState(NOW);
    const snap = snapshot(s);
    s.racing.unlocked = true;
    const big = Sp.SPONSOR_TIERS.length - 1;
    const run = (t: number) => {
      Sp.refreshSponsors(s, t);
      expect(Sp.signSponsor(s, big, t)).toBe(true);
      s.racing.stats.wins += Sp.SPONSOR_TIERS[big].wins;
      const stars = s.stars;
      expect(Sp.claimSponsor(s, snap, t + 60_000)).not.toBeNull();
      return s.stars - stars;
    };
    expect(run(NOW)).toBe(Sp.SPONSOR_TIERS[big].stars);
    expect(run(NOW + Sp.SPONSOR.afterDone + 120_000)).toBe(0);
    expect(run(NOW + 86_400_000)).toBe(Sp.SPONSOR_TIERS[big].stars);
  });

  it("a reward in seconds of income is worth no more during the ×2 boost", () => {
    const s = createInitialState(NOW);
    s.chain.steady = 1_000;
    s.chain.steadyBase = 1_000;
    const before = snapshot(s).rewardIncomePerSec;
    s.ads.boostLeft = 1_800;
    // the steady average catches up with the doubled sales; the base one doesn't
    s.chain.steady = 2_000;
    const snap = snapshot(s);
    expect(snap.gm.tempIncome).toBeGreaterThanOrEqual(2);
    expect(snap.rewardIncomePerSec).toBeCloseTo(before);
  });

  it("the starter pack and the premium tiers pay a floor to a young company", async () => {
    const { starterReward } = await import("./engine/iap");
    const { rewardCash } = await import("./engine/rewards");
    const { PREMIUM_TIERS } = await import("./config/pass");
    const { IAP } = await import("./config/iap");
    const snap = snapshot(createInitialState(NOW));
    expect(rewardCash(starterReward(snap), snap)).toBeGreaterThanOrEqual(IAP.starterCashMin);
    expect(rewardCash(PREMIUM_TIERS[0].reward, snap)).toBeGreaterThanOrEqual(2_000);
  });

  it("VIP orders pay Stars only when Premium-built, three a day at most", async () => {
    const Lv = await import("./engine/live");
    const { VIP } = await import("./config/live");
    const s = createInitialState(NOW);
    let got = 0;
    for (let i = 0; i < 6; i++) {
      s.vip.active = { id: `v${i}`, client: "ceo", car: "city", color: "red", premium: true, n: 1, made: 1, minutes: 60, pay: 1, stars: VIP.premiumStars } as never;
      const before = s.stars;
      expect(Lv.claimVip(s, NOW + i * 60_000)).toBe(true);
      got += s.stars - before;
    }
    expect(got).toBe(VIP.starsPerDay);
    expect(Lv.vipStarsLeft(s, NOW + 86_400_000)).toBe(VIP.starsPerDay);
  });
});
