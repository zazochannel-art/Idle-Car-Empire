"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CARS, type CarConfig } from "@/game/config/cars";
import { ECU_STAGES, TURBO_STAGES, type EcuStage, type TurboStage } from "@/game/config/tuning";
import { Zap, Flame, ShieldCheck, Timer } from "lucide-react";

export function DynoView() {
  const [selectedCar, setSelectedCar] = useState<CarConfig>(CARS[0]);
  const [ecu, setEcu] = useState<EcuStage>("stock");
  const [turbo, setTurbo] = useState<TurboStage>("none");

  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [certified, setCertified] = useState(false);
  const [testTime, setTestTime] = useState<number | null>(null);

  const ecuInfo = ECU_STAGES[ecu];
  const turboInfo = TURBO_STAGES[turbo];

  // Calculated Dyno performance stats
  const totalHp = selectedCar.hp + ecuInfo.hpGain + turboInfo.hpGain;
  const totalTorque = Math.round(selectedCar.hp * 1.25) + ecuInfo.torqueGain + turboInfo.torqueGain;
  const zeroHundred = Math.max(1.8, (8.5 * (200 / totalHp)).toFixed(2) as unknown as number);
  const topSpeed = Math.round(180 + totalHp * 0.22);
  const certBonus = Math.min(25, Math.round((ecuInfo.certBonus + (turbo === "raceTurbo" ? 0.08 : turbo === "twinTurbo" ? 0.04 : 0)) * 100));

  const runTestTrack = () => {
    if (testing) return;
    setTesting(true);
    setTestProgress(0);
    setCertified(false);
    setTestTime(null);

    const interval = setInterval(() => {
      setTestProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTesting(false);
          setCertified(true);
          setTestTime(Number((zeroHundred * 1.4).toFixed(2)));
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  return (
    <div className="space-y-4 p-1">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-red-600/30 via-orange-600/20 to-amber-500/10 p-4 ring-1 ring-white/15">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-red-600/30 text-2xl ring-1 ring-red-500/40">
            🏎️
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Dyno Tuning & Pista de Teste</h2>
            <p className="text-xs text-white/60">Testează prototipurile și obține Certificatul de Performanță (+25% preț vânzare)</p>
          </div>
        </div>
      </div>

      {/* Car Selection */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/50">Alege Modelul Auto</label>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CARS.slice(0, 10).map((car) => (
            <button
              key={car.id}
              onClick={() => {
                setSelectedCar(car);
                setCertified(false);
                setTestTime(null);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                selectedCar.id === car.id ? "bg-red-600 text-white shadow-lg ring-1 ring-white/30" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <span>{car.emoji}</span>
              <span>{car.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live Dyno Performance Gauges */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-3.5 ring-1 ring-white/10">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span className="flex items-center gap-1 font-bold"><Zap className="size-3.5 text-amber-400" /> Putere Engine</span>
            <span className="text-[10px] text-amber-400">+{ecuInfo.hpGain + turboInfo.hpGain} CP</span>
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-white">
            {totalHp} <span className="text-xs font-normal text-white/50">CP</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-300" style={{ width: `${Math.min(100, (totalHp / 1000) * 100)}%` }} />
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-3.5 ring-1 ring-white/10">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span className="flex items-center gap-1 font-bold"><Flame className="size-3.5 text-orange-400" /> Cuplu Motor</span>
            <span className="text-[10px] text-orange-400">+{ecuInfo.torqueGain + turboInfo.torqueGain} Nm</span>
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-white">
            {totalTorque} <span className="text-xs font-normal text-white/50">Nm</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-orange-500 to-red-600 transition-all duration-300" style={{ width: `${Math.min(100, (totalTorque / 1200) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Dyno Tuning Options */}
      <div className="space-y-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/50">ECU Stage Tuning</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ECU_STAGES) as EcuStage[]).map((stg) => {
              const cfg = ECU_STAGES[stg];
              return (
                <button
                  key={stg}
                  onClick={() => setEcu(stg)}
                  className={`flex items-center justify-between rounded-xl p-2.5 text-left text-xs transition ${
                    ecu === stg ? "bg-amber-500/20 text-white ring-1 ring-amber-400/50" : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <div>
                    <div className="font-bold">{cfg.emoji} {cfg.name}</div>
                    <div className="text-[10px] text-white/40">+{cfg.hpGain} CP · +{cfg.certBonus * 100}% Preț</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/50">Turbocompresor</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TURBO_STAGES) as TurboStage[]).map((stg) => {
              const cfg = TURBO_STAGES[stg];
              return (
                <button
                  key={stg}
                  onClick={() => setTurbo(stg)}
                  className={`flex items-center justify-between rounded-xl p-2.5 text-left text-xs transition ${
                    turbo === stg ? "bg-red-500/20 text-white ring-1 ring-red-400/50" : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <div>
                    <div className="font-bold">{cfg.emoji} {cfg.name}</div>
                    <div className="text-[10px] text-white/40">+{cfg.hpGain} CP</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Test Track Challenge */}
      <div className="rounded-2xl bg-gradient-to-br from-red-950/40 via-black/40 to-amber-950/30 p-4 ring-1 ring-white/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="size-5 text-red-400" />
            <div>
              <div className="text-sm font-black text-white">Testare pe Pistă (Time Attack)</div>
              <div className="text-[11px] text-white/50">0-100 km/h: <span className="font-bold text-amber-400">{zeroHundred}s</span> · Top Speed: <span className="font-bold text-amber-400">{topSpeed} km/h</span></div>
            </div>
          </div>
          <Button
            variant="go"
            disabled={testing}
            onClick={runTestTrack}
            className="px-4"
          >
            {testing ? "Se testează..." : "Start Test"}
          </Button>
        </div>

        {/* Progress / Telemetry Bar */}
        {testing && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs text-white/70">
              <span>Telemetrie în curs...</span>
              <span>{testProgress}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-green-400 transition-all duration-150" style={{ width: `${testProgress}%` }} />
            </div>
          </div>
        )}

        {/* Certified Badge Results */}
        {certified && testTime && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-green-500/15 p-3 ring-1 ring-green-500/40 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-7 text-green-400" />
              <div>
                <div className="text-xs font-black text-white">Certificat de Performanță Obținut!</div>
                <div className="text-[10px] text-white/60">Timp tur: {testTime}s · Bonus Vânzare: <span className="font-bold text-green-400">+{certBonus}%</span></div>
              </div>
            </div>
            <div className="rounded-lg bg-green-500/20 px-2.5 py-1 text-xs font-black text-green-300">GRADE S</div>
          </div>
        )}
      </div>
    </div>
  );
}
