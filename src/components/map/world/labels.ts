// The map's labels, drawn in screen pixels on a 2D canvas over the 3D view:
// name tags over the lots, the "+$" pops of the buildings that earn, and the
// gold banner when a construction finishes.
import { raceFont } from "../iso";

export interface TagStyle {
  bg?: string;
  fg?: string;
  size?: number;
  icon?: string;
}

/** A rounded tag whose bottom centre sits at (x, y). */
export function tag(c: CanvasRenderingContext2D, text: string, x: number, y: number, opts: TagStyle = {}) {
  const size = opts.size ?? 10;
  c.font = raceFont(800, size * 1.12);
  const label = opts.icon ? `${opts.icon} ${text}` : text;
  const w = c.measureText(label).width + size * 1.2;
  const h = size * 1.75;
  const px = x - w / 2;
  const py = y - h;
  c.beginPath();
  c.roundRect(px, py, w, h, h * 0.28);
  c.fillStyle = opts.bg ?? "rgba(32,32,36,0.86)";
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.18)";
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = opts.fg ?? "#fff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(label, px + w / 2, py + h / 2 + 0.5);
}

/** A floating "+$123" rising from (x, y); k runs 0..1 over its life. */
export function pop(c: CanvasRenderingContext2D, text: string, color: string, x: number, y: number, k: number) {
  c.font = raceFont(900, 16);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
  c.strokeStyle = "rgba(0,0,0,0.65)";
  c.lineWidth = 3;
  c.strokeText(text, x, y - k * 34);
  c.fillStyle = color;
  c.fillText(text, x, y - k * 34);
  c.globalAlpha = 1;
}

/** "★ Garage #01 · Lv 4" when a construction finishes; k runs 0..1. */
export function banner(c: CanvasRenderingContext2D, text: string, x: number, y0: number, k: number) {
  const y = y0 - k * 26;
  const scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.45 : k < 0.2 ? 1.05 - ((k - 0.12) / 0.08) * 0.05 : 1;
  c.save();
  c.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
  c.translate(x, y);
  c.scale(scale, scale);
  c.font = raceFont(900, 17);
  const label = `★ ${text}`;
  const tw = c.measureText(label).width + 28;
  const g = c.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, "#fde68a");
  g.addColorStop(1, "#d97706");
  c.beginPath();
  c.roundRect(-tw / 2, -16, tw, 32, 16);
  c.fillStyle = g;
  c.shadowColor = "rgba(251,191,36,0.8)";
  c.shadowBlur = 18;
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "#1c1917";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(label, 0, 1);
  c.restore();
}
