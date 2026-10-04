// The Racing District. Cars come off the player's own assembly lines (a car
// transporter takes them to the paddock), carry the grades of the parts the
// plants made, and race rival teams for prize money, reputation and
// trophies. Races are decided here, deterministically, lap by lap; the map
// and the race viewer only replay the lap times. Prizes go back into the
// empire; better plants make faster cars. All numbers: config/racing.ts.
import { addSeasonPoints } from "./live";
import { CAR_BY_ID, CARS, type CarConfig } from "../config/cars";
import { MAKER } from "../config/chain";
import { DRIVETRAIN_GRADE,
  AUTO_REPAIR_BELOW,
  BASE_WEIGHT,
  BODY_DYNAMICS,
  BODY_GRADE_WEIGHT,
  CHAMPIONSHIP_POINTS,
  ENTRY_FEE,
  ENDURANCE_WEAR,
  ENGINE_GRADE_POWER,
  FINAL_POINTS_MULT,
  GARAGE_LEVELS,
  GRID_GAP,
  INCIDENT,
  MAX_UPGRADE,
  OFFLINE_RACES_MAX,
  PRIZE_SHARE,
  RACE_CLASS_OF,
  RACE_COOLDOWN_MIN,
  RACE_COUNTDOWN,
  RACE_EVENTS,
  RACE_EVENT_BY_ID,
  RACE_NOISE,
  RACE_TIME_SCALE,
  RACE_UPGRADES,
  RACE_UPGRADE_CONFIG,
  RAIN,
  RAIN_CHANCE,
  REF_UPGRADES,
  UPGRADE_INSTALL_SEC,
  WEATHER_BLOCK_SEC,
  RACE_WEIGHTS,
  RACING_DISTRICT,
  RATING_SOFTEN,
  REPAIR_COST,
  REP_SHARE,
  REP_TIERS,
  RIVAL_GROWTH,
  RIVAL_TEAMS,
  ROUND_PRIZE,
  SKINS,
  SPECIAL_EVENTS,
  SPONSOR_BY_ID,
  STAT_CURVE,
  SUSPENSION_GRADE_GRIP,
  TIRE_GRADE_GRIP,
  TRACK_BY_ID,
  UPGRADE_GROWTH,
  WEAR_FLOOR,
  WEAR_PARTS,
  WEAR_PER_RACE,
  type RaceClass,
  type RaceEventConfig,
  type RaceStat,
  type RaceType,
  type RaceUpgrade,
  type SpecialEventConfig,
  type Trophy,
  type WearPart,
} from "../config/racing";
import { ZONE_BY_ID } from "../config/city";
import { DEALER_BY_ID } from "../config/dealerships";
import { carListPrice } from "./costs";
import { designStats } from "./design";
import { book } from "./materials";
import type {
  CarId,
  ChampionshipState,
  ComponentId,
  DealerId,
  GameState,
  OfflineRacing,
  RaceCarState,
  RaceEntrant,
  RaceRecord,
  RaceReward,
  RacingState,
} from "../types";

// ───────────────────────────── state ─────────────────────────────

export function createRacing(): RacingState {
  return {
    unlocked: false,
    clock: 0,
    garage: 1,
    cars: [],
    nextCar: 1,
    orders: [],
    arrivals: [],
    selected: null,
    rep: 0,
    trophies: { bronze: 0, silver: 0, gold: 0 },
    parts: 0,
    skins: ["factory"],
    sponsor: null,
    live: null,
    last: null,
    championship: null,
    wins: {},
    cooldowns: {},
    auto: { on: false, next: 0, repair: true },
    stats: { races: 0, wins: 0, podiums: 0, prize: 0, repairs: 0, titles: 0, best: {} },
    nextRace: 1,
  };
}

const recipeOf = (car: CarConfig): ComponentId[] => ["body", "engine", "tires", ...car.extras];

/** Money that the player earns (counted in the earnings stats, like sales). */
function earn(s: GameState, amount: number) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.cash += amount;
  s.run.moneyEarned += amount;
  s.lifetime.moneyEarned += amount;
  book(s, "racing", amount);
}

// ───────────────────────────── the district ─────────────────────────────

export type RacingBlocker = "firstCar" | "cash" | null;

/** The road to the circuit runs through the Industrial District: building it opens that district too (and costs it). */
export function racingCost(s: GameState): number {
  return RACING_DISTRICT.cost + (s.city.zones.includes("industrial") ? 0 : ZONE_BY_ID.industrial.cost);
}

/** What stands between the player and the Racing District. */
export function racingBlocker(s: GameState): RacingBlocker {
  if (!s.chain.firstCar) return "firstCar";
  if (s.cash < racingCost(s)) return "cash";
  return null;
}

export function unlockRacing(s: GameState): boolean {
  if (s.racing.unlocked || racingBlocker(s) !== null) return false;
  s.cash -= racingCost(s);
  if (!s.city.zones.includes("industrial")) s.city.zones.push("industrial");
  s.racing.unlocked = true;
  return true;
}

export const garageLevel = (s: GameState) => GARAGE_LEVELS[Math.max(0, Math.min(GARAGE_LEVELS.length - 1, s.racing.garage - 1))];

export function garageUpgradeCost(s: GameState): number | null {
  return GARAGE_LEVELS[s.racing.garage]?.cost ?? null;
}

export function upgradeGarage(s: GameState): boolean {
  const cost = garageUpgradeCost(s);
  if (!s.racing.unlocked || cost === null || s.cash < cost) return false;
  s.cash -= cost;
  s.racing.garage += 1;
  return true;
}

// ───────────────────────────── race cars ─────────────────────────────

/** Car models the player builds at least once, so one can be sent to the track. */
export function orderableCars(s: GameState): CarId[] {
  return CARS.filter((c) => (s.lifetime.carsByType[c.id] ?? 0) > 0).map((c) => c.id);
}

/** How many cars the company can keep: the racing garage's slots, plus a few at the factory lot. */
export const fleetCap = (s: GameState) => (s.racing.unlocked ? garageLevel(s).slots : 0) + MY_CARS_LOT;
/** Cars kept at the factory lot before (and besides) the racing garage. */
export const MY_CARS_LOT = 2;

/** Cars at the track plus the ones on their way. */
export const racingFleet = (s: GameState) => s.racing.cars.length + s.racing.orders.length + s.racing.arrivals.length;

