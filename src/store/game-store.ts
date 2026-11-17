"use client";
import type { RaceUpgrade } from "@/game/config/racing";
import type { StarUpgradeId } from "@/game/config/imperium";
import { create } from "zustand";
import { ACHIEVEMENT_BY_ID } from "@/game/config/achievements";
import { type DesignOption } from "@/game/config/cars";
import * as Ch from "@/game/engine/chain";
import * as Mat from "@/game/engine/materials";
import { type MaterialId } from "@/game/config/economy";
import * as Qc from "@/game/engine/quality-check";
import type { LogisticsUpgrade } from "@/game/config/logistics";
import { awayEvents } from "@/game/engine/away";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { snapshot, unlockedCarIds, type EconomySnapshot } from "@/game/engine/economy";
import { OFFLINE } from "@/game/config/offline";
import { settleOffline } from "@/game/engine/offline";
import { checkAchievements, refreshDaily } from "@/game/engine/progress";
import { cloneState, createInitialState } from "@/game/engine/state";
import { sessionTick } from "@/game/engine/session";
import { showNews } from "./news";
import { formatMoney, formatNumber } from "@/game/format";
import { decodeSave, encodeSave, SaveManager, type CupPlace, type CupSubmitResult, type RedeemInviteResult, type SaveWhere } from "@/game/save";
import { askStartChoice, askWelcome, useCloud } from "./cloud-store";
import type { BuyAmount, CarId, CarRoute, CityId, DealerId, FacilityType, GameState, Lang, ManagerId, NoticeKind, PlantType, QualityMode, Specialization, StructureType, ZoneId } from "@/game/types";
import { applyLanguage, detectLanguage, loadLanguage, translate, type MessageKey, type Vars, setPlaceNames } from "@/i18n";
import { contentFor } from "@/i18n/content";
import { businessActions } from "./actions/business";
import { carsActions } from "./actions/cars";
import { cityActions } from "./actions/city";
import { companyActions } from "./actions/company";
import { factoryActions } from "./actions/factory";
import { uiEvents } from "./events";
import type { AwayNote } from "@/lib/notify";
import { isNativeApp } from "@/lib/platform";
import { pushSupported, pushToken, startPush } from "@/lib/push";
import { useUi } from "./ui-store";
import { type SkinId } from "@/game/config/collection";
import * as Br from "@/game/engine/brand";
import { type EngineerId, type ExportMarketId, type FleetProduct, type PayLevel, type ProtoFocus } from "@/game/config/expansion";
import { openPlantTypes } from "@/game/engine/unlocks";
import { hasPlant as hasPlantType } from "@/game/engine/chain";
import * as Tu from "@/game/engine/tuning";
import * as Gf from "@/game/engine/gifts";
import * as Iv from "@/game/engine/invites";
import * as Tm from "@/game/engine/team";
import * as Cu from "@/game/engine/cup";
import * as Gh from "@/game/engine/ghost";
import { allianceReward } from "@/game/engine/alliance";
import type { AdReward } from "@/game/config/ads";
import * as Ap from "@/game/engine/autopilot";
import { type ShopItemId } from "@/game/config/shop";
import * as Iap from "@/game/engine/iap";
import { type IapProduct } from "@/game/config/iap";
import * as Wt from "@/game/engine/winter";
import * as Fe from "@/game/engine/festival";
import * as Ps from "@/game/engine/pass";
import { setWorld } from "@/game/city/layout";
import { HOME_CITY } from "@/game/config/cities";
import * as Cy from "@/game/engine/cities";
import { funnelDue, funnelMinutes } from "@/game/engine/funnel";
import { browserOptOut, sendStep } from "@/game/save/funnel";
import { PASS, type WeeklyId } from "@/game/config/pass";
import { batteryState, isIdle, isSaving, minTickMs, onSaverChange, setSaverSetting, startPower, type SaverSetting } from "@/lib/power";
import { claimTab } from "@/lib/tabs";
import { redeemFromInstall } from "@/lib/install-referrer";
import { claimNewYear } from "@/game/engine/new-year";

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
  setWorld(s.activeCity);
  const away = (now - s.lastActiveAt) / 1000;
  const cash = s.cash;
  if (settleOffline(s, now) || away < OFFLINE.minToastSeconds || s.cash <= cash) return;
  uiEvents.emit({ type: "toast", tone: "gold", icon: "🏭", title: translate(s.settings.lang, "offline.short", { money: formatMoney(s.cash - cash) }) });
}

/** Gifts from other players and the player's ghost: first this long after the start, then this often. */
const SOCIAL_FIRST_MS = 8_000;
const SOCIAL_EVERY_MS = 10 * 60_000;

