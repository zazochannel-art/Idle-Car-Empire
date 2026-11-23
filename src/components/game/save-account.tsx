"use client";

// A guest plays at once ("Play now" on the welcome page), with a guest account tied to this phone.
// After the first car, or about 20 minutes of play, this card asks once to add an email and a
// password: the same account and the same save, now kept if the phone is lost or changed, and
// playable on any device. "Later" asks again a day later, three times at most (the Profile always
// has the same form).
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useCloud } from "@/store/cloud-store";
import { useGame } from "@/store/game-store";
import { otherModalWaiting } from "@/store/modal-queue";
import { useUi } from "@/store/ui-store";
import { AccountForms } from "./account";
import { companyNameDue } from "./company-name";
import { SAVE_ACCOUNT_PLAY_SECONDS, markAsked, readAsked, saveAccountDue } from "@/lib/save-account-ask";

/** Another dialog open: the question waits for it (checked again every few seconds). */
const RETRY_MS = 5_000;

export function SaveAccountDialog() {
  const guest = useCloud((c) => !!c.account?.guest);
  const pendingEmail = useCloud((c) => !!c.account?.pendingEmail);
  const ready = useGame((g) => g.ready);
  // (only whether it is long enough, so the card doesn't re-render on every tick)
  const longEnough = useGame((g) => g.state.lifetime.playTime >= SAVE_ACCOUNT_PLAY_SECONDS);
  const firstCar = useGame((g) => g.state.lifetime.carsProduced >= 1);
  const nameDue = useGame((g) => companyNameDue(g.state.brand.name, g.state.lifetime.carsProduced));
  const busy = useUi((u) => !!u.celebrate);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // after the company's name (the first car asks that), not over it
    if (!guest || pendingEmail || !ready || nameDue || busy || open) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (!saveAccountDue({ guest, pendingEmail, ready, playTime: longEnough ? SAVE_ACCOUNT_PLAY_SECONDS : 0, carsProduced: firstCar ? 1 : 0, now, asked: readAsked() })) return;
      // not over another dialog (Welcome back, a choice of saves, a recall…)
      if (document.querySelector('[role="dialog"], [data-modal]') || otherModalWaiting("companyName")) return;
      clearInterval(id);
      markAsked(now);
      setOpen(true);
    }, RETRY_MS);
    return () => clearInterval(id);
  }, [guest, pendingEmail, ready, longEnough, firstCar, nameDue, busy, open]);

  return <AnimatePresence>{open && <SaveCard onClose={() => setOpen(false)} />}</AnimatePresence>;
}

function SaveCard({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <motion.div data-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        role="dialog"
        aria-label={t("saveAccount.title")}
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        className="max-h-[92vh] w-[min(92vw,22rem)] overflow-y-auto rounded-3xl border border-gold/40 bg-ink/95 p-5 shadow-[0_20px_80px_-20px_rgba(245,158,11,.5)]"
      >
        <div className="text-center">
          <div className="text-4xl">🛡️</div>
          <div className="mt-2 text-lg font-black text-gold">{t("saveAccount.title")}</div>
          <p className="mt-1 text-sm text-white/70">{t("saveAccount.body")}</p>
        </div>
        <div className="mt-3">
          <AccountForms
            initial="register"
            guest
            registerOnly
            onDone={(text) => {
              uiEvents.emit({ type: "toast", tone: "success", icon: "🛡️", title: text });
              onClose();
            }}
          />
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
          {t("saveAccount.later")}
        </Button>
      </motion.div>
    </motion.div>
  );
}
