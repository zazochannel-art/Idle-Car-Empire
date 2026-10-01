"use client";

import { Check, Globe2, Lock, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { EMPIRE_PERKS, PRESTIGE } from "@/game/config/prestige";
import { canPrestige, earningsForNextPoint, pendingPoints } from "@/game/engine/prestige";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

export function PrestigeView() {
  const state = useGame((g) => g.state);
  const prestige = useGame((g) => g.prestige);
  const [confirm, setConfirm] = useState(false);

  const pending = pendingPoints(state);
  const ready = canPrestige(state);
  const runPct = Math.min(100, (state.run.moneyEarned / PRESTIGE.minRunEarnings) * 100);
  const nextAt = earningsForNextPoint(state);
  const bonusNow = state.empirePoints * PRESTIGE.incomePerPoint;
  const bonusAfter = (state.empirePoints + pending) * PRESTIGE.incomePerPoint;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1505] via-[#0f0d07] to-[#07080b] p-6 ring-1 ring-gold/25">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/40">
            <Star className="size-8 fill-gold text-gold" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/70">Empire Points</div>
            <div className="text-4xl font-black tabular-nums text-gradient-gold">{formatNumber(state.empirePoints)}</div>
            <div className="text-sm text-white/60">
              +{formatPercent(bonusNow)} global income · {state.prestigeCount} expansion{state.prestigeCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-white/50">Expanding now grants</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-gold">+{formatNumber(pending)} EP</div>
            <div className="text-xs text-white/50">
              Income bonus {formatPercent(bonusNow)} → <span className="text-gold">{formatPercent(bonusAfter)}</span>
            </div>
            <div className="mt-2 text-[11px] text-white/40">Next point at {formatMoney(nextAt)} lifetime earnings</div>
          </div>
          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-white/50">Requirement: earn {formatMoney(PRESTIGE.minRunEarnings)} this run</div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={runPct} indicatorClassName="from-gold to-amber-300" />
              <span className="text-xs tabular-nums text-white/60">{Math.floor(runPct)}%</span>
            </div>
            <div className="mt-1 text-[11px] text-white/40">This run: {formatMoney(state.run.moneyEarned)}</div>
            <Button variant={ready ? "gold" : "locked"} disabled={!ready} size="lg" className="mt-3 w-full" onClick={() => setConfirm(true)}>
              <Globe2 /> GLOBAL EXPANSION
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-2xl p-4 text-sm">
          <div className="mb-2 font-semibold text-rose-300">Resets</div>
          <ul className="space-y-1 text-white/60">
            <li>• Cash and run earnings</li>
            <li>• Factories, levels, lines and upgrades</li>
            <li>• Dealerships and car model refinements</li>
          </ul>
        </div>
        <div className="glass rounded-2xl p-4 text-sm">
          <div className="mb-2 font-semibold text-emerald-300">Keeps</div>
          <ul className="space-y-1 text-white/60">
            <li>• Empire Points (+{formatPercent(PRESTIGE.incomePerPoint)} income each)</li>
            <li>• Research and research points</li>
            <li>• Managers and their levels</li>
            <li>• Achievements, missions and statistics</li>
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Empire perks</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {EMPIRE_PERKS.map((p) => {
            const active = state.empirePoints >= p.points;
            return (
              <div key={p.name} className={cn("flex items-center gap-3 rounded-2xl p-3 ring-1", active ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.02] ring-white/[0.06]")}>
                <div className={cn("flex size-10 items-center justify-center rounded-xl", active ? "bg-gold/20 text-gold" : "bg-white/5 text-white/30")}>
                  {active ? <Check className="size-5" /> : <Lock className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {p.name}
                    <span className="text-[11px] font-normal text-gold/70">{formatNumber(p.points)} EP</span>
                  </div>
                  <div className="text-xs text-white/50">{p.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <div className="mb-3 text-5xl">🌍</div>
          <DialogTitle>Global Expansion</DialogTitle>
          <DialogDescription className="mt-2">
            Sell your current operation and rebuild bigger. You will gain <span className="font-semibold text-gold">+{formatNumber(pending)} Empire Points</span> for a
            permanent <span className="font-semibold text-gold">{formatPercent(bonusAfter)}</span> income bonus.
          </DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => {
                setConfirm(false);
                prestige();
              }}
            >
              Expand
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
