// The Racing District: cars built in the player's plants race for prize
// money, reputation and trophies. Every number that shapes racing lives
// here — how a car's parts turn into performance, the events and their
// prizes, the rival teams, development upgrades, the garage, reputation and
// sponsors — so balancing never touches the engine or the UI.
import type { CarId, ComponentId } from "../types";

// ───────────────────────────── the district ─────────────────────────────

/** Building the Racing District (needs a first car and the Industrial District, whose road leads there). */
export const RACING_DISTRICT = { cost: 40_000 };

/** Racing time runs this many times faster than the clock shown in results (a 20 s lap reads as ~1:00). */
export const RACE_TIME_SCALE = 3;
/** Seconds of "3, 2, 1, GO!" before the lights go out. */
export const RACE_COUNTDOWN = 3;
/** Seconds between grid slots at the start (a rolling, staggered start). */
export const GRID_GAP = 0.35;

// ───────────────────────────── classes ─────────────────────────────

export type RaceClass = "D" | "C" | "B" | "A" | "S";
export const RACE_CLASSES: RaceClass[] = ["D", "C", "B", "A", "S"];

/** Which class each platform races in: a City Car never meets a Hypercar in a standard race. */
export const RACE_CLASS_OF: Record<CarId, RaceClass> = {
  city: "D",
  sedan: "D",
  suv: "C",
  luxury: "C",
  sports: "B",
  perfSuv: "B",
  supercar: "A",
  hypercar: "S",
  electric: "S",
};

// ───────────────────────────── performance ─────────────────────────────

/** Kerb weight of each platform at body grade 1 (kg). */
export const BASE_WEIGHT: Record<CarId, number> = {
  city: 1_050,
  sedan: 1_350,
  suv: 1_800,
  sports: 1_380,
  luxury: 1_850,
  perfSuv: 1_700,
  supercar: 1_450,
  hypercar: 1_320,
  electric: 1_900,
};

/** Base handling and aerodynamics of each body shape. */
export const BODY_DYNAMICS: Record<CarId, { handling: number; aero: number }> = {
  city: { handling: 46, aero: 28 },
  sedan: { handling: 44, aero: 34 },
  suv: { handling: 34, aero: 22 },
  sports: { handling: 58, aero: 50 },
  luxury: { handling: 46, aero: 44 },
  perfSuv: { handling: 50, aero: 40 },
  supercar: { handling: 64, aero: 64 },
  hypercar: { handling: 70, aero: 74 },
  electric: { handling: 62, aero: 66 },
};

/** Engine output by the grade the Engine Factory makes (Economy, Turbo, V6, V8, V12). */
export const ENGINE_GRADE_POWER = [1, 1.3, 1.65, 2.05, 2.5];
/** Each body grade (Lightweight, Performance…, Carbon) takes this share of weight off. */
export const BODY_GRADE_WEIGHT = 0.05;
/** Handling and braking per grade of tyres and suspension. */
export const TIRE_GRADE_GRIP = 4;
export const SUSPENSION_GRADE_GRIP = 3.5;

/**
 * Turning raw numbers into 0–100 stats:
 *  speed   = 100 · (1 − e^(−hp·aero / speedHp))
 *  accel   = 100 · (1 − e^(−hp per tonne / accelPtw))
 */
export const STAT_CURVE = { speedHp: 360, accelPtw: 280, weightRef: 1_300, handlingPerKg: 1 / 70, brakingPerKg: 1 / 90 };

/** A worn car is slower: stats × (wearFloor + (1 − wearFloor) × condition). */
export const WEAR_FLOOR = 0.8;

export type RaceStat = "speed" | "accel" | "handling" | "braking" | "aero" | "reliability";
export const RACE_STATS: RaceStat[] = ["speed", "accel", "handling", "braking", "aero", "reliability"];

// ───────────────────────────── race types ─────────────────────────────

export type RaceType = "circuit" | "sprint" | "street" | "endurance" | "timeTrial" | "drag" | "hillClimb" | "grandPrix" | "championship";

