"use client";

// Asks once for the company's name, after the first car: most players never find the
// Brand Studio, and an unnamed company is "Unnamed company" on its backups, cards and in
// the leaderboard. The first name is free; it can be changed later in the Brand Studio.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BRAND_LOGOS } from "@/game/config/brand";
import { isCleanName } from "@/game/engine/names";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const ASKED_KEY = "idle-car-empire:company-name-asked";
/** Another dialog open: the question waits for it (checked again every few seconds). */
const RETRY_MS = 5_000;

function asked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // blocked storage: asked again next time, nothing worse
  }
}

export function CompanyNameDialog() {
  // whether to ask: a running game, no name yet, a car made, and not asked on this device
  const due = useGame((g) => g.ready && !g.state.brand.name && g.state.lifetime.carsProduced >= 1);
  const busy = useUi((u) => !!u.celebrate);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!due || busy || open || asked()) return;
    // not over another dialog (Welcome back, a choice of saves, a recall…)
    const id = setInterval(() => {
      if (document.querySelector('[role="dialog"], [data-modal]')) return;
      clearInterval(id);
      markAsked();
      setOpen(true);
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [due, busy, open]);

  return <AnimatePresence>{open && <NameCard onClose={() => setOpen(false)} />}</AnimatePresence>;
}

function NameCard({ onClose }: { onClose: () => void }) {
  const setBrand = useGame((g) => g.setBrand);
  const logo = useGame((g) => g.state.brand.logo);
  const [name, setName] = useState("");
  const [bad, setBad] = useState(false);
  const { t } = useT();
  const clean = name.replace(/\s+/g, " ").trim();
  const save = () => {
    if (clean.length < 2) return;
    if (!isCleanName(clean) || !setBrand({ name: clean })) return setBad(true);
    uiEvents.emit({ type: "toast", tone: "success", icon: logo || BRAND_LOGOS[0], title: t("companyName.saved", { name: clean }) });
    onClose();
  };
  return (
    <motion.div data-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        role="dialog"
        aria-label={t("companyName.title")}
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        className="w-[min(92vw,22rem)] rounded-3xl border border-gold/40 bg-ink/95 p-5 text-center shadow-[0_20px_80px_-20px_rgba(245,158,11,.5)]"
      >
        <div className="text-5xl">{logo || BRAND_LOGOS[0]}</div>
        <div className="mt-2 text-lg font-black text-gold">{t("companyName.title")}</div>
        <p className="mt-1 text-sm text-white/70">{t("companyName.body")}</p>
        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(e) => {
            setName(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={t("brand.namePh")}
          className="mt-3 w-full rounded-xl bg-black/40 px-3 py-2.5 text-center text-base font-bold outline-none ring-1 ring-white/15 focus:ring-gold/60"
        />
        {bad && <p className="mt-1.5 text-[11px] text-rose-300">{t("companyName.bad")}</p>}
        <p className="mt-1.5 text-[11px] text-white/45">{t("companyName.hint")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("companyName.later")}
          </Button>
          <Button variant="gold" disabled={clean.length < 2} onClick={save}>
            {t("brand.save")}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
