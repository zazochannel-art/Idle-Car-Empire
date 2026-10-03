"use client";

import { Check, Globe2, Lock, Star } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { IMPERIUM, STAR_UPGRADES } from "@/game/config/imperium";
import { EMPIRE_PERKS, PRESTIGE } from "@/game/config/prestige";
import { REGIONS, regionIndex, type RegionConfig } from "@/game/config/regions";
import type { Effect } from "@/game/types";
import { canImperium, pendingStars, starCost, starLevel } from "@/game/engine/imperium";
import { canPrestige, earningsForNextPoint, pendingPoints } from "@/game/engine/prestige";
import { formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

export function PrestigeView() {
  const state = useGame((g) => g.state);
  const prestige = useGame((g) => g.prestige);
  const [confirm, setConfirm] = useState(false);
  const { t, lang } = useT();
  const n = useContent(lang);

  const pending = pendingPoints(state);
  const ready = canPrestige(state);
  const runPct = Math.min(100, (state.run.moneyEarned / PRESTIGE.minRunEarnings) * 100);
  const nextAt = earningsForNextPoint(state);
  const bonusNow = state.empirePoints * PRESTIGE.incomePerPoint;
  const bonusAfter = (state.empirePoints + pending) * PRESTIGE.incomePerPoint;

  return (
    <div className="space-y-4">
      <RegionRoute />
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1505] via-[#0f0d07] to-[#07080b] p-6 ring-1 ring-gold/25">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/40">
            <Star className="size-8 fill-gold text-gold" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/70">{t("prestige.points")}</div>
            <div className="text-4xl font-black tabular-nums text-gradient-gold">{formatNumber(state.empirePoints)}</div>
            <div className="text-sm text-white/60">
              {t("prestige.summary", { bonus: formatPercent(bonusNow), n: state.prestigeCount })}
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 @sm:grid-cols-2">
          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-white/50">{t("prestige.grants")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-gold">+{formatNumber(pending)} {t("unit.ep")}</div>
            <div className="text-xs text-white/50">
              {t("prestige.incomeBonus")} {formatPercent(bonusNow)} → <span className="text-gold">{formatPercent(bonusAfter)}</span>
            </div>
            <div className="mt-2 text-[11px] text-white/40">{t("prestige.nextPoint", { amount: formatMoney(nextAt) })}</div>
          </div>
          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-white/50">{t("prestige.requirement", { amount: formatMoney(PRESTIGE.minRunEarnings) })}</div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={runPct} indicatorClassName="from-gold to-amber-300" />
              <span className="text-xs tabular-nums text-white/60">{Math.floor(runPct)}%</span>
            </div>
            <div className="mt-1 text-[11px] text-white/40">{t("prestige.thisRun", { amount: formatMoney(state.run.moneyEarned) })}</div>
            <Button variant={ready ? "gold" : "locked"} disabled={!ready} size="lg" className="mt-3 w-full" onClick={() => setConfirm(true)}>
              <Globe2 /> {t("nav.prestige").toUpperCase()}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 @sm:grid-cols-2">
        <div className="glass rounded-2xl p-4 text-sm">
          <div className="mb-2 font-semibold text-rose-300">{t("prestige.resets")}</div>
          <ul className="space-y-1 text-white/60">
            <li>• {t("prestige.reset1")}</li>
            <li>• {t("prestige.reset2")}</li>
            <li>• {t("prestige.reset3")}</li>
            <li>• {t("prestige.reset4")}</li>
          </ul>
        </div>
        <div className="glass rounded-2xl p-4 text-sm">
          <div className="mb-2 font-semibold text-emerald-300">{t("prestige.keeps")}</div>
          <ul className="space-y-1 text-white/60">
            <li>• {t("prestige.keep1", { pct: formatPercent(PRESTIGE.incomePerPoint) })}</li>
            <li>• {t("prestige.keep2")}</li>
            <li>• {t("prestige.keep3")}</li>
            <li>• {t("prestige.keep4")}</li>
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("prestige.perks")}</h3>
        <div className="grid gap-2 @sm:grid-cols-2 @3xl:grid-cols-3">
          {EMPIRE_PERKS.map((p) => {
            const active = state.empirePoints >= p.points;
            return (
              <div key={p.name} className={cn("flex items-center gap-3 rounded-2xl p-3 ring-1", active ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.02] ring-white/[0.06]")}>
                <div className={cn("flex size-10 items-center justify-center rounded-xl", active ? "bg-gold/20 text-gold" : "bg-white/5 text-white/30")}>
                  {active ? <Check className="size-5" /> : <Lock className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {n.perk(p)}
                    <span className="text-[11px] font-normal text-gold/70">{formatNumber(p.points)} {t("unit.ep")}</span>
                  </div>
                  <div className="text-xs text-white/50">{n.perkDesc(p)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ImperiumSection />

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <div className="mb-3 text-5xl">🌍</div>
          <DialogTitle>{t("nav.prestige")}</DialogTitle>
          <DialogDescription className="mt-2">
            {t("prestige.confirm", { n: formatNumber(pending), bonus: formatPercent(bonusAfter) })}
          </DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
              {t("prestige.notYet")}
            </Button>
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => {
                setConfirm(false);
                prestige();
              }}
            >
              {t("prestige.expand")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Local Factory → Romania → … → Global Empire: where each expansion takes you. */
function RegionRoute() {
  const count = useGame((g) => g.state.prestigeCount);
  const { t, lang } = useT();
  const n = useContent(lang);
  const at = regionIndex(count);
  const next = REGIONS[at + 1];
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 text-sm font-semibold">{t("region.title")}</div>
      <div className="flex items-center">
        {REGIONS.map((r, i) => (
          <div key={r.id} className={cn("flex items-center", i > 0 && "flex-1")}>
            {i > 0 && <span className={cn("h-0.5 min-w-1 flex-1", i <= at ? "bg-gold" : "bg-white/15")} />}
            <div
              title={n.region(r)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-lg ring-1",
                i === at ? "bg-gold/20 ring-gold" : i < at ? "bg-gold/[0.07] ring-gold/30" : "bg-white/[0.03] opacity-60 ring-white/10",
              )}
            >
              {r.emoji}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 @sm:grid-cols-2">
        <RegionCard region={REGIONS[at]} label={t("region.here")} current />
        {next ? <RegionCard region={next} label={t("region.next")} /> : <p className="self-center text-xs text-gold">{t("region.max")}</p>}
      </div>
    </div>
  );
}

function RegionCard({ region, label, current }: { region: RegionConfig; label: string; current?: boolean }) {
  const { t, lang } = useT();
  const n = useContent(lang);
  return (
    <div className={cn("rounded-xl p-3 ring-1", current ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.03] ring-white/10")}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-0.5 text-base font-black">
        {region.emoji} {n.region(region)}
      </div>
      <div className="text-[11px] text-white/50">{n.regionFlavor(region)}</div>
      {region.effects.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px]">
          {region.effects.map((e, i) => (
            <li key={i} className={e.kind === "costMult" ? "text-rose-300" : "text-emerald-300"}>
              {effectText(e, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function effectText(e: Effect, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  const x = (m: number) => Number(m.toFixed(2));
  switch (e.kind) {
    case "value":
      return t(e.minTier ? "regionFx.valueHigh" : "regionFx.value", { n: x(e.mult) });
    case "markup":
    case "offline":
      return t(`regionFx.${e.kind}`, { pct: formatPercent(e.add) });
    case "income":
    case "speed":
    case "delivery":
    case "dealerCap":
    case "costMult":
      return t(`regionFx.${e.kind}`, { n: x(e.mult) });
    default:
      return "";
  }
}

/** Reset Imperium: the end-game reset for ⭐ Stars, and the Star upgrades shop. */
function ImperiumSection() {
  const state = useGame((g) => g.state);
  const { imperium, buyStarUpgrade } = useGame.getState();
  const [confirm, setConfirm] = useState(false);
  const { t } = useT();
  const ready = canImperium(state);
  const stars = pendingStars(state);
  const expansions = Math.min(state.prestigeCount, IMPERIUM.minExpansions);
  const runPct = Math.min(100, (state.run.moneyEarned / IMPERIUM.minRunEarnings) * 100);

  return (
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
        <Req ok={state.prestigeCount >= IMPERIUM.minExpansions} label={t("imperium.req1", { done: expansions, total: IMPERIUM.minExpansions })} />
        <Req ok={runPct >= 100} label={t("imperium.req2", { amount: formatMoney(IMPERIUM.minRunEarnings), pct: Math.floor(runPct) })} />
        <div className="pt-1 text-white/50">{t("imperium.grants", { n: formatNumber(stars) })}</div>
        <div className="text-[11px] text-white/40">{t("imperium.resets")}</div>
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

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <div className="mb-3 text-5xl">👑</div>
          <DialogTitle>{t("imperium.title")}</DialogTitle>
          <DialogDescription className="mt-2">{t("imperium.confirm", { n: formatNumber(stars) })}</DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
              {t("prestige.notYet")}
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

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-2", ok ? "text-emerald-300" : "text-white/60")}>
      {ok ? <Check className="size-3.5" /> : <Lock className="size-3.5" />} {label}
    </div>
  );
}
