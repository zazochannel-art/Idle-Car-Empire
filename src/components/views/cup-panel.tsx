"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { CUP, CUP_ICON, cupBlock, cupRunsLeft, cupTime, cupTrack, cupWeek, cupWeekEnd, type CupPrize, type CupRun } from "@/game/engine/cup";
import { duelCar, duelRating } from "@/game/engine/ghost";
import { formatDuration } from "@/game/format";
import type { CupRow } from "@/game/save";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

const MEDALS = ["🥇", "🥈", "🥉"];

/** The weekly cup: this week's track, the player's timed runs, the prizes and the week's board. */
export function CupPanel({ onVisit }: { onVisit: (userId: string) => void }) {
  const saves = useGame((g) => g.saves);
  const state = useGame((g) => g.view.state);
  const hidden = state.settings.hidden;
  const { t, lang } = useT();
  const n = useContent(lang);
  const social = saves?.social ?? null;
  // the clock the panel shows (a run or a reload moves it on)
  const [now, setNow] = useState(Date.now);
  const week = cupWeek(now);
  const track = cupTrack(week);
  const [attempt, setAttempt] = useState(0);
  const key = `${week}:${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; rows: CupRow[] | null }>({ key: "", rows: null });
  const [run, setRun] = useState<CupRun | null>(null);

  useEffect(() => {
    if (!social) return;
    let live = true;
    // a best not on the board yet goes first, so the board shows it
    void useGame
      .getState()
      .sendCup()
      .catch(() => null)
      .then(() => social.cupBoard(week))
      .then(
        (rows) => live && setAnswer({ key, rows }),
        () => live && setAnswer({ key, rows: null }),
      );
    return () => {
      live = false;
    };
  }, [social, week, key]);
  const rows = answer.key === key ? answer.rows : null;
  const failed = answer.key === key && !answer.rows;
  const reload = () => {
    setNow(Date.now());
    setAttempt((x) => x + 1);
  };

  const car = duelCar(state);
  const block = cupBlock(state, now);
  const left = cupRunsLeft(state, now);
  const mine = state.cup.week === week ? state.cup : null;
  const carName = (id: string) => (id in CAR_BY_ID ? `${CAR_BY_ID[id as keyof typeof CAR_BY_ID].emoji} ${n.car(CAR_BY_ID[id as keyof typeof CAR_BY_ID])}` : "—");
  const race = () => {
    const r = useGame.getState().cupRun();
    if (!r) return;
    setRun(r);
    // the board again once a new best had time to reach it
    if (r.best) setTimeout(reload, 1200);
    else setNow(Date.now());
  };

  const hiddenIds = new Set(hidden.map((h) => h.id));
  const shown = rows?.filter((r) => r.me || !hiddenIds.has(r.userId)) ?? [];
  const me = rows?.find((r) => r.me);
  const entrants = rows?.[0]?.entrants ?? 0;
  const top = shown.filter((r) => r.rank <= 50 || !r.me);
  const meBelow = me && me.rank > 50 ? me : null;

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl bg-gradient-to-br from-amber-500/[0.14] to-rose-500/[0.08] p-3 ring-1 ring-amber-300/30">
        <div className="flex items-start gap-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-2xl">{track.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200/80">🏁 {t("cup.title")}</div>
            <div className="truncate text-base font-black">{t(`race.track.${track.id}` as MessageKey)}</div>
            <div className="text-[11px] text-white/55">{t("cup.ends", { time: formatDuration((cupWeekEnd(week) - now) / 1000), laps: track.laps })}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <Stat label={t("cup.yourCar")} value={car ? `${carName(car.car)} · ${Math.round(duelRating(car))}` : "—"} />
          <Stat label={t("cup.yourBest")} value={mine?.best ? `${cupTime(Math.min(mine.best, me?.best ?? Infinity))}${me ? ` · #${me.rank}` : ""}` : "—"} />
        </div>
        {run && (
          <div className={cn("space-y-1 rounded-xl p-2.5 ring-1", run.best ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-black/20 ring-white/10")}>
            <div className={cn("text-sm font-black", run.best ? "text-emerald-300" : "text-white/80")}>
              {run.best ? t(run.before ? "cup.newBest" : "cup.firstTime", { time: cupTime(run.total) }) : t("cup.noBest", { time: cupTime(run.total), best: cupTime(run.before) })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-white/55">
              {run.laps.map((lap, i) => (
                <span key={i}>{t("cup.lap", { n: i + 1, time: lap.toFixed(2) })}</span>
              ))}
            </div>
          </div>
        )}
        <Button variant={block ? "locked" : "gold"} className="w-full" disabled={!!block} onClick={race}>
          🏁 {t("cup.race")}
        </Button>
        {block ? (
          <p className="text-center text-xs text-amber-300">{t(`cup.block.${block}` as MessageKey)}</p>
        ) : (
          <p className="text-center text-[11px] text-white/50">{t("cup.left", { n: left, max: CUP.runsPerDay })}</p>
        )}
      </div>

      <details className="rounded-2xl bg-[#2b2b2e] px-3 py-2 ring-1 ring-white/10">
        <summary className="cursor-pointer text-[12px] font-bold text-white/80">🎁 {t("cup.prizes")}</summary>
        <p className="pt-1.5 text-[11px] leading-snug text-white/50">{t("cup.prizesHint")}</p>
        <ul className="space-y-1 pt-1.5 text-[11px]">
          {CUP.prizes.map((p) => (
            <li key={p.tier} className="flex items-center gap-2">
              <span className="w-5 text-center">{CUP_ICON[p.tier]}</span>
              <span className="min-w-0 flex-1 text-white/70">{t(`cup.tier.${p.tier}` as MessageKey, { min: p.minEntrants })}</span>
              <span className="shrink-0 font-bold text-gold">{prizeText(p, t)}</span>
            </li>
          ))}
        </ul>
      </details>

      {failed ? (
        <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-4 text-center ring-1 ring-white/10">
          <p className="text-sm text-rose-300">{t("board.error")}</p>
          <Button variant="secondary" size="sm" onClick={reload}>
            <RefreshCw /> {t("board.retry")}
          </Button>
        </div>
      ) : !rows ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {entrants > 0 && <p className="px-1 text-[11px] text-white/50">{t("cup.entrants", { n: entrants })}</p>}
          {!top.length && <p className="rounded-2xl bg-[#2b2b2e] p-4 text-center text-sm text-white/60 ring-1 ring-white/10">{t("cup.empty")}</p>}
          {top.map((r) => (
            <Row key={r.userId} r={r} carName={carName} onVisit={() => onVisit(r.userId)} />
          ))}
          {meBelow && (
            <>
              <div className="text-center text-white/30">⋯</div>
              <Row r={meBelow} carName={carName} onVisit={() => onVisit(meBelow.userId)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function prizeText(p: CupPrize, t: ReturnType<typeof useT>["t"]) {
  // "2h", "1h 30m", "45m" (no zero part)
  const time = formatDuration(p.incomeSeconds).replace(/ 0\D+$/, "");
  return p.stars ? t("cup.prizeStars", { stars: p.stars, time }) : t("cup.prizeIncome", { time });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-2.5 py-2 ring-1 ring-white/[0.07]">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="truncate text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

function Row({ r, carName, onVisit }: { r: CupRow; carName: (id: string) => string; onVisit: () => void }) {
  const { t } = useT();
  return (
    <button onClick={onVisit} className={cn("flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left ring-1 transition hover:bg-white/[0.07]", r.me ? "bg-gold/[0.12] ring-gold/50" : "bg-white/[0.04] ring-white/[0.07]")}>
      <span className={cn("w-8 shrink-0 text-center font-black tabular-nums", r.rank <= 3 ? "text-xl" : "text-sm text-white/60")}>{MEDALS[r.rank - 1] ?? r.rank}</span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl">{r.avatar || "👤"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-black">{r.username || "—"}</span>
          {r.me && <span className="shrink-0 rounded-full bg-gold px-1.5 py-px text-[9px] font-black uppercase text-[#1d1d20]">{t("board.you")}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/50">
          <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: r.color }} />
          <span className="truncate">{carName(r.car)}</span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-black tabular-nums text-amber-200">{cupTime(r.best)}</span>
    </button>
  );
}
