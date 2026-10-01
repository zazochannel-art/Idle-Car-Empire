"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FACTORIES, FACTORY_BY_ID } from "@/game/config/factories";
import { describeBonus, MANAGERS } from "@/game/config/managers";
import { isManagerUnlocked } from "@/game/engine/actions";
import { managerUpgradeCost } from "@/game/engine/economy";
import { formatMoney } from "@/game/format";
import type { FactoryId } from "@/game/types";
import { useGame } from "@/store/game-store";
import { CostButton } from "../game/cost-button";
import { ViewHeader } from "./section-title";

export function ManagersView() {
  const state = useGame((g) => g.state);
  const { hireManager, upgradeManager, assignManager } = useGame.getState();
  const owned = FACTORIES.filter((f) => state.factories[f.id].owned);
  const hired = MANAGERS.filter((m) => state.managers[m.id].hired).length;

  return (
    <div className="space-y-4">
      <ViewHeader
        icon="👨‍💼"
        title="Managers"
        subtitle={`${hired}/${MANAGERS.length} hired. One manager per factory: they automate it and boost it. Global managers help every plant from wherever they sit.`}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {MANAGERS.map((m) => {
          const st = state.managers[m.id];
          const unlocked = isManagerUnlocked(state, m.id);
          if (!st.hired) {
            const pct = Math.min(100, (state.lifetime.moneyEarned / Math.max(1, m.unlockAt)) * 100);
            return (
              <div key={m.id} className={`rounded-2xl p-4 ring-1 ${unlocked ? "glass" : "bg-white/[0.02] ring-white/[0.05]"}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-4xl ${unlocked ? "" : "grayscale opacity-40"}`}>{m.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.name}</span>
                      <Badge variant={m.scope === "global" ? "gold" : "muted"}>{m.scope === "global" ? "Global" : "Factory"}</Badge>
                    </div>
                    <div className="text-xs text-white/50">{m.role}</div>
                    <div className="text-xs text-emerald-300">{describeBonus(m.bonus, 1)}</div>
                  </div>
                </div>
                {unlocked ? (
                  <CostButton className="mt-3 w-full" variant="gold" cost={m.cost} onBuy={() => hireManager(m.id, firstFree(state, owned.map((f) => f.id)))} label="Hire" />
                ) : (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/45">
                      <Lock className="size-3" /> Unlocks after earning {formatMoney(m.unlockAt)} total
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={m.id} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{m.avatar}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <Badge>Lv {st.level}</Badge>
                    <Badge variant={m.scope === "global" ? "gold" : "muted"}>{m.scope === "global" ? "Global" : "Factory"}</Badge>
                  </div>
                  <div className="text-xs text-white/50">{m.role}</div>
                  <div className="text-xs text-emerald-300">{describeBonus(m.bonus, st.level)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-white/45">
                  Assigned to
                  <select
                    value={st.assignedTo ?? ""}
                    onChange={(e) => assignManager(m.id, (e.target.value || null) as FactoryId | null)}
                    className="h-10 rounded-xl bg-white/[0.06] px-2 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-electric/60"
                  >
                    <option value="">— Unassigned —</option>
                    {owned.map((f) => {
                      const other = MANAGERS.find((x) => x.id !== m.id && state.managers[x.id].assignedTo === f.id);
                      return (
                        <option key={f.id} value={f.id}>
                          {f.emoji} {f.name}
                          {other ? ` (swap ${other.name})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <CostButton className="self-end" cost={managerUpgradeCost(state, m.id)} onBuy={() => upgradeManager(m.id)} label="Train" />
              </div>
              {!st.assignedTo && <p className="mt-2 text-[11px] text-amber-300/80">Idle — assign to a factory to activate the bonus.</p>}
              {st.assignedTo && <p className="mt-2 text-[11px] text-white/40">Working at {FACTORY_BY_ID[st.assignedTo].name}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function firstFree(state: ReturnType<typeof useGame.getState>["state"], owned: FactoryId[]): FactoryId | undefined {
  const busy = new Set(Object.values(state.managers).map((m) => m.assignedTo));
  return owned.find((f) => !busy.has(f));
}
