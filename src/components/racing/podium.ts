// The podium of the race viewer: three steps (2nd, 1st, 3rd) on a stage
// with a backdrop.
import type { Painter } from "../map/iso";

export function podium(p: Painter, x: number, y: number) {
  p.shadow(x, y, 1.6, 0.6, 12);
  p.box(x, y, 1.6, 0.7, 0, 2, "#334155");
  p.box(x + 0.05, y + 0.1, 0.5, 0.5, 2, 5, "#cbd5e1");
  p.box(x + 0.55, y + 0.1, 0.5, 0.5, 2, 8, "#facc15");
  p.box(x + 1.05, y + 0.1, 0.5, 0.5, 2, 3, "#d97706");
  p.box(x, y - 0.08, 1.6, 0.08, 2, 18, "#1e3a8a");
  p.textLeft("🏆", x + 0.8, y, 14, 7, "#fff");
}