/**
 * Asks the assembly plants for one car of this model: the next one off a
 * line that builds it goes to the Racing District on a car transporter
 * instead of to a dealer.
 */
export function orderRaceCar(s: GameState, car: CarId): boolean {
  if (!orderableCars(s).includes(car)) return false;
  if (racingFleet(s) >= fleetCap(s)) return false;
  s.racing.orders.push(car);
  return true;
}

export function cancelOrder(s: GameState, car: CarId): boolean {
  const i = s.racing.orders.indexOf(car);
  if (i < 0) return false;
  s.racing.orders.splice(i, 1);
  return true;
}

/** Best grade any plant makes for a component (0: no plant makes it). */
function gradeNow(s: GameState, c: ComponentId): number {
  let g = 0;
  for (const b of Object.values(s.city.buildings)) if (b.plant && b.type === MAKER[c]) g = Math.max(g, b.plant.grade);
  return g;
}

/** A delivered car becomes a race car: its parts' grades and the design studio's figures are fixed now. */
export function receiveRaceCar(s: GameState, car: CarId, location: "factory" | "racing" = "racing"): RaceCarState {
  const cfg = CAR_BY_ID[car];
  const grades: Partial<Record<ComponentId, number>> = {};
  for (const c of recipeOf(cfg)) grades[c] = Math.max(cfg.grade, gradeNow(s, c));
  const ds = designStats(cfg, s.designs[car], grades.body ?? cfg.grade);
  const rc: RaceCarState = {
    id: s.racing.nextCar++,
    car,
    grades,
    hp: ds.hp,
    quality: ds.quality,
    design: ds.design,
    value: carListPrice(cfg, recipeOf(cfg)),
    upgrades: {},
    wear: { tires: 1, brakes: 1, engine: 1, suspension: 1 },
    skin: "factory",
    races: 0,
    wins: 0,
    built: s.lastActiveAt,
    location,
    mileage: 0,
    podiums: 0,
    history: [],
  };
  s.racing.cars.push(rc);
  if (s.racing.selected === null) s.racing.selected = rc.id;
  return rc;
}

/** Retires a race car: a collector buys it for part of its worth. */
export function retireRaceCar(s: GameState, id: number): number {
  const i = s.racing.cars.findIndex((c) => c.id === id);
  if (i < 0 || s.racing.live?.car === id) return 0;
  const rc = s.racing.cars[i];
  const pay = carWorth(rc) * 0.4 * condition(rc);
  s.racing.cars.splice(i, 1);
  if (s.racing.selected === id) s.racing.selected = s.racing.cars[0]?.id ?? null;
  s.cash += pay;
  return pay;
}

/** Kilometres a lap adds to a car's odometer. */
const TRACK_KM = 4.2;

/** A car at the paddock (not at the factory lot, nor on a transporter) can race. */
export const atTrack = (rc: RaceCarState) => rc.location === undefined || rc.location === "racing";

export const raceCar = (s: GameState, id: number | null) => s.racing.cars.find((c) => c.id === id) ?? null;
export const condition = (rc: RaceCarState) => WEAR_PARTS.reduce((a, p) => a + rc.wear[p], 0) / WEAR_PARTS.length;
const level = (rc: { upgrades: RaceCarState["upgrades"] }, u: RaceUpgrade) => rc.upgrades[u] ?? 0;
/** The car and everything spent developing it (repairs are priced from this). */
export const carWorth = (rc: RaceCarState) => rc.value * (1 + 0.15 * RACE_UPGRADES.reduce((a, u) => a + level(rc, u), 0));

// ───────────────────────────── performance ─────────────────────────────

export interface RaceStats {
  hp: number;
  weight: number;
  speed: number;
  accel: number;
  handling: number;
  braking: number;
  aero: number;
  reliability: number;
  condition: number;
}

const clamp = (v: number, a = 1, b = 100) => Math.max(a, Math.min(b, v));

/** What a car can do: its platform, the grades of its parts, its design and its development. */
export function statsOf(car: CarId, grades: Partial<Record<ComponentId, number>>, design: { hp: number; quality: number; design: number }, upgrades: RaceCarState["upgrades"], wear?: RaceCarState["wear"]): RaceStats {
  const g = (c: ComponentId) => Math.max(0, grades[c] ?? 0);
  const up = (u: RaceUpgrade) => upgrades[u] ?? 0;
  const eff = (u: RaceUpgrade, k: keyof typeof RACE_UPGRADE_CONFIG.engine.effect) => up(u) * (RACE_UPGRADE_CONFIG[u].effect[k] ?? 0);
  const all = (k: keyof typeof RACE_UPGRADE_CONFIG.engine.effect) => RACE_UPGRADES.reduce((a, u) => a + eff(u, k), 0);

  const engineGrade = Math.max(1, g("engine"));
  const hp = design.hp * ENGINE_GRADE_POWER[Math.min(ENGINE_GRADE_POWER.length - 1, engineGrade - 1)] * (1 + all("hp"));
  const bodyGrade = Math.max(1, g("body"));
  const weight = BASE_WEIGHT[car] * (1 - BODY_GRADE_WEIGHT * (bodyGrade - 1)) * Math.max(0.6, 1 + all("weight"));
  const dyn = BODY_DYNAMICS[car];
  const aero = clamp(dyn.aero + design.design / 10 + all("aero"));
  const speed = clamp(100 * (1 - Math.exp((-hp * (0.85 + aero / 330)) / STAT_CURVE.speedHp)));
  // the gearbox puts the power down: each transmission grade shaves the launch
  const accel = clamp(100 * (1 - Math.exp(-(hp / (weight / 1000)) / STAT_CURVE.accelPtw)) + all("accel") + DRIVETRAIN_GRADE.transmission * Math.max(0, g("transmission") - 1));
  const heavy = weight - STAT_CURVE.weightRef;
  const handling = clamp(
    dyn.handling + TIRE_GRADE_GRIP * (g("tires") - 1) + SUSPENSION_GRADE_GRIP * Math.max(0, g("suspension") - 1) + DRIVETRAIN_GRADE.wheels * Math.max(0, g("wheels") - 1) + all("handling") - heavy * STAT_CURVE.handlingPerKg,
  );
  const braking = clamp(40 + 3 * (g("tires") - 1) + 2 * Math.max(0, g("suspension") - 1) + DRIVETRAIN_GRADE.brakes * Math.max(0, g("brakes") - 1) + all("braking") - heavy * STAT_CURVE.brakingPerKg);
  const reliability = clamp(design.quality * 0.8 + 12 + all("reliability"));
  const cond = wear ? WEAR_PARTS.reduce((a, p) => a + wear[p], 0) / WEAR_PARTS.length : 1;
  const k = WEAR_FLOOR + (1 - WEAR_FLOOR) * cond;
  // worn tyres and brakes hurt grip, a tired engine hurts power
  const wk = (p: WearPart) => (wear ? WEAR_FLOOR + (1 - WEAR_FLOOR) * wear[p] : 1);
  return {
    hp: Math.round(hp * wk("engine")),
    weight: Math.round(weight),
    speed: speed * wk("engine"),
    accel: accel * wk("engine"),
    handling: handling * Math.min(wk("tires"), wk("suspension")),
    braking: braking * wk("brakes"),
    aero,
    reliability: reliability * k,
    condition: cond,
  };
}

