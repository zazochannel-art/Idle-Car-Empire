// Car models, racing, logistics, the showroom, brand and cities.
// Part of the game store (store/game-store.ts): the actions only, sharing its helpers through StoreCtx.
import * as A from "@/game/engine/actions";
import * as Br from "@/game/engine/brand";
import { CAR_BY_ID } from "@/game/config/cars";
import { CITIES } from "@/game/config/cities";
import * as Ch from "@/game/engine/chain";
import * as Cy from "@/game/engine/cities";
import * as D from "@/game/engine/design";
import * as Dn from "@/game/engine/car-dna";
import * as Ev from "@/game/engine/events";
import * as L from "@/game/engine/logistics";
import { MAP_BONUS_BY_KIND, type MapBonusKind } from "@/game/config/map-bonus";
import * as Mb from "@/game/engine/map-bonus";
import * as Rc from "@/game/engine/racing";
import * as Sh from "@/game/engine/showroom";
import * as Tr from "@/game/engine/territory";
import * as Tu from "@/game/engine/tuning";
import { formatMoney } from "@/game/format";
import { uiEvents } from "../events";
import type { GameStore, StoreCtx } from "../game-store";

type Keys = "upgradeCarModel" | "buyLogistics" | "unlockRacing" | "orderRaceCar" | "runTest" | "sendCar" | "setShowroomPrice" | "startCampaign" | "claimMapBonus" | "claimEventGoal" | "setBrand" | "unlockTerritory" | "sendTradeConvoy" | "switchCity" | "unlockCity" | "cancelRaceOrder" | "selectRaceCar" | "enterRace" | "repairRaceCar" | "upgradeRaceCar" | "setRaceSkin" | "tuneCar" | "retireRaceCar" | "upgradeRacingGarage" | "signSponsor" | "setAutoRacing" | "setAutoRepair" | "buyTransportTier" | "developDesign" | "developNordic" | "renameDesign" | "setDesignColor";

