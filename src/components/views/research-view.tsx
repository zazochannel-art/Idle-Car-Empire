"use client";

import { Check, ChevronRight, FlaskConical, Lock } from "lucide-react";
import { RESEARCH, RESEARCH_BY_ID, RESEARCH_CATEGORIES } from "@/game/config/research";
import { canResearch } from "@/game/engine/actions";
import { formatNumber } from "@/game/format";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { AnimatedNumber } from "../game/animated-number";
import { CostButton } from "../game/cost-button";
import { ViewHeader } from "./section-title";

const rpFormat = (n: number) => `${formatNumber(Math.floor(n))} RP`;

export function ResearchView() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const research = useGame((g) => g.research);
  const done = state.research.length;

  return (
    <div className="space-y-4">
      <ViewHeader icon="🔬" title="Research Lab" subtitle="Every car you build generates research points. Research is permanent — it survives Global Expansion.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2 ring-1 ring-violet-400/30">
            <FlaskConical className="size-4 text-violet-300" />
            <AnimatedNumber value={state.rp} format={rpFormat} className="text-lg font-bold tabular-nums text-violet-200" />
          </div>
          <span className="text-xs text-white/50">+{formatNumber(snap.rpPerSec)} RP/s</span>
          <span className="ml-auto text-xs text-white/50">
            {done}/{RESEARCH.length} complete
          </span>
        </div>
      </ViewHeader>

      <div className="space-y-4">
        {RESEARCH_CATEGORIES.map((cat) => {
          const nodes = RESEARCH.filter((r) => r.category === cat.id);
          return (
            <section key={cat.id}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span>{cat.emoji}</span>
                <span style={{ color: cat.color }}>{cat.name}</span>
              </h3>
              <div className="scrollbar-none -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                {nodes.map((node, i) => {
                  const isDone = state.research.includes(node.id);
                  const available = canResearch(state, node.id);
                  const missing = node.requires.filter((r) => !state.research.includes(r));
                  return (
                    <div key={node.id} className="flex shrink-0 snap-start items-center gap-2">
                      <div
                        className={cn(
                          "flex w-60 flex-col rounded-2xl p-3 ring-1 sm:w-auto sm:flex-1",
                          isDone ? "bg-emerald-500/[0.06] ring-emerald-400/30" : available ? "glass" : "bg-white/[0.02] opacity-60 ring-white/[0.05]",
                        )}
                        style={available && !isDone ? { boxShadow: `inset 0 0 0 1px ${cat.color}40` } : undefined}
                      >
                        <div className="flex items-center gap-2">
                          {isDone ? <Check className="size-4 text-emerald-400" /> : !available ? <Lock className="size-3.5 text-white/40" /> : null}
                          <span className="text-sm font-semibold">{node.name}</span>
                        </div>
                        <p className="mt-1 flex-1 text-xs text-white/55">{node.description}</p>
                        {!isDone && missing.length > 0 && (
                          <p className="mt-1 text-[10px] text-white/35">Needs {missing.map((m) => RESEARCH_BY_ID[m].name).join(" + ")}</p>
                        )}
                        {!isDone && (
                          <CostButton
                            size="sm"
                            currency="rp"
                            className="mt-2 w-full"
                            variant="default"
                            cost={node.cost}
                            locked={!available}
                            onBuy={() => research(node.id)}
                          />
                        )}
                      </div>
                      {i < nodes.length - 1 && <ChevronRight className="size-4 shrink-0 text-white/20 sm:hidden" />}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
