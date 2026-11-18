"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAR_BY_ID } from "@/game/config/cars";
import { EDITION_BY_ID } from "@/game/config/collection";
import { AUCTION, askPrice, auctionBonus, auctionOpen, buyBlock, saleMoney, sellableCars, sellableEditions, type EditionId } from "@/game/engine/auction";
import { formatMoney, formatPercent } from "@/game/format";
import type { AuctionListing, MyListing } from "@/game/save";
import type { CarId } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** A swatch of a limited-edition finish. */
function Finish({ edition, className }: { edition: string; className?: string }) {
  const e = EDITION_BY_ID[edition as EditionId];
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ring-white/20", className)}
      style={e ? { background: `linear-gradient(135deg, ${e.shine} -10%, ${e.color} 45%, ${e.color} 70%, ${e.shine} 140%)` } : undefined}
    >
      🚗
    </span>
  );
}

/** The auction house: cars in limited-edition finishes, bought and sold between players. */
export function AuctionCard() {
  const saves = useGame((g) => g.saves);
  const open = useGame((g) => auctionOpen(g.state));
  const got = useGame((g) => g.state.auction.got);
  const bonus = useGame((g) => auctionBonus(g.state));
  const { t, lang } = useT();
  const n = useContent(lang);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const social = saves?.social ?? null;

  return (
    <div className="space-y-2.5 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black">🔨 {t("auction.title")}</div>
          <div className="text-[11px] text-white/55">{t("auction.subtitle", { pct: formatPercent(AUCTION.perCar), max: formatPercent(AUCTION.maxBonus) })}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black tabular-nums text-gold">{got.length}</div>
          <div className="text-[10px] font-bold text-emerald-300">+{formatPercent(bonus)}</div>
        </div>
      </div>
      {got.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {got.map((g) => (
            <span key={`${g.car}-${g.edition}`} title={`${t(`edition.${g.edition}` as MessageKey)} · ${CAR_BY_ID[g.car] ? n.car(CAR_BY_ID[g.car]) : g.car}`}>
              <Finish edition={g.edition} className="size-8 text-base" />
            </span>
          ))}
        </div>
      )}
      {!open ? (
        <p className="text-xs text-white/50">🔒 {t("auction.locked", { money: formatMoney(AUCTION.unlockEarned) })}</p>
      ) : !social ? (
        <p className="text-xs text-white/50">{t("board.offline")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
            {(["buy", "sell"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg py-1.5 text-[11px] font-black uppercase tracking-wide", tab === k ? "bg-gold text-black" : "text-white/60")}>
                {t(`auction.tab.${k}` as MessageKey)}
              </button>
            ))}
          </div>
          {tab === "buy" ? <BuyList /> : <SellForm />}
        </>
      )}
    </div>
  );
}

function BuyList() {
  const saves = useGame((g) => g.saves);
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { t, lang } = useT();
  const n = useContent(lang);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: number; rows: AuctionListing[] | "error" } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const social = saves?.social ?? null;

  useEffect(() => {
    if (!social) return;
    let live = true;
    social.auctionBrowse().then(
      (rows) => live && setAnswer({ key: attempt, rows }),
      () => live && setAnswer({ key: attempt, rows: "error" }),
    );
    return () => {
      live = false;
    };
  }, [social, attempt]);
  const rows = answer?.key === attempt ? answer.rows : undefined;

  const buy = async (l: AuctionListing) => {
    setBusy(l.id);
    setMsg(null);
    const r = await useGame.getState().auctionBuy(l);
    setBusy(null);
    if (r !== "ok") setMsg(t(`auction.err.${r}` as MessageKey));
    setAttempt((x) => x + 1);
  };

  if (rows === undefined) return <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />;
  if (rows === "error")
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-rose-300">{t("board.error")}</p>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((x) => x + 1)}>
          <RefreshCw /> {t("board.retry")}
        </Button>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-white/45">{t("auction.buyHint")}</p>
        <button aria-label={t("alliance.refresh")} className="flex size-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white" onClick={() => setAttempt((x) => x + 1)}>
          <RefreshCw className="size-4" />
        </button>
      </div>
      {rows.length === 0 && <p className="py-3 text-center text-xs text-white/50">{t("auction.empty")}</p>}
      {rows.map((l) => {
        const car = CAR_BY_ID[l.car as CarId];
        const block = buyBlock(state, l.car, l.edition, l.ask, snap);
        return (
          <div key={l.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.06]">
            <Finish edition={l.edition} />
            <span className="min-w-0 flex-1 text-[11px] leading-tight">
              <span className="block truncate text-xs font-black">
                {t(`edition.${l.edition}` as MessageKey)} · {car ? n.car(car) : l.car}
              </span>
              <span className="block truncate text-white/50">
                {l.avatar} {l.seller || "—"}
              </span>
              <span className="block font-bold tabular-nums text-gold">{formatMoney(askPrice(l.ask, snap))}</span>
            </span>
            {block === "owned" ? (
              <span className="text-[11px] font-black text-emerald-300">✓ {t("auction.owned")}</span>
            ) : (
              <Button size="sm" variant={block ? "locked" : "gold"} disabled={!!block || busy !== null} onClick={() => void buy(l)}>
                {t("auction.buy")}
              </Button>
            )}
          </div>
        );
      })}
      {msg && <p className="text-center text-xs text-rose-300">{msg}</p>}
    </div>
  );
}

