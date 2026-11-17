"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { STAFF, staffSpeed, type StaffCardId } from "@/game/engine/staff";
import { formatMoney, formatPercent } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { useModalSlot } from "@/store/modal-queue";
import { useChoiceCard } from "./choice-card";

const signed = (v: number) => `${v < 0 ? "−" : "+"}${formatPercent(Math.abs(v))}`;

const ICON: Record<StaffCardId, string> = { raise: "🪧", party: "🎉", overtime: "⏱️" };

/** 👷 The staff bring a choice: a pay rise, a team party, overtime (engine/staff.ts). */
export function StaffDialog() {
  const open = useGame((g) => !!g.state.staff?.card);
  const busy = useUi((u) => !!u.celebrate);
  const shown = useModalSlot("staff", open && !busy);
  return <AnimatePresence>{shown && <StaffCard />}</AnimatePresence>;
}

function StaffCard() {
  const card = useGame((g) => g.state.staff?.card ?? null);
  const morale = useGame((g) => Math.round(g.state.staff?.morale ?? STAFF.start));
  const cash = useGame((g) => g.view.state.cash);
  const answer = useGame((g) => g.answerStaff);
  const { t } = useT();
  useChoiceCard();
  if (!card) return null;
  const id = card.id;
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const yesDesc =
    id === "raise"
      ? t("staff.raise.yesDesc", { morale: STAFF.raise.yes })
      : id === "party"
        ? t("staff.party.yesDesc", { morale: STAFF.party.yes, pct: formatPercent(STAFF.party.boost - 1), minutes: minutes(STAFF.party.boostMs) })
        : t("staff.overtime.yesDesc", { morale: -STAFF.overtime.yes, pct: formatPercent(STAFF.overtime.boost - 1), minutes: minutes(STAFF.overtime.boostMs) });
  const noDesc =
    id === "raise"
      ? t("staff.raise.noDesc", { morale: -STAFF.raise.no, chance: formatPercent(STAFF.raise.strikeChance), minutes: minutes(STAFF.raise.strikeMs) })
      : id === "party"
        ? t("staff.party.noDesc", { morale: -STAFF.party.no })
        : t("staff.overtime.noDesc");
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={t(`staff.${id}.title`)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-[min(92vw,22rem)] rounded-3xl border border-sky-400/40 bg-ink/95 p-5 text-center shadow-[0_20px_80px_-20px_rgba(56,189,248,.45)]">
        <div className="text-5xl">{ICON[id]}</div>
        <div className="mt-2 text-lg font-black text-sky-200">{t(`staff.${id}.title`)}</div>
        <p className="mt-1 text-sm text-white/70">{t(`staff.${id}.body`)}</p>
        <p className="mt-2 text-[11px] text-white/50">{t("staff.morale", { morale, pct: signed(staffSpeed({ staff: { morale, card: null, nextAt: 0, strikeUntil: 0, boostUntil: 0, boost: 1, answered: 0 } }, 0) - 1) })}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-left text-[11px]">
          <div className="rounded-xl bg-emerald-500/10 p-2 ring-1 ring-emerald-400/25">
            <div className="font-bold text-emerald-200">{t(`staff.${id}.yes`)}</div>
            <div className="text-white/60">{yesDesc}</div>
          </div>
          <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/25">
            <div className="font-bold text-rose-200">{t(`staff.${id}.no`)}</div>
            <div className="text-white/60">{noDesc}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="gold" disabled={cash < card.cost} onClick={() => answer(true)}>
            {card.cost > 0 ? t("staff.yesCost", { cost: formatMoney(card.cost) }) : t(`staff.${id}.yes`)}
          </Button>
          <Button variant="secondary" onClick={() => answer(false)}>
            {t(`staff.${id}.no`)}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