export const carStats = (rc: RaceCarState, wear = true) => statsOf(rc.car, rc.grades, rc, rc.upgrades, wear ? rc.wear : undefined);

/** The single number a race is decided on: the stats weighted by what this kind of race rewards (≈ 0–1000). */
export function rating(st: RaceStats, type: RaceType): number {
  const w = RACE_WEIGHTS[type];
  let r = 0;
  let sum = 0;
  for (const [k, v] of Object.entries(w) as [RaceStat, number][]) {
    r += st[k] * v;
    sum += v;
  }
  return (r / sum) * 10;
}

/** The car the rivals of an event are tuned against: a stock car of its class at the given grade and development. */
export function referenceRating(ev: RaceEventConfig, type: RaceType = ev.type): number {
  const cfg = CAR_BY_ID[ev.ref.car];
  const grades: Partial<Record<ComponentId, number>> = {};
  for (const c of recipeOf(cfg)) grades[c] = ev.ref.grade;
  const ds = designStats(cfg, { name: "", engine: 0, interior: 0, rims: 0, paint: 0, color: "" }, ev.ref.grade);
  const ups = Object.fromEntries(REF_UPGRADES.map((u) => [u, ev.ref.upgrades])) as RaceCarState["upgrades"];
  return rating(statsOf(ev.ref.car, grades, ds, ups), type === "championship" ? "circuit" : type);
}

// ───────────────────────────── events ─────────────────────────────

export function repTier(rep: number) {
  let t = REP_TIERS[0];
  for (const x of REP_TIERS) if (rep >= x.min) t = x;
  return t;
}

export function nextRepTier(rep: number) {
  return REP_TIERS.find((x) => x.min > rep) ?? null;
}

export const classOf = (car: CarId): RaceClass => RACE_CLASS_OF[car];

/** Special events running now (by the local date and time). */
export function activeSpecials(now: number): SpecialEventConfig[] {
  const d = new Date(now);
  const day = d.getDay();
  const month = d.getMonth();
  const hour = d.getHours();
  const week = Math.floor((now / 86_400_000 + 4) / 7) % 4;
  return SPECIAL_EVENTS.filter((e) => {
    switch (e.when) {
      case "weekend":
        return day === 0 || day === 6;
      case "spring":
        return month >= 2 && month <= 4;
      case "night":
        return hour >= 19 || hour < 6;
      default:
        return e.when === `week${week}`;
    }
  });
}

export type EventLock =
  | { kind: "rep"; need: number }
  | { kind: "class"; classes: RaceClass[] }
  | { kind: "noCar" }
  | { kind: "away" }
  | { kind: "fitting"; seconds: number }
  | { kind: "busy" }
  | { kind: "championship"; event: string }
  | { kind: "cooldown"; seconds: number }
  | { kind: "fee"; fee: number }
  | null;

/** Entry fee of an event's next race (a championship round pays a share). */
export function entryFee(ev: RaceEventConfig, specialMult = 1): number {
  return ev.prize * (ev.type === "championship" ? ROUND_PRIZE : 1) * ENTRY_FEE * specialMult;
}

/** Seconds until an event takes entries again (0: open). */
export function cooldownLeft(s: GameState, id: string): number {
  return Math.max(0, (s.racing.cooldowns[id] ?? 0) - s.racing.clock);
}

/** Why this car can't enter this event right now, or null. */
export function eventLock(s: GameState, ev: RaceEventConfig, rc: RaceCarState | null): EventLock {
  if (s.racing.rep < ev.minRep) return { kind: "rep", need: ev.minRep };
  if (!rc) return { kind: "noCar" };
  if (!atTrack(rc)) return { kind: "away" };
  if (rc.install) return { kind: "fitting", seconds: rc.install.left };
  if (!ev.classes.includes(classOf(rc.car))) return { kind: "class", classes: ev.classes };
  if (s.racing.live) return { kind: "busy" };
  // one championship at a time
  const ch = s.racing.championship;
  if (ev.type === "championship" && ch && ch.event !== ev.id) return { kind: "championship", event: ch.event };
  const wait = cooldownLeft(s, ev.id);
  if (wait > 0) return { kind: "cooldown", seconds: wait };
  if (s.cash < entryFee(ev)) return { kind: "fee", fee: entryFee(ev) };
  return null;
}

/** The hardest event this car may enter now (what automatic racing picks). */
export function bestEventFor(s: GameState, rc: RaceCarState): RaceEventConfig | null {
  if (!atTrack(rc) || rc.install) return null;
  let best: RaceEventConfig | null = null;
  for (const ev of RACE_EVENTS) {
    if (ev.type === "championship") continue;
    if (s.racing.rep < ev.minRep || !ev.classes.includes(classOf(rc.car))) continue;
    if (cooldownLeft(s, ev.id) > 0 || s.cash < entryFee(ev)) continue;
    if (!best || ev.prize > best.prize) best = ev;
  }
  return best;
}

// ───────────────────────────── the race ─────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

/** Colours a race car runs in: its livery, or the model's own paint. */
export function liveryOf(s: GameState, rc: RaceCarState): { color: string; accent: string } {
  const sk = SKINS[rc.skin] ?? SKINS.factory;
  return { color: sk.color || s.designs[rc.car]?.color || CAR_BY_ID[rc.car].color, accent: sk.accent };
}

