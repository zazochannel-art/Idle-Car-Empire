"use client";

// 💥 The crash lab, on each model's card (engine/safety.ts): test a model you build, see its safety
// stars, share them.
import { Share2 } from "lucide-react";
import { CAR_BY_ID } from "@/game/config/cars";
import { carBaseValue } from "@/game/engine/chain";
import { SAFETY, safetyStars, testCost } from "@/game/engine/safety";
import { brandName } from "@/game/engine/brand";
import { formatDuration } from "@/game/format";
import type { CarId } from "@/game/types";
import { useT } from "@/i18n/use-t";
import { shareFile } from "@/lib/share-file";
import { shareUrl } from "@/lib/share-card";
import { useGame } from "@/store/game-store";
import { uiEvents } from "@/store/events";
import { CostButton } from "../game/cost-button";
import { Button } from "../ui/button";

const starText = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export function CrashTestRow({ car }: { car: CarId }) {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const start = useGame((g) => g.startCrashTest);
  const { t } = useT();
  const cfg = CAR_BY_ID[car];
  const stars = safetyStars(state, car);
  const test = state.safety?.test ?? null;
  const built = (state.lifetime.carsByType[car] ?? 0) > 0;
  const cost = testCost(carBaseValue(state, cfg, snap.gm));
  const mine = test?.car === car;
  const share = async () => {
    if (stars === null) return;
    const blob = await crashCard(state.designs[car].name, cfg.emoji, stars, brandName(state), t("crash.cardTitle"), t("card.get"));
    if (!blob) return;
    const how = await shareFile(blob, "crash-test.png", "image/png", `${t("crash.shareText", { name: state.designs[car].name, stars: starText(stars) })} ${shareUrl("card")}`);
    uiEvents.emit({ type: "toast", tone: "success", icon: "💥", title: t(how === "shared" ? "card.shared" : "card.saved") });
  };
  return (
    <div className="relative mt-2 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/[0.07]">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold">💥 {t("crash.title")}</span>
        {stars !== null ? (
          <span className="font-bold text-amber-300" aria-label={t("crash.starsLabel", { n: stars })}>
            {starText(stars)} <span className="text-white/50">{`${stars >= 3 ? "+" : "−"}${Math.abs(stars - 3) * SAFETY.perStar * 100}%`}</span>
          </span>
        ) : (
          <span className="text-white/45">{t("crash.untested")}</span>
        )}
      </div>
      {mine ? (
        <p className="mt-1 text-[11px] text-sky-200">🔬 {t("crash.running", { time: formatDuration(Math.max(0, test!.until - state.lastActiveAt) / 1000) })}</p>
      ) : (
        <div className="mt-1.5 flex gap-1.5">
          {!built ? (
            <p className="text-[10px] text-white/40">{t("crash.needBuilt")}</p>
          ) : test ? (
            <p className="text-[10px] text-white/40">{t("crash.busy", { name: state.designs[test.car].name })}</p>
          ) : (
            <CostButton size="sm" className="flex-1" cost={cost} onBuy={() => start(car)} label={t(stars === null ? "crash.test" : "crash.retest")} showEta={false} />
          )}
          {stars !== null && (
            <Button size="sm" variant="secondary" onClick={() => void share()} aria-label={t("crash.share")}>
              <Share2 />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** A square picture of the result to share: the model, its stars, the company. */
async function crashCard(model: string, emoji: string, stars: number, company: string, title: string, get: string): Promise<Blob | null> {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1080;
  const c = cv.getContext("2d");
  if (!c) return null;
  const g = c.createLinearGradient(0, 0, 0, 1080);
  g.addColorStop(0, "#0f172a");
  g.addColorStop(1, "#1e293b");
  c.fillStyle = g;
  c.fillRect(0, 0, 1080, 1080);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "rgba(255,255,255,0.6)";
  c.font = "800 44px system-ui, sans-serif";
  c.fillText(title.toUpperCase(), 540, 150);
  c.font = "220px system-ui, sans-serif";
  c.fillText(emoji, 540, 380);
  c.fillStyle = "#ffffff";
  c.font = "900 84px system-ui, sans-serif";
  c.fillText(model, 540, 590, 980);
  c.fillStyle = "#fbbf24";
  c.font = "900 140px system-ui, sans-serif";
  c.fillText(starText(stars), 540, 760);
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.font = "700 40px system-ui, sans-serif";
  c.fillText(company, 540, 900, 980);
  c.fillStyle = "#fbbf24";
  c.font = "800 34px system-ui, sans-serif";
  c.fillText(`IDLE CAR EMPIRE · ${get}`, 540, 990, 1000);
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}
