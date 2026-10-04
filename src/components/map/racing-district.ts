// The Racing District on the Empire Map: the home circuit (always visible —
// faded and fenced off until it is built), its paddock with the Racing
// Garage, team garages, showroom and car park, the pit building, control
// tower, grandstands full of spectators, the podium and sponsor boards.
// Ground layers are painted with the rest of the ground; buildings are
// depth-sorted drawables; race cars live in race-layer.ts.
import { RIVAL_TEAMS, SPONSOR_BY_ID } from "@/game/config/racing";
import { RACING, RACING_AREA } from "@/game/city/layout";
import { trackOf, pointAt } from "@/game/racing/tracks";
import type { GameState } from "@/game/types";
import { paintTrack, pitLane } from "../racing/track-paint";
import { Painter, rand, sx, sy } from "./iso";
import { billboard, flagPole, lightPole, tireStack } from "./props";
import type { Drawable } from "./scene";
import { drawModel, CAR_COLORS, CAR_MODEL_FOR } from "./vehicles";

export const HOME = trackOf("small");
/** The home circuit's frame on the map. */
export const OX = RACING_AREA.track.x;
export const OY = RACING_AREA.track.y;
const PAD = RACING_AREA.paddock;

function bbox(x: number, y: number, w: number, d: number, h: number): [number, number, number, number] {
  return [sx(x, y + d) - 4, sy(x, y) - h - 30, sx(x + w, y) + 4, sy(x + w, y + d) + 4];
}

// ───────────────────────────── ground ─────────────────────────────

/** Grass, paddock paving and the circuit itself (under everything else). */
export function drawRacingGround(p: Painter, unlocked: boolean) {
  p.dim = !unlocked;
  const T = RACING_AREA.track;
  // manicured grass in mowing stripes
  p.quad(T.x - 0.5, T.y - 0.5, T.w + 0.5, T.d + 0.5, p.col("#5fae52"));
  for (let i = 0; i < T.d; i += 2) p.quad(T.x - 0.5, T.y + i, T.w + 0.5, 1, p.col("#67b85a"));
  // the paddock: concrete with parking bays
  p.quad(PAD.x - 0.5, PAD.y - 0.5, PAD.w + 1.5, PAD.d + 0.5, p.col("#5fae52"));
  p.quad(PAD.x, PAD.y, PAD.w + 0.6, PAD.d, p.col("#b8bec7"));
  p.quad(PAD.x + 0.15, PAD.y + 4.6, PAD.w - 0.3, 1.25, p.col("#4b5563"));
  for (let i = 0; i < 9; i++) p.line(PAD.x + 0.35 + i * 0.62, PAD.y + 4.65, PAD.x + 0.35 + i * 0.62, PAD.y + 5.2, p.col("#f8fafc"), 1);
  // the access road from the street below
  p.quad(PAD.x + 2.55, PAD.y + 5.85, 0.9, 0.2, p.col("#3b414b"));
  paintTrack(p, HOME, OX, OY, undefined, true);
  p.dim = false;
}

// ───────────────────────────── buildings ─────────────────────────────

/** Rows of seats stepping back, a roof on posts, and a crowd that moves. */
function grandstand(p: Painter, x: number, y: number, w: number, d: number, alongX: boolean, t: number, seed: number, crowd: number) {
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const k = r / rows;
    if (alongX) p.box(x, y + d * k * 0.75, w, d * (1 - k * 0.75), 0, 4 + r * 4, r % 2 ? "#cbd5e1" : "#94a3b8");
    else p.box(x + w * k * 0.75, y, w * (1 - k * 0.75), d, 0, 4 + r * 4, r % 2 ? "#cbd5e1" : "#94a3b8");
  }
  // spectators: coloured dots on the steps, jumping when the cars pass
  if (!p.dim && p.zoom > 0.55) {
    const n = Math.floor((alongX ? w : d) * 7 * crowd);
    const c = p.ctx;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const r = Math.floor(rand(seed + i, 3) * rows);
      const jump = Math.max(0, Math.sin(t * 5 + i * 1.7)) * (crowd > 0.8 ? 1.6 : 0.6);
      const px = alongX ? x + u * w : x + w * (r / rows) * 0.75 + 0.08;
      const py = alongX ? y + d * (r / rows) * 0.75 + 0.08 : y + u * d;
      c.fillStyle = CAR_COLORS[Math.floor(rand(seed, i) * CAR_COLORS.length)];
      c.fillRect(sx(px, py) - 1, sy(px, py, 6 + r * 4) - 3 - jump, 2, 3);
    }
  }
  // the roof
  const rx = alongX ? x : x + w * 0.55;
  const ry = alongX ? y + d * 0.55 : y;
  p.box(rx, ry, alongX ? w : w * 0.45, alongX ? d * 0.45 : d, 26, 1.5, "#e5e7eb", "#f8fafc");
}

