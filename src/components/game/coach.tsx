"use client";

import { AnimatePresence, motion } from "framer-motion";
import { currentTip } from "@/game/engine/tips";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";

/** First-session tips, one at a time, floating above the goal tracker. */
export function Coach() {
  const tip = useGame((g) => currentTip(g.state));
  const dismissTip = useGame((g) => g.dismissTip);
  const { t } = useT();
  return (
    <AnimatePresence>
      {tip && (
        <motion.div
          key={tip}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] z-20 flex justify-center px-3"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-sky-400/30 bg-[#0c1a2b]/90 p-3 shadow-xl backdrop-blur-xl">
            <span className="text-2xl leading-none">💡</span>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">{t(`tip.${tip}` as MessageKey)}</p>
            <button onClick={() => dismissTip(tip)} className="shrink-0 rounded-lg bg-sky-500/20 px-2.5 py-1.5 text-xs font-bold text-sky-200 ring-1 ring-sky-400/30">
              {t("tip.ok")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
