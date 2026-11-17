// Daily rewards, prototypes, export, fleet and VIP orders, contracts, used cars, quality checks.
// Part of the game store (store/game-store.ts): the actions only, sharing its helpers through StoreCtx.
import { CAR_BY_ID } from "@/game/config/cars";
import * as Ch from "@/game/engine/chain";
import * as Cl from "@/game/engine/classics";
import { ENGINEER_BY_ID } from "@/game/config/expansion";
import * as Ex from "@/game/engine/expansion";
import * as K from "@/game/engine/contracts";
import * as Lv from "@/game/engine/live";
import type { MessageKey } from "@/i18n";
import * as Qc from "@/game/engine/quality-check";
import * as R from "@/game/engine/retention";
import * as Sp from "@/game/engine/sponsors";
import * as Uc from "@/game/engine/used-cars";
import { buySource } from "@/game/engine/sources";
import { answerStaff } from "@/game/engine/staff";
import { chestStreakToday, claimDaily, claimDailyChest, claimMilestone, rewardCash } from "@/game/engine/progress";
import { formatMoney } from "@/game/format";
import { uiEvents } from "../events";
import { unlockedCarIds } from "@/game/engine/economy";
import type { GameStore, StoreCtx } from "../game-store";

type Keys = "claimDaily" | "claimDailyChest" | "startPrototype" | "windTunnel" | "trackTest" | "launchProto" | "openMarket" | "setFleetProduct" | "acceptFleetOrder" | "declineFleetOrder" | "finishFleetOrder" | "hireEngineer" | "setEngineerPay" | "letGoEngineer" | "counterOffer" | "acceptVip" | "declineVip" | "claimVip" | "enterShow" | "claimShow" | "claimSeason" | "restoreClassic" | "acceptContract" | "signDeal" | "declineDeals" | "claimDeal" | "buyUsedCar" | "buySource" | "answerStaff" | "refurbishUsedCar" | "sellUsedCar" | "startQc" | "finishQc" | "declineContract" | "claimContract" | "claimLogin" | "dismissTip" | "claimMilestone";