/** Platforms the rivals drive in each class. */
const RIVAL_CARS: Record<RaceClass, CarId[]> = { D: ["city", "sedan"], C: ["suv", "luxury"], B: ["sports", "perfSuv"], A: ["supercar"], S: ["hypercar", "electric"] };

/** The rival field of an event: teams, drivers, cars and how fast they are. */
export function rivalsFor(s: GameState, ev: RaceEventConfig, type: RaceType, seed: number) {
  const r = rng(seed ^ 0x51a7);
  const ref = referenceRating(ev, type);
  const grow = 1 + RIVAL_GROWTH.perWin * Math.min(RIVAL_GROWTH.max, s.racing.wins[ev.id] ?? 0);
  const cls = ev.classes[ev.classes.length - 1];
  const n = ev.field - 1;
  // stronger events bring the stronger teams
  const start = Math.min(RIVAL_TEAMS.length - 1, Math.floor((RACE_EVENTS.indexOf(ev) / RACE_EVENTS.length) * 3));
  const out: { team: (typeof RIVAL_TEAMS)[number]; driver: string; model: CarId; rating: number; id: string }[] = [];
  for (let i = 0; i < n; i++) {
    const team = RIVAL_TEAMS[(start + i) % RIVAL_TEAMS.length];
    const second = i >= RIVAL_TEAMS.length ? 1 : 0;
    const cars = RIVAL_CARS[cls];
    out.push({
      team,
      driver: team.drivers[second],
      model: cars[(i + second) % cars.length],
      rating: ref * team.skill * grow * (second ? 0.985 : 1) * (1 + (r() - 0.5) * 0.02),
      id: `${team.id}:${second}`,
    });
  }
  return out;
}

/** Shown lap time of a car of this rating on this track. */
function lapTimeFor(ratingValue: number, ref: number, refLap: number) {
  return (refLap * (ref + RATING_SOFTEN)) / (ratingValue + RATING_SOFTEN);
}

export interface RaceSetup {
  event: RaceEventConfig;
  special?: SpecialEventConfig;
  type: RaceType;
  track: RaceRecord["track"];
  laps: number;
  round?: number;
}

/** Which race an event runs next (a championship: its next round). */
export function setupFor(s: GameState, eventId: string, specialId?: string): RaceSetup | null {
  const special = specialId ? SPECIAL_EVENTS.find((e) => e.id === specialId) : undefined;
  const ev = RACE_EVENT_BY_ID[special ? special.base : eventId];
  if (!ev) return null;
  let round: number | undefined;
  let track = ev.tracks[0];
  if (ev.type === "championship") {
    round = s.racing.championship?.event === ev.id ? s.racing.championship.round : 0;
    track = ev.tracks[round];
  }
  const laps = ev.laps ?? TRACK_BY_ID[track].laps;
  return { event: ev, special, type: ev.type, track, laps, round };
}

/** Rating a car brings to a race of this kind. */
export function carRating(rc: RaceCarState, type: RaceType) {
  return rating(carStats(rc), type === "championship" ? "circuit" : type);
}

/**
 * Runs a race: builds the grid, then every lap of every car. The result is
 * fixed here; `startT` is when the countdown begins on the racing clock.
 */
export function runRace(s: GameState, setup: RaceSetup, rc: RaceCarState, startT: number): RaceRecord {
  const id = s.racing.nextRace++;
  const seed = (id * 2654435761 + Math.floor(s.racing.clock) * 97 + s.createdAt) >>> 0;
  const r = rng(seed);
  const type = setup.type === "championship" ? "circuit" : setup.type;
  const ref = referenceRating(setup.event, setup.type);
  const refLap = TRACK_BY_ID[setup.track].refLap;
  const st = carStats(rc);
  const look = liveryOf(s, rc);
  const rivals = rivalsFor(s, setup.event, setup.type, seed);
  // rain: every car loses pace, the ones with grip (tyres, suspension, brakes) lose less
  const wet = weatherAt(s, startT).wet;
  const mine = wet ? wetPace(st) : 1;
  const theirs = wet ? 1 - RAIN.pace * (1 - RAIN.rivalGrip / 100) : 1;
  const field: Omit<RaceEntrant, "grid" | "laps" | "total">[] = [
    { id: "player", team: null, driver: "", model: rc.car, color: look.color, accent: look.accent, rating: rating(st, type) * mine },
    ...rivals.map((x) => ({ id: x.id, team: x.team.id, driver: x.driver, model: x.model, color: x.team.color, accent: x.team.accent, rating: x.rating * theirs })),
  ];
  // the grid: the player starts from the back of the field the first time, then by rating (a qualifying run)
  const quali = field.map((e) => ({ e, q: e.rating * (1 + gauss(r) * 0.01) })).sort((a, b) => b.q - a.q);
  const entrants: RaceEntrant[] = quali.map(({ e }, grid) => {
    const form = 1 + gauss(r) * RACE_NOISE.form;
    const base = lapTimeFor(e.rating, ref, refLap) * form;
    const laps: number[] = [];
    for (let l = 0; l < setup.laps; l++) laps.push(base * (1 + gauss(r) * RACE_NOISE.lap) * (l === 0 ? 1.04 : 1));
    // mistakes: rarer the more reliable the car
    const rel = e.id === "player" ? st.reliability : 70 + (e.rating / 10) * 0.2;
    if (r() < INCIDENT.chance * (1 - rel / 100) * (wet ? RAIN.incidents : 1)) {
      const lap = Math.floor(r() * setup.laps);
      laps[lap] += INCIDENT.minLoss + r() * (INCIDENT.maxLoss - INCIDENT.minLoss);
    }
    const start = grid * GRID_GAP * RACE_TIME_SCALE;
    return { ...e, grid, laps, total: start + laps.reduce((a, b) => a + b, 0) };
  });
  const order = [...entrants].sort((a, b) => a.total - b.total).map((e) => e.id);
  return { id, event: setup.event.id, special: setup.special?.id, track: setup.track, type: setup.type, laps: setup.laps, startT, car: rc.id, entrants, order, round: setup.round, ...(wet ? { wet } : {}) };
}

