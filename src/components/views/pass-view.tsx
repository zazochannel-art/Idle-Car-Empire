"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SKIN_BY_ID } from "@/game/config/collection";
import { CAR_BY_ID } from "@/game/config/cars";
import { PASS, PASS_TIERS, type PassTier, type WeeklyId } from "@/game/config/pass";
import { SKINS as LIVERIES } from "@/game/config/racing";
import { passEnd, tierOf, weekEnd, weeklyProgress } from "@/game/engine/pass";
import { rewardCash } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

const WEEKLY_ICON: Record<WeeklyId, string> = { cars: "🚗", earned: "💰", races: "🏆", levels: "⬆️" };

/** The icon a tier shows: its collectible if it has one, else a Star or the money. */
function tierIcon(t: PassTier): string {
  if (t.car) return "🏎️";
  if (t.hall) return SKIN_BY_ID[t.hall].icon;
  if (t.livery) return LIVERIES[t.livery]?.emoji ?? "🎨";
  if (t.reward.stars) return "⭐";
  return "💰";
}

/** The free season pass: the season's tiers, the XP bar and this week's challenges. */
export function PassView() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { claimPassTier, claimPassAll, claimPassWeekly } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const [now] = useState(Date.now);
  const P = state.pass;
  const reached = tierOf(P.xp);
  const ready = Array.from({ length: reached }, (_, i) => i + 1).filter((x) => !P.claimed.includes(x)).length;
  const into = reached >= PASS.tiers ? PASS.xpPerTier : P.xp - reached * PASS.xpPerTier;
  // what a tier pays, in words (for its tooltip and the legend)
  const tierText = (tier: PassTier) => {
    const parts = [formatMoney(rewardCash(tier.reward, snap))];
    if (tier.reward.stars) parts.push(`⭐ ${tier.reward.stars}`);
    if (tier.reward.rp) parts.push(`🔬 ${formatNumber(tier.reward.rp)}`);
    if (tier.hall) parts.push(t("pass.hall", { name: t(`skin.${tier.hall}` as MessageKey) }));
    if (tier.livery) parts.push(t("pass.livery", { name: t(`race.skin.${tier.livery}` as MessageKey) }));
    if (tier.car) parts.push(t("pass.car", { name: n.car(CAR_BY_ID[tier.car.model]) }));
    return parts.join(" · ");
  };
  const specials = PASS_TIERS.map((x, i) => ({ x, n: i + 1 })).filter(({ x }) => x.car || x.hall || x.livery);

  return (
    <div className="space-y-4">
      <ViewHeader icon="🎟️" title={t("nav.pass")} subtitle={t("pass.subtitle")} />

      {/* the season and its XP */}
      <div className="space-y-2 rounded-2xl bg-gradient-to-br from-[#3b1d6e] via-[#24204a] to-[#141427] p-3 ring-1 ring-violet-300/25">
        <div className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gold/20 ring-1 ring-gold/60">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gold/80">{t("pass.tier")}</span>
            <span className="text-xl font-black leading-none text-gold">{reached}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black">{t("pass.season", { n: P.season })}</div>
            <div className="text-[11px] text-white/55">{t("pass.ends", { time: formatDuration((passEnd(P.season) - now) / 1000) })}</div>
          </div>
          {ready > 0 && (
            <Button size="sm" variant="gold" onClick={() => claimPassAll()}>
              {t("pass.claimAll", { n: ready })}
            </Button>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-gold" style={{ width: `${(into / PASS.xpPerTier) * 100}%` }} />
        </div>
        <div className="text-[11px] tabular-nums text-white/70">{reached >= PASS.tiers ? t("pass.complete") : t("pass.next", { xp: formatNumber(into), total: formatNumber(PASS.xpPerTier), n: reached + 1 })}</div>
        <div className="text-[10px] text-white/45">{t("pass.xpHow", { daily: PASS.xp.daily, weekly: PASS.xp.weekly })}</div>
      </div>

      {/* this week's challenges */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("pass.weekly")}</span>
          <span className="text-[11px] text-white/45">{t("pass.weekEnds", { time: formatDuration((weekEnd(P.week) - now) / 1000) })}</span>
        </div>
        {P.weekly.map((w) => {
          const p = weeklyProgress(state, w);
          const fmt = w.id === "earned" ? formatMoney : formatNumber;
          const reachedW = p >= w.target;
          return (
            <div key={w.id} className={cn("space-y-1.5 rounded-2xl p-3 ring-1", w.done ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.04] ring-white/[0.07]")}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{WEEKLY_ICON[w.id]}</span>
                <span className="min-w-0 flex-1 text-sm font-bold">{t(`pass.weekly.${w.id}` as MessageKey, { n: fmt(w.target) })}</span>
                {w.done ? (
                  <span className="text-xs font-black text-emerald-300">✓</span>
                ) : (
                  <Button size="sm" variant={reachedW ? "gold" : "locked"} disabled={!reachedW} onClick={() => claimPassWeekly(w.id)}>
                    +{PASS.xp.weekly} XP
                  </Button>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-gold" style={{ width: `${Math.min(100, (p / Math.max(1, w.target)) * 100)}%` }} />
              </div>
              <div className="text-[11px] tabular-nums text-white/50">
                {fmt(Math.min(p, w.target))} / {fmt(w.target)}
              </div>
            </div>
          );
        })}
      </div>

      {/* the 30 tiers */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("pass.tiers")}</div>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
          {PASS_TIERS.map((tier, i) => {
            const k = i + 1;
            const done = P.claimed.includes(k);
            const open = !done && k <= reached;
            const special = !!(tier.car || tier.hall || tier.livery);
            return (
              <button
                key={k}
                disabled={!open}
                onClick={() => claimPassTier(k)}
                title={tierText(tier)}
                aria-label={t("pass.tierLabel", { n: k })}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl ring-1 transition",
                  done ? "bg-emerald-500/15 ring-emerald-400/30" : open ? "animate-pulse bg-gold/25 ring-gold hover:bg-gold/35" : special ? "bg-violet-500/10 ring-violet-300/25" : "bg-white/[0.04] ring-white/10",
                )}
              >
                <span className={cn("text-lg leading-none", !done && !open && "opacity-60")}>{done ? "✓" : tierIcon(tier)}</span>
                <span className={cn("text-[10px] font-black leading-none", open ? "text-gold" : "text-white/45")}>{k}</span>
              </button>
            );
          })}
        </div>
        {/* what the special tiers bring */}
        <div className="space-y-1 rounded-2xl bg-white/[0.03] p-3 text-[11px] ring-1 ring-white/[0.06]">
          {specials.map(({ x, n: k }) => (
            <div key={k} className="flex gap-2">
              <span className="w-8 shrink-0 font-black text-gold">#{k}</span>
              <span className="text-white/65">
                {tierIcon(x)} {tierText(x)}
              </span>
            </div>
          ))}
          <p className="pt-1 text-white/45">{t("pass.leftoverNote")}</p>
        </div>
      </div>
    </div>
  );
}
