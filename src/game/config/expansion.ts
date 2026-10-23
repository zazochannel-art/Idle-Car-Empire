// Big new content: prototype development, export markets overseas, the
// truck & bus division, and star engineers.
import type { CarClass } from "./cars";
import type { CarId, ComponentId, Effect } from "../types";

// ───────────────────────────── prototypes ─────────────────────────────

export type ProtoFocus = "performance" | "comfort" | "style" | "efficiency";
export const PROTO_FOCUSES: ProtoFocus[] = ["performance", "comfort", "style", "efficiency"];
/** The focus each class's buyers care about most. */
export const FOCUS_FIT: Record<CarClass, ProtoFocus> = {
  economy: "efficiency",
  sport: "performance",
  premium: "comfort",
  luxury: "comfort",
  supercar: "performance",
  hypercar: "style",
};
export const PROTO = {
  /** Costs are × the model's base value; times in real minutes. */
  concept: { cost: 15, minutes: 3, fit: 30, miss: 12 },
  tunnel: [
    { cost: 10, minutes: 4, score: 10 },
    { cost: 25, minutes: 8, score: 18 },
    { cost: 60, minutes: 12, score: 24 },
  ],
  track: { cost: 10, minutes: 5, racing: 15, plain: 6 },
  campaign: [
    { cost: 10, score: 6, hypeMin: 10 },
    { cost: 30, score: 12, hypeMin: 20 },
    { cost: 80, score: 18, hypeMin: 40 },
  ],
  /** ± random points in the wind tunnel. */
  noise: 4,
  /** A score of 100 adds this much to the model's value, for good. */
  maxValue: 0.25,
  /** Customers come this much faster while the launch hype lasts. */
  hypeDemand: 1.8,
};

// ───────────────────────────── export ─────────────────────────────

export type ExportMarketId = "europe" | "northAmerica" | "asia" | "middleEast";
export interface ExportMarket {
  id: ExportMarketId;
  emoji: string;
  /** Price to open the market (agents, homologation). */
  cost: number;
  /** Models the market is hungry for (paid extra), and classes it shrugs at. */
  wants: CarId[];
  /** Import duty on the sale price. */
  duty: number;
  /** Seconds at sea. */
  voyage: number;
}
export const EXPORT_MARKETS: ExportMarket[] = [
  { id: "europe", emoji: "🇪🇺", cost: 2_000_000, wants: ["city", "electric", "sedan"], duty: 0.1, voyage: 240 },
  { id: "northAmerica", emoji: "🇺🇸", cost: 5_000_000, wants: ["suv", "perfSuv", "sports"], duty: 0.12, voyage: 300 },
  { id: "asia", emoji: "🌏", cost: 12_000_000, wants: ["city", "luxury", "electric"], duty: 0.15, voyage: 360 },
  { id: "middleEast", emoji: "🕌", cost: 30_000_000, wants: ["luxury", "supercar", "hypercar"], duty: 0.08, voyage: 420 },
];
export const EXPORT_BY_ID = Object.fromEntries(EXPORT_MARKETS.map((m) => [m.id, m])) as Record<ExportMarketId, ExportMarket>;
export const EXPORT = {
  /** Wanted models sell for this much more; the rest for a little less. */
  wanted: 0.35,
  other: -0.1,
  /** A container ship takes this many cars, or leaves after waiting this long (s). */
  shipCars: 12,
  shipWait: 90,
  /** Per ship: freight and port fees. */
  shipFee: 2_000,
};

// ───────────────────────────── truck & bus division ─────────────────────────────