/** The pits: a long two-storey building beside the pit lane, a garage door per team. */
function pitBuilding(p: Painter, t: number) {
  const pl = pitLane(HOME);
  const a = pointAt(HOME, pl.s0 + 3.8, pl.lat - 0.75);
  const b = pointAt(HOME, pl.s1 - 0.4, pl.lat - 1.85);
  const x = OX + Math.min(a.x, b.x);
  const y = OY + Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const d = Math.abs(b.y - a.y);
  p.shadow(x, y, w, d, 22);
  p.box(x, y, w, d, 0, 12, "#e2e8f0", "#cbd5e1");
  p.box(x + 0.1, y + 0.2, w - 0.2, d - 0.4, 12, 8, "#1e293b", "#94a3b8");
  // team colours along the roof edge
  const n = RIVAL_TEAMS.length + 1;
  for (let i = 0; i < n; i++) {
    const col = i === 0 ? "#f5c451" : RIVAL_TEAMS[i - 1].color;
    p.quad(x + 0.05, y + (d * i) / n + 0.05, 0.25, d / n - 0.1, p.col(col), 20.5);
  }
  p.textRight("PIT LANE", x + w, y + d / 2, 6, 6, "#0f172a");
  if (p.night > 0.3) for (let i = 0; i < n; i++) p.light(sx(x, y + (d * (i + 0.5)) / n), sy(x, y + (d * (i + 0.5)) / n, 6), 12, "#fff7d6", 0.6);
  void t;
}

/** Race control: a slim tower with a glass cabin and the timing screen. */
function controlTower(p: Painter, x: number, y: number, t: number) {
  p.shadow(x, y, 0.9, 0.9, 60);
  p.box(x + 0.2, y + 0.2, 0.5, 0.5, 0, 38, "#e5e7eb");
  p.box(x, y, 0.9, 0.9, 38, 12, "#0ea5e9", "#e2e8f0");
  p.box(x - 0.05, y - 0.05, 1, 1, 50, 2, "#f8fafc");
  // timing screen on the face toward the track
  p.onLeft(x + 0.05, y + 0.9, 40, 0.05, 0.85, 2, 9, p.col("#0f172a"));
  p.textLeft(`${Math.floor(t % 60).toString().padStart(2, "0")}.${Math.floor((t * 10) % 10)}`, x + 0.45, y + 0.9, 46, 5, "#facc15");
  p.light(sx(x + 0.45, y + 0.45), sy(x + 0.45, y + 0.45, 46), 26, "#7dd3fc", 0.6);
}

/** The podium: three steps (2nd, 1st, 3rd) on a stage with a backdrop. */
export function podium(p: Painter, x: number, y: number) {
  p.shadow(x, y, 1.6, 0.6, 12);
  p.box(x, y, 1.6, 0.7, 0, 2, "#334155");
  p.box(x + 0.05, y + 0.1, 0.5, 0.5, 2, 5, "#cbd5e1");
  p.box(x + 0.55, y + 0.1, 0.5, 0.5, 2, 8, "#facc15");
  p.box(x + 1.05, y + 0.1, 0.5, 0.5, 2, 3, "#d97706");
  p.box(x, y - 0.08, 1.6, 0.08, 2, 18, "#1e3a8a");
  p.textLeft("🏆", x + 0.8, y, 14, 7, "#fff");
}

/** Where the cars on the podium stand: 1st, 2nd, 3rd. */
export const PODIUM = { x: OX + 5.4, y: OY + 6.2 };
export const PODIUM_SPOTS: [number, number, number][] = [
  [PODIUM.x + 0.8, PODIUM.y + 0.35, 10],
  [PODIUM.x + 0.3, PODIUM.y + 0.35, 7],
  [PODIUM.x + 1.3, PODIUM.y + 0.35, 5],
];

/** Racing Garage: a workshop at level 1, a professional garage at 5, team headquarters at 10. */
function racingGarage(p: Painter, level: number, t: number) {
  const x = PAD.x + 0.3;
  const y = PAD.y + 0.3;
  const big = level >= 10 ? 3 : level >= 5 ? 2 : 1;
  const w = [2.2, 2.9, 3.4][big - 1];
  const d = [1.7, 2.2, 2.6][big - 1];
  const h = [14, 26, 52][big - 1];
  p.shadow(x, y, w, d, h);
  p.box(x, y, w, d, 0, h, big === 3 ? "#0f172a" : "#e5e7eb", big === 3 ? "#1e293b" : "#cbd5e1");
  // garage doors on the front
  const doors = big + 1;
  for (let i = 0; i < doors; i++) p.onLeft(x + 0.15 + (i * (w - 0.3)) / doors, y + d, 0, 0.05, (w - 0.3) / doors - 0.1, 0.5, Math.min(9, h * 0.5), p.col("#475569"));
  if (big === 3) {
    // glass curtain wall and a lit logo
    p.onRight(x + w, y, 0, 0.1, d - 0.1, h * 0.35, h - 3, p.col("#38bdf8", -0.2));
    p.textLeft("RACING HQ", x + w / 2, y + d, h - 7, 7, "#f5c451");
    p.light(sx(x + w / 2, y + d / 2), sy(x + w / 2, y + d / 2, h), 30, "#f5c451", 0.5);
  } else {
    p.textLeft(big === 2 ? "PRO RACING GARAGE" : "RACING GARAGE", x + w / 2, y + d, h - 3, 5, "#0f172a");
  }
  flagPole(p, x + w + 0.2, y + d + 0.1, "#f5c451", t);
}