/** Pays the entry fee and starts the event's pause; returns the fee. */
function signUp(s: GameState, ev: RaceEventConfig, specialMult = 1): number {
  const fee = entryFee(ev, specialMult);
  s.cash -= fee;
  s.racing.stats.fees = (s.racing.stats.fees ?? 0) + fee;
  book(s, "repairs", fee);
  s.racing.cooldowns[ev.id] = s.racing.clock + RACE_COOLDOWN_MIN * 60;
  return fee;
}

/** Real seconds from the countdown to the last car home. */
export function raceDuration(rec: RaceRecord): number {
  return RACE_COUNTDOWN + Math.max(...rec.entrants.map((e) => e.total)) / RACE_TIME_SCALE;
}

/** Rain or shine at the circuits now (the forecast holds for WEATHER_BLOCK_SEC of racing time). */
export function weatherAt(s: GameState, clock = s.racing.clock): { wet: boolean; left: number } {
  const block = Math.floor(Math.max(0, clock) / WEATHER_BLOCK_SEC);
  const wet = rng((block * 2246822519 + s.createdAt) >>> 0)() < RAIN_CHANCE;
  return { wet, left: (block + 1) * WEATHER_BLOCK_SEC - Math.max(0, clock) };
}

/** Grip in the wet: tyres, suspension and brakes keep a car's pace (0–1, share kept). */
export const wetPace = (st: Pick<RaceStats, "handling" | "braking">) => 1 - RAIN.pace * (1 - (st.handling + st.braking) / 200);

/** Enters the selected car in a race; it starts on the map and in the viewer right away. */
export function enterRace(s: GameState, eventId: string, specialId?: string, carId = s.racing.selected): RaceRecord | null {
  const rc = raceCar(s, carId);
  const setup = setupFor(s, eventId, specialId);
  if (!setup || !rc || eventLock(s, setup.event, rc) !== null) return null;
  if (specialId && !activeSpecials(Date.now()).some((e) => e.id === specialId)) return null;
  const fee = signUp(s, setup.event, setup.special?.mult ?? 1);
  const rec = runRace(s, setup, rc, s.racing.clock);
  rec.fee = fee;
  s.racing.live = rec;
  return rec;
}

// ───────────────────────────── results ─────────────────────────────

/** Pays out a finished race: prize, sponsor, reputation, trophies, parts, wear, championship points. */
export function settleRace(s: GameState, rec: RaceRecord, seed = rec.id): RaceReward {
  const R = s.racing;
  const ev = RACE_EVENT_BY_ID[rec.event];
  const special = rec.special ? SPECIAL_EVENTS.find((e) => e.id === rec.special) : undefined;
  const mult = special?.mult ?? 1;
  const pos = rec.order.indexOf("player");
  const champ = ev.type === "championship";
  const prize = ev.prize * (champ ? ROUND_PRIZE : 1) * (PRIZE_SHARE[pos] ?? 0) * mult;
  const rep = Math.round(ev.rep * (champ ? 0.15 : 1) * (REP_SHARE[pos] ?? 0) * mult);
  const sponsor = R.sponsor ? (SPONSOR_BY_ID[R.sponsor]?.perRace ?? 0) : 0;
  const parts = pos === 0 ? (ev.parts ?? 0) : pos <= 2 ? Math.floor((ev.parts ?? 0) / 2) : 0;
  const reward: RaceReward = { position: pos, fee: rec.fee ?? 0, prize, sponsor, rep, parts };

  earn(s, prize + sponsor);
  R.rep += rep;
  R.parts += parts;
  R.stats.races += 1;
  R.stats.prize += prize + sponsor;
  if (pos === 0) {
    R.stats.wins += 1;
    R.wins[ev.id] = (R.wins[ev.id] ?? 0) + 1;
    if (!champ && ev.trophy) {
      reward.trophy = ev.trophy;
      R.trophies[ev.trophy] += 1;
    }
    const skin = special?.skin ?? ev.skin;
    if (skin && !R.skins.includes(skin)) {
      R.skins.push(skin);
      reward.skin = skin;
    }
  }
  if (pos <= 2) R.stats.podiums += 1;
  const me = rec.entrants.find((e) => e.id === "player");
  const mine = raceCar(s, rec.car);
  if (mine) {
    mine.history = [...(mine.history ?? []), { event: ev.id, pos }].slice(-12);
    mine.mileage = (mine.mileage ?? 0) + rec.laps * TRACK_KM;
    if (pos <= 2) mine.podiums = (mine.podiums ?? 0) + 1;
    if (me) mine.bestLap = Math.min(mine.bestLap ?? Infinity, ...me.laps);
    mine.location = "racing";
  }
  if (me) {
    const best = Math.min(...me.laps);
    const prev = R.stats.best[rec.track];
    if (prev === undefined || best < prev) R.stats.best[rec.track] = best;
  }

  // wear: never harsh, less on a reliable car
  const rc = raceCar(s, rec.car);
  if (rc) {
    rc.races += 1;
    if (pos === 0) rc.wins += 1;
    const r = rng(seed * 31 + 7);
    const rel = carStats(rc).reliability / 100;
    const k = (ev.type === "endurance" ? ENDURANCE_WEAR : 1) * (1.2 - 0.5 * rel) * (rec.laps / 3) ** 0.5;
    for (const p of WEAR_PARTS) {
      const [a, b] = WEAR_PER_RACE[p];
      rc.wear[p] = Math.max(0.05, rc.wear[p] - (a + r() * (b - a)) * k);
    }
  }

  if (champ) champRound(s, rec, ev, reward, mult);
  addSeasonPoints(s, pos, ev.id);
  rec.result = reward;
  return reward;
}

