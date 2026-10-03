"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { carPartsValue, carValue } from "@/game/engine/chain";
import { formatMoney } from "@/game/format";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/** How long the camera follows the car out of the plant before the card shows. */
const ROLL_OUT_MS = 4200;

/**
 * FIRST CAR COMPLETED: the camera follows the car as it rolls out of the
 * assembly plant (the map draws that), then a card shows what it is worth.
 */
export function FirstCarOverlay() {
  const celebrate = useUi((u) => u.celebrate);
  const setCelebrate = useUi((u) => u.setCelebrate);
  // the card shows once the roll-out has played, for this celebration only
  const [cardFor, setCardFor] = useState<object | null>(null);
  const card = !!celebrate && cardFor === celebrate;
  const { t, lang } = useT();
  const n = useContent(lang);

  useEffect(
    () =>
      uiEvents.on((e) => {
        if (e.type === "firstCar") setCelebrate({ plot: e.plot, car: e.car });
      }),
    [setCelebrate],
  );

  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCardFor(celebrate), ROLL_OUT_MS);
    return () => clearTimeout(id);
  }, [celebrate]);

  if (!celebrate) return null;
  const car = CAR_BY_ID[celebrate.car];
  const { state, snap } = useGame.getState();
  const cost = carPartsValue(car) * snap.gm.value[1] * snap.gm.income;
  const value = carValue(state, car, snap.gm);
  const close = () => {
    setCelebrate(null);
    // show the Local Dealer the first car just opened
    useUi.getState().selectPlot("d:local");
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <motion.div initial={{ opacity: 0, y: -20, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="absolute top-[8vh] text-center">
        <div className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80">{t("firstCar.kicker")}</div>
        <div className="text-gradient-gold text-3xl font-black drop-shadow-[0_4px_20px_rgba(0,0,0,.8)] md:text-5xl">{t("firstCar.title")}</div>
      </motion.div>
      <AnimatePresence>
        {card && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="pointer-events-auto mt-24 w-[min(92vw,22rem)] rounded-3xl border border-gold/40 bg-ink/90 p-5 text-center shadow-[0_20px_80px_-20px_rgba(250,204,21,.5)] backdrop-blur-xl"
          >
            <div className="text-6xl">{car.emoji}</div>
            <div className="mt-1 text-lg font-black">🚗 {t("firstCar.completed")}</div>
            <div className="text-sm text-white/60">
              {state.designs[car.id].name} · {n.car(car)}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Cell label={t("cars.cost")} value={formatMoney(cost)} />
              <Cell label={t("firstCar.value")} value={formatMoney(value)} />
              <Cell label={t("cars.profit")} value={formatMoney(value - cost)} gold />
            </div>
            <p className="mt-3 text-xs text-white/55">{t("firstCar.next")}</p>
            <Button variant="gold" size="lg" className="mt-4 w-full" onClick={close}>
              {t("firstCar.continue")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cell({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.05] px-1 py-2 ring-1 ring-white/10">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className={`text-sm font-black tabular-nums ${gold ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}