export type FleetProduct = "van" | "truck" | "bus";
export interface FleetProductConfig {
  id: FleetProduct;
  emoji: string;
  /** Parts bought from the Parts Market for one vehicle. */
  parts: Partial<Record<ComponentId, number>>;
  /** Sale price = parts × this. */
  markup: number;
  /** Seconds per vehicle at level 1. */
  time: number;
}
export const FLEET_PRODUCTS: FleetProductConfig[] = [
  { id: "van", emoji: "🚐", parts: { body: 2, engine: 1, tires: 1 }, markup: 1.3, time: 40 },
  { id: "truck", emoji: "🚚", parts: { body: 3, engine: 2, tires: 2, suspension: 1 }, markup: 1.35, time: 70 },
  { id: "bus", emoji: "🚌", parts: { body: 4, engine: 2, tires: 2, suspension: 1, glass: 2, interior: 2 }, markup: 1.4, time: 110 },
];
export const FLEET_BY_ID = Object.fromEntries(FLEET_PRODUCTS.map((p) => [p.id, p])) as Record<FleetProduct, FleetProductConfig>;
export const FLEET = {
  /** Each plant level makes this much faster. */
  perLevel: 0.25,
  /** Fleet orders: first one after this long, then this long after each. */
  orderEveryMs: 25 * 60_000,
  orderMinutes: [30, 45, 60],
  /** Order size in minutes of the division's output, and its price bonus. */
  orderSizeMin: 15,
  orderBonus: 0.6,
  clients: ["cityTransit", "postal", "construction", "airport", "army"] as const,
};
export type FleetClient = (typeof FLEET.clients)[number];

// ───────────────────────────── star engineers ─────────────────────────────

export type EngineerId = "valentina" | "kenji" | "amara" | "lars" | "sofia" | "diego" | "mei" | "otto";
export interface EngineerConfig {
  id: EngineerId;
  name: string;
  emoji: string;
  effects: Effect[];
  /** Special talents the engine checks by id. */
  special?: "defects" | "prototype";
  /** Salary as a share of steady income (per second, at fair pay). */
  salary: number;
}
export const ENGINEERS: EngineerConfig[] = [
  { id: "valentina", name: "Valentina Russo", emoji: "🌬️", effects: [{ kind: "value", mult: 1.12, minTier: 4 }], salary: 0.03 },
  { id: "kenji", name: "Kenji Watanabe", emoji: "⚙️", effects: [{ kind: "speed", mult: 1.1 }], salary: 0.03 },
  { id: "amara", name: "Amara Okafor", emoji: "🚚", effects: [{ kind: "delivery", mult: 1.15 }, { kind: "dealerCap", mult: 1.05 }], salary: 0.025 },
  { id: "lars", name: "Lars Lindqvist", emoji: "🧮", effects: [{ kind: "costMult", mult: 0.9 }], salary: 0.025 },
  { id: "sofia", name: "Sofia Marin", emoji: "🔬", effects: [{ kind: "rp", mult: 1.4 }], salary: 0.02 },
  { id: "diego", name: "Diego Alvarez", emoji: "🎨", effects: [{ kind: "markup", add: 0.04 }], salary: 0.03 },
  { id: "mei", name: "Mei Chen", emoji: "🛡️", effects: [], special: "defects", salary: 0.02 },
  { id: "otto", name: "Otto Brenner", emoji: "🧪", effects: [], special: "prototype", salary: 0.02 },
];
export const ENGINEER_BY_ID = Object.fromEntries(ENGINEERS.map((e) => [e.id, e])) as Record<EngineerId, EngineerConfig>;
export type PayLevel = "low" | "fair" | "generous";
export const PAY: Record<PayLevel, { mult: number; poach: number }> = {
  low: { mult: 0.6, poach: 0.35 },
  fair: { mult: 1, poach: 0.1 },
  generous: { mult: 1.6, poach: 0 },
};
export const ENGINEER = {
  slots: 3,
  /** Signing fee in seconds of steady income (min). */
  signSeconds: 600,
  signMin: 25_000,
  /** A new candidate every so often; a rival tries to poach every so often. */
  candidateEveryMs: 60 * 60_000,
  candidateStayMs: 30 * 60_000,
  poachEveryMs: 30 * 60_000,
  /** A counter-offer costs this many seconds of steady income, and must come within this long. */
  counterSeconds: 300,
  counterMs: 10 * 60_000,
  /** Mei: fewer defects; Otto: better prototypes. */
  defectMult: 0.4,
  protoBonus: 15,
};
