import type { ContractsState } from "./engine/contracts";
import type { StarUpgradeId } from "./config/imperium";
// Core type definitions shared by the config, the engine and the UI.

export type CarId =
  | "city"
  | "sedan"
  | "suv"
  | "sports"
  | "luxury"
  | "perfSuv"
  | "supercar"
  | "hypercar"
  | "electric";

/** Parts that plants make and the Car Assembly Plant puts together. */
export type ComponentId = "body" | "engine" | "interior" | "suspension" | "glass" | "tires" | "paint" | "electronics" | "battery" | "transmission" | "wheels" | "brakes";
/** What trucks carry: a component, a motorized chassis (body + engine) or a car. */
export type ItemId = ComponentId | "car" | "chassis";

/** Production buildings of the supply chain. */
export type PlantType =
  | "bodyWorks"
  | "engineFactory"
  | "interiorFactory"
  | "suspensionFactory"
  | "transmissionFactory"
  | "wheelFactory"
  | "brakeFactory"
  | "glassFactory"
  | "tireFactory"
  | "paintFactory"
  | "electronicsFactory"
  | "batteryFactory"
  | "assemblyPlant";

export type DealerId = "local" | "city" | "premium" | "luxury" | "supercar" | "global";

export type ManagerId =
  | "mike"
  | "nina"
  | "leo"
  | "sarah"
  | "alex"
  | "daniel"
  | "elena"
  | "hiro"
  | "marco"
  | "priya"
  | "viktor"
  | "lena";

export type ResearchCategory =
  | "engineering"
  | "automation"
  | "electric"
  | "ai"
  | "design"
  | "performance"
  | "green";

/**
 * A single modifier. Research, managers, achievements and empire perks all
 * describe their bonuses with these, so the economy has one place that
 * aggregates them (engine/modifiers.ts).
 */
export type Effect =
  | { kind: "value"; mult: number; minTier?: number; maxTier?: number }
  | { kind: "speed"; mult: number }
  | { kind: "delivery"; mult: number }
  | { kind: "income"; mult: number }
  | { kind: "offline"; add: number }
  | { kind: "offlineCap"; hours: number }
  | { kind: "dealerCap"; mult: number }
  | { kind: "markup"; add: number }
  | { kind: "rp"; mult: number }
  | { kind: "costMult"; mult: number }
  | { kind: "unlockCar"; car: CarId }
  | { kind: "unlockPlant"; plant: PlantType }
  /** A technology built into every car made from now on (config/tech.ts). */
  | { kind: "tech"; tech: import("./config/tech").TechId };

export interface Reward {
  cash?: number;
  /** Cash expressed as N seconds of current income (scales with progress). */
  incomeSeconds?: number;
  rp?: number;
  /** Permanent +x global income (0.02 = +2%), kept through every reset. */
  boost?: number;
  /** ⭐ Stars, the prestige currency spent on permanent upgrades. */
  stars?: number;
}

export interface DealerState {
  owned: boolean;
  level: number;
}

export interface ManagerState {
  hired: boolean;
  level: number;
  /** Plot id of the plant the manager runs. */
  assignedTo: string | null;
}

export type MetricId =
  | "carsProduced"
  | "moneyEarned"
  | "levelsBought"
  | "upgradesBought"
  | "researchDone"
  | "managersHired"
  | "factoriesOwned"
  | "dealersOwned"
  | "maxFactoryLevel"
  | "prestigeCount"
  | "carsUnlocked"
  | "bodiesProduced"
  | "enginesProduced"
  | "componentsProduced"
  | "deliveries"
  | "carsSold"
  | "plantTypes"
  | "carRevenue"
  | "sportUnlocked";

export interface MissionState {
  id: string;
  title: string;
  metric: MetricId;
  target: number;
  /** Metric value when the mission was handed out (daily missions count from here). */
  start: number;
  reward: Reward;
  claimed: boolean;
}

export interface Stats {
  carsProduced: number;
  moneyEarned: number;
  levelsBought: number;
  upgradesBought: number;
  researchDone: number;
  managersHired: number;
  offlineEarned: number;
  playTime: number;
  highestIncome: number;
  carsByType: Record<CarId, number>;
  /** Units made, by component. */
  parts: Record<ComponentId, number>;
  /** Units (components and cars) trucks have delivered. */
  deliveries: number;
  carsSold: number;
  /** Money from cars sold at dealerships. */
  carRevenue: number;
}