/** What each kind of race rewards: weights of each stat in the race rating. */
export const RACE_WEIGHTS: Record<RaceType, Partial<Record<RaceStat, number>>> = {
  circuit: { speed: 0.25, accel: 0.2, handling: 0.3, braking: 0.15, aero: 0.1 },
  sprint: { speed: 0.3, accel: 0.3, handling: 0.25, braking: 0.15 },
  street: { accel: 0.3, handling: 0.35, braking: 0.25, speed: 0.1 },
  endurance: { reliability: 0.3, speed: 0.25, handling: 0.2, aero: 0.15, braking: 0.1 },
  timeTrial: { speed: 0.3, handling: 0.3, aero: 0.2, braking: 0.2 },
  drag: { accel: 0.6, speed: 0.4 },
  hillClimb: { accel: 0.35, handling: 0.35, braking: 0.2, speed: 0.1 },
  grandPrix: { speed: 0.3, aero: 0.2, handling: 0.25, braking: 0.15, accel: 0.1 },
  championship: { speed: 0.25, accel: 0.2, handling: 0.3, braking: 0.15, aero: 0.1 },
};

/** Lap-to-lap spread (share of lap time) and the per-race "form" of a driver. */
export const RACE_NOISE = { lap: 0.006, form: 0.012 };
/** Rating → lap time: lap = ref × (refRating + soften) / (rating + soften). */
export const RATING_SOFTEN = 30;
/** Chance per race of a mistake (spin, missed braking point) at reliability 0; scaled by 1 − reliability. */
export const INCIDENT = { chance: 0.25, minLoss: 1.5, maxLoss: 5 };

// ───────────────────────────── tracks ─────────────────────────────

export type TrackId = "small" | "industrial" | "mountain" | "coastal" | "desert" | "nightCity" | "grandPrix" | "international";
export type TrackTheme = "home" | "industrial" | "mountain" | "coastal" | "desert" | "night" | "gp" | "international";

export interface TrackConfig {
  id: TrackId;
  emoji: string;
  theme: TrackTheme;
  /** Reputation needed to race here. */
  minRep: number;
  /** Laps of a standard race here. */
  laps: number;
  /** Shown lap time of a reference car (seconds). */
  refLap: number;
}

export const TRACKS: TrackConfig[] = [
  { id: "small", emoji: "🏁", theme: "home", minRep: 0, laps: 3, refLap: 62 },
  { id: "industrial", emoji: "🏭", theme: "industrial", minRep: 60, laps: 3, refLap: 70 },
  { id: "mountain", emoji: "⛰️", theme: "mountain", minRep: 350, laps: 3, refLap: 84 },
  { id: "coastal", emoji: "🌊", theme: "coastal", minRep: 600, laps: 3, refLap: 78 },
  { id: "desert", emoji: "🏜️", theme: "desert", minRep: 1_500, laps: 4, refLap: 90 },
  { id: "nightCity", emoji: "🌃", theme: "night", minRep: 2_500, laps: 4, refLap: 74 },
  { id: "grandPrix", emoji: "🏆", theme: "gp", minRep: 4_000, laps: 5, refLap: 96 },
  { id: "international", emoji: "🌍", theme: "international", minRep: 9_000, laps: 5, refLap: 102 },
];
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, TrackConfig>;

// ───────────────────────────── rivals ─────────────────────────────

export interface RivalTeam {
  id: string;
  name: string;
  logo: string;
  /** Livery: body and accent colour. */
  color: string;
  accent: string;
  drivers: string[];
  /** Strength around the event's reference car (1 = a stock car of the right class). */
  skill: number;
}

export const RIVAL_TEAMS: RivalTeam[] = [
  { id: "rapid", name: "Rapid Motors", logo: "⚡", color: "#2563eb", accent: "#facc15", drivers: ["Leo Brandt", "Mia Costa"], skill: 0.93 },
  { id: "nova", name: "Nova Performance", logo: "✴️", color: "#7c3aed", accent: "#f0abfc", drivers: ["Ivan Petrov", "Sara Lind"], skill: 0.96 },
  { id: "blackline", name: "Blackline Racing", logo: "🖤", color: "#111827", accent: "#ef4444", drivers: ["Max Weber", "Nora Hale"], skill: 0.99 },
  { id: "apex", name: "Apex Motorsport", logo: "🔺", color: "#ea580c", accent: "#f8fafc", drivers: ["Luca Rossi", "Ana Duarte"], skill: 1.02 },
  { id: "vortex", name: "Vortex Racing", logo: "🌀", color: "#0891b2", accent: "#a5f3fc", drivers: ["Tom Becker", "Yuki Sato"], skill: 1.04 },
  { id: "royal", name: "Royal Automotive", logo: "👑", color: "#b91c1c", accent: "#fde047", drivers: ["Henry Ashford", "Elena Voss"], skill: 1.07 },
];
export const RIVAL_BY_ID = Object.fromEntries(RIVAL_TEAMS.map((r) => [r.id, r])) as Record<string, RivalTeam>;
/** Each win in an event makes its rivals this much stronger (up to `max` wins): they learn and spend. */
export const RIVAL_GROWTH = { perWin: 0.012, max: 12 };

