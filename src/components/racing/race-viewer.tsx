"use client";

// The race viewer: RACE PREPARATION (your car against the rivals), then the
// race itself — 3, 2, 1, GO!, the cars on a full circuit with a timing
// tower and three cameras — and the results with the podium. Closing it
// never stops a race: it keeps running on the map.
import { Camera, Eye, Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CAR_BY_ID } from "@/game/config/cars";
import { RACE_COUNTDOWN, RACE_EVENT_BY_ID, RIVAL_BY_ID, SPECIAL_EVENTS, TRACK_BY_ID, type TrackId } from "@/game/config/racing";
import { carRating, carStats, classOf, condition, entryFee, eventLock, raceCar, rivalsFor, setupFor } from "@/game/engine/racing";
import { raceClock, runningOrder, type CarOnTrack } from "@/game/racing/tracks";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { GameState, RaceRecord } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { RaceCanvas, type CameraMode } from "./race-canvas";

export const raceName = (t: (k: MessageKey) => string, event: string, special?: string) => (special ? t(`race.sp.${special}` as MessageKey) : t(`race.ev.${event}` as MessageKey));
export const trackName = (t: (k: MessageKey) => string, id: TrackId) => t(`race.track.${id}` as MessageKey);

export function RaceViewer() {
  const race = useUi((u) => u.race);
  if (!race) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#05080f] text-white">
      {race.phase === "prep" ? <RacePrep event={race.event} special={race.special} /> : <RaceWatch />}
    </div>
  );
}

/** A canvas that renders a RaceCanvas (created per track / race). */
function useRaceCanvas(track: TrackId, rec: RaceRecord | null, setup?: (r: RaceCanvas) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<RaceCanvas | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const r = new RaceCanvas(ref.current, track, rec);
    setup?.(r);
    r.start();
    inst.current = r;
    return () => {
      r.stop();
      inst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, rec?.id]);
  return { ref, inst };
}

// ───────────────────────────── preparation ─────────────────────────────