export interface OfflineReport {
  /** Revenue and costs while away. */
  ledger?: LedgerValues;
  carsSold?: number;
  materialsUsed?: number;
  seconds: number;
  cappedSeconds: number;
  cars: number;
  /** Components made while away. */
  components?: number;
  deliveries?: number;
  /** Cars serviced by garages while away. */
  serviced?: number;
  money: number;
  rp: number;
  carsByType: Partial<Record<CarId, number>>;
  /** Automatic races run while away. */
  racing?: OfflineRacing;
}

export interface OfflineRacing {
  races: number;
  fees?: number;
  wins: number;
  podiums: number;
  prize: number;
  rep: number;
  repairs: number;
}

export type BuyAmount = 1 | 10 | 100 | "max";

export type Lang = "en" | "ro" | "ru";

// ───────────────────────────── city (Empire Map) ─────────────────────────────

export type ZoneId = "town" | "industrial" | "downtown" | "automotive" | "luxury" | "supercar" | "mega" | "global";

/** Buildings the player can put on an empty plot. */
export type StructureType =
  | "garage"
  | "carWash"
  | "parking"
  | "serviceCenter"
  | "warehouse"
  | "partsFactory"
  | "logistics"
  | "truckDepot"
  | "researchCenter"
  | "exportTerminal"
  | "hq"
  | "airport"
  | "museum"
  | "fleetPlant"
  | PlantType;

/** Things built inside a garage, on its tile grid. */
export type FacilityType =
  | "serviceBay"
  | "carLift"
  | "storage"
  | "office"
  | "partsWorkshop"
  | "paintBooth"
  | "engineWorkshop"
  | "tuningArea"
  | "dyno"
  | "performanceWorkshop"
  | "advancedPaint"
  | "supercarWorkshop"
  | "carbonWorkshop"
  | "advancedTuning"
  | "vipArea";

export type Specialization = "repair" | "painting" | "tuning" | "performance" | "supercar";

export interface PlacedFacility {
  uid: number;
  type: FacilityType;
  /** Top-left tile on the garage grid. */
  x: number;
  y: number;
  /** 1 = rotated 90° (footprint width and depth swapped). */
  rot: 0 | 1;
}

export interface GarageData {
  /** Display number: Garage #01, #02… */
  no: number;
  spec: Specialization;
  workers: number;
  facilities: PlacedFacility[];
  /** Fractional cars serviced, carried between ticks. */
  carry: number;
  serviced: number;
  earned: number;
}

export type Route = "use" | "sell" | "store";

/** Why a plant is not producing right now. */
export type PlantStatus = "ok" | "noRaw" | "full" | "noParts" | "noModel" | "noCash";

/** Units of each raw material (see config/economy.ts). */
export type MaterialStock = Partial<Record<import("./config/economy").MaterialId, number>>;

/** Where the money went: revenue and every kind of cost. */
export type LedgerKey = "carSales" | "partSales" | "services" | "racing" | "materials" | "labor" | "energy" | "maintenance" | "logistics" | "dealerFees" | "tax" | "repairs";
export type LedgerValues = Record<LedgerKey, number>;
export interface Ledger {
  /** Smoothed $/s per category (for the dashboard). */
  rate: LedgerValues;
  /** Totals this run. */
  run: LedgerValues;
  /** Booked since the last tick (folded into `rate` and `run` by the next tick). */
  pending: LedgerValues;
}

