"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WHATS_NEW } from "@/game/config/whats-new";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

/**
 * What the update brought, once, with a button to each new thing. It waits for the other
 * dialogs of a return (time away, the daily reward) and for the first-company tour.
 */
export function WhatsNewDialog({ onSettings }: { onSettings: () => void }) {
  const tutorial = useUi((u) => u.tutorial);
  const due = useGame((g) => {
    const s = g.state;
    const login = !!s.login.day && !s.login.claimed && s.lifetime.playTime > 120;
    return g.ready && s.settings.whatsNew !== WHATS_NEW.id && !s.pendingOffline && !login && !s.quality.recall;
  });
  const seen = useGame((g) => g.seenWhatsNew);
  const { t } = useT();
  const close = () => seen(WHATS_NEW.id);
  return (
    <Dialog open={due && !tutorial} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <div className="mb-1 text-4xl">✨</div>
        <DialogTitle>{t("whatsNew.title")}</DialogTitle>
        <DialogDescription className="mt-1">{t("whatsNew.subtitle")}</DialogDescription>
        <div className="mt-3 max-h-[55dvh] space-y-1.5 overflow-y-auto">
          {WHATS_NEW.items.map((it) => (
            <div key={it.key} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/[0.07]">
              <span className="shrink-0 text-2xl">{it.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t(`whatsNew.item.${it.key}` as MessageKey)}</span>
                <span className="block text-[11px] leading-snug text-white/55">{t(`whatsNew.item.${it.key}Body` as MessageKey)}</span>
              </span>
              {(it.view || it.settings) && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => {
                    close();
                    if (it.view) useUi.getState().setView(it.view);
                    else onSettings();
                  }}
                >
                  {t("whatsNew.open")}
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button variant="gold" size="lg" className="mt-4 w-full" onClick={close}>
          {t("whatsNew.ok")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
