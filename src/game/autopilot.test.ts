import { describe, expect, it } from "vitest";
import { CAR_BY_ID } from "./config/cars";
import { RECALL } from "./config/market";
import { WHATS_NEW } from "./config/whats-new";
import * as Ap from "./engine/autopilot";
import { carValue, plantsOf } from "./engine/chain";
import { snapshot, type EconomySnapshot } from "./engine/economy";
import { recallCost } from "./engine/market";
import { createInitialState } from "./engine/state";
import { migrate } from "./save/serialize";
import type { CarId, GameState } from "./types";

const T0 = Date.UTC(2026, 9, 25, 20);

/** A company whose first plant makes `car` on its line (a snapshot that says so). */
function making(car: CarId, premium = false) {
  const s = createInitialState(T0);
  const [id, b] = plantsOf(s)[0];
  if (premium) b.plant.mode = "premium";
  const snap = snapshot(s);
  const fake = { ...snap, chain: { ...snap.chain, plants: { ...snap.chain.plants, [id]: { ...snap.chain.plants[id], car: CAR_BY_ID[car] } } } } as EconomySnapshot;
  return { s, snap: fake };
}

const vipOffer = (s: GameState, car: CarId, premium = false) =>
  (s.vip.offer = { id: "v1", client: "royal" as never, car, color: s.designs[car].color, premium, n: 3, minutes: 20, pay: 1e6, stars: 1, expires: T0 + 600_000 });

describe("automatic decisions", () => {
  it("a recall: asked by default, paid when the cash is there, or ignored", () => {
    const s = createInitialState(T0);
    const snap = snapshot(s);
    s.quality.recall = { car: "city", cars: 4 };
    expect(Ap.autoRecall(s, snap)).toBeNull();
    expect(s.quality.recall).not.toBeNull();
    // paid: the cost the recall dialog shows
    s.settings.autoRecall = "pay";
    const cost = recallCost(s, carValue(s, CAR_BY_ID.city, snap.gm));
    s.cash = cost - 1;
    expect(Ap.autoRecall(s, snap)).toBeNull();
    expect(s.quality.recall).not.toBeNull();
    s.cash = cost + 100;
    const rep = s.quality.rep;
    expect(Ap.autoRecall(s, snap)).toEqual({ paid: cost });
    expect(s.cash).toBeCloseTo(100);
    expect(s.quality.recall).toBeNull();
    expect(s.quality.rep).toBeCloseTo(Math.min(100, rep + RECALL.repPaid));
    // ignored
    s.quality.recall = { car: "city", cars: 4 };
    s.settings.autoRecall = "ignore";
    const out = Ap.autoRecall(s, snap);
    expect(out && "ignored" in out && ["scandal", "quiet"].includes(out.ignored)).toBe(true);
    expect(s.quality.recall).toBeNull();
  });

  it("a VIP order is taken on only when the plants already make it: model, paint, Premium", () => {
    const { s, snap } = making("city");
    vipOffer(s, "city");
    expect(Ap.autoVip(s, T0, snap)).toBe(false); // switched off
    s.settings.autoVip = true;
    // another paint
    const color = s.designs.city.color;
    s.designs.city.color = "#123456";
    expect(Ap.vipDeliverable(s, s.vip.offer!, snap)).toBe(false);
    s.designs.city.color = color;
    // another model
    expect(Ap.vipDeliverable(s, { ...s.vip.offer!, car: "sedan" }, snap)).toBe(false);
    // Premium asked, the line is not
    expect(Ap.vipDeliverable(s, { ...s.vip.offer!, premium: true }, snap)).toBe(false);
    expect(Ap.vipDeliverable(making("city", true).s, { ...s.vip.offer!, premium: true }, making("city", true).snap)).toBe(true);
    expect(Ap.autoVip(s, T0, snap)).toBe(true);
    expect(s.vip.offer).toBeNull();
    expect(s.vip.active?.deadline).toBe(T0 + 20 * 60_000);
  });

  it("a fleet order is taken on; finished orders and contracts are cashed in", () => {
    const s = createInitialState(T0);
    s.fleet.order = { client: "post" as never, product: "bus", n: 5, minutes: 30, made: 0, expires: T0 + 60_000 };
    expect(Ap.autoFleet(s, T0)).toBe(false);
    s.settings.autoFleet = true;
    expect(Ap.autoFleet(s, T0)).toBe(true);
    expect(s.fleet.order?.deadline).toBe(T0 + 30 * 60_000);
    expect(s.fleet.product).toBe("bus");
    expect(Ap.autoFleet(s, T0)).toBe(false); // already taken on
    // cashing in: nothing while switched off, then the finished ones
    const snap = snapshot(s);
    s.fleet.order!.made = 5;
    vipOffer(s, "city");
    s.vip.active = { ...s.vip.offer!, expires: undefined, made: 3, deadline: T0 + 60_000 };
    s.vip.offer = null;
    expect(Ap.autoCollect(s, T0, snap)).toEqual({ vip: null, fleet: false, contract: false });
    s.settings.autoCollect = true;
    const cash = s.cash;
    const stars = s.stars;
    expect(Ap.autoCollect(s, T0, snap)).toEqual({ vip: 1e6, fleet: true, contract: false });
    expect(s.cash).toBeCloseTo(cash + 1e6);
    expect(s.stars).toBe(stars + 1);
    expect(s.vip.active).toBeNull();
    expect(s.fleet.order).toBeNull();
  });

  it("saves keep the standing orders within bounds; the what's-new card is for saves from before it", () => {
    const s = createInitialState(T0);
    expect(s.settings).toMatchObject({ autoRecall: "ask", autoVip: false, autoFleet: false, autoCollect: false, whatsNew: WHATS_NEW.id });
    const raw = JSON.parse(JSON.stringify(s));
    raw.settings.autoRecall = "always";
    raw.settings.autoVip = true;
    const back = migrate(raw, T0);
    expect(back.settings.autoRecall).toBe("ask");
    expect(back.settings.autoVip).toBe(true);
    expect(back.settings.whatsNew).toBe(WHATS_NEW.id);
    // a save from an older version has never seen the card
    delete raw.settings.whatsNew;
    expect(migrate(raw, T0).settings.whatsNew).toBe("");
  });
});