function RacePrep({ event, special }: { event: string; special?: string }) {
  const state = useGame((g) => g.state);
  const { enterRace, selectRaceCar, repairRaceCar } = useGame.getState();
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  const setup = setupFor(state, event, special);
  const { ref } = useRaceCanvas(setup?.track ?? "small", null, (r) => (r.mode = "overhead"));
  const car = raceCar(state, state.racing.selected);
  const rivals = useMemo(() => (setup ? rivalsFor(state, setup.event, setup.type, 1) : []), [state, setup]);
  if (!setup) return null;
  const ev = setup.event;
  const mine = car ? carRating(car, setup.type) : 0;
  const lock = eventLock(state, ev, car);
  const eligible = state.racing.cars.filter((c) => ev.classes.includes(classOf(c.car)));
  const field = [...rivals.map((r) => ({ id: r.id, name: RIVAL_BY_ID[r.team.id].name, logo: r.team.logo, driver: r.driver, rating: r.rating, color: r.team.color, me: false })), ...(car ? [{ id: "player", name: t("racing.you"), logo: "🏁", driver: CAR_BY_ID[car.car].emoji + " " + state.designs[car.car].name, rating: mine, color: "#f5c451", me: true }] : [])].sort((a, b) => b.rating - a.rating);
  const myPlace = field.findIndex((f) => f.me);
  const worn = car && condition(car) < 0.7;

  const start = () => {
    if (enterRace(event, special)) setRace({ phase: "watch" });
  };

  return (
    <>
      <div className="relative h-[34vh] min-h-[180px] shrink-0">
        <canvas ref={ref} className="absolute inset-0 h-full w-full" />
        <button onClick={() => setRace(null)} className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-full bg-black/50 p-2 ring-1 ring-white/20" aria-label="close">
          <X className="size-5" />
        </button>
        <div className="absolute bottom-2 left-3 rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/80">{t("racing.prep")}</div>
          <div className="text-lg font-black leading-tight">
            {special ? SPECIAL_EVENTS.find((s) => s.id === special)?.emoji : ev.emoji} {raceName(t, event, special)}
          </div>
          <div className="text-[11px] text-white/60">
            {TRACK_BY_ID[setup.track].emoji} {trackName(t, setup.track)} · {t(`race.type.${setup.type}` as MessageKey)} · {t("racing.laps", { n: setup.laps })}
            {setup.round !== undefined && ` · ${t("racing.round", { n: setup.round + 1, of: ev.tracks.length })}`}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        {eligible.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {eligible.map((c) => (
              <button key={c.id} onClick={() => selectRaceCar(c.id)} className={cn("shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ring-1", c.id === car?.id ? "bg-gold/20 ring-gold/60" : "bg-white/5 ring-white/10")}>
                {CAR_BY_ID[c.car].emoji} {state.designs[c.car].name}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/55">
            <span>{t("racing.performance")}</span>
            <span>{t("racing.field", { n: ev.field })}</span>
          </div>
          <div className="space-y-1">
            {field.map((f, i) => (
              <div key={f.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs", f.me ? "bg-gold/15 ring-1 ring-gold/50" : "bg-white/[0.03]")}>
                <span className="w-4 text-right font-black text-white/40">{i + 1}</span>
                <span className="size-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: f.color }} />
                <span className="min-w-0 flex-1 truncate">
                  <b>{f.logo} {f.name}</b> <span className="text-white/45">{f.driver}</span>
                </span>
                <span className={cn("font-black tabular-nums", f.me ? "text-gold" : "text-white/80")}>{Math.round(f.rating)}</span>
              </div>
            ))}
          </div>
          {car && (
            <p className="mt-2 text-[11px] text-white/55">
              {myPlace === 0 ? t("racing.favourite") : myPlace < 3 ? t("racing.contender") : t("racing.outsider")}
            </p>
          )}
        </div>
        {car && <StatBars state={state} id={car.id} type={setup.type} />}
        {worn && car && (
          <button onClick={() => repairRaceCar(car.id)} className="w-full rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 ring-1 ring-amber-400/40">
            🔧 {t("racing.repairFirst", { pct: formatPercent(condition(car)) })}
          </button>
        )}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <Tile label={t("racing.prize1")} value={formatMoney(ev.prize * (special ? (SPECIAL_EVENTS.find((s) => s.id === special)?.mult ?? 1) : 1) * (ev.type === "championship" ? 0.06 : 1))} />
          <Tile label={t("racing.repLabel")} value={`+${formatNumber(Math.round(ev.rep * (ev.type === "championship" ? 0.15 : 1)))}`} />
          <Tile label={t("racing.fee")} value={formatMoney(entryFee(ev, special ? (SPECIAL_EVENTS.find((s) => s.id === special)?.mult ?? 1) : 1))} />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#05080f] via-[#05080f] to-transparent p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button
          disabled={lock !== null}
          onClick={start}
          className="w-full rounded-2xl bg-gradient-to-b from-gold to-gold-deep py-3.5 text-base font-black uppercase tracking-widest text-black shadow-[0_0_30px_rgba(245,196,81,.45)] disabled:from-white/15 disabled:to-white/10 disabled:text-white/50 disabled:shadow-none"
        >
          🏁 {lock ? lockText(t, lock) : t("racing.enter")}
        </button>
      </div>
    </>
  );
}

export function lockText(t: (k: MessageKey, v?: Record<string, string | number>) => string, lock: NonNullable<ReturnType<typeof eventLock>>): string {
  switch (lock.kind) {
    case "rep":
      return t("racing.lock.rep", { n: formatNumber(lock.need) });
    case "class":
      return t("racing.lock.class", { c: lock.classes.join("/") });
    case "noCar":
      return t("racing.lock.noCar");
    case "away":
      return t("racing.lock.away");
    case "busy":
      return t("racing.lock.busy");
    case "championship":
      return t("racing.lock.championship");
    case "cooldown":
      return t("racing.lock.cooldown", { time: `${Math.floor(lock.seconds / 60)}:${String(Math.floor(lock.seconds % 60)).padStart(2, "0")}` });
    case "fee":
      return t("racing.lock.fee", { money: formatMoney(lock.fee) });
  }
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] p-2 ring-1 ring-white/[0.06]">
      <div className="text-[9px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="font-black tabular-nums">{value}</div>
    </div>
  );
}

/** The car's stats as bars (weight in kg). */
export function StatBars({ state, id, type }: { state: GameState; id: number; type?: Parameters<typeof carRating>[1] }) {
  const { t } = useT();
  const car = raceCar(state, id);
  if (!car) return null;
  const st = carStats(car);
  const rows: [string, number][] = [
    ["speed", st.speed],
    ["accel", st.accel],
    ["handling", st.handling],
    ["braking", st.braking],
    ["aero", st.aero],
    ["reliability", st.reliability],
  ];
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.08]">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-wider text-white/55">
          {CAR_BY_ID[car.car].emoji} {state.designs[car.car].name} · {t("racing.classN", { c: classOf(car.car) })}
        </span>
        {type && <span className="font-black text-gold">{Math.round(carRating(car, type))}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-[10px] text-white/55">
              <span>{t(`race.stat.${k}` as MessageKey)}</span>
              <b className="tabular-nums text-white/85">{Math.round(v)}</b>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${Math.min(100, v)}%` }} />
            </div>
          </div>
        ))}
        <div className="col-span-2 mt-1 flex justify-between text-[10px] text-white/55">
          <span>
            ⚙️ {formatNumber(st.hp)} HP · ⚖️ {formatNumber(st.weight)} kg
          </span>
          <span>
            🔧 {t("racing.condition")} <b className={cn(st.condition < 0.6 ? "text-amber-300" : "text-white/85")}>{formatPercent(st.condition)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── the race ─────────────────────────────

function useRacingClock() {
  // the store ticks 10×/s; the canvas interpolates on its own
  return () => {
    const s = useGame.getState().state;
    return s.racing.clock;
  };
}

function RaceWatch() {
  const state = useGame((g) => g.state);
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  const [watched] = useState(() => state.racing.live?.id ?? state.racing.last?.id ?? null);
  const rec = state.racing.live?.id === watched ? state.racing.live : state.racing.last?.id === watched ? state.racing.last : null;
  const done = !!rec?.result && state.racing.live?.id !== watched;
  const clock = useRacingClock();
  const [mode, setMode] = useState<CameraMode>("iso");
  const [hud, setHud] = useState<{ cars: CarOnTrack[]; elapsed: number }>({ cars: [], elapsed: 0 });
  const stamp = useRef({ clock: 0, at: 0 });
  const startT = rec?.startT ?? 0;
  const { ref, inst } = useRaceCanvas(rec?.track ?? "small", rec, (r) => {
    r.elapsed = () => {
      const c = clock();
      const now = performance.now();
      if (c !== stamp.current.clock) stamp.current = { clock: c, at: now };
      return c + Math.min(0.15, (now - stamp.current.at) / 1000) - startT;
    };
    let last = 0;
    r.onFrame = (cars) => {
      const now = performance.now();
      if (now - last < 180) return;
      last = now;
      setHud({ cars, elapsed: r.elapsed() });
    };
  });
  useEffect(() => {
    const r = inst.current;
    if (!r) return;
    r.configure(mode, done ? rec : null);
  }, [inst, rec, mode, done]);

  if (!rec) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <button onClick={() => setRace(null)} className="rounded-xl bg-white/10 px-4 py-2">
          {t("common.cancel")}
        </button>
      </div>
    );
  }
  const order = runningOrder(rec, hud.cars);
  const leader = order[0];
  const lap = Math.min(rec.laps, (leader?.lap ?? 0) + 1);
  const count = RACE_COUNTDOWN - hud.elapsed;
  const ev = RACE_EVENT_BY_ID[rec.event];
  const nameOf = (id: string) => {
    if (id === "player") return t("racing.you");
    const e = rec.entrants.find((x) => x.id === id);
    return e?.team ? `${RIVAL_BY_ID[e.team].logo} ${e.driver}` : id;
  };

  return (
    <>
      <div className="relative flex-1">
        <canvas ref={ref} className="absolute inset-0 h-full w-full" />
        {/* top bar */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <div className="text-xs font-black">
              {ev.emoji} {raceName(t, rec.event, rec.special)}
            </div>
            <div className="text-[10px] text-white/60">
              {TRACK_BY_ID[rec.track].emoji} {trackName(t, rec.track)} · {done ? t("racing.finished") : t("racing.lap", { n: Math.max(1, lap), of: rec.laps })}
            </div>
          </div>
          <button onClick={() => setRace(null)} className="rounded-full bg-black/55 p-2 ring-1 ring-white/20 backdrop-blur" aria-label="close">
            <X className="size-5" />
          </button>
        </div>
        {/* 3, 2, 1, GO! */}
        {!done && count > -0.8 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={cn("text-7xl font-black drop-shadow-[0_4px_20px_rgba(0,0,0,.8)]", count <= 0 ? "text-emerald-400" : "text-gold")}>{count <= 0 ? t("racing.go") : Math.ceil(count)}</div>
          </div>
        )}
        {/* timing tower */}
        {!done && (
          <div className="absolute left-2 top-[calc(env(safe-area-inset-top)+4.5rem)] w-44 space-y-0.5">
            {order.map((c, i) => {
              const e = rec.entrants.find((x) => x.id === c.id)!;
              return (
                <div key={c.id} className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] backdrop-blur", c.id === "player" ? "bg-gold/85 font-black text-black" : "bg-black/55")}>
                  <span className="w-3.5 text-right font-black">{i + 1}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="min-w-0 flex-1 truncate">{nameOf(c.id)}</span>
                  {c.finished && <span>🏁</span>}
                </div>
              );
            })}
          </div>
        )}
        {/* cameras */}
        {!done && (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-3 flex gap-1.5">
            {(
              [
                ["iso", Camera],
                ["follow", Eye],
                ["overhead", Maximize2],
              ] as const
            ).map(([m, Icon]) => (
              <button key={m} onClick={() => setMode(m)} className={cn("flex items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold ring-1 backdrop-blur", mode === m ? "bg-gold text-black ring-gold" : "bg-black/55 ring-white/20")}>
                <Icon className="size-3.5" /> {t(`racing.cam.${m}` as MessageKey)}
              </button>
            ))}
          </div>
        )}
      </div>
      {done && <Results rec={rec} />}
    </>
  );
}

function Results({ rec }: { rec: RaceRecord }) {
  const setRace = useUi((u) => u.setRace);
  const { t } = useT();
  const rw = rec.result!;
  const me = rec.entrants.find((e) => e.id === "player");
  const medal = ["🥇", "🥈", "🥉"][rw.position] ?? "🏁";
  return (
    <div className="max-h-[52vh] shrink-0 space-y-2 overflow-y-auto rounded-t-3xl bg-ink/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] ring-1 ring-white/10">
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">🏆 {t("racing.finished")}</div>
        <div className="text-3xl font-black">
          {medal} {t("racing.place", { n: rw.position + 1 })}
        </div>
        {me && <div className="text-xs text-white/55">{t("racing.time", { time: raceClock(me.total) })}</div>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <Tile label={t("racing.prize")} value={formatMoney(rw.prize)} />
        <Tile label={t("racing.repLabel")} value={`+${formatNumber(rw.rep)}`} />
        <Tile label={t("racing.sponsorPay")} value={rw.sponsor ? formatMoney(rw.sponsor) : "—"} />
      </div>
      <div className="text-center text-[11px] text-white/50">
        {t("racing.netResult", { fee: formatMoney(rw.fee), net: formatMoney(rw.prize + rw.sponsor - rw.fee) })}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 text-[11px]">
        {rw.trophy && <Chip>🏆 {t(`race.trophy.${rw.trophy}` as MessageKey)}</Chip>}
        {rw.parts > 0 && <Chip>🔧 +{rw.parts} {t("racing.parts")}</Chip>}
        {rw.skin && <Chip>🎨 {t("racing.newSkin")}</Chip>}
        {rw.points !== undefined && <Chip>📊 +{rw.points} {t("racing.points")}</Chip>}
      </div>
      {rw.title && (
        <div className="rounded-xl bg-gold/15 p-2 text-center text-xs ring-1 ring-gold/40">
          <b>{rw.title.position === 0 ? `👑 ${t("racing.champion")}` : t("racing.titlePlace", { n: rw.title.position + 1 })}</b>
          {rw.title.prize > 0 && ` · ${formatMoney(rw.title.prize)} · +${formatNumber(rw.title.rep)} REP`}
        </div>
      )}
      {/* final classification */}
      <div className="space-y-0.5">
        {rec.order.map((id, i) => {
          const e = rec.entrants.find((x) => x.id === id)!;
          const gap = i === 0 ? raceClock(e.total) : `+${(e.total - rec.entrants.find((x) => x.id === rec.order[0])!.total).toFixed(3)}`;
          return (
            <div key={id} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-[11px]", id === "player" ? "bg-gold/15 font-bold" : "bg-white/[0.03]")}>
              <span className="w-4 text-right">{i + 1}</span>
              <span className="size-2 rounded-full" style={{ background: e.color }} />
              <span className="flex-1 truncate">{id === "player" ? t("racing.you") : `${RIVAL_BY_ID[e.team!]?.logo ?? ""} ${e.driver} · ${RIVAL_BY_ID[e.team!]?.name ?? ""}`}</span>
              <span className="tabular-nums text-white/60">{gap}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={() => setRace(null)} className="rounded-xl bg-white/10 py-2.5 text-sm font-bold">
          {t("racing.close")}
        </button>
        <button onClick={() => setRace({ phase: "prep", event: rec.event, special: rec.special })} className="rounded-xl bg-gradient-to-b from-gold to-gold-deep py-2.5 text-sm font-black text-black">
          🏁 {t("racing.again")}
        </button>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold ring-1 ring-white/15">{children}</span>;
}
