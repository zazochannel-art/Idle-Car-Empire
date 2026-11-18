"use client";

// 🏁 Race challenges (the Leaderboard screen): send a friend your code to race your ghost, or type
// the code a friend sent you to open their card, where the duel is (leaderboard-view.tsx Visit).
// A friend without the game installs it from the shared link, and the code comes along with it.
import { useEffect, useState } from "react";
import { brandName } from "@/game/engine/brand";
import { useT } from "@/i18n/use-t";
import { shareFile } from "@/lib/share-file";
import { shareUrl } from "@/lib/share-card";
import { useGame } from "@/store/game-store";
import { uiEvents } from "@/store/events";
import { Button } from "../ui/button";

export function ChallengeCard({ onFound }: { onFound: (userId: string) => void }) {
  const social = useGame((g) => g.saves?.social ?? null);
  const company = useGame((g) => brandName(g.state));
  const { t } = useT();
  const [mine, setMine] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    social?.myInvite().then((i) => live && setMine(i.code || null), () => {});
    return () => {
      live = false;
    };
  }, [social]);
  if (!social) return null;

  const challenge = async () => {
    if (!mine) return;
    const blob = await challengeCard(company, mine, t("challenge.cardTitle"), t("challenge.cardBody"), t("card.get"));
    if (!blob) return;
    const how = await shareFile(blob, "race-challenge.png", "image/png", `${t("challenge.shareText", { code: mine })} ${shareUrl("card", mine)}`);
    uiEvents.emit({ type: "toast", tone: "success", icon: "🏁", title: t(how === "shared" ? "card.shared" : "card.saved") });
  };
  const find = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const id = await social.playerByCode(code);
      if (id) onFound(id);
      else setMsg(t("challenge.notFound"));
    } catch {
      setMsg(t("board.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-2xl bg-gradient-to-r from-sky-950/40 via-black/30 to-indigo-950/30 p-3 ring-1 ring-sky-400/25">
      <div className="text-xs font-black text-sky-200">🏁 {t("challenge.title")}</div>
      <p className="text-[11px] text-white/60">{t("challenge.hint")}</p>
      <Button size="sm" variant="gold" className="w-full" disabled={!mine} onClick={() => void challenge()}>
        {t("challenge.send")}
      </Button>
      <div className="flex gap-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder={t("challenge.placeholder")}
          aria-label={t("challenge.placeholder")}
          className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 font-mono text-sm tracking-[0.2em] ring-1 ring-white/10 outline-none focus:ring-sky-400/50"
        />
        <Button size="sm" variant="secondary" disabled={busy || code.length !== 6 || code === mine} onClick={() => void find()}>
          {t("challenge.find")}
        </Button>
      </div>
      {msg && <p className="text-[11px] text-rose-300">{msg}</p>}
    </div>
  );
}

/** The challenge to share: the company, the code to type, the store. */
async function challengeCard(company: string, code: string, title: string, body: string, get: string): Promise<Blob | null> {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1080;
  const c = cv.getContext("2d");
  if (!c) return null;
  const g = c.createLinearGradient(0, 0, 1080, 1080);
  g.addColorStop(0, "#0c4a6e");
  g.addColorStop(1, "#1e1b4b");
  c.fillStyle = g;
  c.fillRect(0, 0, 1080, 1080);
  // a chequered band
  for (let i = 0; i < 18; i++) for (let j = 0; j < 2; j++) {
    c.fillStyle = (i + j) % 2 ? "#ffffff" : "#111827";
    c.fillRect(i * 60, 60 + j * 60, 60, 60);
  }
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.font = "900 96px system-ui, sans-serif";
  c.fillText(title, 540, 330, 1000);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = "700 42px system-ui, sans-serif";
  c.fillText(body, 540, 430, 1000);
  c.fillText(company, 540, 500, 1000);
  c.fillStyle = "#fbbf24";
  c.beginPath();
  c.roundRect(240, 600, 600, 160, 36);
  c.fill();
  c.fillStyle = "#0b0b0e";
  c.font = "900 104px ui-monospace, Menlo, monospace";
  c.fillText(code.split("").join(" "), 540, 685);
  c.fillStyle = "#fbbf24";
  c.font = "800 38px system-ui, sans-serif";
  c.fillText(`IDLE CAR EMPIRE · ${get}`, 540, 900, 1000);
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}