export interface PlantData {
  /** Speed upgrade level. */
  speed: number;
  /** Automation tier: 0 Manual … 4 AI Factory. */
  automation: number;
  /** Trucks owned. */
  fleet: number;
  /** Component grade (Standard → Carbon…); the assembly plant ignores it. */
  grade: number;
  /** Where finished goods go: next plant in the chain, the market, or stay. */
  route: Route;
  /** Engine factory before assembly: fit every engine into a car body and sell motorized chassis. */
  combine?: boolean;
  /** Buys this plant's cheapest speed or level upgrade by itself (Automated plants and up). */
  auto?: boolean;
  /** Progress of the current batch, 0..1. */
  progress: number;
  /** Materials in the plant's warehouse. */
  stock: MaterialStock;
  /** What the materials in the warehouse cost (booked as a cost when they are used). */
  stockCost?: number;
  /** Warehouse level (capacity, see WAREHOUSE_CAP). */
  warehouse: number;
  /** ⚡ Power System upgrades (cheaper energy). */
  power: number;
  /** Restock materials automatically (from the Wholesale supplier on). */
  autoBuy?: boolean;
  /** With status noRaw: the material that ran out. */
  short?: import("./config/economy").MaterialId;
  /** Components waiting at an assembly plant. */
  inputs: Partial<Record<ComponentId, number>>;
  /** Finished units waiting for a truck. */
  out: number;
  /** Total value of `out` (cars differ by model). */
  outValue: number;
  /** Assembly plant: model on the line; null = best available. */
  car: CarId | null;
  /** Seconds the loading dock has been waiting for a full load. */
  wait: number;
  made: number;
  status: PlantStatus;
  /** With status noParts: the first missing component. */
  missing?: ComponentId;
  /** Quality against quantity (balanced when unset). */
  mode?: QualityMode;
  /** Assembly: where its cars go (best price when unset). */
  carRoute?: CarRoute;
}

export type QualityMode = "fast" | "balanced" | "premium";
/** "fast" = the dealer that will sell it soonest, or one dealer first. */
export type CarRoute = "price" | "fast" | DealerId | `export:${import("./config/expansion").ExportMarketId}`;

/** Build quality, the company's reputation and product recalls. */
export interface QualityState {
  /** 0–100; 50 is neutral. Moves car prices a little either way. */
  rep: number;
  /** Defective cars sold since the last recall (fractional). */
  defects: number;
  /** A recall waiting for the player's decision. */
  recall: { car: CarId; cars: number } | null;
  /** Market clock (s) until which a scandal cuts car prices. */
  scandalUntil: number;
  /** Recalls handled (paid or ignored). */
  recalls: number;
}

export interface BuildingState {
  type: StructureType;
  level: number;
  /** Present when type === "garage". */
  garage?: GarageData;
  /** Present on supply-chain plants. */
  plant?: PlantData;
}

export type Vehicle = "van" | "truck" | "semi" | "trailer" | "carrier";

/** A truck on the road: every unit moved in the game travels in one. */
export interface Shipment {
  id: number;
  /** Plot ids: plants, "m:market", "s:depot", "d:<dealer>". */
  from: string;
  to: string;
  item: ItemId | "raw";
  qty: number;
  /** Sale value of the load (market and dealers pay this). */
  value: number;
  /** Seconds travelled on the current leg, and the leg's length. */
  t: number;
  dur: number;
  /** Driving back empty. */
  back: boolean;
  vehicle: Vehicle;
  /** Car models on a car transporter, for drawing. */
  models?: CarId[];
  /** A materials delivery from the depot: what it carries. */
  materials?: MaterialStock;
  /** Cars for export: the market their ship sails to. */
  market?: import("./config/expansion").ExportMarketId;
  /** My Cars moved between the factory lot and the paddock (car ids). */
  fleet?: number[];
}

export interface DealerStock {
  cars: number;
  value: number;
  models: CarId[];
  /** Seconds until the next customer walks in. */
  next: number;
  sold: number;
}

export interface ChainState {
  shipments: Shipment[];
  nextShip: number;
  dealers: Partial<Record<DealerId, DealerStock>>;
  /** Smoothed net income per second, for the HUD. */
  rate: number;
  /** The FIRST CAR COMPLETED moment has been shown. */
  firstCar: boolean;
  /** Smoothed cars per second sold wholesale because every dealer was full (no longer happens: cars wait). */
  wholesale: number;
  ledger: Ledger;
  /** Trip fees not yet paid (the trucks left before the cash was there): paid from the next revenue. */
  owed: number;
  /** Net income per second averaged over ~10 minutes: sizes rewards, so a lucky moment doesn't. */
  steady?: number;
  /** Market time (s) of the last supplier rescue. */
  rescueT?: number;
}

export interface CityState {
  zones: ZoneId[];
  /** Keyed by plot id (see game/city/layout.ts). */
  buildings: Record<string, BuildingState>;
  nextUid: number;
  nextGarageNo: number;
  carsServiced: number;
}

