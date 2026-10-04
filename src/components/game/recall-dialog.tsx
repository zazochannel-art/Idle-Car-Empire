"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { RECALL } from "@/game/config/market";
import { carValue } from "@/game/engine/chain";
import { recallCost } from "@/game/engine/market";
import { formatMoney, formatPercent } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/** ⚠️ A batch of cars has a defect: recall them (money, trust) or gamble on silence. */
export function RecallDialog() {
  const recall = useGame((g) => g.state.quality.recall);
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const pay = useGame((g) => g.payRecall);
  const ignore = useGame((g) => g.ignoreRecall);
  const busy = useUi((u) => !!u.celebrate);
  const { t } = useT();
  const show = !!recall && !busy;
  const car = recall ? CAR_BY_ID[recall.car] : null;
  const cost = recall && car ? recallCost(state, carValue(state, car, snap.gm)) : 0;
  return (
    <AnimatePresence>
      {show && car && recall && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ scale: 0.85, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            className="w-[min(92vw,22rem)] rounded-3xl border border-amber-400/40 bg-ink/95 p-5 text-center shadow-[0_20px_80px_-20px_rgba(245,158,11,.5)]"
          >
            <div className="text-5xl">⚠️</div>
            <div className="mt-2 text-lg font-black text-amber-200">{t("recall.title")}</div>
            <p className="mt-1 text-sm text-white/70">{t("recall.body", { cars: recall.cars, model: state.designs[car.id].name })}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-left text-[11px]">
              <div className="rounded-xl bg-emerald-500/10 p-2 ring-1 ring-emerald-400/25">
                <div className="font-bold text-emerald-200">{t("recall.payTitle")}</div>
                <div className="text-white/60">{t("recall.payDesc", { rep: RECALL.repPaid })}</div>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/25">
                <div className="font-bold text-rose-200">{t("recall.ignoreTitle")}</div>
                <div className="text-white/60">{t("recall.ignoreDesc", { chance: formatPercent(RECALL.scandalChance), rep: -RECALL.repScandal })}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="gold" disabled={state.cash < cost} onClick={() => pay(cost)}>
                {t("recall.pay", { cost: formatMoney(cost) })}
              </Button>
              <Button variant="secondary" onClick={() => ignore()}>
                {t("recall.ignore")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
