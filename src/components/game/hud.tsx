"use client";

import { Car, Factory, Settings, Star, TrendingUp, Wallet } from "lucide-react";
import { FACTORIES } from "@/game/config/factories";
import { formatMoney, formatNumber } from "@/game/format";
import { useGame } from "@/store/game-store";
import { AnimatedNumber } from "./animated-number";

const money = (n: number) => formatMoney(n);
const count = (n: number) => formatNumber(Math.floor(n));

export function Hud({ onSettings }: { onSettings: () => void }) {
  const cash = useGame((g) => g.state.cash);
  const income = useGame((g) => g.snap.incomePerSec);
  const cars = useGame((g) => g.state.lifetime.carsProduced);
  const owned = useGame((g) => FACTORIES.filter((f) => g.state.factories[f.id].owned).length);
  const ep = useGame((g) => g.state.empirePoints);
  const setView = useGame((g) => g.setView);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold/25 to-gold/5 ring-1 ring-gold/30">
            <Wallet className="size-5 text-gold" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Cash</div>
            <AnimatedNumber value={cash} format={money} className="block truncate text-2xl font-bold tabular-nums text-gradient-gold sm:text-3xl" />
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Stat icon={<TrendingUp className="size-4 text-emerald-400" />} label="Profit/sec" value={`${formatMoney(income)}/s`} />
          <Stat icon={<Car className="size-4 text-sky-400" />} label="Cars produced" value={<AnimatedNumber value={cars} format={count} />} />
          <Stat icon={<Factory className="size-4 text-cyan-300" />} label="Factories" value={`${owned}/${FACTORIES.length}`} />
          <button onClick={() => setView("prestige")} className="text-left">
            <Stat icon={<Star className="size-4 fill-gold text-gold" />} label="Prestige" value={formatNumber(ep)} gold />
          </button>
        </div>

        <button
          onClick={onSettings}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white/50 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-white"
          aria-label="Settings"
        >
          <Settings className="size-5" />
        </button>
      </div>

      {/* Compact stat strip on phones */}
      <div className="mx-auto grid max-w-6xl grid-cols-4 gap-1.5 px-3 pb-2.5 md:hidden">
        <MiniStat icon={<TrendingUp className="size-3.5 text-emerald-400" />} value={`${formatMoney(income)}/s`} />
        <MiniStat icon={<Car className="size-3.5 text-sky-400" />} value={<AnimatedNumber value={cars} format={count} />} />
        <MiniStat icon={<Factory className="size-3.5 text-cyan-300" />} value={`${owned}/${FACTORIES.length}`} />
        <button onClick={() => setView("prestige")}>
          <MiniStat icon={<Star className="size-3.5 fill-gold text-gold" />} value={formatNumber(ep)} />
        </button>
      </div>
    </header>
  );
}

function Stat({ icon, label, value, gold }: { icon: React.ReactNode; label: string; value: React.ReactNode; gold?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-1.5 ring-1 ring-white/[0.06]">
      {icon}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">{label}</div>
        <div className={`text-sm font-semibold tabular-nums ${gold ? "text-gold" : "text-white"}`}>{value}</div>
      </div>
    </div>
  );
}

function MiniStat({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1 rounded-lg bg-white/[0.04] px-1.5 py-1.5 text-xs font-semibold tabular-nums ring-1 ring-white/[0.05]">
      {icon}
      <span className="truncate">{value}</span>
    </div>
  );
}
