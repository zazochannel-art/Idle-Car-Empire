"use client";

import { Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CITIES, CITY_IDS, CITY_RULES } from "@/game/config/cities";
import * as Cy from "@/game/engine/cities";
import { formatMoney, formatNumber } from "@/game/format";
import type { CityId, GameState } from "@/game/types";
import { useT } from "@/i18n/use-t";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { ViewHeader } from "./section-title";

const pct = (x: number) => Math.round(x * 100);

/** 🌍 The company's cities: each one's wallet and income, moving between them, opening a new one. */
export function WorldView() {
  const state = useGame((g) => g.view.state);
  const steady = useGame((g) => g.view.snap.steadyIncomePerSec);
  const { t } = useT();
  const home = t("city.home");
  return (
    <div className="space-y-3">
      <ViewHeader icon="🌍" title={t("nav.world")} subtitle={t("world.subtitle")} />
      {CITY_IDS.map((id) => (Cy.ownsCity(state, id) ? <CityCard key={id} id={id} state={state} steady={steady} /> : <LockedCity key={id} id={id} state={state} />))}
      <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 text-[11px] leading-snug text-white/70 ring-1 ring-white/[0.07]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/45">{t("world.rulesTitle")}</div>
        <p>💰 {t("world.rule.wallets")}</p>
        <p>🛰️ {t("world.rule.autopilot", { pct: pct(CITY_RULES.passiveShare) })}</p>
        <p>🏢 {t("world.rule.company")}</p>
        <p>🏁 {t("world.rule.racing", { home })}</p>
      </div>
    </div>
  );
}

/** The island's picture: its minimap. */
function Island({ id, dim }: { id: CityId; dim?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${CITIES[id].assets}/minimap.webp`} alt="" className={cn("aspect-[3/2] w-full rounded-xl object-cover ring-1 ring-white/10", dim && "opacity-45 grayscale-[0.6]")} draggable={false} />
  );
}

function CityCard({ id, state, steady }: { id: CityId; state: GameState; steady: number }) {
  const { t } = useT();
  const go = useGame((g) => g.switchCity);
  const here = state.activeCity === id;
  const name = t(`city.${id}`);
  const income = Cy.cityIncome(state, id, steady);
  return (
    <div className={cn("space-y-2.5 rounded-2xl p-3 ring-1", here ? "bg-gold/[0.07] ring-gold/40" : "bg-white/[0.04] ring-white/[0.08]")}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{CITIES[id].emoji}</span>
        <div className="min-w-0 flex-1 truncate text-base font-black">{name}</div>
        {here ? <Badge variant="gold">{t("world.here")}</Badge> : <Badge variant="muted">{t("world.autopilot", { pct: pct(CITY_RULES.passiveShare) })}</Badge>}
      </div>
      <Island id={id} />
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Figure label={t("world.wallet")} value={formatMoney(Cy.walletOf(state, id))} gold />
        <Figure label={here ? t("world.income") : t("world.autoIncome")} value={`${formatMoney(income)}${t("unit.perSec")}`} />
        <Figure label={t("world.plants")} value={formatNumber(Cy.cityPlants(state, id))} />
      </div>
      {!here && (
        <Button
          variant="gold"
          className="w-full"
          onClick={() => {
            if (go(id)) {
              cue("buy");
              useUi.getState().setView(null);
            }
          }}
        >
          {CITIES[id].emoji} {t("world.go", { name })}
        </Button>
      )}
    </div>
  );
}

function LockedCity({ id, state }: { id: CityId; state: GameState }) {
  const { t } = useT();
  const unlock = useGame((g) => g.unlockCity);
  const st = Cy.cityUnlockStatus(state, id);
  const name = t(`city.${id}`);
  const home = t("city.home");
  const wallet = Cy.walletOf(state, "home");
  const steps = [
    { ok: st.territories >= st.needed, label: t("world.reqTerritories", { home, n: st.territories, total: st.needed }) },
    { ok: wallet >= st.price, label: t("world.reqCash", { home, money: formatMoney(st.price) }) },
  ];
  return (
    <div className={cn("space-y-2.5 rounded-2xl p-3 ring-1", st.ready ? "bg-sky-500/[0.08] ring-sky-300/40" : "bg-white/[0.03] ring-white/[0.07]")}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{CITIES[id].emoji}</span>
        <div className="min-w-0 flex-1 truncate text-base font-black">{name}</div>
        {st.ready ? <Badge variant="success">{t("world.ready")}</Badge> : <Lock className="size-4 text-white/35" />}
      </div>
      <Island id={id} dim={!st.ready} />
      <p className="text-[12px] leading-snug text-white/70">{t("world.unlockBody")}</p>
      <div className="space-y-1">
        {steps.map((s) => (
          <div key={s.label} className={cn("flex items-start gap-1.5 text-[12px]", s.ok ? "text-emerald-200" : "text-white/55")}>
            {s.ok ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <Lock className="mt-0.5 size-3.5 shrink-0" />}
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <Button
        variant={st.ready ? "gold" : "locked"}
        className="w-full"
        onClick={() => {
          if (!st.ready) return cue("error");
          if (unlock(id)) cue("buy");
        }}
      >
        {CITIES[id].emoji} {t("world.unlock", { name, money: formatMoney(st.price) })}
      </Button>
    </div>
  );
}

function Figure({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-black/20 px-1.5 py-2 ring-1 ring-white/[0.06]">
      <div className="truncate text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={cn("truncate text-sm font-black tabular-nums", gold && "text-gold")}>{value}</div>
    </div>
  );
}
