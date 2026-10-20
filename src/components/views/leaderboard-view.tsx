"use client";

import { Gift, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CAR_BY_ID } from "@/game/config/cars";
import { PLANT_BY_ID, isPlantType } from "@/game/config/chain";
import { GIFT } from "@/game/engine/gifts";
import { DUEL, duelBlock, duelCar, duelRating, duelsLeft, ghostRating, type DuelResult, type Ghost } from "@/game/engine/ghost";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { GIFTS_PER_DAY, type BoardKind, type BoardRow, type EmpireCard, type GiftResult } from "@/game/save";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useCloud } from "@/store/cloud-store";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { PlayerActions } from "../game/player-safety";
import { CupPanel } from "./cup-panel";
import { ViewHeader } from "./section-title";

const MEDALS = ["🥇", "🥈", "🥉"];

/** The global leaderboard (this week, all time) and the weekly cup; a tap on a player visits their empire. */
export function LeaderboardView() {
  const saves = useGame((g) => g.saves);
  const hidden = useGame((g) => g.view.state.settings.hidden);
  const listed = useCloud((c) => c.profile?.listed !== false);
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const social = saves?.social ?? null;
  // a notification about the cup opens on the cup's tab
  const [tab, setTab] = useState<BoardKind | "cup">(() => useUi.getState().boardTab ?? "week");
  useEffect(() => {
    if (useUi.getState().boardTab) useUi.setState({ boardTab: null });
  }, []);
  const kind: BoardKind = tab === "cup" ? "week" : tab;
  const [attempt, setAttempt] = useState(0);
  // the last answer, for the board it was asked for (another board shows as loading)
  const [answer, setAnswer] = useState<{ key: string; rows: BoardRow[] | null }>({ key: "", rows: null });
  const [sent, setSent] = useState<number | null>(null);
  const [visiting, setVisiting] = useState<string | null>(null);
  const key = `${kind}:${attempt}`;

  useEffect(() => {
    // (the cup reads its own board)
    if (!social || tab === "cup") return;
    let live = true;
    social.leaderboard(kind).then(
      (rows) => live && setAnswer({ key, rows }),
      () => live && setAnswer({ key, rows: null }),
    );
    return () => {
      live = false;
    };
  }, [social, kind, key, tab]);
  const rows = answer.key === key ? answer.rows : null;
  const failed = answer.key === key && !answer.rows;
  const load = () => setAttempt((n) => n + 1);

  // opening the board also collects any gifts waiting
  useEffect(() => {
    if (!social) return;
    void useGame.getState().claimGifts();
    void social.giftsSentToday().then(setSent, () => {});
  }, [social]);

  const header = <ViewHeader icon="🏆" title={t("nav.leaderboard")} subtitle={t("board.subtitle")} />;
  if (!social) {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-4 text-center ring-1 ring-white/10">
          <p className="text-sm text-white/70">{t("board.offline")}</p>
          <Button variant="secondary" size="sm" onClick={() => setView("profile")}>
            👤 {t("account.title")}
          </Button>
        </div>
      </div>
    );
  }

  const me = rows?.find((r) => r.me);
  // players this one hid stay off their board (the ranks stay the server's)
  const hiddenIds = new Set(hidden.map((h) => h.id));
  const shown = rows?.filter((r) => r.me || !hiddenIds.has(r.userId)) ?? [];
  const hiddenHere = (rows?.length ?? 0) - shown.length;
  const top = shown.filter((r) => r.rank <= 50 || !r.me);
  const meBelow = me && me.rank > 50 ? me : null;
  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#2b2b2e] p-1 ring-1 ring-white/10">
        {(["week", "all", "cup"] as const).map((k) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className={cn("rounded-xl py-2 text-sm font-black transition", tab === k ? "bg-gold text-[#1d1d20]" : "text-white/60 hover:bg-white/[0.06]")}>
            {t(k === "week" ? "board.week" : k === "all" ? "board.all" : "board.cup")}
          </button>
        ))}
      </div>
      {tab === "cup" ? (
        <CupPanel onVisit={setVisiting} />
      ) : (
        <>
          <p className="px-1 text-[11px] leading-snug text-white/50">
            {t(kind === "week" ? "board.weekHint" : "board.allHint")} {t("board.tapToVisit")}
          </p>
          {!listed && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 ring-1 ring-amber-400/20">{t("board.hidden")}</p>}

          {failed ? (
            <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-4 text-center ring-1 ring-white/10">
              <p className="text-sm text-rose-300">{t("board.error")}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshCw /> {t("board.retry")}
              </Button>
            </div>
          ) : !rows ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {!top.length && <p className="rounded-2xl bg-[#2b2b2e] p-4 text-center text-sm text-white/60 ring-1 ring-white/10">{t("board.empty")}</p>}
              {top.map((r) => (
                <Row key={r.userId} r={r} onVisit={() => setVisiting(r.userId)} />
              ))}
              {meBelow && (
                <>
                  <div className="text-center text-white/30">⋯</div>
                  <Row r={meBelow} onVisit={() => setVisiting(meBelow.userId)} />
                </>
              )}
              {!me && <p className="px-1 pt-1 text-center text-[11px] text-white/50">{t("board.notYet")}</p>}
              {hiddenHere > 0 && <p className="px-1 pt-1 text-center text-[11px] text-white/40">🙈 {t("board.hiddenCount", { n: hiddenHere })}</p>}
            </div>
          )}
        </>
      )}

      {sent !== null && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/55">
          <Gift className="size-3.5" /> {t("gift.left", { n: Math.max(0, GIFTS_PER_DAY - sent), max: GIFTS_PER_DAY })}
        </p>
      )}

      <VisitDialog userId={visiting} sent={sent} onSent={() => setSent((n) => (n ?? 0) + 1)} onClose={() => setVisiting(null)} />
    </div>
  );
}

