"use client";

// MY CARS: every car the company kept, each with its own identity — its DNA
// (the parts actually fitted), its record and its Test Track report.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { carDNA, testCar, testFee, type TestReport } from "@/game/engine/car-dna";
import { MY_CARS_LOT, condition, fleetCap, orderableCars, racingFleet } from "@/game/engine/racing";
import { formatMoney, formatNumber } from "@/game/format";
import type { RaceCarState } from "@/game/types";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const lapTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const serial = (id: number) => `#${String(id).padStart(3, "0")}`;

/** The cars the company owns, and how to keep a new one off the line. */
export function MyCars() {
  const state = useGame((g) => g.state);
  const [open, setOpen] = useState<number | null>(null);
  const { t } = useT();
  const R = state.racing;
  const cars = R.cars;
  return (
    <div className="space-y-3">
      <KeepCar />
      {cars.length === 0 && <p className="rounded-2xl bg-white/[0.03] p-4 text-center text-sm text-white/50 ring-1 ring-white/[0.06]">{t("mycars.empty")}</p>}
      {cars.map((rc) => (
        <CarCard key={rc.id} rc={rc} open={open === rc.id} onToggle={() => setOpen(open === rc.id ? null : rc.id)} />
      ))}
    </div>
  );
}

/** Keep the next car of a model that comes off an assembly line. */
function KeepCar() {
  const state = useGame((g) => g.state);
  const order = useGame((g) => g.orderRaceCar);
  const { t, lang } = useT();
  const n = useContent(lang);
  const models = orderableCars(state);
  const full = racingFleet(state) >= fleetCap(state);
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">🔑 {t("mycars.keep")}</span>
        <span className="text-[10px] tabular-nums text-white/45">
          {racingFleet(state)}/{fleetCap(state)}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-white/50">{state.racing.unlocked ? t("mycars.keepDesc") : t("mycars.keepLot", { n: MY_CARS_LOT })}</p>
      {models.length === 0 ? (
        <p className="text-[11px] text-white/40">{t("mycars.noModels")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {CARS.filter((c) => models.includes(c.id)).map((c) => (
            <button key={c.id} disabled={full} onClick={() => order(c.id)} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/[0.1] disabled:opacity-40">
              {c.emoji} {state.designs[c.id].name} <span className="text-white/40">· {n.car(c)}</span>
            </button>
          ))}
        </div>
      )}
      {state.racing.orders.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-200/80">
          ⏳ {t("mycars.ordered", { list: state.racing.orders.map((c) => state.designs[c].name).join(", ") })}
        </p>
      )}
    </div>
  );
}

