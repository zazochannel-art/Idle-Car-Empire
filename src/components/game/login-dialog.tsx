"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LOGIN_REWARDS } from "@/game/config/login";
import { rewardCash } from "@/game/engine/progress";
import { formatMoney } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** Once a day: the streak calendar and today's reward. */
export function LoginDialog() {
  const login = useGame((g) => g.state.login);
  const played = useGame((g) => g.state.lifetime.playTime);
  const away = useGame((g) => !!g.state.pendingOffline);
  const snap = useGame((g) => g.snap);
  const claimLogin = useGame((g) => g.claimLogin);
  const { t } = useT();
  // not in the first minutes of a brand-new game, and not over the offline report
  const open = !!login.day && !login.claimed && played > 120 && !away;
  // a new game has no streak yet (0): never index before day 1
  const r = LOGIN_REWARDS[Math.max(0, login.streak - 1) % LOGIN_REWARDS.length];
  const reward = r.stars ? `${r.stars} ⭐` : formatMoney(rewardCash(r, snap));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && claimLogin()}>
      <DialogContent>
        <div className="mb-2 text-5xl">🎁</div>
        <DialogTitle>{t("login.title", { n: login.streak })}</DialogTitle>
        <DialogDescription className="mt-1">{t("login.subtitle")}</DialogDescription>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {LOGIN_REWARDS.map((dayReward, i) => {
            const day = i + 1;
            const today = day === login.streak;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center ring-1",
                  today ? "bg-gold/15 ring-gold" : day < login.streak ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-white/[0.03] ring-white/10",
                )}
              >
                <span className="text-[9px] font-bold uppercase text-white/50">{t("login.day", { n: day })}</span>
                <span className="text-base leading-none">{dayReward.stars ? "⭐" : day < login.streak ? "✅" : "💰"}</span>
              </div>
            );
          })}
        </div>
        <Button variant="gold" size="lg" className="mt-4 w-full" onClick={claimLogin}>
          {t("login.claim", { reward })}
        </Button>
        <p className="mt-2 text-center text-[11px] text-white/45">{t("login.hint")}</p>
      </DialogContent>
    </Dialog>
  );
}
