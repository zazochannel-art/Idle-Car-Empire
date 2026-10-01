"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { FACTORIES, FACTORY_BY_ID } from "@/game/config/factories";
import { formatMoney, formatNumber } from "@/game/format";
import type { FactoryId } from "@/game/types";
import { cn } from "@/lib/utils";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { GarageScene } from "./scene/garage-scene";
import { PlantScene } from "./scene/plant-scene";

interface Pop {
  id: number;
  x: number;
  amount: number;
  premium: boolean;
}

let popId = 0;

/**
 * The hero scene. The Small Garage is drawn as a real workshop with a car on
 * the lift; every other plant is a production hall. The car on screen follows
 * the factory's real batch progress through each build stage.
 */
export function FactoryScene() {
  const factories = useGame((g) => g.state.factories);
  const snap = useGame((g) => g.snap);
  const rush = useGame((g) => g.rush);

  const owned = useMemo(() => FACTORIES.filter((f) => factories[f.id].owned), [factories]);
  const [picked, setPicked] = useState<FactoryId | null>(null);
  const featured: FactoryId = picked && factories[picked]?.owned ? picked : (owned[owned.length - 1]?.id ?? "garage");

  const cfg = FACTORY_BY_ID[featured];
  const st = snap.factories[featured];
  const manual = !!st && !st.automated;

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
      if (pending.current.amount <= 0 || now - lastPop.current < 320) return;
      lastPop.current = now;
      const pop: Pop = { id: ++popId, x: 58 + Math.random() * 30, amount: pending.current.amount, premium: pending.current.premium };
      pending.current = { amount: 0, premium: false };
      setPops((p) => [...p.slice(-4), pop]);
      setTimeout(() => setPops((p) => p.filter((q) => q.id !== pop.id)), 1300);
    }, 120);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  if (!st) return null;

  return (
    <div className="relative">
      <div
        onClick={() => manual && rush(featured)}
        className={cn(
          "relative aspect-[16/9] select-none overflow-hidden rounded-3xl bg-ink-2 ring-1 ring-white/[0.08] sm:aspect-[1000/440]",
          manual && "cursor-pointer",
        )}
        data-scene
        role="img"
        aria-label={`${cfg.name} production line`}
      >
        {featured === "garage" ? (
          <GarageScene car={st.car} accent={cfg.accent} name={cfg.name} city={cfg.city} />
        ) : (
          <PlantScene key={featured} factory={featured} tier={cfg.maxTier} car={st.car} accent={cfg.accent} name={cfg.name} city={cfg.city} />
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-bold text-white ring-1 ring-white/10 backdrop-blur sm:text-xs">
          <span className="size-2 animate-pulse-soft rounded-full" style={{ background: cfg.accent, boxShadow: `0 0 8px ${cfg.accent}` }} />
          <span data-fx="label">{manual ? "Idle — tap BUILD" : "Chassis & frame"}</span>
        </div>

        {/* Vignette */}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.7)]" />

        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/85 ring-1 ring-white/10 backdrop-blur">
            {st.car.emoji} {st.car.name} ×{st.carsPerCycle} · {formatNumber(st.carsPerSec * 60)}/min
          </span>
          {manual && (
            <span className="rounded-full bg-electric/25 px-2.5 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-electric/50 backdrop-blur">Tap to rush ⚡</span>
          )}
        </div>

        <AnimatePresence>
          {pops.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: -50, scale: 1 }}
              exit={{ opacity: 0, y: -74 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className={`pointer-events-none absolute bottom-[38%] rounded-full bg-black/40 px-2 py-0.5 text-sm font-bold tabular-nums backdrop-blur-sm sm:text-base ${p.premium ? "text-gold" : "text-emerald-300"}`}
              style={{ left: `${p.x}%`, textShadow: "0 2px 10px rgba(0,0,0,.8)" }}
            >
              +{formatMoney(p.amount)}
              {p.premium && <span className="ml-1 text-[10px] uppercase">premium</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {owned.length > 1 && (
        <div className="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto">
          {owned.map((f) => (
            <button
              key={f.id}
              onClick={() => setPicked(f.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 transition",
                f.id === featured ? "bg-white/10 text-white ring-white/25" : "bg-white/[0.03] text-white/50 ring-white/10 hover:text-white",
              )}
            >
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