/** Rival teams' garages: one bay each in their colours. */
function teamGarages(p: Painter) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const team = RIVAL_TEAMS[i];
    const x = PAD.x + 3.8 + (i % 2) * 1.05;
    const y = PAD.y + 0.3 + Math.floor(i / 2) * 1.35;
    p.box(x, y, 0.95, 1.1, 0, 10, "#f1f5f9", p.col(team.color));
    p.onLeft(x + 0.15, y + 1.1, 0, 0.05, 0.65, 0.5, 7, p.col("#334155"));
    p.textLeft(team.logo, x + 0.48, y + 1.1, 8.5, 5, "#fff");
  }
}

/** Glass showroom with the team's best car on a turntable. */
function showroom(p: Painter, s: GameState, t: number) {
  const x = PAD.x + 0.4;
  const y = PAD.y + 3;
  p.box(x, y, 1.7, 1.5, 0, 1, "#e5e7eb", "#f8fafc");
  const rc = s.racing.cars[0];
  if (rc) drawModel(p, x + 0.85, y + 0.75, 0, CAR_MODEL_FOR[rc.car], "#f5c451", 1.1, { yaw: t * 0.5, lift: 1 });
  const c = p.ctx;
  c.globalAlpha = 0.28;
  p.box(x, y, 1.7, 1.5, 1, 14, "#7dd3fc", "#bae6fd", false);
  c.globalAlpha = 1;
  p.textLeft("SHOWROOM", x + 0.85, y + 1.5, 13, 4.5, "#0f172a");
}

/** Parked visitors' cars. */
function carPark(p: Painter) {
  for (let i = 0; i < 8; i++) {
    if (rand(i, 77) < 0.25) continue;
    drawModel(p, PAD.x + 0.65 + i * 0.62, PAD.y + 4.95, 1, (["city", "sedan", "suv", "sports"] as const)[i % 4], CAR_COLORS[(i * 3) % CAR_COLORS.length], 0.9);
  }
}

/** Entrance arch over the access road. */
function gate(p: Painter) {
  const x = PAD.x + 2.5;
  const y = PAD.y + 5.95;
  p.box(x, y, 0.12, 0.12, 0, 22, "#1f2937");
  p.box(x + 0.9, y, 0.12, 0.12, 0, 22, "#1f2937");
  p.box(x - 0.05, y - 0.02, 1.12, 0.16, 22, 6, "#111827");
  p.textLeft("🏁 RACING", x + 0.51, y + 0.14, 25, 5, "#f5c451");
}

