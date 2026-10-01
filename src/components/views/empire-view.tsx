"use client";

import { FACTORIES } from "@/game/config/factories";
import type { BuyAmount } from "@/game/types";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { FactoryCard, LockedFactoryCard } from "../game/factory-card";
import { FactoryScene } from "../game/factory-scene";
import { MissionStrip, NextGoals } from "../game/goals";
import { SectionTitle } from "./section-title";

const AMOUNTS: BuyAmount[] = [1, 10, 100, "max"];

export function BuyAmountToggle() {
  const amount = useGame((g) => g.state.settings.buyAmount);
  const setBuyAmount = useGame((g) => g.setBuyAmount);
  return (
    <div className="inline-flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
      {AMOUNTS.map((a) => (
        <button
          key={a}
          onClick={() => setBuyAmount(a)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums transition",
            amount === a ? "bg-electric text-white shadow-[0_0_12px_rgba(59,130,246,.6)]" : "text-white/50 hover:text-white",
          )}
        >
          {a === "max" ? "MAX" : `×${a}`}
        </button>
      ))}
    </div>
  );
}

export function EmpireView() {
  const factories = useGame((g) => g.state.factories);
  const owned = FACTORIES.filter((f) => factories[f.id].owned);
  const locked = FACTORIES.filter((f) => !factories[f.id].owned);

  return (
    <div className="space-y-5">
      <FactoryScene />
      <NextGoals />
      <MissionStrip />

      <div className="flex items-end justify-between gap-3">
        <SectionTitle title="Factories" subtitle={`${owned.length} of ${FACTORIES.length} plants`} />
        <BuyAmountToggle />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {owned.map((f) => (
          <div key={f.id} id={`factory-${f.id}`}>
            <FactoryCard id={f.id} />
          </div>
        ))}
      </div>

      {locked.length > 0 && (
        <div className="space-y-2">
          <LockedFactoryCard id={locked[0].id} highlight />
          <div className="grid gap-2 sm:grid-cols-2">
            {locked.slice(1).map((f) => (
              <LockedFactoryCard key={f.id} id={f.id} highlight={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
