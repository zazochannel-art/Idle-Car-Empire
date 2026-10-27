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
import { awayEvents } from "@/game/engine/away";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { PLANT_LEVELS } from "@/game/config/chain";
import { snapshot, unlockedCarIds, type EconomySnapshot } from "@/game/engine/economy";
import { activeEvent } from "@/game/engine/events";
import * as Ev from "@/game/engine/events";
import { OFFLINE } from "@/game/config/offline";
import { collectOffline, settleOffline } from "@/game/engine/offline";
import { checkAchievements, claimDaily, claimMilestone, recordHistory, refreshDaily, rewardCash } from "@/game/engine/progress";
import { cloneState, createInitialState } from "@/game/engine/state";
import { tick as engineTick } from "@/game/engine/tick";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import { decodeSave, encodeSave, SaveManager, type CupPlace, type CupSubmitResult, type RedeemInviteResult, type SaveWhere } from "@/game/save";
import { askStartChoice, askWelcome, useCloud } from "./cloud-store";
import type { BuyAmount, CarId, CarRoute, DealerId, FacilityType, GameState, Lang, ManagerId, NoticeKind, PlantType, QualityMode, Specialization, StructureType, ZoneId } from "@/game/types";
import { applyLanguage, detectLanguage, loadLanguage, translate, type MessageKey, type Vars } from "@/i18n";
import { contentFor } from "@/i18n/content";
import { uiEvents } from "./events";
import type { AwayNote } from "@/lib/notify";
import { pushSupported, pushToken, startPush } from "@/lib/push";
import { useUi } from "./ui-store";
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
import { hasPlant as hasPlantType } from "@/game/engine/chain";
import * as Tu from "@/game/engine/tuning";
import * as Gf from "@/game/engine/gifts";
import * as Iv from "@/game/engine/invites";
import * as Cu from "@/game/engine/cup";
import * as Gh from "@/game/engine/ghost";
import { allianceReward } from "@/game/engine/alliance";
import { grantAd } from "@/game/engine/ads";
import type { AdReward } from "@/game/config/ads";
import * as Shop from "@/game/engine/shop";
import * as St from "@/game/engine/stock";
import * as Mt from "@/game/engine/maintenance";
import { SHOP_ITEM_BY_ID, type ShopItemId } from "@/game/config/shop";
import * as Iap from "@/game/engine/iap";
import { IAP_ICON, type IapProduct } from "@/game/config/iap";
import * as Wt from "@/game/engine/winter";
import * as Fe from "@/game/engine/festival";
import * as Ps from "@/game/engine/pass";
import * as Mb from "@/game/engine/map-bonus";
import * as Lm from "@/game/engine/landmarks";
import { LANDMARK_BY_TERRITORY } from "@/game/config/landmarks";
import { RACING } from "@/game/city/layout";
import { MAP_BONUS_BY_KIND, type MapBonusKind } from "@/game/config/map-bonus";
import { funnelDue, funnelMinutes } from "@/game/engine/funnel";
import { browserOptOut, sendStep } from "@/game/save/funnel";
import { PASS, type WeeklyId } from "@/game/config/pass";
import { batteryState, isIdle, isSaving, minTickMs, onSaverChange, setSaverSetting, startPower, type SaverSetting } from "@/lib/power";
import { maybeAskForReview } from "@/lib/review";

const TICK_MS = 100;
/** How often the ticks refresh the screens' view of the state (ms). */
const VIEW_MS = 250;
const SAVE_MS = 5_000;
/** How often the funnel steps are looked at (and any not sent yet are sent). */
const FUNNEL_MS = 30_000;
/** A gap this long between ticks (sleeping laptop, frozen tab) counts as being away. */
const AWAY_GAP_S = 30;

/** Settles time away; an absence too short for the report is told in a toast. */
function settleAway(s: GameState, now: number) {
  const away = (now - s.lastActiveAt) / 1000;
  const cash = s.cash;
  if (settleOffline(s, now) || away < OFFLINE.minToastSeconds || s.cash <= cash) return;
  uiEvents.emit({ type: "toast", tone: "gold", icon: "🏭", title: translate(s.settings.lang, "offline.short", { money: formatMoney(s.cash - cash) }) });
}

/** Gifts from other players and the player's ghost: first this long after the start, then this often. */
const SOCIAL_FIRST_MS = 8_000;
const SOCIAL_EVERY_MS = 10 * 60_000;