function champRound(s: GameState, rec: RaceRecord, ev: RaceEventConfig, reward: RaceReward, mult: number) {
  const R = s.racing;
  const round = rec.round ?? 0;
  let ch: ChampionshipState | null = R.championship;
  if (!ch || ch.event !== ev.id) {
    ch = { event: ev.id, round: 0, points: {}, names: {} };
    R.championship = ch;
  }
  const final = round === ev.tracks.length - 1;
  rec.order.forEach((id, i) => {
    const pts = (CHAMPIONSHIP_POINTS[i] ?? 0) * (final ? FINAL_POINTS_MULT : 1);
    ch!.points[id] = (ch!.points[id] ?? 0) + pts;
    const e = rec.entrants.find((x) => x.id === id);
    if (e) ch!.names[id] = { driver: e.driver, team: e.team };
    if (id === "player") reward.points = pts;
  });
  ch.round = round + 1;
  if (!final) return;
  // the title
  const table = Object.entries(ch.points).sort((a, b) => b[1] - a[1]);
  const position = table.findIndex(([id]) => id === "player");
  const share = [1, 0.4, 0.2][position] ?? 0;
  const prize = ev.prize * share * mult;
  const rep = Math.round(ev.rep * share * mult);
  const trophy: Trophy | undefined = position === 0 ? (ev.trophy ?? "gold") : position === 1 ? "silver" : position === 2 ? "bronze" : undefined;
  earn(s, prize);
  R.rep += rep;
  R.stats.prize += prize;
  if (trophy) R.trophies[trophy] += 1;
  if (position === 0) {
    R.stats.titles += 1;
    R.wins[`${ev.id}:title`] = (R.wins[`${ev.id}:title`] ?? 0) + 1;
  }
  reward.title = { position, prize, rep, trophy };
  R.championship = null;
}

/** Standings of the running championship, best first. */
export function standings(s: GameState) {
  const ch = s.racing.championship;
  if (!ch) return [];
  return Object.entries(ch.points)
    .map(([id, pts]) => ({ id, pts, ...ch.names[id] }))
    .sort((a, b) => b.pts - a.pts);
}

// ───────────────────────────── repairs & development ─────────────────────────────

export function repairCost(s: GameState, rc: RaceCarState): number {
  const missing = WEAR_PARTS.reduce((a, p) => a + (1 - rc.wear[p]), 0) / WEAR_PARTS.length;
  return carWorth(rc) * REPAIR_COST * 100 * missing * (1 - garageLevel(s).repairDiscount);
}

export function repairCar(s: GameState, id: number): boolean {
  const rc = raceCar(s, id);
  if (!rc || s.racing.live?.car === id || rc.location === "transit") return false;
  const cost = repairCost(s, rc);
  if (cost <= 0 || s.cash < cost) return false;
  s.cash -= cost;
  book(s, "repairs", cost);
  s.racing.stats.repairs += cost;
  for (const p of WEAR_PARTS) rc.wear[p] = 1;
  return true;
}

export interface UpgradeCost {
  money: number;
  part: ComponentId;
  parts: number;
  /** 🔧 racing parts (won at races) that can stand in for the components. */
  racingParts: number;
}

export function raceUpgradeCost(s: GameState, rc: RaceCarState, u: RaceUpgrade): UpgradeCost | null {
  const lvl = level(rc, u);
  if (lvl >= Math.min(MAX_UPGRADE, garageLevel(s).maxUpgrade)) return null;
  const cfg = RACE_UPGRADE_CONFIG[u];
  return { money: rc.value * cfg.cost * UPGRADE_GROWTH ** lvl, part: cfg.part, parts: lvl + 1, racingParts: lvl + 1 };
}

/** Finished components of a kind waiting at the plants (and in the assembly lines' input bays). */
export function partsInStock(s: GameState, c: ComponentId): number {
  let n = 0;
  for (const b of Object.values(s.city.buildings)) {
    if (!b.plant) continue;
    if (b.type === MAKER[c]) n += Math.floor(b.plant.out);
    if (b.type === "assemblyPlant") n += Math.floor(b.plant.inputs[c] ?? 0);
  }
  return n;
}

function takeParts(s: GameState, c: ComponentId, n: number): boolean {
  if (partsInStock(s, c) < n) return false;
  let left = n;
  for (const b of Object.values(s.city.buildings)) {
    if (!b.plant || left <= 0) continue;
    const p = b.plant;
    if (b.type === MAKER[c] && p.out >= 1) {
      const k = Math.min(left, Math.floor(p.out));
      p.outValue -= (p.outValue / p.out) * k;
      p.out -= k;
      left -= k;
    }
    if (left > 0 && b.type === "assemblyPlant" && (p.inputs[c] ?? 0) >= 1) {
      const k = Math.min(left, Math.floor(p.inputs[c] ?? 0));
      p.inputs[c] = (p.inputs[c] ?? 0) - k;
      left -= k;
    }
  }
  return left <= 0;
}

/**
 * Develops a car: costs money and components from the player's own plants
 * (🔧 racing parts won at races can be used instead of the components).
 */
/** Seconds to fit a development level. */
export const installTime = (_s: GameState, lvl: number) => UPGRADE_INSTALL_SEC * lvl;

/** The garage works on the cars: a fitted level counts from now on. */
export function garageTick(s: GameState, dt: number) {
  for (const rc of s.racing.cars) {
    const job = rc.install;
    if (!job) continue;
    job.left -= dt;
    if (job.left <= 0) {
      rc.upgrades[job.u] = Math.min(MAX_UPGRADE, level(rc, job.u) + 1);
      delete rc.install;
    }
  }
}

export function upgradeRaceCar(s: GameState, id: number, u: RaceUpgrade, useRacingParts = false): boolean {
  const rc = raceCar(s, id);
  if (!rc || s.racing.live?.car === id || rc.location === "transit" || rc.install) return false;
  const cost = raceUpgradeCost(s, rc, u);
  if (!cost || s.cash < cost.money) return false;
  if (useRacingParts) {
    if (s.racing.parts < cost.racingParts) return false;
    s.racing.parts -= cost.racingParts;
  } else if (!takeParts(s, cost.part, cost.parts)) return false;
  s.cash -= cost.money;
  // the mechanics fit it: the car is in the garage until the level is in
  const total = installTime(s, level(rc, u) + 1);
  rc.install = { u, left: total, total };
  s.run.upgradesBought += 1;
  s.lifetime.upgradesBought += 1;
  return true;
}

export function setSkin(s: GameState, id: number, skin: string): boolean {
  const rc = raceCar(s, id);
  if (!rc || !s.racing.skins.includes(skin)) return false;
  rc.skin = skin;
  return true;
}

export function signSponsor(s: GameState, id: string | null): boolean {
  if (id === null) {
    s.racing.sponsor = null;
    return true;
  }
  const sp = SPONSOR_BY_ID[id];
  if (!sp || s.racing.rep < sp.minRep || s.racing.sponsor === id) return false;
  s.racing.sponsor = id;
  earn(s, sp.signing);
  return true;
}