/** Logistics Center levels and the transport tier (0 Truck … 3 Export). */
export interface LogisticsState {
  speed: number;
  capacity: number;
  loading: number;
  warehouse: number;
  fleet: number;
  tier: number;
}

/** The player's own model on a platform (Design studio). */
export interface CarDesign {
  name: string;
  engine: number;
  interior: number;
  rims: number;
  paint: number;
  /** Paint colour; "" = the platform's factory colour. */
  color: string;
}

export interface GameState {
  version: number;
  cash: number;
  rp: number;
  empirePoints: number;
  /** Total empire points ever earned — the prestige formula subtracts it. */
  empirePointsEarned: number;
  prestigeCount: number;
  dealers: Record<DealerId, DealerState>;
  managers: Record<ManagerId, ManagerState>;
  carModels: Record<CarId, number>;
  designs: Record<CarId, CarDesign>;
  /** Permanent income boost from milestones (0.06 = +6%). */
  boost: number;
  /** ⭐ Stars: earned from milestones and Reset Imperium, spent on permanent upgrades. */
  stars: number;
  /** Levels of the permanent ⭐ Star upgrades. */
  starUpgrades: Partial<Record<StarUpgradeId, number>>;
  /** Times the empire did a Reset Imperium. */
  imperiumCount: number;
  /** Lifetime earnings at the last Reset Imperium: Empire Points count from here. */
  epBase: number;
  /** Income samples (one a minute, last 4 hours) for the chart and the stall hint. */
  history: { t: number; income: number }[];
  /** Customer contracts: one offer or one running contract at a time. */
  contracts: ContractsState;
  /** Daily login streak (1-7) and whether today's reward was taken. */
  login: { day: string; streak: number; claimed: boolean };
  /** Rival companies the player has overtaken. */
  rivalsBeaten: string[];
  /** Tutorial tips the player has dismissed. */
  tips: string[];
  logistics: LogisticsState;
  /** The materials market: its clock (price drift) and lifetime units bought (supplier tiers). */
  market: { t: number; bought: number };
  /** The running event's objective: counted from `base` since the event that started at `start` (ms). */
  eventGoal: { start: number; base: number; claimed: boolean };
  /** The brand: identity chosen by the player (its attributes are earned, see engine/brand.ts). */
  brand: BrandState;
  /** Showroom sales of the collection and the marketing campaign (market clock). */
  showroom: { campaignUntil: number; campaigns: number; sold: number; revenue: number };
  research: string[];
  achievements: string[];
  missions: {
    dailyDate: string;
    daily: MissionState[];
    milestonesClaimed: string[];
  };
  run: Stats;
  lifetime: Stats;
  city: CityState;
  chain: ChainState;
  racing: RacingState;
  pendingOffline: OfflineReport | null;
  quality: QualityState;
  vip: import("./engine/live").VipState;
  season: import("./engine/live").SeasonState;
  show: import("./engine/live").ShowState;
  classics: import("./engine/classics").ClassicsState;
  proto: import("./engine/expansion").ProtoState;
  export: import("./engine/expansion").ExportState;
  fleet: import("./engine/expansion").FleetState;
  engineers: import("./engine/expansion").EngineersState;
  /** Unlock bonuses already claimed this run ("car:sedan", "plant:engineFactory"). */
  unlocks: string[];
  settings: { buyAmount: BuyAmount; lang: Lang; lowGraphics: boolean; sound: boolean; haptics: boolean };
  createdAt: number;
  runStartedAt: number;
  lastActiveAt: number;
}

/** Things that happened during a tick — consumed by the UI for juice. */
export type GameEvent =
  | { type: "sale"; plot: string; item: ItemId; count: number; amount: number }
  | { type: "carBuilt"; plot: string; car: CarId; first: boolean }
  | { type: "achievement"; id: string }
  | { type: "carUnlocked"; car: CarId }
  | { type: "raceFinished"; race: number };

// ───────────────────────────── racing ─────────────────────────────

