"use client";

// 🏁 The Racing District: races and championships, the garage (race cars,
// repairs, liveries, sending cars from the assembly lines), racing
// development, and the team — reputation, sponsors, automatic racing.
import { SeasonCard } from "./live-cards";
import { useState } from "react";
import { CAR_BY_ID } from "@/game/config/cars";
import {
  GARAGE_LEVELS,
  RACE_EVENTS,
  RACE_UPGRADES,
  RACE_UPGRADE_CONFIG,
  REP_TIERS,
  SKINS,
  SPECIAL_EVENTS,
  SPONSORS,
  TRACK_BY_ID,
  type RaceEventConfig,
} from "@/game/config/racing";
import {
  activeSpecials,
  carRating,
  classOf,
  condition,
  atTrack,
  carStats,
  contractStatus,
  eventLock,
  installTime,
  weatherAt,
  wetPace,
  expectedHourly,
  garageLevel,
  garageUpgradeCost,
  nextRepTier,
  orderableCars,
  partsInStock,
  raceCar,
  raceUpgradeCost,
  racingBlocker,
  racingCost,
  racingFleet,
  referenceRating,
  repairCost,
  repTier,
  standings,
} from "@/game/engine/racing";
import { carEta, carTrip } from "@/game/engine/chain";
import { raceClock } from "@/game/racing/tracks";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { GameState } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { CostButton } from "../game/cost-button";
import { StatBars, lockText, raceName, trackName } from "../racing/race-viewer";
import { ViewHeader } from "./section-title";

type Tab = "races" | "garage" | "dev" | "team";

