"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { PLANT_BY_ID } from "@/game/config/chain";
import { plantsOf } from "@/game/engine/chain";
import { unlockBonus, unlockKey } from "@/game/engine/unlocks";
import { formatMoney } from "@/game/format";
import type { CarId, PlantType } from "@/game/types";
import { useContent } from "@/i18n/content";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

type Unlock = { kind: "car" | "plant"; id: string };

/**
 * NEW MODEL / NEW FACTORY: a card with a spinning sunburst and a cash bonus
 * each time something new opens up, so progress is felt, not just read.
 */
export function UnlockCard() {
  const [queue, setQueue] = useState<Unlock[]>([]);
  const celebrating = useUi((u) => !!u.celebrate);
  const { t, lang } = useT();
  const n = useContent(lang);

  useEffect(
    () =>
      uiEvents.on((e) => {
        if (e.type !== "unlock") return;
        const key = unlockKey(e.kind, e.id);
        if (useGame.getState().state.unlocks.includes(key)) return;
        setQueue((q) => (q.some((u) => unlockKey(u.kind, u.id) === key) ? q : [...q, { kind: e.kind, id: e.id }]));
      }),
    [],
  );

  // the first-car celebration plays first
  const cur = celebrating ? undefined : queue[0];
  // the bonus moves with production every tick: read it only while a card is up
  const bonus = useGame((g) => (cur ? unlockBonus(g.state) : 0));
  const next = () => setQueue((q) => q.slice(1));

  const claim = (then?: () => void) => {
    if (!cur) return;
    const paid = useGame.getState().claimUnlock(cur.kind, cur.id);
    if (paid > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: t("unlock.paid", { amount: formatMoney(paid) }) });
    next();
    then?.();
  };

  let body: { emoji: string; kicker: string; name: string; desc: string; action: string; go: () => void } | null = null;
  if (cur?.kind === "car") {
    const car = CAR_BY_ID[cur.id as CarId];
    body = {
      emoji: car.emoji,
      kicker: t("unlock.car"),
      name: n.car(car),
      desc: n.carTagline(car),
      action: t("unlock.produce"),
      go: () => {
        const { state, setPlantCar } = useGame.getState();
        // put it on the first assembly line that is building an older model (or nothing)
        const line = plantsOf(state).find(([, b]) => b.type === "assemblyPlant" && (!b.plant.car || CAR_BY_ID[b.plant.car].tier < car.tier));
        if (line) {
          setPlantCar(line[0], car.id);
          useUi.getState().selectPlot(line[0], true);
        } else useUi.getState().setView("cars");
      },
    };
  } else if (cur?.kind === "plant") {
    const cfg = PLANT_BY_ID[cur.id as PlantType];
    body = {
      emoji: cfg.emoji,
      kicker: t("unlock.plant"),
      name: t(`structure.${cfg.id}` as MessageKey),
      desc: t(`structureDesc.${cfg.id}` as MessageKey),
      action: t("unlock.build"),
      go: () => useUi.getState().setView("build"),
    };
  }

  return (
    <AnimatePresence>
      {cur && body && (
        <motion.div
          key={unlockKey(cur.kind, cur.id)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.6, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="relative w-[min(92vw,22rem)] overflow-hidden rounded-3xl border border-gold/40 bg-ink/95 p-5 text-center shadow-[0_20px_80px_-20px_rgba(250,204,21,.55)]"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-gold/80">{body.kicker}</div>
            <div className="relative mx-auto my-3 grid size-32 place-items-center">
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full opacity-60"
                style={{ background: "repeating-conic-gradient(from 0deg, rgba(250,204,21,.35) 0deg 12deg, transparent 12deg 30deg)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              />
              <div aria-hidden className="absolute inset-6 rounded-full bg-gold/20 blur-xl" />
              <motion.div className="relative text-7xl" initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.15 }}>
                {body.emoji}
              </motion.div>
            </div>
            <div className="text-gradient-gold text-2xl font-black leading-tight">{body.name}</div>
            <p className="mt-1 text-sm text-white/60">{body.desc}</p>
            <div className="mt-4 rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-gold/30">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gold/70">{t("unlock.bonus")}</div>
              <div className="text-lg font-black tabular-nums text-gold">+{formatMoney(bonus)}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => claim()}>
                {t("unlock.claim")}
              </Button>
              <Button variant="gold" onClick={() => claim(body.go)}>
                {body.action}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