function SellForm() {
  const saves = useGame((g) => g.saves);
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { t, lang } = useT();
  const n = useContent(lang);
  const editions = sellableEditions(state);
  const cars = sellableCars(state);
  const [edition, setEdition] = useState<EditionId | null>(null);
  const [car, setCar] = useState<CarId | null>(null);
  const [ask, setAsk] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mine, setMine] = useState<{ key: number; rows: MyListing[] } | null>(null);
  const social = saves?.social ?? null;
  const pickedEdition = edition ?? editions[0] ?? null;
  const pickedCar = car ?? cars[cars.length - 1] ?? null;

  useEffect(() => {
    if (!social) return;
    let live = true;
    social.auctionMine().then(
      (rows) => live && setMine({ key: attempt, rows }),
      () => live && setMine({ key: attempt, rows: [] }),
    );
    return () => {
      live = false;
    };
  }, [social, attempt]);

  if (!editions.length) return <p className="py-2 text-center text-xs text-white/50">{t("auction.noEditions")}</p>;

  const list = async () => {
    if (!social || !pickedEdition || !pickedCar) return;
    setBusy(true);
    setMsg(null);
    const r = await social.auctionList(pickedCar, pickedEdition, ask).catch(() => "error" as const);
    setBusy(false);
    setMsg(r === "ok" ? { text: t("auction.listed") } : { text: t(r === "open" ? "auction.err.open" : r === "limit" ? "auction.err.listLimit" : r === "banned" ? "auction.err.banned" : "board.error"), bad: true });
    setAttempt((x) => x + 1);
  };
  const cancel = async (id: number) => {
    setBusy(true);
    await social?.auctionCancel(id).catch(() => false);
    setBusy(false);
    setAttempt((x) => x + 1);
  };

  const rows = mine?.key === attempt ? mine.rows : (mine?.rows ?? []);
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <div className="text-[11px] font-bold text-white/55">{t("auction.finish")}</div>
        <div className="flex flex-wrap gap-1.5">
          {editions.map((e) => (
            <button key={e} aria-label={t(`edition.${e}` as MessageKey)} onClick={() => setEdition(e)} className={cn("rounded-xl", pickedEdition === e && "ring-2 ring-gold")}>
              <Finish edition={e} />
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-bold text-white/55">{t("auction.model")}</span>
        <select value={pickedCar ?? ""} onChange={(e) => setCar(e.target.value as CarId)} className="w-full rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-bold ring-1 ring-white/10">
          {cars.map((id) => (
            <option key={id} value={id} className="bg-[#2b2b2e]">
              {n.car(CAR_BY_ID[id])}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-[11px] font-bold text-white/55">
          <span>{t("auction.ask")}</span>
          <span className="tabular-nums text-gold">{t("auction.youGet", { money: formatMoney(saleMoney(ask, snap)) })}</span>
        </span>
        <input type="range" min={AUCTION.askMin} max={AUCTION.askMax} value={ask} onChange={(e) => setAsk(Number(e.target.value))} className="w-full accent-amber-400" />
      </label>
      <p className="text-[11px] leading-snug text-white/45">{t("auction.sellHint", { fee: formatPercent(AUCTION.fee) })}</p>
      <Button size="sm" variant="gold" className="w-full" disabled={busy || !pickedCar || !pickedEdition} onClick={() => void list()}>
        🔨 {t("auction.list")}
      </Button>
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-emerald-300")}>{msg.text}</p>}
      {rows.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("auction.mine")}</div>
          {rows.map((l) => {
            const c = CAR_BY_ID[l.car as CarId];
            return (
              <div key={l.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-1.5 text-[11px] ring-1 ring-white/[0.06]">
                <Finish edition={l.edition} className="size-7 text-sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{c ? n.car(c) : l.car}</span>
                <span className={cn("font-black", l.status === "sold" ? "text-emerald-300" : l.status === "open" ? "text-gold" : "text-white/40")}>{t(`auction.status.${l.status}` as MessageKey)}</span>
                {l.status === "open" && (
                  <button aria-label={t("auction.cancel")} disabled={busy} className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-rose-300" onClick={() => void cancel(l.id)}>
                    <X className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
