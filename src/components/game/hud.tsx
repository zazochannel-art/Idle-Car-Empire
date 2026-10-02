"use client";

import { Car, Factory, Moon, Settings, Star, Sun, Sunset, SunMoon, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TIME_MODES } from "@/components/map/lighting";
import { formatMoney, formatNumber } from "@/game/format";
import { LANGS } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { plantsOf } from "@/game/engine/chain";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { AnimatedNumber } from "./animated-number";

const money = (n: number) => formatMoney(n);
const count = (n: number) => formatNumber(Math.floor(n));

/** Top bar floating over the map: cash, profit/s, cars, factories, Empire Points. */
export function Hud({ onSettings }: { onSettings: () => void }) {
  const cash = useGame((g) => g.state.cash);
  const income = useGame((g) => g.snap.incomePerSec);
  // before the first car, count the parts the plants have made
  const cars = useGame((g) => g.state.lifetime.carsProduced);
  const parts = useGame((g) => Object.values(g.state.lifetime.parts).reduce((a, b) => a + b, 0));
  const owned = useGame((g) => plantsOf(g.state).length);
  const trucks = useGame((g) => g.state.chain.shipments.length);
  const ep = useGame((g) => g.state.empirePoints);
  const setView = useUi((u) => u.setView);
  const { t } = useT();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex items-start gap-2 p-2 sm:p-3">
        <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-ink/75 p-1.5 shadow-[0_10px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl md:flex-nowrap md:gap-2 md:p-2">
          <div className="relative flex min-w-0 items-center gap-2 pl-1 pr-2">
            <CashFlash cash={cash} />
            <span className="text-xl md:text-2xl">💰</span>
            <div className="min-w-0">
              <div className="hidden text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40 md:block">{t("hud.cash")}</div>
              <AnimatedNumber value={cash} format={money} className="block truncate text-lg font-black tabular-nums leading-tight text-gradient-gold md:text-2xl" />
            </div>
          </div>
          <Pill icon={<TrendingUp className="size-3.5 text-emerald-400" />} label={t("hud.profit")} value={`${formatMoney(income)}${t("unit.perSec")}`} />
          <Pill icon={<Car className="size-3.5 text-sky-400" />} label={cars > 0 ? t("hud.cars") : t("hud.parts")} value={<AnimatedNumber value={cars > 0 ? cars : parts} format={count} />} />
          <div className="hidden sm:block">
            <Pill icon={<Factory className="size-3.5 text-cyan-300" />} label={t("hud.factories")} value={`${owned} · 🚚${trucks}`} />
          </div>
          <button onClick={() => setView("prestige")} className="text-left">
            <Pill icon={<Star className="size-3.5 fill-gold text-gold" />} label={t("hud.prestige")} value={formatNumber(ep)} gold />
          </button>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col gap-1.5 md:flex-row">
          <TimeButton />
          <LanguageSwitch />
          <button
            onClick={onSettings}
            className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-ink/75 text-white/60 backdrop-blur-xl transition hover:text-white"
            aria-label={t("settings.title")}
          >
            <Settings className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Pill({ icon, label, value, gold }: { icon: React.ReactNode; label: string; value: React.ReactNode; gold?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-2 py-1 ring-1 ring-white/[0.06] md:px-2.5 md:py-1.5">
      {icon}
      <div className="leading-tight">
        <div className="hidden text-[9px] font-medium uppercase tracking-wider text-white/40 xl:block">{label}</div>
        <div className={`text-xs font-bold tabular-nums md:text-sm ${gold ? "text-gold" : "text-white"}`}>{value}</div>
      </div>
    </div>
  );
}

function LanguageSwitch() {
  const lang = useGame((g) => g.state.settings.lang);
  const setLang = useGame((g) => g.setLang);
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-ink/75 px-2.5 text-xs font-bold text-white/70 backdrop-blur-xl transition hover:text-white"
        aria-label="Language"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current.flag}</span>
        {current.short}
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-12 z-50 w-40 overflow-hidden rounded-xl p-1">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setLang(l.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${l.id === lang ? "bg-electric/20 text-white" : "text-white/70 hover:bg-white/5"}`}
            >
              <span className="text-base">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A soft golden glow behind the cash counter whenever money comes in. */
function CashFlash({ cash }: { cash: number }) {
  const last = useRef(cash);
  const lastPulse = useRef(0);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    // at most one glow every 1.5 s, so steady income doesn't flicker
    const now = performance.now();
    if (cash > last.current + 0.5 && now - lastPulse.current > 1500) {
      lastPulse.current = now;
      setPulse((n) => n + 1);
    }
    last.current = cash;
  }, [cash]);
  return <span key={pulse} className="cash-flash pointer-events-none absolute inset-0 rounded-xl" aria-hidden />;
}

const TIME_ICONS = { auto: SunMoon, day: Sun, evening: Sunset, night: Moon } as const;

function TimeButton() {
  const mode = useUi((u) => u.timeMode);
  const setTimeMode = useUi((u) => u.setTimeMode);
  const { t } = useT();
  const Icon = TIME_ICONS[mode];
  return (
    <button
      onClick={() => setTimeMode(TIME_MODES[(TIME_MODES.indexOf(mode) + 1) % TIME_MODES.length])}
      className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-ink/75 text-amber-200/80 backdrop-blur-xl transition hover:text-amber-100"
      aria-label={t(`time.${mode}`)}
      title={t(`time.${mode}`)}
    >
      <Icon className="size-5" />
    </button>
  );
}
