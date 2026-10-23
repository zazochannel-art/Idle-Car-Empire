// The brand (phase 7 of the Automotive Empire plan): an identity the player
// chooses and attributes the company earns. They move what customers pay:
// at the dealers, in the showroom and in the racing livery.
import { CAR_BY_ID, type CarClass } from "../config/cars";
import { BRAND, BRAND_COLORS, BRAND_LOGOS, BRAND_STYLES, CLASS_ATTR, type BrandAttr, type BrandStyle } from "../config/brand";
import type { BrandState, CarId, GameState } from "../types";

export const createBrand = (): BrandState => ({ name: "", logo: BRAND_LOGOS[0], color: BRAND_COLORS[0], accent: "#0f172a", style: "value", renames: 0 });

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const PREMIUM_UP: CarClass[] = ["premium", "luxury", "supercar", "hypercar"];

/** What customers think of the brand (0–100 each), from what the company actually does. */
export function brandAttrs(s: GameState): Record<BrandAttr, number> {
  let all = 0;
  let premium = 0;
  for (const [car, n] of Object.entries(s.lifetime.carsByType) as [CarId, number][]) {
    if (!(n > 0) || !CAR_BY_ID[car]) continue;
    all += n;
    if (PREMIUM_UP.includes(CAR_BY_ID[car].class)) premium += n;
  }
  const I = BRAND.innovation;
  const protos = Object.keys(s.proto?.done ?? {}).length;
  const electric = (s.lifetime.carsByType.electric ?? 0) > 0 ? I.electric : 0;
  return {
    quality: clamp(s.quality?.rep ?? 50),
    luxury: clamp(BRAND.luxury.base + (all ? (BRAND.luxury.share * premium) / all : 0)),
    innovation: clamp(I.base + I.perResearch * s.research.length + I.perProto * protos + electric),
    sport: clamp(100 * (1 - Math.exp(-Math.max(0, s.racing.rep) / BRAND.sportRep))),
  };
}

export const styleOf = (s: GameState) => BRAND_STYLES.find((x) => x.id === s.brand?.style) ?? BRAND_STYLES[0];

/** The brand's overall standing (0–100): its attributes, its own style counting most. */
export function brandScore(s: GameState): number {
  const a = brandAttrs(s);
  const st = styleOf(s).attr;
  let sum = 0;
  let w = 0;
  for (const k of Object.keys(a) as BrandAttr[]) {
    const k2 = k === st ? BRAND.styleBoost : 1;
    sum += a[k] * k2;
    w += k2;
  }
  return Math.round(sum / w);
}

/** What the brand adds to a car's price: the attributes its class is judged on, above 50. */
export function brandPriceMult(s: GameState, car: CarId | undefined, attrs = brandAttrs(s)): number {
  if (!car || !CAR_BY_ID[car]) return 1;
  const cfg = CAR_BY_ID[car];
  const keys = cfg.engine === "Electric" ? [...CLASS_ATTR[cfg.class], BRAND.electricAttr] : CLASS_ATTR[cfg.class];
  const st = styleOf(s).attr;
  let bonus = 0;
  for (const k of keys) bonus += (Math.max(0, attrs[k] - 50) / 50) * (k === st ? BRAND.styleBoost : 1);
  return 1 + (BRAND.price * bonus) / keys.length;
}

/** The brand's name: the player's, or a default from the logo. */
export const brandName = (s: GameState) => s.brand?.name || "Motor Co.";

const isColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/** Names, logo, colours and style. The first name is free, a rebrand costs. */
export function setBrand(s: GameState, patch: Partial<Pick<BrandState, "name" | "logo" | "color" | "accent" | "style">>): boolean {
  const b = s.brand;
  if (patch.name !== undefined) {
    const name = patch.name.replace(/\s+/g, " ").trim().slice(0, 24);
    if (!name || name === b.name) return false;
    const cost = b.renames > 0 ? BRAND.rebrand : 0;
    if (s.cash < cost) return false;
    s.cash -= cost;
    b.name = name;
    b.renames += 1;
  }
  if (patch.logo !== undefined && BRAND_LOGOS.includes(patch.logo)) b.logo = patch.logo;
  if (patch.color !== undefined && isColor(patch.color)) b.color = patch.color;
  if (patch.accent !== undefined && isColor(patch.accent)) b.accent = patch.accent;
  if (patch.style !== undefined && BRAND_STYLES.some((x) => x.id === patch.style)) b.style = patch.style as BrandStyle;
  return true;
}

/** Keeps a saved brand sane. */
export function migrateBrand(s: GameState) {
  const d = createBrand();
  const b = s.brand ?? d;
  s.brand = {
    name: typeof b.name === "string" ? b.name.slice(0, 24) : "",
    logo: BRAND_LOGOS.includes(b.logo) ? b.logo : d.logo,
    color: isColor(b.color) ? b.color : d.color,
    accent: isColor(b.accent) ? b.accent : d.accent,
    style: BRAND_STYLES.some((x) => x.id === b.style) ? b.style : d.style,
    renames: Math.max(0, Math.floor(Number(b.renames) || 0)),
  };
}
