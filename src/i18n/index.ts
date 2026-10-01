import { setDurationUnits } from "@/game/format";
import type { Lang } from "@/game/types";
import { en, type MessageKey } from "./en";
import { ro, roContent } from "./ro";
import { ru, ruContent } from "./ru";

export type { Lang, MessageKey };

export const LANGS: { id: Lang; label: string; short: string; flag: string }[] = [
  { id: "en", label: "English", short: "EN", flag: "🇬🇧" },
  { id: "ro", label: "Română", short: "RO", flag: "🇷🇴" },
  { id: "ru", label: "Русский", short: "RU", flag: "🇷🇺" },
];

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ro, ru };
/** Game content (car, factory, research… names). English lives in config/. */
const CONTENT: Record<Lang, Record<string, string>> = { en: {}, ro: roContent, ru: ruContent };

const UNITS: Record<Lang, { d: string; h: string; m: string; s: string }> = {
  en: { d: "d", h: "h", m: "m", s: "s" },
  ro: { d: "z", h: "h", m: "m", s: "s" },
  ru: { d: "д", h: "ч", m: "м", s: "с" },
};

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
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
  return "en";
}