// ───────────────────────────── automatic racing ─────────────────────────────

export function setAutoRacing(s: GameState, on: boolean): boolean {
  if (on && garageLevel(s).autoEvery === null) return false;
  s.racing.auto.on = on;
  if (on) s.racing.auto.next = Math.min(s.racing.auto.next, s.racing.clock + 5);
  return true;
}

/** Repairs a car before an automatic race if it is worn and the cash allows. */
function autoRepair(s: GameState, rc: RaceCarState) {
  if (s.racing.auto.repair && condition(rc) < AUTO_REPAIR_BELOW) repairCar(s, rc.id);
}

function autoCar(s: GameState) {
  const sel = raceCar(s, s.racing.selected);
  const ready = (c: RaceCarState) => atTrack(c) && !c.install;
  return sel && ready(sel) ? sel : (s.racing.cars.find(ready) ?? sel ?? s.racing.cars[0] ?? null);
}

/**
 * Advances racing time: unloads delivered cars, finishes the live race,
 * and starts automatic races (shown live on the map) when due.
 */
export function racingTick(s: GameState, dt: number): RaceRecord | null {
  const R = s.racing;
  garageTick(s, dt);
  if (!R.unlocked) return null;
  R.clock += dt;
  while (R.arrivals.length) receiveRaceCar(s, R.arrivals.shift()!);
  let finished: RaceRecord | null = null;
  if (R.live && R.clock >= R.live.startT + raceDuration(R.live)) {
    settleRace(s, R.live);
    finished = R.live;
    R.last = R.live;
    R.live = null;
  }
  const every = garageLevel(s).autoEvery;
  if (R.auto.on && every !== null && !R.live && R.clock >= R.auto.next) {
    R.auto.next = R.clock + every * 60;
    const rc = autoCar(s);
    if (rc) {
      autoRepair(s, rc);
      const ev = bestEventFor(s, rc);
      if (ev) {
        const fee = signUp(s, ev);
        R.live = runRace(s, { event: ev, type: ev.type, track: ev.tracks[0], laps: ev.laps ?? TRACK_BY_ID[ev.tracks[0]].laps }, rc, R.clock);
        R.live.fee = fee;
      }
    }
  }
  return finished;
}

/** Automatic races while away: run and settled at once. */
export function offlineRacing(s: GameState, seconds: number): OfflineRacing | null {
  const R = s.racing;
  if (seconds > 0) garageTick(s, seconds);
  if (!R.unlocked || seconds <= 0) return null;
  // a race still running when the player left finishes first
  if (R.live) {
    settleRace(s, R.live);
    R.last = R.live;
    R.live = null;
  }
  const every = garageLevel(s).autoEvery;
  if (!R.auto.on || every === null) return null;
  const out: OfflineRacing = { races: 0, wins: 0, podiums: 0, prize: 0, rep: 0, repairs: 0 };
  const end = R.clock + seconds;
  while (R.auto.next <= end && out.races < OFFLINE_RACES_MAX) {
    R.clock = Math.max(R.clock, R.auto.next);
    R.auto.next = R.clock + every * 60;
    const rc = autoCar(s);
    if (!rc) break;
    const before = R.stats.repairs;
    autoRepair(s, rc);
    out.repairs += R.stats.repairs - before;
    const ev = bestEventFor(s, rc);
    if (!ev) break;
    const fee = signUp(s, ev);
    out.fees = (out.fees ?? 0) + fee;
    const rec = runRace(s, { event: ev, type: ev.type, track: ev.tracks[0], laps: ev.laps ?? TRACK_BY_ID[ev.tracks[0]].laps }, rc, R.clock);
    rec.fee = fee;
    const rw = settleRace(s, rec);
    R.last = rec;
    out.races += 1;
    if (rw.position === 0) out.wins += 1;
    if (rw.position <= 2) out.podiums += 1;
    out.prize += rw.prize + rw.sponsor;
    out.rep += rw.rep;
  }
  R.clock = Math.max(R.clock, end);
  return out.races ? out : null;
}

/**
 * What automatic racing should bring in per hour with this car: the average
 * of a few simulated races (nothing is changed).
 */
export function expectedHourly(s: GameState, rc: RaceCarState): { money: number; rep: number; winRate: number } | null {
  const every = garageLevel(s).autoEvery;
  const ev = bestEventFor(s, rc);
  if (every === null || !ev) return null;
  const n = 16;
  let money = 0;
  let rep = 0;
  let wins = 0;
  const sponsor = s.racing.sponsor ? (SPONSOR_BY_ID[s.racing.sponsor]?.perRace ?? 0) : 0;
  const probe: GameState = { ...s, racing: { ...s.racing, nextRace: 1_000_000 } };
  for (let i = 0; i < n; i++) {
    probe.racing.nextRace = 1_000_000 + i * 7;
    const rec = runRace(probe, { event: ev, type: ev.type, track: ev.tracks[0], laps: ev.laps ?? TRACK_BY_ID[ev.tracks[0]].laps }, rc, 0);
    const pos = rec.order.indexOf("player");
    money += ev.prize * (PRIZE_SHARE[pos] ?? 0) + sponsor - entryFee(ev);
    rep += ev.rep * (REP_SHARE[pos] ?? 0);
    if (pos === 0) wins++;
  }
  const perHour = 60 / every;
  return { money: (money / n) * perHour, rep: (rep / n) * perHour, winRate: wins / n };
}

// ───────────────────────────── saves ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const isCar = (v: unknown): v is CarId => typeof v === "string" && v in CAR_BY_ID;