// ───────────────────────────── events ─────────────────────────────

export type Trophy = "bronze" | "silver" | "gold";

export interface RaceEventConfig {
  id: string;
  emoji: string;
  type: RaceType;
  /** Tracks: one for a single race, one per round for a championship. */
  tracks: TrackId[];
  classes: RaceClass[];
  /** Cars on the grid, the player included. */
  field: number;
  /** Laps per race (overrides the track's). */
  laps?: number;
  /** Reputation needed to enter. */
  minRep: number;
  /** Prize for 1st (shares below for the other places). */
  prize: number;
  /** Reputation for 1st. */
  rep: number;
  /** Trophy for the win (a championship: for the title). */
  trophy?: Trophy;
  /** A stock car of this platform at this component grade, with upgrades at this level, is what the rivals are tuned against. */
  ref: { car: CarId; grade: number; upgrades: number };
  /** Racing parts (🔧) for a podium. */
  parts?: number;
  /** Livery unlocked by the first win. */
  skin?: string;
}

/** Prize and reputation shares by finishing position. */
export const PRIZE_SHARE = [1, 0.6, 0.4, 0.2, 0.12, 0.08, 0.05, 0.03];
export const REP_SHARE = [1, 0.6, 0.4, 0.1, 0.05, 0, 0, 0];

