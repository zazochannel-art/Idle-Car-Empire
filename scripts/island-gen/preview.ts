// A quick look at the island while designing it: land and sea, heights, the
// areas' borders and names, and (once built) the roads, lots and scenery.
// Not part of the game's files.
import sharp from "sharp";
import { AREAS, AREA_IDS, SIZE } from "./design";
import type { Land } from "./land";
import type { P } from "./noise";

export interface PreviewExtras {
  roads?: { pts: P[]; w: number }[];
  lots?: { x: number; y: number; w: number; d: number; rot: number; kind: string; id: string }[];
  points?: { x: number; y: number; c: string; r?: number }[];
  lines?: { pts: P[]; c: string; w: number }[];
  /** [x, y, species] */
  trees?: number[][];
}

const PX = 4;

export async function preview(land: Land, file: string, extra: PreviewExtras = {}) {
  const [SX, SY] = SIZE;
  const W = Math.round(SX * PX);
  const H = Math.round(SY * PX);
  const img = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = (i / W - 0.5) * SX;
      const y = (j / H - 0.5) * SY;
      const d = land.depthAt(x, y);
      const h = land.height(x, y);
      let r: number, g: number, b: number;
      if (d < 0) {
        const k = Math.min(1, -d / 25);
        r = 70 - 40 * k;
        g = 170 - 80 * k;
        b = 220 - 50 * k;
      } else if (h > 70) {
        r = g = b = 235;
      } else if (h > 30) {
        const k = (h - 30) / 40;
        r = 120 + 100 * k;
        g = 120 + 100 * k;
        b = 110 + 115 * k;
      } else {
        const k = Math.min(1, h / 30);
        r = 120 + 30 * k;
        g = 170 - 40 * k;
        b = 100;
      }
      // area borders
      const a = land.areaOf(x, y);
      const a2 = land.areaOf(x + 0.6, y);
      const a3 = land.areaOf(x, y + 0.6);
      if (d > -3 && (a !== a2 || a !== a3)) {
        r = 255;
        g = 255;
        b = 255;
      }
      const o = (j * W + i) * 3;
      img[o] = r;
      img[o + 1] = g;
      img[o + 2] = b;
    }
  const px = (x: number) => ((x / SX + 0.5) * W).toFixed(1);
  const py = (y: number) => ((y / SY + 0.5) * H).toFixed(1);
  const svg: string[] = [];
  for (const [x, y, k] of extra.trees ?? []) svg.push(`<circle cx="${px(x)}" cy="${py(y)}" r="1.3" fill="${k === 3 ? "#e6efe9" : k === 1 ? "#7fb24a" : "#1f4d26"}"/>`);
  for (const r of extra.roads ?? []) svg.push(`<polyline points="${r.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}" fill="none" stroke="#333" stroke-width="${(r.w * PX).toFixed(1)}" stroke-linejoin="round"/>`);
  for (const l of extra.lines ?? []) svg.push(`<polyline points="${l.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}" fill="none" stroke="${l.c}" stroke-width="${(l.w * PX).toFixed(1)}" stroke-linejoin="round"/>`);
  for (const l of extra.lots ?? []) {
    const c = Math.cos(l.rot);
    const s = Math.sin(l.rot);
    // the lot's frame: its front (+z after the turn) faces the road
    const corner = (u: number, v: number) => [l.x + u * c + v * s, l.y - u * s + v * c];
    const pts = [corner(-l.w / 2, -l.d / 2), corner(l.w / 2, -l.d / 2), corner(l.w / 2, l.d / 2), corner(-l.w / 2, l.d / 2)];
    const fill = l.kind === "plot" ? (l.id.startsWith("b:") ? "#f59e0b" : "#fde68a") : l.kind === "dealer" ? "#60a5fa" : "#f472b6";
    svg.push(`<polygon points="${pts.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}" fill="${fill}" stroke="#000" stroke-width="1"/>`);
    const [fx, fy] = corner(0, l.d / 2);
    svg.push(`<circle cx="${px(fx)}" cy="${py(fy)}" r="1.5" fill="#b91c1c"/>`);
  }
  for (const p of extra.points ?? []) svg.push(`<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${p.r ?? 2}" fill="${p.c}"/>`);
  for (const a of AREA_IDS) svg.push(`<text x="${px(AREAS[a].c[0])}" y="${py(AREAS[a].c[1])}" font-family="Arial" font-size="15" font-weight="bold" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${a}</text>`);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join("")}</svg>`);
  await sharp(img, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toFile(file);
}