export function carsActions({ get, act, persist, tr, inFirstCity }: StoreCtx): Pick<GameStore, Keys> {
  return {
  upgradeCarModel: (id) => act((s) => A.upgradeCarModel(s, id)),
  buyLogistics: (id) => act((s) => L.buyLogistics(s, id, get().snap.gm.costMult)),
  unlockRacing: () => act(inFirstCity((s) => Rc.unlockRacing(s))),
  orderRaceCar: (car) => act(inFirstCity((s) => Rc.orderRaceCar(s, car))),
  runTest: (id) => {
    const r = act(inFirstCity((s) => Dn.runTest(s, id)));
    if (r) uiEvents.emit({ type: "toast", tone: "success", icon: "⏱️", title: tr("test.done", { t: r.zeroTo100.toFixed(1), v: r.topSpeed }) });
  },
  sendCar: (id, to, price) => act(inFirstCity((s) => Ch.sendCar(s, id, to, price))),
  setShowroomPrice: (id, price) => act((s) => Sh.setPrice(s, id, price)),
  startCampaign: () => act((s) => Sh.startCampaign(s)),
  claimMapBonus: (id) => {
    let cash: number | null = null;
    let kind: MapBonusKind | null = null;
    act((s) => {
      kind = s.mapBonus.active?.id === id ? s.mapBonus.active.kind : null;
      return (cash = Mb.claimMapBonus(s, id, Date.now())) !== null;
    });
    if (cash !== null && kind) uiEvents.emit({ type: "toast", tone: "gold", icon: MAP_BONUS_BY_KIND[kind as MapBonusKind].emoji, title: tr(`mapBonus.${kind as MapBonusKind}.taken`), body: tr("mapBonus.reward", { money: formatMoney(cash) }) });
    return cash;
  },
  claimEventGoal: () => {
    let cash: number | null = null;
    act((s) => (cash = Ev.claimEventGoal(s, s.lastActiveAt)) !== null);
    if (cash !== null) uiEvents.emit({ type: "toast", tone: "gold", icon: "🎯", title: tr("eventGoal.claimed", { money: formatMoney(cash) }) });
  },
  setBrand: (patch) => act((s) => Br.setBrand(s, patch)),
  unlockTerritory: (id) => {
    const ok = act((s) => Tr.unlockTerritory(s, id));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🗺️", title: tr("territory.opened", { name: tr(`territory.${id}`) }) });
      uiEvents.emit({ type: "fireworks", area: `t:${id}` });
    }
    return ok;
  },
  sendTradeConvoy: () => {
    const got = act((s) => Cy.sendTradeConvoy(s, Date.now(), get().snap.rewardIncomePerSec));
    if (got > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "🚢", title: tr("trade.toast"), body: tr("trade.toastBody", { money: formatMoney(got) }) });
    return got;
  },
  switchCity: (id) => {
    const ok = act((s) => Cy.switchCity(s, id, Date.now()));
    if (ok) {
      persist(true);
      uiEvents.emit({ type: "toast", tone: "gold", icon: CITIES[id].emoji, title: tr("toast.cityArrived", { name: tr(`city.${id}`) }), body: tr("toast.cityWallet", { money: formatMoney(get().state.cash) }) });
    }
    return ok;
  },
  unlockCity: (id) => {
    const ok = act((s) => Cy.unlockCity(s, id, Date.now()));
    if (ok) {
      persist(true);
      uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: CITIES[id].emoji, title: tr("toast.cityOpened", { name: tr(`city.${id}`) }), body: tr("toast.cityOpenedBody", { money: formatMoney(get().state.cities[id]?.cash ?? 0) }) });
      uiEvents.emit({ type: "fireworks" });
    }
    return ok;
  },
  cancelRaceOrder: (car) => act(inFirstCity((s) => Rc.cancelOrder(s, car))),
  selectRaceCar: (id) =>
    act((s) => {
      if (!Rc.raceCar(s, id)) return false;
      s.racing.selected = id;
      return true;
    }),
  enterRace: (event, special) => act(inFirstCity((s) => !!Rc.enterRace(s, event, special))),
  repairRaceCar: (id) => act(inFirstCity((s) => Rc.repairCar(s, id))),
  upgradeRaceCar: (id, u, racingParts) => act(inFirstCity((s) => Rc.upgradeRaceCar(s, id, u, racingParts))),
  setRaceSkin: (id, skin) => act((s) => Rc.setSkin(s, id, skin)),
  tuneCar: (id, choice) => {
    const ok = act(inFirstCity((s) => Tu.tune(s, id, choice)));
    if (ok) persist(true);
    return ok;
  },
  retireRaceCar: (id) => act(inFirstCity((s) => Rc.retireRaceCar(s, id) > 0)),
  upgradeRacingGarage: () => act(inFirstCity((s) => Rc.upgradeGarage(s))),
  signSponsor: (id) => act(inFirstCity((s) => Rc.signSponsor(s, id))),
  setAutoRacing: (on) => act(inFirstCity((s) => Rc.setAutoRacing(s, on))),
  setAutoRepair: (on) =>
    act((s) => {
      s.racing.auto.repair = on;
      return true;
    }),
  buyTransportTier: () => act((s) => L.buyTier(s, get().snap.gm.costMult)),
  developDesign: (id, option) =>
    act((s) => D.develop(s, id, option, D.developCost(Ch.carBaseValue(s, CAR_BY_ID[id], get().snap.gm), s.designs[id], option))),
  developNordic: (id) => act((s) => D.developNordic(s, id, D.nordicCost(Ch.carBaseValue(s, CAR_BY_ID[id], get().snap.gm), s.designs[id]))),
  renameDesign: (id, name) => {
    act((s) => D.renameDesign(s, id, name));
  },
  setDesignColor: (id, color) => {
    act((s) => D.setDesignColor(s, id, color));
  },
  };
}
