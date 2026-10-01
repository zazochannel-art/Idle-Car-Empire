"use client";

import { useCallback } from "react";
import { useGame } from "@/store/game-store";
import { content, translate, type MessageKey, type Vars } from ".";

/** t() for UI strings, c() for game content (names, descriptions). */
export function useT() {
  const lang = useGame((g) => g.state.settings.lang);
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
  const c = useCallback((key: string, english: string, vars?: Vars) => content(lang, key, english, vars), [lang]);
  return { t, c, lang };
}