function CarCard({ rc, open, onToggle }: { rc: RaceCarState; open: boolean; onToggle: () => void }) {
  const state = useGame((g) => g.state);
  const { runTest, selectRaceCar } = useGame.getState();
  const setView = useUi((u) => u.setView);
  const { t, lang } = useT();
  const n = useContent(lang);
  const cfg = CAR_BY_ID[rc.car];
  const dna = carDNA(state, rc);
  const losses = rc.races - rc.wins;
  const fee = testFee(rc);
  const where = state.racing.live?.car === rc.id ? t("mycars.loc.racing") : rc.location === "factory" ? t("mycars.loc.factory") : t("mycars.loc.paddock");
  return (
    <div className="glass overflow-hidden rounded-2xl ring-1 ring-white/[0.07]">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: `${state.designs[rc.car].color || cfg.color}33` }}>
          {cfg.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[11px] text-white/45">{serial(rc.id)}</span>
            <span className="truncate font-bold">{state.designs[rc.car].name}</span>
          </div>
          <div className="text-[11px] text-white/55">
            {dna.engine} · {formatNumber(dna.hp)} {t("dna.hp")} · {formatNumber(dna.weight)} kg
          </div>
          <div className="text-[10px] text-white/40">
            📍 {where} · 🛣️ {formatNumber(Math.round(rc.mileage ?? 0))} km · ❤️ {Math.round(condition(rc) * 100)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-black tabular-nums text-gold">{formatMoney(dna.value)}</div>
          <div className="text-[10px] text-white/45">
            🏁 {rc.races} · 🏆 {rc.wins}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] p-3">
          {/* the record */}
          <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
            <Stat label={t("mycars.races")} value={String(rc.races)} />
            <Stat label={t("mycars.wins")} value={String(rc.wins)} />
            <Stat label={t("mycars.losses")} value={String(losses)} />
            <Stat label={t("mycars.bestLap")} value={rc.bestLap ? lapTime(rc.bestLap) : "—"} />
          </div>
          {/* the DNA */}
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">🧬 {t("dna.title")}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <Row k={t("dna.engine")} v={dna.engine} />
              <Row k={t("dna.power")} v={`${formatNumber(dna.hp)} ${t("dna.hp")} · ${formatNumber(dna.torque)} Nm`} />
              <Row k={t("dna.weight")} v={`${formatNumber(dna.weight)} kg`} />
              <Row k={t("dna.gearbox")} v={dna.gearbox} />
              <Row k={t("dna.chassis")} v={dna.chassis} />
              <Row k={t("dna.suspension")} v={dna.suspension} />
              <Row k={t("dna.brakes")} v={dna.brakes} />
              <Row k={t("dna.tires")} v={dna.tires} />
              <Row k={t("dna.wheels")} v={dna.wheels} />
              <Row k={t("dna.aero")} v={`${dna.aero}/100`} />
              <Row k={t("dna.interior")} v={dna.interior} />
              <Row k={t("dna.glass")} v={dna.glass} />
              <Row k={t("dna.lights")} v={dna.lights} />
              <Row k={t("dna.paint")} v={dna.paint} />
              <Row k={t("dna.quality")} v={`${dna.quality}/100`} />
              <Row k={t("dna.reliability")} v={`${dna.reliability}/100`} />
              <Row k={t("dna.cost")} v={formatMoney(dna.cost)} />
              <Row k={t("dna.performance")} v={formatNumber(dna.performance)} />
            </div>
            <p className="mt-1 text-[10px] text-white/40">
              {n.car(cfg)} · {t("dna.from")}
            </p>
          </div>
          {/* the Test Track */}
          <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-transparent p-2.5 ring-1 ring-sky-400/25">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200">⏱️ {t("test.title")}</span>
              <Button size="sm" variant="gold" disabled={state.cash < fee || state.racing.live?.car === rc.id} onClick={() => runTest(rc.id)}>
                {t("test.run", { fee: formatMoney(fee) })}
              </Button>
            </div>
            {rc.test ? <Report r={rc.test} now={testCar(rc)} /> : <p className="text-[11px] text-white/45">{t("test.none")}</p>}
          </div>
          {state.racing.unlocked && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => {
                selectRaceCar(rc.id);
                setView("racing");
              }}
            >
              🏁 {t("mycars.toRacing")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-white/[0.04] p-1.5">
    <div className="text-white/45">{label}</div>
    <div className="text-xs font-bold tabular-nums">{value}</div>
  </div>
);
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2 border-b border-white/[0.04] py-0.5">
    <span className="text-white/45">{k}</span>
    <span className="truncate text-right font-semibold">{v}</span>
  </div>
);

/** CAR TEST REPORT: what was measured, and how the car compares now (wear, upgrades since). */
function Report({ r, now }: { r: TestReport; now: TestReport }) {
  const { t } = useT();
  const rows: [string, string, number, number, boolean][] = [
    [t("test.zero100"), `${r.zeroTo100.toFixed(1)} s`, r.zeroTo100, now.zeroTo100, false],
    [t("test.zero200"), r.zeroTo200 === null ? "—" : `${r.zeroTo200.toFixed(1)} s`, r.zeroTo200 ?? 0, now.zeroTo200 ?? 0, false],
    [t("test.top"), `${r.topSpeed} km/h`, r.topSpeed, now.topSpeed, true],
    [t("test.braking"), `${r.braking.toFixed(1)} m`, r.braking, now.braking, false],
    [t("test.cornering"), `${r.cornering.toFixed(2)} g`, r.cornering, now.cornering, true],
    [t("test.handling"), String(r.handling), r.handling, now.handling, true],
    [t("test.reliability"), String(r.reliability), r.reliability, now.reliability, true],
    [t("test.lap"), lapTime(r.lap), r.lap, now.lap, false],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {rows.map(([k, v, then, cur, up]) => {
        const better = up ? cur > then + 1e-6 : cur < then - 1e-6;
        const worse = up ? cur < then - 1e-6 : cur > then + 1e-6;
        return (
          <div key={k} className="flex justify-between gap-2 border-b border-white/[0.04] py-0.5">
            <span className="text-white/45">{k}</span>
            <span className={cn("font-bold tabular-nums", better ? "text-emerald-300" : worse ? "text-rose-300" : "")}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}
