import { setDurationUnits } from "@/game/format";
import type { Lang } from "@/game/types";
import { en, type MessageKey } from "./en";

export type { Lang, MessageKey };

export const LANGS: { id: Lang; label: string; short: string; flag: string }[] = [
  { id: "en", label: "English", short: "EN", flag: "🇬🇧" },
  { id: "ro", label: "Română", short: "RO", flag: "🇷🇴" },
  { id: "ru", label: "Русский", short: "RU", flag: "🇷🇺" },
  { id: "es", label: "Español", short: "ES", flag: "🇪🇸" },
  { id: "pt", label: "Português", short: "PT", flag: "🇧🇷" },
  { id: "de", label: "Deutsch", short: "DE", flag: "🇩🇪" },
];

// English ships with the game (it is every text's fallback); the other
// languages load on demand, so a player downloads only the one they use.
const MESSAGES: Partial<Record<Lang, Record<MessageKey, string>>> = { en };
/** Game content (car, factory, research… names). English lives in config/. */
const CONTENT: Partial<Record<Lang, Record<string, string>>> = { en: {} };
const loading: Partial<Record<Lang, Promise<void>>> = {};
type Pack = readonly [Record<MessageKey, string>, Record<string, string>];
const PACKS: Record<Exclude<Lang, "en">, () => Promise<Pack>> = {
  ro: () => import("./ro").then((m) => [m.ro, m.roContent] as const),
  ru: () => import("./ru").then((m) => [m.ru, m.ruContent] as const),
  es: () => import("./es").then((m) => [m.es, m.esContent] as const),
  pt: () => import("./pt").then((m) => [m.pt, m.ptContent] as const),
  de: () => import("./de").then((m) => [m.de, m.deContent] as const),
};

/** Bumped whenever a language finishes loading (components showing text re-render). */
let version = 0;
const listeners = new Set<() => void>();
export const i18nVersion = () => version;
export function onI18nChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Loads a language's texts (at once for English, and for one already loaded). */
export function loadLanguage(lang: Lang): Promise<void> {
  if (MESSAGES[lang] || lang === "en") return Promise.resolve();
  return (loading[lang] ??= PACKS[lang]().then(
    ([messages, content]) => {
      MESSAGES[lang] = messages;
      CONTENT[lang] = content;
      version++;
      listeners.forEach((fn) => fn());
    },
    (err) => {
      // a failed download (offline): English stays, and the next call tries again
      delete loading[lang];
      throw err;
    },
  ));
}

const UNITS: Record<Lang, { d: string; h: string; m: string; s: string }> = {
  en: { d: "d", h: "h", m: "m", s: "s" },
  ro: { d: "z", h: "h", m: "m", s: "s" },
  ru: { d: "д", h: "ч", m: "м", s: "с" },
  es: { d: "d", h: "h", m: "m", s: "s" },
  pt: { d: "d", h: "h", m: "m", s: "s" },
  de: { d: "T", h: "h", m: "m", s: "s" },
};

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * The city being played: Nordheim's districts and territories have names of their
 * own ("north.zone.town", …), used for "zone.…" and "territory.…" while it is played.
 */
let place = "home";
export function setPlaceNames(city: string) {
  if (city === place) return;
  place = city;
  version++;
  listeners.forEach((fn) => fn());
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  if (place !== "home" && (key.startsWith("zone.") || key.startsWith("territory."))) {
    const own = `${place}.${key}` as MessageKey;
    const text = MESSAGES[lang]?.[own] ?? en[own];
    if (text) return fill(text, vars);
  }
  return fill(MESSAGES[lang]?.[key] ?? en[key] ?? key, vars);
}

/**
 * Translated game content, e.g. content(lang, "car.sedan.name", "Sedan").
 * The English text is passed in from config so it is never duplicated.
 */
export function content(lang: Lang, key: string, english: string, vars?: Vars): string {
  return fill(CONTENT[lang]?.[key] ?? english, vars);
}

export function applyLanguage(lang: Lang) {
  setDurationUnits(UNITS[lang]);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Best guess for a first visit. */
export function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const tag = (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase();
  if (tag.startsWith("ro") || tag.startsWith("mo")) return "ro";
  if (tag.startsWith("ru") || tag.startsWith("uk") || tag.startsWith("be") || tag.startsWith("kk")) return "ru";
  if (tag.startsWith("es")) return "es";
  if (tag.startsWith("pt")) return "pt";
  if (tag.startsWith("de") || tag.startsWith("gsw")) return "de";
  return "en";
}
