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
import { RESCUE, type MaterialId } from "@/game/config/economy";
import * as K from "@/game/engine/contracts";
import * as R from "@/game/engine/retention";
import * as D from "@/game/engine/design";
import * as L from "@/game/engine/logistics";
import type { LogisticsUpgrade } from "@/game/config/logistics";
import * as C from "@/game/engine/city";
import * as Co from "@/game/engine/construction";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { PLANT_LEVELS } from "@/game/config/chain";
import { snapshot, unlockedCarIds, type EconomySnapshot } from "@/game/engine/economy";
import { activeEvent } from "@/game/engine/events";
import * as Ev from "@/game/engine/events";
import { collectOffline, settleOffline } from "@/game/engine/offline";
import { checkAchievements, claimDaily, claimMilestone, recordHistory, refreshDaily } from "@/game/engine/progress";
import { cloneState, createInitialState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { formatDuration, formatMoney, formatPercent } from "@/game/format";
import { decodeSave, encodeSave, SaveManager } from "@/game/save";
import { askStartChoice, askWelcome, useCloud } from "./cloud-store";
import type { BuyAmount, CarId, CarRoute, DealerId, FacilityType, GameState, Lang, ManagerId, QualityMode, Specialization, StructureType, ZoneId } from "@/game/types";
import { applyLanguage, detectLanguage, loadLanguage, translate, type MessageKey, type Vars } from "@/i18n";
import { contentFor } from "@/i18n/content";
import { uiEvents } from "./events";
import * as Mk from "@/game/engine/market";
import * as Lv from "@/game/engine/live";
import * as Cl from "@/game/engine/classics";
import * as Evc from "@/game/engine/ev";
import * as Fl from "@/game/engine/floor";
import * as Sy from "@/game/engine/story";
import * as Cn from "@/game/engine/collection";
import { EDITION, type SkinId } from "@/game/config/collection";
import { DILEMMA_BY_ID, RIVAL_CEO } from "@/game/config/story";
import * as Ex from "@/game/engine/expansion";
import * as Dn from "@/game/engine/car-dna";
import * as Sh from "@/game/engine/showroom";
import * as Br from "@/game/engine/brand";
import * as Tr from "@/game/engine/territory";
import { ENGINEER_BY_ID, type EngineerId, type ExportMarketId, type FleetProduct, type PayLevel, type ProtoFocus } from "@/game/config/expansion";
import { HOT_CLASS, RECALL } from "@/game/config/market";
import { claimUnlock, openPlantTypes } from "@/game/engine/unlocks";
import { restockLow } from "@/game/engine/insights";
import { hasPlant as hasPlantType } from "@/game/engine/chain";
import * as Tu from "@/game/engine/tuning";
import * as Gf from "@/game/engine/gifts";
import * as Gh from "@/game/engine/ghost";
import { allianceReward } from "@/game/engine/alliance";
import * as Wt from "@/game/engine/winter";
import * as Ps from "@/game/engine/pass";
import { funnelDue, funnelMinutes } from "@/game/engine/funnel";
import { browserOptOut, sendStep } from "@/game/save/funnel";
import { PASS, type WeeklyId } from "@/game/config/pass";

const TICK_MS = 100;
const SAVE_MS = 5_000;
/** How often the funnel steps are looked at (and any not sent yet are sent). */
const FUNNEL_MS = 30_000;
/** A gap this long between ticks (sleeping laptop, frozen tab) counts as being away. */
const AWAY_GAP_S = 30;
/** Gifts from other players and the player's ghost: first this long after the start, then this often. */
const SOCIAL_FIRST_MS = 8_000;
const SOCIAL_EVERY_MS = 10 * 60_000;

interface GameStore {
  ready: boolean;
  state: GameState;
  snap: EconomySnapshot;
  backend: string;
  /** Saves to the cloud now. */
  syncNow: () => Promise<void>;
  /** The account's save changed on another device meanwhile: keep this game ("local") or play the cloud's. */
  resolveConflict: (keep: "local" | "cloud") => Promise<void>;
  /** Plays a backup kept on this device instead of the current game (which becomes a backup). */
  restoreBackup: (key: string) => boolean;
  /** The save manager (account actions for the profile screen). */
  saves: SaveManager | null;
  /** Collects the gifts other players sent (on the server) and pays them: how many there were. */
  claimGifts: () => Promise<number>;
  /** Pays the thank-you for a gift the server accepted. */
  giftSent: () => void;
  /** Publishes the player's ghost (their best race car) if it changed since it was last published. */
  publishGhost: () => Promise<void>;
  /** Races another player's ghost (pays and records it): the race, or null if not allowed now. */
  duel: (rival: string, ghost: Gh.Ghost) => Gh.DuelResult | null;
  /** Winter festival: opens an advent door (1–24) / takes a finished goal's reward. */
  openAdventDoor: (day: number) => boolean;
  claimWinterGoal: (goal: Wt.WinterGoal) => boolean;
  /** Season pass: takes a reached tier / every reached tier / a finished weekly challenge. */
  claimPassTier: (tier: number) => boolean;
  claimPassAll: () => boolean;
  claimPassWeekly: (id: WeeklyId) => boolean;
  /** Takes a reward tier of the alliance's weekly goal (the server decides): its answer. */
  claimAllianceTier: (tier: number) => Promise<import("@/game/save").ClaimTierResult | "error">;
  init: () => Promise<void>;
  /** Runs a player action on a copy of the state and commits it if it succeeded. */
  act: <T>(fn: (s: GameState) => T) => T;

  plantLevel: (plot: string) => boolean;
  buyBodyMachine: (plot: string) => boolean;
  hireBodyWorker: (plot: string) => boolean;
  plantSpeed: (plot: string) => boolean;
  /** Fixes a broken machine at once (a tap). */
  repairPlant: (plot: string) => boolean;
  /** Overtime: double speed for a while, on cooldown after. */
  boostPlant: (plot: string) => boolean;
  /** Gives a plant's halls a style. */
  setPlantSkin: (plot: string, skin: SkinId) => boolean;
  /** Takes the decision on the CEO's desk (choice 0 or 1). */
  decide: (choice: 0 | 1) => boolean;
  /** Closes the rival campaign's current chapter and pays its reward. */
  claimChapter: () => boolean;
  plantAutomation: (plot: string) => boolean;
  plantGrade: (plot: string) => boolean;
  setPlantCar: (plot: string, car: CarId | null) => void;
  setCombine: (plot: string, on: boolean) => void;
  buyMaterial: (plot: string, m: MaterialId, qty: number) => boolean;
  buyPlan: (plot: string, plan: Mat.RestockPlan) => boolean;
  restockLow: () => number;
  setQualityMode: (plot: string, mode: QualityMode) => void;
  setCarRoute: (plot: string, route: CarRoute) => void;
  payRecall: (cost: number) => void;
  ignoreRecall: () => void;
  claimUnlock: (kind: "car" | "plant", id: string) => number;
  upgradeWarehouse: (plot: string) => boolean;
  upgradePower: (plot: string) => boolean;
  setAutoBuy: (plot: string, on: boolean) => void;
  setBackupParts: (plot: string, on: boolean) => void;
  setAutoUpgrade: (plot: string, on: boolean) => void;
  hireManager: (id: ManagerId, assignTo?: string) => boolean;
  upgradeManager: (id: ManagerId) => boolean;
  assignManager: (id: ManagerId, plot: string | null) => void;
  buyDealer: (id: DealerId) => boolean;
  upgradeDealer: (id: DealerId) => boolean;
  buildCharger: (id: DealerId) => boolean;
  upgradeCarModel: (id: CarId) => boolean;
  buyLogistics: (id: LogisticsUpgrade) => boolean;
  buyTransportTier: () => boolean;
  developDesign: (id: CarId, option: DesignOption) => boolean;
  renameDesign: (id: CarId, name: string) => void;
  setDesignColor: (id: CarId, color: string) => void;
  research: (id: string) => boolean;
  unlockZone: (id: ZoneId) => boolean;
  buildStructure: (plot: string, type: StructureType) => boolean;
  buyLand: (plot: string) => boolean;
  startConstruction: (plot: string, type?: StructureType) => boolean;
  speedUp: (plot: string) => boolean;
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
  acceptVip: () => void;
  declineVip: () => void;
  claimVip: () => void;
  enterShow: (car: CarId) => void;
  claimShow: () => void;
  claimSeason: () => void;
  restoreClassic: (id: string) => void;
  startPrototype: (car: CarId, focus: ProtoFocus) => void;
  windTunnel: (effort: number) => void;
  trackTest: () => void;
  launchProto: (campaign: number) => void;
  openMarket: (id: ExportMarketId) => void;
  setFleetProduct: (p: FleetProduct) => void;
  acceptFleetOrder: () => void;
  declineFleetOrder: () => void;
  finishFleetOrder: () => void;
  hireEngineer: () => void;
  setEngineerPay: (id: EngineerId, pay: PayLevel) => void;
  letGoEngineer: (id: EngineerId) => void;
  counterOffer: () => void;
  declineContract: () => void;
  claimContract: () => void;
  collectOffline: () => void;
  imperium: () => void;
  buyStarUpgrade: (id: StarUpgradeId) => boolean;
  unlockRacing: () => boolean;
  orderRaceCar: (car: CarId) => boolean;
  runTest: (id: number) => void;
  sendCar: (id: number, to: Ch.CarDestination, price?: number) => boolean;
  setShowroomPrice: (id: number, price: number) => boolean;
  startCampaign: () => boolean;
  claimEventGoal: () => void;
  unlockTerritory: (id: import("@/game/config/city").TerritoryId) => boolean;
  setBrand: (patch: Parameters<typeof Br.setBrand>[1]) => boolean;
  cancelRaceOrder: (car: CarId) => boolean;
  selectRaceCar: (id: number) => void;
  enterRace: (event: string, special?: string) => boolean;
  repairRaceCar: (id: number) => boolean;
  upgradeRaceCar: (id: number, u: RaceUpgrade, racingParts?: boolean) => boolean;
  setRaceSkin: (id: number, skin: string) => boolean;
  /** Tuning garage: paint, rims or a spoiler for a race car. */
  tuneCar: (id: number, choice: Tu.TuneChoice) => boolean;
  retireRaceCar: (id: number) => boolean;
  upgradeRacingGarage: () => boolean;
  signSponsor: (id: string | null) => boolean;
  setAutoRacing: (on: boolean) => boolean;
  setAutoRepair: (on: boolean) => void;
  setBuyAmount: (a: BuyAmount) => void;
  setPref: (key: "lowGraphics" | "sound" | "haptics" | "notify" | "stats", on: boolean) => void;
  setLang: (lang: Lang) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetGame: () => Promise<void>;
}

const saves = typeof window !== "undefined" ? new SaveManager({ onSync: (sync) => useCloud.setState({ sync }) }) : null;
let loop: ReturnType<typeof setInterval> | null = null;
/** Set as init starts (it awaits the save): a second call meanwhile must not start a second loop. */
let starting = false;
let lastTick = 0;
let lastSave = 0;
/** The ghost last published (JSON), so an unchanged one isn't sent again. */
let lastGhost = "";
/** The anonymous funnel: when its steps were last looked at, and whether a send is under way. */
let lastFunnel = 0;
let funnelBusy = false;

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
    saves.save({ ...s, lastActiveAt: Date.now() }, force);
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
      else if (e.type === "built") {
        const name = tr(`structure.${e.structure}`);
        uiEvents.emit({
          type: "toast",
          tone: "gold",
          icon: e.upgrade ? "⬆️" : STRUCTURE_BY_ID[e.structure].emoji,
          title: e.upgrade ? tr("toast.upgradeDone", { name, level: e.level }) : tr("toast.constructionDone", { name }),
          body: e.upgrade ? tr("toast.upgradeDoneBody") : tr("toast.constructionDoneBody"),
          action: { label: tr("toast.open"), plot: e.plot },
        });
      }
      else if (e.type === "emergency") uiEvents.emit({ type: "toast", tone: "warn", icon: "🆘", title: tr("toast.emergency"), body: tr("toast.emergencyBody", { money: formatMoney(e.cost) }) });
      else if (e.type === "restructured") uiEvents.emit({ type: "toast", tone: "warn", icon: "🏦", title: tr("toast.restructured"), body: tr("toast.restructuredBody", { money: formatMoney(e.amount), rep: RESCUE.restructure.rep }) });
      else if (e.type === "suspended") uiEvents.emit({ type: "toast", tone: "warn", icon: "⛔", title: tr("toast.suspended"), body: tr("toast.suspendedBody") });
      else if (e.type === "breakdown") {
        const b = next.city.buildings[e.plot];
        if (b) uiEvents.emit({ type: "toast", tone: "warn", icon: "🔧", title: tr("floor.brokeToast", { name: tr(`structure.${b.type}` as MessageKey) }), body: tr("floor.brokeToastBody"), action: { label: tr("floor.repair"), plot: e.plot } });
      }
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
    const vip = Lv.vipTick(next, now, snap);
    if (vip === "offer") uiEvents.emit({ type: "toast", tone: "gold", icon: "💎", title: tr("vip.offerToast"), body: tr(`vip.client.${next.vip.offer!.client}` as MessageKey) });
    else if (vip === "failed") uiEvents.emit({ type: "toast", tone: "warn", icon: "⌛", title: tr("vip.failed") });
    if (Lv.seasonTick(next, now) && next.season.last && !next.season.last.claimed)
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🏆", title: tr("season.over", { rank: next.season.last.rank + 1 }) });
    const restored = Cl.classicsTick(next, now);
    if (restored) uiEvents.emit({ type: "toast", tone: "gold", icon: "🏛️", title: tr("classics.done", { name: tr(`classic.${restored}` as MessageKey) }), body: tr("classics.doneBody") });
    const eng = Ex.engineersTick(next, now, dt);
    if (eng === "candidate") uiEvents.emit({ type: "toast", tone: "info", icon: "👩‍🔬", title: tr("eng.candidateToast", { name: ENGINEER_BY_ID[next.engineers.candidate!.id].name }) });
    else if (eng === "lost") uiEvents.emit({ type: "toast", tone: "warn", icon: "🕵️", title: tr("eng.lostToast") });
    // the season pass: a new season (paying what was left untaken), new weekly challenges
    const pass = Ps.passTick(next, snap, now);
    if (pass.leftover) uiEvents.emit({ type: "toast", tone: "gold", icon: "🎟️", title: tr("pass.leftoverToast", { n: pass.leftover }) });
    if (pass.season && next.pass.season > 1 && next.lifetime.playTime > 600) uiEvents.emit({ type: "toast", tone: "gold", icon: "🎟️", title: tr("pass.newSeason", { n: next.pass.season }), action: { label: tr("pass.open"), view: "pass" } });
    if (Wt.winterTick(next, snap, now)) uiEvents.emit({ type: "toast", tone: "gold", icon: "🎄", title: tr("winter.startToast"), body: tr("winter.startToastBody"), action: { label: tr("winter.open"), view: "winter" } });
    const fo = Ex.fleetOrderTick(next, now);
    if (fo === "offer") uiEvents.emit({ type: "toast", tone: "info", icon: "🚌", title: tr("fleet.offerToast") });
    else if (fo === "failed") uiEvents.emit({ type: "toast", tone: "warn", icon: "⌛", title: tr("fleet.failed") });
    // now and then a car off the line is a limited edition
    const built = events.find((e) => e.type === "carBuilt");
    const edition = Cn.editionTick(next, built?.type === "carBuilt" ? built.car : null, now);
    if (edition) {
      const car = built?.type === "carBuilt" ? names().car(CAR_BY_ID[built.car]) : "";
      uiEvents.emit({ type: "toast", tone: "gold", icon: edition.icon, title: tr("edition.toast", { name: tr(`edition.${edition.id}` as MessageKey), car }), body: tr("edition.toastBody", { pct: formatPercent(EDITION.income) }), action: { label: tr("edition.see"), view: "cars" } });
    }
    const story = Sy.storyTick(next, snap);
    if (story === "offer") {
      const { id, plot } = next.story.pending!;
      const b = next.city.buildings[plot];
      const plant = b ? tr(`structure.${b.type}` as MessageKey) : "";
      uiEvents.emit({ type: "toast", tone: "gold", icon: DILEMMA_BY_ID[id].icon, title: tr("story.offerToast"), body: tr(`story.d.${id}.title` as MessageKey, { plant }), action: { label: tr("story.decide"), view: "story" } });
    } else if (story === "expired") uiEvents.emit({ type: "toast", tone: "warn", icon: "⌛", title: tr("story.expired") });
    else if (story === "chapter") uiEvents.emit({ type: "toast", tone: "gold", icon: RIVAL_CEO.emoji, title: tr("story.chapterToast"), body: tr("story.chapterToastBody"), action: { label: tr("story.open"), view: "story" } });
    const pa = state.proto.active;
    if (pa && state.lastActiveAt < pa.until && now >= pa.until) uiEvents.emit({ type: "toast", tone: "success", icon: "🧪", title: tr("proto.stageDone") });
    const trend = Mk.trendOf(next);
    if (trend.hot && trend.block !== Mk.trendOf(state).block) {
      uiEvents.emit({ type: "toast", tone: "info", icon: "📰", title: tr("news.toast"), body: tr("news.hot", { cls: tr(`class.${trend.hot}` as MessageKey), price: formatPercent(HOT_CLASS.price), demand: formatPercent(HOT_CLASS.demand - 1) }) });
    }
    commit(next, snap);
    if (now - lastSave > SAVE_MS) persist();
    if (now - lastFunnel > FUNNEL_MS) {
      lastFunnel = now;
      void sendFunnel(now);
    }
  }

  /** Sends the funnel steps this company has reached and not sent yet, one after another (anonymous: engine/funnel.ts). */
  async function sendFunnel(now: number) {
    const s = get().state;
    if (funnelBusy || !s.settings.stats || browserOptOut()) return;
    funnelBusy = true;
    try {
      for (const step of funnelDue(s, now)) {
        if (!(await sendStep(step, funnelMinutes(get().state)))) break;
        act((x) => {
          if (!x.funnel.includes(step)) x.funnel.push(step);
          return true;
        });
      }
    } finally {
      funnelBusy = false;
    }
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
    backend: saves?.backendName ?? "memory",
    saves,
    syncNow: async () => {
      persist(true);
      await saves?.flush();
    },
    resolveConflict: async (keep) => {
      if (!saves) return;
      const now = Date.now();
      const state = await saves.resolveConflict(keep, now);
      if (keep === "cloud" && state) {
        settleOffline(state, now);
        refreshDaily(state, now);
        lastTick = Date.now();
        commit(state);
        persist();
      }
    },
    restoreBackup: (key) => {
      if (!saves || get().saves?.sync?.state.status === "conflict") return false;
      const now = Date.now();
      const state = saves.restoreBackup(key, get().state, now);
      if (!state) return false;
      refreshDaily(state, now);
      lastTick = Date.now();
      commit(state);
      persist(true);
      return true;
    },
    act,
    claimGifts: async () => {
      const social = saves?.social;
      // not while two saves wait for the player's choice: the one paid might be dropped
      if (!social || !get().ready || saves?.sync?.state.status === "conflict") return 0;
      const n = await social.claimGifts().catch(() => 0);
      if (!n) return 0;
      let money = 0;
      act((s) => (money = Gf.receiveGifts(s, n, get().snap)) > 0);
      persist(true);
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🎁", title: tr("gift.received", { n }), body: tr("gift.receivedBody", { money: formatMoney(money) }) });
      return n;
    },
    giftSent: () => {
      let money = 0;
      act((s) => (money = Gf.giftSent(s, get().snap)) > 0);
      persist(true);
      uiEvents.emit({ type: "toast", tone: "success", icon: "🎁", title: tr("gift.sent"), body: tr("gift.sentBody", { money: formatMoney(money) }) });
    },
    publishGhost: async () => {
      const social = saves?.social;
      if (!social || !get().ready) return;
      const ghost = Gh.ghostOf(get().state);
      const json = JSON.stringify(ghost);
      if (json === lastGhost) return;
      // (false while the player has no card yet: tried again next time)
      if (await social.publishGhost(ghost).catch(() => false)) lastGhost = json;
    },
    duel: (rival, ghost) => {
      let result: Gh.DuelResult | null = null;
      act((s) => !!(result = Gh.duel(s, rival, ghost, get().snap, Date.now())));
      if (result) persist(true);
      return result;
    },
    openAdventDoor: (day) => {
      let money: number | null = null;
      const ok = act((s) => (money = Wt.openDoor(s, day, get().snap, Date.now())) !== null);
      if (ok) {
        persist(true);
        const r = Wt.ADVENT[day - 1];
        uiEvents.emit({ type: "toast", tone: "gold", icon: day === 24 ? "🎁" : "🎄", title: tr("winter.doorToast", { day }), body: tr(r.stars ? "winter.doorStars" : "winter.doorBody", { money: formatMoney(money ?? 0), stars: r.stars ?? 0 }) });
      }
      return ok;
    },
    claimWinterGoal: (goal) => {
      let money: number | null = null;
      const ok = act((s) => (money = Wt.claimWinterGoal(s, goal, get().snap, Date.now())) !== null);
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "gold", icon: "⭐", title: tr("winter.goalToast"), body: tr("winter.doorStars", { money: formatMoney(money ?? 0), stars: Wt.WINTER.goalReward.stars ?? 0 }) });
      }
      return ok;
    },
    claimPassTier: (tier) => {
      let money: number | null = null;
      const ok = act((s) => (money = Ps.claimTier(s, tier, get().snap, Date.now())) !== null);
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "gold", icon: "🎟️", title: tr("pass.tierToast", { n: tier }), body: tr("pass.tierBody", { money: formatMoney(money ?? 0) }) });
      }
      return ok;
    },
    claimPassAll: () => {
      let got = { tiers: 0, money: 0 };
      const ok = act((s) => (got = Ps.claimAllTiers(s, get().snap, Date.now())).tiers > 0);
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "gold", icon: "🎟️", title: tr("pass.allToast", { n: got.tiers }), body: tr("pass.tierBody", { money: formatMoney(got.money) }) });
      }
      return ok;
    },
    claimPassWeekly: (id) => {
      const ok = act((s) => Ps.claimWeekly(s, id));
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "success", icon: "📅", title: tr("pass.weeklyToast", { xp: PASS.xp.weekly }) });
      }
      return ok;
    },
    claimAllianceTier: async (tier) => {
      const social = saves?.social;
      if (!social) return "error";
      const r = await social.claimAllianceTier(tier).catch(() => "error" as const);
      if (r !== "ok") return r;
      let money = 0;
      act((s) => (money = allianceReward(s, tier, get().snap)) > 0);
      persist(true);
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🤝", title: tr("alliance.claimed", { tier }), body: tr("alliance.claimedBody", { money: formatMoney(money) }) });
      return r;
    },

    init: async () => {
      if (get().ready || loop || starting) return;
      starting = true;
      const now = Date.now();
      // the loading and sign-in screens in the player's language
      const guess = detectLanguage();
      await loadLanguage(guess).catch(() => {});
      set({ state: { ...get().state, settings: { ...get().state.settings, lang: guess } } });
      // the account and its save first: nothing starts (or gets saved) before they are known
      const start = saves
        ? await saves.start(now, { choose: (local, cloud, reason) => askStartChoice({ local, cloud, reason }), signIn: askWelcome })
        : { state: null, mode: "local" as const };
      useCloud.setState({ mode: start.mode, account: saves?.account ?? null, outdated: !!start.outdated, phase: "save" });
      set({ backend: saves?.backendName ?? "memory" });
      if (start.outdated) {
        starting = false;
        return;
      }
      // the profile too before the game shows (a slow answer does not hold it up: it follows in the background)
      if (saves?.account) {
        const loading = saves.profile().catch(() => null);
        const profile = await Promise.race([loading, new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
        if (profile) useCloud.setState({ profile });
        else void loading.then((p) => p && useCloud.setState({ profile: p }));
      }
      let state = start.state;
      if (!state) {
        state = createInitialState(now);
        state.settings.lang = detectLanguage();
      } else {
        settleOffline(state, now);
      }
      refreshDaily(state, now);
      // the player's language before the first screen (English if it cannot load)
      await loadLanguage(state.settings.lang).catch(() => {});
      applyLanguage(state.settings.lang);
      lastTick = Date.now();
      lastSave = lastTick;
      set({ ready: true, state, snap: snapshot(state) });
      loop = setInterval(runTick, TICK_MS);

      useCloud.setState({ phase: "ready" });
      // leaving or hiding the game: this device at once, the cloud right away (best effort: the
      // periodic saves already keep it close, since unload events may not finish)
      const flush = () => {
        persist(true);
        void saves?.flush();
      };
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      window.addEventListener("online", () => saves?.sync?.retryNow());
      // gifts from other players, and the player's ghost: soon after the start, then now and then
      if (saves?.social) {
        const social = () => {
          void get().claimGifts();
          void get().publishGhost();
        };
        setTimeout(social, SOCIAL_FIRST_MS);
        setInterval(social, SOCIAL_EVERY_MS);
      }
    },

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
    restockLow: () => act((s) => restockLow(s, get().snap)),
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
    upgradeCarModel: (id) => act((s) => A.upgradeCarModel(s, id)),
    buyLogistics: (id) => act((s) => L.buyLogistics(s, id, get().snap.gm.costMult)),
    unlockRacing: () => act((s) => Rc.unlockRacing(s)),
    orderRaceCar: (car) => act((s) => Rc.orderRaceCar(s, car)),
    runTest: (id) => {
      const r = act((s) => Dn.runTest(s, id));
      if (r) uiEvents.emit({ type: "toast", tone: "success", icon: "⏱️", title: tr("test.done", { t: r.zeroTo100.toFixed(1), v: r.topSpeed }) });
    },
    sendCar: (id, to, price) => act((s) => Ch.sendCar(s, id, to, price)),
    setShowroomPrice: (id, price) => act((s) => Sh.setPrice(s, id, price)),
    startCampaign: () => act((s) => Sh.startCampaign(s)),
    claimEventGoal: () => {
      let cash: number | null = null;
      act((s) => (cash = Ev.claimEventGoal(s, s.lastActiveAt)) !== null);
      if (cash !== null) uiEvents.emit({ type: "toast", tone: "gold", icon: "🎯", title: tr("eventGoal.claimed", { money: formatMoney(cash) }) });
    },
    setBrand: (patch) => act((s) => Br.setBrand(s, patch)),
    unlockTerritory: (id) => {
      const ok = act((s) => Tr.unlockTerritory(s, id));
      if (ok) uiEvents.emit({ type: "toast", tone: "gold", icon: "🗺️", title: tr("territory.opened", { name: tr(`territory.${id}`) }) });
      return ok;
    },
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
    tuneCar: (id, choice) => {
      const ok = act((s) => Tu.tune(s, id, choice));
      if (ok) persist(true);
      return ok;
    },
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
    upgradeBuilding: (plot) => act((s) => C.upgradeBuilding(s, plot)),
    placeFacility: (plot, type, x, y, rot) => act((s) => C.placeFacility(s, plot, type, x, y, rot)),
    moveFacility: (plot, uid, x, y, rot) => act((s) => C.moveFacility(s, plot, uid, x, y, rot)),
    removeFacility: (plot, uid) => act((s) => C.removeFacility(s, plot, uid)),
    hireWorker: (plot) => act((s) => C.hireWorker(s, plot)),
    setSpecialization: (plot, spec) => act((s) => C.setSpecialization(s, plot, spec)),
    claimDaily: (id) => {
      act((s) => claimDaily(s, id));
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
    imperium: () => {
      const gained = act((s) => doImperium(s, Date.now()));
      if (gained > 0) {
        uiEvents.emit({ type: "imperium", stars: gained });
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
      // switch once the language's texts are here (no flash of English)
      void loadLanguage(lang)
        .catch(() => {})
        .then(() => {
          applyLanguage(lang);
          act((s) => {
            s.settings.lang = lang;
            return true;
          });
          persist(true);
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
        // the save's language: its texts follow as soon as they load
        void loadLanguage(state.settings.lang).then(() => applyLanguage(state.settings.lang), () => {});
        return true;
      } catch {
        return false;
      }
    },
    resetGame: async () => {
      saves?.clearLocal();
      const old = get().state;
      const state = createInitialState(Date.now());
      // the same player starting over is not a new player: the funnel steps already sent stay sent
      state.funnel = [...old.funnel];
      state.settings.stats = old.settings.stats;
      refreshDaily(state, Date.now());
      set({ state, snap: snapshot(state) });
      persist(true);
    },
  };
});
