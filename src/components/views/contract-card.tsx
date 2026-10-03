"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CAR_BY_ID } from "@/game/config/cars";
import { plantsOf } from "@/game/engine/chain";
import { contractProgress, type Contract } from "@/game/engine/contracts";
import { rewardCash } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/** The customer contract: an offer to accept, a running order, or a payout. */
export function ContractCard() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { acceptContract, declineContract, claimContract } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const k = state.contracts;
  const c: Contract | null = k.active ?? k.offer;
  const now = state.lastActiveAt;

  if (!c) {
    const waiting = plantsOf(state).some(([, b]) => b.type === "assemblyPlant");
    return <p className="rounded-2xl bg-white/[0.03] p-3 text-xs text-white/45 ring-1 ring-white/[0.06]">{waiting ? t("contract.none", { time: formatDuration(Math.max(0, k.nextAt - now) / 1000) }) : t("contract.needsAssembly")}</p>;
  }

  const car = CAR_BY_ID[c.car];
  const done = contractProgress(state, c);
  const finished = !!k.active && done >= c.n;
  const pay = rewardCash(c.reward, snap);
  const onLine = Object.values(snap.chain.plants).some((p) => p.car?.id === c.car);
  const assembly = plantsOf(state).find(([, b]) => b.type === "assemblyPlant")?.[0];

  return (
    <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 to-transparent p-3 ring-1 ring-emerald-400/30">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{car.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">{t(`contract.client.${c.client}` as MessageKey)}</div>
          <div className="text-sm font-bold">{t("contract.order", { n: formatNumber(c.n), car: `${state.designs[c.car].name} (${n.car(car)})` })}</div>
          <div className="text-[11px] text-white/55">
            {t("contract.reward", { cash: formatMoney(pay) })}
            {c.reward.stars ? ` + ${c.reward.stars} ⭐` : ""}
            {" · "}
            {k.active ? t("contract.left", { time: formatDuration(Math.max(0, (c.deadline ?? now) - now) / 1000) }) : t("contract.time", { m: c.minutes })}
          </div>
        </div>
      </div>
      {k.active && (
        <div className="mt-2 flex items-center gap-2">
          <Progress value={Math.min(100, (done / c.n) * 100)} className="h-1.5" indicatorClassName="from-emerald-400 to-emerald-300" />
          <span className="shrink-0 text-[11px] tabular-nums text-white/60">
            {formatNumber(Math.min(done, c.n))}/{formatNumber(c.n)}
          </span>
        </div>
      )}
      {k.active && !finished && !onLine && (
        <button onClick={() => assembly && useUi.getState().selectPlot(assembly)} className="mt-2 text-left text-[11px] text-amber-300 underline-offset-2 hover:underline">
          ⚠️ {t("contract.setModel", { car: state.designs[c.car].name })}
        </button>
      )}
      <div className="mt-2 flex gap-2">
        {k.offer && !k.active && (
          <>
            <Button size="sm" variant="secondary" className="flex-1" onClick={declineContract}>
              {t("contract.decline")}
            </Button>
            <Button size="sm" variant="gold" className="flex-1" onClick={acceptContract}>
              {t("contract.accept")}
            </Button>
          </>
        )}
        {finished && (
          <Button size="sm" variant="gold" className="w-full" onClick={claimContract}>
            {t("contract.claim")}
          </Button>
        )}
      </div>
    </div>
  );
}
