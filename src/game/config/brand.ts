// THE BRAND: who the company is (name, logo, colours, the style it is
// known for) and what customers think of it. Its attributes are earned in
// the other systems, never bought: build quality, the classes it sells,
// research and prototypes, and racing (a separate reputation of its own).
import type { CarClass } from "./cars";

export type BrandStyle = "value" | "sport" | "luxury" | "tech";
export type BrandAttr = "quality" | "luxury" | "innovation" | "sport";

export const BRAND_STYLES: { id: BrandStyle; emoji: string; attr: BrandAttr }[] = [
  { id: "value", emoji: "🛡️", attr: "quality" },
  { id: "sport", emoji: "🏁", attr: "sport" },
  { id: "luxury", emoji: "💎", attr: "luxury" },
  { id: "tech", emoji: "🔬", attr: "innovation" },
];

export const BRAND_LOGOS = ["🦁", "🐎", "🦅", "🐂", "🐺", "⚡", "⭐", "🔱", "🛡️", "👑", "🌀", "🐍"];
export const BRAND_COLORS = ["#f5c451", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#0ea5e9", "#e2e8f0", "#111827", "#ec4899"];

/** The attribute customers of each class judge the brand on. */
export const CLASS_ATTR: Record<CarClass, BrandAttr[]> = {
  economy: ["quality"],
  sport: ["sport"],
  premium: ["quality", "luxury"],
  luxury: ["luxury"],
  supercar: ["sport", "luxury"],
  hypercar: ["sport", "luxury", "innovation"],
};

export const BRAND = {
  /** Price bonus at an attribute of 100 (nothing at 50 or below). */
  price: 0.1,
  /** The style the brand is known for counts this much more. */
  styleBoost: 1.5,
  /** Electric drivetrains are judged on innovation too. */
  electricAttr: "innovation" as BrandAttr,
  /** Racing image: 63% at this much racing reputation. */
  sportRep: 1500,
  /** Innovation from research and prototypes. */
  innovation: { base: 10, perResearch: 2, perProto: 6, electric: 10 },
  /** Luxury from the share of premium-and-up cars sold. */
  luxury: { base: 15, share: 85 },
  /** Renaming costs nothing once; after that it costs this much (a rebrand). */
  rebrand: 50_000,
};
