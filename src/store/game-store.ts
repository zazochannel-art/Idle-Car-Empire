"use client";

import { create } from "zustand";
import { ACHIEVEMENT_BY_ID } from "@/game/config/achievements";
import { CAR_BY_ID } from "@/game/config/cars";
import { FACTORY_BY_ID, LEVEL_MILESTONES } from "@/game/config/factories";
import { MANAGER_BY_ID } from "@/game/config/managers";
import { RESEARCH_BY_ID } from "@/game/config/research";
import * as A from "@/game/engine/actions";
import { snapshot, unlockedCarIds, type EconomySnapshot } from "@/game/engine/economy";
import { collectOffline, settleOffline } from "@/game/engine/offline";
import { prestige as doPrestige } from "@/game/engine/prestige";
import { checkAchievements, claimDaily, claimMilestone, refreshDaily } from "@/game/engine/progress";
import { cloneState, createInitialState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { formatMoney } from "@/game/format";
import { decodeSave, encodeSave, SaveManager } from "@/game/save";
import type { BuyAmount, CarId, DealerId, FactoryId, GameState, ManagerId, UpgradeCategory } from "@/game/types";
import { uiEvents } from "./events";

export type View =
  | "empire"
  | "dealers"
  | "cars"
  | "research"
  | "managers"
  | "missions"
  | "achievements"
  | "stats"
  | "prestige";

const TICK_MS = 100;
const SAVE_MS = 5_000;
/** A gap this long between ticks (sleeping laptop, frozen tab) counts as being away. */
const AWAY_GAP_S = 30;

interface GameStore {
  ready: boolean;
  state: GameState;
  snap: EconomySnapshot;
  view: View;
  backend: string;
  setView: (v: View) => void;
  init: () => Promise<void>;
  /** Runs a player action on a copy of the state and commits it if it succeeded. */
  act: <T>(fn: (s: GameState) => T) => T;

  build: (id: FactoryId) => void;
  rush: (id: FactoryId) => void;
  buyFactory: (id: FactoryId) => boolean;
  buyLevels: (id: FactoryId) => number;
  buyLine: (id: FactoryId) => boolean;
  buyUpgrade: (id: FactoryId, cat: UpgradeCategory) => boolean;
  selectCar: (id: FactoryId, car: CarId | null) => void;
  hireManager: (id: ManagerId, assignTo?: FactoryId) => boolean;
  upgradeManager: (id: ManagerId) => boolean;
  assignManager: (id: ManagerId, factory: FactoryId | null) => void;
  buyDealer: (id: DealerId) => boolean;
  upgradeDealer: (id: DealerId) => boolean;
  upgradeCarModel: (id: CarId) => boolean;
  research: (id: string) => boolean;
  claimDaily: (id: string) => void;
  claimMilestone: (id: string) => void;
  collectOffline: () => void;
  prestige: () => void;
  setBuyAmount: (a: BuyAmount) => void;
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
  /** Recomputes derived data, unlocks achievements and publishes the new state. */
  function commit(next: GameState, prevSnap?: EconomySnapshot) {
    let snap = snapshot(next);
    const fresh = checkAchievements(next, snap);
    if (fresh.length) {
      snap = snapshot(next);
      for (const id of fresh) {
        const a = ACHIEVEMENT_BY_ID[id];
        uiEvents.emit({ type: "toast", tone: "gold", icon: a.icon, title: `Achievement: ${a.name}`, body: `${a.description} · +2% income forever` });
      }
    }
    if (prevSnap) {
      const before = unlockedCarIds(get().state, prevSnap.gm);
      for (const id of unlockedCarIds(next, snap.gm)) {
        if (!before.has(id)) {
          const car = CAR_BY_ID[id];
          uiEvents.emit({ type: "toast", tone: "info", icon: car.emoji, title: `New car unlocked: ${car.name}`, body: car.tagline });
        }
      }
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

    const events = engineTick(next, dt, Math.random, snap);
    next.lastActiveAt = now;
    if (refreshDaily(next, now, snap)) {
      uiEvents.emit({ type: "toast", tone: "info", icon: "📋", title: "New daily missions", body: "Three fresh goals are waiting." });
    }
    for (const e of events) if (e.type === "sale") uiEvents.emit(e);
    commit(next);
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
    view: "empire",
    backend: saves?.backend ?? "memory",
    setView: (view) => {
      set({ view });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    act,

    init: async () => {
      if (get().ready || loop) return;
      const now = Date.now();
      let state = (await saves?.load(now)) ?? null;
      if (!state) {
        state = createInitialState(now);
      } else {
        settleOffline(state, now);
      }
      refreshDaily(state, now);
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

    build: (id) => {
      act((s) => A.startProduction(s, id));
    },
    rush: (id) => {
      act((s) => A.rush(s, id));
    },
    buyFactory: (id) => {
      const ok = act((s) => A.buyFactory(s, id));
      if (ok) {
        const f = FACTORY_BY_ID[id];
        uiEvents.emit({ type: "toast", tone: "success", icon: f.emoji, title: `${f.name} acquired!`, body: `${f.city} · ${f.continent}` });
        persist(true);
      }
      return ok;
    },
    buyLevels: (id) => {
      const amount = get().state.settings.buyAmount;
      const before = get().state.factories[id].level;
      const n = act((s) => A.buyLevels(s, id, amount));
      if (n > 0) uiEvents.emit({ type: "levelUp", factory: id, levels: n });
      const after = get().state.factories[id].level;
      const milestone = LEVEL_MILESTONES.find((m) => before < m && after >= m);
      if (milestone) {
        uiEvents.emit({ type: "toast", tone: "gold", icon: "⚡", title: `${FACTORY_BY_ID[id].name} reached level ${milestone}!`, body: "Milestone bonus: ×2 production speed" });
      }
      return n;
    },
    buyLine: (id) => act((s) => A.buyLine(s, id)),
    buyUpgrade: (id, cat) => act((s) => A.buyUpgrade(s, id, cat)),
    selectCar: (id, car) => {
      act((s) => A.selectCar(s, id, car));
    },
    hireManager: (id, assignTo) => {
      const ok = act((s) => A.hireManager(s, id, assignTo));
      if (ok) {
        const m = MANAGER_BY_ID[id];
        uiEvents.emit({ type: "toast", tone: "success", icon: m.avatar, title: `${m.name} joined the company`, body: m.role });
      }
      return ok;
    },
    upgradeManager: (id) => act((s) => A.upgradeManager(s, id)),
    assignManager: (id, factory) => {
      act((s) => A.assignManager(s, id, factory));
    },
    buyDealer: (id) => act((s) => A.buyDealer(s, id)),
    upgradeDealer: (id) => act((s) => A.upgradeDealer(s, id)),
    upgradeCarModel: (id) => act((s) => A.upgradeCarModel(s, id)),
    research: (id) => {
      const ok = act((s) => A.doResearch(s, id));
      if (ok) {
        const r = RESEARCH_BY_ID[id];
        uiEvents.emit({ type: "toast", tone: "info", icon: "🔬", title: `Research complete: ${r.name}`, body: r.description });
      }
      return ok;
    },
    claimDaily: (id) => {
      act((s) => claimDaily(s, id));
    },
    claimMilestone: (id) => {
      act((s) => claimMilestone(s, id));
    },
    collectOffline: () => {
      const amount = get().state.pendingOffline?.money ?? 0;
      act((s) => collectOffline(s) > 0 || s.pendingOffline === null);
      if (amount > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: `Collected ${formatMoney(amount)}`, body: "Your factories never sleep." });
      persist(true);
    },
    prestige: () => {
      const gained = act((s) => doPrestige(s, Date.now()));
      if (gained > 0) {
        uiEvents.emit({ type: "prestige", points: gained });
        persist(true);
      }
    },
    setBuyAmount: (a) => {
      act((s) => {
        s.settings.buyAmount = a;
        return true;
      });
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
      set({ state, snap: snapshot(state), view: "empire" });
      persist(true);
    },
  };
});
