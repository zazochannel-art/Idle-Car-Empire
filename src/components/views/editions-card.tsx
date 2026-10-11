"use client";

import { CAR_BY_ID } from "@/game/config/cars";
import { EDITION, EDITIONS, EDITION_BY_ID } from "@/game/config/collection";
import { editionBonus } from "@/game/engine/collection";
import { formatDuration, formatPercent } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** The limited editions found on the lines: a cabinet of twelve finishes, each one income for good. */
export function EditionsCard() {
  const editions = useGame((g) => g.state.editions);
  const played = useGame((g) => g.state.lifetime.playTime);
  const bonus = useGame((g) => editionBonus(g.state));
  const { t, lang } = useT();
  const n = useContent(lang);
  const got = new Map(editions.got.filter((g) => EDITION_BY_ID[g.id]).map((g) => [g.id, g]));
  const done = got.size >= EDITIONS.length;
  return (
    <div className="rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black">✨ {t("edition.title")}</div>
          <div className="text-[11px] text-white/55">{t("edition.subtitle", { pct: formatPercent(EDITION.income), set: formatPercent(EDITION.fullSet) })}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black tabular-nums text-gold">
            {got.size}/{EDITIONS.length}
          </div>
          <div className="text-[10px] font-bold text-emerald-300">+{formatPercent(bonus)}</div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {EDITIONS.map((e) => {
          const g = got.get(e.id);
          const car = g ? CAR_BY_ID[g.car] : undefined;
          return (
            <div
              key={e.id}
              title={g ? `${t(`edition.${e.id}` as MessageKey)}${car ? ` · ${n.car(car)}` : ""}` : "?"}
              className={cn("relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl ring-1", g ? "ring-white/25" : "bg-white/[0.04] ring-white/[0.06]")}
              style={g ? { background: `linear-gradient(135deg, ${e.shine} -10%, ${e.color} 45%, ${e.color} 70%, ${e.shine} 140%)` } : undefined}
            >
              {g ? (
                <>
                  <span className="text-2xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]">🚗</span>
                  <span className="absolute right-1 top-0.5 text-xs">{e.icon}</span>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1 text-center text-[9px] font-bold leading-4 text-white">{t(`edition.${e.id}` as MessageKey)}</span>
                </>
              ) : (
                <span className="text-xl font-black text-white/20">?</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-white/50">
        {done ? `🏆 ${t("edition.complete")}` : editions.nextAt > played ? t("edition.next", { time: formatDuration(editions.nextAt - played) }) : t("edition.soon")}
      </div>
    </div>
  );
}
