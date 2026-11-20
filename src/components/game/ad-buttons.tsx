"use client";

// The rewarded-ad offers (Android app only: on the web no ad is ever ready, so
// none of these show). Each says what the ad gives before it plays; the reward
// comes only when the ad network reports the ad watched to the end. With the
// ad-free rewards purchase, each offer gives its reward at once (🎟️ instead of 📺).
// The one-time offers (the offline report, the daily login) say "loading" while the
// app is still getting their ad, so a player opening the game sees them coming.
import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ADS, type AdReward } from "@/game/config/ads";
import { adOfferBlock, buildWait } from "@/game/engine/ads";
import { formatDuration, formatMoney } from "@/game/format";
import type { MessageKey, Vars } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { adLog } from "@/lib/ad-log";
import { canWatch, showAdPrivacyForm, useAdStatus, watchAd } from "@/lib/ads";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

type T = (key: MessageKey, vars?: Vars) => string;

/**
 * Plays an ad; `onReward` (the game giving the reward) runs only if the ad was watched to the end.
 * If the game then has nothing to give (the report was collected, the limit reached), it says so.
 */
export async function playAd(onReward: () => boolean | void, t: T, place?: string) {
  let refused = false;
  const r = await watchAd(() => {
    refused = onReward() === false;
  }, place);
  if (r === "rewarded" && refused) uiEvents.emit({ type: "toast", tone: "info", icon: "📺", title: t("ad.refused"), body: t("ad.refusedBody") });
  else if (r === "closed") uiEvents.emit({ type: "toast", tone: "info", icon: "📺", title: t("ad.closed"), body: t("ad.closedBody") });
  else if (r === "failed") uiEvents.emit({ type: "toast", tone: "warn", icon: "📺", title: t("ad.failed"), body: t("ad.failedBody") });
}

/** Plays an ad for `reward`. */
const watch = (reward: AdReward, t: T, plot?: string) => playAd(() => useGame.getState().adReward(reward, plot), t, reward);

/**
 * An ad is loaded and not on screen (or ad-free rewards), one is on its way (`loading`), and what
 * would stop the game offering this reward now (adOfferBlock).
 */
function useAdOffer(reward: AdReward, plot?: string) {
  const status = useAdStatus();
  const block = useGame((g) => adOfferBlock(g.state, reward, g.state.lastActiveAt, plot));
  const ready = canWatch(status);
  return { ready, free: status.adFree, block, loading: !ready && status.loading && !status.showing };
}

/**
 * The ad log's word on a one-time offer (the offline report, the daily login): once when it is on
 * screen with its ad ready, once when it is still waiting for it. How often a report never got its
 * offer shows in the log (AD_OFFER_LOADING without AD_OFFER_VISIBLE).
 */
function useOfferLog(place: AdReward, state: "visible" | "loading" | null) {
  useEffect(() => {
    if (state) adLog(state === "visible" ? "AD_OFFER_VISIBLE" : "AD_OFFER_LOADING", "rewarded", { place });
  }, [place, state]);
}

/** A one-time offer whose ad is still loading: there, not yet tappable. */
function LoadingAdButton({ size, className }: { size?: ButtonProps["size"]; className: string }) {
  const { t } = useT();
  return (
    <Button variant="locked" size={size} disabled className={className}>
      {t("ad.loading")}
    </Button>
  );
}

/** Offline report: collect twice the money for an ad. */
export function OfflineAdButton({ amount }: { amount: number }) {
  const { t } = useT();
  const { ready, free, block, loading } = useAdOffer("offline");
  const show = block ? null : ready ? "visible" : loading ? "loading" : null;
  useOfferLog("offline", free ? null : show);
  if (show === "loading") return <LoadingAdButton size="lg" className="mt-2 w-full text-base" />;
  if (show !== "visible") return null;
  return (
    <Button variant="go" size="lg" className="mt-2 w-full text-base" onClick={() => void watch("offline", t)}>
      {free ? "🎟️" : "📺"} {t(free ? "ad.offlineFree" : "ad.offline", { amount: formatMoney(amount * ADS.offlineMult) })}
    </Button>
  );
}

/** Daily login reward: take twice the money for an ad (not on a Star day), next to the plain claim. */
export function LoginAdButton({ amount }: { amount: number }) {
  const { t } = useT();
  const { ready, free, block, loading } = useAdOffer("login");
  const show = block ? null : ready ? "visible" : loading ? "loading" : null;
  useOfferLog("login", free ? null : show);
  if (show === "loading") return <LoadingAdButton size="lg" className="mt-2 w-full" />;
  if (show !== "visible") return null;
  return (
    <Button variant="go" size="lg" className="mt-2 w-full" onClick={() => void watch("login", t)}>
      {free ? "🎟️" : "📺"} {t(free ? "ad.loginFree" : "ad.login", { amount: formatMoney(amount * ADS.loginMult) })}
    </Button>
  );
}

/** Quality control during its break: skip the wait for an ad (the day's inspections stay as they are). */
export function QcAdButton() {
  const { t } = useT();
  const { ready, free, block } = useAdOffer("qc");
  if (!ready || block) return null;
  return (
    <Button variant="go" size="sm" className="w-full" onClick={() => void watch("qc", t)}>
      {t(free ? "ad.qcFree" : "ad.qc")}
    </Button>
  );
}

/** A construction or an upgrade: finish it for an ad (then a pause before the next). */
export function BuildAdButton({ plot, size }: { plot: string; size?: ButtonProps["size"] }) {
  const { t } = useT();
  const { ready, free, block } = useAdOffer("build", plot);
  const wait = useGame((g) => (block === "wait" ? Math.ceil(buildWait(g.state, g.state.lastActiveAt) / 1000) : 0));
  if (!ready || (block && block !== "wait")) return null;
  if (block === "wait")
    return (
      <Button variant="locked" size={size} disabled className="w-full">
        {t(free ? "ad.buildWaitFree" : "ad.buildWait", { time: formatDuration(wait) })}
      </Button>
    );
  return (
    <Button variant="go" size={size} className="w-full" onClick={() => void watch("build", t, plot)}>
      {t(free ? "ad.buildFree" : "ad.build")}
    </Button>
  );
}

/** HUD: the ×2 profit boost running (with its time left), or the offer of one. */
export function AdBoostChip() {
  const { t } = useT();
  const left = useGame((g) => Math.ceil(g.state.ads.boostLeft));
  const { ready, free, block } = useAdOffer("boost");
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
        {free ? "🎟️" : "📺"} {t("ad.boost")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="text-center">
          <div className="mx-auto mb-2 text-5xl">📈</div>
          <DialogTitle className="text-2xl">{t("ad.boostTitle")}</DialogTitle>
          <DialogDescription className="mt-2">{t(free ? "ad.boostBodyFree" : "ad.boostBody")}</DialogDescription>
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
              {free ? `🎟️ ${t("ad.start")}` : `📺 ${t("ad.watch")}`}
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
