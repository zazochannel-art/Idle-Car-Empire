// Camera distances, zoom tiers, the sun's path and small helpers shared by the map engine (engine.ts) and its parts.
import type { GraphicsProfile } from "../quality";
import { ZONES } from "@/game/config/city";

/** Camera distance (world units) at zoom 1: about ten lots across. */
export const DIST1 = 30;
/** Zoom of each tier ("region" is the minimum zoom, "buildings" the default zoom). */
export const TIER_ZOOM = { region: 0, districts: 0.42, buildings: 1, detail: 2.6 };
/** Below this zoom the district names are shown over the map. */
export const LABEL_ZOOM = 0.55;
/**
 * Camera distance under which a view is "close up": the scenery draws its
 * small cells (most are out of view and culled) and traffic its real car
 * models; further out, the whole scenery sets and the simple car batch.
 */
export const CLOSE_VIEW = 70;

/** The step of the quality ladder this device settled on last time (so a weak phone does not start at full detail every time). */
export const LEVEL_KEY = "ice.mapQuality";
export function readLevel(profile: GraphicsProfile): number {
  try {
    const v = JSON.parse(localStorage.getItem(LEVEL_KEY) ?? "null") as { dpr?: number; level?: number; profile?: string } | null;
    // the rungs depend on the profile (a record from before profiles was made on "high")
    if (v && v.dpr === (window.devicePixelRatio || 1) && (v.profile ?? "high") === profile && Number.isInteger(v.level) && (v.level as number) >= 0) return v.level as number;
  } catch {}
  return 0;
}
export function writeLevel(level: number, profile: GraphicsProfile) {
  try {
    localStorage.setItem(LEVEL_KEY, JSON.stringify({ dpr: window.devicePixelRatio || 1, level, profile }));
  } catch {}
}
/**
 * Where the sun stands at noon, round the map (radians in the ground plane, from +x towards +z): in
 * front of the usual view (the camera looks along −z) and to its left, so the sides in view are lit
 * and the shadows fall behind and to the right, where they show. Morning comes from the right, the
 * evening sun from the left: never from straight behind the scene, its shadows hidden under it.
 */
export const NOON = (150 * Math.PI) / 180;
/** How far round from noon it rises and sets (radians). */
export const SUN_SWING = 1.45;
/** The tallest things on the map: the shadow box reaches this high over the ground in view. */
export const SHADOW_TOP = 7;
export const FOV = 40;
/** Game area ids in the order of the areas raster (id = index + 1; 0 = sea). */
export const AREA_IDS = ["town", "industrial", "downtown", "automotive", "luxury", "supercar", "mega", "global", "mountain", "port", "raw", "suburbs", "boulevard", "airport", "campus", "racing"];
export const ZONE_IDS = new Set<string>(ZONES.map((z) => z.id));

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