interface GameStore {
  ready: boolean;
  state: GameState;
  snap: EconomySnapshot;
  /**
   * The state for screens that show it in detail (lists, cards, panels): the player's actions
   * reach it at once, the ticks about four times a second, which reads the same and is far less
   * work than redrawing a whole screen ten times a second.
   */
  view: { state: GameState; snap: EconomySnapshot };
  /** Where the game is saved (Settings): on the phone, and in the cloud when signed in. */
  backend: SaveWhere;
  /** Saves to the cloud now. */
  syncNow: () => Promise<void>;
  /** The account's save changed on another device meanwhile: keep this game ("local") or play the cloud's. */
  resolveConflict: (keep: "local" | "cloud") => Promise<void>;
  /** Plays a backup kept on this device instead of the current game (which becomes a backup). */
  restoreBackup: (key: string) => boolean;
  /** Plays a cloud backup in place of the current game (Profile → Cloud backups). */
  restoreCloudBackup: (id: number) => Promise<"ok" | "newer" | "failed">;
  /** The save manager (account actions for the profile screen). */
  saves: SaveManager | null;
  /** Collects the gifts other players sent (on the server) and pays them: how many there were. */
  claimGifts: () => Promise<number>;
  /** Rewards for friends who built their first car with the player's invite code. */
  claimInviteRewards: () => Promise<number>;
  /** Uses a friend's invite code: the welcome gift on "ok". */
  redeemInvite: (code: string) => Promise<RedeemInviteResult | "network">;
  /** Races a timed run of the weekly cup (engine/cup.ts); a new best goes to the board. Null: not allowed now. */
  cupRun: () => Cu.CupRun | null;
  /** Sends the week's best to the cup board if it isn't there yet: the server's answer (null: nothing to send). */
  sendCup: () => Promise<CupSubmitResult | "network" | null>;
  /** Pays the player's places in finished cup weeks: how many weeks were paid. */
  claimCupPrizes: () => Promise<number>;
  /** Forgets this phone's notification token on the server (before signing out; lib/push.ts). */
  forgetPush: () => Promise<void>;
  /** Pays the thank-you for a gift the server accepted. */
  giftSent: () => void;
  /** Hides a player from the boards and visits on this account (their name is kept to list them in the Profile). */
  hidePlayer: (id: string, name: string) => void;
  /** Shows a hidden player again (null: all of them). */
  unhidePlayer: (id: string | null) => void;
  /** Publishes the player's ghost (their best race car) if it changed since it was last published. */
  publishGhost: () => Promise<void>;
  /** Races another player's ghost (pays and records it): the race, or null if not allowed now. */
  duel: (rival: string, ghost: Gh.Ghost) => Gh.DuelResult | null;
  /** Winter festival: opens an advent door (1–24) / takes a finished goal's reward. */
  openAdventDoor: (day: number) => boolean;
  claimWinterGoal: (goal: Wt.WinterGoal) => boolean;
  /** Takes a finished spring or summer festival goal (engine/festival.ts). */
  claimFestivalGoal: (goal: Fe.FestivalGoal) => boolean;
  /** Season pass: takes a reached tier / every reached tier / a finished weekly challenge. */
  claimPassTier: (tier: number) => boolean;
  claimPassAll: () => boolean;
  claimPassWeekly: (id: WeeklyId) => boolean;
  /** Takes a reward tier of the alliance's weekly goal (the server decides): its answer. */
  claimAllianceTier: (tier: number) => Promise<import("@/game/save").ClaimTierResult | "error">;
  init: () => Promise<void>;
  /** The app went to the background (Android): saves at once and stops ticking until it is back. */
  suspend: () => void;
  /** Back in front: ticks again, the time away settled like any absence. */
  resume: () => void;
  /** What will be waiting while the game is closed, as notifications for the phone (lib/notify.ts). */
  awayNotes: () => AwayNote[];
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
  /** The reward of a rewarded ad the player watched to the end (offline ×2, a job finished, the ×2 profit boost). */
  adReward: (reward: AdReward, plot?: string) => boolean;
  /** A shop item: the free crate, a ⭐ Star item, or an ad item (only once its ad was watched to the end). */
  shopBuy: (id: ShopItemId) => boolean;
  /** A purchase from Google Play (`token`: its iapTokenKey), given once and saved at once; acknowledge it only if not "duplicate". */
  iapGrant: (p: IapProduct, token: string) => Iap.GrantResult;
  /** The server says a purchase was refunded (docs/android/iap.md): the ad-free rewards stop. */
  iapRevoke: (p: IapProduct) => boolean;
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
  /** The maintenance crew's next level. */
  buyMaintenance: () => boolean;
  /** The stock exchange: sell a tenth of the company, or buy one back. */
  sellShares: () => boolean;
  buyBackShares: () => boolean;
  /** A kind of notice on screen or only in the notification center. */
  setToastOff: (kind: NoticeKind, off: boolean) => void;
  imperium: () => void;
  buyStarUpgrade: (id: StarUpgradeId) => boolean;
  unlockRacing: () => boolean;
  orderRaceCar: (car: CarId) => boolean;
  runTest: (id: number) => void;
  sendCar: (id: number, to: Ch.CarDestination, price?: number) => boolean;
  setShowroomPrice: (id: number, price: number) => boolean;
  startCampaign: () => boolean;
  claimEventGoal: () => void;
  /** Takes the bonus on the Empire Map (engine/map-bonus.ts): its money, or null when it is gone. */
  claimMapBonus: (id: number) => number | null;
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
  setPref: (key: "lowGraphics" | "sound" | "music" | "haptics" | "notify" | "stats", on: boolean) => void;
  setSaver: (saver: SaverSetting) => void;
  setLang: (lang: Lang) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  resetGame: () => Promise<void>;
}

