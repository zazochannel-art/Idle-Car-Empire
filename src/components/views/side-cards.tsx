"use client";

// Three side businesses: racing sponsors (on the Racing screen), the used-car lot and quality
// control (on the Missions screen). The engine is in engine/sponsors.ts, engine/used-cars.ts
// and engine/quality-check.ts.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { QcAdButton } from "@/components/game/ad-buttons";
import { Progress } from "@/components/ui/progress";
import { CAR_BY_ID } from "@/game/config/cars";
import { unlockedCarIds } from "@/game/engine/economy";
import { QC, qcBlock, type DefectKind } from "@/game/engine/quality-check";
import { rewardCash } from "@/game/engine/rewards";
import { sponsorProgress } from "@/game/engine/sponsors";
import { buyBlock, nextLotAt, usedReady } from "@/game/engine/used-cars";
import { formatDuration, formatMoney } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

const BRAND_ICON: Record<string, string> = { voltex: "⚡", rapido: "🐆", kronos: "⏱️", oceanic: "🌊", zenith: "🔺", nitro: "🔥" };

/** Racing sponsors: three offers to pick from, or the deal signed and how far it got. */
export function SponsorCard() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { signDeal, declineDeals, claimDeal } = useGame.getState();
  const { t } = useT();
  const k = state.sponsors;
  const now = state.lastActiveAt;
  const pay = (r: { incomeSeconds?: number; stars?: number }) => `${formatMoney(rewardCash(r, snap))}${r.stars ? ` + ${r.stars} ⭐` : ""}`;
  const brand = (b: string) => t(`sponsor.brand.${b}` as MessageKey);

  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-r from-sky-500/10 to-transparent p-3 ring-1 ring-sky-400/30">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300/90">🤝 {t("sponsor.title")}</span>
        <span className="text-[11px] text-white/45">{t("sponsor.done", { n: k.done })}</span>
      </div>
      {k.active ? (
        (() => {
          const a = k.active;
          const p = sponsorProgress(state, a);
          const finished = p >= a.wins;
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{BRAND_ICON[a.brand]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{t("sponsor.deal", { brand: brand(a.brand), n: a.wins })}</div>
                  <div className="text-[11px] text-white/55">
                    {pay(a.reward)} · {t("sponsor.left", { time: formatDuration(Math.max(0, (a.deadline ?? now) - now) / 1000) })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={Math.min(100, (p / a.wins) * 100)} className="h-1.5" indicatorClassName="from-sky-400 to-cyan-300" />
                <span className="shrink-0 text-[11px] tabular-nums text-white/60">
                  {Math.min(p, a.wins)}/{a.wins}
                </span>
              </div>
              {finished && (
                <Button size="sm" variant="gold" className="w-full" onClick={claimDeal}>
                  {t("sponsor.claim")}
                </Button>
              )}
            </div>
          );
        })()
      ) : k.offers.length ? (
        <div className="space-y-1.5">
          {k.offers.map((o, i) => (
            <div key={o.brand} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.07]">
              <span className="text-xl">{BRAND_ICON[o.brand]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">{t("sponsor.offer", { brand: brand(o.brand), n: o.wins, h: o.hours })}</div>
                <div className="text-[11px] text-gold">{pay(o.reward)}</div>
              </div>
              <Button size="sm" variant="gold" className="shrink-0" onClick={() => signDeal(i)}>
                {t("sponsor.sign")}
              </Button>
            </div>
          ))}
          <button onClick={declineDeals} className="w-full text-center text-[11px] text-white/45 hover:text-white/70">
            {t("sponsor.decline")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-white/50">{state.racing.unlocked ? t("sponsor.none", { time: formatDuration(Math.max(0, k.nextAt - now) / 1000) }) : t("sponsor.locked")}</p>
      )}
    </div>
  );
}