export interface GameStore {
  ready: boolean;
  /** The game was opened again in another tab or window (lib/tabs.ts): this copy has stopped for good. */
  elsewhere: boolean;
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
  /** Carries out what the game's team sent this player from the dashboard (engine/team.ts): how many commands. */
  claimTeamCommands: () => Promise<number>;
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
  /** Takes a reached tier of the premium track (bought for the season). */
  claimPassPremium: (tier: number) => boolean;
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
  developNordic: (id: CarId) => boolean;
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
  /** Opens today's chest (all daily missions taken). */
  claimDailyChest: () => void;
  claimMilestone: (id: string) => void;
  dismissTip: (id: string) => void;
  claimLogin: () => void;
  acceptContract: () => void;
  /** Racing sponsors (engine/sponsors.ts): sign an offer, turn them down, take a deal's pay. */
  signDeal: (i: number) => void;
  declineDeals: () => void;
  claimDeal: () => void;
  /** The used-car lot (engine/used-cars.ts): buy a car, refurbish it, sell it. */
  buyUsedCar: (id: number) => void;
  /** Buys a look in the shop's Style section with Stars (engine/cosmetics.ts). */
  buyCosmetic: (id: import("@/game/engine/cosmetics").CosmeticId) => void;
  /** Buys the next level of the eco programme (engine/eco.ts). */
  buyEco: () => void;
  /** Buys the next tenth of a rival's shares (engine/takeover.ts). */
  buyRivalShares: (id: import("@/game/engine/takeover").RivalId) => void;
  /** Sends a model to the crash lab (engine/safety.ts). */
  startCrashTest: (car: CarId) => void;
  /** Answers the staff's card: yes (pay its cost) or no (engine/staff.ts). */
  answerStaff: (yes: boolean) => void;
  /** Buys the next level of a material's own source (engine/sources.ts). */
  buySource: (m: import("@/game/config/economy").MaterialId) => void;
  refurbishUsedCar: () => void;
  sellUsedCar: () => void;
  /** Ends a quality inspection (engine/quality-check.ts) with the cars tapped; returns the score. */
  startQc: () => (Qc.DefectKind | null)[] | null;
  finishQc: (round: (Qc.DefectKind | null)[], tapped: number[]) => number | null;
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
  /** The standing orders for recalls, VIP and fleet orders, cashing in (engine/autopilot.ts). */
  setAutoRecall: (policy: Ap.RecallPolicy) => void;
  setAutoDecide: (key: "autoVip" | "autoFleet" | "autoCollect", on: boolean) => void;
  /** The "what's new" card put away. */
  seenWhatsNew: (id: string) => void;
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
  /** Move the company to another of its cities, or open a new one (engine/cities.ts). */
  switchCity: (id: CityId) => boolean;
  sendTradeConvoy: () => number;
  unlockCity: (id: CityId) => boolean;
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
/** A newer copy of the game took over (lib/tabs.ts): this one never ticks or saves again. */
let replaced = false;
/** The timers that collect gifts and the like from the server: stopped with the rest. */
const socialTimers: ReturnType<typeof setTimeout>[] = [];
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

/** What the action groups in store/actions/ share with the store: its state and its helpers. */
export interface StoreCtx {
  get: () => GameStore;
  set: (partial: Partial<GameStore>) => void;
  /** Runs an action on a copy of the state and publishes it when the action returns something truthy. */
  act: <T>(fn: (s: GameState) => T) => T;
  commit: (next: GameState, prevSnap?: EconomySnapshot, fromTick?: boolean) => void;
  persist: (force?: boolean) => void;
  tr: (key: MessageKey, vars?: Vars) => string;
  names: () => ReturnType<typeof contentFor>;
  inFirstCity: <T>(fn: (s: GameState) => T) => (s: GameState) => T;
}

export const useGame = create<GameStore>((set, get) => {
  const tr = (key: MessageKey, vars?: Vars) => translate(get().state.settings.lang, key, vars);
  const names = () => contentFor(get().state.settings.lang);

  /** Recomputes derived data, unlocks achievements and publishes the new state. */
  function commit(next: GameState, prevSnap?: EconomySnapshot, fromTick = false) {
    // the engine reads the map of the city being played; its districts' names follow
    setWorld(next.activeCity);
    setPlaceNames(next.activeCity);
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
    // unlock moments (not across a new run or a move to another city: everything "unlocks"
    // again then); what was open before is usually what the last commit found, so each tick
    // works it out once
    if (prevSnap && prev.runStartedAt === next.runStartedAt && prev.activeCity === next.activeCity) {
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
    if (!saves || replaced) return;
    const s = get().state;
    lastSave = Date.now();
    saves.save({ ...s, lastActiveAt: Date.now() }, force);
  }

  /**
   * The game was opened again in another tab or window (lib/tabs.ts): this copy saves once (not
   * before its save has loaded: it would save a new company over it; nor when it heard `late`: the
   * newer copy has read the save already), then stops for good, with no ticks, no saves and nothing
   * more for the cloud, so the two never write over each other. Not ready any more, nothing here
   * claims gifts or purchases it could no longer keep; the screen says the game is open elsewhere,
   * with "Play here" (a reload makes this copy the newest).
   */
  async function stepDown(late: boolean) {
    if (get().ready && !late) persist(true);
    replaced = true;
    if (loop) clearInterval(loop);
    loop = null;
    for (const t of socialTimers) clearTimeout(t);
    set({ ready: false, elsewhere: true });
    if (!late) await saves?.flush();
    // (a cloud save that failed is not retried from here: the newer copy sends this one's last state);
    // one already on its way lands first, even when the hello came late: the newer copy reads the
    // cloud only after this, and a save landing after that read would have its first one refused
    await saves?.sync?.stop();
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
      // The page was frozen: settle it like a normal absence, as long as the server's clock
      // agrees (saves.trustedSince): moving the phone's clock forward and back earns nothing.
      const from = now - dt * 1000;
      if (!saves?.account) {
        next.lastActiveAt = from;
        settleAway(next, now);
        commit(next);
        return;
      }
      // meanwhile the game goes on from now; the break is paid once the server answered
      next.lastActiveAt = now;
      commit(next);
      void saves.trustedSince(from, now).then((since) => {
        const later = cloneState(get().state);
        // only the break itself: the game played on since `now` and that time is counted already
        const at = later.lastActiveAt;
        later.lastActiveAt = since;
        settleAway(later, now);
        later.lastActiveAt = Math.max(at, later.lastActiveAt);
        commit(later);
        persist();
      });
      return;
    }

    // the game's step (engine/session.ts); the bonuses on the Empire Map come and go only while it is on screen
    const ui = useUi.getState();
    const step = sessionTick(next, state, dt, now, snap, { mapOnScreen: !ui.garage && !ui.floor && !ui.race && !ui.visit, autoMoney });
    autoMoney = step.autoMoney;
    showNews(step.news, next);
    // New Year's night: the gift for a player in the game round midnight, once a year
    const ny = claimNewYear(next, now, snap);
    if (ny) {
      uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎆", title: tr("newYear.toast", { year: ny.year }), body: tr("newYear.body", { stars: ny.stars, money: formatMoney(ny.money) }) });
      uiEvents.emit({ type: "fireworks", big: true });
      lastSave = 0;
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

  /** The racing team is in the first city: what it pays and earns goes through that city (engine/cities.ts). */
  const inFirstCity =
    <T,>(fn: (s: GameState) => T) =>
    (s: GameState): T =>
      Cy.withCity(s, HOME_CITY, () => fn(s));

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

  const ctx: StoreCtx = { get, set, act, commit, persist, tr, names, inFirstCity };

  return {
    ready: false,
    elsewhere: false,
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
      // the cloud's save is from a newer version of the game: the update screen, nothing saved here
      if (state === "outdated") {
        useCloud.setState({ outdated: true });
        return;
      }
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
      // the board holds a time to the car that drove it (its ghost: supabase/migrations/0027), so the ghost goes first
      await get().publishGhost();
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
    claimTeamCommands: async () => {
      const social = saves?.social;
      // not while two saves wait for the player's choice: what the team sent might be dropped
      if (!social || !get().ready || saves?.sync?.state.status === "conflict") return 0;
      const list = await social.claimCommands().catch(() => [] as Tm.TeamCommand[]);
      const say = (icon: string, title: string, note: string) =>
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon, title, body: note || undefined });
      for (const c of list) {
        if (c.kind === "restore") {
          const res = await get().restoreCloudBackup(c.backup);
          const date = c.madeAt ? new Date(c.madeAt).toLocaleString(get().state.settings.lang, { dateStyle: "medium", timeStyle: "short" }) : "";
          say("♻️", res === "ok" ? tr("team.restored", { date }) : tr("team.restoreFailed"), c.note);
          continue;
        }
        if (!act((s) => Tm.applyTeamCommand(s, c))) continue;
        if (c.kind === "cash") {
          const money = formatMoney(Math.abs(c.amount));
          say("💰", tr(c.mode === "set" ? "team.cashSet" : c.amount > 0 ? "team.cashAdded" : "team.cashTaken", { money }), c.note);
        } else if (c.kind === "stars") {
          const n = formatNumber(Math.abs(c.amount));
          say("⭐", tr(c.mode === "set" ? "team.starsSet" : c.amount > 0 ? "team.starsAdded" : "team.starsTaken", { n }), c.note);
        } else if (c.kind === "rep") {
          const n = formatNumber(Math.round(Math.abs(c.amount)));
          const key = c.which === "company" ? (c.mode === "set" ? "team.repSet" : c.amount > 0 ? "team.repAdded" : "team.repTaken") : c.mode === "set" ? "team.racingRepSet" : c.amount > 0 ? "team.racingRepAdded" : "team.racingRepTaken";
          say(c.which === "company" ? "🏅" : "🏁", tr(key, { n }), c.note);
        } else if (c.kind === "company") {
          say("🏷️", tr("team.company", { name: c.name }), c.note);
        } else {
          say("📨", tr("team.message"), c.note);
        }
      }
      if (list.length) persist(true);
      return list.length;
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
    claimPassPremium: (tier) => {
      let money: number | null = null;
      const ok = act((s) => (money = Ps.claimPremiumTier(s, tier, get().snap, Date.now())) !== null);
      if (ok) {
        persist(true);
        uiEvents.emit({ type: "toast", tone: "gold", icon: "👑", title: tr("pass.premiumToast", { n: tier }), body: tr("pass.tierBody", { money: formatMoney(money ?? 0) }) });
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
      if (get().ready || loop || starting || replaced) return;
      starting = true;
      // one copy of the game at a time (lib/tabs.ts): this one being the newest, a copy still open in
      // another tab or window saves its last state and stops, and this one starts from that save
      const tab = saves ? claimTab({ onReplaced: stepDown }) : null;
      // the loading and sign-in screens in the player's language
      const guess = detectLanguage();
      await loadLanguage(guess).catch(() => {});
      {
        const state = { ...get().state, settings: { ...get().state.settings, lang: guess } };
        set({ state, view: { state, snap: get().snap } });
      }
      await tab?.ready;
      if (replaced) return;
      // in the app: a save the WebView lost comes back from the app's own copy (lib/save-mirror.ts)
      if (saves && isNativeApp()) {
        const mirror = import("@/lib/save-mirror").then(async (m) => {
          await m.restoreSaveMirror();
          m.startSaveMirror();
        });
        await Promise.race([mirror.catch(() => {}), new Promise((r) => setTimeout(r, 1_500))]);
      }
      const now = Date.now();
      // the account and its save first: nothing starts (or gets saved) before they are known
      const start = saves
        ? await saves.start(now, { choose: (local, cloud, reason) => askStartChoice({ local, cloud, reason }), signIn: askWelcome })
        : { state: null, mode: "local" as const };
      if (replaced) {
        // opened again elsewhere meanwhile: what the start was about to send to the cloud stays unsent
        saves?.sync?.stop();
        return;
      }
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
      setWorld(state.activeCity);
      refreshDaily(state, now);
      // the player's language before the first screen (English if it cannot load)
      await loadLanguage(state.settings.lang).catch(() => {});
      applyLanguage(state.settings.lang);
      if (replaced) return;
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
          void get().claimTeamCommands();
          void get().sendCup();
          void get().publishGhost();
        };
        socialTimers.push(setTimeout(social, SOCIAL_FIRST_MS), setInterval(social, SOCIAL_EVERY_MS));
        // a friend's code from the store link this install came from (once per phone)
        socialTimers.push(setTimeout(() => void redeemFromInstall((code) => get().redeemInvite(code)), SOCIAL_FIRST_MS));
        syncPush();
      }
    },

    ...factoryActions(ctx),
    ...carsActions(ctx),
    ...cityActions(ctx),
    ...businessActions(ctx),
    ...companyActions(ctx),
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
      // (a copy replaced by a newer one stays stopped: lib/tabs.ts)
      if (loop || !get().ready || replaced) return;
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
      // the purchases belong to the player's account, not to the company: kept, so the store handing the
      // starter pack back at the next return to the app finds it given already (it was paid out again each time)
      state.iap = { owned: [...old.iap.owned], tokens: [...old.iap.tokens] };
      refreshDaily(state, Date.now());
      setWorld(state.activeCity);
      const snap = snapshot(state);
      set({ state, snap, view: { state, snap } });
      persist(true);
    },
  };
});

// the engine reads the map of the city being played (and its names), whichever way the state changed
useGame.subscribe((s) => {
  setWorld(s.state.activeCity);
  setPlaceNames(s.state.activeCity);
});

// the battery saver follows the setting, whichever way the state changed (a load, a reset)
useGame.subscribe((s, prev) => {
  if (s.state.settings.saver !== prev.state.settings.saver) setSaverSetting(s.state.settings.saver);
});
