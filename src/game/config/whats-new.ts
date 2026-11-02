// The "what's new" card shown once after an update (components/game/whats-new.tsx): what the
// release brought, each with the screen it lives on. A new release gets a new id; a company
// started on this version never sees it (it has nothing to compare with).
export interface NewsItem {
  icon: string;
  /** whatsNew.item.<key> (title) and whatsNew.item.<key>Body. */
  key: string;
  /** Where its button goes: a screen, or the settings. */
  view?: "landmarks" | "stock" | "managers" | "inbox" | "world";
  settings?: true;
}

export const WHATS_NEW: { id: string; items: NewsItem[] } = {
  id: "1.0.9",
  items: [
    { icon: "🏗️", key: "northWorks", view: "landmarks" },
    { icon: "❄️", key: "nordic" },
    { icon: "🚢", key: "trade", view: "world" },
    { icon: "🌨️", key: "storm" },
  ],
};