/** A car the player built, now at the Racing District. */
export interface RaceCarState {
  id: number;
  car: CarId;
  /** Grade of each of its components when it left the assembly line: the factories' work. */
  grades: Partial<Record<ComponentId, number>>;
  /** Design studio figures when it was built. */
  hp: number;
  quality: number;
  design: number;
  /** What the car was worth (repairs and upgrades are priced from it). */
  value: number;
  /** Racing development levels. */
  upgrades: Partial<Record<import("./config/racing").RaceUpgrade, number>>;
  /** Condition of each wearing part, 0–1. */
  wear: Record<import("./config/racing").WearPart, number>;
  skin: string;
  races: number;
  wins: number;
  /** My Cars: when it left the line (ms), where it is, its record and its last test. */
  built?: number;
  /** At the factory lot, at the paddock, or on a car transporter between them. */
  location?: "factory" | "racing" | "transit" | "showroom";
  /** For sale in a company showroom: the asking price, the dealer, seconds on display. */
  listing?: { price: number; dealer: DealerId; since: number };
  /** The assembly plant whose lot it calls home (plot id). */
  home?: string;
  mileage?: number;
  podiums?: number;
  /** Best lap time ever (s). */
  bestLap?: number;
  /** Last races: event and finishing place (0 = win). */
  history?: { event: string; pos: number }[];
  test?: import("./engine/car-dna").TestReport;
  /** R&D technologies in it when it was built (config/tech.ts). */
  tech?: import("./config/tech").TechId[];
  /** Racing Garage: a development level being fitted (seconds left of total). */
  install?: { u: import("./config/racing").RaceUpgrade; left: number; total: number };
}

export interface RaceEntrant {
  /** "player" or "<team>:<n>". */
  id: string;
  team: string | null;
  driver: string;
  model: CarId;
  color: string;
  accent: string;
  rating: number;
  /** Starting slot (0 = pole). */
  grid: number;
  /** Shown lap times (seconds). */
  laps: number[];
  /** Shown race time, the start delay included (seconds). */
  total: number;
}

export interface RaceRecord {
  id: number;
  event: string;
  /** A special event's id when this race was one. */
  special?: string;
  track: import("./config/racing").TrackId;
  type: import("./config/racing").RaceType;
  laps: number;
  /** Racing clock when the countdown starts. */
  startT: number;
  car: number;
  entrants: RaceEntrant[];
  /** Entrant ids in finishing order. */
  order: string[];
  /** Championship round (0-based) when it is one. */
  round?: number;
  /** Raced in the rain. */
  wet?: boolean;
  /** Entry fee paid for it. */
  fee?: number;
  /** Filled in when the race is settled. */
  result?: RaceReward;
}

export interface RaceReward {
  position: number;
  /** Entry fee paid. */
  fee: number;
  prize: number;
  sponsor: number;
  rep: number;
  parts: number;
  trophy?: import("./config/racing").Trophy;
  skin?: string;
  /** Championship: points this race, and the title result after the final. */
  points?: number;
  title?: { position: number; prize: number; rep: number; trophy?: import("./config/racing").Trophy };
}

export interface ChampionshipState {
  event: string;
  round: number;
  points: Record<string, number>;
  /** Entrants of the series (the same field every round). */
  names: Record<string, { driver: string; team: string | null }>;
}

export interface RacingState {
  unlocked: boolean;
  /** Seconds of racing time (live races and automatic racing run on it). */
  clock: number;
  garage: number;
  cars: RaceCarState[];
  nextCar: number;
  /** Models asked from the assembly plants (one car each), and cars delivered but not yet unloaded. */
  orders: CarId[];
  arrivals: CarId[];
  selected: number | null;
  rep: number;
  trophies: Record<import("./config/racing").Trophy, number>;
  /** 🔧 Racing parts won at races. */
  parts: number;
  skins: string[];
  sponsor: string | null;
  /** The sponsor's contract: progress counted from `base`, due by `until` (racing clock); `met` rounds done. */
  contract: { base: number; until: number; met: number } | null;
  /** Sponsors that already paid their signing fee (once each). */
  signed: string[];
  live: RaceRecord | null;
  last: RaceRecord | null;
  championship: ChampionshipState | null;
  /** Wins per event (rivals grow stronger with them). */
  wins: Record<string, number>;
  /** Racing clock when each event takes entries again. */
  cooldowns: Record<string, number>;
  auto: { on: boolean; next: number; repair: boolean };
  stats: { races: number; wins: number; podiums: number; prize: number; repairs: number; fees?: number; titles: number; best: Record<string, number> };
  nextRace: number;
}

export interface BrandState {
  name: string;
  logo: string;
  color: string;
  accent: string;
  style: import("./config/brand").BrandStyle;
  renames: number;
}
