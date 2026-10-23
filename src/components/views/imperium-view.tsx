"use client";

import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BASE_MAX_LEVEL, PLANT_LEVEL_UNLOCKS } from "@/game/config/chain";
import { IMPERIUM, STAR_UPGRADES } from "@/game/config/imperium";
import { canImperium, pendingStars, starCost, starLevel } from "@/game/engine/imperium";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** Reset Imperium (the reset for ⭐ Stars), the Star upgrades shop, and the plant levels opened by total earnings. */
export function ImperiumView() {
  const state = useGame((g) => g.view.state);
  const { imperium, buyStarUpgrade } = useGame.getState();
  const [confirm, setConfirm] = useState(false);
  const { t } = useT();
  const ready = canImperium(state);
  const stars = pendingStars(state);
  const runPct = Math.min(100, (state.run.moneyEarned / IMPERIUM.minRunEarnings) * 100);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b0f2e] via-[#100b1c] to-[#07080b] p-4 ring-1 ring-violet-400/30">
        <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-3xl ring-1 ring-violet-300/40">👑</div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black">{t("imperium.title")}</div>
            <div className="text-[11px] text-white/55">{t("imperium.subtitle")}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tabular-nums text-gold">⭐ {formatNumber(state.stars)}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">{t("imperium.stars")}</div>
          </div>
        </div>

        <div className="relative mt-3 space-y-1.5 rounded-2xl bg-black/30 p-3 text-xs ring-1 ring-white/10">
          <Req ok={runPct >= 100} label={t("imperium.req2", { amount: formatMoney(IMPERIUM.minRunEarnings), pct: Math.floor(runPct) })} />
          <div className="pt-1 text-white/50">{t("imperium.grants", { n: formatNumber(stars) })}</div>
          <div className="text-[11px] text-white/40">Progresul tău este 100% permanent! Colecționează Stele ⭐ fără a pierde fabricile.</div>
          <Button variant={ready ? "gold" : "locked"} disabled={!ready} size="lg" className="mt-1 w-full" onClick={() => setConfirm(true)}>
            👑 {t("imperium.button")}
          </Button>
        </div>

        <div className="relative mt-3 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("imperium.shop")}</div>
          {STAR_UPGRADES.map((u) => {
            const lvl = starLevel(state, u.id);
            const cost = starCost(state, u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.07]">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xl">{u.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{t(`star.${u.id}` as MessageKey)}</span>
                    <Badge variant="muted">
                      {lvl}/{u.max}
                    </Badge>
                  </div>
                  <div className="text-[11px] leading-snug text-white/50">{t(`starHint.${u.id}` as MessageKey, { pct: formatPercent(u.step), total: formatPercent(u.step * lvl) })}</div>
                </div>
                {cost === null ? (
                  <Badge variant="gold">MAX</Badge>
                ) : (
                  <Button size="sm" variant={state.stars >= cost ? "gold" : "locked"} disabled={state.stars < cost} onClick={() => buyStarUpgrade(u.id)}>
                    ⭐ {cost}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <PlantLevels earned={state.lifetime.moneyEarned} />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <div className="mb-3 text-5xl">👑</div>
          <DialogTitle>{t("imperium.title")}</DialogTitle>
          <DialogDescription className="mt-2">{t("imperium.confirm", { n: formatNumber(stars) })}</DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
              {t("imperium.notYet")}
            </Button>
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => {
                setConfirm(false);
                imperium();
              }}
            >
              {t("imperium.button")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Levels 11–15: what total earnings open each one, and how far the company is. */
function PlantLevels({ earned }: { earned: number }) {
  const { t } = useT();
  return (
    <div className="glass space-y-2 rounded-2xl p-4">
      <div className="text-sm font-bold">🏗️ {t("imperium.levels")}</div>
      <p className="text-[11px] leading-snug text-white/55">{t("imperium.levelsHint")}</p>
      <div className="text-[11px] text-white/45">{t("imperium.earnedTotal", { amount: formatMoney(earned) })}</div>
      <div className="grid gap-1.5 @sm:grid-cols-2">
        {PLANT_LEVEL_UNLOCKS.map((need, i) => {
          const open = earned >= need;
          return (
            <div key={need} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-xs ring-1", open ? "bg-emerald-500/[0.08] ring-emerald-400/25 text-emerald-200" : "bg-white/[0.03] ring-white/10 text-white/60")}>
              {open ? <Check className="size-3.5" /> : <Lock className="size-3.5" />}
              <span className="font-bold">{t("imperium.level", { n: BASE_MAX_LEVEL + i + 1 })}</span>
              <span className="ml-auto tabular-nums">{formatMoney(need)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-2", ok ? "text-emerald-300" : "text-white/60")}>
      {ok ? <Check className="size-3.5" /> : <Lock className="size-3.5" />} {label}
    </div>
  );
}