export const RACE_EVENTS: RaceEventConfig[] = [
  { id: "amateurCup", emoji: "🏁", type: "circuit", tracks: ["small"], classes: ["D"], field: 4, laps: 3, minRep: 0, prize: 5_000, rep: 25, trophy: "bronze", ref: { car: "city", grade: 1, upgrades: 0 }, parts: 1, skin: "checker" },
  { id: "citySprint", emoji: "💨", type: "sprint", tracks: ["industrial"], classes: ["D"], field: 5, laps: 2, minRep: 60, prize: 20_000, rep: 35, trophy: "bronze", ref: { car: "city", grade: 1, upgrades: 1 }, parts: 1 },
  { id: "dragDay", emoji: "🚦", type: "drag", tracks: ["industrial"], classes: ["D", "C"], field: 4, laps: 1, minRep: 120, prize: 30_000, rep: 40, trophy: "bronze", ref: { car: "sedan", grade: 1, upgrades: 1 }, parts: 2, skin: "flames" },
  { id: "amateurChampionship", emoji: "🏆", type: "championship", tracks: ["small", "industrial", "small", "mountain", "small"], classes: ["D"], field: 6, laps: 3, minRep: 200, prize: 100_000, rep: 500, trophy: "gold", ref: { car: "sedan", grade: 1, upgrades: 2 }, parts: 3, skin: "gold" },
  { id: "sportCup", emoji: "🥈", type: "circuit", tracks: ["coastal"], classes: ["C"], field: 6, laps: 3, minRep: 600, prize: 120_000, rep: 80, trophy: "silver", ref: { car: "suv", grade: 2, upgrades: 1 }, parts: 2, skin: "ocean" },
  { id: "hillClimb", emoji: "⛰️", type: "hillClimb", tracks: ["mountain"], classes: ["C", "B"], field: 5, laps: 2, minRep: 800, prize: 180_000, rep: 100, trophy: "silver", ref: { car: "suv", grade: 2, upgrades: 2 }, parts: 2 },
  { id: "streetRace", emoji: "🌃", type: "street", tracks: ["nightCity"], classes: ["B"], field: 6, laps: 3, minRep: 2_500, prize: 400_000, rep: 140, trophy: "silver", ref: { car: "sports", grade: 2, upgrades: 2 }, parts: 3, skin: "neon" },
  { id: "proRacing", emoji: "🏎️", type: "circuit", tracks: ["desert"], classes: ["B"], field: 8, laps: 4, minRep: 1_500, prize: 800_000, rep: 220, trophy: "silver", ref: { car: "sports", grade: 3, upgrades: 2 }, parts: 3 },
  { id: "endurance", emoji: "⏱️", type: "endurance", tracks: ["desert"], classes: ["B", "A"], field: 8, laps: 8, minRep: 3_000, prize: 1_600_000, rep: 300, trophy: "silver", ref: { car: "sports", grade: 3, upgrades: 3 }, parts: 4, skin: "desert" },
  { id: "timeTrial", emoji: "⏲️", type: "timeTrial", tracks: ["mountain"], classes: ["A"], field: 6, laps: 2, minRep: 3_500, prize: 2_000_000, rep: 260, trophy: "silver", ref: { car: "supercar", grade: 4, upgrades: 1 }, parts: 4 },
  { id: "grandPrix", emoji: "🏆", type: "grandPrix", tracks: ["grandPrix"], classes: ["A"], field: 8, laps: 5, minRep: 4_000, prize: 5_000_000, rep: 400, trophy: "gold", ref: { car: "supercar", grade: 4, upgrades: 3 }, parts: 5, skin: "carbon" },
  { id: "supercarChampionship", emoji: "🥇", type: "championship", tracks: ["coastal", "nightCity", "desert", "mountain", "grandPrix"], classes: ["A"], field: 8, laps: 4, minRep: 6_000, prize: 25_000_000, rep: 1_500, trophy: "gold", ref: { car: "supercar", grade: 4, upgrades: 4 }, parts: 8 },
  { id: "hypercarChampionship", emoji: "💎", type: "championship", tracks: ["grandPrix", "coastal", "nightCity", "desert", "international"], classes: ["S"], field: 8, laps: 4, minRep: 10_000, prize: 120_000_000, rep: 3_000, trophy: "gold", ref: { car: "hypercar", grade: 5, upgrades: 3 }, parts: 12, skin: "diamond" },
  { id: "worldChampionship", emoji: "🌍", type: "championship", tracks: ["international", "grandPrix", "mountain", "nightCity", "international"], classes: ["S"], field: 8, laps: 5, minRep: 15_000, prize: 600_000_000, rep: 6_000, trophy: "gold", ref: { car: "hypercar", grade: 5, upgrades: 5 }, parts: 20, skin: "world" },
];
export const RACE_EVENT_BY_ID = Object.fromEntries(RACE_EVENTS.map((e) => [e.id, e])) as Record<string, RaceEventConfig>;

/** Every race has an entry fee (a share of its 1st prize) and runs again only after a pause (racing-clock minutes). */
export const ENTRY_FEE = 0.1;
export const RACE_COOLDOWN_MIN = 5;

/** Championship points by finishing position; the final round counts double. */
export const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4];
export const FINAL_POINTS_MULT = 2;
/** Each championship round pays this share of the title prize, by position. */
export const ROUND_PRIZE = 0.06;

// ───────────────────────────── special events ─────────────────────────────

export interface SpecialEventConfig {
  id: string;
  emoji: string;
  /** The race it runs (its rules and track). */
  base: string;
  /** Prize and reputation multiplier. */
  mult: number;
  skin: string;
  /** When it is on, from the local date. */
  when: "weekend" | "spring" | "night" | "week0" | "week1" | "week2" | "week3";
}

export const SPECIAL_EVENTS: SpecialEventConfig[] = [
  { id: "weekendCup", emoji: "🎉", base: "citySprint", mult: 2, skin: "weekend", when: "weekend" },
  { id: "springChampionship", emoji: "🌸", base: "sportCup", mult: 2, skin: "spring", when: "spring" },
  { id: "nightRace", emoji: "🌙", base: "streetRace", mult: 1.8, skin: "neon", when: "night" },
  { id: "desertChallenge", emoji: "🏜️", base: "proRacing", mult: 1.8, skin: "desert", when: "week0" },
  { id: "mountainCup", emoji: "🏔️", base: "hillClimb", mult: 1.8, skin: "alpine", when: "week1" },
  { id: "supercarFestival", emoji: "🎪", base: "grandPrix", mult: 1.6, skin: "festival", when: "week2" },
  { id: "hypercarGrandPrix", emoji: "💠", base: "hypercarChampionship", mult: 1.5, skin: "diamond", when: "week3" },
];

