// The share card: one picture a player can post, with their company, a few numbers and their
// invite code (the code is what brings a friend in: game/engine/invites.ts). Drawn on a canvas, so
// it needs no server; shared as a file where the phone can, saved as a file elsewhere.
import { brandName } from "@/game/engine/brand";
import { formatMoney, formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";

/** Where a friend installs the game from. */
export const STORE_URL = "https://play.google.com/store/apps/details?id=com.zazochannel.idlecarempire";

export interface ShareCardData {
  company: string;
  logo: string;
  color: string;
  accent: string;
  /** Lifetime cars made, and money earned. */
  cars: number;
  earned: number;
  stars: number;
  achievements: number;
  code: string;
}

/** What the card shows, from the save and the player's code ("" before the code is known). */
export function shareCardData(s: GameState, code: string): ShareCardData {
  return {
    company: brandName(s).slice(0, 28),
    logo: s.brand?.logo ?? "🏁",
    color: /^#[0-9a-f]{6}$/i.test(s.brand?.color ?? "") ? s.brand.color : "#f59e0b",
    accent: /^#[0-9a-f]{6}$/i.test(s.brand?.accent ?? "") ? s.brand.accent : "#0f172a",
    cars: Math.max(0, Math.floor(s.lifetime.carsProduced)),
    earned: Math.max(0, s.lifetime.moneyEarned),
    stars: Math.max(0, Math.floor(s.stars)),
    achievements: s.achievements.length,
    code: code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6),
  };
}

export interface ShareCardLabels {
  cars: string;
  earned: string;
  stars: string;
  achievements: string;
  /** "Use my code" above the code. */
  useCode: string;
  /** "Get it on Google Play" under it. */
  get: string;
}

export const CARD_SIZE = { width: 1080, height: 1350 };

/** Shrinks a font until the text fits the width. */
function fit(c: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number): string {
  let px = size;
  for (; px > 24; px -= 4) {
    c.font = `${weight} ${px}px system-ui, sans-serif`;
    if (c.measureText(text).width <= max) break;
  }
  return `${weight} ${px}px system-ui, sans-serif`;
}

/** Draws the card on a canvas (any size, drawn at 1080×1350 and scaled). */
export function drawShareCard(canvas: HTMLCanvasElement, d: ShareCardData, labels: ShareCardLabels): void {
  const { width: W, height: H } = CARD_SIZE;
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return;
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, d.accent);
  bg.addColorStop(1, "#05070d");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  // a glow in the company's colour
  const glow = c.createRadialGradient(W / 2, 360, 40, W / 2, 360, 620);
  glow.addColorStop(0, `${d.color}66`);
  glow.addColorStop(1, `${d.color}00`);
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);

  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#fbbf24";
  c.font = "900 38px system-ui, sans-serif";
  c.fillText("🏁 IDLE CAR EMPIRE", W / 2, 110);

  c.font = "220px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  c.fillStyle = "#ffffff";
  c.fillText(d.logo, W / 2, 400);

  c.fillStyle = "#ffffff";
  c.font = fit(c, d.company, 900, 96, W - 140);
  c.fillText(d.company, W / 2, 540);

  // the numbers
  const tiles: [string, string][] = [
    [formatNumber(d.cars), labels.cars],
    [formatMoney(d.earned), labels.earned],
    [formatNumber(d.stars), labels.stars],
    [formatNumber(d.achievements), labels.achievements],
  ];
  tiles.forEach(([value, label], i) => {
    const x = 70 + (i % 2) * 470;
    const y = 620 + Math.floor(i / 2) * 170;
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.beginPath();
    c.roundRect(x, y, 470 - 20, 150, 28);
    c.fill();
    c.fillStyle = "#fbbf24";
    c.font = fit(c, value, 900, 62, 410);
    c.fillText(value, x + 225, y + 82);
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.font = "700 28px system-ui, sans-serif";
    c.fillText(label, x + 225, y + 124);
  });

  // the invite code
  if (d.code) {
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.font = "700 32px system-ui, sans-serif";
    c.fillText(labels.useCode, W / 2, 1020);
    c.fillStyle = d.color;
    c.beginPath();
    c.roundRect(W / 2 - 300, 1045, 600, 130, 30);
    c.fill();
    c.fillStyle = "#0b0b0e";
    c.font = "900 78px ui-monospace, 'SFMono-Regular', Menlo, monospace";
    c.fillText(d.code.split("").join(" "), W / 2, 1140);
  }
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = "700 34px system-ui, sans-serif";
  c.fillText(labels.get, W / 2, 1270);
}

/** The card as a PNG. */
export function cardBlob(d: ShareCardData, labels: ShareCardLabels): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  drawShareCard(canvas, d, labels);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Shares a picture where the device can (phones), or saves it as a file. */
export async function sharePicture(blob: Blob, name: string, text?: string): Promise<"shared" | "saved"> {
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name, text });
      return "shared";
    } catch {
      // cancelled: save it instead
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
