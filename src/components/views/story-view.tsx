"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CHAPTERS, DILEMMA_BY_ID, RIVAL_CEO, type StoryEffect } from "@/game/config/story";
import type { EconomySnapshot } from "@/game/engine/economy";
import { rewardCash } from "@/game/engine/progress";
import { canChoose, chapterProgress, effectCash, effectRp } from "@/game/engine/story";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { rewardLabel } from "../game/goals";
import { moodFace } from "../plant/floor-controls";
import { SectionTitle, ViewHeader } from "./section-title";

type T = ReturnType<typeof useT>["t"];

const signed = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n)}`;

/** One consequence of a choice, as a chip: what it does, in plain numbers. */
function EffectChip({ e, plant, snap, t }: { e: StoryEffect; plant: string; snap: EconomySnapshot; t: T }) {
  let text = "";
  let tone = "bg-white/10 text-white/80";
  switch (e.kind) {
    case "cash": {
      const v = effectCash(e, snap);
      text = `${v > 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;
      tone = v > 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200";
      break;
    }
    case "morale":
      text = `${moodFace(e.amount > 0 ? 90 : 40)} ${e.scope === "all" ? t("story.e.moraleAll", { n: signed(e.amount) }) : t("story.e.moralePlant", { n: signed(e.amount), plant })}`;
      tone = e.amount > 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200";
      break;
    case "rep":
      text = `⭐ ${t("story.e.rep", { n: signed(e.amount) })}`;
      tone = e.amount > 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200";
      break;
    case "rp":
      text = `🔬 ${t("story.e.rp", { n: formatNumber(effectRp(e, snap)) })}`;
      tone = "bg-sky-500/20 text-sky-200";
      break;
    case "breakdown":
      text = `🔧 ${t("story.e.breakdown", { plant })}`;
      tone = "bg-red-500/20 text-red-200";
      break;
    case "boost":
      text = `⚡ ${t("story.e.boost", { plant, s: e.seconds })}`;
      tone = "bg-cyan-500/20 text-cyan-200";
      break;
  }
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone)}>{text}</span>;
}

function plantName(state: GameState, plot: string, t: T) {
  const b = state.city.buildings[plot];
  return b ? t(`structure.${b.type}` as MessageKey) : "";
}

