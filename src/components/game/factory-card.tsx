"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, ChevronDown, Cpu, Gauge, Hammer, Lock, Megaphone, Plus, Sparkles, Truck, UserPlus, Zap } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FACTORY_BY_ID, LEVEL_MILESTONES } from "@/game/config/factories";
import { describeBonus, MANAGERS } from "@/game/config/managers";
import { UPGRADES } from "@/game/config/upgrades";
import { isManagerUnlocked } from "@/game/engine/actions";
import { buildableCars, factoryTierCap, levelPurchase, lineCost, nextMilestone, upgradeCost } from "@/game/engine/economy";
import { managerAt } from "@/game/engine/modifiers";
import { factoryRequirement } from "@/game/engine/insights";
import { formatMoney, formatNumber, formatTime } from "@/game/format";
import type { FactoryId, UpgradeCategory } from "@/game/types";
import { cn } from "@/lib/utils";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { CostButton } from "./cost-button";

const UPGRADE_ICONS: Record<UpgradeCategory, React.ComponentType<{ className?: string }>> = {
  production: Gauge,
  quality: Sparkles,
  automation: Bot,
  marketing: Megaphone,
  logistics: Truck,
  technology: Cpu,
};

export const FactoryCard = memo(function FactoryCard({ id }: { id: FactoryId }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { build, rush, buyLevels } = useGame.getState();
  const [open, setOpen] = useState(id === "garage");
  const [flash, setFlash] = useState(0);

  useEffect(
    () =>
      uiEvents.on((e) => {
        if (e.type === "levelUp" && e.factory === id) setFlash((n) => n + 1);
      }),
    [id],
  );

  const cfg = FACTORY_BY_ID[id];
  const f = state.factories[id];
  const st = snap.factories[id];
  if (!f.owned || !st) return null;

  const income = st.incomeBeforeDealers * snap.dealers.multiplier;
  const purchase = levelPurchase(state, id, state.settings.buyAmount);
  const nextMs = nextMilestone(f.level);
  const prevMs = [...LEVEL_MILESTONES].reverse().find((m) => f.level >= m) ?? 1;
  const msProgress = nextMs ? ((f.level - prevMs) / (nextMs - prevMs)) * 100 : 100;
  const manager = managerAt(state, id);
  const fast = st.cycleTime < 0.35;
  const isIdleManual = !st.automated && !f.running;

  return (
    <motion.div layout="position" className="glass relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)` }} />
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(circle at 80% 20%, ${cfg.accent}55, transparent 60%)` }}
          />
        )}
      </AnimatePresence>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl ring-1"
            style={{ background: `${cfg.accent}1a`, boxShadow: `inset 0 0 20px ${cfg.accent}22`, borderColor: cfg.accent, ["--tw-ring-color" as string]: `${cfg.accent}55` }}
          >
            {cfg.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold">{cfg.name}</h3>
              <motion.span key={f.level} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                <Badge>Lv {f.level}</Badge>
              </motion.span>
              {manager && (
                <Badge variant="muted" title={`${manager.name} — ${manager.role}`}>
                  {manager.avatar} {manager.name}
                </Badge>
              )}
            </div>
            <div className="text-xs text-white/45">
              {cfg.city} · {cfg.continent} · {f.lines} line{f.lines > 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums text-emerald-300">{formatMoney(st.automated || f.running ? income : 0)}/s</div>
            <div className="text-[11px] text-white/40 tabular-nums">{formatNumber(st.carsPerSec * 60)} cars/min</div>
          </div>
        </div>

        {/* Production */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-2xl" title={st.car.name}>
            {st.car.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
              <span className="truncate">
                {st.car.name} ×{st.carsPerCycle} · {formatMoney(st.valuePerCar * snap.dealers.multiplier)} each
              </span>
              <span className="tabular-nums">{formatTime(st.cycleTime)}</span>
            </div>
            {fast ? (
              <div className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-electric to-cyan-400">
                <div className="stripes absolute inset-0" />
              </div>
            ) : (
              <Progress value={f.progress * 100} smooth={f.progress > 0.02} />
            )}
          </div>
        </div>

        {/* Main actions */}
        <div className="mt-3 flex gap-2">
          {!st.automated && (
            <Button
              size="lg"
              className={cn("flex-1", isIdleManual && "animate-pulse-soft")}
              variant={isIdleManual ? "gold" : "secondary"}
              onClick={() => (isIdleManual ? build(id) : rush(id))}
            >
              {isIdleManual ? <Hammer /> : <Zap />}
              {isIdleManual ? "BUILD" : "RUSH"}
            </Button>
          )}
          <CostButton
            className="flex-1"
            size="lg"
            cost={purchase.cost}
            onBuy={() => buyLevels(id)}
            label={
              <>
                Level up ×{purchase.count}
                {nextMs && <span className="normal-case opacity-70">· ×2 speed at {nextMs}</span>}
              </>
            }
          />
        </div>
        {nextMs && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-white/40">
            <span className="whitespace-nowrap">Lv {prevMs}</span>
            <Progress value={msProgress} className="h-1" indicatorClassName="from-gold to-amber-300" />
            <span className="whitespace-nowrap">Lv {nextMs}</span>
          </div>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.06]"
        >
          <span>Upgrades, lines, cars & manager</span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <FactoryDetails id={id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

function FactoryDetails({ id }: { id: FactoryId }) {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { buyUpgrade, buyLine, selectCar } = useGame.getState();
  const cfg = FACTORY_BY_ID[id];
  const f = state.factories[id];
  const st = snap.factories[id]!;
  const cars = buildableCars(state, id, snap.gm);
  const cap = factoryTierCap(state, id);

  return (
    <div className="space-y-4 border-t border-white/[0.06] p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {UPGRADES.map((u) => {
          const Icon = UPGRADE_ICONS[u.id];
          const lvl = f.upgrades[u.id];
          const unlocksTier = u.id === "technology" && cap < cfg.maxTier;
          return (
            <div key={u.id} className={cn("flex flex-col rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.06]", unlocksTier && "ring-gold/30")}>
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-sky-300" />
                <span className="text-xs font-semibold">{u.name}</span>
                <span className="ml-auto text-[10px] tabular-nums text-white/40">
                  {lvl}/{u.maxLevel}
                </span>
              </div>
              <p className="mt-1 min-h-[2.4em] text-[10px] leading-tight text-white/45">
                {unlocksTier ? `Unlocks tier ${cap + 1} cars here.` : u.description}
              </p>
              <CostButton size="sm" className="mt-2 w-full" variant={unlocksTier ? "gold" : "default"} cost={upgradeCost(state, id, u.id, snap.gm)} onBuy={() => buyUpgrade(id, u.id)} />
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Production lines</span>
            <span className="tabular-nums text-white/50">
              {f.lines}/{cfg.maxLines}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-white/45">Each line builds one more car per batch.</p>
          <CostButton size="sm" className="mt-2 w-full" cost={lineCost(state, id)} onBuy={() => buyLine(id)} label={<><Plus className="!size-3" /> Add line</>} />
        </div>
        <ManagerSlot id={id} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">Production model</span>
          <span className="text-white/40">
            Build {formatTime(st.buildTime)} + delivery {formatTime(st.deliveryTime)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CarChip active={f.carId === null} onClick={() => selectCar(id, null)}>
            Auto (best)
          </CarChip>
          {cars.map((c) => (
            <CarChip key={c.id} active={f.carId === c.id} onClick={() => selectCar(id, c.id)}>
              {c.emoji} {c.name}
            </CarChip>
          ))}
          {cap < cfg.maxTier && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-white/35 ring-1 ring-dashed ring-white/10">
              <Lock className="size-3" /> Tier {cap + 1} via Technology
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CarChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition",
        active ? "bg-electric/20 text-sky-200 ring-electric/50" : "bg-white/[0.03] text-white/60 ring-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function ManagerSlot({ id }: { id: FactoryId }) {
  const state = useGame((g) => g.state);
  const { hireManager, assignManager, setView } = useGame.getState();
  const current = managerAt(state, id);
  const idle = MANAGERS.filter((m) => state.managers[m.id].hired && !state.managers[m.id].assignedTo);
  const hireable = MANAGERS.find((m) => !state.managers[m.id].hired && isManagerUnlocked(state, m.id));

  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
      <div className="text-xs font-semibold">Manager</div>
      {current ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-2xl">{current.avatar}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">
              {current.name} <span className="font-normal text-white/40">Lv {state.managers[current.id].level}</span>
            </div>
            <div className="text-[10px] text-emerald-300">{describeBonus(current.bonus, state.managers[current.id].level)}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => assignManager(current.id, null)}>
            Unassign
          </Button>
        </div>
      ) : idle.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {idle.map((m) => (
            <Button key={m.id} size="sm" variant="secondary" onClick={() => assignManager(m.id, id)}>
              {m.avatar} Assign {m.name}
            </Button>
          ))}
        </div>
      ) : hireable ? (
        <div className="mt-1.5">
          <p className="text-[10px] text-white/45">
            {hireable.avatar} {hireable.name} · {describeBonus(hireable.bonus, 1)}. Managers also automate a plant.
          </p>
          <CostButton size="sm" className="mt-2 w-full" cost={hireable.cost} onBuy={() => hireManager(hireable.id, id)} label={<><UserPlus className="!size-3" /> Hire & assign</>} />
        </div>
      ) : (
        <button onClick={() => setView("managers")} className="mt-1.5 text-[11px] text-sky-300 underline-offset-2 hover:underline">
          All managers busy — view team
        </button>
      )}
    </div>
  );
}

export function LockedFactoryCard({ id, highlight }: { id: FactoryId; highlight: boolean }) {
  const cash = useGame((g) => g.state.cash);
  const snap = useGame((g) => g.snap);
  const buyFactory = useGame((g) => g.buyFactory);
  const cfg = FACTORY_BY_ID[id];
  const req = factoryRequirement(snap, id);
  const pct = Math.min(100, (cash / cfg.cost) * 100);

  if (!highlight) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.02] p-3 opacity-60 ring-1 ring-white/[0.05]">
        <span className="text-xl grayscale">{cfg.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white/70">{cfg.name}</div>
          <div className="text-[11px] text-white/35">
            {cfg.city} · {formatMoney(cfg.cost)}
          </div>
        </div>
        <Lock className="size-4 text-white/30" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-4 ring-1 ring-dashed ring-white/15" style={{ background: `linear-gradient(135deg, ${cfg.accent}14, transparent 60%)` }}>
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-white/5 text-2xl ring-1 ring-white/10">{cfg.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{cfg.name}</h3>
            <Badge variant="gold">Next</Badge>
          </div>
          <div className="text-xs text-white/50">
            {cfg.city} · {cfg.continent} · {cfg.baseLines} lines · ×{cfg.valueMult} value · ×{cfg.speedMult} speed
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={pct} className="h-2.5" indicatorClassName="from-gold to-amber-300" />
        <span className="w-12 text-right text-xs tabular-nums text-white/60">{Math.floor(pct)}%</span>
      </div>
      <CostButton className="mt-3 w-full" size="lg" variant="gold" cost={cfg.cost} locked={!!req} onBuy={() => buyFactory(id)} label={req ?? "Buy factory"} />
    </div>
  );
}