// ───────────────────────────── development ─────────────────────────────

export type RaceUpgrade = "engine" | "brakes" | "suspension" | "tires" | "aero" | "weight" | "transmission" | "cooling";
export const RACE_UPGRADES: RaceUpgrade[] = ["engine", "brakes", "suspension", "tires", "aero", "weight", "transmission", "cooling"];

export interface RaceUpgradeConfig {
  id: RaceUpgrade;
  emoji: string;
  /** Price of level 1 as a share of the car's value; × growth per level. */
  cost: number;
  /** Components from the player's plants, per level (level n needs n × this many). */
  part: ComponentId;
  /** What one level adds. */
  effect: Partial<Record<RaceStat | "hp" | "weight", number>>;
}

/** Each development level costs this many times the previous. */
export const UPGRADE_GROWTH = 1.9;
export const MAX_UPGRADE = 5;

export const RACE_UPGRADE_CONFIG: Record<RaceUpgrade, RaceUpgradeConfig> = {
  engine: { id: "engine", emoji: "⚙️", cost: 0.6, part: "engine", effect: { hp: 0.09 } },
  brakes: { id: "brakes", emoji: "🛑", cost: 0.35, part: "tires", effect: { braking: 6 } },
  suspension: { id: "suspension", emoji: "🔩", cost: 0.45, part: "suspension", effect: { handling: 5, braking: 1 } },
  tires: { id: "tires", emoji: "🛞", cost: 0.4, part: "tires", effect: { handling: 4, braking: 3 } },
  aero: { id: "aero", emoji: "🪽", cost: 0.5, part: "body", effect: { aero: 7, handling: 1 } },
  weight: { id: "weight", emoji: "🪶", cost: 0.55, part: "body", effect: { weight: -0.04 } },
  transmission: { id: "transmission", emoji: "🕹️", cost: 0.5, part: "engine", effect: { accel: 4 } },
  cooling: { id: "cooling", emoji: "❄️", cost: 0.3, part: "engine", effect: { reliability: 4 } },
};

// ───────────────────────────── wear & repairs ─────────────────────────────

export type WearPart = "tires" | "brakes" | "engine" | "suspension";
export const WEAR_PARTS: WearPart[] = ["tires", "brakes", "engine", "suspension"];
/** Wear per race (share of condition, before reliability helps): never harsh. */
export const WEAR_PER_RACE: Record<WearPart, [number, number]> = { tires: [0.05, 0.1], brakes: [0.03, 0.07], engine: [0.01, 0.04], suspension: [0.01, 0.04] };
/** Endurance races wear more. */
export const ENDURANCE_WEAR = 2;
/** Repairing 1% of condition on every part costs this share of the car's value. */
export const REPAIR_COST = 0.004;

// ───────────────────────────── garage ─────────────────────────────

export interface GarageLevelConfig {
  level: number;
  cost: number;
  /** Race cars it holds. */
  slots: number;
  /** Highest development level allowed. */
  maxUpgrade: number;
  /** Minutes between automatic races (null: no auto racing yet). */
  autoEvery: number | null;
  /** Discount on repairs. */
  repairDiscount: number;
}

export const GARAGE_LEVELS: GarageLevelConfig[] = [
  { level: 1, cost: 0, slots: 1, maxUpgrade: 2, autoEvery: null, repairDiscount: 0 },
  { level: 2, cost: 25_000, slots: 1, maxUpgrade: 2, autoEvery: 30, repairDiscount: 0.05 },
  { level: 3, cost: 80_000, slots: 2, maxUpgrade: 3, autoEvery: 25, repairDiscount: 0.1 },
  { level: 4, cost: 250_000, slots: 2, maxUpgrade: 3, autoEvery: 22, repairDiscount: 0.15 },
  { level: 5, cost: 800_000, slots: 3, maxUpgrade: 4, autoEvery: 20, repairDiscount: 0.2 },
  { level: 6, cost: 2_500_000, slots: 3, maxUpgrade: 4, autoEvery: 18, repairDiscount: 0.25 },
  { level: 7, cost: 8_000_000, slots: 4, maxUpgrade: 5, autoEvery: 16, repairDiscount: 0.3 },
  { level: 8, cost: 25_000_000, slots: 4, maxUpgrade: 5, autoEvery: 14, repairDiscount: 0.35 },
  { level: 9, cost: 80_000_000, slots: 5, maxUpgrade: 5, autoEvery: 12, repairDiscount: 0.4 },
  { level: 10, cost: 250_000_000, slots: 6, maxUpgrade: 5, autoEvery: 10, repairDiscount: 0.5 },
];
/** Automatic racing repairs a car before it drops below this condition. */
export const AUTO_REPAIR_BELOW = 0.6;
/** Offline racing: at most this many races are simulated. */
export const OFFLINE_RACES_MAX = 48;