/** The used-car lot: buy a worn car, refurbish it in the bay, sell it on. */
export function UsedCarsCard() {
  const state = useGame((g) => g.view.state);
  const { buyUsedCar, refurbishUsedCar, sellUsedCar } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const u = state.usedCars;
  const now = state.lastActiveAt;
  const bay = u.bay;

  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-r from-amber-500/10 to-transparent p-3 ring-1 ring-amber-400/30">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90">🚙 {t("used.title")}</span>
        <span className="text-[11px] text-white/45">{t("used.stats", { n: u.sold, money: formatMoney(Math.max(0, u.profit)) })}</span>
      </div>
      {bay ? (
        <div className="space-y-2 rounded-xl bg-white/[0.05] p-2 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{CAR_BY_ID[bay.car].emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">
                {t("used.inBay")}: {n.car(CAR_BY_ID[bay.car])}
              </div>
              <div className="text-[11px] text-white/55">{t("used.sellFor", { money: formatMoney(bay.sell) })}</div>
            </div>
          </div>
          {!u.readyAt ? (
            <Button size="sm" variant={state.cash >= bay.fix ? "gold" : "locked"} disabled={state.cash < bay.fix} className="w-full tabular-nums" onClick={refurbishUsedCar}>
              🔧 {t("used.refurbish", { money: formatMoney(bay.fix), time: formatDuration(bay.minutes * 60) })}
            </Button>
          ) : usedReady(state, now) ? (
            <Button size="sm" variant="gold" className="w-full tabular-nums" onClick={sellUsedCar}>
              💰 {t("used.sell", { money: formatMoney(bay.sell) })}
            </Button>
          ) : (
            <div className="space-y-1">
              <Progress value={Math.min(100, (1 - (u.readyAt - now) / (bay.minutes * 60_000)) * 100)} className="h-1.5" indicatorClassName="from-amber-400 to-yellow-300" />
              <div className="text-center text-[11px] tabular-nums text-white/55">{t("used.working", { time: formatDuration((u.readyAt - now) / 1000) })}</div>
            </div>
          )}
        </div>
      ) : null}
      {u.lot.length ? (
        <div className="space-y-1.5">
          {u.lot.map((c) => {
            const block = buyBlock(state, c.id);
            const profit = c.sell - c.buy - c.fix;
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.07]">
                <span className="text-xl">{CAR_BY_ID[c.car].emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">{n.car(CAR_BY_ID[c.car])}</div>
                  <div className="text-[11px] text-white/55">
                    {t("used.condition", { pct: Math.round(c.cond * 100) })} · <span className="text-lime">+{formatMoney(profit)}</span>
                  </div>
                </div>
                <Button size="sm" variant={block ? "locked" : "gold"} disabled={!!block} className="w-24 shrink-0 tabular-nums" onClick={() => buyUsedCar(c.id)}>
                  {block === "bay" ? t("used.bayFull") : formatMoney(c.buy)}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-white/50">{u.lotAt ? t("used.empty", { time: formatDuration(Math.max(0, nextLotAt(state) - now) / 1000) }) : t("used.locked")}</p>
      )}
      {u.lot.length > 0 && <p className="text-[11px] text-white/40">{t("used.next", { time: formatDuration(Math.max(0, nextLotAt(state) - now) / 1000) })}</p>}
    </div>
  );
}

const DEFECT_MARK: Record<DefectKind, string> = { dent: "💥", wheel: "🛞", paint: "🎨", light: "💡" };

/** Quality control: cars roll past; tap the ones with a defect. */
export function QualityCard() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const finish = useGame((g) => g.finishQc);
  const begin = useGame((g) => g.startQc);
  const { t } = useT();
  const now = state.lastActiveAt;
  const block = qcBlock(state, now);
  const ready = block === null;
  const [round, setRound] = useState<(DefectKind | null)[] | null>(null);
  const [i, setI] = useState(0);
  const [tapped, setTapped] = useState<number[]>([]);
  const [result, setResult] = useState<number | null>(null);
  // the taps the timer reads when the last car has gone by (state would be a render behind)
  const tappedRef = useRef<number[]>([]);

  useEffect(() => {
    if (!round) return;
    if (i >= round.length) {
      const score = finish(round, tappedRef.current);
      setResult(score);
      setRound(null);
      return;
    }
    const id = setTimeout(() => setI((x) => x + 1), QC.carMs);
    return () => clearTimeout(id);
  }, [round, i, finish]);

  const start = () => {
    const r = begin();
    if (!r) return;
    setRound(r);
    setI(0);
    setTapped([]);
    tappedRef.current = [];
    setResult(null);
  };
  const tap = () => {
    if (!round || i >= round.length || tappedRef.current.includes(i)) return;
    tappedRef.current = [...tappedRef.current, i];
    setTapped(tappedRef.current);
  };

  const car = round?.[i];
  const cars = [...unlockedCarIds(state, snap.gm)];
  const model = cars.length ? CAR_BY_ID[cars[i % cars.length]] : undefined;

  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-r from-violet-500/10 to-transparent p-3 ring-1 ring-violet-400/30">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-violet-300/90">🔍 {t("qc.title")}</span>
        <span className="text-[11px] text-white/45">{t("qc.best", { n: Math.round(state.qc.best) })}</span>
      </div>
      {round && i < round.length ? (
        <div className="space-y-2">
          <button
            onClick={tap}
            className={cn(
              "relative flex h-28 w-full items-center justify-center rounded-xl bg-[#1d1d22] ring-1 transition",
              tapped.includes(i) ? (car ? "ring-emerald-400" : "ring-red-400") : "ring-white/10 active:scale-[0.98]",
            )}
            aria-label={t("qc.tap")}
          >
            <span key={i} className="inline-block animate-[qc-roll_1.3s_ease-in-out] motion-reduce:animate-none text-6xl">
              {model?.emoji ?? "🚗"}
            </span>
            {car && <span className="absolute right-6 top-4 text-2xl">{DEFECT_MARK[car]}</span>}
            {tapped.includes(i) && <span className="absolute left-3 top-2 text-lg">{car ? "✅" : "❌"}</span>}
          </button>
          <div className="flex justify-between text-[11px] tabular-nums text-white/55">
            <span>{t("qc.progress", { i: i + 1, n: round.length })}</span>
            <span>{t("qc.tap")}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-snug text-white/60">{t("qc.desc", { money: formatMoney(rewardCash({ incomeSeconds: QC.rewardSeconds }, snap)) })}</p>
          {result !== null && <p className="text-sm font-black text-gold">{t("qc.result", { score: result })}</p>}
          <Button size="sm" variant={ready ? "gold" : "locked"} disabled={!ready} className="w-full" onClick={start}>
            {ready ? t("qc.start") : block === "limit" ? t("qc.limit") : t("qc.wait", { time: formatDuration(Math.max(0, state.qc.nextAt - now) / 1000) })}
          </Button>
          {block === "wait" && <QcAdButton />}
        </div>
      )}
    </div>
  );
}
