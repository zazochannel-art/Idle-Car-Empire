"use client";

// The Play app offers a newer version of itself (lib/play-update.ts): looked for a little after
// the start and when the app comes back, at most once an hour, never during the first tour.
// Update opens Google Play's own update screen; the company is saved when the app goes to the
// background, as always.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/use-t";
import { isNativeApp } from "@/lib/platform";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const LOOK_EVERY = 3600_000;

export function PlayUpdate() {
  const { t } = useT();
  const [offer, setOffer] = useState(false);

  useEffect(() => {
    if (!isNativeApp() || process.env.NEXT_PUBLIC_TEST_BUILD) return;
    let last = 0;
    let gone = false;
    const look = async () => {
      if (document.visibilityState !== "visible" || !useGame.getState().ready || useUi.getState().tutorial) return;
      if (Date.now() - last < LOOK_EVERY) return;
      last = Date.now();
      const m = await import("@/lib/play-update");
      if (!gone && (await m.playUpdateToOffer())) setOffer(true);
    };
    // not while the game is starting
    const first = setTimeout(() => void look(), 25_000);
    const onVisible = () => void look();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const update = async () => {
    setOffer(false);
    // saved before Play's screen covers the game
    await useGame.getState().syncNow().catch(() => {});
    const m = await import("@/lib/play-update");
    await m.installPlayUpdate();
  };

  return (
    <Dialog open={offer} onOpenChange={(open) => !open && setOffer(false)}>
      <DialogContent className="text-center">
        <div className="mx-auto mb-2 text-5xl">⬆️</div>
        <DialogTitle className="text-2xl">{t("update.play.title")}</DialogTitle>
        <DialogDescription className="mt-2">{t("update.play.body")}</DialogDescription>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOffer(false)}>
            {t("update.later")}
          </Button>
          <Button variant="go" className="flex-1" onClick={() => void update()}>
            {t("update.play.update")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