export function RacingView() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("races");
  const R = state.racing;
  if (!R.unlocked) return <Locked />;
  const tier = repTier(R.rep);
  const next = nextRepTier(R.rep);
  return (
    <div className="space-y-3 pb-2">
      <ViewHeader icon="🏁" title={t("racing.district")} subtitle={t("racing.subtitle")}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label={t("racing.reputation")} value={`${tier.emoji} ${formatNumber(Math.floor(R.rep))}`} sub={t(`race.tier.${tier.id}` as MessageKey)} />
          <Metric label={t("racing.trophies")} value={`🥇${R.trophies.gold} 🥈${R.trophies.silver} 🥉${R.trophies.bronze}`} sub={t("racing.winsOf", { w: R.stats.wins, n: R.stats.races })} />
          <Metric label={t("racing.prizeTotal")} value={formatMoney(R.stats.prize)} sub={`🔧 ${R.parts} ${t("racing.parts")}`} gold />
        </div>
        {next && (
          <div className="mt-2">
            <div className="mb-0.5 flex justify-between text-[10px] text-white/45">
              <span>{t(`race.tier.${tier.id}` as MessageKey)}</span>
              <span>
                {next.emoji} {t(`race.tier.${next.id}` as MessageKey)} · {formatNumber(next.min)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${Math.min(100, ((R.rep - tier.min) / (next.min - tier.min)) * 100)}%` }} />
            </div>
          </div>
        )}
      </ViewHeader>

      <LiveBanner />

      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
        {(["races", "garage", "dev", "team"] as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-xl py-2 text-[11px] font-black uppercase tracking-wide", tab === k ? "bg-gold text-black" : "text-white/60")}>
            {t(`racing.tab.${k}` as MessageKey)}
          </button>
        ))}
      </div>

      {tab === "races" && <Races />}
      {tab === "garage" && <Garage />}
      {tab === "dev" && <Development />}
      {tab === "team" && <Team />}
    </div>
  );
}

function Metric({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.05] px-1.5 py-2 ring-1 ring-white/[0.06]">
      <div className="truncate text-[9px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn("truncate text-sm font-black tabular-nums", gold && "text-gold")}>{value}</div>
      {sub && <div className="truncate text-[9px] text-white/45">{sub}</div>}
    </div>
  );
}

/** Before the district is built: what it is and what it takes. */
function Locked() {
  const state = useGame((g) => g.state);
  const unlock = useGame((g) => g.unlockRacing);
  const { t } = useT();
  const blocker = racingBlocker(state);
  return (
    <div className="space-y-3">
      <ViewHeader icon="🏁" title={t("racing.district")} subtitle={t("racing.districtDesc")} />
      <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 text-[12px] text-white/70 ring-1 ring-white/[0.07]">
        <p>{t("racing.pitch1")}</p>
        <p>{t("racing.pitch2")}</p>
        <p className="font-bold text-gold/90">{t("racing.pitch3")}</p>
      </div>
      {blocker === "firstCar" && <p className="text-center text-xs text-amber-300">{t("racing.blocker.firstCar")}</p>}
      {!state.city.zones.includes("industrial") && <p className="text-center text-[11px] text-white/50">{t("racing.withIndustrial")}</p>}
      <CostButton className="w-full" cost={blocker === "firstCar" ? null : racingCost(state)} onBuy={unlock} label={`🏁 ${t("racing.build")}`} />
    </div>
  );
}

/** A race in progress: where the player is, and a button to watch. */
function LiveBanner() {
  const live = useGame((g) => g.state.racing.live);
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  if (!live) return null;
  return (
    <button onClick={() => setRace({ phase: "watch" })} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-red-600/30 to-gold/20 p-3 text-left ring-1 ring-red-400/40">
      <span className="relative flex size-3">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex size-3 rounded-full bg-red-500" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">{t("racing.liveNow")}</div>
        <div className="truncate text-sm font-black">{raceName(t, live.event, live.special)}</div>
      </div>
      <span className="rounded-full bg-gold px-3 py-1.5 text-xs font-black text-black">👁️ {t("racing.watch")}</span>
    </button>
  );
}

// ───────────────────────────── races ─────────────────────────────

function Races() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const specials = specialsNow();
  const ch = state.racing.championship;
  const car = raceCar(state, state.racing.selected);
  return (
    <div className="space-y-2">
      {(!car || !atTrack(car)) && <NoCarHint />}
      <Forecast />
      {specials.length > 0 && (
        <>
          <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-fuchsia-300/80">✨ {t("racing.specials")}</div>
          {specials.map((sp) => (
            <EventCard key={sp.id} ev={eventOf(sp.base)} special={sp.id} />
          ))}
        </>
      )}
      {ch && <ChampionshipCard />}
      <SeasonCard />
      <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/45">{t("racing.events")}</div>
      {RACE_EVENTS.map((ev) => (
        <EventCard key={ev.id} ev={ev} />
      ))}
      <p className="px-1 text-center text-[11px] text-white/40">🌍 {t("racing.goal")}</p>
    </div>
  );
}

const eventOf = (id: string) => RACE_EVENTS.find((e) => e.id === id)!;
/** Special events on today (by the device clock). */
const specialsNow = () => activeSpecials(new Date().getTime());

/** The weather at the circuits: rain takes pace, less from a car with grip. */
function Forecast() {
  const state = useGame((g) => g.state);
  const { t } = useT();
  const w = weatherAt(state);
  const car = raceCar(state, state.racing.selected);
  const label = t(w.wet ? "racing.weather.wet" : "racing.weather.dry");
  const left = `${Math.floor(w.left / 60)}:${String(Math.floor(w.left % 60)).padStart(2, "0")}`;
  return (
    <div className={cn("rounded-2xl p-3 text-[11px] ring-1", w.wet ? "bg-sky-500/10 text-sky-100 ring-sky-400/30" : "bg-white/[0.03] text-white/60 ring-white/[0.07]")}>
      {t("racing.weather.hint", { w: label, time: left })}
      {w.wet && car && <div className="mt-1 font-bold">{t("racing.weather.pace", { p: formatPercent(wetPace(carStats(car))) })}</div>}
    </div>
  );
}

function NoCarHint() {
  const state = useGame((g) => g.state);
  const sendCar = useGame((g) => g.sendCar);
  const { t } = useT();
  const cars = state.racing.cars;
  // the company has cars, just not at the paddock: a transporter brings one over
  const away = cars.length > 0 && !cars.some(atTrack);
  const rc = away ? (cars.find((c) => c.location !== "transit") ?? null) : null;
  const trip = rc && carTrip(state, rc, "racing");
  const eta = away && !rc ? carEta(state, cars[0].id) : null;
  if (!away) return <div className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-100 ring-1 ring-amber-400/30">🚛 {t("racing.noCarHint")}</div>;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-100 ring-1 ring-amber-400/30">
      <span className="flex-1">{eta ? t("mycars.eta", { to: t("mycars.loc.paddock"), time: `${Math.ceil(eta.left)}s` }) : t("mycars.awayHint")}</span>
      {rc && trip && (
        <button disabled={state.cash < trip.fee} onClick={() => sendCar(rc.id, "racing")} className="shrink-0 rounded-lg bg-gold/20 px-2 py-1 text-[11px] font-bold text-gold ring-1 ring-gold/40 disabled:opacity-40">
          {t("mycars.send.racing", { fee: formatMoney(trip.fee) })}
        </button>
      )}
    </div>
  );
}

function EventCard({ ev, special }: { ev: RaceEventConfig; special?: string }) {
  const state = useGame((g) => g.state);
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  const car = raceCar(state, state.racing.selected);
  const lock = eventLock(state, ev, car);
  const sp = special ? SPECIAL_EVENTS.find((s) => s.id === special) : undefined;
  const mult = sp?.mult ?? 1;
  const champ = ev.type === "championship";
  const round = champ && state.racing.championship?.event === ev.id ? state.racing.championship.round : 0;
  const repLocked = lock?.kind === "rep";
  // how the player's car compares with this field (rating vs the rivals' reference)
  const mine = car ? carRating(car, ev.type) : 0;
  const ref = referenceRating(ev);
  const odds = mine && !lock ? (mine >= ref * 1.04 ? "fav" : mine >= ref * 0.97 ? "even" : "hard") : null;
  return (
    <div className={cn("rounded-2xl p-3 ring-1", sp ? "bg-fuchsia-500/10 ring-fuchsia-400/30" : repLocked ? "bg-white/[0.02] ring-white/[0.05] opacity-60" : "bg-white/[0.04] ring-white/[0.08]")}>
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{sp?.emoji ?? ev.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-black">{raceName(t, ev.id, special)}</span>
            {sp && <span className="rounded bg-fuchsia-500/30 px-1 text-[9px] font-black">×{mult}</span>}
          </div>
          <div className="text-[11px] text-white/55">
            {t(`race.type.${ev.type}` as MessageKey)} · {champ ? t("racing.rounds", { n: ev.tracks.length }) : `${TRACK_BY_ID[ev.tracks[0]].emoji} ${trackName(t, ev.tracks[0])}`} · {t("racing.laps", { n: ev.laps ?? TRACK_BY_ID[ev.tracks[0]].laps })}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            {ev.classes.map((c) => (
              <span key={c} className="rounded bg-white/10 px-1.5 font-black">
                {t("racing.classN", { c })}
              </span>
            ))}
            <span className="rounded bg-white/10 px-1.5">👥 {ev.field}</span>
            <span className="rounded bg-emerald-500/15 px-1.5 font-bold text-emerald-200">
              🥇 {formatMoney(ev.prize * mult)}
              {champ && ` (${t("racing.title")})`}
            </span>
            <span className="rounded bg-sky-500/15 px-1.5 font-bold text-sky-200">⭐ +{formatNumber(Math.round(ev.rep * mult))}</span>
            {ev.trophy && <span className="rounded bg-gold/15 px-1.5 text-gold">🏆 {t(`race.trophy.${ev.trophy}` as MessageKey)}</span>}
            {odds && <span className={cn("rounded px-1.5 font-bold", odds === "fav" ? "bg-emerald-500/20 text-emerald-200" : odds === "even" ? "bg-amber-500/20 text-amber-200" : "bg-rose-500/20 text-rose-200")}>{t(`racing.odds.${odds}` as MessageKey)}</span>}
          </div>
          {champ && round > 0 && <div className="mt-1 text-[10px] text-gold/80">{t("racing.round", { n: round + 1, of: ev.tracks.length })}</div>}
        </div>
      </div>
      <button
        disabled={lock !== null}
        onClick={() => setRace({ phase: "prep", event: ev.id, special })}
        className="mt-2 w-full rounded-xl bg-gradient-to-b from-gold to-gold-deep py-2 text-xs font-black uppercase tracking-wider text-black disabled:from-white/10 disabled:to-white/5 disabled:text-white/45"
      >
        {lock ? lockText(t, lock) : `🏁 ${t("racing.enter")}`}
      </button>
    </div>
  );
}

function ChampionshipCard() {
  const state = useGame((g) => g.state);
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  const ch = state.racing.championship!;
  const ev = eventOf(ch.event);
  const table = standings(state);
  return (
    <div className="rounded-2xl bg-gold/10 p-3 ring-1 ring-gold/40">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-black">
          {ev.emoji} {raceName(t, ev.id)}
        </div>
        <div className="text-[11px] text-gold">{t("racing.round", { n: ch.round + 1, of: ev.tracks.length })}</div>
      </div>
      <div className="mb-2 flex gap-1">
        {ev.tracks.map((tr, i) => (
          <div key={i} className={cn("flex-1 rounded-md py-1 text-center text-[10px]", i < ch.round ? "bg-emerald-500/20" : i === ch.round ? "bg-gold/30 font-black" : "bg-white/5")}>
            {i === ev.tracks.length - 1 ? "🏆" : TRACK_BY_ID[tr].emoji} {i === ev.tracks.length - 1 ? t("racing.final") : i + 1}
          </div>
        ))}
      </div>
      <div className="space-y-0.5">
        {table.slice(0, 8).map((r, i) => (
          <div key={r.id} className={cn("flex items-center gap-2 rounded px-2 py-0.5 text-[11px]", r.id === "player" ? "bg-gold/20 font-black" : "bg-white/[0.03]")}>
            <span className="w-4 text-right">{i + 1}</span>
            <span className="flex-1 truncate">{r.id === "player" ? t("racing.you") : r.driver}</span>
            <span className="tabular-nums">{r.pts}</span>
          </div>
        ))}
      </div>
      <button onClick={() => setRace({ phase: "prep", event: ev.id })} disabled={!!state.racing.live} className="mt-2 w-full rounded-xl bg-gradient-to-b from-gold to-gold-deep py-2 text-xs font-black uppercase text-black disabled:opacity-40">
        🏁 {ch.round === ev.tracks.length - 1 ? t("racing.final") : t("racing.nextRound")}
      </button>
    </div>
  );
}

// ───────────────────────────── garage ─────────────────────────────

function Garage() {
  const state = useGame((g) => g.state);
  const { upgradeRacingGarage, orderRaceCar, cancelRaceOrder, sendCar } = useGame.getState();
  const { t } = useT();
  const R = state.racing;
  const lv = garageLevel(state);
  const cost = garageUpgradeCost(state);
  const next = GARAGE_LEVELS[R.garage];
  const orderable = orderableCars(state);
  const full = racingFleet(state) >= lv.slots;
  const name = R.garage >= 10 ? t("racing.garageHQ") : R.garage >= 5 ? t("racing.garagePro") : t("racing.garageSmall");
  return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-black">🏠 {name}</div>
            <div className="text-[11px] text-white/55">{t("racing.garageLv", { n: R.garage, slots: lv.slots, max: lv.maxUpgrade })}</div>
          </div>
          <div className="text-right text-[10px] text-white/50">
            {lv.autoEvery ? t("racing.autoEvery", { m: lv.autoEvery }) : t("racing.noAuto")}
            <br />
            {lv.repairDiscount > 0 && t("racing.repairDiscount", { pct: formatPercent(lv.repairDiscount) })}
          </div>
        </div>
        {next && (
          <CostButton
            className="mt-2 w-full"
            cost={cost}
            onBuy={upgradeRacingGarage}
            label={t("racing.garageUp", { n: next.level, slots: next.slots, max: next.maxUpgrade })}
          />
        )}
      </div>

      {R.cars.filter(atTrack).map((c) => (
        <RaceCarCard key={c.id} id={c.id} />
      ))}

      {/* cars of the collection away from the paddock: a transporter brings them over */}
      {R.cars.some((c) => !atTrack(c)) && (
        <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 text-xs ring-1 ring-white/[0.07]">
          {R.cars
            .filter((c) => !atTrack(c))
            .map((c) => {
              const trip = carTrip(state, c, "racing");
              const eta = carEta(state, c.id);
              return (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {CAR_BY_ID[c.car].emoji} {state.designs[c.car].name} — {eta
                      ? t("mycars.eta", { to: t(eta.to === "racing" ? "mycars.loc.paddock" : eta.to === "showroom" ? "mycars.loc.showroom" : "mycars.loc.factory"), time: `${Math.ceil(eta.left)}s` })
                      : t(c.location === "showroom" ? "mycars.loc.showroom" : "mycars.loc.factory")}
                  </span>
                  {trip && (
                    <button disabled={state.cash < trip.fee} onClick={() => sendCar(c.id, "racing")} className="shrink-0 rounded-lg bg-gold/20 px-2 py-1 text-[11px] font-bold text-gold ring-1 ring-gold/40 disabled:opacity-40">
                      {t("mycars.send.racing", { fee: formatMoney(trip.fee) })}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* cars on their way and sending a new one */}
      {(R.orders.length > 0 || R.arrivals.length > 0) && (
        <div className="space-y-1 rounded-2xl bg-sky-500/10 p-3 text-xs ring-1 ring-sky-400/30">
          {R.orders.map((car, i) => (
            <div key={i} className="flex items-center justify-between">
              <span>
                🏭 {CAR_BY_ID[car].emoji} {state.designs[car].name} — {t("racing.ordered")}
              </span>
              <button onClick={() => cancelRaceOrder(car)} className="text-[10px] text-white/50 underline">
                {t("common.cancel")}
              </button>
            </div>
          ))}
          {R.arrivals.map((car, i) => (
            <div key={`a${i}`}>🚛 {CAR_BY_ID[car].emoji} {state.designs[car].name}</div>
          ))}
          {state.chain.shipments.filter((sh) => sh.to === "r:paddock" && !sh.back).map((sh) => (
            <div key={sh.id}>🚛 {t("racing.onTheWay", { pct: formatPercent(Math.min(1, sh.t / sh.dur)) })}</div>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">🚛 {t("racing.sendCar")}</div>
        <p className="mb-2 text-[11px] text-white/50">{t("racing.sendHint")}</p>
        {orderable.length === 0 && <p className="text-[11px] text-amber-300">{t("racing.noModels")}</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {orderable.map((car) => {
            const building = Object.values(useGame.getState().snap.chain.plants).some((p) => p.car?.id === car);
            return (
              <button
                key={car}
                disabled={full}
                onClick={() => orderRaceCar(car)}
                className="rounded-xl bg-white/[0.06] p-2 text-left text-[11px] ring-1 ring-white/10 disabled:opacity-40"
              >
                <div className="font-bold">
                  {CAR_BY_ID[car].emoji} {state.designs[car].name}
                </div>
                <div className="text-white/45">
                  {t("racing.classN", { c: classOf(car) })} · {building ? t("racing.inProduction") : t("racing.notInProduction")}
                </div>
              </button>
            );
          })}
        </div>
        {full && <p className="mt-1 text-[10px] text-white/45">{t("racing.garageFull")}</p>}
      </div>
    </div>
  );
}

function RaceCarCard({ id }: { id: number }) {
  const state = useGame((g) => g.state);
  const { repairRaceCar, selectRaceCar, setRaceSkin, retireRaceCar } = useGame.getState();
  const { t } = useT();
  const car = raceCar(state, id)!;
  const selected = state.racing.selected === id;
  const racing = state.racing.live?.car === id;
  const cost = repairCost(state, car);
  return (
    <div className={cn("space-y-2 rounded-2xl p-1", selected && "ring-2 ring-gold/60")}>
      <StatBars state={state} id={id} type="circuit" />
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {!selected && (
          <button onClick={() => selectRaceCar(id)} className="rounded-lg bg-gold px-2.5 py-1 text-[11px] font-black text-black">
            {t("racing.select")}
          </button>
        )}
        {selected && <span className="rounded-lg bg-gold/20 px-2 py-1 text-[11px] font-bold text-gold">★ {t("racing.selected")}</span>}
        <span className="text-[10px] text-white/45">
          🏁 {car.races} · 🏆 {car.wins}
        </span>
        <span className="flex-1" />
        <button onClick={() => retireRaceCar(id)} disabled={racing} className="text-[10px] text-white/40 underline disabled:opacity-30">
          {t("racing.retire")}
        </button>
      </div>
      {condition(car) < 1 && (
        <CostButton className="w-full" cost={racing ? null : cost} onBuy={() => repairRaceCar(id)} label={`🔧 ${t("racing.repair")} · ${formatPercent(condition(car))}`} />
      )}
      {state.racing.skins.length > 1 && (
        <div className="flex flex-wrap gap-1 px-1">
          {state.racing.skins.map((sk) => (
            <button key={sk} onClick={() => setRaceSkin(id, sk)} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1", car.skin === sk ? "bg-white/20 ring-white/60" : "bg-white/5 ring-white/10")}>
              <span className="size-2.5 rounded-full ring-1 ring-white/40" style={{ background: SKINS[sk]?.color || CAR_BY_ID[car.car].color }} />
              {SKINS[sk]?.emoji} {t(`race.skin.${sk}` as MessageKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── development ─────────────────────────────

function Development() {
  const state = useGame((g) => g.state);
  const { upgradeRaceCar } = useGame.getState();
  const { t } = useT();
  const car = raceCar(state, state.racing.selected);
  if (!car) return <NoCarHint />;
  const max = garageLevel(state).maxUpgrade;
  return (
    <div className="space-y-2">
      <StatBars state={state} id={car.id} type="circuit" />
      {car.install && (
        <div className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-100 ring-1 ring-amber-400/30">
          {t("racing.fitting", { u: t(`race.up.${car.install.u}` as MessageKey), time: `${Math.ceil(car.install.left)}s` })}
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.round((1 - car.install.left / car.install.total) * 100)}%` }} />
          </div>
        </div>
      )}
      <p className="px-1 text-[11px] text-white/50">
        {t("racing.devHint", { max })} {t("racing.relCost")}
      </p>
      {RACE_UPGRADES.map((u) => {
        const cfg = RACE_UPGRADE_CONFIG[u];
        const lvl = car.upgrades[u] ?? 0;
        const cost = raceUpgradeCost(state, car, u);
        const have = cost ? partsInStock(state, cost.part) : 0;
        const effect = Object.entries(cfg.effect)
          .map(([k, v]) => (k === "hp" ? `+${formatPercent(v)} HP` : k === "weight" ? `${formatPercent(v)} kg` : `${v > 0 ? "+" : ""}${v} ${t(`race.stat.${k}` as MessageKey)}`))
          .join(" · ");
        return (
          <div key={u} className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black">
                {cfg.emoji} {t(`race.up.${u}` as MessageKey)}
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={cn("h-2 w-4 rounded-sm", i < lvl ? "bg-gold" : i < max ? "bg-white/15" : "bg-white/5")} />
                ))}
              </div>
            </div>
            <div className="text-[11px] text-emerald-200/80">
              {effect} / {t("racing.perLevel")}
              {cost && <span className="text-white/40"> · ⏱ {t("racing.installTime", { time: `${installTime(state, lvl + 1)}s` })}</span>}
            </div>
            {cost ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  disabled={state.cash < cost.money || have < cost.parts || state.racing.live?.car === car.id || !!car.install}
                  onClick={() => upgradeRaceCar(car.id, u)}
                  className="rounded-xl bg-gold px-2 py-2 text-[11px] font-black text-black disabled:bg-white/10 disabled:text-white/40"
                >
                  {formatMoney(cost.money)}
                  <div className="text-[10px] font-bold opacity-80">
                    + {cost.parts}× {t(`item.${cost.part}` as MessageKey)} ({have})
                  </div>
                </button>
                <button
                  disabled={state.cash < cost.money || state.racing.parts < cost.racingParts || state.racing.live?.car === car.id || !!car.install}
                  onClick={() => upgradeRaceCar(car.id, u, true)}
                  className="rounded-xl bg-white/10 px-2 py-2 text-[11px] font-black ring-1 ring-white/15 disabled:opacity-40"
                >
                  {formatMoney(cost.money)}
                  <div className="text-[10px] font-bold opacity-80">
                    + 🔧 {cost.racingParts} ({state.racing.parts})
                  </div>
                </button>
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-white/40">{lvl >= 5 ? t("racing.maxed") : t("racing.needGarage")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── team ─────────────────────────────

function Team() {
  const state = useGame((g) => g.state);
  const { signSponsor, setAutoRacing, setAutoRepair } = useGame.getState();
  const contract = contractStatus(state);
  const { t } = useT();
  const R = state.racing;
  const lv = garageLevel(state);
  const car = raceCar(state, R.selected);
  const est = car ? expectedHourly(state, car) : null;
  return (
    <div className="space-y-2">
      {/* automatic racing */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black">🤖 {t("racing.auto")}</div>
            <div className="text-[11px] text-white/55">{lv.autoEvery ? t("racing.autoHint", { m: lv.autoEvery }) : t("racing.autoLocked")}</div>
          </div>
          <Toggle on={R.auto.on} disabled={!lv.autoEvery || !car} onChange={(v) => setAutoRacing(v)} />
        </div>
        {est && lv.autoEvery && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <Mini label={t("racing.perHour")} value={formatMoney(est.money)} />
            <Mini label={t("racing.repPerHour")} value={`+${formatNumber(Math.round(est.rep))}`} />
            <Mini label={t("racing.winRate")} value={formatPercent(est.winRate)} />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-white/60">🔧 {t("racing.autoRepair")}</span>
          <Toggle on={R.auto.repair} onChange={setAutoRepair} />
        </div>
      </div>

      {/* sponsors */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">🤝 {t("racing.sponsors")}</div>
        <p className="mb-2 text-[10px] text-white/45">{t("sponsorContract.note")}</p>
        <div className="space-y-1.5">
          {SPONSORS.map((sp) => {
            const locked = R.rep < sp.minRep;
            const active = R.sponsor === sp.id;
            return (
              <div key={sp.id} className={cn("flex items-center gap-2 rounded-xl p-2 ring-1", active ? "bg-emerald-500/15 ring-emerald-400/40" : locked ? "bg-white/[0.02] opacity-50 ring-white/5" : "bg-white/[0.04] ring-white/10")}>
                <div className="flex size-9 items-center justify-center rounded-lg text-lg" style={{ background: sp.color }}>
                  {sp.logo}
                </div>
                <div className="min-w-0 flex-1 text-[11px]">
                  <div className="font-black">{sp.name}</div>
                  <div className="text-white/55">
                    {t("racing.sponsorTerms", { race: formatMoney(sp.perRace), sign: R.signed.includes(sp.id) ? "—" : formatMoney(sp.signing) })}
                  </div>
                  <div className="text-white/45">
                    📜 {t(`sponsorContract.goal.${sp.contract.goal}`, { n: sp.contract.target, h: sp.contract.hours })} → {formatMoney(sp.contract.bonus)}
                  </div>
                  {active && contract && (
                    <div className="mt-1">
                      <div className="flex justify-between font-bold text-emerald-200">
                        <span>
                          {contract.progress}/{contract.target}
                        </span>
                        <span>{t("sponsorContract.left", { time: formatDuration(contract.left) })}</span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(contract.progress / contract.target) * 100}%` }} />
                      </div>
                      {(R.contract?.met ?? 0) > 0 && <div className="text-white/45">{t("sponsorContract.met", { n: R.contract!.met })}</div>}
                    </div>
                  )}
                </div>
                {active ? (
                  <span className="text-[10px] font-bold text-emerald-300">✓ {t("racing.signed")}</span>
                ) : locked ? (
                  <span className="text-[10px] text-white/45">⭐ {formatNumber(sp.minRep)}</span>
                ) : (
                  <button onClick={() => signSponsor(sp.id)} className="rounded-lg bg-gold px-2.5 py-1 text-[11px] font-black text-black">
                    {t("racing.sign")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* reputation ladder */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">⭐ {t("racing.reputation")}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {REP_TIERS.map((tier) => (
            <div key={tier.id} className={cn("rounded-xl p-2 text-center ring-1", R.rep >= tier.min ? "bg-gold/15 ring-gold/40" : "bg-white/[0.03] ring-white/[0.06]")}>
              <div className="text-xl">{tier.emoji}</div>
              <div className="text-[10px] font-black">{t(`race.tier.${tier.id}` as MessageKey)}</div>
              <div className="text-[9px] text-white/45">{formatNumber(tier.min)}</div>
            </div>
          ))}
        </div>
      </div>

      <TeamStats state={state} />
    </div>
  );
}

function TeamStats({ state }: { state: GameState }) {
  const { t } = useT();
  const st = state.racing.stats;
  const rows: [string, string][] = [
    [t("racing.st.races"), formatNumber(st.races)],
    [t("racing.st.wins"), formatNumber(st.wins)],
    [t("racing.st.podiums"), formatNumber(st.podiums)],
    [t("racing.st.titles"), formatNumber(st.titles)],
    [t("racing.st.prize"), formatMoney(st.prize)],
    [t("racing.st.repairs"), formatMoney(st.repairs)],
  ];
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">📊 {t("racing.stats")}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-white/55">{k}</span>
            <b className="tabular-nums">{v}</b>
          </div>
        ))}
      </div>
      {Object.keys(st.best).length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2 text-[11px]">
          <div className="text-white/45">⏱️ {t("racing.bestLaps")}</div>
          {Object.entries(st.best).map(([tr, sec]) => (
            <div key={tr} className="flex justify-between">
              <span>
                {TRACK_BY_ID[tr as keyof typeof TRACK_BY_ID].emoji} {trackName(t, tr as keyof typeof TRACK_BY_ID)}
              </span>
              <b className="tabular-nums">{raceClock(sec)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-1 py-1.5">
      <div className="truncate text-[9px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="truncate text-xs font-black tabular-nums">{value}</div>
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-30", on ? "bg-emerald-500" : "bg-white/15")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.4rem]" : "left-0.5")} />
    </button>
  );
}