/** The decision on the CEO's desk: what happened, and two choices with their consequences. */
function DilemmaCard() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const decide = useGame((g) => g.decide);
  const { t } = useT();
  const st = state.story;
  const p = st.pending;
  const played = state.lifetime.playTime;
  if (!p) {
    const last = st.last;
    return (
      <div className="rounded-xl bg-white/[0.03] p-3 text-sm text-white/60 ring-1 ring-white/[0.06]">
        <div>🗂️ {t("story.empty")}</div>
        {st.nextAt > played && <div className="mt-1 text-[11px] text-white/45">{t("story.nextIn", { time: formatDuration(st.nextAt - played) })}</div>}
        {last && DILEMMA_BY_ID[last.id] && (
          <div className="mt-1 text-[11px] text-white/45">
            {t("story.last", { title: t(`story.d.${last.id}.title` as MessageKey, { plant: plantName(state, last.plot ?? "", t) || "…" }), choice: t(`story.d.${last.id}.${last.choice ? "b" : "a"}` as MessageKey) })}
          </div>
        )}
      </div>
    );
  }
  const d = DILEMMA_BY_ID[p.id];
  const plant = plantName(state, p.plot, t);
  return (
    <div className="overflow-hidden rounded-xl bg-[#2b2b2e] ring-2 ring-gold/60">
      <div className="flex items-start gap-3 bg-gradient-to-r from-gold/20 to-transparent p-3">
        <span className="text-4xl leading-none">{d.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-black text-gold">{t(`story.d.${d.id}.title` as MessageKey, { plant })}</div>
          <p className="mt-0.5 text-[13px] leading-snug text-white/75">{t(`story.d.${d.id}.text` as MessageKey, { plant })}</p>
          <div className="mt-1 text-[11px] text-white/45">⏳ {t("story.timeLeft", { time: formatDuration(Math.max(0, p.until - played)) })}</div>
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {([0, 1] as const).map((c) => {
          const ok = canChoose(state, c, snap);
          const effects = d.choices[c];
          return (
            <button
              key={c}
              disabled={!ok}
              onClick={() => {
                if (decide(c)) cue(c === 0 ? "buy" : "coin");
              }}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-xl p-3 text-left ring-1 transition active:translate-y-[1px]",
                ok ? "bg-white/[0.06] ring-white/15 hover:bg-white/[0.1]" : "cursor-not-allowed bg-white/[0.02] opacity-60 ring-white/5",
              )}
            >
              <span className="text-sm font-bold">{t(`story.d.${d.id}.${c ? "b" : "a"}` as MessageKey)}</span>
              <span className="flex flex-wrap gap-1">
                {effects.length ? effects.map((e, i) => <EffectChip key={i} e={e} plant={plant} snap={snap} t={t} />) : <span className="text-[11px] text-white/50">{t("story.e.none")}</span>}
              </span>
              {!ok && <span className="text-[11px] font-semibold text-red-300">{t("story.cantAfford")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function goalText(state: GameState, i: number, t: T): string {
  const g = CHAPTERS[i].goal;
  if (g.type === "rival") return t("story.goal.rival");
  if (g.type === "income") return t("story.goal.income", { money: formatMoney(g.target) });
  return t(`story.goal.${g.metric}` as MessageKey, { n: formatNumber(g.target) });
}

/** Otto Kaiser and the campaign: what he says, the chapter's goal, its reward. */
function RivalCard() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const claim = useGame((g) => g.claimChapter);
  const { t } = useT();
  const i = state.story.chapter;
  const ch = CHAPTERS[i];
  const prog = ch ? chapterProgress(state, ch, snap) : null;
  const won = !ch;
  const quote = won ? t(`story.ch.${CHAPTERS.length}.done` as MessageKey) : t(`story.ch.${i + 1}.${prog!.done ? "done" : "intro"}` as MessageKey);
  const money = ch?.goal.type === "income";
  const fmt = (n: number) => (money ? formatMoney(n) : formatNumber(Math.floor(n)));
  return (
    <div className="overflow-hidden rounded-xl bg-[#2b2b2e] ring-1 ring-white/10">
      <div className="flex items-start gap-3 p-3">
        {/* the rival's portrait */}
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5b1d1d] to-[#2a0f0f] text-3xl ring-2 ring-gold/50 shadow-[0_3px_0_0_rgba(0,0,0,0.4)]">{RIVAL_CEO.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/45">{t("story.rival")}</div>
          {/* his speech bubble */}
          <div className="relative mt-1 rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] font-semibold leading-snug text-[#1d1d20] shadow">“{quote}”</div>
        </div>
      </div>
      {won ? (
        <div className="border-t border-white/10 p-3 text-sm font-bold text-gold">🏆 {t("story.won")}</div>
      ) : (
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <span>{t("story.chapter", { n: i + 1, total: CHAPTERS.length })}</span>
            <span className="text-gold/80">
              {t("story.reward")}: {rewardLabel(ch.reward, rewardCash(ch.reward, snap), t("unit.rp"), (pct) => t("mission.boost", { pct }))}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold">🎯 {goalText(state, i, t)}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={(Math.min(prog!.value, prog!.target) / prog!.target) * 100} className="h-2" indicatorClassName={prog!.done ? "from-emerald-400 to-emerald-300" : undefined} />
            {ch.goal.type !== "rival" && (
              <span className="shrink-0 text-[11px] tabular-nums text-white/55">
                {fmt(Math.min(prog!.value, prog!.target))}/{fmt(prog!.target)}
              </span>
            )}
          </div>
          {prog!.done && (
            <Button
              variant="gold"
              className="mt-2 w-full"
              onClick={() => {
                if (claim()) cue("coin");
              }}
            >
              {t("story.claim")}
            </Button>
          )}
        </div>
      )}
      {/* the road so far */}
      <div className="flex items-center gap-1 border-t border-white/10 px-3 py-2">
        {CHAPTERS.map((_, k) => (
          <div key={k} className="flex flex-1 items-center gap-1" title={goalText(state, k, t)}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                k < i ? "bg-emerald-500 text-white" : k === i ? "bg-gold text-black ring-2 ring-gold/40" : "bg-white/10 text-white/40",
              )}
            >
              {k < i ? <CheckCircle2 className="size-4" /> : k + 1}
            </span>
            {k < CHAPTERS.length - 1 && <span className={cn("h-0.5 flex-1 rounded", k < i ? "bg-emerald-500/70" : "bg-white/10")} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoryView() {
  const { t } = useT();
  return (
    <div className="space-y-5">
      <ViewHeader icon="📖" title={t("nav.story")} subtitle={t("story.subtitle")} />
      <section className="space-y-2">
        <SectionTitle title={t("story.desk")} />
        <DilemmaCard />
      </section>
      <section className="space-y-2">
        <SectionTitle title={t("story.campaign")} />
        <RivalCard />
      </section>
    </div>
  );
}
