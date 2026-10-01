"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { FACTORIES, FACTORY_BY_ID } from "@/game/config/factories";
import { formatMoney } from "@/game/format";
import type { FactoryId } from "@/game/types";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

interface Pop {
  id: number;
  x: number;
  amount: number;
  premium: boolean;
}

let popId = 0;

/**
 * The hero scene: a stylised plant whose belt speed, robots, workers and
 * trucks follow the featured factory's real numbers. Pure CSS loops plus a
 * handful of Framer Motion pops, so it stays cheap on phones.
 */
export function FactoryScene() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const rush = useGame((g) => g.rush);

  const featured: FactoryId = useMemo(() => {
    const owned = FACTORIES.filter((f) => state.factories[f.id].owned);
    return owned[owned.length - 1]?.id ?? "garage";
  }, [state.factories]);

  const cfg = FACTORY_BY_ID[featured];
  const f = state.factories[featured];
  const st = snap.factories[featured];
  const producing = !!st && (st.automated || f.running);
  const manualGarage = !!snap.factories.garage && !snap.factories.garage.automated;

  // Belt and car speed follow the real cycle, clamped so it stays readable.
  const ride = st ? Math.min(14, Math.max(2.2, st.cycleTime * 1.4)) : 8;
  const carsOnBelt = producing ? Math.min(5, Math.max(1, Math.round(st!.carsPerCycle))) : 0;
  const robots = Math.min(3, 1 + (f.upgrades.automation > 0 ? 1 : 0) + (f.level >= 25 ? 1 : 0));
  const workers = Math.min(3, f.lines);

  const [pops, setPops] = useState<Pop[]>([]);
  const pending = useRef({ amount: 0, premium: false });
  const lastPop = useRef(0);

  useEffect(() => {
    const off = uiEvents.on((e) => {
      if (e.type !== "sale") return;
      pending.current.amount += e.amount;
      pending.current.premium ||= e.premium;
    });
    const timer = setInterval(() => {
      const now = performance.now();
      if (pending.current.amount <= 0 || now - lastPop.current < 280) return;
      lastPop.current = now;
      const pop: Pop = { id: ++popId, x: 52 + Math.random() * 38, amount: pending.current.amount, premium: pending.current.premium };
      pending.current = { amount: 0, premium: false };
      setPops((p) => [...p.slice(-5), pop]);
      setTimeout(() => setPops((p) => p.filter((q) => q.id !== pop.id)), 1300);
    }, 120);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  const onTap = () => {
    if (manualGarage) rush("garage");
  };

  return (
    <div
      onClick={onTap}
      className="relative h-52 select-none overflow-hidden rounded-3xl ring-1 ring-white/[0.08] sm:h-64"
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${cfg.accent}22, transparent 60%), linear-gradient(180deg, #0c111c 0%, #080a10 70%, #06070a 100%)`,
      }}
      role="img"
      aria-label={`${cfg.name} production line`}
    >
      {/* Stars / ambient grid */}
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(180deg,transparent,black_40%,transparent_85%)]" />

      {/* Building */}
      <div className="absolute bottom-[34%] left-[6%] right-[6%] h-[46%]">
        {/* Sawtooth roof */}
        <div
          className="absolute -top-5 left-0 right-0 h-6 bg-[#141a26]"
          style={{ clipPath: "polygon(0 100%,0 40%,8% 0,16% 40%,24% 0,32% 40%,40% 0,48% 40%,56% 0,64% 40%,72% 0,80% 40%,88% 0,96% 40%,100% 20%,100% 100%)" }}
        />
        <div className="absolute inset-0 rounded-t-md bg-gradient-to-b from-[#161d2b] to-[#0e131d] ring-1 ring-white/[0.06]">
          {/* Windows with blinking lights */}
          <div className="absolute inset-x-4 top-3 grid grid-cols-8 gap-2 sm:grid-cols-12">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className={`h-3 rounded-sm ${i >= 8 ? "hidden sm:block" : ""}`}
                style={{
                  background: i % 3 === 0 ? cfg.accent : "#fbbf24",
                  opacity: 0.6,
                  animation: `blink ${2 + (i % 5) * 0.7}s ease-in-out ${i * 0.31}s infinite`,
                  boxShadow: `0 0 10px ${i % 3 === 0 ? cfg.accent : "#fbbf24"}`,
                }}
              />
            ))}
          </div>
          {/* Neon sign */}
          <div className="absolute bottom-2 left-3 flex items-center gap-2">
            <span className="text-lg">{cfg.emoji}</span>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em] sm:text-xs"
              style={{ color: cfg.accent, textShadow: `0 0 12px ${cfg.accent}` }}
            >
              {cfg.name}
            </span>
          </div>
          {/* Loading bay door */}
          <div className="absolute bottom-0 right-6 h-[55%] w-[18%] rounded-t-sm bg-[repeating-linear-gradient(180deg,#1f2937_0_4px,#111827_4px_8px)] ring-1 ring-white/10" />
        </div>
        {/* Chimney + smoke */}
        <div className="absolute -top-12 left-[12%] h-12 w-4 rounded-t-sm bg-[#1a2130]">
          {producing &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute -top-3 left-0 size-4 rounded-full bg-white/20 blur-[2px]"
                style={{ animation: `smoke 3s ease-out ${i}s infinite` }}
              />
            ))}
        </div>
      </div>

      {/* Robot arms */}
      <div className="absolute bottom-[25%] left-[42%] right-[28%] flex justify-around">
        {Array.from({ length: robots }).map((_, i) => (
          <div key={i} className="relative h-16 w-4">
            <div className="absolute bottom-0 left-0 h-3 w-4 rounded-sm bg-slate-600" />
            <div
              className="absolute bottom-2 left-1.5 h-12 w-1.5 origin-bottom rounded-full bg-gradient-to-t from-slate-500 to-amber-400"
              style={{ animation: producing ? `arm-swing ${Math.max(0.8, ride / 3)}s ease-in-out ${i * 0.35}s infinite` : undefined }}
            >
              <span
                className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
                style={{ animation: producing ? `spark 0.9s ease-out ${i * 0.3}s infinite` : undefined }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Conveyor */}
      <div className="absolute bottom-[18%] left-0 right-0 h-3 bg-[#1b2230] ring-1 ring-white/[0.06]">
        <div
          className="h-full w-full opacity-70 [background-image:repeating-linear-gradient(90deg,#334155_0_6px,transparent_6px_20px)] [background-size:40px_100%]"
          style={{ animation: producing ? `belt ${Math.max(0.3, ride / 6)}s linear infinite` : undefined }}
        />
      </div>
      <div className="absolute bottom-[19%] left-0 right-0 h-8 overflow-hidden">
        {Array.from({ length: carsOnBelt }).map((_, i) => (
          <span
            key={`${featured}-${i}`}
            className="absolute bottom-0 left-0 w-full text-2xl leading-none sm:text-3xl"
            style={{ animation: `car-ride ${ride}s linear ${(-ride * i) / carsOnBelt}s infinite` }}
          >
            <span className="inline-block -scale-x-100 drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">{st?.car.emoji}</span>
          </span>
        ))}
      </div>

      {/* Floor */}
      <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-gradient-to-b from-[#0d1118] to-[#07080c]" />

      {/* Workers */}
      <div className="absolute bottom-[3%] left-[8%] flex gap-10">
        {Array.from({ length: workers }).map((_, i) => (
          <span
            key={i}
            className="text-lg"
            style={{ ["--walk" as string]: `${30 + i * 14}px`, animation: `worker-walk ${5 + i * 1.3}s ease-in-out ${i * 0.8}s infinite` }}
          >
            👷
          </span>
        ))}
      </div>

      {/* Truck leaving with finished cars */}
      {producing && (
        <div className="pointer-events-none absolute bottom-[2%] right-[34%] w-[40%]">
          <span
            className="inline-block text-2xl"
            style={{ ["--truck-distance" as string]: "120%", animation: `truck-drive ${Math.max(4, ride * 1.2)}s ease-in ${ride / 2}s infinite` }}
          >
            <span className="inline-block -scale-x-100">🚚</span>
          </span>
        </div>
      )}

      {/* Status chip */}
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/10 backdrop-blur">
        <span className={`size-1.5 rounded-full ${producing ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"}`} />
        {producing ? `${st?.car.name} · ${cfg.city}` : "Idle — tap BUILD"}
      </div>
      {manualGarage && (
        <div className="absolute right-3 top-3 rounded-full bg-electric/20 px-2.5 py-1 text-[11px] font-semibold text-sky-200 ring-1 ring-electric/40 backdrop-blur">
          Tap to rush ⚡
        </div>
      )}

      {/* Floating sales */}
      <AnimatePresence>
        {pops.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: -46, scale: 1 }}
            exit={{ opacity: 0, y: -70 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={`pointer-events-none absolute bottom-[30%] text-sm font-bold tabular-nums sm:text-base ${p.premium ? "text-gold" : "text-emerald-300"}`}
            style={{ left: `${p.x}%`, textShadow: "0 2px 10px rgba(0,0,0,.8)" }}
          >
            +{formatMoney(p.amount)}
            {p.premium && <span className="ml-1 text-[10px] uppercase">premium</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
