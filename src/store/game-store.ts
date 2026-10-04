"use client";

import * as Rc from "@/game/engine/racing";
import type { RaceUpgrade } from "@/game/config/racing";
import type { StarUpgradeId } from "@/game/config/imperium";
import { buyStarUpgrade, imperium as doImperium } from "@/game/engine/imperium";
import { create } from "zustand";
import { ACHIEVEMENT_BY_ID } from "@/game/config/achievements";
import { CAR_BY_ID, type DesignOption } from "@/game/config/cars";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { MANAGER_BY_ID } from "@/game/config/managers";
import { RESEARCH_BY_ID } from "@/game/config/research";
import * as A from "@/game/engine/actions";
import * as Ch from "@/game/engine/chain";
import * as Mat from "@/game/engine/materials";
import type { MaterialId } from "@/game/config/economy";
import * as K from "@/game/engine/contracts";
import * as R from "@/game/engine/retention";
import * as D from "@/game/engine/design";
import * as L from "@/game/engine/logistics";
import type { LogisticsUpgrade } from "@/game/config/logistics";
import * as C from "@/game/engine/city";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { PLANT_LEVELS } from "@/game/config/chain";
import { snapshot, unlockedCarIds, type EconomySnapshot } from "@/game/engine/economy";
import { activeEvent } from "@/game/engine/events";
import { collectOffline, settleOffline } from "@/game/engine/offline";
import { prestige as doPrestige } from "@/game/engine/prestige";
import { checkAchievements, claimDaily, claimMilestone, recordHistory, refreshDaily } from "@/game/engine/progress";
import { cloneState, createInitialState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { formatMoney } from "@/game/format";
import { decodeSave, encodeSave, SaveManager } from "@/game/save";
import type { BuyAmount, CarId, DealerId, FacilityType, GameState, Lang, ManagerId, Specialization, StructureType, ZoneId } from "@/game/types";
import { applyLanguage, detectLanguage, translate, type MessageKey, type Vars } from "@/i18n";
import { contentFor } from "@/i18n/content";
import { uiEvents } from "./events";
import { claimUnlock, openPlantTypes } from "@/game/engine/unlocks";
import { restockLow } from "@/game/engine/insights";
import { hasPlant as hasPlantType } from "@/game/engine/chain";

const TICK_MS = 100;
const SAVE_MS = 5_000;
/** A gap this long between ticks (sleeping laptop, frozen tab) counts as being away. */
const AWAY_GAP_S = 30;

interface GameStore {
  ready: boolean;
  state: GameState;
  snap: EconomySnapshot;
  backend: string;
  init: () => Promise<void>;
  /** Runs a player action on a copy of the state and commits it if it succeeded. */
  act: <T>(fn: (s: GameState) => T) => T;

  plantLevel: (plot: string) => boolean;
  plantSpeed: (plot: string) => boolean;
  plantAutomation: (plot: string) => boolean;
  plantGrade: (plot: string) => boolean;
  setPlantCar: (plot: string, car: CarId | null) => void;
  setCombine: (plot: string, on: boolean) => void;
  buyMaterial: (plot: string, m: MaterialId, qty: number) => boolean;
  buyPlan: (plot: string, plan: Mat.RestockPlan) => boolean;
  restockLow: () => number;
  claimUnlock: (kind: "car" | "plant", id: string) => number;
  upgradeWarehouse: (plot: string) => boolean;
  upgradePower: (plot: string) => boolean;
  setAutoBuy: (plot: string, on: boolean) => void;
  setAutoUpgrade: (plot: string, on: boolean) => void;
  hireManager: (id: ManagerId, assignTo?: string) => boolean;
  upgradeManager: (id: ManagerId) => boolean;
  assignManager: (id: ManagerId, plot: string | null) => void;
  buyDealer: (id: DealerId) => boolean;
  upgradeDealer: (id: DealerId) => boolean;
  upgradeCarModel: (id: CarId) => boolean;
  buyLogistics: (id: LogisticsUpgrade) => boolean;
  buyTransportTier: () => boolean;
  developDesign: (id: CarId, option: DesignOption) => boolean;
  renameDesign: (id: CarId, name: string) => void;
  setDesignColor: (id: CarId, color: string) => void;
  research: (id: string) => boolean;
  unlockZone: (id: ZoneId) => boolean;
  buildStructure: (plot: string, type: StructureType) => boolean;
  upgradeBuilding: (plot: string) => boolean;
  placeFacility: (plot: string, type: FacilityType, x: number, y: number, rot: 0 | 1) => boolean;
  moveFacility: (plot: string, uid: number, x: number, y: number, rot: 0 | 1) => boolean;
  removeFacility: (plot: string, uid: number) => boolean;
  hireWorker: (plot: string) => boolean;
  setSpecialization: (plot: string, spec: Specialization) => boolean;
  claimDaily: (id: string) => void;
  claimMilestone: (id: string) => void;
  dismissTip: (id: string) => void;
  claimLogin: () => void;
  acceptContract: () => void;
  declineContract: () => void;
  claimContract: () => void;
  collectOffline: () => void;
  prestige: () => void;
  imperium: () => void;
  buyStarUpgrade: (id: StarUpgradeId) => boolean;
  unlockRacing: () => boolean;
  orderRaceCar: (car: CarId) => boolean;
  cancelRaceOrder: (car: CarId) => boolean;
  selectRaceCar: (id: number) => void;
  enterRace: (event: string, special?: string) => boolean;
  repairRaceCar: (id: number) => boolean;
  upgradeRaceCar: (id: number, u: RaceUpgrade, racingParts?: boolean) => boolean;
  setRaceSkin: (id: number, skin: string) => boolean;
  retireRaceCar: (id: number) => boolean;
  upgradeRacingGarage: () => boolean;
  signSponsor: (id: string | null) => boolean;
  setAutoRacing: (on: boolean) => boolean;
  setAutoRepair: (on: boolean) => void;
  setBuyAmount: (a: BuyAmount) => void;
  setPref: (key: "lowGraphics" | "sound" | "haptics", on: boolean) => void;
  setLang: (lang: Lang) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetGame: () => Promise<void>;
}

const saves = typeof window !== "undefined" ? new SaveManager() : null;
let loop: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let lastSave = 0;

const initial = createInitialState(0);

export const useGame = create<GameStore>((set, get) => {
  const tr = (key: MessageKey, vars?: Vars) => translate(get().state.settings.lang, key, vars);
  const names = () => contentFor(get().state.settings.lang);

  /** Recomputes derived data, unlocks achievements and publishes the new state. */
  function commit(next: GameState, prevSnap?: EconomySnapshot) {
    let snap = snapshot(next);
    const fresh = checkAchievements(next, snap);
    if (fresh.length) {
      snap = snapshot(next);
      for (const id of fresh) {
        const a = ACHIEVEMENT_BY_ID[id];
        uiEvents.emit({ type: "toast", tone: "gold", icon: a.icon, title: tr("toast.achievement", { name: names().achievement(a) }), body: tr("toast.achievementBody", { desc: names().achievementDesc(a) }) });
      }
    }
    const prev = get().state;
    // unlock moments (not across a new run: everything "unlocks" again then)
    if (prevSnap && prev.runStartedAt === next.runStartedAt) {
      const before = unlockedCarIds(prev, prevSnap.gm);
      for (const id of unlockedCarIds(next, snap.gm)) if (!before.has(id)) uiEvents.emit({ type: "unlock", kind: "car", id });
      const open = openPlantTypes(prev);
      for (const id of openPlantTypes(next)) if (!open.has(id) && !hasPlantType(prev, id)) uiEvents.emit({ type: "unlock", kind: "plant", id });
    }
    set({ state: next, snap });
  }

  function persist(force = false) {
    if (!saves) return;
    const s = get().state;
    lastSave = Date.now();
    void saves.save({ ...s, lastActiveAt: Date.now() }, { force });
  }

  function runTick() {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    const { state, snap } = get();
    const next = cloneState(state);

    if (dt > AWAY_GAP_S) {
      // The page was frozen: settle it like a normal absence.
      next.lastActiveAt = now - dt * 1000;
      settleOffline(next, now);
      commit(next);
      return;
    }

    const events = engineTick(next, dt, snap);
    next.lastActiveAt = now;
    recordHistory(next, now, snap.incomePerSec);
    Ch.autoUpgrade(next, snap.gm);
    R.updateLogin(next, now);
    for (const r of R.checkRivals(next, now)) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: r.emoji, title: tr("rival.beaten", { name: r.name }), body: tr("rival.beatenBody", { n: r.stars }) });
    }
    const deal = K.refreshContracts(next, now, snap);
    if (deal === "offer") uiEvents.emit({ type: "toast", tone: "info", icon: "📨", title: tr("contract.offerToast"), body: tr("contract.offerToastBody") });
    else if (deal === "expired") uiEvents.emit({ type: "toast", tone: "warn", icon: "⌛", title: tr("contract.expired") });
    const ev = activeEvent(now);
    if (ev && !activeEvent(state.lastActiveAt)) {
      const n = contentFor(next.settings.lang);
      uiEvents.emit({ type: "toast", tone: "gold", icon: ev.event.emoji, title: tr("event.started", { name: n.event(ev.event) }), body: n.eventDesc(ev.event) });
    }
    if (refreshDaily(next, now, snap)) {
      uiEvents.emit({ type: "toast", tone: "info", icon: "📋", title: tr("toast.daily"), body: tr("toast.dailyBody") });
    }
    for (const e of events) {
      if (e.type === "sale") uiEvents.emit(e);
      else if (e.type === "carBuilt" && e.first) uiEvents.emit({ type: "firstCar", plot: e.plot, car: e.car });
      else if (e.type === "raceFinished") {
        const rec = next.racing.last;
        const rw = rec?.result;
        if (rec && rw) {
          const n = contentFor(next.settings.lang);
          uiEvents.emit({ type: "race", id: rec.id });
          uiEvents.emit({
            type: "toast",
            tone: rw.position === 0 ? "gold" : rw.position <= 2 ? "success" : "info",
            icon: rw.position === 0 ? "🏆" : rw.position <= 2 ? "🏅" : "🏁",
            title: tr("racing.toast", { pos: rw.position + 1, event: n.raceEvent(rec.event) }),
            body: tr("racing.toastBody", { money: formatMoney(rw.prize + rw.sponsor), rep: rw.rep }),
          });
        }
      }
    }
    commit(next, snap);
    if (now - lastSave > SAVE_MS) persist();
  }

  const act = <T,>(fn: (s: GameState) => T): T => {
    const { state, snap } = get();
    const next = cloneState(state);
    const result = fn(next);
    if (result) commit(next, snap);
    return result;
  };

  return {
    ready: false,
    state: initial,
    snap: snapshot(initial),
    backend: saves?.backend ?? "memory",
    act,

    init: async () => {
      if (get().ready || loop) return;
      const now = Date.now();
      let state = (await saves?.load(now)) ?? null;
      if (!state) {
        state = createInitialState(now);
        state.settings.lang = detectLanguage();
      } else {
        settleOffline(state, now);
      }
      refreshDaily(state, now);
      applyLanguage(state.settings.lang);
      lastTick = Date.now();
      lastSave = lastTick;
      set({ ready: true, state, snap: snapshot(state) });
      loop = setInterval(runTick, TICK_MS);

      const flush = () => persist(true);
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    },

    plantLevel: (plot) => {
      const ok = act((s) => Ch.upgradePlantLevel(s, plot, get().snap.gm));
      if (ok) {
        const b = get().state.city.buildings[plot];
        uiEvents.emit({ type: "toast", tone: "gold", icon: "🏗️", title: tr("toast.plantLevel", { name: tr(`structure.${b.type}`), level: tr(`plantLevel.${b.level}` as MessageKey) }), body: tr("toast.plantLevelBody", { lines: PLANT_LEVELS[b.level - 1].lines }) });
      }
      return ok;
    },
    plantSpeed: (plot) => act((s) => Ch.upgradePlantSpeed(s, plot, get().snap.gm)),
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
    restockLow: () => act((s) => restockLow(s, get().snap)),
    claimUnlock: (kind, id) => act((s) => claimUnlock(s, kind, id)),
    upgradeWarehouse: (plot) => act((s) => Ch.upgradeWarehouse(s, plot, get().snap.gm)),
    upgradePower: (plot) => act((s) => Ch.upgradePower(s, plot, get().snap.gm)),
    setAutoBuy: (plot, on) => {
      act((s) => Ch.setAutoBuy(s, plot, on));
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
    upgradeCarModel: (id) => act((s) => A.upgradeCarModel(s, id)),
    buyLogistics: (id) => act((s) => L.buyLogistics(s, id, get().snap.gm.costMult)),
    unlockRacing: () => act((s) => Rc.unlockRacing(s)),
    orderRaceCar: (car) => act((s) => Rc.orderRaceCar(s, car)),
    cancelRaceOrder: (car) => act((s) => Rc.cancelOrder(s, car)),
    selectRaceCar: (id) =>
      act((s) => {
        if (!Rc.raceCar(s, id)) return false;
        s.racing.selected = id;
        return true;
      }),
    enterRace: (event, special) => act((s) => !!Rc.enterRace(s, event, special)),
    repairRaceCar: (id) => act((s) => Rc.repairCar(s, id)),
    upgradeRaceCar: (id, u, racingParts) => act((s) => Rc.upgradeRaceCar(s, id, u, racingParts)),
    setRaceSkin: (id, skin) => act((s) => Rc.setSkin(s, id, skin)),
    retireRaceCar: (id) => act((s) => Rc.retireRaceCar(s, id) > 0),
    upgradeRacingGarage: () => act((s) => Rc.upgradeGarage(s)),
    signSponsor: (id) => act((s) => Rc.signSponsor(s, id)),
    setAutoRacing: (on) => act((s) => Rc.setAutoRacing(s, on)),
    setAutoRepair: (on) =>
      act((s) => {
        s.racing.auto.repair = on;
        return true;
      }),
    buyTransportTier: () => act((s) => L.buyTier(s, get().snap.gm.costMult)),
    developDesign: (id, option) =>
      act((s) => D.develop(s, id, option, D.developCost(Ch.carBaseValue(s, CAR_BY_ID[id], get().snap.gm), s.designs[id], option))),
    renameDesign: (id, name) => {
      act((s) => D.renameDesign(s, id, name));
    },
    setDesignColor: (id, color) => {
      act((s) => D.setDesignColor(s, id, color));
    },
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
        persist(true);
      }
      return ok;
    },
    buildStructure: (plot, type) => {
      const ok = act((s) => C.buildStructure(s, plot, type));
      if (ok) {
        uiEvents.emit({ type: "toast", tone: "success", icon: STRUCTURE_BY_ID[type].emoji, title: tr("toast.built", { name: tr(`structure.${type}`) }), body: tr(`structureDesc.${type}`) });
        persist(true);
      }
      return ok;
    },
    upgradeBuilding: (plot) => act((s) => C.upgradeBuilding(s, plot)),
    placeFacility: (plot, type, x, y, rot) => act((s) => C.placeFacility(s, plot, type, x, y, rot)),
    moveFacility: (plot, uid, x, y, rot) => act((s) => C.moveFacility(s, plot, uid, x, y, rot)),
    removeFacility: (plot, uid) => act((s) => C.removeFacility(s, plot, uid)),
    hireWorker: (plot) => act((s) => C.hireWorker(s, plot)),
    setSpecialization: (plot, spec) => act((s) => C.setSpecialization(s, plot, spec)),
    claimDaily: (id) => {
      act((s) => claimDaily(s, id));
    },
    acceptContract: () => {
      act((s) => K.acceptContract(s, Date.now()));
      persist(true);
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
      if (act((s) => R.claimLogin(s, get().snap))) persist(true);
    },
    dismissTip: (id) => {
      act((s) => !s.tips.includes(id) && s.tips.push(id) > 0);
      persist(true);
    },
    claimMilestone: (id) => {
      act((s) => claimMilestone(s, id));
    },
    collectOffline: () => {
      const amount = get().state.pendingOffline?.money ?? 0;
      act((s) => collectOffline(s) > 0 || s.pendingOffline === null);
      if (amount > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: tr("toast.collected", { amount: formatMoney(amount) }), body: tr("toast.collectedBody") });
      persist(true);
    },
    prestige: () => {
      const gained = act((s) => doPrestige(s, Date.now()));
      if (gained > 0) {
        uiEvents.emit({ type: "prestige", points: gained });
        persist(true);
      }
    },
    imperium: () => {
      const gained = act((s) => doImperium(s, Date.now()));
      if (gained > 0) {
        uiEvents.emit({ type: "prestige", points: gained, stars: true });
        persist(true);
      }
    },
    buyStarUpgrade: (id) => {
      const ok = act((s) => buyStarUpgrade(s, id));
      if (ok) persist(true);
      return ok;
    },
    setPref: (key, on) => {
      act((s) => {
        s.settings[key] = on;
        return true;
      });
      persist(true);
    },
    setBuyAmount: (a) => {
      act((s) => {
        s.settings.buyAmount = a;
        return true;
      });
    },
    setLang: (lang) => {
      applyLanguage(lang);
      act((s) => {
        s.settings.lang = lang;
        return true;
      });
      persist(true);
    },
    exportSave: () => encodeSave(get().state),
    importSave: (text) => {
      try {
        const now = Date.now();
        const state = decodeSave(text, now);
        state.lastActiveAt = now;
        commit(state);
        persist(true);
        return true;
      } catch {
        return false;
      }
    },
    resetGame: async () => {
      await saves?.clear();
      const state = createInitialState(Date.now());
      refreshDaily(state, Date.now());
      set({ state, snap: snapshot(state) });
      persist(true);
    },
  };
});