const saves = typeof window !== "undefined" ? new SaveManager({ onSync: (sync) => useCloud.setState({ sync }) }) : null;
let loop: ReturnType<typeof setInterval> | null = null;
/** Set as init starts (it awaits the save): a second call meanwhile must not start a second loop. */
let starting = false;
/** The app is in the background (Android): the loop stays stopped until it is back. */
let away = false;
let lastTick = 0;
/** What the plants' auto-upgrades may still spend (Ch.autoBudget): it starts empty with each session. */
let autoMoney = 0;
let lastView = 0;
let lastSave = 0;
/** The ghost last published (JSON), so an unchanged one isn't sent again. */
let lastGhost = "";
/** The cars and plants open at the last commit (unlock moments compare against them). */
let opened: { state: GameState; cars: Set<CarId>; plants: Set<PlantType> } | null = null;
/** The anonymous funnel: when its steps were last looked at, and whether a send is under way. */
let lastFunnel = 0;
let funnelBusy = false;

const initial = createInitialState(0);

export const useGame = create<GameStore>((set, get) => {
  const tr = (key: MessageKey, vars?: Vars) => translate(get().state.settings.lang, key, vars);
  const names = () => contentFor(get().state.settings.lang);

  /** Recomputes derived data, unlocks achievements and publishes the new state. */
  function commit(next: GameState, prevSnap?: EconomySnapshot, fromTick = false) {
    let snap = snapshot(next);
    const fresh = checkAchievements(next, snap);
    if (fresh.length) {
      snap = snapshot(next);
      for (const id of fresh) {
        const a = ACHIEVEMENT_BY_ID[id];
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: a.icon, title: tr("toast.achievement", { name: names().achievement(a) }), body: tr("toast.achievementBody", { desc: names().achievementDesc(a) }) });
      }
    }
    const prev = get().state;
    // unlock moments (not across a new run: everything "unlocks" again then); what was open
    // before is usually what the last commit found, so each tick works it out once
    if (prevSnap && prev.runStartedAt === next.runStartedAt) {
      const before = opened?.state === prev ? opened : { cars: unlockedCarIds(prev, prevSnap.gm), plants: openPlantTypes(prev) };
      const cars = unlockedCarIds(next, snap.gm);
      const plants = openPlantTypes(next);
      for (const id of cars) if (!before.cars.has(id)) uiEvents.emit({ type: "unlock", kind: "car", id });
      for (const id of plants) if (!before.plants.has(id) && !hasPlantType(prev, id)) uiEvents.emit({ type: "unlock", kind: "plant", id });
      opened = { state: next, cars, plants };
    }
    const now = Date.now();
    const keep = fromTick && now - lastView < VIEW_MS;
    if (!keep) lastView = now;
    set({ state: next, snap, view: keep ? get().view : { state: next, snap } });
  }

  function persist(force = false) {
    if (!saves) return;
    const s = get().state;
    lastSave = Date.now();
    saves.save({ ...s, lastActiveAt: Date.now() }, force);
  }

  function runTick() {
    const now = Date.now();
    // the battery saver ticks less often (the engine runs on elapsed time, so nothing is lost)
    if (isSaving() && now - lastTick < minTickMs(true, isIdle()) - 5) return;
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    const { state, snap } = get();
    const next = cloneState(state);

    if (dt > AWAY_GAP_S) {
      // The page was frozen: settle it like a normal absence.
      next.lastActiveAt = now - dt * 1000;
      settleAway(next, now);
      commit(next);
      return;
    }

    const cash = next.cash;
    const events = engineTick(next, dt, snap);
    next.lastActiveAt = now;
    recordHistory(next, now, snap.incomePerSec);
    // the shareholders take their part of what was just earned (engine/stock.ts)
    const earned = next.cash - cash;
    const dividends = St.payDividends(next, earned);
    St.stockTick(next, snap, now);
    // the auto-upgrades invest a share of what is left of it, never collected or reward money;
    // they buy quietly (the plant's panel shows its levels; a toast for each came too often)
    autoMoney = Ch.autoBudget(autoMoney, earned - dividends, next.cash);
    const autoLog: { plot: string; cost: number }[] = [];
    Ch.autoUpgrade(next, snap.gm, autoLog, autoMoney);
    for (const p of autoLog) autoMoney -= p.cost;
    R.updateLogin(next, now);
    for (const r of R.checkRivals(next, now)) {
      uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: r.emoji, title: tr("rival.beaten", { name: r.name }), body: tr("rival.beatenBody", { n: r.stars }) });
    }
    const deal = K.refreshContracts(next, now, snap);
    if (deal === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "📨", title: tr("contract.offerToast"), body: tr("contract.offerToastBody") });
    else if (deal === "expired") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("contract.expired") });
    const ev = activeEvent(now);
    if (ev && !activeEvent(state.lastActiveAt)) {
      const n = contentFor(next.settings.lang);
      uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: ev.event.emoji, title: tr("event.started", { name: n.event(ev.event) }), body: n.eventDesc(ev.event) });
    }
    if (refreshDaily(next, now, snap)) {
      uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon: "📋", title: tr("toast.daily"), body: tr("toast.dailyBody") });
    }
    for (const e of events) {
      if (e.type === "sale") uiEvents.emit(e);
      else if (e.type === "carBuilt" && e.first) uiEvents.emit({ type: "firstCar", plot: e.plot, car: e.car });
      else if (e.type === "built") {
        // a finished upgrade has no toast (with many plants they covered the map); a new building does
        if (!e.upgrade) {
          uiEvents.emit({
            type: "toast",
            kind: "progress",
            tone: "gold",
            icon: STRUCTURE_BY_ID[e.structure].emoji,
            title: tr("toast.constructionDone", { name: tr(`structure.${e.structure}`) }),
            body: tr("toast.constructionDoneBody"),
            action: { label: tr("toast.open"), plot: e.plot },
          });
        }
        // a round level (5, 10, 15) is worth fireworks over the building
        else if (e.level % 5 === 0) uiEvents.emit({ type: "fireworks", plot: e.plot, big: e.level >= 15 });
      }
      else if (e.type === "emergency") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🆘", title: tr("toast.emergency"), body: tr("toast.emergencyBody", { money: formatMoney(e.cost) }) });
      else if (e.type === "restructured") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🏦", title: tr("toast.restructured"), body: tr("toast.restructuredBody", { money: formatMoney(e.amount), rep: RESCUE.restructure.rep }) });
      else if (e.type === "suspended") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "⛔", title: tr("toast.suspended"), body: tr("toast.suspendedBody") });
      else if (e.type === "breakdown") {
        const b = next.city.buildings[e.plot];
        if (b) uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🔧", title: tr("floor.brokeToast", { name: tr(`structure.${b.type}` as MessageKey) }), body: tr("floor.brokeToastBody"), action: { label: tr("floor.repair"), plot: e.plot } });
      }
      else if (e.type === "raceFinished") {
        const rec = next.racing.last;
        const rw = rec?.result;
        if (rec && rw) {
          const n = contentFor(next.settings.lang);
          uiEvents.emit({ type: "race", id: rec.id });
          if (rw.position === 0) uiEvents.emit({ type: "fireworks", plot: RACING });
          uiEvents.emit({
            type: "toast",
            kind: "racing",
            tone: rw.position === 0 ? "gold" : rw.position <= 2 ? "success" : "info",
            icon: rw.position === 0 ? "🏆" : rw.position <= 2 ? "🏅" : "🏁",
            title: tr("racing.toast", { pos: rw.position + 1, event: n.raceEvent(rec.event) }),
            body: tr("racing.toastBody", { money: formatMoney(rw.prize + rw.sponsor), rep: rw.rep }),
          });
        }
      }
    }
    const vip = Lv.vipTick(next, now, snap);
    if (vip === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "💎", title: tr("vip.offerToast"), body: tr(`vip.client.${next.vip.offer!.client}` as MessageKey) });
    else if (vip === "failed") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("vip.failed") });
    if (Lv.seasonTick(next, now) && next.season.last && !next.season.last.claimed)
      uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🏆", title: tr("season.over", { rank: next.season.last.rank + 1 }) });
    const restored = Cl.classicsTick(next, now);
    if (restored) uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: "🏛️", title: tr("classics.done", { name: tr(`classic.${restored}` as MessageKey) }), body: tr("classics.doneBody") });
    const eng = Ex.engineersTick(next, now, dt);
    if (eng === "candidate") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "👩‍🔬", title: tr("eng.candidateToast", { name: ENGINEER_BY_ID[next.engineers.candidate!.id].name }) });
    else if (eng === "lost") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "🕵️", title: tr("eng.lostToast") });
    // the season pass: a new season (paying what was left untaken), new weekly challenges
    const pass = Ps.passTick(next, snap, now);
    if (pass.leftover) uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎟️", title: tr("pass.leftoverToast", { n: pass.leftover }) });
    if (pass.season && next.pass.season > 1 && next.lifetime.playTime > 600) uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎟️", title: tr("pass.newSeason", { n: next.pass.season }), action: { label: tr("pass.open"), view: "pass" } });
    if (Wt.winterTick(next, snap, now)) uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎄", title: tr("winter.startToast"), body: tr("winter.startToastBody"), action: { label: tr("winter.open"), view: "winter" } });
    const fest = Fe.festivalTick(next, snap, now);
    if (fest) uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: fest === "spring" ? "🌸" : "☀️", title: tr(`festival.${fest}Start`), body: tr("festival.startBody"), action: { label: tr("winter.open"), view: "festival" } });
    // the bonuses on the Empire Map come and go only while the map is on screen
    const ui = useUi.getState();
    if (!ui.garage && !ui.floor && !ui.race && !ui.visit) Mb.mapBonusTick(next, dt, now);
    // the landmark works: the first car of a territory's line, and its levels
    const lm = Lm.landmarkNews(next);
    for (const f of lm.firstCar) {
      const car = CAR_BY_ID[f.car];
      uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: car.emoji, title: tr("landmark.firstCarToast", { car: names().car(car) }), body: tr("landmark.firstCarBody", { money: formatMoney(f.cash), stars: f.stars }), action: { label: tr("toast.open"), view: "landmarks" } });
      uiEvents.emit({ type: "fireworks", plot: `w:${f.territory}`, big: true });
    }
    for (const u of lm.levelUp) {
      const works = LANDMARK_BY_TERRITORY[u.territory]!.works;
      uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: "🏗️", title: tr("landmark.levelToast", { works: tr(`structure.${works}`), n: u.level }), body: tr("landmark.levelToastBody"), action: { label: tr("toast.open"), view: "landmarks" } });
      uiEvents.emit({ type: "fireworks", plot: `w:${u.territory}` });
    }
    const fo = Ex.fleetOrderTick(next, now);
    if (fo === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "🚌", title: tr("fleet.offerToast") });
    else if (fo === "failed") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("fleet.failed") });
    // now and then a car off the line is a limited edition
    const built = events.find((e) => e.type === "carBuilt");
    const edition = Cn.editionTick(next, built?.type === "carBuilt" ? built.car : null, now);
    if (edition) {
      const car = built?.type === "carBuilt" ? names().car(CAR_BY_ID[built.car]) : "";
      uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: edition.icon, title: tr("edition.toast", { name: tr(`edition.${edition.id}` as MessageKey), car }), body: tr("edition.toastBody", { pct: formatPercent(EDITION.income) }), action: { label: tr("edition.see"), view: "cars" } });
    }
    const story = Sy.storyTick(next, snap);
    if (story === "offer") {
      const { id, plot } = next.story.pending!;
      const b = next.city.buildings[plot];
      const plant = b ? tr(`structure.${b.type}` as MessageKey) : "";
      uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: DILEMMA_BY_ID[id].icon, title: tr("story.offerToast"), body: tr(`story.d.${id}.title` as MessageKey, { plant }), action: { label: tr("story.decide"), view: "story" } });
    } else if (story === "expired") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("story.expired") });
    else if (story === "chapter") uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: RIVAL_CEO.emoji, title: tr("story.chapterToast"), body: tr("story.chapterToastBody"), action: { label: tr("story.open"), view: "story" } });
    const pa = state.proto.active;
    if (pa && state.lastActiveAt < pa.until && now >= pa.until) uiEvents.emit({ type: "toast", kind: "progress", tone: "success", icon: "🧪", title: tr("proto.stageDone") });
    const trend = Mk.trendOf(next);
    if (trend.hot && trend.block !== Mk.trendOf(state).block) {
      uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon: "📰", title: tr("news.toast"), body: tr("news.hot", { cls: tr(`class.${trend.hot}` as MessageKey), price: formatPercent(HOT_CLASS.price), demand: formatPercent(HOT_CLASS.demand - 1) }) });
    }
    commit(next, snap, true);
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

  /** Notifications from the server (lib/push.ts): this phone's token for the player while notifications are on. */
  const syncPush = () => {
    const social = saves?.social;
    if (!social || !pushSupported() || !get().state.settings.notify) return;
    void startPush({
      token: (t) => void social.registerPush(t, "android", get().state.settings.lang, -new Date().getTimezoneOffset()).catch(() => false),
      open: (kind) => {
        // what the note was about, and its screen
        if (kind === "gift") void get().claimGifts();
        if (kind === "invite") {
          void get().claimInviteRewards();
          useUi.getState().setView("profile");
        }
        if (kind === "cup") {
          void get().claimCupPrizes();
          useUi.getState().openBoard("cup");
        }
      },
      shown: (title, body) => uiEvents.emit({ type: "toast", tone: "info", icon: "🔔", title, body }),
    });
  };
  const forgetPush = async () => {
    const t = pushToken();
    if (t) await saves?.social?.forgetPush(t).catch(() => {});
  };

  return {
    ready: false,
    state: initial,
    snap: snapshot(initial),
    view: { state: initial, snap: snapshot(initial) },
    backend: saves?.saveWhere ?? "local",
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
        settleAway(state, now);
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
    restoreCloudBackup: async (id) => {
      // not while two saves wait for the player's choice (nor if one came up meanwhile): that choice comes first
      const choosing = () => saves?.sync?.state.status === "conflict";
      if (!saves || choosing()) return "failed";
      const now = Date.now();
      const state = await saves.restoreCloudBackup(id, get().state, now).catch(() => null);
      if (state === "newer") return "newer";
      if (!state || choosing()) return "failed";
      refreshDaily(state, now);
      lastTick = Date.now();
      commit(state);
      persist(true);
      return "ok";
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
      uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎁", title: tr("gift.received", { n }), body: tr("gift.receivedBody", { money: formatMoney(money) }) });
      return n;
    },
    claimInviteRewards: async () => {
      const social = saves?.social;
      // not while two saves wait for the player's choice: the one paid might be dropped
      if (!social || !get().ready || saves?.sync?.state.status === "conflict") return 0;
      const n = await social.claimInviteRewards().catch(() => 0);
      if (!n) return 0;
      let paid = { stars: 0, money: 0 };
      act((s) => (paid = Iv.inviteRewards(s, n, get().snap)).stars > 0);
      persist(true);
      uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🤝", title: tr("invite.rewarded", { n }), body: tr("invite.rewardedBody", { stars: paid.stars, money: formatMoney(paid.money) }) });
      return n;
    },
    redeemInvite: async (code) => {
      const social = saves?.social;
      if (!social || !get().ready || saves?.sync?.state.status === "conflict") return "network";
      const res = await social.redeemInvite(code).catch(() => "network" as const);
      if (res !== "ok") return res;
      let money = 0;
      act((s) => (money = Iv.inviteWelcome(s, get().snap)) > 0);
      persist(true);
      uiEvents.emit({ type: "toast", tone: "gold", icon: "🎉", title: tr("invite.welcome"), body: tr("invite.welcomeBody", { money: formatMoney(money) }) });
      return "ok";
    },
    cupRun: () => {
      const result = act((s) => Cu.cupRun(s, Date.now()));
      if (!result) return null;
      persist(true);
      if (result.best) void get().sendCup();
      return result;
    },
    sendCup: async () => {
      const social = saves?.social;
      if (!social || !get().ready) return null;
      const send = Cu.cupToSend(get().state, Date.now());
      if (!send) return null;
      const res = await social.cupSubmit(send.week, send.ms, send.car, send.color).catch(() => "network" as const);
      // the board has it, or never will (the week is over, a time it refuses): not sent again; "limit" waits for tomorrow
      if (res === "ok" || res === "closed" || res === "invalid") {
        act((s) => s.cup.week === send.week && (Cu.cupSent(s, send.ms), true));
        persist(true);
      }
      return res;
    },
    claimCupPrizes: async () => {
      const social = saves?.social;
      // not while two saves wait for the player's choice: the one paid might be dropped
      if (!social || !get().ready || saves?.sync?.state.status === "conflict") return 0;
      const places = await social.claimCupPrizes().catch(() => [] as CupPlace[]);
      let paid = 0;
      for (const p of [...places].sort((a, b) => a.week - b.week)) {
        const got = act((s) => Cu.payCupPrize(s, p.week, p.rank, p.entrants, get().snap));
        if (!got) continue;
        paid++;
        uiEvents.emit({
          type: "toast",
          kind: "racing",
          tone: "gold",
          icon: Cu.CUP_ICON[got.prize.tier],
          title: tr("cup.prize", { rank: p.rank, n: p.entrants }),
          body: tr(got.prize.stars ? "cup.prizeBody" : "cup.prizeBodyNoStars", { stars: got.prize.stars, money: formatMoney(got.money), rep: got.prize.rep }),
        });
      }
      if (paid) persist(true);
      return paid;
    },
    forgetPush: async () => {
      await Promise.race([forgetPush(), new Promise((r) => setTimeout(r, 4_000))]);
    },
    giftSent: () => {
      let money = 0;
      act((s) => (money = Gf.giftSent(s, get().snap)) > 0);
      persist(true);
      uiEvents.emit({ type: "toast", tone: "success", icon: "🎁", title: tr("gift.sent"), body: tr("gift.sentBody", { money: formatMoney(money) }) });
    },
    hidePlayer: (id, name) => {
      act((s) => {
        s.settings.hidden = [...s.settings.hidden.filter((h) => h.id !== id), { id, name: name.slice(0, 40) }].slice(-200);
        return true;
      });
      persist(true);
    },
    unhidePlayer: (id) => {
      act((s) => {
        s.settings.hidden = id === null ? [] : s.settings.hidden.filter((h) => h.id !== id);
        return true;
      });
      persist(true);
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
    claimFestivalGoal: (goal) => {
      let money: number | null = null;
      const ok = act((s) => (money = Fe.claimFestivalGoal(s, goal, get().snap, Date.now())) !== null);
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "gold", icon: "⭐", title: tr("winter.goalToast"), body: tr("winter.doorStars", { money: formatMoney(money ?? 0), stars: Fe.FESTIVAL.goalReward.stars ?? 0 }) });
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
      {
        const state = { ...get().state, settings: { ...get().state.settings, lang: guess } };
        set({ state, view: { state, snap: get().snap } });
      }
      // the account and its save first: nothing starts (or gets saved) before they are known
      const start = saves
        ? await saves.start(now, { choose: (local, cloud, reason) => askStartChoice({ local, cloud, reason }), signIn: askWelcome })
        : { state: null, mode: "local" as const };
      useCloud.setState({ mode: start.mode, account: saves?.account ?? null, outdated: !!start.outdated, phase: "save" });
      set({ backend: saves?.saveWhere ?? "local" });
      if (start.outdated) {
        starting = false;
        return;
      }
      // the profile too before the game shows (a slow answer does not hold it up: it follows in the background)
      if (saves?.account) {
        const loading = saves.profile().catch(() => null);
        const profile = await Promise.race([loading, new Promise<null>((r) => setTimeout(() => r(null), 1_500))]);
        if (profile) useCloud.setState({ profile });
        else void loading.then((p) => p && useCloud.setState({ profile: p }));
      }
      let state = start.state;
      if (!state) {
        state = createInitialState(now);
        state.settings.lang = detectLanguage();
      } else {
        settleAway(state, now);
      }
      refreshDaily(state, now);
      // the player's language before the first screen (English if it cannot load)
      await loadLanguage(state.settings.lang).catch(() => {});
      applyLanguage(state.settings.lang);
      lastTick = Date.now();
      lastSave = lastTick;
      {
        const snap = snapshot(state);
        set({ ready: true, state, snap, view: { state, snap } });
      }
      if (!away) loop = setInterval(runTick, TICK_MS);
      // the battery saver: the setting, then the battery (auto turns it on when low)
      setSaverSetting(state.settings.saver);
      startPower();
      onSaverChange((on) => {
        if (!on || get().state.settings.saver !== "auto") return;
        // a moment later: at start the battery is read before the game screen listens for toasts
        setTimeout(() => {
          const b = batteryState();
          if (isSaving() && get().state.settings.saver === "auto" && b) uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon: "🔋", title: tr("saver.autoOn"), body: tr("saver.autoOnBody", { n: Math.round(b.level * 100) }) });
        }, 2000);
      });

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
          void get().claimInviteRewards();
          void get().claimCupPrizes();
          void get().sendCup();
          void get().publishGhost();
        };
        setTimeout(social, SOCIAL_FIRST_MS);
        setInterval(social, SOCIAL_EVERY_MS);
        syncPush();
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
      const ok = act((s) => grantAd(s, reward, Date.now(), plot));
      if (!ok) return false;
      if (reward === "offline") uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: tr("toast.collected", { amount: formatMoney(get().state.cash - cash) }), body: tr("toast.collectedBody") });
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
      const result = act((s) => Iap.grantPurchase(s, p, token, snap));
      if (result !== "granted") return result;
      const body = p === "starter" ? tr("shop.got", { what: [formatMoney(rewardCash(r, snap)), tr("shop.rp", { n: formatNumber(r.rp ?? 0) }), `⭐ ${r.stars}`].join(" · ") }) : tr("iap.adFreeBody");
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
    collectOffline: () => {
      // what reaches the wallet (the shareholders take their part: engine/stock.ts)
      let amount = 0;
      act((s) => {
        if (!s.pendingOffline) return false;
        amount = collectOffline(s);
        return true;
      });
      if (amount > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: tr("toast.collected", { amount: formatMoney(amount) }), body: tr("toast.collectedBody") });
      persist(true);
      // a good moment for the store's rating card (lib/review.ts decides whether it is due)
      if (amount > 0) setTimeout(() => void maybeAskForReview(get().state), 1500);
    },
    buyMaintenance: () => {
      const ok = act((s) => Mt.upgradeMaintenance(s, get().snap));
      if (ok) {
        uiEvents.emit({ type: "toast", tone: "success", icon: "🔧", title: tr("crew.hiredToast", { n: get().state.maintenance.level }) });
        persist(true);
      }
      return ok;
    },
    sellShares: () => {
      const cash = act((s) => St.sellShares(s, get().snap));
      if (cash > 0) {
        uiEvents.emit({ type: "toast", tone: "gold", icon: "📈", title: tr("stock.soldToast", { money: formatMoney(cash) }), body: tr("stock.soldToastBody", { pct: Math.round(get().state.stock.sold * 100) }) });
        persist(true);
      }
      return cash > 0;
    },
    buyBackShares: () => {
      const ok = act((s) => St.buyBack(s, get().snap));
      if (ok) {
        uiEvents.emit({ type: "toast", tone: "success", icon: "🏦", title: tr("stock.boughtToast", { pct: Math.round(get().state.stock.sold * 100) }) });
        persist(true);
      }
      return ok;
    },
    setToastOff: (kind, off) => {
      act((s) => {
        const list = s.settings.toastsOff.filter((k) => k !== kind);
        s.settings.toastsOff = off ? [...list, kind] : list;
        return true;
      });
      persist(true);
    },
    imperium: () => {
      const gained = act((s) => doImperium(s));
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
      if (key === "notify") {
        if (on) syncPush();
        else void forgetPush();
      }
    },
    setSaver: (saver) => {
      act((s) => {
        s.settings.saver = saver;
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
          // the server's notes in the new language
          const t = pushToken();
          if (t && get().state.settings.notify) void saves?.social?.registerPush(t, "android", lang, -new Date().getTimezoneOffset()).catch(() => false);
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
    suspend: () => {
      away = true;
      if (!loop) return;
      clearInterval(loop);
      loop = null;
      persist(true);
      void saves?.flush();
    },
    resume: () => {
      away = false;
      if (loop || !get().ready) return;
      runTick();
      loop = setInterval(runTick, TICK_MS);
    },
    awayNotes: () => {
      const { state, snap } = get();
      return awayEvents(state, snap.gm.offlineCapHours, Date.now()).map((e) => {
        if (e.kind === "offlineFull") return { at: e.at, title: `💰 ${tr("notify.offlineFull")}`, body: tr("notify.offlineFullBody") };
        const name = tr(`structure.${e.structure}`);
        const title = e.upgrade ? `⬆️ ${tr("toast.upgradeDone", { name, level: e.level })}` : `${STRUCTURE_BY_ID[e.structure].emoji} ${tr("toast.constructionDone", { name })}`;
        return { at: e.at, title, body: e.upgrade ? tr("toast.upgradeDoneBody") : tr("toast.constructionDoneBody") };
      });
    },
    resetGame: async () => {
      saves?.clearLocal();
      const old = get().state;
      const state = createInitialState(Date.now());
      // the same player starting over is not a new player: the funnel steps already sent stay sent
      state.funnel = [...old.funnel];
      state.settings.stats = old.settings.stats;
      refreshDaily(state, Date.now());
      const snap = snapshot(state);
      set({ state, snap, view: { state, snap } });
      persist(true);
    },
  };
});

// the battery saver follows the setting, whichever way the state changed (a load, a reset)
useGame.subscribe((s, prev) => {
  if (s.state.settings.saver !== prev.state.settings.saver) setSaverSetting(s.state.settings.saver);
});
