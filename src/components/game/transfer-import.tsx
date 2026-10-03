"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { decodeSave } from "@/game/save";
import { decodeTransfer, transferCodeIn } from "@/game/save/transfer";
import { formatMoney, formatNumber } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";

/** Opening a transfer link offers to load the save it carries. */
export function TransferImport() {
  const importSave = useGame((g) => g.importSave);
  const ready = useGame((g) => g.ready);
  const { t } = useT();
  const [offer, setOffer] = useState<{ json: string; cash: number; cars: number; expansions: number } | null>(null);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const code = transferCodeIn(window.location.hash);
    if (!code) return;
    const clear = () => history.replaceState(null, "", window.location.pathname + window.location.search);
    decodeTransfer(code)
      .then((json) => {
        const s = decodeSave(json, Date.now());
        setOffer({ json, cash: s.cash, cars: s.lifetime.carsProduced, expansions: s.prestigeCount });
      })
      .catch(() => setBad(true))
      .finally(clear);
  }, [ready]);

  return (
    <Dialog open={!!offer || bad} onOpenChange={(o) => !o && (setOffer(null), setBad(false))}>
      <DialogContent>
        <div className="mb-3 text-5xl">📲</div>
        <DialogTitle>{t("transfer.title")}</DialogTitle>
        <DialogDescription className="mt-2">
          {offer ? t("transfer.offer", { cash: formatMoney(offer.cash), cars: formatNumber(offer.cars), n: offer.expansions }) : t("transfer.bad")}
        </DialogDescription>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => (setOffer(null), setBad(false))}>
            {offer ? t("common.cancel") : t("transfer.ok")}
          </Button>
          {offer && (
            <Button
              variant="gold"
              className="flex-1"
              onClick={() => {
                importSave(offer.json);
                setOffer(null);
              }}
            >
              {t("transfer.load")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