function Row({ r, onVisit }: { r: BoardRow; onVisit: () => void }) {
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
        {r.company && <span className="block truncate text-[11px] text-white/50">{r.company}</span>}
      </span>
      <span className="shrink-0 text-sm font-black tabular-nums text-emerald-300">{formatMoney(r.value)}</span>
    </button>
  );
}

/** Another player's empire, read only: their public card, and a gift. */
function VisitDialog({ userId, sent, onSent, onClose }: { userId: string | null; sent: number | null; onSent: () => void; onClose: () => void }) {
  return (
    <Dialog open={userId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{userId && <Visit key={userId} userId={userId} sent={sent} onSent={onSent} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

/** One visit (mounted afresh for every player visited). */
function Visit({ userId, sent, onSent, onClose }: { userId: string; sent: number | null; onSent: () => void; onClose: () => void }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  // the card, and when it came (for "last save: … ago")
  const [card, setCard] = useState<{ card: EmpireCard | null; at: number } | "loading" | "error">("loading");
  const [gift, setGift] = useState<GiftResult | "error" | "sending" | null>(null);

  useEffect(() => {
    let live = true;
    saves?.social?.visit(userId).then(
      (c) => live && setCard({ card: c, at: Date.now() }),
      () => live && setCard("error"),
    );
    return () => {
      live = false;
    };
  }, [userId, saves]);

  const send = async () => {
    const social = saves?.social;
    if (!social) return;
    setGift("sending");
    try {
      const r = await social.sendGift(userId);
      setGift(r);
      if (r === "sent") {
        onSent();
        useGame.getState().giftSent();
      }
    } catch {
      setGift("error");
    }
  };

  const c = typeof card === "object" ? card.card : null;
  const at = typeof card === "object" ? card.at : 0;
  const mine = c?.userId === saves?.account?.id;
  const out = sent !== null && sent >= GIFTS_PER_DAY;
  const plants = (c?.plants ?? []).filter((p) => isPlantType(p.type)).sort((a, b) => b.level - a.level);
  return (
    <>
      {card === "loading" ? (
        <>
          <DialogTitle className="text-xl">{t("visit.loading")}</DialogTitle>
          <DialogDescription className="sr-only">{t("visit.loading")}</DialogDescription>
          <div className="mt-3 h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
        </>
      ) : !c ? (
        <>
          <DialogTitle className="text-xl">🏚️</DialogTitle>
          <DialogDescription>{t(card === "error" ? "board.error" : "visit.gone")}</DialogDescription>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-3xl">{c.avatar || "👤"}</span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-2xl">{c.username || "—"}</DialogTitle>
              <DialogDescription className="truncate">{c.company || t("account.noCompany")}</DialogDescription>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <Stat label={t("visit.earned")} value={formatMoney(c.earned)} />
            <Stat label={t("visit.cars")} value={formatNumber(c.cars)} />
            <Stat label={t("visit.stars")} value={`⭐ ${formatNumber(c.stars)}`} />
            <Stat label={t("visit.districts")} value={formatNumber(c.zones)} />
            <Stat label={t("visit.races")} value={`${formatNumber(c.races)} (🏆 ${formatNumber(c.wins)})`} />
            <Stat label={t("visit.resets")} value={`👑 ${formatNumber(c.resets)}`} />
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55">
              {t("visit.plants")} · {formatNumber(plants.length)}
            </div>
            {plants.length ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {plants.map((p, i) => (
                  <div key={`${p.type}-${i}`} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 ring-1 ring-white/[0.07]">
                    <span className="text-lg">{PLANT_BY_ID[p.type as keyof typeof PLANT_BY_ID].emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{t(`structure.${p.type}` as MessageKey)}</span>
                    <span className="shrink-0 text-[11px] font-black tabular-nums text-gold">{t("common.lv", { level: p.level })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/50">{t("visit.noPlants")}</p>
            )}
          </div>

          {c.ghost && !mine && <GhostDuel rival={c.userId} ghost={c.ghost} />}

          {c.updatedAt > 0 && <p className="text-[11px] text-white/45">{t("visit.updated", { when: t("account.ago", { time: formatDuration(Math.max(1, (at - c.updatedAt) / 1000)) }) })}</p>}

          {!mine && (
            <div className="space-y-1.5 rounded-2xl bg-gold/[0.08] p-3 ring-1 ring-gold/30">
              <p className="text-[11px] leading-snug text-white/65">{t("gift.hint", { min: Math.round(GIFT.receiveSeconds / 60), n: GIFTS_PER_DAY })}</p>
              <Button variant={gift === "sent" || out ? "locked" : "gold"} className="w-full" disabled={gift === "sending" || gift === "sent" || gift === "already" || out} onClick={() => void send()}>
                <Gift /> {t("gift.send")}
              </Button>
              {gift && gift !== "sending" && (
                <p className={cn("text-center text-xs", gift === "sent" ? "text-emerald-300" : "text-amber-300")}>
                  {t(gift === "sent" ? "gift.sent" : gift === "already" ? "gift.already" : gift === "limit" ? "gift.limit" : gift === "full" ? "gift.full" : gift === "error" ? "gift.error" : "gift.unknown")}
                </p>
              )}
              {gift !== "sent" && out && <p className="text-center text-xs text-amber-300">{t("gift.limit")}</p>}
            </div>
          )}

          {!mine && <PlayerActions userId={c.userId} name={c.username} onHidden={onClose} />}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/[0.07]">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="truncate text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

/** A one-against-one race with the visited player's ghost (their best car). */
function GhostDuel({ rival, ghost }: { rival: string; ghost: Ghost }) {
  const state = useGame((g) => g.view.state);
  const { t, lang } = useT();
  const n = useContent(lang);
  const [now] = useState(Date.now);
  const [result, setResult] = useState<DuelResult | null>(null);
  const car = duelCar(state);
  const block = duelBlock(state, rival, now);
  const carName = (id: keyof typeof CAR_BY_ID) => `${CAR_BY_ID[id].emoji} ${n.car(CAR_BY_ID[id])}`;
  const fmt = (sec: number) => `${sec.toFixed(2)}s`;
  return (
    <div className="space-y-2 rounded-2xl bg-sky-500/[0.07] p-3 ring-1 ring-sky-400/25">
      <div className="text-[11px] font-bold uppercase tracking-wider text-sky-200/80">🏁 {t("duel.title")}</div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Stat label={t("duel.theirs")} value={`${carName(ghost.model)} · ${Math.round(ghostRating(ghost))}`} />
        <Stat label={t("duel.yours")} value={car ? `${carName(car.car)} · ${Math.round(duelRating(car))}` : "—"} />
      </div>
      {result ? (
        <div className={cn("space-y-1.5 rounded-xl p-2.5 ring-1", result.won ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.04] ring-white/10")}>
          <div className={cn("text-sm font-black", result.won ? "text-emerald-300" : "text-white/80")}>{t(result.won ? "duel.won" : "duel.lost", { gap: fmt(result.margin) })}</div>
          <div className="text-[11px] text-white/55">{t(`race.track.${result.track}` as MessageKey)}</div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 text-[11px] tabular-nums">
            <span className="text-white/40">{t("duel.lap")}</span>
            <span className="text-white/40">{t("duel.you")}</span>
            <span className="text-white/40">{t("duel.ghost")}</span>
            {result.mine.map((lap, i) => (
              <span key={i} className="contents">
                <span className="text-white/50">{i + 1}</span>
                <span className={cn(lap <= result.theirs[i] ? "font-bold text-emerald-300" : "")}>{fmt(lap)}</span>
                <span className={cn(result.theirs[i] < lap ? "font-bold text-rose-300" : "")}>{fmt(result.theirs[i])}</span>
              </span>
            ))}
          </div>
          <div className="text-[11px] text-gold">{t("duel.reward", { money: formatMoney(result.money), rep: result.rep })}</div>
        </div>
      ) : (
        <>
          <p className="text-[11px] leading-snug text-white/60">{t("duel.hint", { n: DUEL.perDay })}</p>
          <Button variant={block ? "locked" : "gold"} className="w-full" disabled={!!block} onClick={() => setResult(useGame.getState().duel(rival, ghost))}>
            🏁 {t("duel.race")}
          </Button>
          {block && <p className="text-center text-xs text-amber-300">{t(`duel.block.${block}` as MessageKey)}</p>}
          {!block && <p className="text-center text-[11px] text-white/45">{t("duel.left", { n: duelsLeft(state, now), max: DUEL.perDay })}</p>}
        </>
      )}
    </div>
  );
}