export function businessActions({ get, act, persist, tr }: StoreCtx): Pick<GameStore, Keys> {
  return {
  claimDaily: (id) => {
    act((s) => claimDaily(s, id));
  },
  claimDailyChest: () => {
    const now = Date.now();
    const cash0 = get().state.cash;
    let got: ReturnType<typeof claimDailyChest> = null;
    act((s) => (got = claimDailyChest(s, now)) !== null);
    const r = got as ReturnType<typeof claimDailyChest>;
    if (!r) return;
    const streak = chestStreakToday(get().state, now);
    uiEvents.emit({
      type: "toast",
      kind: "progress",
      tone: "gold",
      icon: "🧰",
      title: tr("chest.toast"),
      body: r.stars ? tr("chest.star", { n: streak }) : tr("mapBonus.reward", { money: formatMoney(Math.max(0, get().state.cash - cash0)) }),
    });
  },
  startPrototype: (car, focus) => {
    act((s) => Ex.startPrototype(s, car, focus, Date.now(), Ch.carBaseValue(s, CAR_BY_ID[car], get().snap.gm)));
  },
  windTunnel: (effort) => {
    act((s) => s.proto.active !== null && Ex.windTunnel(s, effort, Date.now(), Ch.carBaseValue(s, CAR_BY_ID[s.proto.active.car], get().snap.gm)));
  },
  trackTest: () => {
    act((s) => s.proto.active !== null && Ex.trackTest(s, Date.now(), Ch.carBaseValue(s, CAR_BY_ID[s.proto.active.car], get().snap.gm)));
  },
  launchProto: (campaign) => {
    const car = get().state.proto.active?.car;
    const score = act((s) => (s.proto.active ? Ex.launchProto(s, campaign, Date.now(), Ch.carBaseValue(s, CAR_BY_ID[s.proto.active.car], get().snap.gm)) : null));
    if (score !== null && car) uiEvents.emit({ type: "toast", tone: "gold", icon: "🚀", title: tr("proto.launchedToast", { name: get().state.designs[car].name, n: Math.round(score) }), body: tr("proto.launchedBody") });
  },
  openMarket: (id) => {
    if (act((s) => Ex.openMarket(s, id))) uiEvents.emit({ type: "toast", tone: "gold", icon: "🚢", title: tr("export.opened", { name: tr(`export.market.${id}` as MessageKey) }) });
  },
  setFleetProduct: (p) => {
    act((s) => Ex.setFleetProduct(s, p));
  },
  acceptFleetOrder: () => {
    act((s) => Ex.acceptFleetOrder(s, Date.now()));
  },
  declineFleetOrder: () => {
    act((s) => Ex.declineFleetOrder(s, Date.now()));
  },
  finishFleetOrder: () => {
    if (act((s) => Ex.finishFleetOrder(s, Date.now()))) uiEvents.emit({ type: "toast", tone: "gold", icon: "🚌", title: tr("fleet.doneToast") });
  },
  hireEngineer: () => {
    const id = get().state.engineers.candidate?.id;
    if (act((s) => Ex.hireEngineer(s)) && id) uiEvents.emit({ type: "toast", tone: "success", icon: ENGINEER_BY_ID[id].emoji, title: tr("eng.hired", { name: ENGINEER_BY_ID[id].name }) });
  },
  setEngineerPay: (id, pay) => {
    act((s) => Ex.setEngineerPay(s, id, pay));
  },
  letGoEngineer: (id) => {
    act((s) => Ex.letGo(s, id));
  },
  counterOffer: () => {
    act((s) => Ex.counterOffer(s));
  },
  acceptVip: () => {
    act((s) => Lv.acceptVip(s, Date.now()));
  },
  declineVip: () => {
    act((s) => Lv.declineVip(s, Date.now()));
  },
  claimVip: () => {
    if (act((s) => Lv.claimVip(s, Date.now()))) uiEvents.emit({ type: "toast", tone: "gold", icon: "💎", title: tr("vip.paid"), body: tr("vip.paidBody") });
  },
  enterShow: (car) => {
    if (act((s) => Lv.enterShow(s, car, Date.now(), unlockedCarIds(s, get().snap.gm)))) {
      const rank = get().state.show.rank;
      uiEvents.emit({ type: "toast", tone: rank === 0 ? "gold" : "info", icon: rank === 0 ? "🏆" : "🎪", title: tr("show.result", { rank: rank + 1 }) });
    }
  },
  claimShow: () => {
    act((s) => Lv.claimShow(s));
  },
  claimSeason: () => {
    if (act((s) => Lv.claimSeason(s))) uiEvents.emit({ type: "toast", tone: "gold", icon: "🏆", title: tr("season.claimed") });
  },
  restoreClassic: (id) => {
    if (act((s) => Cl.restoreClassic(s, id, Date.now()))) uiEvents.emit({ type: "toast", tone: "info", icon: "🔧", title: tr("classics.started", { name: tr(`classic.${id}` as MessageKey) }) });
  },
  acceptContract: () => {
    act((s) => K.acceptContract(s, Date.now()));
    persist(true);
  },
  signDeal: (i) => {
    if (act((s) => Sp.signSponsor(s, i, Date.now()))) persist(true);
  },
  declineDeals: () => {
    act((s) => Sp.declineSponsors(s, Date.now()));
  },
  claimDeal: () => {
    let money: number | null = null;
    if (!act((s) => (money = Sp.claimSponsor(s, get().snap, Date.now())) !== null)) return;
    uiEvents.emit({ type: "toast", tone: "gold", icon: "🤝", title: tr("sponsor.paid"), body: formatMoney(money ?? 0) });
    persist(true);
  },
  answerStaff: (yes) => {
    const out = act((s) => answerStaff(s, yes, Date.now()));
    if (!out) return;
    if (out === "strike") uiEvents.emit({ type: "toast", tone: "warn", icon: "🪧", title: tr("staff.strike"), body: tr("staff.strikeBody") });
    persist(true);
  },
  buySource: (m) => {
    if (act((s) => buySource(s, m))) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: "⛏️", title: tr("source.bought", { name: tr(`mat.${m}` as MessageKey), level: get().state.sources[m] ?? 0 }) });
      persist(true);
    }
  },
  buyUsedCar: (id) => {
    if (act((s) => Uc.buyUsed(s, id))) persist(true);
  },
  refurbishUsedCar: () => {
    if (act((s) => Uc.refurbishUsed(s, Date.now()))) persist(true);
  },
  sellUsedCar: () => {
    let price: number | null = null;
    if (!act((s) => (price = Uc.sellUsed(s, Date.now())) !== null)) return;
    uiEvents.emit({ type: "toast", tone: "gold", icon: "🚙", title: tr("used.soldToast"), body: formatMoney(price ?? 0) });
    persist(true);
  },
  startQc: () => {
    let round: (Qc.DefectKind | null)[] | null = null;
    if (!act((s) => (round = Qc.startQc(s, Date.now())) !== null)) return null;
    persist(true);
    return round;
  },
  finishQc: (round, tapped) => {
    let got: { money: number; score: number } | null = null;
    if (!act((s) => (got = Qc.finishQc(s, round, tapped, get().snap, Date.now())) !== null)) return null;
    const r = got as unknown as { money: number; score: number };
    uiEvents.emit({ type: "toast", tone: "gold", icon: "🔍", title: tr("qc.doneToast", { score: r.score }), body: `+${formatMoney(r.money)}` });
    persist(true);
    return r.score;
  },
  declineContract: () => {
    act((s) => K.declineContract(s, Date.now()));
  },
  claimContract: () => {
    const ok = act((s) => K.claimContract(s, Date.now(), get().snap));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🤝", title: tr("contract.paid"), body: tr("contract.paidBody") });
      persist(true);
    }
  },
  claimLogin: () => {
    const r = R.loginReward(get().state);
    const amount = r.stars ? `${r.stars} ⭐` : formatMoney(rewardCash(r, get().snap));
    if (!act((s) => R.claimLogin(s, get().snap))) return;
    uiEvents.emit({ type: "toast", tone: "gold", icon: "🎁", title: tr("toast.collected", { amount }) });
    persist(true);
  },
  dismissTip: (id) => {
    act((s) => !s.tips.includes(id) && s.tips.push(id) > 0);
    persist(true);
  },
  claimMilestone: (id) => {
    act((s) => claimMilestone(s, id));
  },
  };
}
