"use client";

import { RECALL_POLICIES } from "@/game/engine/autopilot";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** Settings → automatic decisions: what happens without asking (engine/autopilot.ts). */
export function AutoDecideSection() {
  const settings = useGame((g) => g.state.settings);
  const setAutoRecall = useGame((g) => g.setAutoRecall);
  const setAutoDecide = useGame((g) => g.setAutoDecide);
  const { t } = useT();
  const toggles = [
    { k: "autoVip", label: t("autoDecide.vip"), hint: t("autoDecide.vipHint") },
    { k: "autoFleet", label: t("autoDecide.fleet"), hint: t("autoDecide.fleetHint") },
    { k: "autoCollect", label: t("autoDecide.collect"), hint: t("autoDecide.collectHint") },
  ] as const;
  return (
    <div className="mt-4 space-y-1.5">
      <div className="text-xs font-semibold text-white/60">🤖 {t("autoDecide.title")}</div>
      <div className="space-y-1.5 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
        <div className="text-sm font-semibold">{t("autoDecide.recall")}</div>
        <div className="text-[11px] text-white/45">{t("autoDecide.recallHint")}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {RECALL_POLICIES.map((p) => (
            <button
              key={p}
              onClick={() => setAutoRecall(p)}
              className={cn("rounded-lg py-1.5 text-xs font-bold ring-1 transition", settings.autoRecall === p ? "bg-electric text-white ring-electric" : "bg-white/[0.04] text-white/70 ring-white/10")}
            >
              {t(`autoDecide.recall.${p}`)}
            </button>
          ))}
        </div>
      </div>
      {toggles.map(({ k, label, hint }) => {
        const on = settings[k];
        return (
          <button
            key={k}
            role="switch"
            aria-checked={on}
            onClick={() => setAutoDecide(k, !on)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left ring-1 ring-white/10"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-[11px] text-white/45">{hint}</span>
            </span>
            <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition", on ? "bg-emerald-500" : "bg-white/15")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
