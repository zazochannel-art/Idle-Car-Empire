"use client";

// Reasons to come back: the VIP order, the weekly racing season, the
// weekend Auto Show, and the classic cars of the museum.
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { CLASSICS } from "@/game/config/classics";
import { RIVAL_BY_ID } from "@/game/config/racing";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { classicLock, hasMuseum } from "@/game/engine/classics";
import { unlockedCarIds } from "@/game/engine/economy";
import { scoreOf, seasonReward, seasonTable, showKey, showOpen, showReward, weekStart } from "@/game/engine/live";
import { modelStats } from "@/game/engine/chain";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const DAY = 86_400_000;
const colorDot = (c: string) => <span className="inline-block size-3 rounded-full align-middle ring-1 ring-white/40" style={{ background: c }} />;

/** 💎 A famous client's order: a few cars of one model, in their colour. */
export function VipCard() {
  const state = useGame((g) => g.state);
  const { acceptVip, declineVip, claimVip, setDesignColor } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const v = state.vip;
  const o = v.active ?? v.offer;
  const now = state.lastActiveAt;
  if (!o) {
    const wait = !state.chain.firstCar ? t("vip.afterFirstCar") : t("vip.none", { time: formatDuration(Math.max(0, v.nextAt - now) / 1000) });
    return <p className="rounded-2xl bg-white/[0.03] p-3 text-xs text-white/45 ring-1 ring-white/[0.06]">💎 {wait}</p>;
  }
  const car = CAR_BY_ID[o.car];
  const made = o.made ?? 0;
  const done = !!v.active && made >= o.n;
  const painted = state.designs[o.car].color === o.color;
  return (
    <div className="rounded-2xl bg-gradient-to-r from-fuchsia-500/15 to-amber-500/10 p-3 ring-1 ring-fuchsia-400/30">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{t(`vip.emoji.${o.client}` as MessageKey)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/90">{t(`vip.client.${o.client}` as MessageKey)}</div>
          <div className="text-sm font-bold">
            {t("vip.order", { n: o.n, car: `${state.designs[o.car].name} (${n.car(car)})` })} {colorDot(o.color)}
          </div>
          <div className="text-[11px] text-white/60">
            {o.premium && <span className="mr-1 rounded bg-sky-400/15 px-1 text-sky-200">💎 {t("vip.premium")}</span>}
            {t("vip.reward", { cash: formatMoney(o.pay), stars: o.stars })}
            {" · "}
            {v.active ? t("contract.left", { time: formatDuration(Math.max(0, (o.deadline ?? now) - now) / 1000) }) : t("contract.time", { m: o.minutes })}
          </div>
        </div>
      </div>
      {v.active && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Progress value={Math.min(100, (made / o.n) * 100)} className="h-1.5" indicatorClassName="from-fuchsia-400 to-amber-300" />
            <span className="shrink-0 text-[11px] tabular-nums text-white/60">
              {made}/{o.n}
            </span>
          </div>
          {!done && !painted && (
            <button onClick={() => setDesignColor(o.car, o.color)} className="mt-2 w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-left text-[11px] text-amber-200 ring-1 ring-amber-400/30">
              🎨 {t("vip.paint")} {colorDot(o.color)}
            </button>
          )}
          {!done && o.premium && <p className="mt-1 text-[11px] text-white/50">{t("vip.premiumHint")}</p>}
        </>
      )}
      <div className="mt-2 flex gap-2">
        {v.offer && (
          <>
            <Button size="sm" variant="gold" className="flex-1" onClick={acceptVip}>
              {t("contract.accept")}
            </Button>
            <Button size="sm" variant="secondary" onClick={declineVip}>
              {t("contract.decline")}
            </Button>
          </>
        )}
        {done && (
          <Button size="sm" variant="gold" className="flex-1" onClick={claimVip}>
            {t("vip.deliver")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** 🏆 The week's racing table and last week's prize. */
export function SeasonCard() {
  const state = useGame((g) => g.state);
  const claimSeason = useGame((g) => g.claimSeason);
  const { t } = useT();
  const now = state.lastActiveAt;
  const table = seasonTable(state, now);
  const ends = weekStart(now) + 7 * DAY - now;
  const last = state.season.last;
  const rw = last ? seasonReward(last.rank) : null;
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">🏆 {t("season.title")}</span>
        <span className="text-[10px] tabular-nums text-white/45">{t("season.ends", { time: formatDuration(ends / 1000) })}</span>
      </div>
      {!state.racing.unlocked && <p className="mb-2 text-[11px] text-white/50">{t("season.locked")}</p>}
      <ol className="space-y-1">
        {table.map((r, i) => (
          <li key={r.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-xs", r.you ? "bg-gold/10 ring-1 ring-gold/30" : "bg-white/[0.02]")}>
            <span className="w-4 text-center font-bold text-white/50">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.you ? t("rival.you") : `${RIVAL_BY_ID[r.id]?.logo ?? ""} ${RIVAL_BY_ID[r.id]?.name ?? r.id}`}</span>
            <span className="tabular-nums text-white/70">{formatNumber(r.points)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-white/45">{t("season.desc")}</p>
      {last && !last.claimed && rw && (
        <div className="mt-2 rounded-xl bg-gold/10 p-2 ring-1 ring-gold/30">
          <div className="text-xs font-bold text-gold">{t("season.result", { rank: last.rank + 1, points: formatNumber(last.points) })}</div>
          <div className="text-[11px] text-white/60">{t("season.prize", { stars: rw.stars, parts: rw.parts })}</div>
          <Button size="sm" variant="gold" className="mt-2 w-full" onClick={claimSeason}>
            {t("season.claim")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** 🎪 The weekend Auto Show: enter one model, the judges vote. */
export function ShowCard() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { enterShow, claimShow } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const now = state.lastActiveAt;
  const open = showOpen(now);
  const entered = state.show.key === showKey(now) && !!state.show.car;
  const unlocked = unlockedCarIds(state, snap.gm);
  const cars = CARS.filter((c) => unlocked.has(c.id));
  const nextSat = (() => {
    const d = new Date(now);
    const days = (6 - d.getDay() + 7) % 7;
    d.setHours(0, 0, 0, 0);
    return d.getTime() + days * DAY;
  })();
  const sh = state.show;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-rose-500/10 p-3 ring-1 ring-amber-400/25">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200">🎪 {t("show.title")}</span>
        {!open && <span className="text-[10px] tabular-nums text-white/45">{t("show.opens", { time: formatDuration(Math.max(0, nextSat - now) / 1000) })}</span>}
      </div>
      <p className="text-[11px] text-white/55">{t("show.desc")}</p>
      {open && !entered && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {cars.length === 0 && <p className="col-span-2 text-[11px] text-white/45">{t("show.noCars")}</p>}
          {cars.map((c) => (
            <button key={c.id} onClick={() => enterShow(c.id)} className="rounded-xl bg-white/[0.04] p-2 text-left text-xs ring-1 ring-white/10 hover:bg-white/[0.08]">
              <div className="truncate font-bold">
                {c.emoji} {state.designs[c.id].name}
              </div>
              <div className="text-[10px] text-white/50">
                {n.car(c)} · {t("show.score", { n: scoreOf(modelStats(state, c)) })}
              </div>
            </button>
          ))}
        </div>
      )}
      {sh.car && sh.board.length > 0 && sh.key === showKey(now) && (
        <div className="mt-2">
          <ol className="space-y-1">
            {sh.board.map((e, i) => (
              <li key={`${e.name}${i}`} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-xs", e.you ? "bg-gold/10 ring-1 ring-gold/30" : "bg-white/[0.02]")}>
                <span className="w-4 text-center font-bold text-white/50">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {CAR_BY_ID[e.car].emoji} {e.name}
                </span>
                <span className="tabular-nums text-white/70">{t("show.votes", { n: formatNumber(e.score * 37) })}</span>
              </li>
            ))}
          </ol>
          {!sh.claimed && (
            <Button size="sm" variant="gold" className="mt-2 w-full" onClick={claimShow}>
              {t("show.claim", { rank: sh.rank + 1, stars: showReward(sh.rank).stars })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 🏛️ Barn finds restored in the garage, shown in the museum. */
export function ClassicsPanel() {
  const state = useGame((g) => g.state);
  const restore = useGame((g) => g.restoreClassic);
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const now = state.lastActiveAt;
  const c = state.classics;
  const museum = hasMuseum(state);
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">🏛️ {t("classics.title", { n: c.owned.length, total: CLASSICS.length })}</div>
      <p className="mb-2 text-[11px] text-white/50">{museum ? t("classics.desc") : t("classics.noMuseum", { museum: t(`structure.museum` as MessageKey) })}</p>
      {!museum && (
        <Button size="sm" variant="secondary" className="mb-2 w-full" onClick={() => setView("build")}>
          {STRUCTURE_BY_ID.museum.emoji} {t("unlock.build")}
        </Button>
      )}
      <div className="space-y-1.5">
        {CLASSICS.map((cl) => {
          const owned = c.owned.includes(cl.id);
          const busy = c.restoring?.id === cl.id;
          const lock = classicLock(state, cl.id);
          return (
            <div key={cl.id} className={cn("flex items-center gap-2 rounded-xl p-2 ring-1", owned ? "bg-emerald-500/[0.07] ring-emerald-400/25" : "bg-white/[0.02] ring-white/[0.06]")}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xl" style={{ background: `${cl.color}33` }}>
                {cl.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">
                  {t(`classic.${cl.id}` as MessageKey)} <span className="text-white/40">’{String(cl.year).slice(2)}</span>
                </div>
                <div className="text-[10px] text-white/50">
                  🎟️ +{formatMoney(cl.ticket)}
                  {t("unit.perSec")} · ⏱️ {formatDuration(cl.minutes * 60)}
                </div>
              </div>
              {owned ? (
                <span className="text-xs font-bold text-emerald-300">✓</span>
              ) : busy ? (
                <span className="text-[11px] tabular-nums text-amber-200">🔧 {formatDuration(Math.max(0, (c.restoring!.until - now) / 1000))}</span>
              ) : (
                <Button size="sm" variant={lock === null ? "gold" : "secondary"} disabled={lock !== null} onClick={() => restore(cl.id)}>
                  {lock === "garage" ? t("classics.needGarage") : lock === "busy" ? t("classics.busy") : formatMoney(cl.cost)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
