"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DEALERS, WHOLESALE_RATE } from "@/game/config/dealerships";
import { dealerCapacity, dealerMarkup, dealerUpgradeCost } from "@/game/engine/economy";
import { formatNumber, formatPercent } from "@/game/format";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";
import { ViewHeader } from "./section-title";

export function DealersView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { buyDealer, upgradeDealer } = useGame.getState();
  const alloc = snap.dealers;
  const util = alloc.capacity > 0 ? Math.min(100, (snap.carsPerSec / alloc.capacity) * 100) : 100;
  const nextLocked = DEALERS.find((d) => !state.dealers[d.id].owned);

  return (
    <div className="space-y-4">
      <ViewHeader icon="🏬" title="Dealerships" subtitle="Factories build cars — dealers sell them. Premium dealers sell first and add markup.">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Production" value={`${formatNumber(snap.carsPerSec)}/s`} />
          <Metric label="Retail capacity" value={`${formatNumber(alloc.capacity)}/s`} />
          <Metric label="Sale multiplier" value={`×${alloc.multiplier.toFixed(2)}`} gold />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-white/50">
            <span>Dealer utilisation</span>
            <span>{Math.floor(util)}%</span>
          </div>
          <Progress value={util} indicatorClassName={alloc.wholesale > 0 ? "from-amber-500 to-rose-500" : undefined} />
        </div>
        {alloc.wholesale > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200 ring-1 ring-amber-400/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {formatNumber(alloc.wholesale)} cars/s exceed dealer capacity and go to wholesale at {formatPercent(WHOLESALE_RATE)} value. Upgrade or open dealers to sell
              them at full price.
            </span>
          </div>
        )}
      </ViewHeader>

      <div className="grid gap-3 md:grid-cols-2">
        {DEALERS.map((d) => {
          const st = state.dealers[d.id];
          const slot = alloc.slots.find((x) => x.id === d.id);
          if (!st.owned) {
            const isNext = nextLocked?.id === d.id;
            return (
              <div key={d.id} className={`rounded-2xl p-4 ring-1 ${isNext ? "bg-white/[0.03] ring-dashed ring-white/15" : "bg-white/[0.015] opacity-55 ring-white/[0.05]"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{d.emoji}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-white/45">{d.description}</div>
                    <div className="mt-1 text-[11px] text-white/55">
                      Sells {formatNumber(d.capacity)} cars/s · +{formatPercent(d.markup)} markup
                    </div>
                  </div>
                </div>
                {isNext && <CostButton className="mt-3 w-full" variant="gold" cost={d.cost} onBuy={() => buyDealer(d.id)} label="Open dealership" />}
              </div>
            );
          }
          const cap = dealerCapacity(state, d.id, snap.gm);
          return (
            <div key={d.id} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{d.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.name}</span>
                    <Badge>Lv {st.level}</Badge>
                  </div>
                  <div className="text-xs text-white/45">
                    {formatNumber(cap)} cars/s · +{formatPercent(dealerMarkup(state, d.id, snap.gm))} markup
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-white/50">
                  <span>Selling</span>
                  <span className="tabular-nums">
                    {formatNumber(slot?.sold ?? 0)}/{formatNumber(cap)} per sec
                  </span>
                </div>
                <Progress value={cap > 0 ? ((slot?.sold ?? 0) / cap) * 100 : 0} />
              </div>
              <CostButton className="mt-3 w-full" cost={dealerUpgradeCost(state, d.id)} onBuy={() => upgradeDealer(d.id)} label="Upgrade: +25% capacity, +2% markup" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${gold ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}