// ───────────────────────────── reputation & sponsors ─────────────────────────────

export type RepTier = "rookie" | "amateur" | "professional" | "elite" | "champion" | "legend";
export const REP_TIERS: { id: RepTier; min: number; emoji: string }[] = [
  { id: "rookie", min: 0, emoji: "🔰" },
  { id: "amateur", min: 100, emoji: "🥉" },
  { id: "professional", min: 600, emoji: "🥈" },
  { id: "elite", min: 2_500, emoji: "🥇" },
  { id: "champion", min: 8_000, emoji: "🏆" },
  { id: "legend", min: 20_000, emoji: "👑" },
];

export interface SponsorConfig {
  id: string;
  name: string;
  logo: string;
  color: string;
  /** Reputation needed to sign. */
  minRep: number;
  /** Paid for every race entered. */
  perRace: number;
  /** Paid once when signing (and nothing back when leaving). */
  signing: number;
}

export const SPONSORS: SponsorConfig[] = [
  { id: "boltCola", name: "Bolt Cola", logo: "🥤", color: "#dc2626", minRep: 100, perRace: 5_000, signing: 10_000 },
  { id: "turboTech", name: "TurboTech Oil", logo: "🛢️", color: "#f59e0b", minRep: 600, perRace: 15_000, signing: 40_000 },
  { id: "nimbusTel", name: "Nimbus Telecom", logo: "📡", color: "#2563eb", minRep: 2_500, perRace: 50_000, signing: 150_000 },
  { id: "aurumBank", name: "Aurum Bank", logo: "🏦", color: "#ca8a04", minRep: 8_000, perRace: 200_000, signing: 600_000 },
  { id: "orbitAir", name: "Orbit Airways", logo: "✈️", color: "#0ea5e9", minRep: 20_000, perRace: 1_000_000, signing: 3_000_000 },
];
export const SPONSOR_BY_ID = Object.fromEntries(SPONSORS.map((s) => [s.id, s])) as Record<string, SponsorConfig>;

// ───────────────────────────── liveries ─────────────────────────────

/** Paint schemes: base colour and stripe colour. "factory" is the model's own colour. */
export const SKINS: Record<string, { emoji: string; color: string; accent: string }> = {
  factory: { emoji: "🏭", color: "", accent: "#f8fafc" },
  checker: { emoji: "🏁", color: "#f8fafc", accent: "#111827" },
  flames: { emoji: "🔥", color: "#111827", accent: "#f97316" },
  gold: { emoji: "🥇", color: "#ca8a04", accent: "#111827" },
  ocean: { emoji: "🌊", color: "#0369a1", accent: "#7dd3fc" },
  neon: { emoji: "🌃", color: "#7c3aed", accent: "#22d3ee" },
  desert: { emoji: "🏜️", color: "#d97706", accent: "#fef3c7" },
  carbon: { emoji: "🖤", color: "#1f2937", accent: "#e5e7eb" },
  diamond: { emoji: "💎", color: "#a5f3fc", accent: "#1e3a8a" },
  world: { emoji: "🌍", color: "#16a34a", accent: "#fde047" },
  weekend: { emoji: "🎉", color: "#db2777", accent: "#fde047" },
  spring: { emoji: "🌸", color: "#f9a8d4", accent: "#15803d" },
  alpine: { emoji: "🏔️", color: "#e2e8f0", accent: "#0ea5e9" },
  festival: { emoji: "🎪", color: "#ef4444", accent: "#fbbf24" },
};

/** "Build the fastest car in the world": the goal at the end of the ladder. */
export const FASTEST_CAR_EVENT = "worldChampionship";
