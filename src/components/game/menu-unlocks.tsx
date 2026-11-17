"use client";

// The Empire menu's screens (engine/menu.ts decides which are open): what each tile shows, and
// the screens that just joined the menu. A screen that opens is announced once (a toast with a
// way in) and keeps a red dot on its tile, and on the Menu button, until the player has been there.
// What was announced is kept on this device: it is only about what this phone has shown.
import { useEffect, useSyncExternalStore } from "react";
import { menuOpen, type MenuTileId } from "@/game/engine/menu";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi, type View } from "@/store/ui-store";

/** Each tile: its icon, its name, the screen it opens (none: Settings, opened by the menu itself), and its group. */
export const MENU_TILES: { id: MenuTileId; icon: string; label: MessageKey; view?: View; gold?: boolean }[] = [
  { id: "profile", icon: "👤", label: "account.title", view: "profile", gold: true },
  { id: "story", icon: "📖", label: "nav.story", view: "story", gold: true },
  { id: "economy", icon: "📊", label: "nav.economy", view: "economy", gold: true },
  { id: "racing", icon: "🏁", label: "nav.racing", view: "racing", gold: true },
  { id: "imperium", icon: "👑", label: "imperium.title", view: "imperium", gold: true },
  { id: "landmarks", icon: "🏗️", label: "nav.landmarks", view: "landmarks", gold: true },
  { id: "stock", icon: "📈", label: "nav.stock", view: "stock", gold: true },
  { id: "world", icon: "🌍", label: "nav.world", view: "world", gold: true },
  { id: "pass", icon: "🎟️", label: "nav.pass", view: "pass", gold: true },
  { id: "leaderboard", icon: "🏆", label: "nav.leaderboard", view: "leaderboard", gold: true },
  { id: "alliance", icon: "🤝", label: "nav.alliance", view: "alliance", gold: true },
  { id: "cars", icon: "🚗", label: "nav.cars", view: "cars" },
  // research has no other way in (only a goal can open it)
  { id: "research", icon: "🔬", label: "nav.research", view: "research" },
  { id: "achievements", icon: "🎖️", label: "nav.achievements", view: "achievements" },
  { id: "stats", icon: "📊", label: "nav.stats", view: "stats" },
  { id: "managers", icon: "👔", label: "nav.managers", view: "managers" },
  { id: "inbox", icon: "🔔", label: "nav.inbox", view: "inbox" },
  { id: "dealers", icon: "🏪", label: "nav.dealers", view: "dealers" },
  { id: "logistics", icon: "🚚", label: "nav.logistics", view: "logistics" },
  { id: "settings", icon: "⚙️", label: "menu.settings" },
];

const KEY = "idle-car-empire:menu-tiles";
/** The new screens a toast names before it says "+N more". */
const MAX_NAMED = 3;
/** How long after a screen opens it is announced (ms): past the start of a celebration it came with. */
const ANNOUNCE_DELAY_MS = 2500;
/** known: the tiles this device has shown (or announced); fresh: announced, not visited yet. */
type Saved = { known: MenuTileId[]; fresh: MenuTileId[] };

let saved: Saved | null | undefined;
const listeners = new Set<() => void>();

function read(): Saved | null {
  if (saved !== undefined) return saved;
  try {
    const v = localStorage.getItem(KEY);
    saved = v ? (JSON.parse(v) as Saved) : null;
  } catch {
    saved = null;
  }
  return saved;
}

function write(next: Saved) {
  saved = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // blocked storage: the dots last until the app closes
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The tiles with a red dot (joined the menu, not visited yet). */
export function useFreshTiles(): MenuTileId[] {
  const key = useSyncExternalStore(
    subscribe,
    () => (read()?.fresh ?? []).join(","),
    () => "",
  );
  return key ? (key.split(",") as MenuTileId[]) : [];
}

/** The player went to the screen: its dot goes. */
export function markTileSeen(id: MenuTileId) {
  const s = read();
  if (s?.fresh.includes(id)) write({ ...s, fresh: s.fresh.filter((x) => x !== id) });
}

/**
 * Watches the menu's screens: one that opens is announced (a toast with a way in) and keeps its
 * dot until visited. The first time on this device, what is open already is simply known: an
 * old save gets no flood of announcements.
 */
export function MenuUnlockWatcher() {
  const ready = useGame((g) => g.ready);
  // the open tiles, as one string: this component rerenders only when one opens
  const openKey = useGame((g) => (g.ready ? MENU_TILES.filter((x) => menuOpen(g.state, x.id)).map((x) => x.id).join(",") : ""));
  const view = useUi((u) => u.view);
  // the first car's celebration hides the toasts, and that is just when the most screens open: wait for it
  const busy = useUi((u) => !!u.celebrate);
  const { t } = useT();

  useEffect(() => {
    if (!ready || !openKey) return;
    const open = openKey.split(",") as MenuTileId[];
    // first time on this device: what is open already is simply known
    if (!read()) {
      write({ known: open, fresh: [] });
      return;
    }
    if (busy) return;
    // a moment later: a celebration starting with the same change (the first car) would hide the
    // toast; if one starts meanwhile, this waits for it to end and tries again
    const id = setTimeout(() => {
      const s = read();
      if (!s || useUi.getState().celebrate) return;
      const added = open.filter((x) => !s.known.includes(x));
      if (!added.length) return;
      write({ known: [...s.known, ...added], fresh: [...s.fresh, ...added] });
      // one toast for all of them (two show at a time: six would push each other off)
      const tiles = added.map((x) => MENU_TILES.find((m) => m.id === x)!);
      const names = tiles.slice(0, MAX_NAMED).map((x) => t(x.label)).join(", ");
      const more = tiles.length - MAX_NAMED;
      const first = tiles.find((x) => x.view);
      uiEvents.emit({
        type: "toast",
        kind: "progress",
        tone: "gold",
        icon: tiles[0].icon,
        title: t("menu.newTile", { name: more > 0 ? t("menu.newTileMore", { names, n: more }) : names }),
        body: t("menu.newTileBody"),
        // one screen: straight to it; several: the menu, where they wait with their dots
        action: { label: t("menu.newTileOpen"), view: tiles.length === 1 && first?.view ? first.view : "menu" },
      });
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, openKey, busy, t]);

  // reaching the screen any way (the toast, a goal, the menu) clears its dot
  useEffect(() => {
    const tile = MENU_TILES.find((x) => x.view && x.view === view);
    if (tile) markTileSeen(tile.id);
  }, [view]);

  return null;
}
