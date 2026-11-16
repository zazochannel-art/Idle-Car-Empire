// Plants, materials, managers and dealers.
// Part of the game store (store/game-store.ts): the actions only, sharing its helpers through StoreCtx.
import * as A from "@/game/engine/actions";
import * as Ch from "@/game/engine/chain";
import * as Cn from "@/game/engine/collection";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import * as Evc from "@/game/engine/ev";
import * as Fl from "@/game/engine/floor";
import { MANAGER_BY_ID } from "@/game/config/managers";
import * as Mat from "@/game/engine/materials";
import type { MessageKey } from "@/i18n";
import * as Mk from "@/game/engine/market";
import { PLANT_LEVELS } from "@/game/config/chain";
import { RECALL } from "@/game/config/market";
import { RIVAL_CEO } from "@/game/config/story";
import * as Sy from "@/game/engine/story";
import { claimUnlock } from "@/game/engine/unlocks";
import { uiEvents } from "../events";
import type { GameStore, StoreCtx } from "../game-store";

type Keys = "plantLevel" | "buyBodyMachine" | "hireBodyWorker" | "plantSpeed" | "repairPlant" | "boostPlant" | "setPlantSkin" | "decide" | "claimChapter" | "plantAutomation" | "plantGrade" | "setAutoUpgrade" | "setCombine" | "buyMaterial" | "buyPlan" | "setQualityMode" | "setCarRoute" | "payRecall" | "ignoreRecall" | "claimUnlock" | "upgradeWarehouse" | "upgradePower" | "setAutoBuy" | "setBackupParts" | "setPlantCar" | "hireManager" | "upgradeManager" | "assignManager" | "buyDealer" | "upgradeDealer" | "buildCharger";

export function factoryActions({ get, act, persist, tr, names }: StoreCtx): Pick<GameStore, Keys> {
  return {
  plantLevel: (plot) => {
    const ok = act((s) => Ch.upgradePlantLevel(s, plot, get().snap.gm));
    if (ok) {
      const b = get().state.city.buildings[plot];
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🏗️", title: tr("toast.plantLevel", { name: tr(`structure.${b.type}`), level: tr(`plantLevel.${b.level}` as MessageKey) }), body: tr("toast.plantLevelBody", { lines: PLANT_LEVELS[b.level - 1].lines }) });
    }
    return ok;
  },
  buyBodyMachine: (plot) => {
    const ok = act((s) => Ch.buyBodyMachine(s, plot));
    if (ok) persist(true);
    return ok;
  },
  hireBodyWorker: (plot) => {
    const ok = act((s) => Ch.hireBodyWorker(s, plot));
    if (ok) persist(true);
    return ok;
  },
  plantSpeed: (plot) => act((s) => Ch.upgradePlantSpeed(s, plot, get().snap.gm)),
  repairPlant: (plot) => act((s) => Fl.repairPlant(s, plot)),
  boostPlant: (plot) => act((s) => Fl.boostPlant(s, plot)),
  setPlantSkin: (plot, skin) => act((s) => Cn.setPlantSkin(s, plot, skin)),
  decide: (choice) => act((s) => Sy.decide(s, choice, get().snap)),
  claimChapter: () => {
    const ok = act((s) => Sy.claimChapter(s, get().snap));
    if (ok) uiEvents.emit({ type: "toast", tone: "gold", icon: RIVAL_CEO.emoji, title: tr("story.chapterClaimed", { n: get().state.story.chapter }) });
    return ok;
  },
  plantAutomation: (plot) => act((s) => Ch.upgradeAutomation(s, plot, get().snap.gm)),
  plantGrade: (plot) => act((s) => Ch.upgradeGrade(s, plot, get().snap.gm)),
  setAutoUpgrade: (plot, on) => {
    act((s) => {
      const p = s.city.buildings[plot]?.plant;
      if (!p) return false;
      p.auto = on;
      return true;
    });
    persist(true);
  },
  setCombine: (plot, on) => {
    act((s) => Ch.setCombine(s, plot, on));
  },
  buyMaterial: (plot, m, qty) => act((s) => Mat.buyMaterial(s, plot, m, qty).ok),
  buyPlan: (plot, plan) => act((s) => Mat.buyPlan(s, plot, plan)),
  setQualityMode: (plot, mode) => {
    act((s) => Ch.setQualityMode(s, plot, mode));
  },
  setCarRoute: (plot, route) => {
    act((s) => Ch.setCarRoute(s, plot, route));
  },
  payRecall: (cost) => {
    if (act((s) => Mk.payRecall(s, cost))) uiEvents.emit({ type: "toast", tone: "success", icon: "🛠️", title: tr("recall.paidToast", { n: RECALL.repPaid }) });
  },
  ignoreRecall: () => {
    const out = act((s) => Mk.ignoreRecall(s));
    if (out === "scandal") uiEvents.emit({ type: "toast", tone: "warn", icon: "📰", title: tr("recall.scandalToast") });
    else if (out === "quiet") uiEvents.emit({ type: "toast", tone: "info", icon: "🤫", title: tr("recall.quietToast") });
  },
  claimUnlock: (kind, id) => act((s) => claimUnlock(s, kind, id)),
  upgradeWarehouse: (plot) => act((s) => Ch.upgradeWarehouse(s, plot, get().snap.gm)),
  upgradePower: (plot) => act((s) => Ch.upgradePower(s, plot, get().snap.gm)),
  setAutoBuy: (plot, on) => {
    act((s) => Ch.setAutoBuy(s, plot, on));
  },
  setBackupParts: (plot, on) => {
    act((s) => Ch.setBackupParts(s, plot, on));
  },
  setPlantCar: (plot, car) => {
    act((s) => Ch.setPlantCar(s, plot, car, get().snap.gm));
  },
  hireManager: (id, assignTo) => {
    const ok = act((s) => A.hireManager(s, id, assignTo));
    if (ok) {
      const m = MANAGER_BY_ID[id];
      uiEvents.emit({ type: "toast", tone: "success", icon: m.avatar, title: tr("toast.hired", { name: m.name }), body: names().role(m) });
    }
    return ok;
  },
  upgradeManager: (id) => act((s) => A.upgradeManager(s, id)),
  assignManager: (id, plot) => {
    act((s) => A.assignManager(s, id, plot));
  },
  buyDealer: (id) => {
    const ok = act((s) => A.buyDealer(s, id));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "success", icon: "🏪", title: tr("toast.dealer", { name: names().dealer(DEALER_BY_ID[id]) }), body: tr("toast.dealerBody") });
      persist(true);
    }
    return ok;
  },
  upgradeDealer: (id) => act((s) => A.upgradeDealer(s, id)),
  buildCharger: (id) => {
    const ok = act((s) => Evc.buildCharger(s, id));
    if (ok) {
      const level = Evc.chargerLevel(get().state, id);
      uiEvents.emit({ type: "toast", tone: "success", icon: "⚡", title: tr(level > 1 ? "ev.toastUp" : "ev.toastBuilt", { name: names().dealer(DEALER_BY_ID[id]), level }) });
      persist(true);
    }
    return ok;
  },
  };
}