/** Rebuilds a valid RacingState from whatever a save contained (anything odd is dropped). */
export function migrateRacing(raw: unknown): RacingState {
  const R = createRacing();
  if (!isObj(raw)) return R;
  R.unlocked = raw.unlocked === true;
  R.clock = Math.max(0, num(raw.clock));
  R.garage = Math.max(1, Math.min(GARAGE_LEVELS.length, Math.floor(num(raw.garage, 1))));
  R.rep = Math.max(0, num(raw.rep));
  R.parts = Math.max(0, Math.floor(num(raw.parts)));
  R.nextCar = Math.max(1, Math.floor(num(raw.nextCar, 1)));
  R.nextRace = Math.max(1, Math.floor(num(raw.nextRace, 1)));
  if (isObj(raw.trophies)) for (const k of ["bronze", "silver", "gold"] as Trophy[]) R.trophies[k] = Math.max(0, Math.floor(num(raw.trophies[k])));
  if (Array.isArray(raw.skins)) R.skins = [...new Set(["factory", ...raw.skins.filter((x): x is string => typeof x === "string")])];
  R.sponsor = typeof raw.sponsor === "string" && SPONSOR_BY_ID[raw.sponsor] ? raw.sponsor : null;
  if (Array.isArray(raw.orders)) R.orders = raw.orders.filter(isCar);
  if (Array.isArray(raw.arrivals)) R.arrivals = raw.arrivals.filter(isCar);
  if (isObj(raw.wins)) for (const [k, v] of Object.entries(raw.wins)) R.wins[k] = Math.max(0, Math.floor(num(v)));
  if (isObj(raw.cooldowns)) for (const [k, v] of Object.entries(raw.cooldowns)) if (RACE_EVENT_BY_ID[k]) R.cooldowns[k] = num(v);
  if (isObj(raw.auto)) R.auto = { on: raw.auto.on === true, next: num(raw.auto.next), repair: raw.auto.repair !== false };
  if (isObj(raw.stats)) {
    const st = raw.stats;
    R.stats = { races: num(st.races), wins: num(st.wins), podiums: num(st.podiums), prize: num(st.prize), repairs: num(st.repairs), fees: num(st.fees), titles: num(st.titles), best: {} };
    if (isObj(st.best)) for (const [k, v] of Object.entries(st.best)) if (k in TRACK_BY_ID && num(v) > 0) R.stats.best[k] = num(v);
  }
  if (Array.isArray(raw.cars))
    for (const c of raw.cars) {
      if (!isObj(c) || !isCar(c.car)) continue;
      const wear = isObj(c.wear) ? c.wear : {};
      const ups = isObj(c.upgrades) ? c.upgrades : {};
      const grades = isObj(c.grades) ? c.grades : {};
      R.cars.push({
        id: Math.max(1, Math.floor(num(c.id, R.nextCar))),
        car: c.car,
        grades: Object.fromEntries(Object.entries(grades).filter(([k, v]) => k in MAKER && num(v) >= 0).map(([k, v]) => [k, Math.min(5, Math.floor(num(v)))])),
        hp: Math.max(1, num(c.hp, CAR_BY_ID[c.car].hp)),
        quality: num(c.quality, 50),
        design: num(c.design, CAR_BY_ID[c.car].design),
        value: Math.max(0, num(c.value, carListPrice(CAR_BY_ID[c.car], recipeOf(CAR_BY_ID[c.car])))),
        upgrades: Object.fromEntries(RACE_UPGRADES.map((u) => [u, Math.max(0, Math.min(MAX_UPGRADE, Math.floor(num(ups[u]))))])),
        wear: Object.fromEntries(WEAR_PARTS.map((p) => [p, Math.max(0.05, Math.min(1, num(wear[p], 1)))])) as RaceCarState["wear"],
        skin: typeof c.skin === "string" && R.skins.includes(c.skin) ? c.skin : "factory",
        races: Math.max(0, num(c.races)),
        wins: Math.max(0, num(c.wins)),
        built: num(c.built, 0),
        location: c.location === "factory" || c.location === "transit" || c.location === "showroom" ? c.location : "racing",
        ...(isObj(c.listing) && typeof c.listing.dealer === "string" && c.listing.dealer in DEALER_BY_ID && num(c.listing.price) > 0
          ? { listing: { price: num(c.listing.price), dealer: c.listing.dealer as DealerId, since: Math.max(0, num(c.listing.since)) } }
          : {}),
        ...(typeof c.home === "string" ? { home: c.home } : {}),
        mileage: Math.max(0, num(c.mileage)),
        podiums: Math.max(0, num(c.podiums)),
        ...(num(c.bestLap, 0) > 0 ? { bestLap: num(c.bestLap) } : {}),
        history: Array.isArray(c.history) ? c.history.filter(isObj).filter((h) => typeof h.event === "string").map((h) => ({ event: h.event as string, pos: Math.max(0, Math.floor(num(h.pos))) })).slice(-12) : [],
        ...(isObj(c.test) ? { test: c.test as unknown as RaceCarState["test"] } : {}),
        ...(isObj(c.install) && RACE_UPGRADES.includes(c.install.u as RaceUpgrade) ? { install: { u: c.install.u as RaceUpgrade, left: Math.max(0, num(c.install.left)), total: Math.max(1, num(c.install.total, 1)) } } : {}),
      });
    }
  R.nextCar = Math.max(R.nextCar, ...R.cars.map((c) => c.id + 1));
  const sel = num(raw.selected, -1);
  R.selected = R.cars.some((c) => c.id === sel) ? sel : (R.cars[0]?.id ?? null);
  if (isObj(raw.championship) && typeof raw.championship.event === "string" && RACE_EVENT_BY_ID[raw.championship.event]) {
    const ch = raw.championship;
    const pts = isObj(ch.points) ? ch.points : {};
    const names = isObj(ch.names) ? ch.names : {};
    R.championship = {
      event: ch.event as string,
      round: Math.max(0, Math.min(RACE_EVENT_BY_ID[ch.event as string].tracks.length - 1, Math.floor(num(ch.round)))),
      points: Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, Math.max(0, num(v))])),
      names: Object.fromEntries(
        Object.entries(names)
          .filter(([, v]) => isObj(v))
          .map(([k, v]) => [k, { driver: String((v as Json).driver ?? ""), team: typeof (v as Json).team === "string" ? ((v as Json).team as string) : null }]),
      ),
    };
  }
  // a race that was running is replayed from its record (it is pure data)
  for (const key of ["live", "last"] as const) {
    const rec = raw[key];
    if (isObj(rec) && typeof rec.event === "string" && RACE_EVENT_BY_ID[rec.event] && Array.isArray(rec.entrants) && Array.isArray(rec.order) && typeof rec.track === "string" && rec.track in TRACK_BY_ID) {
      R[key] = rec as unknown as RaceRecord;
    }
  }
  if (R.live && !R.cars.some((c) => c.id === R.live!.car)) R.live = null;
  return R;
}
