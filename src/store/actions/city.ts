// Research, districts, building, ads and the shop, garages.
// Part of the game store (store/game-store.ts): the actions only, sharing its helpers through StoreCtx.
import * as A from "@/game/engine/actions";
import * as C from "@/game/engine/city";
import * as Co from "@/game/engine/construction";
import { IAP_ICON } from "@/game/config/iap";
import * as Iap from "@/game/engine/iap";
import type { MessageKey } from "@/i18n";
import { RESEARCH_BY_ID } from "@/game/config/research";
import { SHOP_ITEM_BY_ID } from "@/game/config/shop";
import * as Shop from "@/game/engine/shop";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { grantAd } from "@/game/engine/ads";
import { rewardCash } from "@/game/engine/progress";
import { uiEvents } from "../events";
import type { GameStore, StoreCtx } from "../game-store";

type Keys = "research" | "unlockZone" | "buildStructure" | "buyLand" | "startConstruction" | "speedUp" | "adReward" | "shopBuy" | "iapGrant" | "iapRevoke" | "upgradeBuilding" | "placeFacility" | "moveFacility" | "removeFacility" | "hireWorker" | "setSpecialization";

export function cityActions({ get, act, persist, tr, names }: StoreCtx): Pick<GameStore, Keys> {
  return {
  research: (id) => {
    const ok = act((s) => A.doResearch(s, id));
    if (ok) {
      const r = RESEARCH_BY_ID[id];
      uiEvents.emit({ type: "toast", tone: "info", icon: "🔬", title: tr("toast.research", { name: names().research(r) }), body: names().researchDesc(r) });
    }
    return ok;
  },
  unlockZone: (id) => {
    const ok = act((s) => C.unlockZone(s, id));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🗺️", title: tr("toast.zone", { name: tr(`zone.${id}`) }), body: tr("toast.zoneBody") });
      uiEvents.emit({ type: "fireworks", area: id });
      persist(true);
    }
    return ok;
  },
  buildStructure: (plot, type) => {
    const ok = act((s) => C.buildStructure(s, plot, type));
    if (ok) {
      const site = get().state.city.sites[plot];
      uiEvents.emit({ type: "toast", tone: "info", icon: "🏗️", title: tr("toast.constructionStarted", { name: tr(`structure.${type}`) }), body: tr("toast.constructionBody", { time: formatDuration(site?.dur ?? 0) }) });
      persist(true);
    }
    return ok;
  },
  buyLand: (plot) => {
    const ok = act((s) => Co.buyLand(s, plot));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "success", icon: "📜", title: tr("toast.landBought") });
      persist(true);
    }
    return ok;
  },
  startConstruction: (plot, type) => {
    const ok = act((s) => Co.startConstruction(s, plot, type));
    if (ok) {
      const site = get().state.city.sites[plot];
      if (site) uiEvents.emit({ type: "toast", tone: "info", icon: "🏗️", title: tr("toast.constructionStarted", { name: tr(`structure.${site.type}`) }), body: tr("toast.constructionBody", { time: formatDuration(site.dur) }) });
      persist(true);
    }
    return ok;
  },
  speedUp: (plot) => {
    const ok = act((s) => Co.speedUp(s, plot));
    if (ok) persist(true);
    return ok;
  },
  adReward: (reward, plot) => {
    const cash = get().state.cash;
    const ok = act((s) => grantAd(s, reward, Date.now(), plot, get().snap));
    if (!ok) return false;
    if (reward === "login") uiEvents.emit({ type: "toast", tone: "gold", icon: "🎁", title: tr("toast.collected", { amount: formatMoney(get().state.cash - cash) }), body: tr("ad.loginBody") });
    else if (reward === "qc") uiEvents.emit({ type: "toast", tone: "info", icon: "🔍", title: tr("ad.qcStarted"), body: tr("ad.qcStartedBody") });
    else if (reward === "offline") uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: tr("toast.collected", { amount: formatMoney(get().state.cash - cash) }), body: tr("toast.collectedBody") });
    else if (reward === "boost") uiEvents.emit({ type: "toast", tone: "gold", icon: "📈", title: tr("ad.boostStarted"), body: tr("ad.boostStartedBody") });
    persist(true);
    return true;
  },
  shopBuy: (id) => {
    const { snap, state } = get();
    const now = Date.now();
    const r = Shop.shopReward(id, snap, state, now);
    if (!act((s) => Shop.buyShop(s, id, now, snap))) return false;
    const got = [r.incomeSeconds ? formatMoney(rewardCash(r, snap)) : "", r.rp ? tr("shop.rp", { n: formatNumber(r.rp) }) : "", r.stars ? `⭐ ${r.stars}` : ""].filter(Boolean).join(" · ");
    const body = got ? tr("shop.got", { what: got }) : tr(id === "build" ? "shop.builtBody" : "ad.boostLeftBody");
    uiEvents.emit({ type: "toast", tone: "gold", icon: SHOP_ITEM_BY_ID[id].icon, title: tr(`shop.item.${id}` as MessageKey), body });
    persist(true);
    return true;
  },
  iapGrant: (p, token) => {
    const { snap } = get();
    const r = Iap.starterReward(snap);
    const result = act((s) => Iap.grantPurchase(s, p, token, snap, Date.now()));
    if (result !== "granted") return result;
    const body = p === "starter" ? tr("shop.got", { what: [formatMoney(rewardCash(r, snap)), tr("shop.rp", { n: formatNumber(r.rp ?? 0) }), `⭐ ${r.stars}`].join(" · ") }) : p === "pass" ? tr("iap.passBody") : tr("iap.adFreeBody");
    uiEvents.emit({ type: "toast", tone: "gold", icon: IAP_ICON[p], title: tr("iap.thanks", { name: tr(`iap.item.${p}` as MessageKey) }), body });
    // saved before the store hears it was given: a purchase is never acknowledged and then lost
    persist(true);
    return result;
  },
  iapRevoke: (p) => {
    if (!act((s) => Iap.revokePurchase(s, p))) return false;
    uiEvents.emit({ type: "toast", tone: "info", icon: IAP_ICON[p], title: tr("iap.refundedTitle"), body: tr("iap.refundedBody", { name: tr(`iap.item.${p}` as MessageKey) }) });
    persist(true);
    return true;
  },
  upgradeBuilding: (plot) => act((s) => C.upgradeBuilding(s, plot)),
  placeFacility: (plot, type, x, y, rot) => act((s) => C.placeFacility(s, plot, type, x, y, rot)),
  moveFacility: (plot, uid, x, y, rot) => act((s) => C.moveFacility(s, plot, uid, x, y, rot)),
  removeFacility: (plot, uid) => act((s) => C.removeFacility(s, plot, uid)),
  hireWorker: (plot) => act((s) => C.hireWorker(s, plot)),
  setSpecialization: (plot, spec) => act((s) => C.setSpecialization(s, plot, spec)),
  };
}