/** Every static building of the district, as depth-sorted drawables. */
export function racingScene(live: () => GameState, names: { locked: string; title: string }): Drawable[] {
  const out: Drawable[] = [];
  const pick = RACING;
  const unlocked = () => live().racing.unlocked;
  const add = (x: number, y: number, w: number, d: number, h: number, draw: (p: Painter, t: number) => void, label?: Drawable["label"]) =>
    out.push({
      depth: x + w / 2 + y + d / 2,
      zone: null,
      bbox: bbox(x, y, w, d, h),
      pickId: pick,
      hit: { x, y, w, d, h },
      draw: (p, info) => {
        p.dim = !unlocked();
        draw(p, info.t);
        p.dim = false;
      },
      label,
    });

  // paddock
  add(PAD.x + 0.3, PAD.y + 0.3, 3.4, 2.6, 52, (p, t) => racingGarage(p, live().racing.garage, t), (p, info) => {
    if (info.zoom < 0.45) return;
    const s = live();
    if (s.racing.unlocked) p.tag(names.title, PAD.x + 2, PAD.y + 1.5, 60, { icon: "🏁", bg: "rgba(17,24,39,0.9)", fg: "#f5c451" });
  });
  add(PAD.x + 3.8, PAD.y + 0.3, 2.1, 2.5, 12, (p) => teamGarages(p));
  add(PAD.x + 0.4, PAD.y + 3, 1.7, 1.5, 16, (p, t) => showroom(p, live(), t));
  add(PAD.x + 2.4, PAD.y + 3, 1.2, 1, 10, (p) => {
    // service bay
    p.box(PAD.x + 2.4, PAD.y + 3, 1.2, 1, 0, 9, "#f8fafc", "#ef4444");
    p.textLeft("🔧 SERVICE", PAD.x + 3, PAD.y + 4, 6, 4, "#991b1b");
  });
  add(PAD.x + 0.3, PAD.y + 4.6, PAD.w - 0.6, 1.2, 8, (p) => carPark(p));
  add(PAD.x + 2.4, PAD.y + 5.9, 1.2, 0.2, 30, (p) => gate(p));

  // the circuit's buildings
  add(OX + 3.3, OY + 4.8, 1.2, 6.8, 22, (p, t) => pitBuilding(p, t));
  add(OX + 4.6, OY + 3.4, 0.9, 0.9, 52, (p, t) => controlTower(p, OX + 4.6, OY + 3.4, t));
  add(PODIUM.x, PODIUM.y, 1.6, 0.7, 20, (p) => podium(p, PODIUM.x, PODIUM.y));
  // grandstands: along the main straight, the first corner, the hairpin
  add(OX + 0.02, OY + 4.4, 0.62, 9.6, 30, (p, t) => grandstand(p, OX + 0.02, OY + 4.4, 0.62, 9.6, false, t, 11, crowdOf(live())));
  add(OX + 4.6, OY - 0.45, 5.4, 0.55, 30, (p, t) => grandstand(p, OX + 4.6, OY - 0.45, 5.4, 0.55, true, t, 23, crowdOf(live())));
  add(OX + 12.45, OY + 11, 0.5, 5.5, 30, (p, t) => grandstand(p, OX + 12.45, OY + 11, 0.5, 5.5, false, t, 37, crowdOf(live())));
  // sponsor boards in the infield and a big screen
  const boards: [number, number][] = [[OX + 9.2, OY + 4.2], [OX + 9.2, OY + 12.5], [OX + 5.6, OY + 9.4]];
  boards.forEach(([bx, by], i) =>
    add(bx, by, 1, 0.1, 32, (p) => {
      const s = live();
      const sp = s.racing.sponsor ? SPONSOR_BY_ID[s.racing.sponsor] : null;
      const text = sp && i !== 1 ? `${sp.logo} ${sp.name.toUpperCase()}` : ["IDLE CAR EMPIRE", "SPEED · POWER", "🏁 RACE DAY"][i];
      billboard(p, bx, by, sp && i !== 1 ? sp.color : ["#b91c1c", "#1d4ed8", "#15803d"][i], text);
    }),
  );
  // tyre walls on the outside of the hairpins, floodlights, trees on the edges
  const walls: [number, number][] = [[OX + 9.9, OY + 19.6], [OX + 1.6, OY + 19.4], [OX + 12.4, OY + 8.6], [OX + 2.4, OY + 0.4]];
  walls.forEach(([wx, wy]) => add(wx, wy, 0.8, 0.3, 10, (p) => { for (let i = 0; i < 4; i++) tireStack(p, wx + i * 0.2, wy, 2); }));
  const poles: [number, number][] = [[OX + 0.5, OY + 3.6], [OX + 0.5, OY + 14.6], [OX + 12.6, OY + 5], [OX + 12.6, OY + 18.6], [OX + 6.2, OY + 15]];
  poles.forEach(([lx, ly]) => add(lx, ly, 0.2, 0.2, 40, (p) => lightPole(p, lx, ly)));
  for (let i = 0; i < 10; i++) {
    const tx = OX + 9 + rand(i, 5) * 0.7;
    const ty = OY + 13.4 + rand(i, 9) * 4;
    add(tx, ty, 0.3, 0.3, 30, (p) => p.tree(tx, ty, 0.8, rand(i, 2)));
  }

  // locked: a sign over the fenced site (the HTML card does the buying)
  out.push({
    depth: OX + 6 + OY + 10,
    zone: null,
    bbox: bbox(OX, OY, 13, 20, 40),
    draw: () => {},
    label: (p, info) => {
      if (unlocked() || info.zoom < 0.3) return;
      p.tag(`${names.locked}`, OX + 6.5, OY + 10, 20, { icon: "🔒", bg: "rgba(17,24,39,0.85)", fg: "#f5c451" });
    },
  });
  return out;
}

/** Spectators: a few on a quiet day, packed and cheering during a race. */
function crowdOf(s: GameState) {
  if (!s.racing.unlocked) return 0;
  return s.racing.live ? 1 : 0.35 + Math.min(0.4, s.racing.rep / 5_000);
}

/** Centre of the Racing District (for the lock card). */
export const RACING_CENTER = { x: OX + 6, y: OY + 9 };

