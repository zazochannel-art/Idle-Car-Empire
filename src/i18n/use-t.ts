"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useGame } from "@/store/game-store";
import { content, i18nVersion, onI18nChange, translate, type MessageKey, type Vars } from ".";

/** t() for UI strings, c() for game content (names, descriptions). */
export function useT() {
  const lang = useGame((g) => g.state.settings.lang);
  // a language's texts arrive a moment after it is chosen: show them as they do
  const loaded = useSyncExternalStore(onI18nChange, i18nVersion, i18nVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang, loaded]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useCallback((key: string, english: string, vars?: Vars) => content(lang, key, english, vars), [lang, loaded]);
  return { t, c, lang };
}
