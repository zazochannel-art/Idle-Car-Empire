"use client";

// The rewarded-ad offers (Android app only: on the web no ad is ever ready, so
// none of these show). Each says what the ad gives before it plays; the reward
// comes only when the ad network reports the ad watched to the end.
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ADS, type AdReward } from "@/game/config/ads";
import { adBlock, buildWait } from "@/game/engine/ads";
import { formatDuration, formatMoney } from "@/game/format";
import type { MessageKey, Vars } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { showAdPrivacyForm, useAdStatus, watchAd } from "@/lib/ads";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

type T = (key: MessageKey, vars?: Vars) => string;

/** Plays an ad; `onReward` (the game giving the reward) runs only if the ad was watched to the end. */
export async function playAd(onReward: () => void, t: T) {
  const r = await watchAd(onReward);
  if (r === "closed") uiEvents.emit({ type: "toast", tone: "info", icon: "📺", title: t("ad.closed"), body: t("ad.closedBody") });
  else if (r === "failed") uiEvents.emit({ type: "toast", tone: "warn", icon: "📺", title: t("ad.failed"), body: t("ad.failedBody") });
}

/** Plays an ad for `reward`. */
const watch = (reward: AdReward, t: T, plot?: string) => playAd(() => useGame.getState().adReward(reward, plot), t);

/** An ad is loaded and not on screen, and what would stop the game giving this reward now. */
function useAdOffer(reward: AdReward, plot?: string) {
  const { ready, showing } = useAdStatus();
  const block = useGame((g) => adBlock(g.state, reward, g.state.lastActiveAt, plot));
  return { ready: ready && !showing, block };
}

/** Offline report: collect twice the money for an ad. */
export function OfflineAdButton({ amount }: { amount: number }) {
  const { t } = useT();
  const { ready, block } = useAdOffer("offline");
  if (!ready || block) return null;
  return (
    <Button variant="go" size="lg" className="mt-2 w-full text-base" onClick={() => void watch("offline", t)}>
      📺 {t("ad.offline", { amount: formatMoney(amount * ADS.offlineMult) })}
    </Button>
  );
}

/** A construction or an upgrade: finish it for an ad (then a pause before the next). */
export function BuildAdButton({ plot, size }: { plot: string; size?: ButtonProps["size"] }) {
  const { t } = useT();
  const { ready, block } = useAdOffer("build", plot);
  const wait = useGame((g) => (block === "wait" ? Math.ceil(buildWait(g.state, g.state.lastActiveAt) / 1000) : 0));
  if (!ready || (block && block !== "wait")) return null;
  if (block === "wait")
    return (
      <Button variant="locked" size={size} disabled className="w-full">
        {t("ad.buildWait", { time: formatDuration(wait) })}
      </Button>
    );
  return (
    <Button variant="go" size={size} className="w-full" onClick={() => void watch("build", t, plot)}>
      {t("ad.build")}
    </Button>
  );
}

/** HUD: the ×2 profit boost running (with its time left), or the offer of one. */
export function AdBoostChip() {
  const { t } = useT();
  const left = useGame((g) => Math.ceil(g.state.ads.boostLeft));
  const { ready, block } = useAdOffer("boost");
  const [open, setOpen] = useState(false);
  const style = "pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-lg bg-black/20 px-2 py-1 text-[13px] font-bold text-lime md:py-1.5";
  if (left > 0)
    return (
      <button className={style} onClick={() => uiEvents.emit({ type: "toast", tone: "gold", icon: "📈", title: t("ad.boostTitle"), body: t("ad.boostLeftBody") })}>
        📈 <span className="tabular-nums">{t("ad.boostLeft", { time: formatDuration(left) })}</span>
      </button>
    );
  if (!ready || block) return null;
  return (
    <>
      <button className={style} onClick={() => setOpen(true)}>
        📺 {t("ad.boost")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="text-center">
          <div className="mx-auto mb-2 text-5xl">📈</div>
          <DialogTitle className="text-2xl">{t("ad.boostTitle")}</DialogTitle>
          <DialogDescription className="mt-2">{t("ad.boostBody")}</DialogDescription>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              {t("ad.notNow")}
            </Button>
            <Button
              variant="go"
              className="flex-1"
              onClick={() => {
                setOpen(false);
                void watch("boost", t);
              }}
            >
              📺 {t("ad.watch")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Settings: where the law asks for it, a way to change the ad consent. */
export function AdPrivacyButton() {
  const { t } = useT();
  const { privacyOptions } = useAdStatus();
  if (!privacyOptions) return null;
  return (
    <Button variant="ghost" size="sm" className="w-full" onClick={() => void showAdPrivacyForm().catch(() => {})}>
      🛡️ {t("settings.adPrivacy")}
    </Button>
  );
}
