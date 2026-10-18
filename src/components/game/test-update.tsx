"use client";

// The test app offers a newer build of itself (lib/test-update.ts): looked for a little
// after the start and when the app comes back, at most once an hour, and each build
// offered once. The download opens in the browser; the file installs over this app.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/use-t";
import { isNativeApp } from "@/lib/platform";

const LOOK_EVERY = 3600_000;

export function TestUpdate() {
  const { t } = useT();
  const [offer, setOffer] = useState<{ latest: number; mine: number; url: string } | null>(null);

  useEffect(() => {
    if (!isNativeApp() || !process.env.NEXT_PUBLIC_TEST_BUILD) return;
    let last = 0;
    let offered = 0;
    let gone = false;
    const look = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < LOOK_EVERY) return;
      last = Date.now();
      const m = await import("@/lib/test-update");
      const latest = await m.newerTestBuild();
      if (gone || !latest || latest <= offered) return;
      offered = latest;
      setOffer({ latest, mine: m.TEST_BUILD, url: m.TEST_APK_URL });
    };
    // not while the game is starting
    const first = setTimeout(() => void look(), 20_000);
    const onVisible = () => void look();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Dialog open={!!offer} onOpenChange={(open) => !open && setOffer(null)}>
      <DialogContent className="text-center">
        <div className="mx-auto mb-2 text-5xl">⬇️</div>
        <DialogTitle className="text-2xl">{t("update.title")}</DialogTitle>
        <DialogDescription className="mt-2">{t("update.body", { n: offer?.latest ?? 0, mine: offer?.mine ?? 0 })}</DialogDescription>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOffer(null)}>
            {t("update.later")}
          </Button>
          <Button asChild variant="go" className="flex-1">
            <a href={offer?.url} target="_blank" rel="noreferrer" onClick={() => setOffer(null)}>
              {t("update.download")}
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
